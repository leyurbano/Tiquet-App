-- =====================================================================
-- Ventas y anulaciones atómicas
--
-- EL PROBLEMA (hallazgos 4 y 6 de la auditoría)
-- El navegador registraba una venta en varios pasos sueltos: primero la
-- venta, luego los pagos y luego cada producto por separado, sin revisar
-- si cada paso funcionaba. Si fallaba un producto a mitad (corte de red,
-- stock), quedaba una venta con total pero sin productos: el inventario
-- no se descontaba, el reporte de margen salía falso, y la pantalla
-- decía "✅ Venta registrada".
--
-- La anulación tenía el mismo defecto al revés, más una condición de
-- carrera: leía el stock, sumaba y escribía. Si entraba una venta en
-- medio, se perdía su descuento; y si fallaba a mitad y se reintentaba,
-- el stock se devolvía dos veces.
--
-- LA SOLUCIÓN
-- Cada operación es ahora UNA función de Postgres. Una función corre en
-- una sola transacción: si cualquier paso falla, se deshace todo y la
-- base queda exactamente como estaba. O se registra la venta completa,
-- o no se registra nada.
--
-- SECURITY INVOKER a propósito: corren con los permisos de quien llama,
-- así que siguen aplicando la RLS, las políticas de la migración 14 y los
-- triggers existentes (descontar_inventario, validar_suma_pagos).
--
-- Ejecutar DESPUÉS de 14_endurecimiento_seguridad.sql
-- =====================================================================


-- =====================================================================
-- registrar_venta
--
-- p_items: [{ "producto_id": 1, "cantidad": 2, "precio": 3500 }, ...]
-- p_pagos: [{ "medio_pago_id": 1, "monto": 7000 }, ...]
--
-- El TOTAL lo calcula la base de datos a partir de las líneas: ya no
-- depende de lo que mande el navegador (hallazgo 17). La FECHA la pone
-- el servidor con now(): es el instante real sin importar la hora del
-- computador del local, y la app la sigue mostrando en hora de Colombia.
-- =====================================================================

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
  v_venta       public.ventas;
  v_prod        record;
  r             record;
begin
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

  -- ---- Stock --------------------------------------------------------
  -- FOR UPDATE bloquea cada producto hasta que termine la transacción:
  -- si dos cajas intentan vender la última unidad al mismo tiempo, la
  -- segunda espera, ve el stock ya descontado y recibe el error.
  for r in
    select x.producto_id, sum(x.cantidad) as pedida
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
    group by x.producto_id
    order by x.producto_id   -- orden fijo: evita bloqueos cruzados entre dos ventas
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

  -- ---- Registro: venta, pagos y líneas (mismo orden que antes) -----
  insert into public.ventas (cliente_id, fecha, total, medio_pago_id, user_id)
  values (p_cliente_id, now(), v_total, p_medio_pago_id, auth.uid())
  returning * into v_venta;

  -- Una sola sentencia para todos los pagos, igual que hacía la app:
  -- así el trigger validar_suma_pagos los ve juntos, como antes
  insert into public.pagos_venta (venta_id, medio_pago_id, monto)
  select v_venta.id, x.medio_pago_id, x.monto
  from jsonb_to_recordset(p_pagos) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  -- El costo se toma de productos aquí mismo: no se confía en el navegador
  insert into public.detalle_ventas (venta_id, producto_id, cantidad, precio, costo_unitario, total)
  select v_venta.id, x.producto_id, x.cantidad, x.precio, p.costo, x.cantidad * x.precio
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
  join public.productos p on p.id = x.producto_id;

  return to_jsonb(v_venta);
end $$;

revoke all on function public.registrar_venta(bigint, bigint, jsonb, jsonb) from public;
grant execute on function public.registrar_venta(bigint, bigint, jsonb, jsonb) to authenticated;


-- =====================================================================
-- anular_venta
--
-- Devuelve el stock con un incremento atómico (cantidad = cantidad + n),
-- sin leer-sumar-escribir, y marca la venta como anulada. Todo o nada.
-- =====================================================================

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


-- =====================================================================
-- Sin borrado de ventas
--
-- La única razón para permitir DELETE era el rollback manual que hacía la
-- app cuando fallaban los pagos. Con registrar_venta ese rollback lo hace
-- la propia transacción, así que el borrado queda cerrado del todo: una
-- venta solo puede anularse, dejando rastro.
-- =====================================================================

drop policy if exists ventas_del on public.ventas;


-- =====================================================================
-- Verificación: ambas deben decir 1, y la política de borrado 0
-- =====================================================================
select 'funcion registrar_venta' as chequeo,
       (select count(*)::text from pg_proc where proname = 'registrar_venta') as resultado
union all
select 'funcion anular_venta',
       (select count(*)::text from pg_proc where proname = 'anular_venta')
union all
select 'politica ventas_del (debe ser 0)',
       (select count(*)::text from pg_policies where tablename = 'ventas' and policyname = 'ventas_del');
