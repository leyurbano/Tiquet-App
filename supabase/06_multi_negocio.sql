-- =====================================================================
-- MULTI-NEGOCIO (multi-tenencia) + SUPER ADMINISTRADOR
--
-- Convierte la base en una compartida por varios negocios, donde cada uno
-- solo ve sus propios datos, más un rol de super administrador que
-- gestiona la plataforma.
--
-- PUNTO CLAVE: el aislamiento vive en la base de datos, no en la app. El
-- negocio NUNCA lo manda el navegador: Postgres lo deduce del token de
-- sesión con mi_negocio(). Aunque alguien reescriba el JavaScript entero,
-- no puede pedir los datos de otro negocio.
--
-- DECISIÓN DE DISEÑO: el super admin NO tiene acceso a las filas de
-- ventas, clientes ni productos de sus clientes. Ve solo cifras agregadas
-- vía resumen_negocios(). Por eso las políticas de datos NO llevan un
-- "OR es_super_admin()": esa cláusula, repetida en cada tabla, sería un
-- punto único de fallo donde un error tumbaría todo el aislamiento.
--
-- ORDEN: esta migración va de ÚLTIMA. Antes deben estar corridas:
--   sesiones_caja.sql, ventas_user_id.sql,
--   sesiones_caja_detalle_arqueo.sql, ventas_fecha_timestamptz.sql,
--   ventas_anulacion.sql
--
-- ANTES DE CORRER: haz un backup (Supabase > Database > Backups).
-- Ejecutar completo, de una sola vez, en el SQL Editor de Supabase.
-- =====================================================================


-- =====================================================================
-- 1. Tabla de negocios (incluye la configuración del tiquete)
-- =====================================================================

create table if not exists public.negocios (
  id                bigserial primary key,
  nombre_comercial  text not null,
  nit               text,
  direccion         text,
  ciudad            text,
  telefono          text,
  logo_url          text,
  mensaje_pie       text not null default 'Gracias por su compra',
  mensaje_pie_2     text not null default 'Vuelva pronto',
  ancho_papel       text not null default '55mm'
                      check (ancho_papel in ('55mm', '80mm')),
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

-- Negocio inicial con los datos que hoy están escritos a mano en
-- SalesPage.jsx (líneas 319-322 y 450-453). Queda con id = 1.
insert into public.negocios (nombre_comercial, direccion, ciudad, telefono, logo_url)
select 'Fralu', 'Carrera 16 # 37-72', 'Local 202 - Tunja', '3212389832', '/Fralu.png'
where not exists (select 1 from public.negocios);


-- =====================================================================
-- 2. perfiles: negocio + rol de super admin
-- =====================================================================

alter table public.perfiles
  add column if not exists negocio_id bigint references public.negocios (id);

-- Se amplía el CHECK existente, que solo permitía vendedor/administrador
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('vendedor', 'administrador', 'super_admin'));

-- Crea el perfil de los usuarios de Auth que todavía no lo tengan.
-- Sin perfil, mi_negocio() devuelve null y el usuario no vería NADA,
-- así que este paso es obligatorio para no dejar a nadie afuera.
-- Se usa el email como username porque es único garantizado.
insert into public.perfiles (id, nombre, username, email_interno, rol, activo, negocio_id)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email,
       u.email,
       'administrador',
       true,
       1
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id);

update public.perfiles set negocio_id = 1
  where negocio_id is null and rol <> 'super_admin';

-- El super admin no pertenece a ningún negocio; los demás sí, siempre.
alter table public.perfiles drop constraint if exists perfiles_negocio_segun_rol;
alter table public.perfiles add constraint perfiles_negocio_segun_rol
  check (
    (rol = 'super_admin' and negocio_id is null)
    or (rol <> 'super_admin' and negocio_id is not null)
  );


-- =====================================================================
-- 3. Funciones de contexto
--
--    SECURITY DEFINER: necesario para leer perfiles sin quedar atrapadas
--    en la RLS de la propia tabla perfiles (recursión infinita).
--    search_path fijo: evita que alguien las engañe con una tabla falsa.
-- =====================================================================

create or replace function public.mi_negocio()
returns bigint language sql stable security definer set search_path = public as $$
  select negocio_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'super_admin' and activo
  )
$$;

