-- =====================================================================
-- Costos fuera del alcance del vendedor (fase 1)
--
-- EL PROBLEMA
-- Ocultar un dato en la pantalla no lo protege: con su propia sesión, un
-- vendedor puede consultar Supabase desde la consola del navegador y leer
-- lo que la RLS le permita. Hoy le permite leer costos por tres caminos:
--   1. detalle_devoluciones.costo_unitario y devoluciones.costo_total
--   2. el texto del historial: "Entrada #12 — +24 unidad(es) a $1.200"
--   3. productos.costo y detalle_ventas.costo_unitario
--
-- ESTA MIGRACIÓN CIERRA 1 y 2. El punto 3 es la fase 2 y es cirugía
-- mayor: registrar_venta y el trigger de inventario corren con los
-- permisos del vendedor y necesitan leer productos.costo, así que hay que
-- moverlo a otra tabla y volver esas funciones SECURITY DEFINER.
--
-- POR QUÉ NO SE CIERRA LA TABLA `devoluciones` ENTERA
-- El vendedor sí necesita leer la cabecera: su cierre de turno descuenta
-- las devoluciones en efectivo, y saldo_fiado() resta las devoluciones
-- hechas "en fiado". Si se la cerráramos, el saldo de sus clientes saldría
-- INFLADO y podría bloquear ventas fiadas legítimas. En cambio el costo de
-- la cabecera sí sobra: es la suma de lo que ya está en las líneas.
--
-- Ejecutar DESPUÉS de 26_fiado.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La cabecera de la devolución deja de guardar costo
--    (estaba duplicado: el costo por línea vive en detalle_devoluciones)
-- ---------------------------------------------------------------------
alter table public.devoluciones drop column if exists costo_total;


-- ---------------------------------------------------------------------
-- 2. El detalle de devoluciones, solo para administradores
--    Ahí está costo_unitario, congelado de la venta original
-- ---------------------------------------------------------------------
drop policy if exists detalle_devoluciones_sel on public.detalle_devoluciones;
create policy detalle_devoluciones_sel on public.detalle_devoluciones
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());


-- ---------------------------------------------------------------------
-- 3. Lo que el vendedor sí necesita: cuántas unidades se devolvieron ya
--    de cada línea de una venta (cantidades, sin un solo costo)
-- ---------------------------------------------------------------------
create or replace function public.devuelto_por_linea(p_venta_id bigint)
returns table (detalle_venta_id bigint, cantidad integer)
language sql
stable
security definer
set search_path = public
as $$
  select dd.detalle_venta_id, sum(dd.cantidad)::integer
  from public.detalle_devoluciones dd
  where dd.venta_id = p_venta_id
    and dd.negocio_id = public.mi_negocio()
  group by dd.detalle_venta_id
$$;

