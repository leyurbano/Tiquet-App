import { describe, it, expect } from 'vitest'
import { nombreProducto } from './producto'

describe('nombreProducto', () => {
  it('pone en mayúscula la primera letra de cada palabra', () => {
    expect(nombreProducto('CAMISA POLO AZUL')).toBe('Camisa Polo Azul')
  })

  // \b\w no reconoce á, ñ... como letras: ponía en mayúscula la letra
  // siguiente a la tilde ("PantalóN NiñO")
  it('no rompe las palabras con tilde o ñ', () => {
    expect(nombreProducto('PANTALÓN NIÑO')).toBe('Pantalón Niño')
    expect(nombreProducto('AZÚCAR MORENA')).toBe('Azúcar Morena')
    expect(nombreProducto('jabón en barra')).toBe('Jabón En Barra')
  })

  it('pone en mayúscula una tilde o ñ al inicio de la palabra', () => {
    expect(nombreProducto('árbol ñame')).toBe('Árbol Ñame')
  })

  it('separa también por guion y paréntesis, y no toca lo que va tras un número', () => {
    expect(nombreProducto('CAMISA-POLO (AZUL)')).toBe('Camisa-Polo (Azul)')
    expect(nombreProducto('ARROZ 500G')).toBe('Arroz 500g')
  })

  it('sin descripción devuelve texto vacío', () => {
    expect(nombreProducto(null)).toBe('')
    expect(nombreProducto(undefined)).toBe('')
  })
})
