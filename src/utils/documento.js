/**
 * Número que ve el usuario en ventas, devoluciones, entradas, ajustes y
 * abonos.
 *
 * Es `numero`: consecutivo dentro de cada negocio, así cada uno arranca en 1
 * y su cuenta no avanza cuando otro negocio registra algo (migración 30).
 * El id interno de la base de datos no se muestra.
 *
 * Si la migración todavía no se corrió, cae al id para no dejar un hueco.
 */
export const numeroDoc = (documento) => documento?.numero ?? documento?.id
