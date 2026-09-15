/**
 * Lectura y revisión de un archivo de productos (.xlsx o .csv) antes de
 * importarlo. Aquí no se guarda nada: solo se clasifica cada fila para que
 * el administrador vea qué va a pasar. La importación la hace
 * registrar_entrada en la base de datos, que vuelve a validar todo.
 */
import { formatCOP } from './currencyFormatter'

// Mismo límite que registrar_entrada (migración 24)
export const MAX_FILAS = 2000

export const COLUMNAS_PLANTILLA = [
  { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'precio', titulo: 'Precio venta' },
  { clave: 'cantidad', titulo: 'Cantidad' },
  { clave: 'costo', titulo: 'Costo' },
  { clave: 'stockMinimo', titulo: 'Stock mínimo' }
]

// Encabezados aceptados, ya normalizados (sin tildes, espacios ni signos)
const ALIAS = {
  nombre: ['nombre', 'descripcion', 'producto', 'nombreproducto'],
  precio: ['precioventa', 'preciodeventa', 'precio', 'pventa', 'venta'],
  cantidad: ['cantidad', 'stock', 'stockinicial', 'unidades', 'existencias'],
  costo: ['costo', 'costounitario', 'preciocompra', 'preciodecompra', 'costocompra'],
  stockMinimo: ['stockminimo', 'minimo', 'stockmin']
}

const normalizarEncabezado = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

// Misma comparación que la base de datos para nombres repetidos
// (mayúsculas y espacios no cuentan)
export const normalizarNombre = (v) =>
  String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

// El apóstrofo inicial es el que pone nuestra exportación a CSV para
// neutralizar fórmulas; al volver a importar se quita
const limpiarTexto = (v) =>
  String(v ?? '').trim().replace(/\s+/g, ' ').replace(/^'(?=[=+\-@])/, '')

/**
 * Número desde una celda. Acepta números de Excel y textos como "3500",
 * "$ 3.500", "3.500,50" o "3,500.50". Devuelve null si la celda está vacía
 * y NaN si no es un número.
 */
export const parseNumero = (v) => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  let t = String(v).trim().replace(/[$\s]/g, '')
  if (t === '') return null

  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) {
    // Ambos: el último es el separador decimal
    t = coma > punto
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '')
  } else if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) {
    // "3.500" o "1,250,000": separador de miles
    t = t.replace(/[.,]/g, '')
  } else {
    t = t.replace(',', '.')
  }

  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** CSV con separador ; o , (se detecta), comillas y saltos de línea. */
export const leerCSV = (texto) => {
  // BOM al inicio (lo pone Excel al guardar CSV UTF-8)
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1)
  const primera = texto.split(/\r?\n/, 1)[0]
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ','

  const filas = []
  let fila = []
  let campo = ''
  let comillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false
      } else campo += c
    } else if (c === '"') {
      comillas = true
    } else if (c === sep) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas
}

/** Devuelve las filas del archivo como arreglos de celdas. */
export async function leerArchivo(archivo) {
  const nombre = archivo.name.toLowerCase()

  if (nombre.endsWith('.csv')) {
    const buffer = await archivo.arrayBuffer()
    let texto = new TextDecoder('utf-8').decode(buffer)
    // Excel en Windows guarda el CSV en Windows-1252: en UTF-8 las tildes
    // salen como caracteres inválidos, así que se vuelve a leer
    if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(buffer)
    return leerCSV(texto)
  }

  if (nombre.endsWith('.xlsx')) {
    // Se carga solo cuando alguien importa, para no pesar en el resto de la app
    const { readSheet } = await import('read-excel-file/browser')
    return await readSheet(archivo)
  }

  if (nombre.endsWith('.xls')) {
    throw new Error('Los .xls antiguos no se pueden leer: en Excel usa "Guardar como" → .xlsx')
  }
  throw new Error('Sube un archivo .xlsx o .csv')
}

const mapearColumnas = (encabezado) => {
  const indices = {}
  encabezado.forEach((celda, i) => {
    const norm = normalizarEncabezado(celda)
    for (const [clave, alias] of Object.entries(ALIAS)) {
      if (indices[clave] === undefined && alias.includes(norm)) {
        indices[clave] = i
        break
      }
    }
  })
  return indices
}

const vacia = (fila) => !fila.some((c) => c !== null && c !== undefined && String(c).trim() !== '')

