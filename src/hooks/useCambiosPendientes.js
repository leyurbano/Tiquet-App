import { useEffect, useId } from 'react'

/**
 * Trabajo sin guardar que se perdería al salir de la página.
 *
 * El router de la app (BrowserRouter) no puede frenar una navegación, así
 * que el aviso se pide en los dos lugares por donde se sale: el menú (Navbar
 * llama a confirmarSalida antes de navegar o cerrar sesión) y el navegador
 * (cerrar la pestaña o recargar, con beforeunload). El botón "atrás" del
 * navegador no queda cubierto.
 *
 * Cada pantalla registra su propio pendiente; varias pueden tener a la vez.
 */
const pendientes = new Map()

const alCerrarPestana = (e) => {
  e.preventDefault()
  // Requerido por algunos navegadores para mostrar su aviso
  e.returnValue = ''
}

/**
 * Si hay algo sin guardar, pregunta antes de salir. Devuelve true si se
 * puede salir. window.confirm porque descartar el trabajo es destructivo.
 */
export function confirmarSalida() {
  if (pendientes.size === 0) return true
  const motivo = [...pendientes.values()][0]
  return window.confirm(`${motivo}\n\n¿Salir de todos modos? Se perderá lo que no guardaste.`)
}

/**
 * Registra un pendiente mientras `activo` sea true.
 * mensaje: qué se perdería, por ejemplo "Hay una entrada sin registrar."
 */
export function useCambiosPendientes(activo, mensaje) {
  const clave = useId()

  useEffect(() => {
    if (!activo) return
    pendientes.set(clave, mensaje)
    if (pendientes.size === 1) window.addEventListener('beforeunload', alCerrarPestana)
    return () => {
      pendientes.delete(clave)
      if (pendientes.size === 0) window.removeEventListener('beforeunload', alCerrarPestana)
    }
  }, [activo, mensaje, clave])
}
