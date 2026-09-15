import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { perfilService } from '../services/perfilService'
import { useDialogo } from '../hooks/useDialogo'
import './CajaModal.css'
import './CambiarContrasenaModal.css'

/**
 * Cambio de la propia contraseña.
 *
 * `obligatorio`: se muestra al entrar cuando el super admin creó o
 * restableció la contraseña (perfiles.debe_cambiar_contrasena). En ese
 * caso no se puede cerrar: la única salida es cambiarla o cerrar sesión.
 *
 * Pide la contraseña actual aunque el usuario ya haya iniciado sesión:
 * así alguien que encuentre una sesión abierta en el computador del local
 * no puede apropiarse de la cuenta cambiándole la contraseña.
 */
function CambiarContrasenaModal({ obligatorio = false, onCerrar }) {
  const { user, logout, recargarPerfil } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  // Obligatorio: no se descarta. Tampoco mientras guarda
  const refDialogo = useDialogo({ onCerrar: obligatorio || guardando ? null : (onCerrar || null) })

  const guardar = async (e) => {
    e.preventDefault()
    setError('')

    if (nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.')
    if (nueva !== confirmar) return setError('La confirmación no coincide con la nueva contraseña.')
    if (nueva === actual) return setError('La nueva contraseña debe ser distinta de la actual.')

    setGuardando(true)
    const { error: err } = await perfilService.cambiarMiContrasena(user.email, actual, nueva)
    setGuardando(false)

    if (err) return setError(err)

    setListo(true)
    await recargarPerfil()
    // Si era obligatorio, el modal desaparece solo al recargar el perfil
    if (!obligatorio) setTimeout(() => onCerrar?.(), 1200)
  }

  return (
    <div className="caja-overlay">
      <div className="caja-box" ref={refDialogo} role="dialog" aria-modal="true" aria-labelledby="pwd-titulo" tabIndex={-1}>
        <h2 id="pwd-titulo" className="caja-title">🔑 {obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}</h2>
        <p className="caja-subtitle">
          {obligatorio
            ? 'Tu contraseña fue asignada por el administrador. Por seguridad, cámbiala por una que solo tú conozcas.'
            : 'Escribe tu contraseña actual y la nueva.'}
        </p>

        {listo ? (
          <div className="pwd-ok">✅ Contraseña actualizada</div>
        ) : (
          <form onSubmit={guardar}>
            <label className="caja-label" htmlFor="pwd-actual">
              {obligatorio ? 'Contraseña que te entregaron' : 'Contraseña actual'}
            </label>
            <input
              id="pwd-actual"
              type="password"
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              autoFocus
              disabled={guardando}
              className="pwd-input"
            />

            <label className="caja-label" htmlFor="pwd-nueva">Nueva contraseña</label>
            <input
              id="pwd-nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              minLength={8}
              required
              disabled={guardando}
              className="pwd-input"
            />

            <label className="caja-label" htmlFor="pwd-confirmar">Repite la nueva contraseña</label>
            <input
              id="pwd-confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              minLength={8}
              required
              disabled={guardando}
              className="pwd-input"
            />
            <p className="pwd-ayuda">Mínimo 8 caracteres.</p>

            {error && <div className="caja-alert">{error}</div>}

            <div className="caja-buttons">
              <button type="submit" className="caja-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
              {obligatorio ? (
                <button type="button" className="caja-btn-ghost" onClick={logout} disabled={guardando}>
                  Cerrar sesión
                </button>
              ) : (
                <button type="button" className="caja-btn-secondary" onClick={onCerrar} disabled={guardando}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default CambiarContrasenaModal
