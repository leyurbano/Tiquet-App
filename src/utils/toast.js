/**
 * Avisos no bloqueantes.
 *
 * 🔧 Reemplazan a alert(), que congelaba la pantalla hasta que alguien
 * tocara "Aceptar": en un celular y en pleno cobro, cada venta terminaba
 * con una pausa innecesaria.
 *
 * Se puede llamar desde cualquier parte —componentes, manejadores,
 * servicios— sin pasar hooks: `toast.exito('Venta registrada')`.
 * Los muestra el componente <Toaster />, montado una vez en main.jsx.
 *
 * Los confirm() de acciones destructivas (anular, eliminar) NO se
 * reemplazan: ahí la pausa es a propósito.
 */

const suscriptores = new Set()
let siguienteId = 1

// Duración en pantalla: los errores se quedan más, porque hay que leerlos
const DURACION = { exito: 3000, aviso: 4500, error: 7000 }

const emitir = (tipo, mensaje) => {
  const aviso = { id: siguienteId++, tipo, mensaje: String(mensaje), duracion: DURACION[tipo] }
  suscriptores.forEach((fn) => fn(aviso))
}

export const toast = {
  exito: (mensaje) => emitir('exito', mensaje),
  aviso: (mensaje) => emitir('aviso', mensaje),
  error: (mensaje) => emitir('error', mensaje)
}

// Uso interno de <Toaster />
export const suscribirToasts = (fn) => {
  suscriptores.add(fn)
  return () => suscriptores.delete(fn)
}
