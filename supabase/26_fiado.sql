-- =====================================================================
-- Fiado (crédito a clientes)
--
-- CÓMO FUNCIONA
-- - "Fiado" es un medio de pago más (medios_pago.es_fiado). Una venta puede
--   ser fiada completa o en parte (pago mixto). La regla de que los pagos
--   cuadren con el total no cambia.
-- - Solo a clientes identificados (no a Consumidor final) y dentro de su
--   cupo (clientes.cupo_fiado). El cupo lo cambia solo un administrador y
--   un cliente nuevo empieza en 0: nadie tiene fiado hasta que se le asigna.
-- - Los vendedores pueden fiar si el negocio lo permite
--   (negocios.fiado_vendedor), siempre dentro del cupo.
-- - Abonos: tabla `abonos`, escrita solo por registrar_abono. Exigen la
--   caja abierta: el dinero entra al cajón de quien lo recibe.
--
-- EL SALDO NO SE GUARDA: SE CALCULA
--   fiado en ventas no anuladas
--   − devoluciones de esas ventas hechas "en fiado"
--   − abonos
-- Así, anular una venta fiada o registrar una devolución baja la deuda
-- sola, y el saldo nunca queda descuadrado respecto de los movimientos.
--
-- Ejecutar DESPUÉS de 25_devoluciones.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Medio de pago "Fiado"
-- ---------------------------------------------------------------------
alter table public.medios_pago
  add column if not exists es_fiado boolean not null default false;

-- El id es GENERATED ALWAYS: lo asigna la base de datos
do $$
begin
  if not exists (select 1 from public.medios_pago where es_fiado) then
    insert into public.medios_pago (pago, es_fiado) values ('Fiado', true);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. Cupo por cliente (solo lo cambia un administrador)
-- ---------------------------------------------------------------------
alter table public.clientes
  add column if not exists cupo_fiado numeric(12, 2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_cupo_fiado_valido') then
    alter table public.clientes
      add constraint clientes_cupo_fiado_valido check (cupo_fiado >= 0);
  end if;
end $$;

create or replace function public.proteger_cupo_fiado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.es_administrador() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.cupo_fiado, 0) <> 0 then
      raise exception 'Solo un administrador puede asignar cupo de fiado';
    end if;
  elsif new.cupo_fiado is distinct from old.cupo_fiado then
    raise exception 'Solo un administrador puede cambiar el cupo de fiado';
  end if;

  return new;
end $$;

drop trigger if exists proteger_cupo_fiado on public.clientes;
create trigger proteger_cupo_fiado
  before insert or update on public.clientes
  for each row execute function public.proteger_cupo_fiado();


-- ---------------------------------------------------------------------
-- 3. Configuración del negocio
-- ---------------------------------------------------------------------
alter table public.negocios
  add column if not exists fiado_vendedor boolean not null default true;


-- ---------------------------------------------------------------------
-- 4. Abonos
-- ---------------------------------------------------------------------
create table if not exists public.abonos (
  id              bigserial primary key,
  negocio_id      bigint not null default public.mi_negocio() references public.negocios (id),
  cliente_id      bigint not null references public.clientes (id),
  user_id         uuid references auth.users (id) on delete set null,
  -- Caja a la que entró el dinero: el cierre de ese turno lo cuenta
  sesion_caja_id  bigint references public.sesiones_caja (id),
  fecha           timestamptz not null default now(),
  monto           numeric(12, 2) not null check (monto > 0),
  medio_pago_id   bigint not null references public.medios_pago (id),
  nota            text
);

create index if not exists abonos_negocio_fecha_idx on public.abonos (negocio_id, fecha desc);
create index if not exists abonos_cliente_idx on public.abonos (cliente_id);
create index if not exists abonos_sesion_idx on public.abonos (sesion_caja_id);

-- Todo el negocio lee; nadie inserta, modifica ni borra directo
alter table public.abonos enable row level security;

drop policy if exists abonos_sel on public.abonos;
create policy abonos_sel on public.abonos
  for select to authenticated
  using (negocio_id = public.mi_negocio());


