import { describe, it, expect } from 'vitest'
import { formatNumero } from './currencyFormatter'

describe('formatNumero', () => {
  it('separa los miles con punto, como en Colombia', () => {
    expect(formatNumero(1234)).toBe('1.234')
    expect(formatNumero(12345)).toBe('12.345')
  })

  it('separa también los millones', () => {
    expect(formatNumero(1234567)).toBe('1.234.567')
  })

  it('deja igual los números chicos', () => {
    expect(formatNumero(0)).toBe('0')
    expect(formatNumero(5)).toBe('5')
    expect(formatNumero(999)).toBe('999')
  })

  // El historial muestra la diferencia: una salida es negativa
  it('respeta el signo negativo', () => {
    expect(formatNumero(-1500)).toBe('-1.500')
  })

  // Un producto por peso puede tener stock con decimales (1,5 kg)
  it('muestra los decimales con coma', () => {
    expect(formatNumero(1.5)).toBe('1,5')
  })

  it('acepta texto y vacíos sin romperse', () => {
    expect(formatNumero('2500')).toBe('2.500')
    expect(formatNumero(null)).toBe('0')
    expect(formatNumero(undefined)).toBe('0')
  })
})
