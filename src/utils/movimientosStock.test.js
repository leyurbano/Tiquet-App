import { describe, it, expect } from 'vitest'
import {
  calcularMovimiento,
  costoPromedio,
  motivosDe,
  buscarMotivo,
  MOTIVOS_SALIDA,
  detalleMovimiento,
  motivoCorto
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


describe('detalleMovimiento', () => {
  it('una entrada muestra la nota, que es el motivo del movimiento rápido', () => {
    expect(detalleMovimiento({
      tipo_evento: 'entrada',
      descripcion: 'Entrada #12 - +24 unidad(es)',
      entradas: { numero: 12, nota: 'Compra a proveedor - factura 1042' }
    })).toBe('Compra a proveedor - factura 1042')
  })

  it('una entrada sin nota es una compra: es lo único que suma por ahí', () => {
    expect(detalleMovimiento({
      tipo_evento: 'entrada',
      descripcion: 'Entrada #9 - +10 unidad(es)',
      entradas: { numero: 9, nota: null }
    })).toBe('Compra a proveedor')
  })

  it('un ajuste saca el motivo del texto, aunque no tenga nota', () => {
    expect(detalleMovimiento({
      tipo_evento: 'ajuste',
      descripcion: 'Ajuste #4 (perdida): -3 unidad(es)',
      ajustes: { numero: 4, nota: null }
    })).toBe('Pérdida o faltante')
  })

  it('un ajuste del movimiento rápido no repite la etiqueta del motivo', () => {
    expect(detalleMovimiento({
      tipo_evento: 'ajuste',
      descripcion: 'Ajuste #5 (dano): -2 unidad(es)',
      ajustes: { numero: 5, nota: 'Daño - se rompió en la bodega' }
    })).toBe('Daño - se rompió en la bodega')
  })

  it('un ajuste de Inventario suma el motivo de la línea y la nota del conteo', () => {
    expect(detalleMovimiento({
      tipo_evento: 'ajuste',
      descripcion: 'Ajuste #7 (conteo): -1 unidad(es)',
      ajustes: { numero: 7, nota: 'conteo mensual de septiembre' }
    })).toBe('Conteo físico · conteo mensual de septiembre')
  })

  it('a un vendedor la relación le llega vacía y no se inventa nada', () => {
    // entradas/ajustes son tablas de administradores: la RLS devuelve null
    expect(detalleMovimiento({
      tipo_evento: 'ajuste',
      descripcion: 'Ajuste #4 (perdida): -3 unidad(es)',
      ajustes: null
    })).toBe('Pérdida o faltante')
  })

  it('una venta no tiene motivo que mostrar', () => {
    expect(detalleMovimiento({ tipo_evento: 'venta', descripcion: 'Venta #30' })).toBe('')
  })

  it('no truena con un evento vacío ni con uno sin texto', () => {
    expect(detalleMovimiento(null)).toBe('')
    expect(detalleMovimiento({ tipo_evento: 'ajuste' })).toBe('')
  })
})


describe('motivoCorto', () => {
  it('una entrada es una compra', () => {
    expect(motivoCorto({ tipo_evento: 'entrada', descripcion: 'Entrada #12 - +24 unidad(es)' }))
      .toBe('Compra')
  })

  it('abrevia el motivo del ajuste para que quepa en una línea', () => {
    expect(motivoCorto({ tipo_evento: 'ajuste', descripcion: 'Ajuste #4 (perdida): -3 unidad(es)' }))
      .toBe('Pérdida')
    expect(motivoCorto({ tipo_evento: 'ajuste', descripcion: 'Ajuste #5 (dano): -2 unidad(es)' }))
      .toBe('Daño')
  })

  it('un motivo que no reconoce no deja la celda sin nada que decir', () => {
    expect(motivoCorto({ tipo_evento: 'ajuste', descripcion: 'Ajuste #6: -1 unidad(es)' }))
      .toBe('Ajuste')
  })

  it('una venta o una reversión no llevan motivo', () => {
    expect(motivoCorto({ tipo_evento: 'venta', descripcion: 'Venta #30' })).toBe('')
    expect(motivoCorto({ tipo_evento: 'reversion', descripcion: 'Reversión' })).toBe('')
    expect(motivoCorto(null)).toBe('')
  })
})
