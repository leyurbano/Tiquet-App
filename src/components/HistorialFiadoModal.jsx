import React, { useState, useEffect } from 'react'
import { fiadoService } from '../services/fiadoService'
import { formatCOP } from '../utils/currencyFormatter'
import { useDialogo } from '../hooks/useDialogo'
import { formatToColombiaShort } from '../utils/dateFormatter'
import './CajaModal.css'
import './FiadoModals.css'

const descripcion = (m) => {
  if (m.tipo === 'venta') {
    return m.cargo < m.total
      ? `Venta #${m.id} (fiado ${formatCOP(m.cargo)} de ${formatCOP(m.total)})`
      : `Venta #${m.id}`
  }
  if (m.tipo === 'devolucion') return `Devolución #${m.id} de la venta #${m.ventaId}`
  return `Abono #${m.id}${m.medio ? ` · ${m.medio}` : ''}${m.nota ? ` · ${m.nota}` : ''}`
}

/** Qué compró fiado un cliente, qué abonó y cuánto debe después de cada paso. */
function HistorialFiadoModal({ cliente, onClose }) {
  const [movimientos, setMovimientos] = useState(null) // null = cargando
  const [error, setError] = useState(false)
  const refDialogo = useDialogo({ onCerrar: onClose })

  useEffect(() => {
    fiadoService.getMovimientos(cliente.id).then((resultado) => {
      if (resultado === null) setError(true)
      else setMovimientos(resultado)
    })
  }, [cliente.id])

  const saldoActual = movimientos?.[0]?.saldo ?? 0

  return (
    <div className="caja-overlay" onClick={onClose}>
      <div className="caja-box fiado-box fiado-box-ancha" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Fiado de ${cliente.nombre}`}>
        <h2 className="caja-title">Fiado de {cliente.nombre}</h2>
        <p className="caja-subtitle">
          Cupo {formatCOP(cliente.cupo_fiado || 0)}
          {movimientos && (
            <> · Debe hoy <strong>{formatCOP(saldoActual)}</strong></>
          )}
        </p>

        {error ? (
          <div className="caja-alert">No se pudo cargar el historial. Inténtalo de nuevo.</div>
        ) : movimientos === null ? (
          <div className="caja-loading">⏳ Cargando...</div>
        ) : movimientos.length === 0 ? (
          <p className="caja-hint">Este cliente no tiene movimientos de fiado.</p>
        ) : (
          <div className="fiado-tabla-wrap">
            <table className="fiado-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th className="num">Fiado</th>
                  <th className="num">Pagado</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.clave}>
                    <td className="fiado-fecha">{formatToColombiaShort(m.fecha)}</td>
                    <td>{descripcion(m)}</td>
                    <td className="num fiado-cargo">{m.cargo > 0 ? formatCOP(m.cargo) : ''}</td>
                    <td className="num fiado-pago">{m.abono > 0 ? formatCOP(m.abono) : ''}</td>
                    <td className="num"><strong>{formatCOP(m.saldo)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="caja-buttons">
          <button type="button" className="caja-btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default HistorialFiadoModal
