import { supabase } from './supabaseClient'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const COLOMBIA_TZ = 'America/Bogota'

export const salesService = {
  // Obtener ventas por fecha específica (por defecto hoy)
  async getAllSales(filterByToday = false, fecha = null) {
    try {
      let query = supabase
        .from('ventas')
        .select(`
          *,
          detalle_ventas (
            *,
            productos (*)
          ),
          pagos_venta (
            *,
            medios_pago (*)
          )
        `) // 🔧 CAMBIO: se agregó pagos_venta con su join a medios_pago,
           // así cada venta trae de una vez con qué medio(s) se pagó
        .is('anulada_en', null) // 🆕 las anuladas no suman dinero

      if (fecha) {
        const start = dayjs.tz(`${fecha} 00:00:00`, COLOMBIA_TZ).toISOString()
        const end   = dayjs.tz(`${fecha} 23:59:59`, COLOMBIA_TZ).toISOString()
        query = query.gte('fecha', start).lte('fecha', end)

      } else if (filterByToday) {
        const today = dayjs().tz(COLOMBIA_TZ).format('YYYY-MM-DD')
        const start = dayjs.tz(`${today} 00:00:00`, COLOMBIA_TZ).toISOString()
        const end   = dayjs.tz(`${today} 23:59:59`, COLOMBIA_TZ).toISOString()
        query = query.gte('fecha', start).lte('fecha', end)
      }

      const { data, error } = await query.order('id', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching sales:', error)
      return []
    }
  },

  /**
   * Obtiene las ventas entre dos instantes exactos (ISO con offset).
   * A diferencia de getAllSales, que filtra por día calendario, esta sirve
   * para el arqueo de un turno: puede empezar a las 8 AM y cerrar a las 9 PM,
   * o incluso cruzar la medianoche sin partir el conteo en dos días.
   */
  async getSalesBetween(startISO, endISO = null, userId = null) {
    try {
      let query = supabase
        .from('ventas')
        .select(`
          *,
          pagos_venta (
            *,
            medios_pago (*)
          )
        `)
        .is('anulada_en', null) // 🆕 las anuladas no entran en el arqueo
        .gte('fecha', startISO)

      if (endISO) query = query.lte('fecha', endISO)

      // Al acotar por cajero se incluyen también las ventas con user_id null:
      // son las registradas antes de que existiera la columna, y excluirlas
      // dejaría dinero real fuera del arqueo.
      if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`)

      const { data, error } = await query.order('id', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      // Devuelve null (no []) a propósito: quien llama debe poder distinguir
      // "no hubo ventas" de "no se pudieron leer las ventas". En un arqueo,
      // mostrar cero por un fallo de consulta llevaría a cerrar caja con
      // dinero real sin contar.
      console.error('Error fetching sales by range:', error.message || error)
      return null
    }
  },

  /**
   * Ventas de un rango de días (hora Colombia) con su detalle, para reportes.
   * Incluye costo_unitario y el producto, que es lo que permite calcular el
   * margen sin consultar productos aparte.
   */
  async getSalesForReport(desde, hasta) {
    try {
      const inicio = dayjs.tz(`${desde} 00:00:00`, COLOMBIA_TZ).toISOString()
      const fin    = dayjs.tz(`${hasta} 23:59:59`, COLOMBIA_TZ).toISOString()

      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, fecha, total, medio_pago_id,
          clientes ( nombre, documento ),
          detalle_ventas ( producto_id, cantidad, precio, costo_unitario, productos ( descripcion ) ),
          pagos_venta ( monto, medios_pago ( pago ) )
        `)
        .is('anulada_en', null)
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching report sales:', error.message || error)
      return null
    }
  },

  // Obtener venta por ID
  async getSaleById(id) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          *,
          detalle_ventas (
            *,
            productos (*)
          ),
          pagos_venta (
            *,
            medios_pago (*)
          )
        `) // 🔧 CAMBIO: mismo join agregado aquí, por consistencia con getAllSales
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching sale:', error)
      return null
    }
  },

  /**
   * Registra una venta completa —venta, pagos y productos— en UNA sola
   * transacción, mediante la función registrar_venta de la base de datos.
   *
   * 🔧 Antes eran pasos sueltos desde el navegador (crear venta, luego
   * pagos, luego cada producto) sin revisar si cada uno funcionaba: un fallo
   * a mitad dejaba una venta con total pero sin productos, sin descontar
   * stock, y la pantalla decía que se había registrado bien.
   *
   * Ahora la base de datos calcula el total, valida que los pagos cuadren,
   * revisa el stock y congela el costo. Si algo falla, no queda nada.
   *
   * Devuelve { venta } o { error } con el motivo legible.
   */
  async registrarVenta({ cliente_id, medio_pago_id, items, pagos }) {
    try {
      const { data, error } = await supabase.rpc('registrar_venta', {
        p_cliente_id: cliente_id ?? null,
        p_medio_pago_id: medio_pago_id ?? null,
        p_items: (items || []).map((i) => ({
          producto_id: i.producto_id,
          cantidad: Number(i.cantidad),
          precio: Number(i.precio)
        })),
        p_pagos: (pagos || []).map((pg) => ({
          medio_pago_id: pg.medio_pago_id,
          monto: Number(pg.monto)
        }))
      })

      if (error) throw error
      return { venta: data }
    } catch (error) {
      console.error('Error registrando la venta:', error.message || error)
      return { error: error.message || 'Error desconocido' }
    }
  },

  // 🆕 NUEVO: trae los medios de pago disponibles (excluye "Sin definir")
  // Se usa en SalesForm.jsx para generar los botones dinámicamente
  async getMediosPago() {
    try {
      const { data, error } = await supabase
        .from('medios_pago')
        .select('*') // incluye es_fiado (migración 26) cuando existe
        .neq('id', 3)
        .order('id', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching medios de pago:', error)
      return []
    }
  },

  /**
   * Anula una venta y devuelve el stock, en UNA transacción, mediante la
   * función anular_venta de la base de datos.
   *
   * 🔧 Antes leía el stock, sumaba y escribía desde el navegador: una venta
   * que entrara en medio perdía su descuento, y un fallo a mitad seguido de
   * un reintento devolvía el stock dos veces. Ahora el incremento es atómico
   * y la venta queda bloqueada mientras se anula.
   */
  async annulSale(saleId, motivo) {
    try {
      const { data, error } = await supabase.rpc('anular_venta', {
        p_venta_id: saleId,
        p_motivo: motivo
      })

      if (error) throw error
      return { success: true, itemsRestored: data?.itemsRestored ?? 0 }
    } catch (error) {
      console.error('Error anulando la venta:', error.message || error)
      return { success: false, error: error.message }
    }
  },

  // Ventas anuladas en un rango, para el control del turno y los reportes
  async getAnnulledSales(startISO, endISO = null) {
    try {
      let query = supabase
        .from('ventas')
        .select('*')
        .not('anulada_en', 'is', null)
        .gte('anulada_en', startISO)

      if (endISO) query = query.lte('anulada_en', endISO)

      const { data, error } = await query.order('anulada_en', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching annulled sales:', error.message || error)
      return []
    }
  },
}
