import React, { useState, useEffect, useMemo, useRef } from 'react'
import { salesService } from '../services/salesService'
import { buildCashSummary } from '../utils/cashSummary'
import { formatCOP } from '../utils/currencyFormatter'
import { getTodayColombia } from '../utils/dateFormatter'
import './CierreCajaPage.css'
import { Wallet, TrendingUp, Receipt, AlertTriangle } from 'lucide-react'

/**
 * Consulta histórica: cuánto se vendió un día y cómo se repartió por medio de
 * pago. El arqueo de efectivo no vive aquí, sino en los modales de apertura y
 * cierre de caja, que están atados al turno del usuario.
 */
function CierreCajaPage() {
  const [sales, setSales] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(getTodayColombia)
  const dateInputRef = useRef(null)

  useEffect(() => {
    salesService.getMediosPago().then(setMediosPago)
  }, [])

  useEffect(() => {
    loadSales(selectedDate)
  }, [selectedDate])

  const loadSales = async (fecha) => {
    setLoading(true)
    const data = await salesService.getAllSales(false, fecha)
    setSales(data)
    setLoading(false)
  }

  const resumen = useMemo(() => buildCashSummary(sales, mediosPago), [sales, mediosPago])

  const formatDateLabel = (dateStr) => {
    if (dateStr === getTodayColombia()) return 'Hoy'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="cierre-page">
      <div className="cierre-header">
        <h1 className="cierre-title">📊 Resumen de ventas</h1>
        <div className="date-picker-wrapper">
          <button
            className="btn-date"
            onClick={() => dateInputRef.current?.showPicker()}
            title="Seleccionar fecha"
          >
            📅 {formatDateLabel(selectedDate)}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-input-hidden"
          />
        </div>
      </div>

      {loading ? (
        <div className="cierre-loading">⏳ Cargando ventas...</div>
      ) : resumen.cantidadVentas === 0 ? (
        <p className="cierre-empty">
          📭 No hay ventas registradas el {formatDateLabel(selectedDate) === 'Hoy' ? 'día de hoy' : formatDateLabel(selectedDate)}
        </p>
      ) : (
        <>
          <div className="cierre-stats">
            <div className="cierre-stat">
              <Receipt size={18} />
              <span className="cierre-stat-label">Ventas</span>
              <span className="cierre-stat-value">{resumen.cantidadVentas}</span>
            </div>
            <div className="cierre-stat">
              <TrendingUp size={18} />
              <span className="cierre-stat-label">Total vendido</span>
              <span className="cierre-stat-value">{formatCOP(resumen.totalVendido)}</span>
            </div>
            <div className="cierre-stat">
              <Wallet size={18} />
              <span className="cierre-stat-label">Ticket promedio</span>
              <span className="cierre-stat-value">{formatCOP(resumen.ticketPromedio)}</span>
            </div>
          </div>

          <div className="cierre-card">
            <h2 className="cierre-card-title">Desglose por medio de pago</h2>
            <table className="cierre-table">
              <tbody>
                {Object.entries(resumen.porMedio)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([nombre, data]) => (
                    <tr key={nombre}>
                      <td className="cierre-medio">{nombre}</td>
                      <td className="cierre-medio-count">
                        {data.count} {data.count === 1 ? 'venta' : 'ventas'}
                      </td>
                      <td className="cierre-medio-total">{formatCOP(data.total)}</td>
                    </tr>
                  ))}
                {resumen.totalSinMedio > 0 && (
                  <tr>
                    <td className="cierre-medio cierre-medio-warn">Sin medio registrado</td>
                    <td className="cierre-medio-count">—</td>
                    <td className="cierre-medio-total">{formatCOP(resumen.totalSinMedio)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {Math.abs(resumen.descuadre) > 0.01 && (
              <div className="cierre-alert">
                <AlertTriangle size={16} />
                <span>
                  El desglose no coincide con el total vendido: faltan{' '}
                  {formatCOP(Math.abs(resumen.descuadre))} por clasificar. Revisa las ventas del día.
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default CierreCajaPage
