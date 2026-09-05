import React, { useState, useEffect, useMemo } from 'react'
import { useCashSession } from '../contexts/CashSessionContext'
import { salesService } from '../services/salesService'
import {
  buildCashSummary,
  buildPaymentItems,
  parseCOP,
  formatCOPInput
} from '../utils/cashSummary'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombia } from '../utils/dateFormatter'
import './CajaModal.css'
import { AlertTriangle } from 'lucide-react'

/**
 * Arqueo del turno, mostrado al presionar "Cerrar Sesión".
 *
 * Suma las ventas desde que se abrió la caja (no del día calendario), así que
 * funciona igual si el turno cruza la medianoche o si hay varios turnos por día.
 *
 * Valida dos cosas de forma distinta:
 *  - Efectivo: se cuenta el cajón y se compara contra base + ventas en efectivo.
 *  - Transacciones: se marca una por una contra el banco o el datáfono, para
 *    que al no cuadrar se sepa exactamente cuál pago no llegó.
 */
function CierreCajaModal({ onCancel, onDone }) {
  const { session, closeSession } = useCashSession()
  const [sales, setSales] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [conteo, setConteo] = useState('')
  const [confirmados, setConfirmados] = useState({})
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return

    const load = async () => {
      setCargando(true)
      const [ventas, medios] = await Promise.all([
        // Acotado al cajero dueño del turno, no solo al rango de tiempo
        salesService.getSalesBetween(session.abierta_en, null, session.user_id),
        salesService.getMediosPago()
      ])
      // null = la consulta falló. Distinto de [] , que sí significa "sin ventas".
      setErrorCarga(ventas === null)
      setSales(ventas || [])
      setMediosPago(medios)
      setCargando(false)
    }

    load()
  }, [session])

  const resumen = useMemo(() => buildCashSummary(sales, mediosPago), [sales, mediosPago])
  const itemsPorMedio = useMemo(() => buildPaymentItems(sales, mediosPago), [sales, mediosPago])

  // Medios distintos al efectivo: son los que se validan uno por uno
  const transacciones = useMemo(
    () =>
      Object.entries(itemsPorMedio)
        .filter(([nombre]) => nombre !== resumen.claveEfectivo)
        .map(([nombre, items]) => {
          const esperado = items.reduce((s, i) => s + i.monto, 0)
          const confirmado = items
            .filter((i) => confirmados[i.key])
            .reduce((s, i) => s + i.monto, 0)
          return {
            nombre,
            items,
            esperado,
            confirmado,
            diferencia: confirmado - esperado,
            pendientes: items.filter((i) => !confirmados[i.key]).length
          }
        })
        .sort((a, b) => b.esperado - a.esperado),
    [itemsPorMedio, resumen.claveEfectivo, confirmados]
  )

  const base = parseFloat(session?.base_inicial) || 0
  const efectivoEsperado = base + resumen.efectivoVentas
  const hayConteo = conteo !== ''
  const difEfectivo = hayConteo ? (parseFloat(conteo) || 0) - efectivoEsperado : 0

  const totalPendientes = transacciones.reduce((s, t) => s + t.pendientes, 0)

  const toggle = (key) =>
    setConfirmados((prev) => ({ ...prev, [key]: !prev[key] }))

  const toggleTodos = (items, marcar) =>
    setConfirmados((prev) => {
      const next = { ...prev }
      items.forEach((i) => { next[i.key] = marcar })
      return next
    })

  const etiquetaDiferencia = (dif) => {
    if (dif === 0) return '✅ Cuadra exactamente'
    return dif > 0 ? `⬆️ Sobran ${formatCOP(dif)}` : `⬇️ Faltan ${formatCOP(Math.abs(dif))}`
  }

  const claseDiferencia = (dif) =>
    dif === 0 ? 'dif-ok' : dif > 0 ? 'dif-sobra' : 'dif-falta'

  const finalizar = async (omitido) => {
    setError('')
    setProcesando(true)

    const detalle = omitido
      ? null
      : {
          efectivo: {
            base_inicial: base,
            ventas: resumen.efectivoVentas,
            esperado: efectivoEsperado,
            contado: parseFloat(conteo) || 0,
            diferencia: difEfectivo
          },
          // Se guarda pago por pago: así queda registrado cuál no se confirmó
          medios: transacciones.map((t) => ({
            medio: t.nombre,
            esperado: t.esperado,
            confirmado: t.confirmado,
            diferencia: t.diferencia,
            pagos: t.items.map((i) => ({
              venta_id: i.ventaId,
              monto: i.monto,
              confirmado: !!confirmados[i.key]
            }))
          }))
        }

    const cerrada = await closeSession({
      efectivoContado: omitido ? null : parseFloat(conteo) || 0,
      efectivoVentas: resumen.efectivoVentas,
      totalVendido: resumen.totalVendido,
      cantidadVentas: resumen.cantidadVentas,
      diferencia: omitido ? null : difEfectivo,
      detalle,
      omitido
    })

    if (!cerrada) {
      setError('No se pudo registrar el cierre. Revisa tu conexión e intenta de nuevo.')
      setProcesando(false)
      return
    }

    onDone()
  }

  return (
    <div className="caja-overlay">
      <div className="caja-box">
        <h2 className="caja-title">🧾 Cierre de caja</h2>
        <p className="caja-subtitle">
          {session
            ? `Turno abierto desde el ${formatToColombia(session.abierta_en)}.`
            : 'No hay una caja abierta.'}
        </p>

        {cargando ? (
          <div className="caja-loading">⏳ Calculando ventas del turno...</div>
        ) : errorCarga ? (
          <>
            <div className="caja-alert">
              <AlertTriangle size={15} />
              <span>
                No se pudieron leer las ventas del turno, así que los totales de abajo
                serían falsos. <strong>No cierres la caja así.</strong> Revisa la consola
                del navegador para ver el error exacto e inténtalo de nuevo.
              </span>
            </div>
            <div className="caja-buttons">
              <button type="button" className="caja-btn-secondary" onClick={onCancel}>
                Volver
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="caja-row caja-row-strong">
              <span>Ventas del turno</span>
              <span className="caja-row-value">
                {resumen.cantidadVentas} · {formatCOP(resumen.totalVendido)}
              </span>
            </div>

            {Math.abs(resumen.descuadre) > 0.01 && (
              <div className="caja-alert">
                <AlertTriangle size={15} />
                <span>
                  Hay {formatCOP(Math.abs(resumen.descuadre))} en ventas sin clasificar por
                  medio de pago. Los montos esperados pueden estar incompletos.
                </span>
              </div>
            )}

            {/* ---------- Efectivo: se cuenta el cajón ---------- */}
            <h3 className="caja-section">Efectivo</h3>

            <div className="caja-row">
              <span>Base inicial</span>
              <span className="caja-row-value">{formatCOP(base)}</span>
            </div>
            <div className="caja-row">
              <span>Ventas en efectivo</span>
              <span className="caja-row-value">{formatCOP(resumen.efectivoVentas)}</span>
            </div>
            <div className="caja-row caja-row-strong">
              <span>Esperado en caja</span>
              <span className="caja-row-value">{formatCOP(efectivoEsperado)}</span>
            </div>

            <label className="caja-label">Efectivo contado</label>
            <div className="caja-money">
              <span className="caja-money-symbol">$</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatCOPInput(conteo)}
                onChange={(e) => setConteo(parseCOP(e.target.value))}
                disabled={procesando}
                autoFocus
                className="caja-input"
              />
            </div>

            {hayConteo && (
              <div className={`caja-diferencia ${claseDiferencia(difEfectivo)}`}>
                {etiquetaDiferencia(difEfectivo)}
              </div>
            )}

            {/* ---------- Transacciones: se marcan una por una ---------- */}
            {transacciones.length > 0 && (
              <>
                <h3 className="caja-section">Transacciones por validar</h3>
                <p className="caja-hint">
                  Marca cada pago que veas confirmado en tu app del banco o en el reporte
                  del datáfono. Lo que quede sin marcar es lo que no llegó.
                </p>

                {transacciones.map((t) => (
                  <div className="caja-medio-block" key={t.nombre}>
                    <div className="caja-medio-head">
                      <span className="caja-medio-nombre">{t.nombre}</span>
                      <span className="caja-medio-esperado">{formatCOP(t.esperado)}</span>
                    </div>

                    <div className="caja-check-actions">
                      <span className="caja-check-progreso">
                        {t.items.length - t.pendientes} de {t.items.length} confirmadas
                      </span>
                      <button
                        type="button"
                        className="caja-btn-link"
                        onClick={() => toggleTodos(t.items, t.pendientes > 0)}
                        disabled={procesando}
                      >
                        {t.pendientes > 0 ? 'Marcar todas' : 'Desmarcar todas'}
                      </button>
                    </div>

                    <ul className="caja-check-list">
                      {t.items.map((item) => (
                        <li key={item.key}>
                          <label className="caja-check-item">
                            <input
                              type="checkbox"
                              checked={!!confirmados[item.key]}
                              onChange={() => toggle(item.key)}
                              disabled={procesando}
                            />
                            <span className="caja-check-venta">Venta #{item.ventaId}</span>
                            <span className="caja-check-monto">{formatCOP(item.monto)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>

                    <div className={`caja-medio-dif ${claseDiferencia(t.diferencia)}`}>
                      {formatCOP(t.confirmado)} de {formatCOP(t.esperado)} ·{' '}
                      {etiquetaDiferencia(t.diferencia)}
                    </div>
                  </div>
                ))}

                {totalPendientes > 0 && (
                  <div className="caja-alert">
                    <AlertTriangle size={15} />
                    <span>
                      {totalPendientes === 1
                        ? 'Queda 1 transacción sin confirmar.'
                        : `Quedan ${totalPendientes} transacciones sin confirmar.`}{' '}
                      Puedes cerrar igual: quedarán registradas como no confirmadas.
                    </span>
                  </div>
                )}
              </>
            )}

            {error && <div className="caja-alert">{error}</div>}

            <div className="caja-buttons">
              <button
                type="button"
                className="caja-btn-danger"
                onClick={() => finalizar(false)}
                disabled={procesando || !hayConteo}
              >
                {procesando ? 'Cerrando...' : 'Cerrar caja y salir'}
              </button>
              <button
                type="button"
                className="caja-btn-secondary"
                onClick={onCancel}
                disabled={procesando}
              >
                Seguir trabajando
              </button>
              <button
                type="button"
                className="caja-btn-ghost"
                onClick={() => finalizar(true)}
                disabled={procesando}
              >
                Cerrar sin arquear
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default CierreCajaModal
