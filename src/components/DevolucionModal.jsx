import React, { useState, useEffect, useMemo } from 'react'
import { devolucionService } from '../services/devolucionService'
import { MOTIVOS_DEVOLUCION } from '../utils/motivosDevolucion'
import { formatCOP } from '../utils/currencyFormatter'
import { useDialogo } from '../hooks/useDialogo'
import './CajaModal.css'
import './DevolucionModal.css'

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Devolución parcial de una venta: qué productos, cuántas unidades, por qué
 * y cómo se le devuelve el dinero al cliente.
 *
 * Los límites de los vendedores se avisan aquí, pero los exige la base de
 * datos (registrar_devolucion): ocultar el botón no es un control.
 */
function DevolucionModal({ sale, clientName, mediosPago = [], esAdministrador, negocio, onCancel, onDone }) {
  const [devuelto, setDevuelto] = useState(null) // null = cargando
  const [errorCarga, setErrorCarga] = useState(false)
  const [cantidades, setCantidades] = useState({})
  const [noReintegra, setNoReintegra] = useState({})
  const [motivo, setMotivo] = useState('')
  const [medioPagoId, setMedioPagoId] = useState(
    () => (mediosPago.find((m) => /efectivo/i.test(m.pago)) || mediosPago[0])?.id ?? ''
  )
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  // Mientras guarda no se cierra: el resultado quedaría sin mostrarse
  const refDialogo = useDialogo({ onCerrar: procesando ? null : onCancel })

  useEffect(() => {
    devolucionService.getDevueltoPorLinea(sale.id).then((resultado) => {
      if (resultado === null) setErrorCarga(true)
      else setDevuelto(resultado)
    })
  }, [sale.id])

  const lineas = useMemo(
    () =>
      (sale.detalle_ventas || []).map((d) => {
        const vendida = Number(d.cantidad) || 0
        const yaDevuelta = devuelto?.[d.id] || 0
        return {
          id: d.id,
          nombre: d.productos?.descripcion || `Producto #${d.producto_id}`,
          precio: Number(d.precio) || 0,
          vendida,
          yaDevuelta,
          disponible: Math.max(vendida - yaDevuelta, 0)
        }
      }),
    [sale, devuelto]
  )

  const cantidadDe = (id) => parseInt(cantidades[id], 10) || 0
  const elegidas = lineas.filter((l) => cantidadDe(l.id) > 0)
  const total = elegidas.reduce((s, l) => s + cantidadDe(l.id) * l.precio, 0)
  const excedida = elegidas.find((l) => cantidadDe(l.id) > l.disponible)
  const nadaDisponible = devuelto !== null && lineas.every((l) => l.disponible === 0)

  // Límites del vendedor (la base de datos los exige igual)
  const limiteMonto = Number(negocio?.devolucion_max_vendedor ?? 50000)
  const limiteDias = Number(negocio?.devolucion_dias_vendedor ?? 8)
  const diasVenta = Math.floor((Date.now() - new Date(sale.fecha).getTime()) / DIA_MS)
  let avisoVendedor = null
  if (!esAdministrador) {
    if (diasVenta > limiteDias) {
      avisoVendedor = `La venta tiene ${diasVenta} días y el máximo para un vendedor es ${limiteDias}: la devolución debe hacerla un administrador.`
    } else if (total > limiteMonto) {
      avisoVendedor = `El monto supera el máximo que un vendedor puede devolver (${formatCOP(limiteMonto)}): debe hacerla un administrador.`
    }
  }

  const confirmar = async () => {
    setError('')
    if (elegidas.length === 0) return setError('Indica cuántas unidades devuelve de al menos un producto')
    if (excedida) return setError(`"${excedida.nombre}": solo quedan ${excedida.disponible} por devolver`)
    if (!motivo) return setError('Elige el motivo de la devolución')
    if (!medioPagoId) return setError('Elige cómo se le devuelve el dinero')

    setProcesando(true)
    const { devolucion, error: errorGuardado } = await devolucionService.registrarDevolucion({
      ventaId: sale.id,
      items: elegidas.map((l) => ({
        detalle_venta_id: l.id,
        cantidad: cantidadDe(l.id),
        reintegra: !noReintegra[l.id]
      })),
      motivo,
      medioPagoId: Number(medioPagoId),
      nota
    })
    setProcesando(false)

    if (errorGuardado) return setError(errorGuardado)
    onDone(devolucion)
  }

  return (
    <div className="caja-overlay" onClick={procesando ? undefined : onCancel}>
      <div className="caja-box dev-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Devolución de la venta ${sale.id}`}>
        <h2 className="caja-title">Devolución · venta #{sale.id}</h2>
        <p className="caja-subtitle">
          {clientName} · {formatCOP(sale.total || 0)}
          <br />
          La venta original no se modifica: la devolución queda registrada aparte.
        </p>

        {errorCarga ? (
          <div className="caja-alert">
            No se pudo leer lo que ya se devolvió de esta venta. Cierra e inténtalo de nuevo.
          </div>
        ) : devuelto === null ? (
          <div className="caja-loading">⏳ Cargando...</div>
        ) : nadaDisponible ? (
          <div className="caja-alert">Ya se devolvió todo lo de esta venta.</div>
        ) : (
          <>
            <div className="dev-tabla-wrap">
              <table className="dev-tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Vendidas</th>
                    <th className="num">Devolver</th>
                    <th className="centro">Vuelve al inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.nombre}
                        <span className="dev-precio">{formatCOP(l.precio)} c/u</span>
                      </td>
                      <td className="num">
                        {l.vendida}
                        {l.yaDevuelta > 0 && (
                          <span className="dev-ya">{l.yaDevuelta} ya devuelta{l.yaDevuelta === 1 ? '' : 's'}</span>
                        )}
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min="0"
                          max={l.disponible}
                          step="1"
                          placeholder="0"
                          value={cantidades[l.id] ?? ''}
                          onChange={(e) => setCantidades((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          disabled={procesando || l.disponible === 0}
                          className="dev-cantidad"
                          aria-label={`Unidades de ${l.nombre} que se devuelven`}
                        />
                      </td>
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={!noReintegra[l.id]}
                          onChange={(e) => setNoReintegra((prev) => ({ ...prev, [l.id]: !e.target.checked }))}
                          disabled={procesando || !esAdministrador}
                          title={esAdministrador ? 'Desmárcalo si llegó dañado o vencido' : 'Solo un administrador puede marcar productos dañados'}
                          aria-label={`${l.nombre} vuelve al inventario`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!esAdministrador && (
              <p className="caja-hint">
                Lo que devuelve un vendedor siempre vuelve al inventario. Límite: hasta{' '}
                {formatCOP(limiteMonto)} por devolución y ventas de máximo {limiteDias} días.
              </p>
            )}

            <label className="caja-label">Motivo</label>
            <div className="anular-motivos">
              {MOTIVOS_DEVOLUCION.map((m) => (
                <label className="anular-motivo" key={m.codigo}>
                  <input
                    type="radio"
                    name="motivo-devolucion"
                    value={m.codigo}
                    checked={motivo === m.codigo}
                    onChange={(e) => setMotivo(e.target.value)}
                    disabled={procesando}
                  />
                  <span>{m.etiqueta}</span>
                </label>
              ))}
            </div>

            <div className="dev-fila">
              <label className="dev-campo">
                <span className="caja-label">Se le devuelve en</span>
                <select
                  value={medioPagoId}
                  onChange={(e) => setMedioPagoId(e.target.value)}
                  disabled={procesando}
                  className="dev-select"
                >
                  {mediosPago.map((m) => (
                    <option key={m.id} value={m.id}>{m.pago}</option>
                  ))}
                </select>
              </label>
              <label className="dev-campo">
                <span className="caja-label">Nota (opcional)</span>
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  disabled={procesando}
                  className="dev-input"
                />
              </label>
            </div>

            <div className="dev-total">
              Total a devolver: <strong>{formatCOP(total)}</strong>
            </div>

            {avisoVendedor && <div className="caja-alert">{avisoVendedor}</div>}
          </>
        )}

        {error && <div className="caja-alert">{error}</div>}

        <div className="caja-buttons">
          <button
            type="button"
            className="caja-btn-danger"
            onClick={confirmar}
            disabled={procesando || devuelto === null || nadaDisponible || elegidas.length === 0 || !!avisoVendedor}
          >
            {procesando ? 'Registrando...' : `Devolver ${formatCOP(total)}`}
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

export default DevolucionModal
