-- =====================================================================
-- Lista los usuarios de Auth que todavía no tienen perfil.
--
-- POR QUÉ
-- Los usuarios se crean a mano en el dashboard de Supabase, pero ahí nacen
-- sin perfil: sin fila en `perfiles`, mi_negocio() devuelve null y la app
-- se les ve completamente vacía.
--
-- Sin esta función, el super admin tendría que copiar el UUID del usuario
-- desde el dashboard y pegarlo en la app. Con ella, el panel muestra
-- directamente quién quedó pendiente de asignar.
--
-- SECURITY DEFINER porque el navegador no puede leer auth.users. El
-- `where es_super_admin()` de adentro es lo que impide que cualquier otro
-- usuario la invoque y obtenga la lista de correos de la plataforma.
--
-- Ejecutar DESPUÉS de 07_super_admin_flag.sql
-- =====================================================================

create or replace function public.usuarios_sin_perfil()
returns table (
  id      uuid,
  email   text,
  creado  timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, u.created_at
  from auth.users u
  where public.es_super_admin()
    and not exists (select 1 from public.perfiles p where p.id = u.id)
  order by u.created_at desc
$$;

revoke all on function public.usuarios_sin_perfil() from public;
grant execute on function public.usuarios_sin_perfil() to authenticated;
