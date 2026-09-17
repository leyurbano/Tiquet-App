import { describe, it, expect } from 'vitest'
import { generarContrasenaTemporal, revisarContrasena, mensajeErrorAuth } from './contrasena'

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

describe('mensajeErrorAuth', () => {
  // Mensajes textuales de Supabase Auth. Si cambian, estos tests avisan.
  const POLITICA =
    'Password should contain at least one character of each: ' +
    'abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, ' +
    '!@#$%^&*()_+-=[]{};\':"|<>?,./`~.'
  const CORTA = 'Password should be at least 8 characters.'

  it('no confunde la falta de variedad con una contraseña corta', () => {
    // El bug original: /at least/ capturaba el error de política y el
    // usuario alargaba la contraseña sin que funcionara nunca
    const msg = mensajeErrorAuth(POLITICA)
    expect(msg).toMatch(/variedad/)
    expect(msg).not.toMatch(/corta/)
  })

  it('sí reconoce la contraseña corta de verdad', () => {
    expect(mensajeErrorAuth(CORTA)).toMatch(/corta/)
  })

  it('reconoce que debe ser distinta de la anterior', () => {
    expect(mensajeErrorAuth('New password should be different from the old password.'))
      .toMatch(/distinta/)
  })

  it('reconoce las filtradas', () => {
    expect(mensajeErrorAuth('This password has been leaked')).toMatch(/filtraciones/)
  })

  it('devuelve null si no entiende, para no inventar una explicación', () => {
    expect(mensajeErrorAuth('Something unexpected happened')).toBe(null)
    expect(mensajeErrorAuth('')).toBe(null)
    expect(mensajeErrorAuth(null)).toBe(null)
  })
})
