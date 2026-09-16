-- =====================================================================
-- El costo de los productos, solo para administradores (fase 2)
--
-- EL PROBLEMA
-- `productos.costo` y `productos.costo_total` los podía leer cualquiera
-- del negocio: la política de lectura de `productos` es por negocio, y
-- Postgres no permite reglas por columna. Ocultarlos en la pantalla no
-- sirve: con su propia sesión, un vendedor los consulta directamente.
--
-- LA SOLUCIÓN
-- Las dos columnas se mudan a `productos_costos`, una tabla 1 a 1 con
-- `productos` que solo pueden leer los administradores. `productos` las
-- pierde, así que ya no hay nada que filtrar por ese lado.
--
-- LO QUE OBLIGA A REDEFINIR
-- Todo lo que leía o escribía el costo:
--   - actualizar_inventario (trigger de ventas) → SECURITY DEFINER
--   - registrar_venta                           → SECURITY DEFINER
--   - registrar_entrada, registrar_ajuste, crear_producto, anular_venta
--   - reintegrar_stock_devolucion
--   - proteger_campos_producto (ya no existen esas columnas)
--
-- POR QUÉ DOS FUNCIONES PASAN A SECURITY DEFINER
-- Corren con los permisos de quien vende, y un vendedor ya no puede leer
-- el costo. Al elevarlas dejan de aplicarse las políticas automáticas de
-- aislamiento, así que **filtran el negocio a mano** en cada consulta:
-- ese filtro es ahora la única barrera entre negocios en esas funciones.
--
-- LO QUE NO CIERRA
-- `detalle_ventas.costo_unitario` (el costo congelado de cada venta pasada)
-- sigue siendo legible por el negocio. Va en la migración 29, aparte, para
-- poder probar una cosa a la vez.
--
-- Ejecutar DESPUÉS de 27_costos_no_visibles.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La tabla de costos y el traslado de los datos
-- ---------------------------------------------------------------------
create table if not exists public.productos_costos (
  producto_id bigint primary key references public.productos (id) on delete cascade,
  negocio_id  bigint not null default public.mi_negocio() references public.negocios (id),
  costo       numeric(12, 2) not null default 0 check (costo >= 0),
  costo_total numeric(14, 2) not null default 0
);

create index if not exists productos_costos_negocio_idx on public.productos_costos (negocio_id);

-- Copia los valores actuales. Idempotente: si ya se corrió, no duplica.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name = 'costo'
  ) then
    execute $copia$
      insert into public.productos_costos (producto_id, negocio_id, costo, costo_total)
      select id, negocio_id, coalesce(costo, 0), coalesce(costo_total, 0)
      from public.productos
      on conflict (producto_id) do nothing
    $copia$;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. RLS: solo administradores. El borrado va por cascada con el producto.
-- ---------------------------------------------------------------------
alter table public.productos_costos enable row level security;

drop policy if exists productos_costos_sel on public.productos_costos;
create policy productos_costos_sel on public.productos_costos
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists productos_costos_ins on public.productos_costos;
create policy productos_costos_ins on public.productos_costos
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists productos_costos_upd on public.productos_costos;
create policy productos_costos_upd on public.productos_costos
  for update to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador())
  with check (negocio_id = public.mi_negocio());


-- ---------------------------------------------------------------------
-- 3. Cada producto nuevo nace con su renglón de costo en cero
--    (así ninguna función tiene que acordarse de crearlo)
-- ---------------------------------------------------------------------
create or replace function public.crear_costo_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.productos_costos (producto_id, negocio_id, costo, costo_total)
  values (new.id, new.negocio_id, 0, 0)
  on conflict (producto_id) do nothing;
  return new;
end $$;

drop trigger if exists crear_costo_producto on public.productos;
create trigger crear_costo_producto
  after insert on public.productos
  for each row execute function public.crear_costo_producto();


