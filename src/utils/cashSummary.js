/**
 * Agrega un conjunto de ventas en las cifras que necesita un cierre de caja.
 *
 * Maneja tres formas en que una venta puede traer su medio de pago:
 *  1. Filas en pagos_venta (caso normal, y el único que soporta pago mixto).
 *  2. Solo ventas.medio_pago_id, en ventas registradas antes de que
 *     pagos_venta se poblara. Sin este respaldo desaparecerían del desglose
 *     aunque sí sumen al total, dejando las cifras sin cuadrar.
 *  3. Ninguno de los dos: se acumulan aparte como "sin medio registrado"
 *     en lugar de descartarse en silencio.
 */
export const buildCashSummary = (sales = [], mediosPago = []) => {
  const porMedio = {}
  let totalVendido = 0
  let totalSinMedio = 0

  const sumar = (nombre, monto) => {
    if (!porMedio[nombre]) porMedio[nombre] = { count: 0, total: 0 }
    porMedio[nombre].total += monto
  }

  sales.forEach((sale) => {
    totalVendido += sale.total || 0
    const pagos = sale.pagos_venta || []

    if (pagos.length > 0) {
      pagos.forEach((pago) => {
        sumar(pago.medios_pago?.pago || 'Sin definir', pago.monto || 0)
      })
      // Una venta mixta cuenta una vez por cada medio distinto que usó
      const mediosUnicos = new Set(pagos.map((p) => p.medios_pago?.pago || 'Sin definir'))
      mediosUnicos.forEach((nombre) => { porMedio[nombre].count += 1 })
    } else if (sale.medio_pago_id) {
      const nombre = mediosPago.find((m) => m.id === sale.medio_pago_id)?.pago || 'Sin definir'
      sumar(nombre, sale.total || 0)
      porMedio[nombre].count += 1
    } else {
      totalSinMedio += sale.total || 0
    }
  })

  const totalDesglosado =
    Object.values(porMedio).reduce((s, m) => s + m.total, 0) + totalSinMedio
  const claveEfectivo = Object.keys(porMedio).find((n) => /efectivo/i.test(n))

  return {
    porMedio,
    totalVendido,
    totalSinMedio,
    cantidadVentas: sales.length,
    ticketPromedio: sales.length > 0 ? totalVendido / sales.length : 0,
    efectivoVentas: claveEfectivo ? porMedio[claveEfectivo].total : 0,
    // Distinto de cero significa que hay ventas que no se pudieron clasificar
    descuadre: totalVendido - totalDesglosado
  }
}

// Helpers de dinero para los inputs en pesos colombianos
export const parseCOP = (value) =>
  value.toString().replace(/\./g, '').replace(/[^0-9]/g, '')

export const formatCOPInput = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const numero = parseFloat(value)
  if (isNaN(numero)) return ''
  return new Intl.NumberFormat('es-CO').format(numero)
}
