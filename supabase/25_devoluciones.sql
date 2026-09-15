-- =====================================================================
-- Devoluciones parciales
--
-- EL PROBLEMA
-- Solo se podía anular una venta completa. Si el cliente devolvía 1 de 3
-- productos, no había cómo registrarlo sin deshacer toda la venta.
--
-- LA SOLUCIÓN
-- - Tablas `devoluciones` y `detalle_devoluciones`. La venta original NO se
--   modifica: el tiquete y el historial quedan intactos.
-- - Función registrar_devolucion: en UNA transacción valida cantidades
--   (nunca más de lo vendido menos lo ya devuelto), calcula el monto con el
--   precio al que se vendió y devuelve el stock.
-- - Una venta con devoluciones ya no se puede anular: se devolvería el
--   stock y se restaría el dinero dos veces.
--
-- VENDEDORES
-- Pueden devolver si el negocio lo permite, con límites que fija el
-- administrador en Configuración:
--   - monto máximo por devolución y días máximos desde la venta
--   - lo que devuelven SIEMPRE vuelve al inventario: una devolución falsa
--     suma unidades que no están en el estante y el próximo conteo muestra
--     el faltante
--   - deben tener la caja abierta: la devolución sale de su cajón y
--     aparece en su cierre de turno
--
-- POR QUÉ SECURITY DEFINER
-- Las tablas de devoluciones no tienen política de INSERT: nadie puede
-- insertar directo desde el navegador y saltarse los límites. Solo esta
-- función escribe, y filtra por el negocio del usuario en cada consulta.
-- El stock lo devuelve un trigger sobre detalle_devoluciones, igual que la
-- venta lo descuenta con un trigger sobre detalle_ventas: así el control
-- de proteger_campos_producto (pg_trigger_depth, migración 18) lo permite
-- también para vendedores, y solo por este camino.
--
-- Ejecutar DESPUÉS de 24_importar_productos.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Configuración por negocio (la cambia el administrador)
-- ---------------------------------------------------------------------
alter table public.negocios
  add column if not exists devoluciones_vendedor    boolean        not null default true,
  add column if not exists devolucion_max_vendedor  numeric(12, 2) not null default 50000,
  add column if not exists devolucion_dias_vendedor integer        not null default 8;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'negocios_devolucion_limites_validos') then
    alter table public.negocios
      add constraint negocios_devolucion_limites_validos
      check (devolucion_max_vendedor >= 0 and devolucion_dias_vendedor >= 0);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.devoluciones (
  id              bigserial primary key,
  negocio_id      bigint not null default public.mi_negocio() references public.negocios (id),
  venta_id        bigint not null references public.ventas (id),
  user_id         uuid references auth.users (id) on delete set null,
  -- Caja de donde salió el dinero: el cierre de ese turno la descuenta
  sesion_caja_id  bigint references public.sesiones_caja (id),
  fecha           timestamptz not null default now(),
  motivo          text not null
                  check (motivo in ('cliente_desistio', 'defectuoso', 'vencido', 'equivocado', 'otro')),
  nota            text,
  medio_pago_id   bigint references public.medios_pago (id),
  total           numeric(12, 2) not null check (total >= 0),
  costo_total     numeric(12, 2) not null default 0
);

create table if not exists public.detalle_devoluciones (
  id                bigserial primary key,
  devolucion_id     bigint not null references public.devoluciones (id),
  negocio_id        bigint not null default public.mi_negocio() references public.negocios (id),
  venta_id          bigint not null references public.ventas (id),
  detalle_venta_id  bigint not null references public.detalle_ventas (id),
  producto_id       bigint not null references public.productos (id),
  cantidad          integer not null check (cantidad > 0),
  -- Precio y costo congelados de la venta original
  precio            numeric(12, 2) not null,
  costo_unitario    numeric(12, 2),
  -- false = dañado o vencido: no vuelve al inventario (solo administradores)
  reintegra         boolean not null default true
);