-- ---------------------------------------------------------------------
-- 4. proteger_campos_producto: sin las columnas que ya no existen
-- ---------------------------------------------------------------------
create or replace function public.proteger_campos_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role, o un administrador: sin restricciones
  if auth.uid() is null or public.es_administrador() then
    return new;
  end if;

  -- Datos comerciales: nunca para un vendedor (el costo ya vive en otra tabla)
  if new.descripcion   is distinct from old.descripcion
     or new.precio_venta  is distinct from old.precio_venta
     or new.stock_minimo  is distinct from old.stock_minimo then
    raise exception 'Solo un administrador puede modificar la descripción, el precio de venta o el stock mínimo';
  end if;

  -- Stock: solo cuando lo mueve el trigger de inventario al vender
  if new.cantidad is distinct from old.cantidad and pg_trigger_depth() < 2 then
    raise exception 'El stock solo cambia registrando ventas. Para ajustarlo a mano, pídeselo a un administrador';
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 5. actualizar_inventario: descuenta el stock al vender
--    SECURITY DEFINER porque ahora también actualiza productos_costos,
--    que un vendedor no puede tocar.
-- ---------------------------------------------------------------------
create or replace function public.actualizar_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_actual numeric;
begin
  select cantidad into stock_actual
    from public.productos
   where id = new.producto_id
     for update;

  if stock_actual is null then
    raise exception 'Producto con id % no existe', new.producto_id;
  end if;

  if stock_actual < new.cantidad then
    raise exception 'Stock insuficiente para el producto id %: disponible %, solicitado %',
      new.producto_id, stock_actual, new.cantidad;
  end if;

  update public.productos
     set cantidad = cantidad - new.cantidad
   where id = new.producto_id;

  update public.productos_costos
     set costo_total = (stock_actual - new.cantidad) * costo
   where producto_id = new.producto_id;

  insert into public.producto_historial
    (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, venta_id)
  values
    (new.producto_id, 'venta', stock_actual, stock_actual - new.cantidad,
     'Venta #' || new.venta_id || ' — ' || new.cantidad || ' unidad(es)',
     new.venta_id);

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 6. registrar_venta
--    SECURITY DEFINER: necesita leer el costo para congelarlo en la venta.
--    Por eso filtra el negocio a mano en cada consulta.
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

  -- ---- Registro: venta, pagos y líneas ------------------------------
  insert into public.ventas (negocio_id, cliente_id, fecha, total, medio_pago_id, user_id)
  values (v_negocio, p_cliente_id, now(), v_total, p_medio_pago_id, v_uid)
  returning * into v_venta;

  insert into public.pagos_venta (negocio_id, venta_id, medio_pago_id, monto)
  select v_negocio, v_venta.id, x.medio_pago_id, x.monto
  from jsonb_to_recordset(p_pagos) as x(medio_pago_id bigint, monto numeric)
  where x.monto > 0;

  -- El costo sale de productos_costos: no se confía en el navegador
  insert into public.detalle_ventas
    (negocio_id, venta_id, producto_id, cantidad, precio, costo_unitario, total)
  select v_negocio, v_venta.id, x.producto_id, x.cantidad, x.precio, coalesce(pc.costo, 0), x.cantidad * x.precio
  from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric, precio numeric)
  join public.productos p on p.id = x.producto_id and p.negocio_id = v_negocio
  left join public.productos_costos pc on pc.producto_id = p.id;

  return to_jsonb(v_venta);
end $$;