revoke all on function public.mi_negocio()     from public;
revoke all on function public.mi_rol()         from public;
revoke all on function public.es_super_admin() from public;
grant execute on function public.mi_negocio()     to authenticated;
grant execute on function public.mi_rol()         to authenticated;
grant execute on function public.es_super_admin() to authenticated;


-- =====================================================================
-- 4. negocio_id en las tablas de datos
--
--    El DEFAULT mi_negocio() es lo que evita cambiar el código: los
--    insert existentes siguen igual y Postgres rellena el negocio solo.
--    El WITH CHECK de las políticas impide que se falsifique.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'productos', 'clientes', 'ventas', 'detalle_ventas',
    'pagos_venta', 'producto_historial', 'sesiones_caja'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists negocio_id bigint references public.negocios(id)', t);
    execute format(
      'update public.%I set negocio_id = 1 where negocio_id is null', t);
    execute format(
      'alter table public.%I alter column negocio_id set not null', t);
    execute format(
      'alter table public.%I alter column negocio_id set default public.mi_negocio()', t);
    execute format(
      'create index if not exists %I on public.%I (negocio_id)', t || '_negocio_idx', t);
  end loop;
end $$;


-- =====================================================================
-- 5. Políticas de datos: se reemplazan las permisivas (condición `true`)
--
--    Las políticas se SUMAN entre sí, así que dejar una vieja con `true`
--    anularía todo el aislamiento. Por eso se borran explícitamente.
-- =====================================================================

drop policy if exists "clientes_select"  on public.clientes;
drop policy if exists "clientes_insert"  on public.clientes;
drop policy if exists "clientes_update"  on public.clientes;
drop policy if exists "clientes_delete"  on public.clientes;

drop policy if exists "productos_select" on public.productos;
drop policy if exists "productos_insert" on public.productos;
drop policy if exists "productos_update" on public.productos;
drop policy if exists "productos_delete" on public.productos;
drop policy if exists "Allow public read access" on public.productos;

drop policy if exists "ventas_select"    on public.ventas;
drop policy if exists "ventas_insert"    on public.ventas;
drop policy if exists "ventas_update"    on public.ventas;
drop policy if exists "ventas_delete"    on public.ventas;

drop policy if exists "detalle_ventas_select" on public.detalle_ventas;
drop policy if exists "detalle_ventas_insert" on public.detalle_ventas;
drop policy if exists "detalle_ventas_update" on public.detalle_ventas;
drop policy if exists "detalle_ventas_delete" on public.detalle_ventas;

drop policy if exists "pagos_venta_select" on public.pagos_venta;
drop policy if exists "pagos_venta_insert" on public.pagos_venta;
drop policy if exists "pagos_venta_update" on public.pagos_venta;
drop policy if exists "pagos_venta_delete" on public.pagos_venta;

drop policy if exists "authenticated puede leer historial"     on public.producto_historial;
drop policy if exists "authenticated puede insertar historial" on public.producto_historial;

drop policy if exists "sesiones_caja_select_propias" on public.sesiones_caja;
drop policy if exists "sesiones_caja_insert_propias" on public.sesiones_caja;
drop policy if exists "sesiones_caja_update_propias" on public.sesiones_caja;

-- Mismo patrón en todas, para poder auditarlas de un vistazo
do $$
declare t text;
begin
  foreach t in array array[
    'productos', 'clientes', 'ventas', 'detalle_ventas', 'pagos_venta'
  ]
  loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (negocio_id = public.mi_negocio())$f$, t || '_sel', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (negocio_id = public.mi_negocio())$f$, t || '_ins', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (negocio_id = public.mi_negocio())
        with check (negocio_id = public.mi_negocio())$f$, t || '_upd', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (negocio_id = public.mi_negocio())$f$, t || '_del', t);
  end loop;
end $$;

-- producto_historial: solo insertar y leer. Sin update ni delete, para que
-- el registro de auditoría no se pueda alterar (así ya estaba, se conserva).
create policy producto_historial_sel on public.producto_historial
  for select to authenticated using (negocio_id = public.mi_negocio());
create policy producto_historial_ins on public.producto_historial
  for insert to authenticated with check (negocio_id = public.mi_negocio());

