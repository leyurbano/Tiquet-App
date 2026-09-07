-- =====================================================================
-- Separa "super administrador" del rol dentro del negocio.
--
-- POR QUÉ
-- En multi_negocio.sql metí 'super_admin' como un valor más de `rol`, y
-- eso obligaba a que el super admin no tuviera negocio. Pero son dos
-- cosas independientes: `rol` es qué haces DENTRO de un negocio
-- (vendedor / administrador), y super admin es un permiso de plataforma,
-- por encima de todos los negocios. El dueño del sistema puede ser
-- administrador de su propio negocio Y super admin a la vez.
--
-- Además, al conflacionarlos, cualquier chequeo de rol = 'administrador'
-- dejaba de reconocer al dueño.
--
-- Ejecutar DESPUÉS de multi_negocio.sql
-- =====================================================================

-- 1. El permiso de plataforma, como columna propia
alter table public.perfiles
  add column if not exists es_super_admin boolean not null default false;

-- 2. `rol` vuelve a ser solo el rol dentro del negocio
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('vendedor', 'administrador'));

-- 3. Todos pertenecen a un negocio, salvo un super admin de plataforma pura
--    (alguien que administre el sistema sin operar ningún negocio propio)
alter table public.perfiles drop constraint if exists perfiles_negocio_segun_rol;
alter table public.perfiles add constraint perfiles_negocio_requerido
  check (negocio_id is not null or es_super_admin);

-- 4. La función ahora lee la columna, no el rol
create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_super_admin from public.perfiles where id = auth.uid() and activo),
    false
  )
$$;

revoke all on function public.es_super_admin() from public;
grant execute on function public.es_super_admin() to authenticated;

-- 5. leyurbano: administrador de Fralu Y super admin de la plataforma
update public.perfiles
set es_super_admin = true
where email_interno = 'leyurbano@gmail.com';

-- Verificación
select nombre, email_interno, rol, negocio_id, es_super_admin, activo
from public.perfiles
order by es_super_admin desc, nombre;
