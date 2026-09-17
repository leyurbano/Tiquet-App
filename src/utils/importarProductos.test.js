import { describe, it, expect } from 'vitest'
import { parseNumero, leerCSV, normalizarNombre } from './importarProductos'

describe('parseNumero', () => {
  it('lee el formato colombiano: punto de miles, coma decimal', () => {
    expect(parseNumero('3.500')).toBe(3500)
    expect(parseNumero('3.500,50')).toBe(3500.5)
    expect(parseNumero('1.250.000')).toBe(1250000)
  })

  it('lee también el formato inglés, que es lo que sale de muchos Excel', () => {
    expect(parseNumero('3,500.50')).toBe(3500.5)
    expect(parseNumero('1,250,000')).toBe(1250000)
  })

  it('ignora el signo de pesos y los espacios', () => {
    expect(parseNumero('$ 3.500')).toBe(3500)
    expect(parseNumero(' 250 ')).toBe(250)
  })

  it('distingue vacío (null) de no numérico (NaN)', () => {
    // No es lo mismo "no puso costo" que "puso cualquier cosa": el
    // primero es válido, el segundo hay que rechazarlo
    expect(parseNumero('')).toBe(null)
    expect(parseNumero(null)).toBe(null)
    expect(parseNumero(undefined)).toBe(null)
    expect(parseNumero('abc')).toBeNaN()
  })

  it('acepta números tal como los entrega Excel', () => {
    expect(parseNumero(3500)).toBe(3500)
    expect(parseNumero(0)).toBe(0)
  })

  it('una coma decimal sola se interpreta como decimal', () => {
    expect(parseNumero('0,5')).toBe(0.5)
  })
})

describe('leerCSV', () => {
  it('detecta el separador punto y coma', () => {
    const filas = leerCSV('Nombre;Precio\nArroz;3500')
    expect(filas[0]).toEqual(['Nombre', 'Precio'])
    expect(filas[1]).toEqual(['Arroz', '3500'])
  })

  it('detecta el separador coma', () => {
    const filas = leerCSV('Nombre,Precio\nArroz,3500')
    expect(filas[1]).toEqual(['Arroz', '3500'])
  })

  it('respeta el separador dentro de comillas', () => {
    const filas = leerCSV('Nombre;Precio\n"Arroz; blanco";3500')
    expect(filas[1][0]).toBe('Arroz; blanco')
    expect(filas[1][1]).toBe('3500')
  })
})

describe('normalizarNombre', () => {
  it('ignora mayúsculas y espacios de más, igual que la base de datos', () => {
    expect(normalizarNombre('  Arroz   Blanco ')).toBe('arroz blanco')
    expect(normalizarNombre('ARROZ BLANCO')).toBe('arroz blanco')
  })

  it('dos formas del mismo nombre se consideran iguales', () => {
    expect(normalizarNombre('Arroz  Blanco')).toBe(normalizarNombre('arroz blanco'))
  })
})