-- ---------------------------------------------------------------------
-- 5. Saldo de fiado
--
--    Filtran por mi_negocio() explícitamente: también se llaman desde
--    funciones SECURITY DEFINER, donde la RLS no aplica.
-- ---------------------------------------------------------------------
create or replace function public.saldo_fiado(p_cliente_id bigint)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select
      coalesce((
        select sum(pv.monto)
        from public.pagos_venta pv
        join public.ventas v on v.id = pv.venta_id
        join public.medios_pago m on m.id = pv.medio_pago_id
        where m.es_fiado
          and v.cliente_id = p_cliente_id
          and v.anulada_en is null
          and v.negocio_id = public.mi_negocio()
      ), 0)
    - coalesce((
        select sum(d.total)
        from public.devoluciones d
        join public.ventas v on v.id = d.venta_id
        join public.medios_pago m on m.id = d.medio_pago_id
        where m.es_fiado
          and v.cliente_id = p_cliente_id
          and d.negocio_id = public.mi_negocio()
      ), 0)
    - coalesce((
        select sum(a.monto)
        from public.abonos a
        where a.cliente_id = p_cliente_id
          and a.negocio_id = public.mi_negocio()
      ), 0)
$$;

-- Saldo de todos los clientes con movimientos de fiado
create or replace function public.saldos_fiado()
returns table (cliente_id bigint, fiado numeric, devuelto numeric, abonado numeric, saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select v.cliente_id, sum(pv.monto) as monto
    from public.pagos_venta pv
    join public.ventas v on v.id = pv.venta_id
    join public.medios_pago m on m.id = pv.medio_pago_id
    where m.es_fiado and v.anulada_en is null and v.negocio_id = public.mi_negocio()
    group by v.cliente_id
  ),
  d as (
    select v.cliente_id, sum(dv.total) as monto
    from public.devoluciones dv
    join public.ventas v on v.id = dv.venta_id
    join public.medios_pago m on m.id = dv.medio_pago_id
    where m.es_fiado and dv.negocio_id = public.mi_negocio()
    group by v.cliente_id
  ),
  a as (
    select ab.cliente_id, sum(ab.monto) as monto
    from public.abonos ab
    where ab.negocio_id = public.mi_negocio()
    group by ab.cliente_id
  )
  select c.id,
         coalesce(f.monto, 0),
         coalesce(d.monto, 0),
         coalesce(a.monto, 0),
         coalesce(f.monto, 0) - coalesce(d.monto, 0) - coalesce(a.monto, 0)
  from public.clientes c
  left join f on f.cliente_id = c.id
  left join d on d.cliente_id = c.id
  left join a on a.cliente_id = c.id
  where c.negocio_id = public.mi_negocio()
    and (f.monto is not null or a.monto is not null)
$$;

revoke all on function public.saldo_fiado(bigint) from public;
grant execute on function public.saldo_fiado(bigint) to authenticated;
revoke all on function public.saldos_fiado() from public;
grant execute on function public.saldos_fiado() to authenticated;


-- ---------------------------------------------------------------------
-- 6. registrar_venta: control de fiado
--    (igual que en la migración 16, más el bloque de fiado)
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_cliente_id    bigint,
  p_medio_pago_id bigint,
  p_items         jsonb,
  p_pagos         jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total       numeric(12, 2);
  v_suma_pagos  numeric(12, 2);
  v_fiado       numeric(12, 2);
  v_saldo       numeric(12, 2);
  v_cliente     public.clientes;
  v_venta       public.ventas;
  v_prod        record;
  r             record;
