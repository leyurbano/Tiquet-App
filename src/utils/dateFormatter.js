import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const COLOMBIA_TZ = 'America/Bogota'

/**
 * Obtiene la fecha/hora actual en Colombia como ISO string correcto
 */
export const getNowColombia = () => {
  // toISOString() convierte correctamente la hora colombiana a UTC real
  return dayjs().tz(COLOMBIA_TZ).toISOString()
}

/**
 * Convierte una fecha a formato legible en hora de Colombia
 */
export const formatToColombia = (date) => {
  if (!date) return 'N/A'
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/MM/YYYY, h:mm:ss A')
}

/**
 * Convierte una fecha a formato corto de tabla
 */
export const formatToColombiaShort = (date) => {
  if (!date) return 'N/A'
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/MM/YYYY HH:mm:ss')
}