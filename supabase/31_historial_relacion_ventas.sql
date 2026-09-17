-- =====================================================================
-- El historial de productos y su relación con las ventas
--
-- EL PROBLEMA
-- `producto_historial.venta_id` existe desde antes de las migraciones y
-- nunca tuvo declarada su relación con `ventas`. Las de entrada, ajuste y
-- devolución sí la tienen, porque las creamos nosotros.
--
-- Eso pasó desapercibido hasta que el historial empezó a pedir el número
-- de cada documento (migración 30): sin la relación declarada, Supabase no
-- puede traer `ventas ( numero )`, la consulta entera falla y la pantalla
-- mostraba "Sin movimientos registrados aún" aunque hubiera movimientos.
--
-- NOT VALID a propósito: solo se exige de aquí en adelante. Si quedaron
-- filas apuntando a ventas borradas (la app permitió borrar ventas recién
-- creadas hasta la migración 15), no se rechaza la migración. La consulta
-- al final dice cuántas hay.
--
-- Ejecutar DESPUÉS de 30_numeros_por_negocio.sql
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producto_historial'::regclass
      and contype = 'f'
      and conname = 'producto_historial_venta_id_fkey'
  ) then
    alter table public.producto_historial
      add constraint producto_historial_venta_id_fkey
      foreign key (venta_id) references public.ventas (id)
      not valid;
  end if;
end $$;

-- El historial se consulta por producto y se cruza con estos documentos
create index if not exists producto_historial_venta_idx
  on public.producto_historial (venta_id);
create index if not exists producto_historial_entrada_idx
  on public.producto_historial (entrada_id);
create index if not exists producto_historial_ajuste_idx
  on public.producto_historial (ajuste_id);
create index if not exists producto_historial_devolucion_idx
  on public.producto_historial (devolucion_id);


-- ---------------------------------------------------------------------
-- Verificación: la primera debe decir 1; la segunda es informativa
-- ---------------------------------------------------------------------
select 'relación historial → ventas' as chequeo,
       (select count(*)::text from pg_constraint
        where conrelid = 'public.producto_historial'::regclass
          and conname = 'producto_historial_venta_id_fkey') as resultado
union all
select 'movimientos que apuntan a ventas borradas (informativo)',
       (select count(*)::text
        from public.producto_historial h
        left join public.ventas v on v.id = h.venta_id
        where h.venta_id is not null and v.id is null);
