/**
 * Reglas de stock bajo.
 *
 * El umbral de un producto es su `stock_minimo` propio; si viene en null,
 * se usa el del negocio. Son cosas distintas: null significa "sin definir,
 * usa el general", y 0 significa "no avisar por este producto".
 */

export const umbralDe = (producto, minimoNegocio = 0) =>
  producto?.stock_minimo ?? minimoNegocio ?? 0

export const estadoStock = (producto, minimoNegocio = 0) => {
  const cantidad = producto?.cantidad || 0
  const umbral = umbralDe(producto, minimoNegocio)

  if (umbral <= 0) return 'ok'      // alertas desactivadas para este producto
  if (cantidad <= 0) return 'agotado'
  if (cantidad <= umbral) return 'bajo'
  return 'ok'
}

export const contarBajos = (productos = [], minimoNegocio = 0) =>
  productos.reduce((acc, p) => {
    const estado = estadoStock(p, minimoNegocio)
    if (estado === 'agotado') acc.agotados += 1
    else if (estado === 'bajo') acc.bajos += 1
    return acc
  }, { agotados: 0, bajos: 0 })
