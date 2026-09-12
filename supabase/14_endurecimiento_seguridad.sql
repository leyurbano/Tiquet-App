-- =====================================================================
-- Endurecimiento de seguridad (hallazgos de la auditoría QA)
--
--  1. Escalada a super admin: un administrador de negocio podía ponerse
--     es_super_admin = true desde la consola del navegador, porque la
--     política de perfiles filtraba filas pero no columnas.
--  2. Vendedores podían modificar o borrar pagos_venta y detalle_ventas:
--     cobrar en efectivo, cambiar el pago a "Transferencia" y quedarse con
--     el billete sin que el arqueo lo detectara.
--  3. Un cajero podía reescribir su cierre de caja después de cerrado.
--  5. No había forma de suspender un negocio cliente.
--
-- Además:
--  - La regla de "venta recién creada" dependía del reloj del navegador
--    (ventas.fecha). Ahora usa ventas.creado_en, que pone el servidor.
--  - Un administrador de negocio no puede tocar el perfil de un super admin
--    (antes podía desactivar al dueño de la plataforma y dejarlo fuera).
--
-- CONTEXTO DE SERVIDOR: los triggers dejan pasar los cambios cuando
-- auth.uid() es null, es decir, desde el SQL Editor o desde la service
-- role de una Edge Function. Es seguro porque el rol anónimo del navegador
-- no tiene ninguna política de UPDATE sobre estas tablas.
--
-- Ejecutar DESPUÉS de 13_costo_en_venta.sql
-- =====================================================================


-- =====================================================================
-- 1. Perfiles: columnas que solo el super admin puede tocar
-- =====================================================================

create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;

  -- Nadie más que un super admin modifica a un super admin
  if old.es_super_admin then
    raise exception 'Solo un super administrador puede modificar el perfil de otro super administrador';
  end if;

  if new.es_super_admin is distinct from old.es_super_admin
     or new.negocio_id   is distinct from old.negocio_id
     or new.id           is distinct from old.id
     or new.username     is distinct from old.username
     or new.email_interno is distinct from old.email_interno then
    raise exception 'No tienes permiso para modificar ese dato del perfil';
  end if;

  return new;
end $$;

drop trigger if exists proteger_perfil on public.perfiles;
create trigger proteger_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();


-- =====================================================================
-- 5. Suspensión de negocios
-- =====================================================================

-- mi_negocio() ahora exige que el negocio esté activo. Suspender un
-- negocio deja a todos sus usuarios sin acceso a los datos de una vez.
create or replace function public.mi_negocio()
returns bigint language sql stable security definer set search_path = public as $$
  select p.negocio_id
  from public.perfiles p
  join public.negocios n on n.id = p.negocio_id
  where p.id = auth.uid() and p.activo and n.activo
$$;

-- Solo el super admin activa o suspende un negocio
create or replace function public.proteger_negocio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;

  if new.activo is distinct from old.activo or new.id is distinct from old.id then
    raise exception 'Solo el administrador de la plataforma puede activar o suspender un negocio';
  end if;

  return new;
end $$;

drop trigger if exists proteger_negocio on public.negocios;
create trigger proteger_negocio
  before update on public.negocios
  for each row execute function public.proteger_negocio();

-- Le dice a la app POR QUÉ un usuario no ve datos, en lugar de mostrarle
-- una pantalla vacía. SECURITY DEFINER porque un usuario de un negocio
-- suspendido ya no puede leer la fila de su negocio por RLS.
create or replace function public.estado_mi_cuenta()
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.id is null          then 'sin_perfil'
    when not p.activo          then 'usuario_inactivo'
    when p.negocio_id is null  then 'sin_negocio'
    when not n.activo          then 'negocio_suspendido'
    else 'activo'
  end
  from (select auth.uid() as uid) u
  left join public.perfiles p on p.id = u.uid
  left join public.negocios n on n.id = p.negocio_id
$$;

revoke all on function public.estado_mi_cuenta() from public;
grant execute on function public.estado_mi_cuenta() to authenticated;


-- =====================================================================
-- Hora de creación puesta por el servidor
--
-- Se agrega SIN valor para las filas existentes (quedan en null) y con
-- default now() solo para las nuevas. Si se agregara con default desde
-- el principio, todas las ventas históricas parecerían "recién creadas"
-- durante 10 minutos y se abriría una ventana para modificarlas.
-- =====================================================================

alter table public.ventas add column if not exists creado_en timestamptz;
alter table public.ventas alter column creado_en set default now();

-- ¿Se le pueden agregar líneas o pagos a esta venta? Solo si es del
-- negocio, no está anulada, y la registró este usuario hace menos de
-- 10 minutos (el flujo normal de venta), o si quien lo hace es admin.
create or replace function public.puede_agregar_a_venta(p_venta_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ventas v
    where v.id = p_venta_id
      and v.negocio_id = public.mi_negocio()
      and v.anulada_en is null
      and (
        public.es_administrador()
        or (v.user_id = auth.uid() and v.creado_en > now() - interval '10 minutes')
      )
  )
