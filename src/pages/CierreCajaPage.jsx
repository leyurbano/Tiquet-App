import React, { useState, useEffect, useMemo } from 'react'
import { salesService } from '../services/salesService'
import { buildCashSummary } from '../utils/cashSummary'
import { buildReportSummary, formatPct } from '../utils/reportSummary'
import { formatCOP } from '../utils/currencyFormatter'
import { getTodayColombia } from '../utils/dateFormatter'
import { etiquetaMotivo } from '../utils/motivosAnulacion'
import { descargarCSV } from '../utils/csv'
import { filasVentas, filasProductos } from '../utils/exportarReportes'
import { toast } from '../utils/toast'
import { useAuth } from '../contexts/AuthContext'
import dayjs from 'dayjs'
import './CierreCajaPage.css'
import { Wallet, TrendingUp, Receipt, AlertTriangle, Percent, Package } from 'lucide-react'

const hoy = () => getTodayColombia()
const haceDias = (n) => dayjs(getTodayColombia()).subtract(n, 'day').format('YYYY-MM-DD')
const inicioDeMes = () => dayjs(getTodayColombia()).startOf('month').format('YYYY-MM-DD')

const RANGOS = [
  { id: 'hoy', etiqueta: 'Hoy', desde: hoy, hasta: hoy },
  { id: 'ayer', etiqueta: 'Ayer', desde: () => haceDias(1), hasta: () => haceDias(1) },
  { id: '7d', etiqueta: '7 días', desde: () => haceDias(6), hasta: hoy },
  { id: 'mes', etiqueta: 'Este mes', desde: inicioDeMes, hasta: hoy }
]

/**
 * Reportes del negocio: cuánto se vendió, cuánto se ganó de verdad y qué
 * productos lo generaron. El arqueo de efectivo no vive aquí, sino en los
 * modales de apertura y cierre de caja, atados al turno del usuario.
 */