create index if not exists devoluciones_negocio_fecha_idx on public.devoluciones (negocio_id, fecha desc);
create index if not exists devoluciones_venta_idx on public.devoluciones (venta_id);
create index if not exists devoluciones_sesion_idx on public.devoluciones (sesion_caja_id);
create index if not exists detalle_devoluciones_devolucion_idx on public.detalle_devoluciones (devolucion_id);
create index if not exists detalle_devoluciones_venta_idx on public.detalle_devoluciones (venta_id);
create index if not exists detalle_devoluciones_linea_idx on public.detalle_devoluciones (detalle_venta_id);


-- ---------------------------------------------------------------------
-- 3. RLS: todo el negocio puede LEER (el vendedor necesita ver lo ya
--    devuelto y las devoluciones de su turno). Nadie inserta, modifica ni
--    borra directo: solo registrar_devolucion.
-- ---------------------------------------------------------------------
alter table public.devoluciones enable row level security;
alter table public.detalle_devoluciones enable row level security;

drop policy if exists devoluciones_sel on public.devoluciones;
create policy devoluciones_sel on public.devoluciones
  for select to authenticated
  using (negocio_id = public.mi_negocio());

drop policy if exists detalle_devoluciones_sel on public.detalle_devoluciones;
create policy detalle_devoluciones_sel on public.detalle_devoluciones
  for select to authenticated
  using (negocio_id = public.mi_negocio());


-- ---------------------------------------------------------------------
-- 4. Historial de productos: referencia a la devolución y tipo nuevo
-- ---------------------------------------------------------------------
alter table public.producto_historial
  add column if not exists devolucion_id bigint references public.devoluciones (id);

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
  check (tipo_evento in ('venta', 'reversion', 'actualizacion', 'entrada', 'ajuste', 'devolucion')) not valid;


-- ---------------------------------------------------------------------
-- 5. Trigger: devuelve el stock de cada línea que vuelve al inventario
-- ---------------------------------------------------------------------
create or replace function public.reintegrar_stock_devolucion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_despues numeric;
begin
  if not new.reintegra then
    return new;
  end if;

  -- Incremento atómico: una venta simultánea del mismo producto no se pierde
  update public.productos
     set cantidad    = coalesce(cantidad, 0) + new.cantidad,
         costo_total = (coalesce(cantidad, 0) + new.cantidad) * coalesce(costo, 0)
   where id = new.producto_id
  returning cantidad into v_despues;

  if not found then
    return new;
  end if;

  insert into public.producto_historial
    (negocio_id, producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, devolucion_id)
  values
    (new.negocio_id, new.producto_id, 'devolucion', v_despues - new.cantidad, v_despues,
     format('Devolución #%s de la venta #%s — +%s unidad(es)', new.devolucion_id, new.venta_id, new.cantidad),
     new.devolucion_id);

  return new;
end $$;

drop trigger if exists reintegrar_stock_devolucion on public.detalle_devoluciones;
create trigger reintegrar_stock_devolucion
  after insert on public.detalle_devoluciones
  for each row execute function public.reintegrar_stock_devolucion();


