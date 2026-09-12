-- =====================================================================
-- Alertas de stock bajo
--
-- DISEÑO
-- El umbral vive en dos niveles: `negocios.stock_minimo_defecto` aplica a
-- todo el catálogo, y `productos.stock_minimo` lo sobrescribe cuando un
-- producto concreto necesita otro valor.
--
-- Se hace así porque configurar 632 productos a mano no es realista: con
-- el valor del negocio las alertas funcionan desde el primer día, y solo
-- se ajustan los pocos productos que lo ameriten (los de mucha rotación,
-- o los que se piden por caja).
--
-- `productos.stock_minimo` en NULL significa "usa el valor del negocio".
-- Es distinto de 0, que significa "no me avises nunca por este producto".
--
-- Ejecutar DESPUÉS de 11_permisos_vendedor.sql
-- =====================================================================

alter table public.negocios
  add column if not exists stock_minimo_defecto integer not null default 5
  check (stock_minimo_defecto >= 0);

alter table public.productos
  add column if not exists stock_minimo integer
  check (stock_minimo is null or stock_minimo >= 0);

-- Acelera el listado de productos por agotarse
create index if not exists productos_stock_idx
  on public.productos (negocio_id, cantidad);


-- ---------------------------------------------------------------------
-- El umbral es una decisión comercial, no un movimiento de inventario:
-- se suma a las columnas que un vendedor no puede tocar.
-- ---------------------------------------------------------------------
create or replace function public.proteger_campos_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.es_administrador() then
    return new;
  end if;

  if new.descripcion   is distinct from old.descripcion
     or new.costo         is distinct from old.costo
     or new.precio_venta  is distinct from old.precio_venta
     or new.stock_minimo  is distinct from old.stock_minimo then
    raise exception 'Solo un administrador puede modificar la descripción, el costo, el precio de venta o el stock mínimo';
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select 'negocios.stock_minimo_defecto' as columna,
       (select count(*)::text from information_schema.columns
        where table_name = 'negocios' and column_name = 'stock_minimo_defecto') as existe
union all
select 'productos.stock_minimo',
       (select count(*)::text from information_schema.columns
        where table_name = 'productos' and column_name = 'stock_minimo');
