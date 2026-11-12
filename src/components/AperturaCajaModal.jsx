import React, { useState, useId } from 'react'
import { useCashSession } from '../contexts/CashSessionContext'
import { useAuth } from '../contexts/AuthContext'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import { useDialogo } from '../hooks/useDialogo'
import { Wallet, Check, Loader2 } from 'lucide-react'
import './CajaModal.css'

/**
 * Pide la base con la que arranca la caja. Se muestra al entrar a Ventas,
 * no al iniciar sesión: quien solo consulta reportes o configura no mueve
 * efectivo y no tiene por qué abrir un turno.
 *
 * No se descarta con Escape ni con clic afuera. Si llega `onOmitir`
 * (administradores y super admin), aparece "Ahora no"; el
 * vendedor no tiene esa opción, porque vender es su trabajo. Sin caja
 * abierta la venta igual queda bloqueada, también en la base de datos.
 */
function AperturaCajaModal({ onOmitir }) {
  const { openSession } = useCashSession()
  const { logout } = useAuth()
  const [base, setBase] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  // Sin onCerrar: no se descarta con Escape (ver arriba)
  // Conecta la etiqueta con su campo
  const idBase = useId()
  const refDialogo = useDialogo()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setGuardando(true)

    const nueva = await openSession(parseFloat(base) || 0)

    if (!nueva) {
      setError('No se pudo abrir la caja. Revisa tu conexión e intenta de nuevo.')
      setGuardando(false)
    }
    // Si se abrió bien, el contexto actualiza la sesión y este modal desaparece
  }

  return (
    <div className="caja-overlay">
      <div className="caja-box" ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Apertura de caja">
        <h2 className="caja-title caja-con-icono">
          <Wallet size={22} aria-hidden="true" /> Apertura de caja
        </h2>
        <p className="caja-subtitle">
          Ingresa el dinero en efectivo con el que arranca la caja. Al cerrar sesión
          se usará para cuadrar el arqueo del turno.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="caja-label" htmlFor={idBase}>Base inicial</label>
          <div className="caja-money">
            <span className="caja-money-symbol" aria-hidden="true">$</span>
            <input
              type="text"
              inputMode="numeric"
              id={idBase}
              placeholder="0"
              value={formatCOPInput(base)}
              onChange={(e) => setBase(parseCOP(e.target.value))}
              disabled={guardando}
              autoFocus
              className="caja-input"
            />
          </div>

          {error && <div className="caja-alert">{error}</div>}

          {/* Las dos acciones en fila, como en el resto de la app; "Cerrar
              sesión" va debajo como enlace porque es otra cosa: no abre ni
              omite la caja, se va. Los textos son cortos para que quepan a
              media fila en el celular */}
          <div className="caja-buttons">
            <div className="caja-acciones-fila">
              <button type="submit" className="caja-btn-primary" disabled={guardando}>
                {guardando
                  ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  : <Check size={16} aria-hidden="true" />}
                {guardando ? 'Abriendo...' : 'Abrir caja'}
              </button>
              {onOmitir && (
                <button
                  type="button"
                  className="caja-btn-secondary"
                  onClick={onOmitir}
                  disabled={guardando}
                  title="Entrar sin abrir caja: no se podrá vender"
                >
                  Ahora no
                </button>
              )}
            </div>
            <button
              type="button"
              className="caja-btn-ghost"
              onClick={logout}
              disabled={guardando}
            >
              Cerrar sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AperturaCajaModal
