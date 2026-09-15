import { useEffect, useRef } from 'react'

/**
 * Comportamiento accesible para ventanas (modales).
 *
 * Uso: const refDialogo = useDialogo({ onCerrar, activo })
 *      <div ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1}>
 *
 * - Al abrir lleva el foco adentro: respeta el campo con autoFocus; si no
 *   hay, va al primer control; si no hay controles, a la ventana misma.
 * - Tab y Shift+Tab dan la vuelta dentro de la ventana: el foco no se
 *   escapa a la página de atrás, que queda tapada.
 * - Escape llama a onCerrar. Pasa onCerrar = null en las ventanas que no se
 *   pueden descartar (apertura de caja, cambio de contraseña obligatorio) o
 *   mientras se está guardando.
 * - Al cerrar devuelve el foco al elemento que la abrió.
 * - Bloquea el scroll de la página mientras haya alguna ventana abierta.
 * - Con ventanas una sobre otra, solo responde la de arriba.
 *
 * activo: para ventanas que se muestran condicionalmente dentro de una
 * página (el hook se llama siempre; el efecto corre solo mientras está
 * abierta).
 */

// Ventanas abiertas, de la de abajo a la de arriba
const pila = []
let overflowPrevio = ''

const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const enfocablesDe = (caja) =>
  [...caja.querySelectorAll(ENFOCABLES)].filter(
    // Los ocultos (display: none, hidden) no reciben foco
    (el) => el.offsetParent !== null || el === document.activeElement
  )

export function useDialogo({ onCerrar = null, activo = true } = {}) {
  const ref = useRef(null)

  // Siempre la versión más reciente de onCerrar, sin reinstalar el efecto:
  // así Escape nunca usa una versión vieja (con estado desactualizado)
  const onCerrarRef = useRef(onCerrar)
  useEffect(() => {
    onCerrarRef.current = onCerrar
  })

  useEffect(() => {
    if (!activo) return
    const caja = ref.current
    if (!caja) return

    const id = {}
    pila.push(id)
    if (pila.length === 1) {
      overflowPrevio = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    const anterior = document.activeElement

    // autoFocus ya puso el foco adentro durante el montaje: se respeta
    if (!caja.contains(document.activeElement)) {
      const primero = enfocablesDe(caja)[0]
      ;(primero || caja).focus()
    }

    const alPresionar = (e) => {
      if (pila[pila.length - 1] !== id) return

      if (e.key === 'Escape') {
        if (onCerrarRef.current) {
          e.preventDefault()
          onCerrarRef.current()
        }
        return
      }

      if (e.key !== 'Tab') return

      const focos = enfocablesDe(caja)
      if (focos.length === 0) {
        e.preventDefault()
        caja.focus()
        return
      }

      const primero = focos[0]
      const ultimo = focos[focos.length - 1]
      const fuera = !caja.contains(document.activeElement)

      if (e.shiftKey && (document.activeElement === primero || fuera)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (document.activeElement === ultimo || fuera)) {
        e.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', alPresionar)

    return () => {
      document.removeEventListener('keydown', alPresionar)
      const i = pila.indexOf(id)
      if (i >= 0) pila.splice(i, 1)
      if (pila.length === 0) document.body.style.overflow = overflowPrevio
      if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) {
        anterior.focus()
      }
    }
  }, [activo])

  return ref
}
