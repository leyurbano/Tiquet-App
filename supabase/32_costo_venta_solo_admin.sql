-- =====================================================================
-- Fase 3: el costo congelado de cada venta deja de ser visible
--
-- EL PROBLEMA
-- Las fases 1 y 2 sacaron los costos de las entradas, los ajustes, las
-- devoluciones, el historial y la ficha del producto. Quedaba una puerta
-- abierta: `detalle_ventas.costo_unitario`, el costo que `registrar_venta`
-- congela en cada linea. La politica de lectura de `detalle_ventas` es de
-- todo el negocio (el vendedor necesita ver el detalle para reimprimir un
-- tiquete o hacer una devolucion), y Postgres no tiene RLS por columna:
-- quien puede leer la fila, lee la columna. Un vendedor con su propia
-- sesion podia pedirle a Supabase el costo de todo lo vendido.
--
-- LA SOLUCION
-- La misma de la fase 2 con `productos_costos`: el costo se muda a una
-- tabla aparte, 1-1 con la linea de venta, que solo los administradores
-- pueden leer. `detalle_ventas` queda sin ninguna columna de costo.
--
-- Quien escribe: SOLO `registrar_venta`, que ya es SECURITY DEFINER desde
-- la fase 2. Por eso esta tabla NO tiene politicas de insert ni de update:
-- ni siquiera un administrador puede cambiar a mano el costo de una venta
-- pasada, que es justamente lo que le da valor al dato congelado.
--
-- Quien lee: la pantalla de Reportes, que ya era solo para administradores,
-- y `registrar_devolucion`, que copia el costo a la devolucion (tambien
-- DEFINER, y `detalle_devoluciones` ya es solo admin desde la fase 1).
--
-- Ejecutar DESPUES de 31_historial_relacion_ventas.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La tabla espejo
-- ---------------------------------------------------------------------

create table if not exists public.detalle_ventas_costos (
  detalle_venta_id bigint primary key references public.detalle_ventas (id) on delete cascade,
  negocio_id       bigint not null default public.mi_negocio() references public.negocios (id),
  -- Nulo a proposito: las ventas anteriores a la migracion 13 nunca
  -- guardaron costo, y el reporte las cuenta aparte ("margen aproximado")
  costo_unitario   numeric(12, 2) check (costo_unitario is null or costo_unitario >= 0)
);

create index if not exists detalle_ventas_costos_negocio_idx
  on public.detalle_ventas_costos (negocio_id);


-- ---------------------------------------------------------------------
-- 2. Copia de los costos que hoy estan en detalle_ventas
--    Idempotente: si ya se corrio, no duplica ni pisa nada.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'detalle_ventas'
      and column_name = 'costo_unitario'
  ) then
    execute $copia$
      insert into public.detalle_ventas_costos (detalle_venta_id, negocio_id, costo_unitario)
      select id, negocio_id, costo_unitario
      from public.detalle_ventas
      on conflict (detalle_venta_id) do nothing
    $copia$;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. RLS: leer solo el administrador, y solo de su negocio.
--    Sin politicas de insert/update/delete: las politicas se suman, y no
--    poner ninguna es la forma de que nadie escriba desde el navegador.
--    registrar_venta escribe como DEFINER, saltandose RLS.
-- ---------------------------------------------------------------------

alter table public.detalle_ventas_costos enable row level security;

drop policy if exists detalle_ventas_costos_sel on public.detalle_ventas_costos;
create policy detalle_ventas_costos_sel on public.detalle_ventas_costos
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());


-- ---------------------------------------------------------------------
-- 4. registrar_venta: guarda el costo en la tabla nueva
--    Igual que la version de la fase 2; cambia solo el bloque final.
--    Sigue siendo DEFINER, asi que cada consulta filtra negocio_id a mano.
-- ---------------------------------------------------------------------

