import React, { useState, useEffect, useMemo } from 'react'
import { clientService } from '../services/clientService'
import { formatCOP } from '../utils/currencyFormatter'
import { useDialogo } from '../hooks/useDialogo'
import { formatToColombiaShort } from '../utils/dateFormatter'
import { etiquetaMotivo } from '../utils/motivosAnulacion'
import './CajaModal.css'
import './HistorialCompras.css'

const LIMITE = 200

/**
 * Historial de compras de un cliente: cuánto compra, qué compra y cada venta
 * con sus productos. Las anuladas se muestran tachadas y no suman; lo
 * devuelto se descuenta del total.
 */
function HistorialComprasModal({ cliente, onClose }) {
  const [ventas, setVentas] = useState(null) // null = cargando
  const [error, setError] = useState(false)
  const [abierta, setAbierta] = useState(null) // id de la venta desplegada
  const refDialogo = useDialogo({ onCerrar: onClose })

  useEffect(() => {
    clientService.getComprasCliente(cliente.id, LIMITE).then((resultado) => {
      if (resultado === null) setError(true)
      else setVentas(resultado)
    })
  }, [cliente.id])

  const resumen = useMemo(() => {
    if (!ventas) return null
    const validas = ventas.filter((v) => !v.anulada_en)
    const total = validas.reduce((s, v) => s + (Number(v.total) || 0) - (v.devuelto || 0), 0)

    const porProducto = {}
    validas.forEach((v) =>
      (v.detalle_ventas || []).forEach((d) => {
        if (!porProducto[d.producto_id]) {
          porProducto[d.producto_id] = {
            id: d.producto_id,
            nombre: d.productos?.descripcion || `Producto #${d.producto_id}`,
            unidades: 0
          }
        }
        porProducto[d.producto_id].unidades += Number(d.cantidad) || 0
      })
    )

    return {
      compras: validas.length,
      total,
      promedio: validas.length > 0 ? total / validas.length : 0,
      ultima: validas[0]?.fecha || null,
      top: Object.values(porProducto).sort((a, b) => b.unidades - a.unidades).slice(0, 5)
    }
  }, [ventas])

  const mediosDe = (venta) =>
    [...new Set((venta.pagos_venta || []).map((p) => p.medios_pago?.pago).filter(Boolean))].join(' + ') || '—'

  return (
    <div className="caja-overlay" onClick={onClose}>
      <div className="caja-box compras-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Compras de ${cliente.nombre}`}>
        <h2 className="caja-title">Compras de {cliente.nombre}</h2>
        <p className="caja-subtitle">Documento {cliente.documento}</p>

        {error ? (
          <div className="caja-alert">No se pudo cargar el historial. Inténtalo de nuevo.</div>
        ) : ventas === null ? (
          <div className="caja-loading">⏳ Cargando...</div>
        ) : ventas.length === 0 ? (
          <p className="caja-hint">Este cliente todavía no tiene compras.</p>
        ) : (
          <>
            <div className="compras-resumen">
              <div className="compras-stat">
                <span className="compras-stat-label">Compras</span>
                <span className="compras-stat-valor">{resumen.compras}</span>
              </div>
              <div className="compras-stat">
                <span className="compras-stat-label">Total comprado</span>
                <span className="compras-stat-valor">{formatCOP(resumen.total)}</span>
              </div>
              <div className="compras-stat">
                <span className="compras-stat-label">Compra promedio</span>
                <span className="compras-stat-valor">{formatCOP(resumen.promedio)}</span>
              </div>
              <div className="compras-stat">
                <span className="compras-stat-label">Última compra</span>
                <span className="compras-stat-valor compras-stat-fecha">
                  {resumen.ultima ? formatToColombiaShort(resumen.ultima) : '—'}
                </span>
              </div>
            </div>

            {resumen.top.length > 0 && (
              <div className="compras-top">
                <span className="compras-top-titulo">Lo que más compra:</span>
                {resumen.top.map((p) => (
                  <span key={p.id} className="compras-chip">
                    {p.nombre} · {p.unidades}
                  </span>
                ))}
              </div>
            )}

            <div className="compras-tabla-wrap">
              <table className="compras-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Venta</th>
                    <th>Productos</th>
                    <th>Pago</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => {
                    const lineas = v.detalle_ventas || []
                    const unidades = lineas.reduce((s, d) => s + (Number(d.cantidad) || 0), 0)
                    const anulada = !!v.anulada_en
                    return (
                      <React.Fragment key={v.id}>
                        <tr
                          className={`compras-fila ${anulada ? 'compras-anulada' : ''}`}
                          onClick={() => setAbierta(abierta === v.id ? null : v.id)}
                          title="Ver productos"
                        >
                          <td className="compras-fecha">{formatToColombiaShort(v.fecha)}</td>
                          <td>
                            #{v.id}
                            {anulada && (
                              <span className="compras-badge compras-badge-anulada">
                                Anulada · {etiquetaMotivo(v.motivo_anulacion)}
                              </span>
                            )}
                          </td>
                          <td>
                            {abierta === v.id ? '▾' : '▸'} {unidades} unid.
                          </td>
                          <td>{mediosDe(v)}</td>
                          <td className="num">
                            {formatCOP(v.total)}
                            {v.devuelto > 0 && (
                              <span className="compras-devuelto">−{formatCOP(v.devuelto)} devuelto</span>
                            )}
                          </td>
                        </tr>
                        {abierta === v.id && (
                          <tr className="compras-detalle">
                            <td colSpan={5}>
                              <ul>
                                {lineas.map((d, i) => (
                                  <li key={i}>
                                    <span>{d.cantidad} × {d.productos?.descripcion || `Producto #${d.producto_id}`}</span>
                                    <span>{formatCOP((Number(d.precio) || 0) * (Number(d.cantidad) || 0))}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {ventas.length === LIMITE && (
              <p className="caja-hint">Mostrando las últimas {LIMITE} compras.</p>
            )}
          </>
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

export default HistorialComprasModal