-- ---------------------------------------------------------------------
-- 6. registrar_devolucion
--
--    p_items: [{ "detalle_venta_id": 55, "cantidad": 1, "reintegra": true }]
--    El monto lo calcula la base de datos con el precio de la venta.
-- ---------------------------------------------------------------------
create or replace function public.registrar_devolucion(
  p_venta_id      bigint,
  p_items         jsonb,
  p_motivo        text,
  p_medio_pago_id bigint,
  p_nota          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid    := auth.uid();
  v_negocio   bigint  := public.mi_negocio();
  v_admin     boolean := public.es_administrador();
  v_venta     public.ventas;
  v_neg       public.negocios;
  v_medio     text;
  v_efectivo  boolean;
  v_sesion    bigint;
  v_total     numeric(12, 2);
  v_costo     numeric(12, 2);
  v_problema  text;
  v_dev       public.devoluciones;
  v_lineas    integer;
begin
  if v_uid is null or v_negocio is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_motivo is null or p_motivo not in ('cliente_desistio', 'defectuoso', 'vencido', 'equivocado', 'otro') then
    raise exception 'Indica el motivo de la devolución';
  end if;

  -- Bloquea la venta: dos devoluciones simultáneas de la misma venta no
  -- pueden pasar ambas el control de "lo ya devuelto"
  select * into v_venta
    from public.ventas
   where id = p_venta_id and negocio_id = v_negocio
     for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.anulada_en is not null then
    raise exception 'La venta #% está anulada: no tiene nada que devolver', p_venta_id;
  end if;

  select pago into v_medio from public.medios_pago where id = p_medio_pago_id;
  if not found then
    raise exception 'Indica cómo se le devuelve el dinero al cliente';
  end if;
  v_efectivo := v_medio ilike '%efectivo%';

  -- ---- Líneas --------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Indica qué productos se devuelven';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric)
    where x.detalle_venta_id is null
       or x.cantidad is null or x.cantidad <= 0 or x.cantidad <> trunc(x.cantidad)
  ) then
    raise exception 'Las cantidades a devolver deben ser números enteros mayores que cero';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint)
    group by x.detalle_venta_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en la devolución';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint)
    where not exists (
      select 1 from public.detalle_ventas dv
      where dv.id = x.detalle_venta_id and dv.venta_id = p_venta_id
    )
  ) then
    raise exception 'Hay productos que no pertenecen a la venta #%', p_venta_id;
  end if;

  -- Nunca más de lo vendido menos lo ya devuelto
  select format('"%s": se vendieron %s, ya se devolvieron %s y se intentan devolver %s',
                coalesce(p.descripcion, 'Producto #' || dv.producto_id),
                dv.cantidad, coalesce(d.devuelto, 0), x.cantidad)
    into v_problema
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id
  left join public.productos p on p.id = dv.producto_id
  left join lateral (
    select sum(dd.cantidad) as devuelto
    from public.detalle_devoluciones dd
    where dd.detalle_venta_id = dv.id
  ) d on true
  where x.cantidad > dv.cantidad - coalesce(d.devuelto, 0)
  limit 1;

  if v_problema is not null then
    raise exception 'No se puede devolver más de lo vendido. %', v_problema;
  end if;

  select sum(x.cantidad * dv.precio),
         sum(x.cantidad * coalesce(dv.costo_unitario, 0))
    into v_total, v_costo
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id;

  -- ---- Controles para vendedores --------------------------------------
  if not v_admin then
    select * into v_neg from public.negocios where id = v_negocio;

    if not v_neg.devoluciones_vendedor then
      raise exception 'En este negocio solo un administrador puede hacer devoluciones';
    end if;

    if v_total > v_neg.devolucion_max_vendedor then
      raise exception 'La devolución ($%) supera el máximo que un vendedor puede devolver ($%). Debe hacerla un administrador',
        v_total, v_neg.devolucion_max_vendedor;
    end if;

    if v_venta.fecha < now() - make_interval(days => v_neg.devolucion_dias_vendedor) then
      raise exception 'La venta #% tiene más de % días: la devolución debe hacerla un administrador',
        p_venta_id, v_neg.devolucion_dias_vendedor;
    end if;

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(reintegra boolean)
      where x.reintegra is false
    ) then
      raise exception 'Solo un administrador puede registrar productos que no vuelven al inventario';
    end if;
  end if;

  -- ---- Caja ------------------------------------------------------------
  select id into v_sesion
    from public.sesiones_caja
   where user_id = v_uid and cerrada_en is null
   order by abierta_en desc
   limit 1;

  if v_sesion is null and (not v_admin or v_efectivo) then
    raise exception 'Abre la caja antes de registrar la devolución: el dinero sale de tu cajón';
  end if;

  -- ---- Registro --------------------------------------------------------
  insert into public.devoluciones
    (negocio_id, venta_id, user_id, sesion_caja_id, motivo, nota, medio_pago_id, total, costo_total)
  values
    (v_negocio, p_venta_id, v_uid, v_sesion, p_motivo, nullif(trim(p_nota), ''),
     p_medio_pago_id, v_total, v_costo)
  returning * into v_dev;

  -- El trigger reintegrar_stock_devolucion devuelve el stock de cada línea
  insert into public.detalle_devoluciones
    (devolucion_id, negocio_id, venta_id, detalle_venta_id, producto_id,
     cantidad, precio, costo_unitario, reintegra)
  select v_dev.id, v_negocio, p_venta_id, dv.id, dv.producto_id,
         x.cantidad::integer, dv.precio, dv.costo_unitario, coalesce(x.reintegra, true)
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric, reintegra boolean)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id
  order by dv.producto_id;   -- orden fijo: evita bloqueos cruzados con ventas

  get diagnostics v_lineas = row_count;

  return to_jsonb(v_dev) || jsonb_build_object('lineas', v_lineas);
