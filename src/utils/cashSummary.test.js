import { describe, it, expect } from 'vitest'
import {
  buildCashSummary,
  buildPaymentItems,
  esMedioFiado,
  parseCOP,
  formatCOPInput
} from './cashSummary'

const MEDIOS = [
  { id: 1, pago: 'Efectivo' },
  { id: 2, pago: 'Transferencia' },
  { id: 3, pago: 'Fiado' }
]

describe('buildCashSummary', () => {
  it('desglosa por medio de pago', () => {
    const r = buildCashSummary([
      { id: 1, total: 1000, pagos_venta: [{ monto: 1000, medios_pago: { pago: 'Efectivo' } }] },
      { id: 2, total: 500, pagos_venta: [{ monto: 500, medios_pago: { pago: 'Transferencia' } }] }
    ], MEDIOS)

    expect(r.totalVendido).toBe(1500)
    expect(r.porMedio.Efectivo).toEqual({ count: 1, total: 1000 })
    expect(r.efectivoVentas).toBe(1000)
    expect(r.descuadre).toBe(0)
  })

  it('una venta mixta cuenta una vez por cada medio distinto', () => {
    const r = buildCashSummary([
      {
        id: 1,
        total: 1000,
        pagos_venta: [
          { monto: 600, medios_pago: { pago: 'Efectivo' } },
          { monto: 400, medios_pago: { pago: 'Transferencia' } }
        ]
      }
    ], MEDIOS)

    expect(r.porMedio.Efectivo.count).toBe(1)
    expect(r.porMedio.Transferencia.count).toBe(1)
    expect(r.porMedio.Efectivo.total).toBe(600)
    expect(r.descuadre).toBe(0)
  })

  it('dos pagos del mismo medio en una venta cuentan como una sola venta', () => {
    const r = buildCashSummary([
      {
        id: 1,
        total: 1000,
        pagos_venta: [
          { monto: 600, medios_pago: { pago: 'Efectivo' } },
          { monto: 400, medios_pago: { pago: 'Efectivo' } }
        ]
      }
    ], MEDIOS)

    expect(r.porMedio.Efectivo).toEqual({ count: 1, total: 1000 })
  })

  it('usa medio_pago_id cuando la venta no tiene filas en pagos_venta', () => {
    // Ventas viejas, anteriores a que se poblara pagos_venta: sin este
    // respaldo desaparecían del desglose aunque sumaran al total
    const r = buildCashSummary([
      { id: 1, total: 800, medio_pago_id: 1, pagos_venta: [] }
    ], MEDIOS)

    expect(r.porMedio.Efectivo).toEqual({ count: 1, total: 800 })
    expect(r.descuadre).toBe(0)
  })

  it('no descarta en silencio una venta sin ningún medio', () => {
    const r = buildCashSummary([{ id: 1, total: 700, pagos_venta: [] }], MEDIOS)

    expect(r.totalSinMedio).toBe(700)
    expect(r.descuadre).toBe(0)   // sigue cuadrando: se contabiliza aparte
    expect(r.totalVendido).toBe(700)
  })

  it('separa el fiado, que no es plata en el cajón', () => {
    const r = buildCashSummary([
      { id: 1, total: 1000, pagos_venta: [{ monto: 1000, medios_pago: { pago: 'Fiado' } }] }
    ], MEDIOS)

    expect(r.fiadoVentas).toBe(1000)
    expect(r.efectivoVentas).toBe(0)
  })

  it('sin ventas no divide por cero', () => {
    const r = buildCashSummary([], MEDIOS)
    expect(r.ticketPromedio).toBe(0)
    expect(r.cantidadVentas).toBe(0)
  })
})

describe('buildPaymentItems', () => {
  it('da una entrada por pago, con clave única', () => {
    const r = buildPaymentItems([
      {
        id: 7,
        pagos_venta: [
          { id: 100, monto: 600, medios_pago: { pago: 'Efectivo' } },
          { monto: 400, medios_pago: { pago: 'Transferencia' } }
        ]
      }
    ], MEDIOS)

    expect(r.Efectivo[0].key).toBe('pago-100')
    // Sin id propio, la clave se deriva de la venta para no repetirse
    expect(r.Transferencia[0].key).toBe('venta-7-Transferencia')
    expect(r.Transferencia[0].ventaId).toBe(7)
  })
})

describe('esMedioFiado', () => {
  it('reconoce el medio sin importar mayúsculas', () => {
    expect(esMedioFiado('Fiado')).toBe(true)
    expect(esMedioFiado('FIADO')).toBe(true)
    expect(esMedioFiado('Efectivo')).toBe(false)
    expect(esMedioFiado(null)).toBe(false)
  })
})

describe('helpers de dinero', () => {
  it('parseCOP deja solo los dígitos', () => {
    expect(parseCOP('1.500')).toBe('1500')
    expect(parseCOP('$ 20.000')).toBe('20000')
    expect(parseCOP('')).toBe('')
  })

  it('formatCOPInput agrupa los miles', () => {
    expect(formatCOPInput('1500')).toBe('1.500')
    expect(formatCOPInput('')).toBe('')
    expect(formatCOPInput('abc')).toBe('')
  })
})
