-- =====================================================================
-- Guarda el costo del producto en el momento de la venta
--
-- EL PROBLEMA
-- detalle_ventas registra a qué precio se vendió, pero no cuánto costaba
-- el producto entonces. Para calcular el margen habría que usar el costo
-- actual de productos, y eso distorsiona el histórico: si el costo subió,
-- las ventas viejas parecerían menos rentables de lo que fueron.
--
-- Un reporte de ganancias que no se puede defender ante el contador no
-- sirve de nada, así que el costo se congela con cada venta.
--
-- SOBRE LOS DATOS EXISTENTES
-- Las ventas ya registradas se rellenan con el costo actual del producto,
-- porque es la única aproximación disponible. Es exacto de aquí en
-- adelante y aproximado hacia atrás; la app lo advierte en el reporte.
--
-- Ejecutar DESPUÉS de 12_stock_minimo.sql
-- =====================================================================

alter table public.detalle_ventas
  add column if not exists costo_unitario numeric(12, 2);

-- Relleno de lo histórico con el costo actual (aproximación)
update public.detalle_ventas d
set costo_unitario = p.costo
from public.productos p
where d.producto_id = p.id
  and d.costo_unitario is null;

create index if not exists detalle_ventas_venta_idx
  on public.detalle_ventas (venta_id);

select 'detalle_ventas.costo_unitario' as columna,
       count(*) filter (where costo_unitario is not null)::text as con_costo,
       count(*)::text as total
from public.detalle_ventas;