$$;

revoke all on function public.puede_agregar_a_venta(bigint) from public;
grant execute on function public.puede_agregar_a_venta(bigint) to authenticated;

-- El rollback de createSale ahora compara contra la hora del servidor
drop policy if exists ventas_del on public.ventas;
create policy ventas_del on public.ventas
  for delete to authenticated
  using (
    negocio_id = public.mi_negocio()
    and anulada_en is null
    and user_id = auth.uid()
    and creado_en > now() - interval '10 minutes'
  );


-- =====================================================================
-- 2. detalle_ventas y pagos_venta
--
--    Leer: todo el negocio. Insertar: solo sobre una venta recién creada
--    por el mismo usuario (o admin). Modificar y borrar: solo admin.
--
--    El borrado en cascada al hacer rollback de una venta no se ve
--    afectado: las acciones de llaves foráneas no pasan por la RLS.
-- =====================================================================

drop policy if exists detalle_ventas_ins on public.detalle_ventas;
drop policy if exists detalle_ventas_upd on public.detalle_ventas;
drop policy if exists detalle_ventas_del on public.detalle_ventas;

create policy detalle_ventas_ins on public.detalle_ventas
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.puede_agregar_a_venta(venta_id));
create policy detalle_ventas_upd on public.detalle_ventas
  for update to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador())
  with check (negocio_id = public.mi_negocio());
create policy detalle_ventas_del on public.detalle_ventas
  for delete to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());

drop policy if exists pagos_venta_ins on public.pagos_venta;
drop policy if exists pagos_venta_upd on public.pagos_venta;
drop policy if exists pagos_venta_del on public.pagos_venta;

create policy pagos_venta_ins on public.pagos_venta
  for insert to authenticated
  with check (negocio_id = public.mi_negocio() and public.puede_agregar_a_venta(venta_id));
create policy pagos_venta_upd on public.pagos_venta
  for update to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador())
  with check (negocio_id = public.mi_negocio());
create policy pagos_venta_del on public.pagos_venta
  for delete to authenticated
  using (negocio_id = public.mi_negocio() and public.es_administrador());


-- =====================================================================
-- 3. Una caja cerrada no se modifica, y la base no se toca a mitad de turno
-- =====================================================================

drop policy if exists sesiones_caja_upd on public.sesiones_caja;
create policy sesiones_caja_upd on public.sesiones_caja
  for update to authenticated
  using (negocio_id = public.mi_negocio() and auth.uid() = user_id and cerrada_en is null)
  with check (negocio_id = public.mi_negocio() and auth.uid() = user_id);

-- Defensa en profundidad: aunque cambie una política, el trigger sigue
-- impidiendo reescribir un cierre o inflar la base para tapar un faltante
create or replace function public.proteger_sesion_caja()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.cerrada_en is not null then
    raise exception 'Una caja cerrada no se puede modificar';
  end if;

  if new.base_inicial is distinct from old.base_inicial
     or new.abierta_en is distinct from old.abierta_en
     or new.user_id    is distinct from old.user_id
     or new.negocio_id is distinct from old.negocio_id then
    raise exception 'La base y los datos de apertura de la caja no se pueden modificar';
  end if;

  return new;
end $$;

drop trigger if exists proteger_sesion_caja on public.sesiones_caja;
create trigger proteger_sesion_caja
  before update on public.sesiones_caja
  for each row execute function public.proteger_sesion_caja();


-- =====================================================================
-- El trigger de productos de la migración 11 bloqueaba también los
-- cambios hechos desde el SQL Editor (ahí auth.uid() es null y
-- es_administrador() da false). Se le agrega la misma excepción.
-- =====================================================================

create or replace function public.proteger_campos_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.es_administrador() then
    return new;
  end if;

  if new.descripcion   is distinct from old.descripcion
     or new.costo         is distinct from old.costo
     or new.precio_venta  is distinct from old.precio_venta
     or new.stock_minimo  is distinct from old.stock_minimo then
    raise exception 'Solo un administrador puede modificar la descripción, el costo, el precio de venta o el stock mínimo';
  end if;

  return new;
end $$;


-- =====================================================================
-- Verificación: todas deben decir 1
-- =====================================================================
select 'trigger proteger_perfil' as chequeo,
       (select count(*)::text from pg_trigger where tgname = 'proteger_perfil') as resultado
union all
select 'trigger proteger_negocio',
       (select count(*)::text from pg_trigger where tgname = 'proteger_negocio')
union all
select 'trigger proteger_sesion_caja',
       (select count(*)::text from pg_trigger where tgname = 'proteger_sesion_caja')
union all
select 'ventas.creado_en',
       (select count(*)::text from information_schema.columns
        where table_name = 'ventas' and column_name = 'creado_en')
union all
select 'funcion estado_mi_cuenta',
       (select count(*)::text from pg_proc where proname = 'estado_mi_cuenta');