/**
 * Clasifica cada fila contra el catálogo actual:
 *  - nuevo:     no existe; se crea (con o sin stock)
 *  - existente: ya existe; se le SUMA la cantidad al costo indicado
 *  - omitida:   ya existe y no trae cantidad; no cambia nada
 *  - error:     no se importa; `errores` dice por qué
 *
 * Devuelve { filas } o { error } si el archivo no sirve en conjunto.
 */
export function clasificarFilas(crudas, productos) {
  const conNumero = crudas
    .map((celdas, i) => ({ celdas, fila: i + 1 }))
    .filter((f) => !vacia(f.celdas))

  if (conNumero.length === 0) return { error: 'El archivo está vacío' }

  const [encabezado, ...datos] = conNumero
  const indices = mapearColumnas(encabezado.celdas)

  if (indices.nombre === undefined) {
    return { error: 'No encontré la columna "Nombre". Descarga la plantilla y usa sus encabezados.' }
  }
  if (datos.length === 0) return { error: 'El archivo solo tiene encabezados, sin productos' }
  if (datos.length > MAX_FILAS) {
    return { error: `El archivo tiene ${datos.length} filas y el máximo es ${MAX_FILAS}: divídelo en partes` }
  }

  const porNombre = new Map(productos.map((p) => [normalizarNombre(p.descripcion), p]))
  const vistos = new Map()

  const filas = datos.map(({ celdas, fila }) => {
    const valor = (clave) => (indices[clave] === undefined ? null : celdas[indices[clave]])

    const nombre = limpiarTexto(valor('nombre'))
    const precio = parseNumero(valor('precio'))
    const cantidad = parseNumero(valor('cantidad'))
    const costo = parseNumero(valor('costo'))
    const stockMinimo = parseNumero(valor('stockMinimo'))

    const clave = normalizarNombre(nombre)
    const existente = nombre ? porNombre.get(clave) : null
    const errores = []

    if (!nombre) errores.push('Falta el nombre')
    else if (vistos.has(clave)) errores.push(`Repetido: ya está en la fila ${vistos.get(clave)}`)
    else vistos.set(clave, fila)

    if (Number.isNaN(precio)) errores.push('El precio no es un número')
    else if (precio !== null && precio < 0) errores.push('El precio no puede ser negativo')
    else if (!existente && precio === null) errores.push('Falta el precio de venta')

    if (Number.isNaN(cantidad)) errores.push('La cantidad no es un número')
    else if (cantidad !== null && (cantidad < 0 || !Number.isInteger(cantidad))) {
      errores.push('La cantidad debe ser un número entero, cero o más')
    }

    if (Number.isNaN(costo)) errores.push('El costo no es un número')
    else if (costo !== null && costo < 0) errores.push('El costo no puede ser negativo')

    if (Number.isNaN(stockMinimo)) errores.push('El stock mínimo no es un número')
    else if (stockMinimo !== null && (stockMinimo < 0 || !Number.isInteger(stockMinimo))) {
      errores.push('El stock mínimo debe ser un número entero, cero o más')
    }

    const cant = cantidad ?? 0
    let estado = 'nuevo'
    let aviso = null

    if (errores.length > 0) {
      estado = 'error'
    } else if (existente) {
      if (cant === 0) {
        estado = 'omitida'
        aviso = 'Ya existe y no trae cantidad: no cambia nada'
      } else {
        estado = 'existente'
        const precioActual = Number(existente.precio_venta) || 0
        if (precio !== null && Math.round(precio) !== Math.round(precioActual)) {
          aviso = `El precio no se cambia: sigue en ${formatCOP(precioActual)}`
        }
      }
    } else if (cant === 0) {
      aviso = 'Se crea sin stock'
    }

    return {
      fila,
      nombre,
      precio,
      cantidad: cant,
      // Sin costo: un existente conserva el suyo (el promedio no cambia)
      costo: costo ?? (existente ? Number(existente.costo) || 0 : 0),
      stockMinimo,
      estado,
      errores,
      aviso,
      producto: existente
    }
  })

  return { filas }
}

/** Filas importables → líneas para registrar_entrada. */
export const aItems = (filas) =>
  filas
    .filter((f) => f.estado === 'nuevo' || f.estado === 'existente')
    .map((f) =>
      f.estado === 'nuevo'
        ? {
            nuevo: { descripcion: f.nombre, precio_venta: f.precio, stock_minimo: f.stockMinimo },
            cantidad: f.cantidad,
            costo_unitario: f.costo
          }
        : { producto_id: f.producto.id, cantidad: f.cantidad, costo_unitario: f.costo }
    )
