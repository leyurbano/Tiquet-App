import { describe, it, expect } from 'vitest'
import { generarContrasenaTemporal, revisarContrasena } from './contrasena'

describe('generarContrasenaTemporal', () => {
  // Se repite muchas veces a propósito: el error original era que la
  // política se cumplía por casualidad. Una sola corrida puede pasar
  // aunque la garantía no exista.
  const muestras = Array.from({ length: 300 }, () => generarContrasenaTemporal())

  it('siempre trae minúscula, mayúscula, número y símbolo', () => {
    for (const clave of muestras) {
      expect(revisarContrasena(clave), `falló con "${clave}"`).toBe(null)
    }
  })

  it('siempre mide 12 caracteres', () => {
    for (const clave of muestras) {
      expect(clave).toHaveLength(12)
    }
  })

  it('nunca usa caracteres que se confunden al dictarlos', () => {
    // 0/O y 1/l/I: se entregan en papel o por teléfono
    for (const clave of muestras) {
      expect(clave, `falló con "${clave}"`).not.toMatch(/[0O1lI]/)
    }
  })

  it('no deja los obligatorios siempre en la misma posición', () => {
    // Sin mezclar, el primer carácter sería siempre una minúscula
    const primeros = new Set(muestras.map((c) => c[0]))
    expect(primeros.size).toBeGreaterThan(5)
  })

  it('no repite la misma contraseña', () => {
    expect(new Set(muestras).size).toBe(muestras.length)
  })
})

describe('revisarContrasena', () => {
  it('acepta una contraseña completa', () => {
    expect(revisarContrasena('Abcdef2*xyzQ')).toBe(null)
  })

  it('rechaza la que es solo números, que es el error típico', () => {
    expect(revisarContrasena('12345678')).toMatch(/minúscula/)
  })

  it('exige el largo mínimo antes que nada', () => {
    expect(revisarContrasena('Ab2*')).toMatch(/8 caracteres/)
  })

  it('dice puntualmente qué falta', () => {
    expect(revisarContrasena('abcdefgh2*')).toMatch(/mayúscula/)
    expect(revisarContrasena('Abcdefgh2')).toMatch(/símbolo/)
  })

  it('trata el vacío como demasiado corta, no como válida', () => {
    expect(revisarContrasena('')).toMatch(/8 caracteres/)
    expect(revisarContrasena(null)).toMatch(/8 caracteres/)
  })
})
