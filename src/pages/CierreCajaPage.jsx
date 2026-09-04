import React, { useState, useEffect, useMemo, useRef } from 'react'
import { salesService } from '../services/salesService'
import { formatCOP } from '../utils/currencyFormatter'
import { getTodayColombia } from '../utils/dateFormatter'
import './CierreCajaPage.css'
import { Wallet, TrendingUp, Receipt, AlertTriangle } from 'lucide-react'

// Deja solo dígitos de lo que escribe el usuario (quita puntos de miles y símbolos)
const parseCOP = (value) => value.toString().replace(/\./g, '').replace(/[^0-9]/g, '')

// Formato de presentación para los inputs de dinero
const formatInput = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const numero = parseFloat(value)
  if (isNaN(numero)) return ''
  return new Intl.NumberFormat('es-CO').format(numero)
}

function CierreCajaPage() {
  const [sales, setSales] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(getTodayColombia)
  const [baseInicial, setBaseInicial] = useState('')
  const [conteoFisico, setConteoFisico] = useState('')
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

  const resumen = useMemo(() => {
    const porMedio = {}
    let totalVendido = 0
    let totalSinMedio = 0

    const sumar = (nombre, monto) => {
      if (!porMedio[nombre]) porMedio[nombre] = { count: 0, total: 0 }
      porMedio[nombre].total += monto
    }

    sales.forEach((sale) => {
      totalVendido += sale.total || 0
      const pagos = sale.pagos_venta || []

      if (pagos.length > 0) {
        pagos.forEach((pago) => {
          sumar(pago.medios_pago?.pago || 'Sin definir', pago.monto || 0)
        })
        // Una venta mixta cuenta una vez por cada medio distinto que usó
        const mediosUnicos = new Set(pagos.map((p) => p.medios_pago?.pago || 'Sin definir'))
        mediosUnicos.forEach((nombre) => { porMedio[nombre].count += 1 })
      } else if (sale.medio_pago_id) {
        // Ventas registradas antes de que existiera pagos_venta: el medio vive en la venta
        const nombre = mediosPago.find((m) => m.id === sale.medio_pago_id)?.pago || 'Sin definir'
        sumar(nombre, sale.total || 0)
        porMedio[nombre].count += 1
      } else {
        totalSinMedio += sale.total || 0
      }
    })

    const totalDesglosado = Object.values(porMedio).reduce((s, m) => s + m.total, 0) + totalSinMedio
    const claveEfectivo = Object.keys(porMedio).find((n) => /efectivo/i.test(n))

    return {
      porMedio,
      totalVendido,
      totalSinMedio,
      cantidadVentas: sales.length,
      ticketPromedio: sales.length > 0 ? totalVendido / sales.length : 0,
      efectivoVentas: claveEfectivo ? porMedio[claveEfectivo].total : 0,
      // Si no cuadra, es señal de datos inconsistentes y hay que avisarlo
      descuadre: totalVendido - totalDesglosado
    }
  }, [sales, mediosPago])

  const base = parseFloat(baseInicial) || 0
  const efectivoEsperado = base + resumen.efectivoVentas
  const hayConteo = conteoFisico !== ''
  const diferencia = hayConteo ? (parseFloat(conteoFisico) || 0) - efectivoEsperado : 0

  const formatDateLabel = (dateStr) => {
    if (dateStr === getTodayColombia()) return 'Hoy'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="cierre-page">
      <div className="cierre-header">
        <h1 className="cierre-title">🧾 Cierre de Caja</h1>
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

          <div className="cierre-card">
            <h2 className="cierre-card-title">Arqueo de efectivo</h2>

            <div className="cierre-field">
              <label className="cierre-label">Base inicial en caja</label>
              <div className="cierre-money">
                <span className="cierre-money-symbol">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatInput(baseInicial)}
                  onChange={(e) => setBaseInicial(parseCOP(e.target.value))}
                  className="cierre-input"
                />
              </div>
            </div>

            <div className="cierre-row">
              <span>Ventas en efectivo</span>
              <span className="cierre-row-value">{formatCOP(resumen.efectivoVentas)}</span>
            </div>

            <div className="cierre-row cierre-row-strong">
              <span>Efectivo esperado en caja</span>
              <span className="cierre-row-value">{formatCOP(efectivoEsperado)}</span>
            </div>

            <div className="cierre-field">
              <label className="cierre-label">Efectivo contado</label>
              <div className="cierre-money">
                <span className="cierre-money-symbol">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatInput(conteoFisico)}
                  onChange={(e) => setConteoFisico(parseCOP(e.target.value))}
                  className="cierre-input"
                />
              </div>
            </div>

            {hayConteo && (
              <div
                className={`cierre-diferencia ${
                  diferencia === 0 ? 'dif-ok' : diferencia > 0 ? 'dif-sobra' : 'dif-falta'
                }`}
              >
                {diferencia === 0
                  ? '✅ La caja cuadra exactamente'
                  : diferencia > 0
                    ? `⬆️ Sobran ${formatCOP(diferencia)} en caja`
                    : `⬇️ Faltan ${formatCOP(Math.abs(diferencia))} en caja`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default CierreCajaPage
