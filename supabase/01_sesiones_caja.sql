-- =====================================================================
-- Tabla: sesiones_caja
-- Registra la apertura y el cierre de caja de cada turno de trabajo.
-- Una sesión se abre al iniciar sesión (ingresando la base) y se cierra
-- al cerrar sesión (contando el efectivo).
--
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- =====================================================================

create table if not exists public.sesiones_caja (
  id                bigserial primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,

  abierta_en        timestamptz not null default now(),
  cerrada_en        timestamptz,

  -- Dinero con el que arranca la caja
  base_inicial      numeric(12, 2) not null default 0,

  -- Datos capturados al cerrar el turno
  efectivo_contado  numeric(12, 2),
  efectivo_ventas   numeric(12, 2),
  total_vendido     numeric(12, 2),
  cantidad_ventas   integer,
  diferencia        numeric(12, 2),

  -- Queda en true si el usuario cerró sesión sin completar el arqueo
  arqueo_omitido    boolean not null default false
);

-- Una sesión está "abierta" mientras cerrada_en sea null.
-- Este índice evita que un mismo usuario tenga dos cajas abiertas a la vez.
create unique index if not exists sesiones_caja_una_abierta_por_usuario
  on public.sesiones_caja (user_id)
  where cerrada_en is null;

create index if not exists sesiones_caja_user_abierta_idx
  on public.sesiones_caja (user_id, abierta_en desc);

-- =====================================================================
-- Row Level Security: cada usuario solo ve y modifica sus propias cajas
-- =====================================================================
alter table public.sesiones_caja enable row level security;

drop policy if exists "sesiones_caja_select_propias" on public.sesiones_caja;
create policy "sesiones_caja_select_propias"
  on public.sesiones_caja for select
  using (auth.uid() = user_id);

drop policy if exists "sesiones_caja_insert_propias" on public.sesiones_caja;
create policy "sesiones_caja_insert_propias"
  on public.sesiones_caja for insert
  with check (auth.uid() = user_id);

drop policy if exists "sesiones_caja_update_propias" on public.sesiones_caja;
create policy "sesiones_caja_update_propias"
  on public.sesiones_caja for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
