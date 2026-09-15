/**
 * Motivos de un ajuste de inventario.
 *
 * El `codigo` se guarda en detalle_ajustes.motivo y está replicado en el
 * CHECK de la base de datos (supabase/22_ajustes_inventario.sql). Si se
 * agrega uno aquí, hay que agregarlo también allá o el guardado falla.
 */
export const MOTIVOS_AJUSTE = [
  { codigo: 'conteo', etiqueta: 'Conteo físico' },
  { codigo: 'dano', etiqueta: 'Daño' },
  { codigo: 'perdida', etiqueta: 'Pérdida o faltante' },
  { codigo: 'vencimiento', etiqueta: 'Vencimiento' },
  { codigo: 'correccion', etiqueta: 'Corrección de un error' },
  { codigo: 'otro', etiqueta: 'Otro' }
]

export const etiquetaMotivoAjuste = (codigo) =>
  MOTIVOS_AJUSTE.find((m) => m.codigo === codigo)?.etiqueta || codigo || '—'
