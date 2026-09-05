-- =====================================================================
-- Anulación de ventas (soft delete)
--
-- EL PROBLEMA
-- Hasta ahora "eliminar" una venta borraba físicamente las filas de
-- detalle_ventas y ventas. La venta desaparecía sin dejar rastro del
-- dinero: ni monto, ni medio de pago, ni quién la anuló, ni por qué.
-- En el cierre de caja eso es un punto ciego: quien registre una venta
-- en efectivo, se quede el billete y borre la venta, deja el arqueo
-- cuadrando perfecto.
--
-- LA SOLUCIÓN
-- La venta ya no se borra: se marca como anulada. El stock se devuelve
-- igual que antes, pero la fila permanece y puede auditarse.
--
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- =====================================================================

alter table public.ventas
  add column if not exists anulada_en       timestamptz,
  add column if not exists anulada_por      uuid references auth.users (id) on delete set null,
  add column if not exists motivo_anulacion text;

-- Lista fija de motivos. Se usa un CHECK en vez de una tabla aparte porque
-- son pocos, estables y no necesitan join: así los reportes agrupan directo
-- por el código sin consultar otra tabla.
alter table public.ventas
  drop constraint if exists ventas_motivo_anulacion_valido;

alter table public.ventas
  add constraint ventas_motivo_anulacion_valido
  check (
    motivo_anulacion is null
    or motivo_anulacion in (
      'devolucion',
      'error_digitacion',
      'cliente_desistio',
      'venta_prueba',
      'otro'
    )
  );

-- Una venta anulada debe tener siempre fecha y motivo: evita anulaciones
-- a medias que después nadie pueda explicar.
alter table public.ventas
  drop constraint if exists ventas_anulacion_completa;

alter table public.ventas
  add constraint ventas_anulacion_completa
  check (
    (anulada_en is null and motivo_anulacion is null)
    or (anulada_en is not null and motivo_anulacion is not null)
  );

-- Las consultas de dinero filtran por anulada_en is null constantemente
create index if not exists ventas_activas_fecha_idx
  on public.ventas (fecha desc)
  where anulada_en is null;
