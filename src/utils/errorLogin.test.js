import { describe, it, expect } from 'vitest'
import { mensajeErrorLogin } from './errorLogin'

describe('mensajeErrorLogin', () => {
  it('traduce las credenciales incorrectas', () => {
    expect(mensajeErrorLogin('Invalid login credentials')).toBe('Correo o contraseña incorrectos')
  })

  // Sin internet, el navegador responde en inglés y según el navegador
  it('reconoce la falta de conexión en Chrome, Firefox y Safari', () => {
    const esperado = 'No hay conexión a internet. Revisa la red e inténtalo de nuevo.'
    expect(mensajeErrorLogin('Failed to fetch')).toBe(esperado)
    expect(mensajeErrorLogin('NetworkError when attempting to fetch resource.')).toBe(esperado)
    expect(mensajeErrorLogin('Load failed')).toBe(esperado)
  })

  it('traduce el correo sin confirmar', () => {
    expect(mensajeErrorLogin('Email not confirmed')).toMatch(/no está confirmado/)
  })

  it('traduce el exceso de intentos', () => {
    expect(mensajeErrorLogin('Request rate limit reached')).toMatch(/Demasiados intentos/)
    expect(mensajeErrorLogin('Too many requests')).toMatch(/Demasiados intentos/)
  })

  // Nunca se le muestra al usuario un mensaje técnico en inglés
  it('usa un mensaje genérico en español para lo desconocido', () => {
    expect(mensajeErrorLogin('Database error querying schema')).toBe(
      'No se pudo iniciar sesión. Inténtalo de nuevo.'
    )
    expect(mensajeErrorLogin(undefined)).toBe('No se pudo iniciar sesión. Inténtalo de nuevo.')
  })
})
