import React, { useState, useEffect } from 'react'
import { fiadoService } from '../services/fiadoService'
import { salesService } from '../services/salesService'
import { useCashSession } from '../contexts/CashSessionContext'
import { formatCOP } from '../utils/currencyFormatter'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import './CajaModal.css'
import './FiadoModals.css'

/**
 * Abono de un cliente a su deuda de fiado.
 *
 * La base de datos (registrar_abono) impide abonar más de lo que debe y
 * exige la caja abierta: el dinero entra al cajón de quien lo recibe y
 * aparece en su cierre de turno.
 */
function AbonoModal({ cliente, saldo, onCancel, onDone }) {
  const { session } = useCashSession()
  const [medios, setMedios] = useState([])
  const [medioPagoId, setMedioPagoId] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    salesService.getMediosPago().then((data) => {
      // Un abono no se paga con fiado
      const sinFiado = data.filter((m) => !m.es_fiado)
      setMedios(sinFiado)
      setMedioPagoId((sinFiado.find((m) => /efectivo/i.test(m.pago)) || sinFiado[0])?.id ?? '')
    })
  }, [])

  const valor = parseFloat(monto) || 0
  const saldoDespues = saldo - valor

  const confirmar = async () => {
    setError('')
    if (valor <= 0) return setError('Escribe cuánto abona el cliente')
    if (valor > saldo) return setError(`${cliente.nombre} debe ${formatCOP(saldo)}: el abono no puede ser mayor`)
    if (!medioPagoId) return setError('Elige cómo paga el cliente')

    setProcesando(true)
    const { abono, error: errorGuardado } = await fiadoService.registrarAbono({
      clienteId: cliente.id,
      monto: valor,
      medioPagoId: Number(medioPagoId),
      nota
    })
    setProcesando(false)

    if (errorGuardado) return setError(errorGuardado)
    onDone(abono)
  }

  return (
    <div className="caja-overlay" onClick={procesando ? undefined : onCancel}>
      <div className="caja-box fiado-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="caja-title">Abono de {cliente.nombre}</h2>
        <p className="caja-subtitle">
          Debe <strong>{formatCOP(saldo)}</strong> en fiado.
        </p>

        {!session && (
          <div className="caja-alert">
            Abre la caja en Ventas antes de recibir un abono: el dinero entra a tu cajón.
          </div>
        )}

        <label className="caja-label">Monto del abono</label>
        <div className="fiado-monto">
          <div className="caja-money">
            <span className="caja-money-symbol">$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatCOPInput(monto)}
              onChange={(e) => setMonto(parseCOP(e.target.value))}
              disabled={procesando}
              autoFocus
              className="caja-input"
            />
          </div>
          <button
            type="button"
            className="caja-btn-secondary fiado-btn-todo"
            onClick={() => setMonto(String(Math.round(saldo)))}
            disabled={procesando}
          >
            Paga todo
          </button>
        </div>

        <div className="fiado-fila">
          <label className="fiado-campo">
            <span className="caja-label">Paga con</span>
            <select
              value={medioPagoId}
              onChange={(e) => setMedioPagoId(e.target.value)}
              disabled={procesando}
              className="fiado-select"
            >
              {medios.map((m) => (
                <option key={m.id} value={m.id}>{m.pago}</option>
              ))}
            </select>
          </label>
          <label className="fiado-campo">
            <span className="caja-label">Nota (opcional)</span>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={procesando}
              className="fiado-input"
            />
          </label>
        </div>

        {valor > 0 && valor <= saldo && (
          <p className="fiado-despues">
            Después del abono queda debiendo <strong>{formatCOP(saldoDespues)}</strong>
          </p>
        )}

        {error && <div className="caja-alert">{error}</div>}

        <div className="caja-buttons">
          <button
            type="button"
            className="caja-btn-danger"
            onClick={confirmar}
            disabled={procesando || !session || valor <= 0}
          >
            {procesando ? 'Registrando...' : `Registrar abono ${valor > 0 ? formatCOP(valor) : ''}`}
          </button>
          <button
            type="button"
            className="caja-btn-secondary"
            onClick={onCancel}
            disabled={procesando}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default AbonoModal
