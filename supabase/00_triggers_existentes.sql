-- =====================================================================
-- Triggers de inventario y pagos (anteriores a las migraciones 01–16)
--
-- Estas dos funciones y sus triggers ya existían en la base de datos
-- antes de que se empezaran a versionar las migraciones, y no estaban en
-- el repositorio. Si la base se restauraba o se montaba otro entorno, las
-- ventas dejaban de descontar inventario sin que nadie lo notara.
--
-- Se copian aquí TAL COMO ESTÁN en producción (extraídas con
-- pg_get_functiondef el 2026-09-12), sin cambios de comportamiento.
-- Es idempotente: correrlo sobre la base actual no altera nada.
--
-- CÓMO ENCAJAN CON EL RESTO
-- - actualizar_inventario valida y descuenta el stock por cada línea de
--   venta, y registra el evento 'venta' en producto_historial. Lee el
--   stock sin bloquear la fila: la condición de carrera que eso permitía
--   (dos cajas vendiendo la última unidad) la cierra registrar_venta
--   (migración 15), que bloquea el producto antes de insertar la línea.
-- - validar_suma_pagos solo impide que los pagos SUPEREN el total. Que
--   sean exactamente iguales lo exige registrar_venta.
--
-- Corren con los permisos de quien vende (SECURITY INVOKER por defecto),
-- así que respetan la RLS y el trigger de columnas de productos.
-- =====================================================================


CREATE OR REPLACE FUNCTION public.actualizar_inventario()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  stock_actual NUMERIC;
BEGIN
  -- Obtener el stock del producto
  SELECT cantidad INTO stock_actual
  FROM productos
  WHERE id = NEW.producto_id;

  -- Validar si existe el producto
  IF stock_actual IS NULL THEN
    RAISE EXCEPTION 'Producto con id % no existe', NEW.producto_id;
  END IF;

  -- Validar que haya stock suficiente
  IF stock_actual < NEW.cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto id %: disponible %, solicitado %',
      NEW.producto_id, stock_actual, NEW.cantidad;
  END IF;

  -- Actualizar cantidad y costo total
  UPDATE productos
  SET
    cantidad    = cantidad - NEW.cantidad,
    costo_total = (cantidad - NEW.cantidad) * costo
  WHERE id = NEW.producto_id;

  -- 🆕 Registrar en historial
  INSERT INTO producto_historial (
    producto_id,
    tipo_evento,
    cantidad_anterior,
    cantidad_nueva,
    descripcion,
    venta_id
  ) VALUES (
    NEW.producto_id,
    'venta',
    stock_actual,
    stock_actual - NEW.cantidad,
    'Venta #' || NEW.venta_id || ' — ' || NEW.cantidad || ' unidad(es)',
    NEW.venta_id
  );

  RETURN NEW;
END;$function$;


CREATE OR REPLACE FUNCTION public.validar_suma_pagos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  suma_pagos NUMERIC;
  total_venta NUMERIC;
BEGIN
  SELECT total INTO total_venta FROM ventas WHERE id = NEW.venta_id;
  SELECT COALESCE(SUM(monto), 0) INTO suma_pagos
  FROM pagos_venta
  WHERE venta_id = NEW.venta_id;

  IF suma_pagos > total_venta THEN
    RAISE EXCEPTION 'La suma de pagos (%) supera el total de la venta (%)', suma_pagos, total_venta;
  END IF;

  RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS descontar_inventario ON public.detalle_ventas;
CREATE TRIGGER descontar_inventario
  AFTER INSERT ON public.detalle_ventas
  FOR EACH ROW EXECUTE FUNCTION actualizar_inventario();

DROP TRIGGER IF EXISTS trg_validar_pagos ON public.pagos_venta;
CREATE TRIGGER trg_validar_pagos
  AFTER INSERT ON public.pagos_venta
  FOR EACH ROW EXECUTE FUNCTION validar_suma_pagos();
