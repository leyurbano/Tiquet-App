/**
 * Documento del cliente genérico que usa la venta rápida.
 *
 * Está protegido en la base de datos (migración 17): no se puede borrar ni
 * cambiarle el documento, porque la venta rápida lo busca por este número.
 */
export const DOCUMENTO_CONSUMIDOR_FINAL = '222222222'

export const esConsumidorFinal = (cliente) =>
  cliente?.documento === DOCUMENTO_CONSUMIDOR_FINAL
