-- =====================================================================
-- Agrega el usuario que registró cada venta.
--
-- Sin esta columna no hay forma de saber quién vendió, y el arqueo de caja
-- solo puede acotar por rango de tiempo: si dos cajeros operan a la vez,
-- cada uno cuadraría contra las ventas de ambos.
--
-- Se deja NULLABLE a propósito: las ventas que ya existen no tienen autor
-- conocido y no se pueden inventar. El código trata user_id null como
-- "venta antigua" y la sigue incluyendo en el arqueo.
--
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- =====================================================================

alter table public.ventas
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists ventas_user_fecha_idx
  on public.ventas (user_id, fecha desc);
