-- =====================================================================
-- El precio de cada venta sale del catálogo, no del navegador
--
-- EL PROBLEMA
-- Hasta la migración 32, registrar_venta usaba el precio que mandaba el
-- navegador en cada línea y solo revisaba que no fuera negativo. Como no
-- hay servidor de aplicación, cualquier usuario con sesión puede llamar a
-- la función desde la consola del navegador: un vendedor podía registrar
-- un producto de $50.000 a $1, la caja cuadraba con ese total y el
-- reporte mostraba una venta normal. Aplica a todos los negocios.
--
-- LA REGLA NUEVA
-- El precio de cada línea es `productos.precio_venta` (null cuenta como 0,
-- igual que en la pantalla de Ventas). El precio que manda el navegador ya
-- no decide nada: solo se compara, para avisar si cambió.
--
-- POR QUÉ SE RECHAZA SI EL PRECIO CAMBIÓ, EN VEZ DE USAR EL NUEVO
-- El cajero le cobra al cliente lo que ve en pantalla. Si un administrador
-- cambia el precio con el carrito abierto, la base cobraría otro total y
-- los pagos no cuadrarían ("Los pagos no coinciden..."), que no explica
-- nada. Rechazar con el nombre del producto y el precio nuevo le dice al
-- cajero exactamente qué hacer.
--
-- POR QUÉ SE LEEN LOS PRECIOS UNA SOLA VEZ (v_items)
-- El total y las líneas tienen que salir del mismo precio. Si se leyera
-- dos veces, un cambio de precio entre la primera y la segunda lectura
-- dejaría una venta cuyo total no es la suma de sus líneas.
--
-- Es la versión de la migración 32 con dos cambios: el bloque "Precios
-- del catálogo" y el uso de v_items en lugar de p_items. Sigue siendo
-- SECURITY DEFINER, así que cada consulta filtra negocio_id a mano.
--
-- Idempotente (create or replace). Ejecutar DESPUÉS de 35_mercancia_quieta.sql
-- =====================================================================

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
  v_items       jsonb;
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
  ) then
    raise exception 'Hay productos con cantidad inválida';
  end if;

  -- ---- Precios del catálogo -----------------------------------------
  -- Si el precio cambió desde que se cargó la pantalla, se rechaza con el
  -- nombre del producto (ver arriba por qué no se usa el nuevo en silencio)
  select p.descripcion, coalesce(p.precio_venta, 0) as precio
    into v_prod
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
    join public.productos p on p.id = x.producto_id and p.negocio_id = v_negocio
   where x.precio is null
      or abs(x.precio - coalesce(p.precio_venta, 0)) > 0.005
   limit 1;

  if found then
    raise exception 'El precio de "%" cambió: ahora es $%. Quítalo de la venta y agrégalo de nuevo',
      v_prod.descripcion, v_prod.precio;
  end if;

  -- Las líneas con el precio del catálogo, leído una sola vez. Un producto
  -- de otro negocio no pasa el join y se rechaza aquí
  select jsonb_agg(jsonb_build_object(
           'producto_id', x.producto_id,
           'cantidad',    x.cantidad,
           'precio',      coalesce(p.precio_venta, 0)))
    into v_items
    from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
    join public.productos p on p.id = x.producto_id and p.negocio_id = v_negocio;

  if coalesce(jsonb_array_length(v_items), 0) <> jsonb_array_length(p_items) then
    raise exception 'Hay productos que no existen en este negocio';
  end if;

  select sum(x.cantidad * x.precio) into v_total
  from jsonb_to_recordset(v_items) as x(producto_id bigint, cantidad numeric, precio numeric);

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
    from jsonb_to_recordset(v_items) as x(producto_id bigint, cantidad numeric, precio numeric)
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
  from jsonb_to_recordset(v_items) as x(producto_id bigint, cantidad numeric, precio numeric);

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
-- Verificación
--
-- En el SQL Editor `auth.uid()` es null y la función se rechaza a sí
-- misma, así que no se puede probar una venta desde aquí. Esta consulta
-- comprueba que quedó la versión nueva, sin ejecutarla.
-- ---------------------------------------------------------------------
select 'registrar_venta usa el precio del catálogo' as chequeo,
       case when count(*) = 1 then 'OK' else 'FALTA' end as resultado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'registrar_venta'
  and p.prosrc like '%Precios del catálogo%';
