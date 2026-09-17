/**
 * Reglas de stock bajo.
 *
 * El umbral de un producto es su `stock_minimo` propio; si viene en null,
 * se usa el del negocio. Son cosas distintas: null significa "sin definir,
 * usa el general", y 0 significa "no avisar por este producto".
 *
 * 🔧 Además del umbral pesa la ROTACIÓN: solo se avisa de un producto que
 * se haya vendido en los últimos días (migración 33). Antes la alerta
 * marcaba 352 de 633 productos en Fralu —más de la mitad del catálogo— y
 * así no le sirve a nadie. Bajar el umbral no alcanzaba: con el mínimo en
 * 1 quedaban 92. De esos 352, solo 12 se habían vendido en el último mes.
 *
 * `rotacion` es un objeto { [producto_id]: unidades vendidas }. Cuando
 * llega null (todavía no cargó, o la migración 33 no se ha corrido) se
 * asume que todo rota, o sea el comportamiento de antes: es preferible
 * avisar de más que dejar de avisar por un dato que falta.
 */

export const umbralDe = (producto, minimoNegocio = 0) =>
  producto?.stock_minimo ?? minimoNegocio ?? 0

export const rota = (producto, rotacion = null) => {
  if (!rotacion) return true
  return (Number(rotacion[producto?.id]) || 0) > 0
}

export const estadoStock = (producto, minimoNegocio = 0, rotacion = null) => {
  const cantidad = producto?.cantidad || 0
  const umbral = umbralDe(producto, minimoNegocio)

  if (umbral <= 0) return 'ok'      // alertas desactivadas para este producto
  if (!rota(producto, rotacion)) return 'ok'  // quieto: no es prioridad de compra
  if (cantidad <= 0) return 'agotado'
  if (cantidad <= umbral) return 'bajo'
  return 'ok'
}

export const contarBajos = (productos = [], minimoNegocio = 0, rotacion = null) =>
  productos.reduce((acc, p) => {
    const estado = estadoStock(p, minimoNegocio, rotacion)
    if (estado === 'agotado') acc.agotados += 1
    else if (estado === 'bajo') acc.bajos += 1
    return acc
  }, { agotados: 0, bajos: 0 })
