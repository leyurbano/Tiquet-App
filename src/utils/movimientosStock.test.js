import { describe, it, expect } from 'vitest'
import {
  calcularMovimiento,
  costoPromedio,
  motivosDe,
  buscarMotivo,
  MOTIVOS_SALIDA
} from './movimientosStock'

describe('calcularMovimiento — entrada', () => {
  it('suma las unidades al stock que ya había', () => {
    const r = calcularMovimiento({ direccion: 'entrada', unidades: 24, stockActual: 3, costoActual: 1800 })
    expect(r.error).toBe(null)
    expect(r.stockFinal).toBe(27)
  })

  it('con un costo nuevo deja el promedio ponderado, no el último costo', () => {
    // 3 a $1.800 + 24 a $1.900 = $50.000 / 27 = $1.889
    const r = calcularMovimiento({
      direccion: 'entrada', unidades: 24, stockActual: 3,
      costoActual: 1800, costoNuevo: 1900, tocaCosto: true
    })
    expect(r.costoFinal).toBe(1889)
    expect(r.valor).toBe(45600)
  })

  it('sin stock previo el costo queda en el que se acabó de pagar', () => {
    const r = calcularMovimiento({
      direccion: 'entrada', unidades: 10, stockActual: 0,
      costoActual: 0, costoNuevo: 2500, tocaCosto: true
    })
    expect(r.costoFinal).toBe(2500)
  })

  it('no toca el costo cuando el motivo no es una compra', () => {
    const r = calcularMovimiento({
      direccion: 'entrada', unidades: 5, stockActual: 10,
      costoActual: 1000, costoNuevo: 9999, tocaCosto: false
    })
    expect(r.costoFinal).toBe(1000)
  })

  it('exige el costo cuando el movimiento lo toca', () => {
    const r = calcularMovimiento({
      direccion: 'entrada', unidades: 5, stockActual: 1,
      costoActual: 1000, costoNuevo: '', tocaCosto: true
    })
    expect(r.error).toBe('costo')
  })

  it('acepta un costo de cero: hay mercancía que llega sin costo', () => {
    const r = calcularMovimiento({
      direccion: 'entrada', unidades: 5, stockActual: 0,
      costoActual: 0, costoNuevo: 0, tocaCosto: true
    })
    expect(r.error).toBe(null)
  })
})

describe('calcularMovimiento — salida', () => {
  it('baja las unidades y valoriza la pérdida al costo', () => {
    const r = calcularMovimiento({ direccion: 'salida', unidades: 2, stockActual: 10, costoActual: 1500 })
    expect(r.stockFinal).toBe(8)
    expect(r.valor).toBe(-3000)
  })

  it('deja sacar justo todo el stock', () => {
    const r = calcularMovimiento({ direccion: 'salida', unidades: 10, stockActual: 10, costoActual: 100 })
    expect(r.error).toBe(null)
    expect(r.stockFinal).toBe(0)
  })

  it('rechaza sacar más de lo que hay: el stock nunca queda negativo', () => {
    const r = calcularMovimiento({ direccion: 'salida', unidades: 11, stockActual: 10, costoActual: 100 })
    expect(r.error).toBe('excede')
    expect(r.stockFinal).toBe(10)
  })

  it('nunca toca el costo', () => {
    const r = calcularMovimiento({
      direccion: 'salida', unidades: 3, stockActual: 10,
      costoActual: 1200, costoNuevo: 5000, tocaCosto: true
    })
    expect(r.costoFinal).toBe(1200)
  })
})

describe('calcularMovimiento — unidades inválidas', () => {
  it.each([['', 'vacío'], [0, 'cero'], [-5, 'negativo'], [2.5, 'decimal'], ['abc', 'texto']])(
    'rechaza %s (%s)',
    (unidades) => {
      const r = calcularMovimiento({ direccion: 'entrada', unidades, stockActual: 5, costoActual: 100 })
      expect(r.error).toBe('unidades')
      expect(r.stockFinal).toBe(5)
    }
  )
})

describe('costoPromedio', () => {
  it('sin stock previo devuelve el costo nuevo', () => {
    expect(costoPromedio(0, 999, 5, 2000)).toBe(2000)
  })
})

describe('motivos', () => {
  it('la compra es el único motivo que pasa por registrar_entrada', () => {
    expect(buscarMotivo('entrada', 'compra').rpc).toBe('entrada')
    expect(motivosDe('entrada').filter((m) => m.rpc === 'entrada')).toHaveLength(1)
  })

  it('ninguna salida pasa por registrar_entrada', () => {
    expect(MOTIVOS_SALIDA.every((m) => m.rpc === 'ajuste')).toBe(true)
  })

  it('todos los motivos de ajuste existen en el CHECK de la migración 22', () => {
    const permitidos = ['conteo', 'dano', 'perdida', 'vencimiento', 'correccion', 'otro']
    const deAjuste = [...motivosDe('entrada'), ...motivosDe('salida')].filter((m) => m.rpc === 'ajuste')
    deAjuste.forEach((m) => expect(permitidos).toContain(m.codigo))
  })

  it('un motivo inexistente no se inventa', () => {
    expect(buscarMotivo('salida', 'compra')).toBe(null)
  })
})