begin
  -- ---- Caja abierta -------------------------------------------------
  if not exists (
    select 1 from public.sesiones_caja
    where user_id = auth.uid() and cerrada_en is null
  ) then
    raise exception 'Abre la caja antes de registrar ventas';
  end if;

  -- ---- Validación de las líneas -------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
    where x.producto_id is null
       or x.cantidad is null or x.cantidad <= 0
       or x.precio   is null or x.precio   < 0
  ) then
    raise exception 'Hay productos con cantidad o precio inválidos';
  end if;

  select sum(x.cantidad * x.precio) into v_total
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric);

  -- ---- Los pagos deben cuadrar con el total calculado aquí ---------
  select coalesce(sum(x.monto), 0) into v_suma_pagos
  from jsonb_to_recordset(coalesce(p_pagos, '[]'::jsonb)) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  if abs(v_suma_pagos - v_total) > 0.01 then
    raise exception 'Los pagos ($%) no coinciden con el total de la venta ($%)', v_suma_pagos, v_total;
  end if;

  -- ---- 🆕 Fiado -------------------------------------------------------
  select coalesce(sum(x.monto), 0) into v_fiado
  from jsonb_to_recordset(coalesce(p_pagos, '[]'::jsonb)) as x(medio_pago_id bigint, monto numeric)
  join public.medios_pago m on m.id = x.medio_pago_id
  where x.monto > 0 and m.es_fiado;

  if v_fiado > 0 then
    if p_cliente_id is null then
      raise exception 'Para vender fiado hay que elegir un cliente';
    end if;

    -- Bloquea al cliente: dos ventas fiadas simultáneas no pueden pasar
    -- ambas el control del cupo
    select * into v_cliente from public.clientes where id = p_cliente_id for update;

    if not found then
      raise exception 'Cliente no encontrado';
    end if;

    if v_cliente.documento = '222222222' then
      raise exception 'No se le puede fiar a Consumidor final: registra al cliente con su documento';
    end if;

    if not public.es_administrador()
       and not coalesce((select fiado_vendedor from public.negocios where id = public.mi_negocio()), false) then
      raise exception 'En este negocio solo un administrador puede vender fiado';
    end if;

    v_saldo := public.saldo_fiado(p_cliente_id);

    if v_saldo + v_fiado > v_cliente.cupo_fiado then
      raise exception 'El cupo de fiado de % es $% y ya debe $%: le quedan $% disponibles',
        v_cliente.nombre, v_cliente.cupo_fiado, v_saldo, greatest(v_cliente.cupo_fiado - v_saldo, 0);
    end if;
  end if;

  -- ---- Stock, con bloqueo de filas ----------------------------------
  for r in
    select x.producto_id, sum(x.cantidad) as pedida
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
    group by x.producto_id
    order by x.producto_id
  loop
    select p.id, p.descripcion, coalesce(p.cantidad, 0) as cantidad
      into v_prod
      from public.productos p
     where p.id = r.producto_id
       for update;

    if not found then
      raise exception 'El producto % no existe en este negocio', r.producto_id;
    end if;

    if v_prod.cantidad < r.pedida then
      raise exception 'Stock insuficiente para "%": hay %, se piden %',
        v_prod.descripcion, v_prod.cantidad, r.pedida;
    end if;
  end loop;

  -- ---- Registro: venta, pagos y líneas ------------------------------
  insert into public.ventas (cliente_id, fecha, total, medio_pago_id, user_id)
  values (p_cliente_id, now(), v_total, p_medio_pago_id, auth.uid())
  returning * into v_venta;

  insert into public.pagos_venta (venta_id, medio_pago_id, monto)
  select v_venta.id, x.medio_pago_id, x.monto
  from jsonb_to_recordset(p_pagos) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  insert into public.detalle_ventas (venta_id, producto_id, cantidad, precio, costo_unitario, total)
  select v_venta.id, x.producto_id, x.cantidad, x.precio, p.costo, x.cantidad * x.precio
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
  join public.productos p on p.id = x.producto_id;

  return to_jsonb(v_venta);
end $$;

