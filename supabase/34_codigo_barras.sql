-- =====================================================================
-- Código de barras / referencia del producto
--
-- PARA QUÉ
-- Con cientos de productos, buscar por nombre en la caja es el cuello de
-- botella de la atención. Un lector de código de barras se comporta como
-- un teclado: teclea el código y manda Enter. Con esta columna, ese
-- Enter encuentra el producto exacto y lo agrega a la venta.
--
-- POR QUÉ `codigo_barras` Y NO `codigo`
-- `productos.codigo` ya existe: es el consecutivo por negocio de la
-- migración 29, el número que ve el usuario en pantalla. Son cosas
-- distintas y no hay que mezclarlas.
--
-- ÚNICO POR NEGOCIO, PERO SOLO CUANDO HAY CÓDIGO
-- El índice es parcial (`where codigo_barras is not null`), así muchos
-- productos pueden quedar sin código sin chocar entre sí. Un negocio
-- carga los códigos de a poco, a medida que los productos pasan por la
-- caja; exigirlo desde el principio haría inusable la pantalla.
--
-- Ejecutar DESPUÉS de 33_rotacion_productos.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------

alter table public.productos
  add column if not exists codigo_barras text;


-- ---------------------------------------------------------------------
-- 2. Normalización: vacío es null, no cadena vacía
--
-- Si no, dos productos "sin código" guardados como '' chocarían contra el
-- índice único, y el primero en guardarse bloquearía a todos los demás.
-- Va en un trigger propio para que valga también fuera de la aplicación.
-- ---------------------------------------------------------------------

create or replace function public.normalizar_codigo_barras()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.codigo_barras := nullif(trim(new.codigo_barras), '');
  return new;
end $$;

drop trigger if exists normalizar_codigo_barras on public.productos;
create trigger normalizar_codigo_barras
  before insert or update on public.productos
  for each row execute function public.normalizar_codigo_barras();

-- Arregla lo que ya estuviera guardado como cadena vacía
update public.productos
   set codigo_barras = null
 where codigo_barras is not null and trim(codigo_barras) = '';


-- ---------------------------------------------------------------------
-- 3. Único dentro del negocio
-- ---------------------------------------------------------------------

create unique index if not exists productos_codigo_barras_unico
  on public.productos (negocio_id, codigo_barras)
  where codigo_barras is not null;


-- ---------------------------------------------------------------------
-- 4. Solo un administrador cambia el código
--
-- Misma razón que la descripción o el precio: es un dato del catálogo.
-- Si un vendedor pudiera reasignarlo, escanear un producto cobraría otro.
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
  if new.descripcion    is distinct from old.descripcion
     or new.precio_venta   is distinct from old.precio_venta
     or new.stock_minimo   is distinct from old.stock_minimo
     or new.codigo_barras  is distinct from old.codigo_barras then
    raise exception 'Solo un administrador puede modificar la descripción, el precio de venta, el stock mínimo o el código de barras';
  end if;

  -- Stock: solo cuando lo mueve el trigger de inventario al vender
  if new.cantidad is distinct from old.cantidad and pg_trigger_depth() < 2 then
    raise exception 'El stock solo cambia registrando ventas. Para ajustarlo a mano, pídeselo a un administrador';
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 5. crear_producto acepta el código
--
-- Se borra la versión de 5 argumentos: dejar las dos haría ambigua la
-- llamada desde PostgREST, que resuelve por nombre de parámetro.
--
-- El código se asigna con un update posterior en vez de pasarlo hacia
-- adentro: cuando hay stock inicial, esta función delega en
-- `registrar_entrada`, y así no hay que volver a redefinirla.
-- ---------------------------------------------------------------------

drop function if exists public.crear_producto(text, numeric, integer, numeric, numeric);

create or replace function public.crear_producto(
  p_descripcion   text,
  p_precio_venta  numeric,
  p_stock_minimo  integer,
  p_stock_inicial numeric,
  p_costo         numeric,
  p_codigo_barras text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resultado  jsonb;
  v_id         bigint;
  v_codigo     text := nullif(trim(p_codigo_barras), '');
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

  -- Mensaje propio: el error del índice único no le dice nada al usuario
  if v_codigo is not null and exists (
    select 1 from public.productos where codigo_barras = v_codigo
  ) then
    raise exception 'El código de barras "%" ya lo tiene otro producto', v_codigo;
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

  if v_codigo is not null then
    update public.productos set codigo_barras = v_codigo where id = v_id;
  end if;

  select * into v_producto from public.productos where id = v_id;
  return to_jsonb(v_producto);
end $$;

revoke all on function public.crear_producto(text, numeric, integer, numeric, numeric, text) from public;
grant execute on function public.crear_producto(text, numeric, integer, numeric, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: las dos primeras deben decir 1; la tercera es informativa
-- ---------------------------------------------------------------------
select 'columna productos.codigo_barras' as chequeo,
       (select count(*)::text from information_schema.columns
        where table_schema = 'public' and table_name = 'productos'
          and column_name = 'codigo_barras') as resultado
union all
select 'índice único por negocio',
       (select count(*)::text from pg_indexes
        where schemaname = 'public' and indexname = 'productos_codigo_barras_unico')
union all
select 'productos con código cargado (informativo)',
       (select count(*)::text from public.productos where codigo_barras is not null);
