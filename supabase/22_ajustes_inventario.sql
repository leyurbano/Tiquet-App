-- =====================================================================
-- Ajustes de inventario (conteo físico y correcciones)
--
-- EL PROBLEMA
-- Para corregir el stock o el costo había que editar el producto y
-- sobrescribir el número. El historial registraba "actualización" sin
-- decir por qué, así que un faltante (robo, daño, error de despacho)
-- simplemente desaparecía. Además, no había otra forma de corregir una
-- entrada de mercancía mal registrada.
--
-- LA SOLUCIÓN
-- - Tablas `ajustes` (la sesión de conteo) y `detalle_ajustes` (una línea
--   por producto contado), con motivo de una lista fija.
-- - Función registrar_ajuste: en UNA transacción fija el stock en lo
--   contado, puede corregir el costo, valoriza la diferencia y deja el
--   movimiento 'ajuste' en producto_historial.
-- - Si el stock cambió entre que se abrió la pantalla y se registró (una
--   venta en medio), esa línea se rechaza en vez de pisar la venta.
-- - Solo administradores. Un ajuste no se modifica ni se borra.
--
-- Con esto, stock y costo tienen un único lugar donde cambiar: Inventario
-- (entradas y ajustes). En Productos quedan de solo lectura al editar.
--
-- Ejecutar DESPUÉS de 21_entradas_mercancia.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.ajustes (
  id          bigserial primary key,
  negocio_id  bigint not null default public.mi_negocio() references public.negocios (id),
  user_id     uuid references auth.users (id) on delete set null,
  fecha       timestamptz not null default now(),
  nota        text
);

create table if not exists public.detalle_ajustes (
  id                bigserial primary key,
  ajuste_id         bigint not null references public.ajustes (id),
  negocio_id        bigint not null default public.mi_negocio() references public.negocios (id),
  producto_id       bigint not null references public.productos (id),
  motivo            text not null check (motivo in
                      ('conteo', 'dano', 'perdida', 'vencimiento', 'correccion', 'otro')),
  stock_anterior    numeric not null,
  stock_contado     numeric not null check (stock_contado >= 0),
  diferencia        numeric not null,
  costo_anterior    numeric(12, 2),
  costo_nuevo       numeric(12, 2),
  -- Diferencia valorizada al costo: negativo = faltante, positivo = sobrante
  valor_diferencia  numeric(14, 2) not null default 0
);

create index if not exists ajustes_negocio_fecha_idx on public.ajustes (negocio_id, fecha desc);
create index if not exists detalle_ajustes_ajuste_idx on public.detalle_ajustes (ajuste_id);
create index if not exists detalle_ajustes_producto_idx on public.detalle_ajustes (producto_id);


-- ---------------------------------------------------------------------
-- 2. RLS: solo administradores leen y registran. Sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------
alter table public.ajustes enable row level security;
alter table public.detalle_ajustes enable row level security;

drop policy if exists ajustes_sel on public.ajustes;
create policy ajustes_sel on public.ajustes
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists ajustes_ins on public.ajustes;
create policy ajustes_ins on public.ajustes
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists detalle_ajustes_sel on public.detalle_ajustes;
create policy detalle_ajustes_sel on public.detalle_ajustes
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists detalle_ajustes_ins on public.detalle_ajustes;
create policy detalle_ajustes_ins on public.detalle_ajustes
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());


-- ---------------------------------------------------------------------
-- 3. Historial: referencia al ajuste ('ajuste' ya es un tipo permitido
--    desde la migración 21)
-- ---------------------------------------------------------------------
alter table public.producto_historial
  add column if not exists ajuste_id bigint references public.ajustes (id);


