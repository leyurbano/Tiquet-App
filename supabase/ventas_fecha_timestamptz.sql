-- =====================================================================
-- Convierte ventas.fecha de `timestamp` a `timestamptz`.
--
-- EL PROBLEMA
-- ventas.fecha guardaba la hora local de Colombia SIN zona horaria
-- ("2026-09-04 23:07:01"), mientras que sesiones_caja.abierta_en es
-- timestamptz y guarda el instante en UTC ("2026-09-05 03:30:57+00").
-- Comparar ambas desfasa 5 horas: el arqueo del turno no encontraba
-- ventas que sí existían.
--
-- LA CONVERSIÓN
-- `fecha at time zone 'America/Bogota'` le dice a Postgres: "este valor
-- ingenuo representa hora de Bogotá, conviértelo al instante real". Es
-- correcto para los datos existentes porque getNowColombia() siempre
-- escribió hora colombiana.
--
-- EFECTO SECUNDARIO (deseable): también corrige el filtro por día. Con la
-- columna ingenua, las ventas hechas entre medianoche y las 5 AM aparecían
-- en el día anterior, porque getAllSales compara contra límites en UTC.
--
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- =====================================================================

alter table public.ventas
  alter column fecha type timestamptz
  using fecha at time zone 'America/Bogota';
