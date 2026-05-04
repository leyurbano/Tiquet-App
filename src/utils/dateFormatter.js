import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const COLOMBIA_TZ = 'America/Bogota'

/**
  Obtiene la fecha/hora actual en Colombia como ISO string con offset correcto.

  ANTES: dayjs().tz(COLOMBIA_TZ).toISOString()
    → .toISOString() SIEMPRE convierte a UTC puro ("Z"), ignorando la timezone.
    → A las 11 PM Colombia devuelve el día siguiente en UTC.

  AHORA: .format() con offset explícito mantiene la hora colombiana real.
    → Supabase lo recibe, lo almacena y lo filtra con el día correcto.
 */
export const getNowColombia = () => {
  return dayjs().tz(COLOMBIA_TZ).format('YYYY-MM-DDTHH:mm:ssZ')
}

/**
 * Obtiene solo la fecha de hoy en Colombia (YYYY-MM-DD).
 * Úsala para inicializar selectedDate y cualquier filtro por fecha.
 */
export const getTodayColombia = () => {
  return dayjs().tz(COLOMBIA_TZ).format('YYYY-MM-DD')
}

/**
 * Convierte cualquier fecha (ISO UTC o con offset) a formato legible en Colombia.
 * Úsala en todos los lugares donde muestres fechas al usuario.
 */
export const formatToColombia = (date) => {
  if (!date) return 'N/A'
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/MM/YYYY, h:mm:ss A')
}

/*
  Convierte una fecha a formato corto para tablas.
 */
export const formatToColombiaShort = (date) => {
  if (!date) return 'N/A'
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/MM/YYYY HH:mm:ss')
}