-- ---------------------------------------------------------------------
-- 4. registrar_ajuste
--
--    p_items: [{
--      "producto_id": 1,
--      "stock_sistema": 12,      ← lo que mostraba la pantalla
--      "stock_contado": 9,       ← lo que se contó
--      "costo_unitario": 1200,   ← opcional: null = no cambia el costo
--      "motivo": "perdida"
--    }]
-- ---------------------------------------------------------------------
create or replace function public.registrar_ajuste(p_nota text, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ajuste       public.ajustes;
  v_prod         record;
  v_diferencia   numeric;
  v_costo_nuevo  numeric(12, 2);
  v_cambios      integer := 0;
  v_lineas       integer := 0;
  r              record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede registrar ajustes de inventario';
  end if;

  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ajuste no tiene productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, stock_sistema numeric, stock_contado numeric,
           costo_unitario numeric, motivo text)
    where x.producto_id is null
       or x.stock_sistema is null
       or x.stock_contado is null or x.stock_contado < 0 or x.stock_contado <> trunc(x.stock_contado)
       or (x.costo_unitario is not null and x.costo_unitario < 0)
       or x.motivo is null
       or x.motivo not in ('conteo', 'dano', 'perdida', 'vencimiento', 'correccion', 'otro')
  ) then
    raise exception 'Hay productos con cantidad, costo o motivo inválidos (lo contado debe ser un número entero, cero o más)';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id bigint)
    group by x.producto_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en el ajuste';
  end if;

  insert into public.ajustes (user_id, nota)
  values (auth.uid(), nullif(trim(p_nota), ''))
  returning * into v_ajuste;

  for r in
    select x.producto_id, x.stock_sistema, x.stock_contado, x.costo_unitario, x.motivo
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, stock_sistema numeric, stock_contado numeric,
           costo_unitario numeric, motivo text)
    order by x.producto_id
  loop
    select p.id, p.descripcion, coalesce(p.cantidad, 0) as stock, coalesce(p.costo, 0) as costo
      into v_prod
      from public.productos p
     where p.id = r.producto_id
       for update;

    if not found then
      raise exception 'El producto % no existe en este negocio', r.producto_id;
    end if;

    -- Control de concurrencia: si una venta o una entrada movió el stock
    -- mientras se contaba, la diferencia calculada ya no es válida
    if v_prod.stock <> r.stock_sistema then
      raise exception 'El stock de "%" cambió mientras hacías el ajuste (el sistema tiene %, la pantalla mostraba %). Quítalo, vuelve a agregarlo y cuéntalo de nuevo.',
        v_prod.descripcion, v_prod.stock, r.stock_sistema;
    end if;

    v_diferencia  := r.stock_contado - v_prod.stock;
    v_costo_nuevo := coalesce(r.costo_unitario, v_prod.costo);

    -- La línea se guarda siempre (deja constancia de que se contó), aunque
    -- no haya diferencia
    insert into public.detalle_ajustes
      (ajuste_id, producto_id, motivo, stock_anterior, stock_contado, diferencia,
       costo_anterior, costo_nuevo, valor_diferencia)
    values
      (v_ajuste.id, r.producto_id, r.motivo, v_prod.stock, r.stock_contado, v_diferencia,
       v_prod.costo, v_costo_nuevo, round(v_diferencia * v_costo_nuevo, 2));

    if v_diferencia <> 0 or v_costo_nuevo <> v_prod.costo then
      update public.productos
         set cantidad    = r.stock_contado,
             costo       = v_costo_nuevo,
             costo_total = r.stock_contado * v_costo_nuevo
       where id = r.producto_id;
      v_cambios := v_cambios + 1;
    end if;

    if v_diferencia <> 0 then
      insert into public.producto_historial
        (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, ajuste_id)
      values
        (r.producto_id, 'ajuste', v_prod.stock, r.stock_contado,
         format('Ajuste #%s (%s): %s%s unidad(es)', v_ajuste.id, r.motivo,
                case when v_diferencia > 0 then '+' else '' end, v_diferencia),
         v_ajuste.id);
    end if;

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_ajuste) || jsonb_build_object('lineas', v_lineas, 'cambios', v_cambios);
end $$;

revoke all on function public.registrar_ajuste(text, jsonb) from public;
grant execute on function public.registrar_ajuste(text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: todas deben decir 1
-- ---------------------------------------------------------------------
select 'tabla ajustes' as chequeo,
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'ajustes') as resultado
union all
select 'tabla detalle_ajustes',
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'detalle_ajustes')
union all
select 'funcion registrar_ajuste',
       (select count(*)::text from pg_proc where proname = 'registrar_ajuste')
union all
select 'producto_historial.ajuste_id',
       (select count(*)::text from information_schema.columns
        where table_name = 'producto_historial' and column_name = 'ajuste_id');
