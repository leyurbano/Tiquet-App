import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

// SIEMPRE usar zona horaria de Colombia
const COLOMBIA_TZ = 'America/Bogota'

/**
 * Obtiene la fecha/hora actual en Colombia como ISO string
 * @returns {string} ISO string con hora correcta de Colombia
 */
export const getNowColombia = () => {
  // Obtener hora actual en Colombia y convertir a ISO
  const now = dayjs().tz(COLOMBIA_TZ)
  // Crear un objeto Date con la hora local de Colombia interpretándola como UTC
  const year = now.year()
  const month = now.month()
  const date = now.date()
  const hour = now.hour()
  const minute = now.minute()
  const second = now.second()
  
  // Crear fecha UTC con los valores de Colombia
  const dateObj = new Date(Date.UTC(year, month, date, hour, minute, second))
  return dateObj.toISOString()
}

/**
 * Convierte una fecha a formato legible en hora de Colombia
 * @param {string|Date} date - Fecha en cualquier formato
 * @returns {string} Fecha formateada
 */
export const formatToColombia = (date) => {
  if (!date) return 'N/A'
  
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/M/YYYY, h:mm:ss A')
}

/**
 * Convierte una fecha a formato de tabla
 * @param {string|Date} date - Fecha en cualquier formato
 * @returns {string} Fecha en formato corto
 */
export const formatToColombiaShort = (date) => {
  if (!date) return 'N/A'
  
  return dayjs(date)
    .tz(COLOMBIA_TZ)
    .format('DD/MM/YYYY HH:mm:ss')
}