function CierreCajaPage() {
  // Solo administradores: los reportes muestran costos, ganancia y márgenes
  const { esAdministrador } = useAuth()
  const [ventas, setVentas] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [anuladas, setAnuladas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [rangoActivo, setRangoActivo] = useState('hoy')

  useEffect(() => {
    if (esAdministrador) salesService.getMediosPago().then(setMediosPago)
  }, [esAdministrador])

  useEffect(() => {
    if (esAdministrador) cargar(desde, hasta)
  }, [desde, hasta, esAdministrador])

  const cargar = async (d, h) => {
    setLoading(true)
    setError(false)

    const inicio = dayjs.tz(`${d} 00:00:00`, 'America/Bogota').toISOString()
    const fin = dayjs.tz(`${h} 23:59:59`, 'America/Bogota').toISOString()

    const [datos, canceladas] = await Promise.all([
      salesService.getSalesForReport(d, h),
      salesService.getAnnulledSales(inicio, fin)
    ])

    // null = la consulta falló; distinto de [] , que es "no hubo ventas"
    if (datos === null) {
      setError(true)
      setVentas([])
    } else {
      setVentas(datos)
    }
    setAnuladas(canceladas)
    setLoading(false)
  }

  const aplicarRango = (r) => {
    setRangoActivo(r.id)
    setDesde(r.desde())
    setHasta(r.hasta())
  }

  const cambiarFecha = (campo, valor) => {
    setRangoActivo(null)
    if (campo === 'desde') setDesde(valor)
    else setHasta(valor)
  }

  const caja = useMemo(() => buildCashSummary(ventas, mediosPago), [ventas, mediosPago])
  const rep = useMemo(() => buildReportSummary(ventas), [ventas])

  const hayVentas = !loading && !error && ventas.length > 0
  const sufijoArchivo = () => (desde === hasta ? desde : `${desde}_a_${hasta}`)

  const exportarVentas = () => {
    const { columnas, filas } = filasVentas(ventas, mediosPago)
    descargarCSV(`ventas_${sufijoArchivo()}.csv`, columnas, filas)
    toast.exito(`${filas.length} ${filas.length === 1 ? 'venta exportada' : 'ventas exportadas'}`)
  }

  const exportarProductos = () => {
    const { columnas, filas } = filasProductos(rep.productos)
    descargarCSV(`productos_${sufijoArchivo()}.csv`, columnas, filas)
    toast.exito(`${filas.length} ${filas.length === 1 ? 'producto exportado' : 'productos exportados'}`)
  }

  const etiquetaRango = () => {
    if (desde === hasta) {
      return desde === getTodayColombia() ? 'hoy' : dayjs(desde).format('DD/MM/YYYY')
    }
    return `${dayjs(desde).format('DD/MM')} – ${dayjs(hasta).format('DD/MM/YYYY')}`
  }

  if (!esAdministrador) {
    return (
      <div className="cierre-page">
        <p className="cierre-empty">Los reportes son solo para administradores del negocio.</p>
      </div>
    )
  }

  return (
    <div className="cierre-page">
      <div className="cierre-header">
        <h1 className="cierre-title">📊 Reportes</h1>
        {/* Exportan el período elegido abajo; las ventas anuladas no se incluyen */}
        <div className="exportar-botones">
          <button
            type="button"
            className="exportar-btn"
            onClick={exportarVentas}
            disabled={!hayVentas}
            title="Una fila por venta, con una columna por medio de pago"
          >
            ⬇ Ventas (Excel)
          </button>
          <button
            type="button"
            className="exportar-btn"
            onClick={exportarProductos}
            disabled={!hayVentas}
            title="Unidades, vendido, costo, ganancia y margen por producto"
          >
            ⬇ Productos (Excel)
          </button>
        </div>
      </div>

      {/* ---------- Selector de período ---------- */}
      <div className="rango-barra">
        <div className="rango-botones">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              onClick={() => aplicarRango(r)}
              className={`rango-btn ${rangoActivo === r.id ? 'rango-activo' : ''}`}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
        <div className="rango-fechas">
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => cambiarFecha('desde', e.target.value)}
            className="rango-input"
          />
          <span className="rango-sep">→</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={getTodayColombia()}
            onChange={(e) => cambiarFecha('hasta', e.target.value)}
            className="rango-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="cierre-loading">⏳ Cargando...</div>
      ) : error ? (
        <div className="cierre-alert">
          <AlertTriangle size={16} />
          <span>
            No se pudieron cargar las ventas del período. Revisa tu conexión e
            inténtalo de nuevo.
          </span>
        </div>
      ) : rep.cantidadVentas === 0 && anuladas.length === 0 ? (
        <p className="cierre-empty">📭 No hay ventas registradas {etiquetaRango()}</p>
      ) : (
        <>
          {/* ---------- Cifras principales ---------- */}
          <div className="cierre-stats">
            <div className="cierre-stat">
              <Receipt size={18} />
              <span className="cierre-stat-label">Ventas</span>
              <span className="cierre-stat-value">{rep.cantidadVentas}</span>
            </div>
            <div className="cierre-stat">
              <TrendingUp size={18} />
              <span className="cierre-stat-label">Vendido</span>
              <span className="cierre-stat-value">{formatCOP(rep.totalVendido)}</span>
            </div>
            <div className="cierre-stat stat-ganancia">
              <Percent size={18} />
              <span className="cierre-stat-label">Ganancia</span>
              <span className="cierre-stat-value">{formatCOP(rep.ganancia)}</span>
              <span className="cierre-stat-extra">margen {formatPct(rep.margen)}</span>
            </div>
            <div className="cierre-stat">
              <Wallet size={18} />
              <span className="cierre-stat-label">Ticket promedio</span>
              <span className="cierre-stat-value">{formatCOP(rep.ticketPromedio)}</span>
            </div>
          </div>

          {rep.lineasSinCosto > 0 && (
            <div className="cierre-alert">
              <AlertTriangle size={16} />
              <span>
                {rep.lineasSinCosto} línea{rep.lineasSinCosto !== 1 ? 's' : ''} de venta
                sin costo registrado. Son anteriores a que el sistema lo guardara, así
                que su margen es aproximado.
              </span>
            </div>
          )}

          {/* ---------- Rentabilidad ---------- */}
          <div className="cierre-card">
            <h2 className="cierre-card-title">Rentabilidad del período</h2>
            <table className="cierre-table">
              <tbody>
                <tr>
                  <td className="cierre-medio">Ingresos por ventas</td>
                  <td className="cierre-medio-total">{formatCOP(rep.totalVendido)}</td>
                </tr>
                <tr>
                  <td className="cierre-medio">Costo de lo vendido</td>
                  <td className="cierre-medio-total cierre-anulada-monto">
                    −{formatCOP(rep.totalCosto)}
                  </td>
                </tr>
                <tr className="fila-total">
                  <td className="cierre-medio">Ganancia bruta</td>
                  <td className="cierre-medio-total">
                    {formatCOP(rep.ganancia)} · {formatPct(rep.margen)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="cierre-hint">
              Ganancia bruta: no descuenta arriendo, servicios ni sueldos.
            </p>
          </div>

          {/* ---------- Productos ---------- */}
          {rep.productos.length > 0 && (
            <div className="cierre-card">
              <h2 className="cierre-card-title">
                <Package size={18} /> Productos más vendidos
              </h2>
              <div className="tabla-scroll">
                <table className="cierre-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Unid.</th>
                      <th className="num">Vendido</th>
                      <th className="num">Ganancia</th>
                      <th className="num">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.productos.slice(0, 20).map((p) => (
                      <tr key={p.id}>
                        <td className="cierre-medio">{p.nombre}</td>
                        <td className="cierre-medio-total">{p.unidades}</td>
                        <td className="cierre-medio-total">{formatCOP(p.ingreso)}</td>
                        <td className="cierre-medio-total">{formatCOP(p.ganancia)}</td>
                        <td className={`cierre-medio-total ${p.margen < 0 ? 'margen-negativo' : ''}`}>
                          {formatPct(p.margen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rep.productos.length > 20 && (
                <p className="cierre-hint">
                  Mostrando los 20 de mayor facturación, de {rep.productos.length} en total.
                </p>
              )}
            </div>
          )}

          {/* ---------- Medios de pago ---------- */}
          <div className="cierre-card">
            <h2 className="cierre-card-title">Desglose por medio de pago</h2>
            <table className="cierre-table">
              <tbody>
                {Object.entries(caja.porMedio)
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
                {caja.totalSinMedio > 0 && (
                  <tr>
                    <td className="cierre-medio cierre-medio-warn">Sin medio registrado</td>
                    <td className="cierre-medio-count">—</td>
                    <td className="cierre-medio-total">{formatCOP(caja.totalSinMedio)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {Math.abs(caja.descuadre) > 0.01 && (
              <div className="cierre-alert">
                <AlertTriangle size={16} />
                <span>
                  El desglose no coincide con el total vendido: faltan{' '}
                  {formatCOP(Math.abs(caja.descuadre))} por clasificar.
                </span>
              </div>
            )}
          </div>

          {/* ---------- Anuladas ---------- */}
          {anuladas.length > 0 && (
            <div className="cierre-card">
              <h2 className="cierre-card-title">Ventas anuladas ({anuladas.length})</h2>
              <p className="cierre-hint">
                No están incluidas en los totales de arriba. Se listan como control.
              </p>
              <table className="cierre-table">
                <tbody>
                  {anuladas.map((v) => (
                    <tr key={v.id}>
                      <td className="cierre-medio">Venta #{v.id}</td>
                      <td className="cierre-medio-count">{etiquetaMotivo(v.motivo_anulacion)}</td>
                      <td className="cierre-medio-total cierre-anulada-monto">
                        −{formatCOP(v.total || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CierreCajaPage
