/**
 * Motivos de devolución.
 *
 * El `codigo` se guarda en devoluciones.motivo y está replicado en el CHECK
 * de la base de datos y en registrar_devolucion (supabase/25_devoluciones.sql).
 * Si se agrega uno aquí, hay que agregarlo también allá o el guardado falla.
 */
export const MOTIVOS_DEVOLUCION = [
  { codigo: 'cliente_desistio', etiqueta: 'Cliente se arrepintió' },
  { codigo: 'defectuoso', etiqueta: 'Producto defectuoso' },
  { codigo: 'vencido', etiqueta: 'Vencido o en mal estado' },
  { codigo: 'equivocado', etiqueta: 'Producto equivocado' },
  { codigo: 'otro', etiqueta: 'Otro' }
]

export const etiquetaMotivoDevolucion = (codigo) =>
  MOTIVOS_DEVOLUCION.find((m) => m.codigo === codigo)?.etiqueta || codigo || 'Sin motivo'