create or replace function public.registrar_venta(
  p_cliente_id    bigint,
  p_medio_pago_id bigint,
  p_items         jsonb,
  p_pagos         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid   := auth.uid();
  v_negocio     bigint := public.mi_negocio();
  v_total       numeric(12, 2);
  v_suma_pagos  numeric(12, 2);
  v_fiado       numeric(12, 2);
  v_saldo       numeric(12, 2);
  v_cliente     public.clientes;
  v_venta       public.ventas;
  v_prod        record;
  r             record;
begin
  if v_uid is null or v_negocio is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  -- ---- Caja abierta -------------------------------------------------
  if not exists (
    select 1 from public.sesiones_caja
    where user_id = v_uid and cerrada_en is null
  ) then
    raise exception 'Abre la caja antes de registrar ventas';
  end if;

  -- ---- Validacion de las lineas -------------------------------------
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

  -- ---- Los pagos deben cuadrar con el total calculado aqui ---------
  select coalesce(sum(x.monto), 0) into v_suma_pagos
  from jsonb_to_recordset(coalesce(p_pagos, '[]'::jsonb)) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  if abs(v_suma_pagos - v_total) > 0.01 then
    raise exception 'Los pagos ($%) no coinciden con el total de la venta ($%)', v_suma_pagos, v_total;
  end if;

  -- ---- Fiado ---------------------------------------------------------
  select coalesce(sum(x.monto), 0) into v_fiado
  from jsonb_to_recordset(coalesce(p_pagos, '[]'::jsonb)) as x(medio_pago_id bigint, monto numeric)
  join public.medios_pago m on m.id = x.medio_pago_id
  where x.monto > 0 and m.es_fiado;

  if v_fiado > 0 then
    if p_cliente_id is null then
      raise exception 'Para vender fiado hay que elegir un cliente';
    end if;

    select * into v_cliente
      from public.clientes
     where id = p_cliente_id and negocio_id = v_negocio
       for update;

    if not found then
      raise exception 'Cliente no encontrado';
    end if;

    if v_cliente.documento = '222222222' then
      raise exception 'No se le puede fiar a Consumidor final: registra al cliente con su documento';
    end if;

    if not public.es_administrador()
       and not coalesce((select fiado_vendedor from public.negocios where id = v_negocio), false) then
      raise exception 'En este negocio solo un administrador puede vender fiado';
    end if;

    v_saldo := public.saldo_fiado(p_cliente_id);

    if v_saldo + v_fiado > v_cliente.cupo_fiado then
      raise exception 'El cupo de fiado de % es $% y ya debe $%: le quedan $% disponibles',
        v_cliente.nombre, v_cliente.cupo_fiado, v_saldo, greatest(v_cliente.cupo_fiado - v_saldo, 0);
    end if;
  elsif p_cliente_id is not null then
    -- Sin fiado igual se valida que el cliente sea de este negocio: con
    -- SECURITY DEFINER ya no hay una regla automática que lo haga
    if not exists (
      select 1 from public.clientes where id = p_cliente_id and negocio_id = v_negocio
    ) then
      raise exception 'Cliente no encontrado';
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
     where p.id = r.producto_id and p.negocio_id = v_negocio
       for update;

    if not found then
      raise exception 'El producto % no existe en este negocio', r.producto_id;
    end if;

    if v_prod.cantidad < r.pedida then
      raise exception 'Stock insuficiente para "%": hay %, se piden %',
        v_prod.descripcion, v_prod.cantidad, r.pedida;
    end if;
  end loop;

  -- ---- Registro: venta, pagos y lineas ------------------------------
  insert into public.ventas (negocio_id, cliente_id, fecha, total, medio_pago_id, user_id)
  values (v_negocio, p_cliente_id, now(), v_total, p_medio_pago_id, v_uid)
  returning * into v_venta;

  insert into public.pagos_venta (negocio_id, venta_id, medio_pago_id, monto)
  select v_negocio, v_venta.id, x.medio_pago_id, x.monto
  from jsonb_to_recordset(p_pagos) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  insert into public.detalle_ventas
    (negocio_id, venta_id, producto_id, cantidad, precio, total)
  select v_negocio, v_venta.id, x.producto_id, x.cantidad, x.precio, x.cantidad * x.precio
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
  join public.productos p on p.id = x.producto_id and p.negocio_id = v_negocio;

  -- El costo sale de productos_costos, nunca del navegador, y se congela
  -- en la tabla espejo que solo el administrador puede leer
  insert into public.detalle_ventas_costos (detalle_venta_id, negocio_id, costo_unitario)
  select dv.id, v_negocio, coalesce(pc.costo, 0)
  from public.detalle_ventas dv
  left join public.productos_costos pc
         on pc.producto_id = dv.producto_id and pc.negocio_id = v_negocio
  where dv.venta_id = v_venta.id;

  return to_jsonb(v_venta);
end $$;


-- ---------------------------------------------------------------------
-- 5. registrar_devolucion: el costo a copiar ya no esta en detalle_ventas
--    Identica a la de la fase 1 salvo el join del ultimo insert.
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

  select sum(x.cantidad * dv.precio) into v_total
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id;

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

  select id into v_sesion
    from public.sesiones_caja
   where user_id = v_uid and cerrada_en is null
   order by abierta_en desc
   limit 1;

  if v_sesion is null and (not v_admin or v_efectivo) then
    raise exception 'Abre la caja antes de registrar la devolución: el dinero sale de tu cajón';
  end if;

  insert into public.devoluciones
    (negocio_id, venta_id, user_id, sesion_caja_id, motivo, nota, medio_pago_id, total)
  values
    (v_negocio, p_venta_id, v_uid, v_sesion, p_motivo, nullif(trim(p_nota), ''),
     p_medio_pago_id, v_total)
  returning * into v_dev;

  -- El costo congelado ahora vive en detalle_ventas_costos (fase 3)
  insert into public.detalle_devoluciones
    (devolucion_id, negocio_id, venta_id, detalle_venta_id, producto_id,
     cantidad, precio, costo_unitario, reintegra)
  select v_dev.id, v_negocio, p_venta_id, dv.id, dv.producto_id,
         x.cantidad::integer, dv.precio, dvc.costo_unitario, coalesce(x.reintegra, true)
  from jsonb_to_recordset(p_items) as x(detalle_venta_id bigint, cantidad numeric, reintegra boolean)
  join public.detalle_ventas dv on dv.id = x.detalle_venta_id
  left join public.detalle_ventas_costos dvc on dvc.detalle_venta_id = dv.id
  order by dv.producto_id;

  get diagnostics v_lineas = row_count;

  return to_jsonb(v_dev) || jsonb_build_object('lineas', v_lineas);
end $$;


-- ---------------------------------------------------------------------
-- 6. Recien ahora se quita la columna: si algo de arriba falla, la
--    transaccion se deshace y el costo sigue donde estaba.
-- ---------------------------------------------------------------------

alter table public.detalle_ventas drop column if exists costo_unitario;


-- ---------------------------------------------------------------------
-- Verificacion: las tres primeras deben decir 0; las otras son informativas
-- ---------------------------------------------------------------------
select 'columna costo_unitario en detalle_ventas (debe ser 0)' as chequeo,
       (select count(*)::text from information_schema.columns
        where table_schema = 'public' and table_name = 'detalle_ventas'
          and column_name = 'costo_unitario') as resultado
union all
select 'politicas de escritura en detalle_ventas_costos (debe ser 0)',
       (select count(*)::text from pg_policies
        where schemaname = 'public' and tablename = 'detalle_ventas_costos'
          and cmd <> 'SELECT')
union all
select 'lineas de venta sin su costo copiado (debe ser 0)',
       (select count(*)::text
        from public.detalle_ventas dv
        left join public.detalle_ventas_costos dvc on dvc.detalle_venta_id = dv.id
        where dvc.detalle_venta_id is null)
union all
select 'costos de venta guardados (informativo)',
       (select count(*)::text from public.detalle_ventas_costos)
union all
select 'ventas viejas sin costo, margen aproximado (informativo)',
       (select count(*)::text from public.detalle_ventas_costos where costo_unitario is null);
