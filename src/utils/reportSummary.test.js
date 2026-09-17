import { describe, it, expect } from 'vitest'
import {
  buildReportSummary,
  resumenPorVendedor,
  productosEnRiesgo
} from './reportSummary'

// Ayuda a armar ventas sin repetir la forma que devuelve Supabase
const venta = (id, lineas, extra = {}) => ({
  id,
  total: lineas.reduce((s, l) => s + l.precio * l.cantidad, 0),
  detalle_ventas: lineas.map((l) => ({
    producto_id: l.producto_id,
    cantidad: l.cantidad,
    precio: l.precio,
    costo_unitario: l.costo_unitario,
    productos: { descripcion: l.nombre }
  })),
  ...extra
})

describe('buildReportSummary', () => {
  it('calcula ganancia y margen de una venta simple', () => {
    const r = buildReportSummary([
      venta(1, [{ producto_id: 10, nombre: 'Arroz', cantidad: 2, precio: 1000, costo_unitario: 400 }])
    ])

    expect(r.totalVendido).toBe(2000)
    expect(r.totalCosto).toBe(800)
    expect(r.ganancia).toBe(1200)
    expect(r.margen).toBe(60)
    expect(r.unidades).toBe(2)
    expect(r.cantidadVentas).toBe(1)
  })

  it('cuenta aparte las líneas sin costo y no las suma como costo cero real', () => {
    const r = buildReportSummary([
      venta(1, [{ producto_id: 10, nombre: 'Viejo', cantidad: 1, precio: 1000, costo_unitario: null }])
    ])

    expect(r.lineasSinCosto).toBe(1)
    expect(r.totalCosto).toBe(0)
  })

  it('un costo de cero de verdad no se confunde con un costo ausente', () => {
    const r = buildReportSummary([
      venta(1, [{ producto_id: 10, nombre: 'Regalo', cantidad: 1, precio: 1000, costo_unitario: 0 }])
    ])

    expect(r.lineasSinCosto).toBe(0)
  })

  it('la devolución resta ingreso, costo y unidades', () => {
    const ventas = [
      venta(1, [{ producto_id: 10, nombre: 'Arroz', cantidad: 3, precio: 1000, costo_unitario: 400 }])
    ]
    const devoluciones = [{
      id: 99,
      total: 1000,
      detalle_devoluciones: [
        { producto_id: 10, cantidad: 1, precio: 1000, costo_unitario: 400, productos: { descripcion: 'Arroz' } }
      ]
    }]

    const r = buildReportSummary(ventas, devoluciones)

    expect(r.totalVendido).toBe(3000)      // la venta original nunca se toca
    expect(r.totalDevuelto).toBe(1000)
    expect(r.ingresoNeto).toBe(2000)
    expect(r.totalCosto).toBe(800)         // costo neto: 1200 - 400
    expect(r.ganancia).toBe(1200)
    expect(r.unidades).toBe(2)
    expect(r.cantidadDevoluciones).toBe(1)
  })

  it('el ticket promedio usa el ingreso neto, no el bruto', () => {
    // Si usara el bruto, la pantalla mostraba "vendiste $0" y
    // "venta promedio $1.000" al mismo tiempo
    const ventas = [
      venta(1, [{ producto_id: 10, nombre: 'Arroz', cantidad: 1, precio: 1000, costo_unitario: 400 }])
    ]
    const devoluciones = [{
      id: 99, total: 1000,
      detalle_devoluciones: [
        { producto_id: 10, cantidad: 1, precio: 1000, costo_unitario: 400, productos: { descripcion: 'Arroz' } }
      ]
    }]

    const r = buildReportSummary(ventas, devoluciones)

    expect(r.ingresoNeto).toBe(0)
    expect(r.ticketPromedio).toBe(0)
  })

  it('un producto vendido y devuelto por completo no aparece en la lista', () => {
    const ventas = [
      venta(1, [{ producto_id: 10, nombre: 'Arroz', cantidad: 1, precio: 1000, costo_unitario: 400 }])
    ]
    const devoluciones = [{
      id: 99, total: 1000,
      detalle_devoluciones: [
        { producto_id: 10, cantidad: 1, precio: 1000, costo_unitario: 400, productos: { descripcion: 'Arroz' } }
      ]
    }]

    const r = buildReportSummary(ventas, devoluciones)
    expect(r.productos).toHaveLength(0)
  })

  it('ordena los productos por dinero vendido', () => {
    const r = buildReportSummary([
      venta(1, [
        { producto_id: 10, nombre: 'Barato', cantidad: 1, precio: 500, costo_unitario: 100 },
        { producto_id: 20, nombre: 'Caro', cantidad: 1, precio: 5000, costo_unitario: 1000 }
      ])
    ])

    expect(r.productos.map((p) => p.nombre)).toEqual(['Caro', 'Barato'])
  })

  it('sin ventas no divide por cero', () => {
    const r = buildReportSummary([], [])
    expect(r.ticketPromedio).toBe(0)
    expect(r.margen).toBe(0)
    expect(r.ganancia).toBe(0)
  })
})

describe('productosEnRiesgo', () => {
  it('separa los que se venden a pérdida de los de margen bajo', () => {
    const productos = [
      { id: 1, nombre: 'Pérdida', ingreso: 1000, costo: 1500, ganancia: -500, margen: -50 },
      { id: 2, nombre: 'Margen bajo', ingreso: 1000, costo: 950, ganancia: 50, margen: 5 },
      { id: 3, nombre: 'Sano', ingreso: 1000, costo: 500, ganancia: 500, margen: 50 }
    ]

    const { perdida, bajos } = productosEnRiesgo(productos)

    expect(perdida.map((p) => p.nombre)).toEqual(['Pérdida'])
    expect(bajos.map((p) => p.nombre)).toEqual(['Margen bajo'])
  })
})

describe('resumenPorVendedor', () => {
  it('ordena por total vendido y reparte la participación', () => {
    const ventas = [
      { user_id: 'ana', total: 3000 },
      { user_id: 'ana', total: 1000 },
      { user_id: 'beto', total: 1000 }
    ]

    const r = resumenPorVendedor(ventas, [])

    expect(r[0].userId).toBe('ana')
    expect(r[0].ventas).toBe(2)
    expect(r[0].total).toBe(4000)
    expect(r[0].promedio).toBe(2000)
    expect(r[0].participacion).toBe(80)
    expect(r[1].participacion).toBe(20)
  })

  it('agrupa aparte las ventas sin usuario en vez de descartarlas', () => {
    const r = resumenPorVendedor([{ user_id: null, total: 500 }], [])
    expect(r).toHaveLength(1)
    expect(r[0].clave).toBe('sin-registrar')
    expect(r[0].total).toBe(500)
  })
})
