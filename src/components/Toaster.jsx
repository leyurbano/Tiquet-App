import React, { useEffect, useState, useCallback } from 'react'
import { suscribirToasts } from '../utils/toast'
import './Toaster.css'

const ICONO = { exito: '✅', aviso: '⚠️', error: '❌' }

/**
 * Muestra los avisos emitidos con `toast.*`. Se monta una sola vez en
 * main.jsx (no en App, que tiene salidas tempranas donde no aparecería).
 *
 * - Se van solos; los errores duran más.
 * - Tocar un aviso lo cierra.
 * - aria-live anuncia los avisos a lectores de pantalla sin mover el foco.
 */
function Toaster() {
  const [avisos, setAvisos] = useState([])

  const cerrar = useCallback((id) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  useEffect(() => {
    return suscribirToasts((aviso) => {
      // Máximo 4 a la vez: si llegan muchos seguidos, se descartan los viejos
      setAvisos((prev) => [...prev, aviso].slice(-4))
      setTimeout(() => cerrar(aviso.id), aviso.duracion)
    })
  }, [cerrar])

  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {avisos.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`toast toast-${a.tipo}`}
          onClick={() => cerrar(a.id)}
          title="Tocar para cerrar"
        >
          <span className="toast-icono" aria-hidden="true">{ICONO[a.tipo]}</span>
          <span className="toast-texto">{a.mensaje}</span>
        </button>
      ))}
    </div>
  )
}

export default Toaster
