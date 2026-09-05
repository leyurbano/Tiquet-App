-- =====================================================================
-- Guarda el detalle del arqueo por medio de pago.
--
-- Antes solo se registraba el efectivo contado. Ahora el cierre también
-- valida transferencias, tarjetas y cualquier otro medio contra lo que
-- realmente llegó, así que hay que guardar esperado/verificado por medio.
--
-- Se usa jsonb en vez de una tabla hija porque es una foto del cierre:
-- se escribe una sola vez, junto con el resto del cierre, en la misma
-- operación atómica. Con una tabla aparte un fallo parcial podría dejar
-- la sesión cerrada pero el detalle a medias.
--
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- =====================================================================

alter table public.sesiones_caja
  add column if not exists detalle_arqueo jsonb;
