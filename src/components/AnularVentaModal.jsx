import React, { useState } from 'react'
import { MOTIVOS_ANULACION } from '../utils/motivosAnulacion'
import { formatCOP } from '../utils/currencyFormatter'
import './CajaModal.css'

/**
 * Pide el motivo antes de anular una venta.
 *
 * Reemplaza el window.confirm anterior: anular devuelve stock y mueve dinero,
 * así que debe quedar registrado por qué se hizo, no solo que se hizo.
 */
function AnularVentaModal({ sale, clientName, onCancel, onConfirm }) {
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)

  const confirmar = async () => {
    if (!motivo) return
    setProcesando(true)
    await onConfirm(motivo)
    // El padre cierra el modal; si falló, vuelve a habilitar
    setProcesando(false)
  }

  return (
    <div className="caja-overlay" onClick={procesando ? undefined : onCancel}>
      <div className="caja-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="caja-title">Anular venta #{sale.id}</h2>
        <p className="caja-subtitle">
          {clientName} · {formatCOP(sale.total || 0)}
          <br />
          Se devolverá el stock de los productos. La venta no se borra: queda
          registrada como anulada.
        </p>

        <label className="caja-label">Motivo de la anulación</label>
        <div className="anular-motivos">
          {MOTIVOS_ANULACION.map((m) => (
            <label className="anular-motivo" key={m.codigo}>
              <input
                type="radio"
                name="motivo"
                value={m.codigo}
                checked={motivo === m.codigo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={procesando}
              />
              <span>{m.etiqueta}</span>
            </label>
          ))}
        </div>

        <div className="caja-buttons">
          <button
            type="button"
            className="caja-btn-danger"
            onClick={confirmar}
            disabled={procesando || !motivo}
          >
            {procesando ? 'Anulando...' : 'Anular venta'}
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

export default AnularVentaModal
