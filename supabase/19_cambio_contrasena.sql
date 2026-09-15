-- =====================================================================
-- Cambio de contraseña obligatorio (hallazgo 7 de la auditoría)
--
-- EL PROBLEMA
-- El super admin crea cada usuario con una contraseña que escribe en un
-- campo visible y se la entrega. El usuario no tenía forma de cambiarla:
-- el super admin conocía para siempre la contraseña de todo el mundo.
--
-- LA SOLUCIÓN
-- Cuando el super admin crea un usuario o le restablece la contraseña,
-- el perfil queda marcado con debe_cambiar_contrasena = true, y la app le
-- exige cambiarla al entrar. Al cambiarla, la marca se limpia.
--
-- LÍMITE HONESTO
-- La marca la limpia el propio usuario (marcar_contrasena_cambiada), así
-- que alguien con conocimientos podría limpiarla desde la consola sin
-- cambiar la contraseña. Es una guía para el uso normal, no un control
-- inviolable: el riesgo que cubre es que el super admin siga conociendo
-- la contraseña, y quien la evade a propósito se queda con una contraseña
-- que él mismo eligió no cambiar.
--
-- Ejecutar DESPUÉS de 18_stock_solo_por_ventas.sql
-- =====================================================================

alter table public.perfiles
  add column if not exists debe_cambiar_contrasena boolean not null default false;

-- El vendedor no tiene permiso de UPDATE sobre perfiles (solo los
-- administradores), así que limpiar su propia marca pasa por esta función.
-- Solo toca la fila del propio usuario y solo esa columna.
create or replace function public.marcar_contrasena_cambiada()
returns void language sql security definer set search_path = public as $$
  update public.perfiles
     set debe_cambiar_contrasena = false
   where id = auth.uid()
$$;

revoke all on function public.marcar_contrasena_cambiada() from public;
grant execute on function public.marcar_contrasena_cambiada() to authenticated;


-- ---------------------------------------------------------------------
-- OPCIONAL: obligar a los usuarios que ya existen a cambiar su contraseña
-- en el próximo inicio de sesión. Recomendado si esas contraseñas las
-- asignaste tú. Quita el comentario de la línea para aplicarlo.
-- ---------------------------------------------------------------------
-- update public.perfiles set debe_cambiar_contrasena = true where not es_super_admin;


-- Verificación: ambas deben decir 1
select 'perfiles.debe_cambiar_contrasena' as chequeo,
       (select count(*)::text from information_schema.columns
        where table_name = 'perfiles' and column_name = 'debe_cambiar_contrasena') as resultado
union all
select 'funcion marcar_contrasena_cambiada',
       (select count(*)::text from pg_proc where proname = 'marcar_contrasena_cambiada');
