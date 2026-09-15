/**
 * Filas para exportar los reportes a Excel (ver utils/csv.js).
 *
 * Los montos van como números enteros, sin símbolo ni separador de miles,
 * para que Excel los reconozca como números y se puedan sumar y filtrar.
 */
import { formatToColombiaShort } from './dateFormatter'

const redondear = (n) => Math.round(Number(n) || 0)

/**
 * Una fila por venta, con una columna por cada medio de pago usado en el
 * período: así el contador suma cada medio sin tener que separarlos a mano.
 *
 * @param ventas     resultado de salesService.getSalesForReport
 * @param mediosPago catálogo, para las ventas antiguas que guardaban el medio
 *                   en ventas.medio_pago_id y no en pagos_venta (mismo
 *                   respaldo que usa cashSummary)
 */
export const filasVentas = (ventas = [], mediosPago = []) => {
  const nombreMedio = (id) => mediosPago.find((m) => m.id === id)?.pago || 'Sin definir'

  const pagosDe = (v) => {
    const pagos = v.pagos_venta || []
    if (pagos.length > 0) {
      return pagos.map((p) => ({ medio: p.medios_pago?.pago || 'Sin definir', monto: p.monto }))
    }
    if (v.medio_pago_id) return [{ medio: nombreMedio(v.medio_pago_id), monto: v.total }]
    return []
  }

  const medios = [...new Set(ventas.flatMap((v) => pagosDe(v).map((p) => p.medio)))].sort()

  const columnas = [
    { clave: 'venta', titulo: 'Venta' },
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'cliente', titulo: 'Cliente' },
    { clave: 'documento', titulo: 'Documento' },
    { clave: 'unidades', titulo: 'Unidades' },
    { clave: 'total', titulo: 'Total' },
    { clave: 'costo', titulo: 'Costo' },
    { clave: 'ganancia', titulo: 'Ganancia' },
    ...medios.map((m) => ({ clave: `medio:${m}`, titulo: m }))
  ]

  const filas = ventas.map((v) => {
    const lineas = v.detalle_ventas || []
    const costo = lineas.reduce(
      (s, l) => s + (Number(l.costo_unitario) || 0) * (Number(l.cantidad) || 0), 0
    )

    const fila = {
      venta: v.id,
      fecha: formatToColombiaShort(v.fecha),
      cliente: v.clientes?.nombre || 'Sin cliente',
      documento: v.clientes?.documento || '',
      unidades: lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0),
      total: redondear(v.total),
      costo: redondear(costo),
      ganancia: redondear((Number(v.total) || 0) - costo)
    }

    for (const p of pagosDe(v)) {
      const clave = `medio:${p.medio}`
      fila[clave] = redondear((fila[clave] || 0) + (Number(p.monto) || 0))
    }
    return fila
  })

  // En orden cronológico, que es como lo revisa un contador
  filas.sort((a, b) => a.venta - b.venta)
  return { columnas, filas }
}

/** Una fila por producto vendido en el período (de buildReportSummary). */
export const filasProductos = (productos = []) => ({
  columnas: [
    { clave: 'producto', titulo: 'Producto' },
    { clave: 'unidades', titulo: 'Unidades' },
    { clave: 'vendido', titulo: 'Vendido' },
    { clave: 'costo', titulo: 'Costo' },
    { clave: 'ganancia', titulo: 'Ganancia' },
    { clave: 'margen', titulo: 'Margen %' }
  ],
  filas: productos.map((p) => ({
    producto: p.nombre,
    unidades: p.unidades,
    vendido: redondear(p.ingreso),
    costo: redondear(p.costo),
    ganancia: redondear(p.ganancia),
    margen: Math.round((p.margen || 0) * 10) / 10
  }))
})