revoke all on function public.devuelto_por_linea(bigint) from public;
grant execute on function public.devuelto_por_linea(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. registrar_entrada: el historial ya no escribe el costo en el texto
--    (igual que en la migración 24, cambiando solo esa línea)
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
  v_producto_id  bigint;
  v_stock_nuevo  numeric;
  v_costo_nuevo  numeric(12, 2);
  v_lineas       integer := 0;
  v_creados      bigint[] := '{}';
  v_repetido     text;
  r              record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede registrar entradas de mercancía';
  end if;

  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  if jsonb_array_length(p_items) > 2000 then
    raise exception 'Máximo 2.000 productos por entrada: divide el archivo en partes';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, nuevo jsonb, cantidad numeric, costo_unitario numeric)
    where (x.producto_id is null) = (x.nuevo is null)
       or x.cantidad is null or x.cantidad < 0 or x.cantidad <> trunc(x.cantidad)
       or (x.producto_id is not null and x.cantidad = 0)
       or x.costo_unitario is null or x.costo_unitario < 0
       or (x.nuevo is not null and (
            coalesce(trim(x.nuevo->>'descripcion'), '') = ''
            or (x.nuevo->>'precio_venta') is null
            or (x.nuevo->>'precio_venta')::numeric < 0
            or ((x.nuevo->>'stock_minimo') is not null
                and (x.nuevo->>'stock_minimo')::numeric < 0)))
  ) then
    raise exception 'Hay líneas con datos inválidos: la cantidad debe ser un número entero (mayor que cero si el producto ya existe), y un producto nuevo necesita nombre y precio de venta';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id bigint)
    where x.producto_id is not null
    group by x.producto_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en la entrada';
  end if;

  select max(trim(x.nuevo->>'descripcion')) into v_repetido
  from jsonb_to_recordset(p_items) as x(nuevo jsonb)
  where x.nuevo is not null
  group by lower(trim(x.nuevo->>'descripcion'))
  having count(*) > 1
  limit 1;

  if v_repetido is not null then
    raise exception 'El producto nuevo "%" está repetido en la entrada', v_repetido;
  end if;

  select p.descripcion into v_repetido
  from jsonb_to_recordset(p_items) as x(nuevo jsonb)
  join public.productos p
    on lower(trim(p.descripcion)) = lower(trim(x.nuevo->>'descripcion'))
  where x.nuevo is not null
  limit 1;

  if v_repetido is not null then
    raise exception 'Ya existe un producto llamado "%": búscalo y agrégalo en vez de crearlo de nuevo', v_repetido;
  end if;

  select sum(x.cantidad * x.costo_unitario) into v_total
  from jsonb_to_recordset(p_items) as x(cantidad numeric, costo_unitario numeric);

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
    select x.producto_id, x.nuevo, x.cantidad::integer as cantidad, x.costo_unitario
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, nuevo jsonb, cantidad numeric, costo_unitario numeric)
    order by x.producto_id nulls last
  loop
    if r.nuevo is not null then
      insert into public.productos (descripcion, cantidad, costo, costo_total, precio_venta, stock_minimo)
      values (
        trim(r.nuevo->>'descripcion'),
        0,
        case when r.cantidad = 0 then r.costo_unitario else 0 end,
        0,
        (r.nuevo->>'precio_venta')::numeric,
        nullif(r.nuevo->>'stock_minimo', '')::integer
      )
      returning id into v_producto_id;

      v_creados := v_creados || v_producto_id;

      if r.cantidad = 0 then
        v_lineas := v_lineas + 1;
        continue;
      end if;
    else
      v_producto_id := r.producto_id;
    end if;

    select p.id, coalesce(p.cantidad, 0) as stock, coalesce(p.costo, 0) as costo
      into v_prod
      from public.productos p
     where p.id = v_producto_id
       for update;

    if not found then
      raise exception 'El producto % no existe en este negocio', v_producto_id;
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
     where id = v_producto_id;

    insert into public.detalle_entradas
      (entrada_id, producto_id, cantidad, costo_unitario,
       stock_anterior, stock_nuevo, costo_anterior, costo_nuevo)
    values
      (v_entrada.id, v_producto_id, r.cantidad, r.costo_unitario,
       v_prod.stock, v_stock_nuevo, v_prod.costo, v_costo_nuevo);

    -- 🆕 Sin el costo en el texto: el historial lo lee todo el negocio.
    -- El costo de la compra queda en detalle_entradas, que es solo de
    -- administradores.
    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, entrada_id)
    values
      (v_producto_id, 'entrada', v_prod.stock, v_stock_nuevo,
       format('Entrada #%s — +%s unidad(es)', v_entrada.id, r.cantidad),
       v_entrada.id);

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_entrada)
      || jsonb_build_object('lineas', v_lineas, 'productos_creados', to_jsonb(v_creados));
end $$;

revoke all on function public.registrar_entrada(text, text, text, jsonb) from public;
grant execute on function public.registrar_entrada(text, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 5. Limpieza de los textos ya escritos
--    Quita el " a $1.200" del final de las entradas registradas antes.
--    El costo real no se pierde: sigue en detalle_entradas.
-- ---------------------------------------------------------------------
update public.producto_historial
   set descripcion = regexp_replace(descripcion, ' a \$[0-9.,]+$', '')
 where tipo_evento = 'entrada'
   and descripcion ~ ' a \$[0-9.,]+$';


-- ---------------------------------------------------------------------
-- 6. registrar_devolucion sin costo_total en la cabecera
--    (igual que en la migración 26, sin esa columna)
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
-- Verificación
-- ---------------------------------------------------------------------
select 'devoluciones sin costo_total (debe ser 0)' as chequeo,
       (select count(*)::text from information_schema.columns
        where table_name = 'devoluciones' and column_name = 'costo_total') as resultado
union all
select 'detalle_devoluciones solo admin',
       (select count(*)::text from pg_policies
        where tablename = 'detalle_devoluciones' and policyname = 'detalle_devoluciones_sel'
          and qual like '%es_administrador%')
union all
select 'funcion devuelto_por_linea',
       (select count(*)::text from pg_proc where proname = 'devuelto_por_linea')
union all
select 'historial de entradas sin costo en el texto (debe ser 0)',
       (select count(*)::text from public.producto_historial
        where tipo_evento = 'entrada' and descripcion ~ ' a \$[0-9.,]+$');
