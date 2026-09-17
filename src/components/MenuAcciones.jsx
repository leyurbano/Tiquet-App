import React, { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'
import './MenuAcciones.css'

/**
 * Menú "⋯" con las acciones menos frecuentes de una fila.
 *
 * Evita que cada fila termine con cinco botones apilados: las acciones del
 * día a día quedan visibles y el resto entra aquí, con las destructivas de
 * último.
 *
 * El menú se posiciona sobre la página (position: fixed) y no dentro de la
 * tabla: el contenedor de la tabla tiene scroll horizontal y recortaría el
 * desplegable. Por eso también se cierra al hacer scroll.
 *
 * items: [{ clave, etiqueta, icono, onClick, peligro }]
 */
function MenuAcciones({ items, etiqueta = 'Más acciones' }) {
  const [abierto, setAbierto] = useState(false)
  const [posicion, setPosicion] = useState(null)
  const caja = useRef(null)
  const disparador = useRef(null)

  const cerrar = (devolverFoco = false) => {
    setAbierto(false)
    if (devolverFoco) disparador.current?.focus()
  }

  const abrir = () => {
    const r = disparador.current.getBoundingClientRect()
    setPosicion({ top: r.bottom + 4, right: Math.max(window.innerWidth - r.right, 8) })
    setAbierto(true)
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false)
    }
    const alDesplazar = () => setAbierto(false)

    document.addEventListener('mousedown', fuera)
    // true: también cuando el scroll ocurre dentro de la tabla
    window.addEventListener('scroll', alDesplazar, true)
    window.addEventListener('resize', alDesplazar)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('scroll', alDesplazar, true)
      window.removeEventListener('resize', alDesplazar)
    }
  }, [abierto])

  const teclas = (e) => {
    if (e.key === 'Escape' && abierto) {
      e.preventDefault()
      cerrar(true)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()

    if (!abierto) {
      abrir()
      requestAnimationFrame(() => caja.current?.querySelector('[role="menuitem"]')?.focus())
      return
    }
    const opciones = [...caja.current.querySelectorAll('[role="menuitem"]')]
    const i = opciones.indexOf(document.activeElement)
    const siguiente = e.key === 'ArrowDown'
      ? (i + 1) % opciones.length
      : (i - 1 + opciones.length) % opciones.length
    opciones[siguiente]?.focus()
  }

  return (
    <div
      className="menu-acciones"
      ref={caja}
      onKeyDown={teclas}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false)
      }}
    >
      <button
        type="button"
        ref={disparador}
        className="menu-acciones-btn"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => (abierto ? cerrar() : abrir())}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {abierto && posicion && (
        <div
          className="menu-acciones-lista"
          role="menu"
          style={{ top: posicion.top, right: posicion.right }}
        >
          {items.map((i) => (
            <button
              key={i.clave}
              type="button"
              role="menuitem"
              className={`menu-acciones-item ${i.peligro ? 'menu-acciones-peligro' : ''}`}
              onClick={() => {
                setAbierto(false)
                i.onClick()
              }}
            >
              <i.icono size={15} aria-hidden="true" />
              {i.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default MenuAcciones
