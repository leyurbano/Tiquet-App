import { describe, it, expect } from 'vitest'
import { umbralDe, estadoStock, contarBajos } from './stock'

const MINIMO_NEGOCIO = 5

describe('umbralDe', () => {
  it('el mínimo propio del producto manda sobre el del negocio', () => {
    expect(umbralDe({ stock_minimo: 2 }, MINIMO_NEGOCIO)).toBe(2)
  })

  it('null significa "usa el general", y es distinto de 0', () => {
    expect(umbralDe({ stock_minimo: null }, MINIMO_NEGOCIO)).toBe(5)
    expect(umbralDe({ stock_minimo: 0 }, MINIMO_NEGOCIO)).toBe(0)
  })
})

describe('estadoStock con rotación', () => {
  // 1 y 2 se vendieron en la ventana; 3 y 4 están quietos
  const rotacion = { 1: 40, 2: 3 }

  it('avisa de lo que rota y se está acabando', () => {
    expect(estadoStock({ id: 1, cantidad: 2 }, MINIMO_NEGOCIO, rotacion)).toBe('bajo')
  })

  it('marca agotado lo que rota y llegó a cero', () => {
    expect(estadoStock({ id: 1, cantidad: 0 }, MINIMO_NEGOCIO, rotacion)).toBe('agotado')
  })

  it('no avisa de lo que rota pero tiene de sobra', () => {
    expect(estadoStock({ id: 1, cantidad: 50 }, MINIMO_NEGOCIO, rotacion)).toBe('ok')
  })

  it('un producto quieto no es prioridad de compra, aunque tenga poco', () => {
    // Este es el cambio que llevó la alerta de 369 avisos a 17
    expect(estadoStock({ id: 3, cantidad: 2 }, MINIMO_NEGOCIO, rotacion)).toBe('ok')
  })

  it('un producto quieto en cero tampoco alerta', () => {
    expect(estadoStock({ id: 4, cantidad: 0 }, MINIMO_NEGOCIO, rotacion)).toBe('ok')
  })

  it('un mínimo propio de 0 apaga la alerta de ese producto', () => {
    expect(estadoStock({ id: 1, cantidad: 0, stock_minimo: 0 }, MINIMO_NEGOCIO, rotacion)).toBe('ok')
  })

  it('sin datos de rotación vuelve al comportamiento anterior', () => {
    // Mejor avisar de más que dejar de avisar por un dato que no cargó
    expect(estadoStock({ id: 3, cantidad: 2 }, MINIMO_NEGOCIO, null)).toBe('bajo')
  })
})

describe('contarBajos', () => {
  const catalogo = [
    { id: 1, cantidad: 2 },   // rota y está bajo
    { id: 3, cantidad: 2 },   // quieto
    { id: 4, cantidad: 0 }    // quieto y en cero
  ]

  it('con rotación solo cuenta lo que se está vendiendo', () => {
    expect(contarBajos(catalogo, MINIMO_NEGOCIO, { 1: 40, 2: 3 }))
      .toEqual({ agotados: 0, bajos: 1 })
  })

  it('sin rotación cuenta todo lo que esté bajo el umbral', () => {
    expect(contarBajos(catalogo, MINIMO_NEGOCIO, null))
      .toEqual({ agotados: 1, bajos: 2 })
  })
})
