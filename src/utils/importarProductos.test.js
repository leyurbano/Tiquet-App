import { describe, it, expect } from 'vitest'
import {
  parseNumero, leerCSV, normalizarNombre,
  clasificarConteo, aItemsAjuste, resumenConteo, filasPlantillaConteo
} from './importarProductos'

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

// ---------------------------------------------------------------------
// Importar un conteo físico: el stock queda IGUAL al archivo, no se suma
// ---------------------------------------------------------------------

// Catálogo de prueba: codigo es el número que ve el usuario (no el id)
const CATALOGO = [
  { id: 101, codigo: 1, descripcion: 'Arroz 500g', cantidad: 12, costo: 2000 },
  { id: 102, codigo: 2, descripcion: 'Aceite 1L', cantidad: 30, costo: 8000 },
  { id: 103, codigo: 3, descripcion: 'Sal', cantidad: 8, costo: 1000 }
]

const conteo = (filas) =>
  clasificarConteo([['Número', 'Nombre', 'Sistema', 'Contado'], ...filas], CATALOGO)

describe('clasificarConteo', () => {
  it('fija lo contado y calcula la diferencia contra el sistema', () => {
    const { filas } = conteo([['1', 'Arroz 500g', '12', '20'], ['2', 'Aceite 1L', '30', '25']])
    expect(filas[0]).toMatchObject({ estado: 'ajuste', stockSistema: 12, contado: 20, diferencia: 8, valor: 16000 })
    expect(filas[1]).toMatchObject({ estado: 'ajuste', stockSistema: 30, contado: 25, diferencia: -5, valor: -40000 })
  })

  // La columna "Sistema" del archivo es la foto del momento de descargarlo:
  // la comparación es contra el stock de AHORA, que pudo cambiar con ventas
  it('compara contra el stock actual, no contra la columna Sistema del archivo', () => {
    const { filas } = conteo([['1', 'Arroz 500g', '999', '12']])
    expect(filas[0]).toMatchObject({ estado: 'igual', diferencia: 0 })
  })

  it('una fila sin conteo no cambia nada', () => {
    const { filas } = conteo([['3', 'Sal', '8', '']])
    expect(filas[0].estado).toBe('sin_conteo')
  })

  it('busca por número antes que por nombre', () => {
    // El nombre pudo cambiarse en el catálogo después de descargar el archivo
    const { filas } = conteo([['2', 'ACEITE GIRASOL', '30', '30']])
    expect(filas[0].producto.id).toBe(102)
  })

  it('sin columna de número, busca por nombre sin importar mayúsculas', () => {
    const { filas } = clasificarConteo([['Nombre', 'Contado'], ['  ARROZ  500G ', '15']], CATALOGO)
    expect(filas[0]).toMatchObject({ estado: 'ajuste', diferencia: 3 })
  })

  it('un producto que no existe es error: un ajuste no crea productos', () => {
    const { filas } = conteo([['', 'Azúcar', '', '10']])
    expect(filas[0].estado).toBe('error')
    expect(filas[0].errores[0]).toMatch(/no existe/i)
  })

  it('un número que no existe es error', () => {
    const { filas } = conteo([['77', '', '', '10']])
    expect(filas[0].estado).toBe('error')
  })

  it('el mismo producto dos veces es error en la segunda', () => {
    const { filas } = conteo([['1', 'Arroz 500g', '12', '20'], ['1', 'Arroz 500g', '12', '21']])
    expect(filas[0].estado).toBe('ajuste')
    expect(filas[1].estado).toBe('error')
  })

  it('rechaza conteos negativos, con decimales o que no son números', () => {
    const { filas } = conteo([['1', '', '', '-1'], ['2', '', '', '2,5'], ['3', '', '', 'abc']])
    expect(filas.map((f) => f.estado)).toEqual(['error', 'error', 'error'])
  })

  it('sin columna de conteo, el archivo no sirve', () => {
    const r = clasificarConteo([['Nombre', 'Precio'], ['Sal', '1000']], CATALOGO)
    expect(r.error).toMatch(/Contado/)
  })
})

describe('aItemsAjuste', () => {
  it('manda solo lo contado, con la foto del stock y sin tocar el costo', () => {
    const { filas } = conteo([['1', '', '', '20'], ['2', '', '', '30'], ['3', '', '', '']])
    expect(aItemsAjuste(filas)).toEqual([
      { producto_id: 101, stock_sistema: 12, stock_contado: 20, costo_unitario: null, motivo: 'conteo' },
      { producto_id: 102, stock_sistema: 30, stock_contado: 30, costo_unitario: null, motivo: 'conteo' }
    ])
  })
})

describe('resumenConteo', () => {
  it('separa faltante y sobrante, valorizados al costo', () => {
    const { filas } = conteo([['1', '', '', '20'], ['2', '', '', '25'], ['3', '', '', '8'], ['', 'Azúcar', '', '1']])
    expect(resumenConteo(filas)).toMatchObject({
      ajuste: 2, igual: 1, error: 1, sin_conteo: 0,
      sobrante: 16000, faltante: -40000
    })
  })
})

describe('filasPlantillaConteo', () => {
  it('trae el catálogo con su stock actual y el conteo vacío, por número', () => {
    const filas = filasPlantillaConteo([CATALOGO[2], CATALOGO[0]])
    expect(filas).toEqual([
      { numero: 1, nombre: 'Arroz 500g', sistema: 12, contado: '' },
      { numero: 3, nombre: 'Sal', sistema: 8, contado: '' }
    ])
  })
})
