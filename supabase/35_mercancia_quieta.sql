-- =====================================================================
-- Mercancía quieta: la plata detenida en lo que no se vende
--
-- PARA QUÉ
-- Al construir la alerta de stock por rotación (migración 33) salió un
-- dato que nadie estaba mirando: en Fralu, 64 de 633 productos se habían
-- vendido en un mes. El 90 % del catálogo estaba parado. Eso es plata
-- comprada que no vuelve, y hoy no hay ninguna pantalla que lo muestre.
--
-- Esta función responde dos preguntas: cuánta plata hay detenida, y en
-- qué productos concretamente.
--
-- SOLO ADMINISTRADORES
-- El valor detenido se calcula al costo, así que esto es información de
-- costos: misma regla que el resto (fases 1 a 3). Se rechaza explícito en
-- vez de dejar que el join a `productos_costos` devuelva ceros, que sería
-- un reporte silenciosamente equivocado.
--
-- POR QUÉ DEVUELVE jsonb Y NO FILAS
-- Supabase corta en 1.000 filas. Si devolviera una fila por producto, en
-- un catálogo grande el total se calcularía sobre una lista recortada y
-- daría de menos sin ningún error visible. Devolviendo un objeto, los
-- totales los suma Postgres sobre TODO y solo viajan los 100 productos de
-- mayor valor, que es lo que alguien va a mirar.
--
-- Ejecutar DESPUÉS de 34_codigo_barras.sql
-- =====================================================================

create or replace function public.mercancia_quieta(p_dias integer default 90)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_dias  integer := greatest(coalesce(p_dias, 90), 1);
  v_corte timestamptz := now() - make_interval(days => v_dias);
  v_res   jsonb;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede ver la mercancía quieta';
  end if;

  with quietos as (
    select
      p.id,
      p.codigo,
      p.descripcion,
      coalesce(p.cantidad, 0)                                   as cantidad,
      coalesce(pc.costo, 0)                                     as costo,
      (coalesce(p.cantidad, 0) * coalesce(pc.costo, 0))::numeric(14, 2) as valor,
      uv.ultima
    from public.productos p
    left join public.productos_costos pc on pc.producto_id = p.id
    left join lateral (
      select max(v.fecha) as ultima
      from public.detalle_ventas dv
      join public.ventas v on v.id = dv.venta_id
      where dv.producto_id = p.id
        and v.anulada_en is null
    ) uv on true
    -- Sin stock no hay plata detenida: un producto agotado que no se vende
    -- no es un problema de inventario
    where coalesce(p.cantidad, 0) > 0
      and (uv.ultima is null or uv.ultima < v_corte)
  ),
  top100 as (
    select * from quietos order by valor desc, cantidad desc limit 100
  )
  select jsonb_build_object(
    'dias',        v_dias,
    'productos',   (select count(*) from quietos),
    'unidades',    (select coalesce(sum(cantidad), 0) from quietos),
    'valor_total', (select coalesce(sum(valor), 0) from quietos),
    -- Cuántos nunca se han vendido, ni una vez: son los más preocupantes
    'nunca',       (select count(*) from quietos where ultima is null),
    'items', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'producto_id', id,
                'codigo',      codigo,
                'descripcion', descripcion,
                'cantidad',    cantidad,
                'costo',       costo,
                'valor',       valor,
                'ultima_venta', ultima
              ) order by valor desc, cantidad desc)
       from top100),
      '[]'::jsonb)
  )
  into v_res;

  return v_res;
end $$;

revoke all on function public.mercancia_quieta(integer) from public;
grant execute on function public.mercancia_quieta(integer) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación
--
-- En el SQL Editor `auth.uid()` es null, así que `es_administrador()`
-- devuelve false y la función se rechaza a sí misma: eso es lo correcto.
-- Esta consulta comprueba que quedó creada, sin ejecutarla.
-- ---------------------------------------------------------------------
select 'función mercancia_quieta()' as chequeo,
       count(*)::text as resultado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'mercancia_quieta';
