-- =====================================================================
-- Importar productos desde Excel
--
-- La importación (Inventario → Importar desde Excel) registra el archivo
-- completo como UNA entrada con registrar_entrada: o entra todo o no entra
-- nada, y todo el stock queda con historial desde el primer día.
--
-- CAMBIOS en registrar_entrada (el resto queda igual que en la 23):
-- - Un producto NUEVO puede venir con cantidad 0: muchos catálogos tienen
--   productos agotados. Se crea sin stock y sin movimiento; el costo del
--   archivo queda como referencia hasta la primera compra.
--   Los productos existentes siguen exigiendo cantidad mayor que cero.
-- - Máximo 2.000 líneas por entrada, para que la transacción no sea pesada.
--
-- Ejecutar DESPUÉS de 23_crear_productos.sql
-- =====================================================================

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

  -- Cada línea: exactamente uno de producto_id o nuevo, cantidad entera
  -- (mayor que cero si el producto ya existe; cero o más si es nuevo) y
  -- costo; un producto nuevo necesita nombre y precio
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
      -- Nace en cero: el stock y el costo le llegan con esta misma línea.
      -- Sin cantidad, el costo queda solo como referencia.
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

      -- Producto agotado: queda creado, sin movimiento de stock
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
-- Verificación: debe decir 1
-- ---------------------------------------------------------------------
select 'registrar_entrada acepta productos nuevos agotados y máximo 2.000' as chequeo,
       (select count(*)::text from pg_proc
        where proname = 'registrar_entrada' and prosrc like '%Máximo 2.000%') as resultado;
