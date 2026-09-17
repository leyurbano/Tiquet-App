-- =====================================================================
-- El vendedor no puede fijar el stock a mano (hallazgo 8 de la auditoría)
--
-- EL PROBLEMA
-- El trigger de columnas de productos (migraciones 11, 12 y 14) dejaba
-- que un vendedor cambiara `cantidad` y `costo_total`, porque el trigger
-- de inventario los necesita al vender. Pero eso también permitía que un
-- vendedor, desde la consola del navegador, pusiera el stock en cualquier
-- valor y tapara un faltante.
--
-- LA SOLUCIÓN: pg_trigger_depth()
-- Devuelve qué tan anidado está el trigger que se ejecuta:
--   - UPDATE directo sobre productos        → este trigger corre en nivel 1
--   - UPDATE hecho por actualizar_inventario → este trigger corre en nivel 2
--     (venta → detalle_ventas → actualizar_inventario → UPDATE productos)
-- Un vendedor solo puede mover el stock en el segundo caso: vendiendo.
--
-- Administradores y super admin no cambian: siguen pudiendo ajustar el
-- stock y anular ventas.
--
-- Ejecutar DESPUÉS de 17_proteger_clientes.sql
-- =====================================================================

create or replace function public.proteger_campos_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- SQL Editor / service role, o un administrador: sin restricciones
  if auth.uid() is null or public.es_administrador() then
    return new;
  end if;

  -- Datos comerciales: nunca para un vendedor
  if new.descripcion   is distinct from old.descripcion
     or new.costo         is distinct from old.costo
     or new.precio_venta  is distinct from old.precio_venta
     or new.stock_minimo  is distinct from old.stock_minimo then
    raise exception 'Solo un administrador puede modificar la descripción, el costo, el precio de venta o el stock mínimo';
  end if;

  -- 🆕 Stock: solo cuando lo mueve el trigger de inventario al vender
  if (new.cantidad    is distinct from old.cantidad
      or new.costo_total is distinct from old.costo_total)
     and pg_trigger_depth() < 2 then
    raise exception 'El stock solo cambia registrando ventas. Para ajustarlo a mano, pídeselo a un administrador';
  end if;

  return new;
end $$;


-- Verificación: debe decir 1
select 'proteger_campos_producto controla el stock' as chequeo,
       (select count(*)::text from pg_proc
        where proname = 'proteger_campos_producto'
          and prosrc like '%pg_trigger_depth%') as resultado;