end $$;

revoke all on function public.registrar_devolucion(bigint, jsonb, text, bigint, text) from public;
grant execute on function public.registrar_devolucion(bigint, jsonb, text, bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7. anular_venta: bloqueada si la venta tiene devoluciones
--    (igual que en la migración 15, más ese control)
-- ---------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta    public.ventas;
  v_despues  numeric;
  v_lineas   integer := 0;
  r          record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede anular ventas';
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Indica el motivo de la anulación';
  end if;

  -- Bloquea la venta: dos anulaciones simultáneas de la misma venta no
  -- pueden devolver el stock dos veces
  select * into v_venta from public.ventas where id = p_venta_id for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.anulada_en is not null then
    raise exception 'Esta venta ya estaba anulada';
  end if;

  -- 🆕 Con devoluciones, anular devolvería otra vez ese stock y restaría
  -- otra vez ese dinero
  if exists (select 1 from public.devoluciones where venta_id = p_venta_id) then
    raise exception 'La venta #% tiene devoluciones registradas y no se puede anular. Si el cliente devuelve el resto, regístralo como otra devolución', p_venta_id;
  end if;

  for r in
    select producto_id, cantidad
    from public.detalle_ventas
    where venta_id = p_venta_id
    order by producto_id
  loop
    update public.productos
       set cantidad    = coalesce(cantidad, 0) + r.cantidad,
           costo_total = (coalesce(cantidad, 0) + r.cantidad) * coalesce(costo, 0)
     where id = r.producto_id
    returning cantidad into v_despues;

    -- Producto borrado del catálogo: no hay stock que devolver
    continue when not found;

    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, venta_id)
    values
      (r.producto_id, 'reversion', v_despues - r.cantidad, v_despues,
       format('Anulación Venta #%s — se devolvieron %s unidad(es)', p_venta_id, r.cantidad),
       p_venta_id);

    v_lineas := v_lineas + 1;
  end loop;

  update public.ventas
     set anulada_en       = now(),
         anulada_por      = auth.uid(),
         motivo_anulacion = p_motivo
   where id = p_venta_id;

  return jsonb_build_object('itemsRestored', v_lineas);
end $$;

revoke all on function public.anular_venta(bigint, text) from public;
grant execute on function public.anular_venta(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: todas deben decir 1
-- ---------------------------------------------------------------------
select 'tabla devoluciones' as chequeo,
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'devoluciones') as resultado
union all
select 'funcion registrar_devolucion',
       (select count(*)::text from pg_proc where proname = 'registrar_devolucion')
union all
select 'trigger reintegrar_stock_devolucion',
       (select count(*)::text from pg_trigger where tgname = 'reintegrar_stock_devolucion')
union all
select 'negocios.devoluciones_vendedor',
       (select count(*)::text from information_schema.columns
        where table_name = 'negocios' and column_name = 'devoluciones_vendedor')
union all
select 'anular_venta bloquea ventas con devoluciones',
       (select count(*)::text from pg_proc
        where proname = 'anular_venta' and prosrc like '%tiene devoluciones registradas%');
