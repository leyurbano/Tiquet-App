-- =====================================================================
-- Permisos del rol `vendedor`
--
-- Hasta ahora `rol` solo servía para mostrar u ocultar el enlace de
-- Configuración. Un vendedor podía anular ventas, cambiar costos y borrar
-- productos igual que un administrador — incluido anular sus propias
-- ventas, que era justo el control que faltaba en el arqueo de caja.
--
-- POR QUÉ NO SE LE QUITA LA ESCRITURA SOBRE `productos`
-- El trigger `descontar_inventario` sobre detalle_ventas descuenta el
-- stock al vender. Si el vendedor no pudiera actualizar productos, no
-- podría registrar ventas. Por eso el permiso se restringe por COLUMNAS:
-- puede mover stock, pero no tocar descripción, costo ni precio.
--
-- Ejecutar DESPUÉS de 10_usuarios_sin_perfil.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Helper: administrador del negocio (o super admin)
-- ---------------------------------------------------------------------
create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol = 'administrador' from public.perfiles where id = auth.uid() and activo),
    false
  ) or public.es_super_admin()
$$;

revoke all on function public.es_administrador() from public;
grant execute on function public.es_administrador() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Productos: crear y borrar solo administradores
--    (el UPDATE sigue abierto al negocio, lo limita el trigger del punto 3)
-- ---------------------------------------------------------------------
drop policy if exists productos_ins on public.productos;
create policy productos_ins on public.productos
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists productos_del on public.productos;
create policy productos_del on public.productos
  for delete to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());


-- ---------------------------------------------------------------------
-- 3. Protección por columnas
--
--    Un vendedor puede cambiar cantidad y costo_total (lo que hacen el
--    trigger de inventario y la reversión al anular), pero no los datos
--    comerciales del producto.
-- ---------------------------------------------------------------------
create or replace function public.proteger_campos_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.es_administrador() then
    return new;
  end if;

  if new.descripcion  is distinct from old.descripcion
     or new.costo         is distinct from old.costo
     or new.precio_venta  is distinct from old.precio_venta then
    raise exception 'Solo un administrador puede modificar la descripción, el costo o el precio de venta';
  end if;

  return new;
end $$;

drop trigger if exists proteger_campos_producto on public.productos;
create trigger proteger_campos_producto
  before update on public.productos
  for each row execute function public.proteger_campos_producto();


-- ---------------------------------------------------------------------
-- 4. Anular ventas: solo administradores
--    La anulación es un UPDATE sobre ventas (anulada_en, motivo).
-- ---------------------------------------------------------------------
drop policy if exists ventas_upd on public.ventas;
create policy ventas_upd on public.ventas
  for update to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador())
  with check (negocio_id = public.mi_negocio());


-- ---------------------------------------------------------------------
-- 5. Borrado de ventas: prácticamente cerrado
--
--    Ahora las ventas se anulan, no se borran. Pero createSale todavía
--    necesita borrar la venta recién creada si falla el registro de sus
--    pagos, para no dejar datos huérfanos.
--
--    Se permite solo ese caso: la propia venta, sin anular, de los últimos
--    10 minutos. Así el rollback sigue funcionando y nadie puede borrar
--    ventas históricas para saltarse el rastro de anulación.
-- ---------------------------------------------------------------------
drop policy if exists ventas_del on public.ventas;
create policy ventas_del on public.ventas
  for delete to authenticated
  using (
    negocio_id = public.mi_negocio()
    and anulada_en is null
    and user_id = auth.uid()
    and fecha > now() - interval '10 minutes'
  );


-- ---------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------
select 'es_administrador()' as chequeo, public.es_administrador()::text as resultado
union all
select 'trigger de columnas',
       (select count(*)::text from pg_trigger
        where tgname = 'proteger_campos_producto');
