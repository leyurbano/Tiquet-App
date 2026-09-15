import { supabase } from './supabaseClient'

// La migración 26 todavía no se ha corrido: la función o la tabla no existe.
// En ese caso el fiado se trata como "no instalado", no como un error que
// bloquee pantallas como el cierre de caja.
const noInstalado = (error) =>
  ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)

export const fiadoService = {
  /**
   * Saldo de fiado de cada cliente con movimientos:
   * { [cliente_id]: { cliente_id, fiado, devuelto, abonado, saldo } }.
   * null si el fiado no está instalado o la consulta falló.
   */
  async getSaldos() {
    try {
      const { data, error } = await supabase.rpc('saldos_fiado')
      if (error) throw error
      return (data || []).reduce((acc, fila) => {
        acc[fila.cliente_id] = { ...fila, saldo: Number(fila.saldo) || 0 }
        return acc
      }, {})
    } catch (error) {
      if (!noInstalado(error)) console.error('Error leyendo saldos de fiado:', error.message || error)
      return null
    }
  },

  /** Lo que debe hoy un cliente. null si la consulta falló. */
  async getSaldo(clienteId) {
    try {
      const { data, error } = await supabase.rpc('saldo_fiado', { p_cliente_id: clienteId })
      if (error) throw error
      return Number(data) || 0
    } catch (error) {
      if (!noInstalado(error)) console.error('Error leyendo el saldo del cliente:', error.message || error)
      return null
    }
  },

  /**
   * Registra un abono en UNA transacción (registrar_abono). La base de
   * datos impide abonar más de lo que debe y exige la caja abierta.
   * Devuelve { abono } (con el saldo que queda) o { error }.
   */
  async registrarAbono({ clienteId, monto, medioPagoId, nota }) {
    try {
      const { data, error } = await supabase.rpc('registrar_abono', {
        p_cliente_id: clienteId,
        p_monto: monto,
        p_medio_pago_id: medioPagoId,
        p_nota: nota?.trim() || null
      })
      if (error) throw error
      return { abono: data }
    } catch (error) {
      console.error('Error registrando el abono:', error.message || error)
      return { error: error.message || 'Error desconocido' }
    }
  },

  /**
   * Movimientos de fiado de un cliente, del más reciente al más antiguo,
   * con el saldo después de cada uno. null si la consulta falló.
   *
   * Cada movimiento: { clave, tipo: 'venta'|'devolucion'|'abono', id,
   * ventaId, fecha, cargo, abono, total, medio, nota, saldo }
   */
  async getMovimientos(clienteId) {
    try {
      const [ventas, devoluciones, abonos] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, fecha, total, pagos_venta ( monto, medios_pago ( es_fiado ) )')
          .eq('cliente_id', clienteId)
          .is('anulada_en', null),
        supabase
          .from('devoluciones')
          .select('id, fecha, total, venta_id, medios_pago ( es_fiado ), ventas!inner ( cliente_id )')
          .eq('ventas.cliente_id', clienteId),
        supabase
          .from('abonos')
          .select('id, fecha, monto, nota, medios_pago ( pago )')
          .eq('cliente_id', clienteId)
      ])

      for (const r of [ventas, devoluciones, abonos]) {
        if (r.error) throw r.error
      }

      const movimientos = []

      ;(ventas.data || []).forEach((v) => {
        const fiado = (v.pagos_venta || [])
          .filter((p) => p.medios_pago?.es_fiado)
          .reduce((s, p) => s + (Number(p.monto) || 0), 0)
        if (fiado > 0) {
          movimientos.push({
            clave: `v-${v.id}`, tipo: 'venta', id: v.id, ventaId: v.id, fecha: v.fecha,
            cargo: fiado, abono: 0, total: Number(v.total) || 0
          })
        }
      })

      ;(devoluciones.data || [])
        .filter((d) => d.medios_pago?.es_fiado)
        .forEach((d) => {
          movimientos.push({
            clave: `d-${d.id}`, tipo: 'devolucion', id: d.id, ventaId: d.venta_id, fecha: d.fecha,
            cargo: 0, abono: Number(d.total) || 0
          })
        })

      ;(abonos.data || []).forEach((a) => {
        movimientos.push({
          clave: `a-${a.id}`, tipo: 'abono', id: a.id, fecha: a.fecha,
          cargo: 0, abono: Number(a.monto) || 0, medio: a.medios_pago?.pago || null, nota: a.nota
        })
      })

      movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      let saldo = 0
      movimientos.forEach((m) => {
        saldo += m.cargo - m.abono
        m.saldo = saldo
      })
      return movimientos.reverse()
    } catch (error) {
      console.error('Error leyendo el historial de fiado:', error.message || error)
      return null
    }
  },

  /**
   * Abonos recibidos en una caja, para su cierre de turno.
   * [] si el fiado no está instalado; null si la consulta falló.
   */
  async getAbonosDeSesion(sesionId) {
    try {
      const { data, error } = await supabase
        .from('abonos')
        .select('id, cliente_id, fecha, monto, medio_pago_id, medios_pago ( pago ), clientes ( nombre )')
        .eq('sesion_caja_id', sesionId)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      if (noInstalado(error)) return []
      console.error('Error leyendo los abonos del turno:', error.message || error)
      return null
    }
  },

  /** Abonos de un período, para los reportes. [] si no está instalado. */
  async getAbonosPeriodo(inicioISO, finISO) {
    try {
      const { data, error } = await supabase
        .from('abonos')
        .select('id, cliente_id, fecha, monto, medios_pago ( pago ), clientes ( nombre )')
        .gte('fecha', inicioISO)
        .lte('fecha', finISO)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      if (noInstalado(error)) return []
      console.error('Error leyendo los abonos:', error.message || error)
      return null
    }
  }
}
