/**
 * Cálculo de rentabilidad a partir de las ventas de un período.
 *
 * El costo sale de `detalle_ventas.costo_unitario`, que se congela con cada
 * venta. Las ventas anteriores a esa columna se rellenaron con el costo que
 * el producto tenía al migrar, así que su margen es aproximado — por eso se
 * cuentan aparte y la pantalla lo advierte.
 *
 * Las devoluciones del período restan ingreso, costo y unidades el día en
 * que se hicieron (no el día de la venta original), con el precio y el
 * costo congelados de la venta.
 */
export const buildReportSummary = (ventas = [], devoluciones = []) => {
  const porProducto = {}

  let totalVendido = 0
  let totalCosto = 0
  let unidades = 0
  let lineasSinCosto = 0

  const acumular = (id, nombre, cantidad, ingreso, costo) => {
    if (!porProducto[id]) {
      porProducto[id] = { id, nombre, unidades: 0, ingreso: 0, costo: 0 }
    }
    porProducto[id].unidades += cantidad
    porProducto[id].ingreso += ingreso
    porProducto[id].costo += costo
  }

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

      acumular(
        linea.producto_id,
        linea.productos?.descripcion || `Producto #${linea.producto_id}`,
        cantidad, ingreso, costo
      )
    })
  })

  let totalDevuelto = 0
  let costoDevuelto = 0

  devoluciones.forEach((dev) => {
    totalDevuelto += Number(dev.total) || 0

    ;(dev.detalle_devoluciones || []).forEach((linea) => {
      const cantidad = parseInt(linea.cantidad) || 0
      const ingreso = (parseFloat(linea.precio) || 0) * cantidad
      const costo = (parseFloat(linea.costo_unitario) || 0) * cantidad

      costoDevuelto += costo
      unidades -= cantidad

      acumular(
        linea.producto_id,
        linea.productos?.descripcion || `Producto #${linea.producto_id}`,
        -cantidad, -ingreso, -costo
      )
    })
  })

  const ingresoNeto = totalVendido - totalDevuelto
  const costoNeto = totalCosto - costoDevuelto
  const ganancia = ingresoNeto - costoNeto

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
    totalDevuelto,
    cantidadDevoluciones: devoluciones.length,
    ingresoNeto,
    // Costo de lo que efectivamente se quedó el cliente
    totalCosto: costoNeto,
    ganancia,
    // Margen sobre la venta neta: qué porcentaje de lo facturado queda como ganancia
    margen: ingresoNeto > 0 ? (ganancia / ingresoNeto) * 100 : 0,
    ticketPromedio: ventas.length > 0 ? totalVendido / ventas.length : 0,
    unidades,
    lineasSinCosto,
    productos
  }
}

export const formatPct = (valor) =>
  `${(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
