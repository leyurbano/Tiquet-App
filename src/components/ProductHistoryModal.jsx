import React, { useState, useEffect } from 'react'
import { productService } from '../services/productService'
import { ShoppingCart, Pencil, Undo2, MapPin, X, PackagePlus, ClipboardCheck, RotateCcw } from 'lucide-react'
import './ProductHistoryModal.css'
import { useDialogo } from '../hooks/useDialogo'

const TIPO_CONFIG = {
  venta:        { icon: ShoppingCart, label: 'Venta',        color: '#dc2626' },
  actualizacion:{ icon: Pencil,       label: 'Act. Inv.', color: '#2563eb' },
  reversion:    { icon: Undo2,        label: 'Rev. Vta.',     color: '#16a34a' },
  entrada:      { icon: PackagePlus,  label: 'Entrada',       color: '#0d9488' },
  ajuste:       { icon: ClipboardCheck, label: 'Ajuste',      color: '#b45309' },
  devolucion:   { icon: RotateCcw,    label: 'Devolución',   color: '#0d9488' },
}

function ProductHistoryModal({ product, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const data = await productService.getProductHistory(product.id)
      setHistory(data)
      setLoading(false)
    }
    load()
  }, [product.id])

  // Escape, foco y Tab dentro de la ventana
  const refDialogo = useDialogo({ onCerrar: onClose })

  const formatFecha = (iso) => {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="phm-overlay" onClick={onClose}>
      <div className="phm-box" onClick={e => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Historial de ${product.descripcion}`}>

        <div className="phm-header">
          <div>
            <p className="phm-eyebrow">Historial de movimientos</p>
            <h2 className="phm-title">
              {(product.descripcion || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
            </h2>
            <p className="phm-subtitle">
              Stock actual: <strong>{product.cantidad}</strong> unidades
            </p>
          </div>
          <button className="phm-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="phm-body">
          {loading ? (
            <p className="phm-empty">⏳ Cargando...</p>
          ) : history.length === 0 ? (
            <p className="phm-empty">Sin movimientos registrados aún.</p>
          ) : (
            <table className="phm-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="phm-th-num">Antes</th>
                  <th className="phm-th-num">Después</th>
                  <th className="phm-th-num">Cambio</th>
                  <th>Ref.</th>
                </tr>
              </thead>
              <tbody>
                {history.map((event) => {
                  const cfg = TIPO_CONFIG[event.tipo_evento] || {
                    icon: MapPin, label: event.tipo_evento, color: '#6b7280'
                  }
                  const Icon = cfg.icon
                  const diff = event.diferencia
                  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`
                  const diffColor = diff > 0 ? '#16a34a' : '#dc2626'

                  return (
                    <tr key={event.id}>
                      <td className="phm-td-fecha">{formatFecha(event.created_at)}</td>
                      <td>
                        <span className="phm-badge" style={{ background: cfg.color + '18', color: cfg.color }}>
                          <Icon size={12} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="phm-td-num">{event.cantidad_anterior ?? '—'}</td>
                      <td className="phm-td-num">{event.cantidad_nueva ?? '—'}</td>
                      <td className="phm-td-num">
                        <span style={{ color: diffColor, fontWeight: 700 }}>
                          {diff != null ? diffLabel : '—'}
                        </span>
                      </td>
                      <td className="phm-td-ref">
                        {event.venta_id
                          ? `Venta #${event.ventas?.numero ?? event.venta_id}`
                          : event.devolucion_id
                            ? `Devolución #${event.devoluciones?.numero ?? event.devolucion_id}`
                          : event.entrada_id
                            ? `Entrada #${event.entradas?.numero ?? event.entrada_id}`
                            : event.ajuste_id
                              ? `Ajuste #${event.ajustes?.numero ?? event.ajuste_id}`
                              : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}

export default ProductHistoryModal