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
