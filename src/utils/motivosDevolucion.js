/**
 * Motivos de devolución.
 *
 * El `codigo` se guarda en devoluciones.motivo y está replicado en el CHECK
 * de la base de datos y en registrar_devolucion (supabase/25_devoluciones.sql).
 * Si se agrega uno aquí, hay que agregarlo también allá o el guardado falla.
 */
export const MOTIVOS_DEVOLUCION = [
  { codigo: 'cliente_desistio', etiqueta: 'Cliente se arrepintió' },
  // danado: lo que llega así no se puede volver a vender (ver noSeRevende)
  { codigo: 'defectuoso', etiqueta: 'Producto defectuoso', danado: true },
  { codigo: 'vencido', etiqueta: 'Vencido o en mal estado', danado: true },
  { codigo: 'equivocado', etiqueta: 'Producto equivocado' },
  { codigo: 'otro', etiqueta: 'Otro' }
]

/**
 * ¿Con este motivo el producto vuelve dañado? Entonces no debería sumar al
 * stock: el sistema mostraría unidades que están en la basura. La pantalla
 * de devolución lo usa para desmarcar "vuelve al inventario" por defecto.
 */
export const noSeRevende = (codigo) =>
  !!MOTIVOS_DEVOLUCION.find((m) => m.codigo === codigo)?.danado

export const etiquetaMotivoDevolucion = (codigo) =>
  MOTIVOS_DEVOLUCION.find((m) => m.codigo === codigo)?.etiqueta || codigo || 'Sin motivo'
