/**
 * Movimiento rápido de stock desde la lista de Productos.
 *
 * La idea es que reponer lo que se está agotando no obligue a salir a
 * Inventario y buscar el producto otra vez: desde la fila se suman o se
 * bajan unidades, siempre con un motivo.
 *
 * No hay tablas nuevas: cada motivo dice por qué función de la base de datos
 * pasa el movimiento.
 *
 *  - `rpc: 'entrada'` → registrar_entrada: suma unidades y recalcula el costo
 *    como promedio ponderado. Es el camino de una compra, y el único que
 *    toca el costo.
 *  - `rpc: 'ajuste'`  → registrar_ajuste: fija el stock y guarda la
 *    diferencia valorizada con su motivo. El costo no se toca.
 *
 * Los códigos de `ajuste` están replicados en el CHECK de
 * supabase/22_ajustes_inventario.sql: si se agrega uno aquí que no esté
 * allá, el guardado falla.
 */

import { etiquetaMotivoAjuste } from './motivosAjuste'

export const MOTIVOS_ENTRADA = [
  { codigo: 'compra', etiqueta: 'Compra a proveedor', rpc: 'entrada' },
  { codigo: 'conteo', etiqueta: 'Sobrante de conteo', rpc: 'ajuste' },
  { codigo: 'correccion', etiqueta: 'Corrección de un error', rpc: 'ajuste' },
  { codigo: 'otro', etiqueta: 'Otro', rpc: 'ajuste' }
]

export const MOTIVOS_SALIDA = [
  { codigo: 'dano', etiqueta: 'Daño', rpc: 'ajuste' },
  { codigo: 'vencimiento', etiqueta: 'Vencimiento', rpc: 'ajuste' },
  { codigo: 'perdida', etiqueta: 'Pérdida o faltante', rpc: 'ajuste' },
  { codigo: 'conteo', etiqueta: 'Faltante de conteo', rpc: 'ajuste' },
  { codigo: 'correccion', etiqueta: 'Corrección de un error', rpc: 'ajuste' },
  { codigo: 'otro', etiqueta: 'Otro', rpc: 'ajuste' }
]

export const motivosDe = (direccion) =>
  direccion === 'salida' ? MOTIVOS_SALIDA : MOTIVOS_ENTRADA

export const buscarMotivo = (direccion, codigo) =>
  motivosDe(direccion).find((m) => m.codigo === codigo) || null

// Mismo cálculo que hace registrar_entrada en la base de datos. Aquí solo
// sirve para mostrar en qué queda el producto antes de guardar; el valor que
// se guarda lo calcula la base de datos.
export const costoPromedio = (stock, costoActual, cantidad, costoNuevo) =>
  stock <= 0
    ? costoNuevo
    : (stock * costoActual + cantidad * costoNuevo) / (stock + cantidad)

/**
 * Resultado de un movimiento antes de guardarlo.
 *
 * Devuelve { unidades, stockFinal, costoFinal, valor, error }:
 *  - `error` es un código ('unidades' | 'excede' | 'costo'), no un texto: el
 *    mensaje lo arma la pantalla.
 *  - `valor` es lo que entra (positivo) o lo que se pierde (negativo),
 *    valorizado al costo.
 *
 * El costo solo cambia en una entrada por compra con un costo distinto; una
 * salida nunca lo toca.
 */
export function calcularMovimiento({
  direccion = 'entrada',
  unidades,
  stockActual = 0,
  costoActual = 0,
  costoNuevo = null,
  tocaCosto = false
} = {}) {
  const stock = Number(stockActual) || 0
  const costo = Number(costoActual) || 0
  const n = Number(unidades)

  const base = { unidades: 0, stockFinal: stock, costoFinal: costo, valor: 0, error: null }

  if (unidades === '' || unidades === null || unidades === undefined ||
      !Number.isInteger(n) || n <= 0) {
    return { ...base, error: 'unidades' }
  }

  if (direccion === 'salida') {
    if (n > stock) return { ...base, unidades: n, error: 'excede' }
    return { ...base, unidades: n, stockFinal: stock - n, valor: -n * costo }
  }

  // Entrada. El costo que se paga solo se pide cuando el movimiento lo toca
  // (una compra); en lo demás se arrastra el que ya tenía el producto.
  const pagado = tocaCosto ? Number(costoNuevo) : costo
  if (tocaCosto && (costoNuevo === '' || costoNuevo === null || !(pagado >= 0))) {
    return { ...base, unidades: n, error: 'costo' }
  }

  const costoFinal = tocaCosto ? costoPromedio(stock, costo, n, pagado) : costo
  return {
    ...base,
    unidades: n,
    stockFinal: stock + n,
    costoFinal: Math.round(costoFinal),
    valor: n * pagado
  }
}


// El motivo de un ajuste viaja dentro del texto del historial, que la base de
// datos escribe como "Ajuste #12 (perdida): -3 unidad(es)"
const MOTIVO_EN_TEXTO = /\(([a-z_]+)\)/

// Etiqueta corta para la columna de referencia del historial: va debajo del
// número del documento, así que tiene que caber en una línea. El texto
// completo queda en el title (detalleMovimiento).
const MOTIVOS_CORTOS = {
  conteo: 'Conteo',
  dano: 'Daño',
  perdida: 'Pérdida',
  vencimiento: 'Vencimiento',
  correccion: 'Corrección',
  otro: 'Otro'
}

/**
 * Motivo abreviado de una fila del historial, para mostrarlo junto a la
 * referencia del documento. Devuelve '' cuando el evento no tiene motivo
 * (una venta, una reversión).
 */
export function motivoCorto(evento) {
  if (!evento) return ''
  if (evento.tipo_evento === 'entrada') return 'Compra'
  if (evento.tipo_evento === 'ajuste') {
    const codigo = MOTIVO_EN_TEXTO.exec(evento.descripcion || '')?.[1]
    return MOTIVOS_CORTOS[codigo] || 'Ajuste'
  }
  return ''
}

/**
 * Motivo legible completo de una fila del historial del producto.
 *
 * El historial mostraba "Entrada" y nada más: no se veía por qué habían
 * entrado o salido las unidades. Aquí se arma ese texto de dos fuentes, sin
 * guardar nada nuevo:
 *
 *  - El motivo del ajuste, que la base de datos ya deja en el texto del
 *    evento (y por eso sirve también para los ajustes hechos en Inventario,
 *    donde cada línea lleva el suyo).
 *  - La nota de la entrada o del ajuste, que solo pueden leer los
 *    administradores: `entradas` y `ajustes` son tablas suyas, así que a un
 *    vendedor le llega vacía y no hay nada que esconder en la pantalla.
 *
 * Una entrada sin nota es una compra: es la única razón por la que esa
 * función suma stock.
 */
export function detalleMovimiento(evento) {
  if (!evento) return ''

  const nota = (evento.entradas?.nota || evento.ajustes?.nota || '').trim()

  if (evento.tipo_evento === 'ajuste') {
    const codigo = MOTIVO_EN_TEXTO.exec(evento.descripcion || '')?.[1]
    const etiqueta = codigo ? etiquetaMotivoAjuste(codigo) : ''
    // La nota del movimiento rápido ya arranca con la etiqueta del motivo:
    // no se repite ("Daño · Daño · se rompió")
    if (etiqueta && nota && !nota.toLowerCase().startsWith(etiqueta.toLowerCase())) {
      return `${etiqueta} · ${nota}`
    }
    return nota || etiqueta
  }

  if (evento.tipo_evento === 'entrada') return nota || 'Compra a proveedor'

  return ''
}