revoke all on function public.registrar_venta(bigint, bigint, jsonb, jsonb) from public;
grant execute on function public.registrar_venta(bigint, bigint, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 7. registrar_abono
-- ---------------------------------------------------------------------
create or replace function public.registrar_abono(
  p_cliente_id    bigint,
  p_monto         numeric,
  p_medio_pago_id bigint,
  p_nota          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid   := auth.uid();
  v_negocio  bigint := public.mi_negocio();
  v_cliente  public.clientes;
  v_medio    public.medios_pago;
  v_saldo    numeric(12, 2);
  v_sesion   bigint;
  v_abono    public.abonos;
begin
  if v_uid is null or v_negocio is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor que cero';
  end if;

  -- Bloquea al cliente: dos abonos simultáneos no pueden pasar ambos el
  -- control del saldo
  select * into v_cliente
    from public.clientes
   where id = p_cliente_id and negocio_id = v_negocio
     for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  select * into v_medio from public.medios_pago where id = p_medio_pago_id;
  if not found then
    raise exception 'Indica cómo paga el cliente';
  end if;
  if v_medio.es_fiado then
    raise exception 'Un abono no se puede pagar con fiado';
  end if;

  v_saldo := public.saldo_fiado(p_cliente_id);
  if p_monto > v_saldo then
    raise exception '% debe $%: el abono no puede ser mayor', v_cliente.nombre, v_saldo;
  end if;

  select id into v_sesion
    from public.sesiones_caja
   where user_id = v_uid and cerrada_en is null
   order by abierta_en desc
   limit 1;

  if v_sesion is null then
    raise exception 'Abre la caja antes de recibir un abono: el dinero entra a tu cajón';
  end if;

  insert into public.abonos (negocio_id, cliente_id, user_id, sesion_caja_id, monto, medio_pago_id, nota)
  values (v_negocio, p_cliente_id, v_uid, v_sesion, p_monto, p_medio_pago_id, nullif(trim(p_nota), ''))
  returning * into v_abono;

  return to_jsonb(v_abono) || jsonb_build_object('saldo', v_saldo - p_monto);
end $$;

revoke all on function public.registrar_abono(bigint, numeric, bigint, text) from public;
grant execute on function public.registrar_abono(bigint, numeric, bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 8. registrar_devolucion: devolver "en fiado" descuenta de la deuda
--    (igual que en la migración 25, más el bloque de fiado)
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
  v_es_fiado  boolean;
  v_saldo     numeric(12, 2);
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

  select pago, es_fiado into v_medio, v_es_fiado from public.medios_pago where id = p_medio_pago_id;
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

  -- ---- 🆕 Devolver "en fiado" = descontarlo de lo que el cliente debe --
  if v_es_fiado then
    if v_venta.cliente_id is null then
      raise exception 'La venta no tiene cliente: no se puede descontar de un fiado';
    end if;

    v_saldo := public.saldo_fiado(v_venta.cliente_id);
    if v_total > v_saldo then
      raise exception 'El cliente debe $% y la devolución es de $%: solo se puede descontar de un fiado lo que debe. Devuelve el resto en otro medio',
        v_saldo, v_total;
    end if;
  end if;

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

  insert into public.detalle_devoluciones
    (devolucion_id, negocio_id, venta_id, detalle_venta_id, producto_id,
     cantidad, precio, costo_unitario, reintegra)
  select v_dev.id, v_negocio, p_venta_id, dv.id, dv.producto_id,
         x.cantidad::integer, dv.precio, dv.costo_unitario, coalesce(x.reintegra, true)
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric, reintegra boolean)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id
  order by dv.producto_id;

  get diagnostics v_lineas = row_count;

  return to_jsonb(v_dev) || jsonb_build_object('lineas', v_lineas);
end $$;

revoke all on function public.registrar_devolucion(bigint, jsonb, text, bigint, text) from public;
grant execute on function public.registrar_devolucion(bigint, jsonb, text, bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: todas deben decir 1
-- ---------------------------------------------------------------------
select 'medio de pago Fiado' as chequeo,
       (select count(*)::text from public.medios_pago where es_fiado) as resultado
union all
select 'clientes.cupo_fiado',
       (select count(*)::text from information_schema.columns
        where table_name = 'clientes' and column_name = 'cupo_fiado')
union all
select 'tabla abonos',
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'abonos')
union all
select 'registrar_venta controla el cupo',
       (select count(*)::text from pg_proc
        where proname = 'registrar_venta' and prosrc like '%cupo de fiado%')
union all
select 'funcion registrar_abono',
       (select count(*)::text from pg_proc where proname = 'registrar_abono')
union all
select 'registrar_devolucion descuenta del fiado',
       (select count(*)::text from pg_proc
        where proname = 'registrar_devolucion' and prosrc like '%descontar de un fiado%');
