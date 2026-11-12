/**
 * Número de producto que ve el usuario.
 *
 * Es `codigo`: consecutivo dentro de cada negocio, así todos empiezan en 1
 * (migración 29). El id interno de la base de datos no se muestra: es único
 * para toda la plataforma y a un negocio nuevo le hacía ver su primer
 * producto como "#634".
 *
 * Si la migración todavía no se corrió, cae al id para no dejar la columna
 * en blanco.
 */
export const numeroProducto = (producto) => producto?.codigo ?? producto?.id

/** ¿El texto escrito corresponde al número de este producto? */
export const coincideNumero = (producto, texto) =>
  String(numeroProducto(producto)) === String(texto).trim()

/**
 * Nombre del producto con la primera letra de cada palabra en mayúscula.
 *
 * 🔧 Antes era /\b\w/g, que solo reconoce letras sin tilde: tomaba la ó de
 * "PANTALÓN" como separador y mostraba "PantalóN NiñO". \p{L} es cualquier
 * letra; una palabra empieza tras algo que no sea letra ni número, así
 * "500G" sigue quedando "500g".
 */
export const nombreProducto = (texto) =>
  (texto || '')
    .toLocaleLowerCase('es')
    .replace(
      /(^|[^\p{L}\p{N}])(\p{L})/gu,
      (_, antes, letra) => antes + letra.toLocaleUpperCase('es'),
    )
