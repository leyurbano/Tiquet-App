import { supabase } from './supabaseClient'

export const devolucionService = {
  /**
   * Registra una devolución parcial en UNA transacción, mediante la función
   * registrar_devolucion de la base de datos.
   *
   * La base de datos calcula el monto con el precio de la venta, impide
   * devolver más de lo vendido, devuelve el stock y aplica los límites de
   * los vendedores. La venta original no se modifica.
   *
   * items: [{ detalle_venta_id, cantidad, reintegra }]
   * Devuelve { devolucion } o { error } con el motivo legible.
   */
  async registrarDevolucion({ ventaId, items, motivo, medioPagoId, nota }) {
    try {
      const { data, error } = await supabase.rpc('registrar_devolucion', {
        p_venta_id: ventaId,
        p_items: items,
        p_motivo: motivo,
        p_medio_pago_id: medioPagoId,
        p_nota: nota?.trim() || null
      })

      if (error) throw error
      return { devolucion: data }
    } catch (error) {
      console.error('Error registrando la devolución:', error.message || error)
      return { error: error.message || 'Error desconocido' }
    }
  },

  /**
   * Unidades ya devueltas de cada línea de una venta:
   * { [detalle_venta_id]: cantidad }. null si la consulta falló.
   *
   * 🔧 Antes leía detalle_devoluciones directamente, que incluye el costo
   * congelado de la venta. Esa tabla pasó a ser solo de administradores
   * (migración 27) y esta función devuelve únicamente cantidades.
   */
  async getDevueltoPorLinea(ventaId) {
    try {
      const { data, error } = await supabase.rpc('devuelto_por_linea', { p_venta_id: ventaId })

      if (error) throw error
      return (data || []).reduce((acc, d) => {
        acc[d.detalle_venta_id] = (acc[d.detalle_venta_id] || 0) + (Number(d.cantidad) || 0)
        return acc
      }, {})
    } catch (error) {
      console.error('Error leyendo lo ya devuelto:', error.message || error)
      return null
    }
  },

  /**
   * Devoluciones registradas desde una caja: el cierre de ese turno resta
   * del efectivo esperado las que se pagaron en efectivo.
   * null (no []) si la consulta falló, igual que las ventas del turno.
   */
  async getDevolucionesDeSesion(sesionId) {
    try {
      const { data, error } = await supabase
        .from('devoluciones')
        .select('id, venta_id, fecha, total, motivo, medio_pago_id, medios_pago ( pago )')
        .eq('sesion_caja_id', sesionId)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error leyendo las devoluciones del turno:', error.message || error)
      return null
    }
  },

  /** Devoluciones de un período, con sus líneas, para los reportes. */
  async getDevolucionesPeriodo(inicioISO, finISO) {
    try {
      const { data, error } = await supabase
        .from('devoluciones')
        .select(`
          id, venta_id, fecha, total, motivo, user_id,
          medios_pago ( pago ),
          detalle_devoluciones ( producto_id, cantidad, precio, costo_unitario, reintegra, productos ( descripcion ) )
        `)
        .gte('fecha', inicioISO)
        .lte('fecha', finISO)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error leyendo las devoluciones:', error.message || error)
      return null
    }
  }
}
