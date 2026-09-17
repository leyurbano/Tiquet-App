-- =====================================================================
-- Entradas de mercancía (compras al proveedor)
--
-- EL PROBLEMA
-- La única forma de subir el stock era abrir cada producto y sobrescribir
-- la cantidad con un total calculado a mano. Lento con pedidos grandes,
-- propenso a errores (escribir "lo que llegó" en vez del total borraba el
-- stock previo) y sin rastro: el historial decía "actualización" sin saber
-- que había sido una compra ni a qué costo.
--
-- LA SOLUCIÓN
-- - Tablas `entradas` (la compra) y `detalle_entradas` (sus líneas).
-- - Función registrar_entrada: en UNA transacción SUMA las unidades al
--   stock, recalcula el costo como PROMEDIO PONDERADO y registra el
--   movimiento 'entrada' en producto_historial.
-- - Cada línea guarda una foto de antes y después (stock y costo): si un
--   margen no cuadra, se puede reconstruir exactamente qué pasó.
-- - Una entrada registrada no se modifica ni se borra, como una venta. Un
--   error se corrige con otra entrada o con un ajuste.
-- - Solo administradores: las entradas contienen costos de compra.
--
-- COSTO PROMEDIO
--   (stock_actual × costo_actual + cantidad × costo_compra) / stock_nuevo
-- Si no había stock, el costo pasa a ser directamente el de la compra.
--
-- Ejecutar DESPUÉS de 20_documento_unico_por_negocio.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.entradas (
  id          bigserial primary key,
  negocio_id  bigint not null default public.mi_negocio() references public.negocios (id),
  user_id     uuid references auth.users (id) on delete set null,
  fecha       timestamptz not null default now(),
  proveedor   text,
  factura     text,
  nota        text,
  total       numeric(14, 2) not null default 0
);

create table if not exists public.detalle_entradas (
  id              bigserial primary key,
  entrada_id      bigint not null references public.entradas (id),
  negocio_id      bigint not null default public.mi_negocio() references public.negocios (id),
  producto_id     bigint not null references public.productos (id),
  cantidad        integer not null check (cantidad > 0),
  costo_unitario  numeric(12, 2) not null check (costo_unitario >= 0),
  -- Foto del producto antes y después de esta línea
  stock_anterior  numeric,
  stock_nuevo     numeric,
  costo_anterior  numeric(12, 2),
  costo_nuevo     numeric(12, 2)
);

create index if not exists entradas_negocio_fecha_idx on public.entradas (negocio_id, fecha desc);
create index if not exists detalle_entradas_entrada_idx on public.detalle_entradas (entrada_id);
create index if not exists detalle_entradas_producto_idx on public.detalle_entradas (producto_id);


-- ---------------------------------------------------------------------
-- 2. RLS: solo administradores leen y registran. Sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------
alter table public.entradas enable row level security;
alter table public.detalle_entradas enable row level security;

drop policy if exists entradas_sel on public.entradas;
create policy entradas_sel on public.entradas
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists entradas_ins on public.entradas;
create policy entradas_ins on public.entradas
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists detalle_entradas_sel on public.detalle_entradas;
create policy detalle_entradas_sel on public.detalle_entradas
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists detalle_entradas_ins on public.detalle_entradas;
create policy detalle_entradas_ins on public.detalle_entradas
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());


