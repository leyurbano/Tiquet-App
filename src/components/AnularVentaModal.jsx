import React, { useState, useId } from 'react'
import { MOTIVOS_ANULACION } from '../utils/motivosAnulacion'
import { formatCOP } from '../utils/currencyFormatter'
import { numeroDoc } from '../utils/documento'
import { useDialogo } from '../hooks/useDialogo'
import { Ban, Loader2, X } from 'lucide-react'
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
  // Nombra el grupo de motivos para el lector de pantalla
  const idMotivo = useId()
  const refDialogo = useDialogo({ onCerrar: procesando ? null : onCancel })

  const confirmar = async () => {
    if (!motivo) return
    setProcesando(true)
    await onConfirm(motivo)
    // El padre cierra el modal; si falló, vuelve a habilitar
    setProcesando(false)
  }

  return (
    <div className="caja-overlay" onClick={procesando ? undefined : onCancel}>
      <div className="caja-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Anular venta ${numeroDoc(sale)}`}>
        <div className="caja-header">
          <h2 className="caja-title caja-con-icono">
            <Ban size={22} color="#dc2626" aria-hidden="true" /> Anular venta #{numeroDoc(sale)}
          </h2>
          <button
            type="button"
            className="caja-cerrar"
            onClick={onCancel}
            disabled={procesando}
            aria-label="Cerrar sin anular"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="caja-subtitle">
          {clientName} · {formatCOP(sale.total || 0)}
          <br />
          Se devolverá el stock de los productos. La venta no se borra: queda
          registrada como anulada.
        </p>

        <div className="caja-label" id={idMotivo}>Motivo de la anulación</div>
        <div className="anular-motivos" role="radiogroup" aria-labelledby={idMotivo}>
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

        {/* El botón queda desactivado sin motivo: se dice por qué, para que
            no parezca que la pantalla no responde */}
        {!motivo && (
          <p className="caja-hint">Elige el motivo para poder anular la venta.</p>
        )}

        {/* En fila, como en el resto de la app. Sigue en rojo: anular
            devuelve stock y saca la venta de la caja, y no se deshace */}
        <div className="caja-buttons">
          <div className="caja-acciones-fila">
            <button
              type="button"
              className="caja-btn-danger"
              onClick={confirmar}
              disabled={procesando || !motivo}
            >
              {procesando
                ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                : <Ban size={16} aria-hidden="true" />}
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
    </div>
  )
}

export default AnularVentaModal
