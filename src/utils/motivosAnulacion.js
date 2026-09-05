/**
 * Lista fija de motivos de anulación.
 *
 * El `codigo` es lo que se guarda en ventas.motivo_anulacion y está replicado
 * en el CHECK de la base de datos (ver supabase/ventas_anulacion.sql). Si se
 * agrega uno nuevo aquí, hay que agregarlo también allá o el guardado falla.
 *
 * Se guarda el código y no la etiqueta para que los reportes agrupen bien
 * aunque mañana se reescriba el texto que ve el usuario.
 */
export const MOTIVOS_ANULACION = [
  { codigo: 'devolucion', etiqueta: 'Devolución del cliente' },
  { codigo: 'error_digitacion', etiqueta: 'Error de digitación' },
  { codigo: 'cliente_desistio', etiqueta: 'Cliente se arrepintió' },
  { codigo: 'venta_prueba', etiqueta: 'Venta de prueba' },
  { codigo: 'otro', etiqueta: 'Otro' }
]

export const etiquetaMotivo = (codigo) =>
  MOTIVOS_ANULACION.find((m) => m.codigo === codigo)?.etiqueta || codigo || 'Sin motivo'
