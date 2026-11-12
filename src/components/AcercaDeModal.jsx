import React, { useState } from 'react'
import { Info, X, MessageCircle, Mail, RefreshCw, Loader2, CircleCheck } from 'lucide-react'
import { useDialogo } from '../hooks/useDialogo'
import { VERSION, SOPORTE, enlaceWhatsApp, enlaceCorreo } from '../utils/soporte'
import './CajaModal.css'
import './AcercaDeModal.css'

/**
 * Qué versión está usando la persona y cómo pedir ayuda.
 *
 * La app instalada (PWA) solo se actualiza cuando el usuario acepta el aviso,
 * así que un equipo puede seguir con una versión vieja sin saberlo: aquí se
 * ve cuál tiene y se puede buscar una nueva a mano.
 */
function AcercaDeModal({ onCerrar }) {
  // null | 'buscando' | 'al-dia' | 'nueva' | 'error'
  const [busqueda, setBusqueda] = useState(null)
  const refDialogo = useDialogo({ onCerrar })

  // No se usa useRegisterSW aquí: EstadoApp ya registró el service worker, y
  // registrarlo dos veces duplicaría los avisos. Se le pide al registro que
  // ya existe que revise; si hay versión nueva, EstadoApp muestra su aviso
  const buscarActualizacion = async () => {
    setBusqueda('buscando')
    try {
      const registro = await navigator.serviceWorker?.getRegistration()
      if (!registro) {
        setBusqueda('error')
        return
      }
      await registro.update()
      setBusqueda(registro.waiting || registro.installing ? 'nueva' : 'al-dia')
    } catch {
      setBusqueda('error')
    }
  }

  return (
    <div className="caja-overlay" onClick={onCerrar}>
      <div className="caja-box acerca-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Acerca de Tiquet-App">
        <div className="caja-header">
          <h2 className="caja-title caja-con-icono">
            <Info size={22} aria-hidden="true" /> Acerca de
          </h2>
          <button type="button" className="caja-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="acerca-app">
          <strong>Tiquet-App</strong>
          <span>Punto de venta e inventario</span>
          <span className="acerca-version">Versión {VERSION}</span>
        </div>

        <button
          type="button"
          className="caja-btn-secondary acerca-actualizar"
          onClick={buscarActualizacion}
          disabled={busqueda === 'buscando'}
        >
          {busqueda === 'buscando'
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <RefreshCw size={16} aria-hidden="true" />}
          {busqueda === 'buscando' ? 'Buscando...' : 'Buscar actualización'}
        </button>

        {/* role="status": el lector de pantalla anuncia el resultado */}
        <p className="acerca-resultado" role="status">
          {busqueda === 'al-dia' && (
            <><CircleCheck size={15} aria-hidden="true" /> Tienes la última versión.</>
          )}
          {busqueda === 'nueva' && 'Hay una versión nueva: usa el aviso "Actualizar" de la parte de abajo.'}
          {busqueda === 'error' && 'No se pudo revisar. Revisa tu conexión e inténtalo de nuevo.'}
        </p>

        <h3 className="caja-section">¿Necesitas ayuda?</h3>
        <div className="acerca-soporte">
          <a className="acerca-enlace" href={enlaceWhatsApp()} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} aria-hidden="true" />
            <span>
              WhatsApp
              <small>{SOPORTE.whatsappVisible}</small>
            </span>
          </a>
          <a className="acerca-enlace" href={enlaceCorreo()}>
            <Mail size={18} aria-hidden="true" />
            <span>
              Correo
              <small>{SOPORTE.correo}</small>
            </span>
          </a>
        </div>
        <p className="caja-hint">
          El mensaje ya lleva tu versión de la app, para ayudarte más rápido.
        </p>

        {/* Términos de uso y política de datos: se agregan aquí y en el
            inicio de sesión cuando los textos estén listos */}
        <p className="acerca-copy">© {new Date().getFullYear()} Tiquet-App</p>
      </div>
    </div>
  )
}

export default AcercaDeModal
