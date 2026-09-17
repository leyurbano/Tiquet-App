-- =====================================================================
-- Rotación de productos, para que la alerta de stock bajo sirva
--
-- EL PROBLEMA
-- La alerta marcaba "por agotarse" todo lo que estuviera por debajo del
-- stock mínimo. En Fralu eso daba 352 de 633 productos: más de la mitad
-- del catálogo. Una alerta que señala la mitad del inventario no ayuda a
-- decidir qué comprar, y la gente deja de mirarla.
--
-- Bajar el mínimo no lo arregla: con el mínimo en 1 todavía quedaban 92
-- productos marcados. El criterio medía la dimensión equivocada. "Tener
-- pocas unidades" no es lo mismo que "necesito comprarlo": un producto
-- que vende 1 al mes con 2 unidades está bien surtido, y uno que vende 20
-- diarios con 5 está en problemas.
--
-- De los 352 marcados, solo 12 se habían vendido en el último mes.
--
-- LA SOLUCIÓN
-- Esta función dice cuántas unidades de cada producto se vendieron en los
-- últimos N días. La aplicación suma esa condición a la alerta: avisa solo
-- de lo que se está vendiendo Y se está acabando.
--
-- POR QUÉ EN LA BASE Y NO EN EL NAVEGADOR
-- Supabase devuelve máximo 1.000 filas por consulta, y 30 días de
-- `detalle_ventas` los pasa. Sumando en el cliente el conteo saldría corto
-- sin dar ningún error. Aquí la suma la hace Postgres y solo viaja una
-- fila por producto.
--
-- SIN SECURITY DEFINER a propósito: con RLS normal cada quien ve las
-- ventas de su negocio y nada más, así que no hay que filtrar negocio_id
-- a mano (que es de donde salieron los sustos de las fases 2 y 3).
--
-- Tampoco resta devoluciones: `detalle_devoluciones` es solo para
-- administradores, así que restarlas le daría al vendedor y al admin dos
-- alertas distintas para el mismo producto. Para saber si algo rota, lo
-- que importa es que se haya movido.
--
-- Ejecutar DESPUÉS de 32_costo_venta_solo_admin.sql
-- =====================================================================

create or replace function public.rotacion_productos(p_dias integer default 30)
returns table (producto_id bigint, vendidos numeric)
language sql
stable
set search_path = public
as $$
  select dv.producto_id, sum(dv.cantidad)::numeric as vendidos
  from public.detalle_ventas dv
  join public.ventas v on v.id = dv.venta_id
  where v.anulada_en is null
    and v.fecha >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  group by dv.producto_id
$$;

revoke all on function public.rotacion_productos(integer) from public;
grant execute on function public.rotacion_productos(integer) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación
--
-- En el SQL Editor `auth.uid()` es null, así que la RLS no filtra por
-- negocio y estos números salen de todos los negocios juntos. Sirven para
-- confirmar que la función corre, no para auditar un negocio.
-- ---------------------------------------------------------------------
select 'productos que rotaron en 30 días' as chequeo,
       count(*)::text as resultado
from public.rotacion_productos(30)
union all
select 'productos que rotaron en 7 días',
       count(*)::text
from public.rotacion_productos(7);