revoke all on function public.registrar_venta(bigint, bigint, jsonb, jsonb) from public;
grant execute on function public.registrar_venta(bigint, bigint, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 7. crear_producto: el costo se guarda en la tabla nueva
-- ---------------------------------------------------------------------
create or replace function public.crear_producto(
  p_descripcion   text,
  p_precio_venta  numeric,
  p_stock_minimo  integer,
  p_stock_inicial numeric,
  p_costo         numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resultado  jsonb;
  v_id         bigint;
  v_producto   public.productos;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede crear productos';
  end if;

  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'El producto necesita un nombre';
  end if;

  if p_precio_venta is null or p_precio_venta < 0 then
    raise exception 'El precio de venta no es válido';
  end if;

  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  if p_stock_inicial is not null
     and (p_stock_inicial < 0 or p_stock_inicial <> trunc(p_stock_inicial)) then
    raise exception 'El stock inicial debe ser un número entero, cero o más';
  end if;

  if p_costo is not null and p_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if coalesce(p_stock_inicial, 0) > 0 then
    v_resultado := public.registrar_entrada(
      null, null, 'Stock inicial',
      jsonb_build_array(jsonb_build_object(
        'nuevo', jsonb_build_object(
          'descripcion', p_descripcion,
          'precio_venta', p_precio_venta,
          'stock_minimo', p_stock_minimo
        ),
        'cantidad', p_stock_inicial,
        'costo_unitario', coalesce(p_costo, 0)
      ))
    );
    v_id := (v_resultado->'productos_creados'->>0)::bigint;
  else
    if exists (
      select 1 from public.productos
      where lower(trim(descripcion)) = lower(trim(p_descripcion))
    ) then
      raise exception 'Ya existe un producto llamado "%"', trim(p_descripcion);
    end if;

    insert into public.productos (descripcion, cantidad, precio_venta, stock_minimo)
    values (trim(p_descripcion), 0, p_precio_venta, p_stock_minimo)
    returning id into v_id;

    -- El trigger ya creó el renglón de costo en cero; aquí queda el costo
    -- de referencia hasta la primera compra
    update public.productos_costos
       set costo = coalesce(p_costo, 0)
     where producto_id = v_id;
  end if;

  select * into v_producto from public.productos where id = v_id;
  return to_jsonb(v_producto);
end $$;

revoke all on function public.crear_producto(text, numeric, integer, numeric, numeric) from public;
grant execute on function public.crear_producto(text, numeric, integer, numeric, numeric) to authenticated;


-- ---------------------------------------------------------------------
-- 8. registrar_entrada (igual que en la 27, con el costo en la tabla nueva)
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
      insert into public.productos (descripcion, cantidad, precio_venta, stock_minimo)
      values (
        trim(r.nuevo->>'descripcion'),
        0,
        (r.nuevo->>'precio_venta')::numeric,
        nullif(r.nuevo->>'stock_minimo', '')::integer
      )
      returning id into v_producto_id;

      v_creados := v_creados || v_producto_id;

      -- Producto agotado: queda creado, con el costo como referencia
      if r.cantidad = 0 then
        update public.productos_costos
           set costo = r.costo_unitario
         where producto_id = v_producto_id;
        v_lineas := v_lineas + 1;
        continue;
      end if;
    else
      v_producto_id := r.producto_id;
    end if;

    select p.id, coalesce(p.cantidad, 0) as stock, coalesce(pc.costo, 0) as costo
      into v_prod
      from public.productos p
      left join public.productos_costos pc on pc.producto_id = p.id
     where p.id = v_producto_id
       for update of p;

    if not found then
      raise exception 'El producto % no existe en este negocio', v_producto_id;
    end if;

    v_stock_nuevo := v_prod.stock + r.cantidad;
    v_costo_nuevo := case
      when v_prod.stock <= 0 then r.costo_unitario
      else round((v_prod.stock * v_prod.costo + r.cantidad * r.costo_unitario) / v_stock_nuevo, 2)
    end;

    update public.productos
       set cantidad = v_stock_nuevo
     where id = v_producto_id;

    update public.productos_costos
       set costo = v_costo_nuevo,
           costo_total = v_stock_nuevo * v_costo_nuevo
     where producto_id = v_producto_id;

    insert into public.detalle_entradas
      (entrada_id, producto_id, cantidad, costo_unitario,
       stock_anterior, stock_nuevo, costo_anterior, costo_nuevo)
    values
      (v_entrada.id, v_producto_id, r.cantidad, r.costo_unitario,
       v_prod.stock, v_stock_nuevo, v_prod.costo, v_costo_nuevo);

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
-- 9. registrar_ajuste (igual que en la 22, con el costo en la tabla nueva)
-- ---------------------------------------------------------------------
create or replace function public.registrar_ajuste(p_nota text, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ajuste      public.ajustes;
  v_prod        record;
  v_diferencia  numeric;
  v_costo_nuevo numeric(12, 2);
  v_lineas      integer := 0;
  v_cambios     integer := 0;
  r             record;
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
    select p.id, p.descripcion, coalesce(p.cantidad, 0) as stock, coalesce(pc.costo, 0) as costo
      into v_prod
      from public.productos p
      left join public.productos_costos pc on pc.producto_id = p.id
     where p.id = r.producto_id
       for update of p;

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

    insert into public.detalle_ajustes
      (ajuste_id, producto_id, motivo, stock_anterior, stock_contado, diferencia,
       costo_anterior, costo_nuevo, valor_diferencia)
    values
      (v_ajuste.id, r.producto_id, r.motivo, v_prod.stock, r.stock_contado, v_diferencia,
       v_prod.costo, v_costo_nuevo, round(v_diferencia * v_costo_nuevo, 2));

    if v_diferencia <> 0 or v_costo_nuevo <> v_prod.costo then
      update public.productos
         set cantidad = r.stock_contado
       where id = r.producto_id;

      update public.productos_costos
         set costo = v_costo_nuevo,
             costo_total = r.stock_contado * v_costo_nuevo
       where producto_id = r.producto_id;

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
-- 10. anular_venta (igual que en la 25, con el costo en la tabla nueva)
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

  select * into v_venta from public.ventas where id = p_venta_id for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.anulada_en is not null then
    raise exception 'Esta venta ya estaba anulada';
  end if;

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
       set cantidad = coalesce(cantidad, 0) + r.cantidad
     where id = r.producto_id
    returning cantidad into v_despues;

    -- Producto borrado del catálogo: no hay stock que devolver
    continue when not found;

    update public.productos_costos
       set costo_total = v_despues * costo
     where producto_id = r.producto_id;

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
-- 11. reintegrar_stock_devolucion (igual que en la 25, con la tabla nueva)
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

  update public.productos
     set cantidad = coalesce(cantidad, 0) + new.cantidad
   where id = new.producto_id
  returning cantidad into v_despues;

  if not found then
    return new;
  end if;

  update public.productos_costos
     set costo_total = v_despues * costo
   where producto_id = new.producto_id;

  insert into public.producto_historial
    (negocio_id, producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, devolucion_id)
  values
    (new.negocio_id, new.producto_id, 'devolucion', v_despues - new.cantidad, v_despues,
     format('Devolución #%s de la venta #%s — +%s unidad(es)', new.devolucion_id, new.venta_id, new.cantidad),
     new.devolucion_id);

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 12. Y recién ahora: fuera las columnas de `productos`
-- ---------------------------------------------------------------------
alter table public.productos
  drop column if exists costo,
  drop column if exists costo_total;


-- ---------------------------------------------------------------------
-- Verificación: 1, 1, 0, 0 y luego el cuadre de los datos
-- ---------------------------------------------------------------------
select 'tabla productos_costos' as chequeo,
       (select count(*)::text from information_schema.tables
        where table_schema = 'public' and table_name = 'productos_costos') as resultado
union all
select 'registrar_venta con permisos elevados',
       (select count(*)::text from pg_proc
        where proname = 'registrar_venta' and prosecdef)
union all
select 'productos.costo (debe ser 0)',
       (select count(*)::text from information_schema.columns
        where table_name = 'productos' and column_name = 'costo')
union all
select 'productos sin renglón de costo (debe ser 0)',
       (select count(*)::text from public.productos p
        left join public.productos_costos pc on pc.producto_id = p.id
        where pc.producto_id is null);