-- ---------------------------------------------------------------------
-- 3. Historial de productos: referencia a la entrada y tipos permitidos
--
--    No se sabe si producto_historial ya tenía un CHECK sobre tipo_evento
--    (la tabla es anterior a las migraciones). Si existe, se reemplaza por
--    uno que incluye 'entrada' y 'ajuste'. NOT VALID: solo se exige a los
--    movimientos nuevos, así no se rechazan filas viejas.
-- ---------------------------------------------------------------------
alter table public.producto_historial
  add column if not exists entrada_id bigint references public.entradas (id);

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.producto_historial'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo_evento%'
  loop
    execute format('alter table public.producto_historial drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.producto_historial
  add constraint producto_historial_tipo_evento_valido
  check (tipo_evento in ('venta', 'reversion', 'actualizacion', 'entrada', 'ajuste')) not valid;


-- ---------------------------------------------------------------------
-- 4. registrar_entrada
--
--    p_items: [{ "producto_id": 1, "cantidad": 24, "costo_unitario": 1200 }]
--
--    SECURITY INVOKER: corre con los permisos del administrador, así que
--    aplican la RLS y el trigger de columnas de productos.
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrada(
  p_proveedor text,
  p_factura   text,
  p_nota      text,
  p_items     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entrada      public.entradas;
  v_total        numeric(14, 2);
  v_prod         record;
  v_stock_nuevo  numeric;
  v_costo_nuevo  numeric(12, 2);
  v_lineas       integer := 0;
  r              record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede registrar entradas de mercancía';
  end if;

  -- Un super admin sin negocio propio no tiene inventario al que sumar
  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, costo_unitario numeric)
    where x.producto_id is null
       or x.cantidad is null or x.cantidad <= 0 or x.cantidad <> trunc(x.cantidad)
       or x.costo_unitario is null or x.costo_unitario < 0
  ) then
    raise exception 'Hay productos con cantidad o costo inválidos (la cantidad debe ser un número entero mayor que cero)';
  end if;

  -- Un producto repetido en la misma entrada volvería ambiguo el costo promedio
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(producto_id bigint)
    group by x.producto_id
    having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en la entrada';
  end if;

  -- El total se calcula antes: así la entrada nunca necesita un UPDATE
  select sum(x.cantidad * x.costo_unitario) into v_total
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, costo_unitario numeric);

  insert into public.entradas (user_id, proveedor, factura, nota, total)
  values (
    auth.uid(),
    nullif(trim(p_proveedor), ''),
    nullif(trim(p_factura), ''),
    nullif(trim(p_nota), ''),
    v_total
  )
  returning * into v_entrada;

  for r in
    select x.producto_id, x.cantidad::integer as cantidad, x.costo_unitario
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, costo_unitario numeric)
    order by x.producto_id   -- orden fijo: evita bloqueos cruzados con ventas simultáneas
  loop
    -- Bloquea el producto: una venta al mismo tiempo espera a que termine
    select p.id, coalesce(p.cantidad, 0) as stock, coalesce(p.costo, 0) as costo
      into v_prod
      from public.productos p
     where p.id = r.producto_id
       for update;

    if not found then
      raise exception 'El producto % no existe en este negocio', r.producto_id;
    end if;

    v_stock_nuevo := v_prod.stock + r.cantidad;
    v_costo_nuevo := case
      when v_prod.stock <= 0 then r.costo_unitario
      else round((v_prod.stock * v_prod.costo + r.cantidad * r.costo_unitario) / v_stock_nuevo, 2)
    end;

    update public.productos
       set cantidad    = v_stock_nuevo,
           costo       = v_costo_nuevo,
           costo_total = v_stock_nuevo * v_costo_nuevo
     where id = r.producto_id;

    insert into public.detalle_entradas
      (entrada_id, producto_id, cantidad, costo_unitario,
       stock_anterior, stock_nuevo, costo_anterior, costo_nuevo)
    values
      (v_entrada.id, r.producto_id, r.cantidad, r.costo_unitario,
       v_prod.stock, v_stock_nuevo, v_prod.costo, v_costo_nuevo);

    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, entrada_id)
    values
      (r.producto_id, 'entrada', v_prod.stock, v_stock_nuevo,
       format('Entrada #%s — +%s unidad(es) a $%s', v_entrada.id, r.cantidad, r.costo_unitario),
       v_entrada.id);

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_entrada) || jsonb_build_object('lineas', v_lineas);
end $$;

revoke all on function public.registrar_entrada(text, text, text, jsonb) from public;
grant execute on function public.registrar_entrada(text, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: todas deben decir 1
-- ---------------------------------------------------------------------
select 'tabla entradas' as chequeo,
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'entradas') as resultado
union all
select 'tabla detalle_entradas',
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'detalle_entradas')
union all
select 'funcion registrar_entrada',
       (select count(*)::text from pg_proc where proname = 'registrar_entrada')
union all
select 'producto_historial.entrada_id',
       (select count(*)::text from information_schema.columns
        where table_name = 'producto_historial' and column_name = 'entrada_id');
