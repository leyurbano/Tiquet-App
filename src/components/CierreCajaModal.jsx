import React, { useState, useEffect, useMemo } from 'react'
import { useCashSession } from '../contexts/CashSessionContext'
import { salesService } from '../services/salesService'
import { buildCashSummary, parseCOP, formatCOPInput } from '../utils/cashSummary'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombia } from '../utils/dateFormatter'
import './CajaModal.css'
import { AlertTriangle } from 'lucide-react'

/**
 * Arqueo del turno, mostrado al presionar "Cerrar Sesión".
 * Suma las ventas desde que se abrió la caja (no del día calendario), así que
 * funciona igual si el turno cruza la medianoche o si hay varios turnos por día.
 */
function CierreCajaModal({ onCancel, onDone }) {
  const { session, closeSession } = useCashSession()
  const [sales, setSales] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [cargando, setCargando] = useState(true)
  const [conteo, setConteo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return

    const load = async () => {
      setCargando(true)
      const [ventas, medios] = await Promise.all([
        salesService.getSalesBetween(session.abierta_en),
        salesService.getMediosPago()
      ])
      setSales(ventas)
      setMediosPago(medios)
      setCargando(false)
    }

    load()
  }, [session])

  const resumen = useMemo(() => buildCashSummary(sales, mediosPago), [sales, mediosPago])

  const base = parseFloat(session?.base_inicial) || 0
  const efectivoEsperado = base + resumen.efectivoVentas
  const hayConteo = conteo !== ''
  const diferencia = hayConteo ? (parseFloat(conteo) || 0) - efectivoEsperado : 0

  const finalizar = async (omitido) => {
    setError('')
    setProcesando(true)

    const cerrada = await closeSession({
      efectivoContado: omitido ? null : parseFloat(conteo) || 0,
      efectivoVentas: resumen.efectivoVentas,
      totalVendido: resumen.totalVendido,
      cantidadVentas: resumen.cantidadVentas,
      diferencia: omitido ? null : diferencia,
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
            ? `Turno abierto desde el ${formatToColombia(session.abierta_en)}. Cuenta el efectivo en caja para cuadrar antes de salir.`
            : 'No hay una caja abierta.'}
        </p>

        {cargando ? (
          <div className="caja-loading">⏳ Calculando ventas del turno...</div>
        ) : (
          <>
            <div className="caja-row">
              <span>Ventas del turno</span>
              <span className="caja-row-value">
                {resumen.cantidadVentas} · {formatCOP(resumen.totalVendido)}
              </span>
            </div>

            {Object.entries(resumen.porMedio)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([nombre, data]) => (
                <div className="caja-row" key={nombre}>
                  <span className="caja-medio">{nombre}</span>
                  <span className="caja-row-value">{formatCOP(data.total)}</span>
                </div>
              ))}

            {resumen.totalSinMedio > 0 && (
              <div className="caja-row">
                <span className="caja-medio">Sin medio registrado</span>
                <span className="caja-row-value">{formatCOP(resumen.totalSinMedio)}</span>
              </div>
            )}

            {Math.abs(resumen.descuadre) > 0.01 && (
              <div className="caja-alert">
                <AlertTriangle size={15} />
                <span>
                  Hay {formatCOP(Math.abs(resumen.descuadre))} en ventas sin clasificar por
                  medio de pago. El efectivo esperado puede estar incompleto.
                </span>
              </div>
            )}

            <div className="caja-row">
              <span>Base inicial</span>
              <span className="caja-row-value">{formatCOP(base)}</span>
            </div>

            <div className="caja-row caja-row-strong">
              <span>Efectivo esperado en caja</span>
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
              <div
                className={`caja-diferencia ${
                  diferencia === 0 ? 'dif-ok' : diferencia > 0 ? 'dif-sobra' : 'dif-falta'
                }`}
              >
                {diferencia === 0
                  ? '✅ La caja cuadra exactamente'
                  : diferencia > 0
                    ? `⬆️ Sobran ${formatCOP(diferencia)}`
                    : `⬇️ Faltan ${formatCOP(Math.abs(diferencia))}`}
              </div>
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
