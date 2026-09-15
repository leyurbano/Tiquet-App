-- =====================================================================
-- Productos nuevos con historial desde el primer día
--
-- EL PROBLEMA
-- 1. Crear un producto en Productos con "stock inicial" metía ese stock
--    sin pasar por ninguna entrada: no quedaba la compra, ni el costo de
--    origen, ni aparecía en el historial. Contradecía la regla de que el
--    stock solo sube con entradas registradas.
-- 2. Si un pedido traía un producto que no estaba en el catálogo, había que
--    dejar la entrada a medias, crearlo en Productos y volver.
--
-- LA SOLUCIÓN (hacia adelante: no toca ningún producto existente)
-- - registrar_entrada acepta líneas con un producto NUEVO: lo crea dentro
--   de la misma transacción. Si la entrada no se registra, el producto
--   tampoco queda creado. Las líneas con productos existentes se procesan
--   exactamente igual que en la migración 21.
-- - crear_producto: crea la ficha y, si hay stock inicial, lo registra
--   como una entrada "Stock inicial" (reutiliza registrar_entrada). El
--   formulario de Productos no cambia para quien lo usa.
-- - Se rechazan nombres repetidos (sin importar mayúsculas ni espacios):
--   un producto duplicado parte el stock entre dos fichas.
--
-- Ejecutar DESPUÉS de 22_ajustes_inventario.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. registrar_entrada con productos nuevos
--
--    Cada línea trae UNO de los dos:
--      { "producto_id": 12, "cantidad": 24, "costo_unitario": 1200 }
--      { "nuevo": { "descripcion": "Galletas x12", "precio_venta": 3500,
--                   "stock_minimo": 5 },
--        "cantidad": 24, "costo_unitario": 1200 }
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

  -- Cada línea: exactamente uno de producto_id o nuevo, cantidad entera
  -- mayor que cero y costo; un producto nuevo necesita nombre y precio
  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, nuevo jsonb, cantidad numeric, costo_unitario numeric)
    where (x.producto_id is null) = (x.nuevo is null)
       or x.cantidad is null or x.cantidad <= 0 or x.cantidad <> trunc(x.cantidad)
       or x.costo_unitario is null or x.costo_unitario < 0
       or (x.nuevo is not null and (
            coalesce(trim(x.nuevo->>'descripcion'), '') = ''
            or (x.nuevo->>'precio_venta') is null
            or (x.nuevo->>'precio_venta')::numeric < 0
            or ((x.nuevo->>'stock_minimo') is not null
                and (x.nuevo->>'stock_minimo')::numeric < 0)))
  ) then
    raise exception 'Hay líneas con datos inválidos: la cantidad debe ser un número entero mayor que cero, y un producto nuevo necesita nombre y precio de venta';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id bigint)
    where x.producto_id is not null
    group by x.producto_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en la entrada';
  end if;

  -- Productos nuevos repetidos dentro de la misma entrada
  select max(trim(x.nuevo->>'descripcion')) into v_repetido
  from jsonb_to_recordset(p_items) as x(nuevo jsonb)
  where x.nuevo is not null
  group by lower(trim(x.nuevo->>'descripcion'))
  having count(*) > 1
  limit 1;

  if v_repetido is not null then
    raise exception 'El producto nuevo "%" está repetido en la entrada', v_repetido;
  end if;

  -- Un producto "nuevo" que ya existe en el catálogo (la RLS limita la
  -- búsqueda al negocio propio)
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
    -- Existentes primero y en orden fijo (evita bloqueos cruzados con ventas)
    order by x.producto_id nulls last
  loop
    if r.nuevo is not null then
      -- Nace en cero: el stock y el costo le llegan con esta misma línea
      insert into public.productos (descripcion, cantidad, costo, costo_total, precio_venta, stock_minimo)
      values (
        trim(r.nuevo->>'descripcion'),
        0, 0, 0,
        (r.nuevo->>'precio_venta')::numeric,
        nullif(r.nuevo->>'stock_minimo', '')::integer
      )
      returning id into v_producto_id;

      v_creados := v_creados || v_producto_id;
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

    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, entrada_id)
    values
      (v_producto_id, 'entrada', v_prod.stock, v_stock_nuevo,
       format('Entrada #%s — +%s unidad(es) a $%s', v_entrada.id, r.cantidad, r.costo_unitario),
       v_entrada.id);

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_entrada)
      || jsonb_build_object('lineas', v_lineas, 'productos_creados', to_jsonb(v_creados));
end $$;

revoke all on function public.registrar_entrada(text, text, text, jsonb) from public;
grant execute on function public.registrar_entrada(text, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 2. crear_producto
--
--    Lo usa el formulario de Productos. Con stock inicial, el producto se
--    crea a través de registrar_entrada (nota "Stock inicial"), así queda
--    en el historial con su costo de origen, igual que cualquier compra.
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
    -- registrar_entrada crea el producto, valida el nombre repetido y deja
    -- la entrada "Stock inicial" en el historial, todo en esta transacción
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

    -- Sin stock no hay entrada: el costo queda como referencia hasta la
    -- primera compra, que lo reemplaza (con stock en cero no hay promedio)
    insert into public.productos (descripcion, cantidad, costo, costo_total, precio_venta, stock_minimo)
    values (trim(p_descripcion), 0, coalesce(p_costo, 0), 0, p_precio_venta, p_stock_minimo)
    returning id into v_id;
  end if;

  select * into v_producto from public.productos where id = v_id;
  return to_jsonb(v_producto);
end $$;

revoke all on function public.crear_producto(text, numeric, integer, numeric, numeric) from public;
grant execute on function public.crear_producto(text, numeric, integer, numeric, numeric) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: ambas deben decir 1
-- ---------------------------------------------------------------------
select 'funcion crear_producto' as chequeo,
       (select count(*)::text from pg_proc where proname = 'crear_producto') as resultado
union all
select 'registrar_entrada acepta productos nuevos',
       (select count(*)::text from pg_proc
        where proname = 'registrar_entrada' and prosrc like '%productos_creados%');
