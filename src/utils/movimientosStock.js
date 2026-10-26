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
