/**
 * Cálculo de rentabilidad a partir de las ventas de un período.
 *
 * El costo sale de `detalle_ventas.costo_unitario`, que se congela con cada
 * venta. Las ventas anteriores a esa columna se rellenaron con el costo que
 * el producto tenía al migrar, así que su margen es aproximado — por eso se
 * cuentan aparte y la pantalla lo advierte.
 */
export const buildReportSummary = (ventas = []) => {
  const porProducto = {}

  let totalVendido = 0
  let totalCosto = 0
  let unidades = 0
  let lineasSinCosto = 0

  ventas.forEach((venta) => {
    totalVendido += venta.total || 0

    ;(venta.detalle_ventas || []).forEach((linea) => {
      const cantidad = parseInt(linea.cantidad) || 0
      const precio = parseFloat(linea.precio) || 0
      const ingreso = precio * cantidad

      // null = venta anterior a que se guardara el costo
      const tieneCosto = linea.costo_unitario !== null && linea.costo_unitario !== undefined
      const costo = tieneCosto ? (parseFloat(linea.costo_unitario) || 0) * cantidad : 0
      if (!tieneCosto) lineasSinCosto += 1

      totalCosto += costo
      unidades += cantidad

      const id = linea.producto_id
      if (!porProducto[id]) {
        porProducto[id] = {
          id,
          nombre: linea.productos?.descripcion || `Producto #${id}`,
          unidades: 0,
          ingreso: 0,
          costo: 0
        }
      }
      porProducto[id].unidades += cantidad
      porProducto[id].ingreso += ingreso
      porProducto[id].costo += costo
    })
  })

  const ganancia = totalVendido - totalCosto

  const productos = Object.values(porProducto)
    .map((p) => ({
      ...p,
      ganancia: p.ingreso - p.costo,
      margen: p.ingreso > 0 ? ((p.ingreso - p.costo) / p.ingreso) * 100 : 0
    }))
    .sort((a, b) => b.ingreso - a.ingreso)

  return {
    cantidadVentas: ventas.length,
    totalVendido,
    totalCosto,
    ganancia,
    // Margen sobre la venta: qué porcentaje de lo facturado queda como ganancia
    margen: totalVendido > 0 ? (ganancia / totalVendido) * 100 : 0,
    ticketPromedio: ventas.length > 0 ? totalVendido / ventas.length : 0,
    unidades,
    lineasSinCosto,
    productos
  }
}

export const formatPct = (valor) =>
  `${(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
