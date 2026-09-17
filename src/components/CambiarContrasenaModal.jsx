import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { perfilService } from '../services/perfilService'
import { useDialogo } from '../hooks/useDialogo'
import { revisarContrasena } from '../utils/contrasena'
import { Eye, EyeOff } from 'lucide-react'
import './CajaModal.css'
import './CambiarContrasenaModal.css'

/**
 * Campo de contraseña con el ojo para ver lo que se escribe, igual que en
 * el inicio de sesión. Importa especialmente aquí: la contraseña exige
 * símbolos, y escribirla a ciegas dos veces seguidas es donde la gente se
 * equivoca. El botón queda fuera del recorrido del tabulador para no
 * estorbar entre un campo y el siguiente.
 */
function CampoClave({ id, etiqueta, valor, onChange, autoComplete, ayuda = null, autoFocus = false, disabled }) {
  const [ver, setVer] = useState(false)

  return (
    <>
      <label className="caja-label" htmlFor={id}>{etiqueta}</label>
      <div className="pwd-campo">
        <input
          id={id}
          type={ver ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={valor}
          onChange={onChange}
          required
          autoFocus={autoFocus}
          disabled={disabled}
          className="pwd-input"
        />
        <button
          type="button"
          className="pwd-ver"
          onClick={() => setVer((v) => !v)}
          tabIndex={-1}
          aria-label={ver ? `Ocultar ${etiqueta.toLowerCase()}` : `Ver ${etiqueta.toLowerCase()}`}
          aria-pressed={ver}
          disabled={disabled}
        >
          {ver ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {ayuda && <p className="pwd-ayuda">{ayuda}</p>}
    </>
  )
}

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

    // Se revisan aquí los cuatro requisitos, no solo el largo: si solo se
    // mira el largo, Auth rechaza por el símbolo que falta y el mensaje que
    // llega es confuso
    const problema = revisarContrasena(nueva)
    if (problema) return setError(`${problema}.`)
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
            <CampoClave
              id="pwd-actual"
              etiqueta={obligatorio ? 'Contraseña temporal' : 'Contraseña actual'}
              autoComplete="current-password"
              ayuda={obligatorio
                ? 'Es la misma con la que acabas de entrar. Te la pedimos otra vez para confirmar que eres tú y que nadie más cambie tu clave.'
                : null}
              valor={actual}
              onChange={(e) => setActual(e.target.value)}
              autoFocus
              disabled={guardando}
            />

            <CampoClave
              id="pwd-nueva"
              etiqueta="Nueva contraseña"
              autoComplete="new-password"
              valor={nueva}
              onChange={(e) => setNueva(e.target.value)}
              disabled={guardando}
            />

            <CampoClave
              id="pwd-confirmar"
              etiqueta="Repite la nueva contraseña"
              autoComplete="new-password"
              valor={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              disabled={guardando}
            />
            <p className="pwd-ayuda">
              Mínimo 8 caracteres, con una minúscula, una mayúscula,
              un número y un símbolo (por ejemplo * o #).
            </p>

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