-- sesiones_caja: además del negocio, cada quien solo ve su propia caja.
-- Se agrega `to authenticated`, que faltaba en la versión anterior.
create policy sesiones_caja_sel on public.sesiones_caja
  for select to authenticated
  using (negocio_id = public.mi_negocio() and auth.uid() = user_id);
create policy sesiones_caja_ins on public.sesiones_caja
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and auth.uid() = user_id);
create policy sesiones_caja_upd on public.sesiones_caja
  for update to authenticated
  using (negocio_id = public.mi_negocio() and auth.uid() = user_id)
  with check (negocio_id = public.mi_negocio() and auth.uid() = user_id);


-- =====================================================================
-- 6. Políticas de negocios y perfiles
--
--    perfiles hoy tiene RLS activo y CERO políticas, o sea que está
--    bloqueada por completo. Aquí se le abre lo justo.
-- =====================================================================

alter table public.negocios enable row level security;

-- Cada quien ve su negocio; el super admin ve y crea todos
create policy negocios_sel on public.negocios
  for select to authenticated
  using (id = public.mi_negocio() or public.es_super_admin());
create policy negocios_ins on public.negocios
  for insert to authenticated
  with check (public.es_super_admin());
create policy negocios_upd on public.negocios
  for update to authenticated
  using (
    (id = public.mi_negocio() and public.mi_rol() = 'administrador')
    or public.es_super_admin()
  )
  with check (id = public.mi_negocio() or public.es_super_admin());

-- Perfiles: propio, los del negocio si eres administrador, todos si eres super admin
create policy perfiles_sel_propio on public.perfiles
  for select to authenticated using (id = auth.uid());
create policy perfiles_sel_negocio on public.perfiles
  for select to authenticated
  using (negocio_id = public.mi_negocio() and public.mi_rol() = 'administrador');
create policy perfiles_sel_super on public.perfiles
  for select to authenticated using (public.es_super_admin());

-- El super admin asigna negocio y rol a los usuarios creados en el dashboard
create policy perfiles_ins_super on public.perfiles
  for insert to authenticated with check (public.es_super_admin());
create policy perfiles_upd_super on public.perfiles
  for update to authenticated
  using (public.es_super_admin()) with check (public.es_super_admin());
create policy perfiles_upd_admin on public.perfiles
  for update to authenticated
  using (negocio_id = public.mi_negocio() and public.mi_rol() = 'administrador')
  with check (negocio_id = public.mi_negocio());


-- =====================================================================
-- 7. Panel del super admin: solo cifras agregadas
--
--    SECURITY DEFINER para poder contar sobre tablas que el super admin
--    no puede leer fila por fila. El `where es_super_admin()` de adentro
--    es lo que impide que cualquier otro usuario la invoque y obtenga
--    datos de la competencia: sin ese filtro, la función sería un hueco.
-- =====================================================================

create or replace function public.resumen_negocios()
returns table (
  negocio_id       bigint,
  nombre_comercial text,
  activo           boolean,
  usuarios         int,
  productos        int,
  ventas           bigint,
  monto_vendido    numeric,
  ultima_venta     timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.nombre_comercial, n.activo,
    (select count(*)::int from public.perfiles p  where p.negocio_id = n.id),
    (select count(*)::int from public.productos pr where pr.negocio_id = n.id),
    (select count(*)      from public.ventas v where v.negocio_id = n.id and v.anulada_en is null),
    (select coalesce(sum(v.total), 0) from public.ventas v where v.negocio_id = n.id and v.anulada_en is null),
    (select max(v.fecha)  from public.ventas v where v.negocio_id = n.id and v.anulada_en is null)
  from public.negocios n
  where public.es_super_admin()
  order by n.nombre_comercial
$$;

revoke all on function public.resumen_negocios() from public;
grant execute on function public.resumen_negocios() to authenticated;


-- =====================================================================
-- 8. Verificación — debería devolver tus datos, no cero
-- =====================================================================

select 'mi_negocio()' as chequeo, public.mi_negocio()::text as resultado
union all
select 'mi_rol()',           public.mi_rol()
union all
select 'productos visibles', count(*)::text from public.productos
union all
select 'ventas visibles',    count(*)::text from public.ventas
union all
select 'perfiles creados',   count(*)::text from public.perfiles;
