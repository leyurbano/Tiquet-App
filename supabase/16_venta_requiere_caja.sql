-- =====================================================================
-- Sin caja abierta no se vende
--
-- La apertura de caja dejó de pedirse al iniciar sesión: ahora se pide al
-- entrar a Ventas, y administradores y super admin pueden omitirla si solo
-- van a consultar o configurar.
--
-- Eso abre una posibilidad que antes no existía: registrar una venta sin
-- turno de caja. Esa venta no entraría en ningún arqueo (el cierre suma
-- solo las ventas del turno abierto) y el efectivo quedaría sin control.
-- La interfaz ya bloquea el formulario, pero ocultar un botón no es
-- seguridad: la regla tiene que vivir aquí.
--
-- Se redefine registrar_venta idéntica a la migración 15, agregando la
-- verificación al principio.
--
-- Ejecutar DESPUÉS de 15_ventas_atomicas.sql
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
  -- ---- 🆕 Caja abierta ----------------------------------------------
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

-- Verificación: debe decir 1
select 'registrar_venta exige caja' as chequeo,
       (select count(*)::text from pg_proc
        where proname = 'registrar_venta'
          and prosrc like '%Abre la caja antes de registrar ventas%') as resultado;
