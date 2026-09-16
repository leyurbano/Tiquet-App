import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { devolucionService } from '../services/devolucionService'
import { perfilService } from '../services/perfilService'
import { etiquetaMotivoDevolucion } from '../utils/motivosDevolucion'
import { fiadoService } from '../services/fiadoService'
import { clientService } from '../services/clientService'
import dayjs from 'dayjs'
import './CierreCajaPage.css'
import { Wallet, TrendingUp, Receipt, AlertTriangle, Percent, Package, ArrowRight } from 'lucide-react'

const TZ = 'America/Bogota'
const TOPE_LISTA = 8      // cuántos movimientos se muestran antes de "ver todos"
const MAX_DIAS_GRAFICA = 92

const hoy = () => getTodayColombia()
const haceDias = (n) => dayjs(getTodayColombia()).subtract(n, 'day').format('YYYY-MM-DD')
const inicioDeMes = () => dayjs(getTodayColombia()).startOf('month').format('YYYY-MM-DD')

const RANGOS = [
  { id: 'hoy', etiqueta: 'Hoy', desde: hoy, hasta: hoy },
  { id: 'ayer', etiqueta: 'Ayer', desde: () => haceDias(1), hasta: () => haceDias(1) },
  { id: '7d', etiqueta: '7 días', desde: () => haceDias(6), hasta: hoy },
  { id: 'mes', etiqueta: 'Este mes', desde: inicioDeMes, hasta: hoy }
]

/** Variación contra el período anterior, o null si no hay con qué comparar. */
const variacion = (actual, anterior) => {
  if (!anterior || anterior <= 0) return null
  return ((actual - anterior) / anterior) * 100
}

const Comparacion = ({ valor }) => {
  if (valor === null || !isFinite(valor)) return null
  const sube = valor >= 0
  return (
    <span className={`cierre-var ${sube ? 'cierre-var-sube' : 'cierre-var-baja'}`}>
      {sube ? '▲' : '▼'} {Math.abs(valor).toFixed(0)}% vs. antes
    </span>
  )
}

/**
 * Lista de movimientos (abonos, devoluciones, anuladas, deudas).
 *
 * En vez de una tabla de tres columnas —ilegible en celular— cada fila tiene
 * su texto principal, un detalle en gris debajo y el monto a la derecha.
 * Se muestran los primeros y el resto queda tras "ver todos": un mes movido
 * dejaba una pantalla interminable.
 */
function ListaMovimientos({ titulo, nota, items, total, totalEtiqueta, negativo = false, accion }) {
  const [verTodos, setVerTodos] = useState(false)
  const visibles = verTodos ? items : items.slice(0, TOPE_LISTA)

  return (
    <div className="cierre-card">
      <div className="cierre-card-head">
        <h2 className="cierre-card-title">{titulo}</h2>
        {accion && (
          <button type="button" className="cierre-accion" onClick={accion.onClick}>
            {accion.etiqueta} <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {nota && <p className="cierre-hint">{nota}</p>}

      <ul className="cierre-lista">
        {visibles.map((i) => (
          <li className="cierre-lista-item" key={i.clave}>
            <span className="cierre-lista-texto">
              <strong>{i.titulo}</strong>
              {i.detalle && <span>{i.detalle}</span>}
            </span>
            <span className={`cierre-lista-monto ${negativo ? 'cierre-anulada-monto' : ''}`}>
              {negativo ? '−' : ''}{formatCOP(i.monto)}
            </span>
          </li>
        ))}
      </ul>

      {items.length > TOPE_LISTA && (
        <button type="button" className="cierre-ver-mas" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      )}

      {total !== undefined && (
        <p className="cierre-lista-total">
          <span>{totalEtiqueta}</span>
          <strong className={negativo ? 'cierre-anulada-monto' : ''}>
            {negativo ? '−' : ''}{formatCOP(total)}
          </strong>
        </p>
      )}
    </div>
  )
}

/**
 * Reportes del negocio: cuánto se vendió, cuánto se ganó de verdad y qué
 * productos lo generaron. El arqueo de efectivo no vive aquí, sino en los
 * modales de apertura y cierre de caja, atados al turno del usuario.
 *
 * 🔧 Antes todo era lenguaje contable y tablas: "Rentabilidad del período",
 * "Ingresos por ventas", "Ticket promedio". Ahora arranca con una frase en
 * español corriente, compara contra el período anterior y dibuja las ventas
 * por día, que es como se entiende de una ojeada si el negocio va bien.
 */
function CierreCajaPage() {
  // Solo administradores: los reportes muestran costos, ganancia y márgenes
  const { esAdministrador } = useAuth()
  const navigate = useNavigate()
  const [ventas, setVentas] = useState([])
  const [mediosPago, setMediosPago] = useState([])
  const [anuladas, setAnuladas] = useState([])
  const [devoluciones, setDevoluciones] = useState([])
  // Para mostrar quién hizo cada devolución
  const [usuarios, setUsuarios] = useState([])
  const [abonos, setAbonos] = useState([])
  // Mismo cálculo para el período anterior, para poder comparar
  const [previo, setPrevio] = useState(null)
  // Cuentas por cobrar: saldo de fiado de cada cliente (no depende del período)
  const [saldos, setSaldos] = useState(null)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [rangoActivo, setRangoActivo] = useState('hoy')

  useEffect(() => {
    if (!esAdministrador) return
    salesService.getMediosPago().then(setMediosPago)
    perfilService.getPerfiles().then(setUsuarios)
    fiadoService.getSaldos().then(setSaldos)
    clientService.getAllClients().then(setClientes)
  }, [esAdministrador])

  useEffect(() => {
    if (esAdministrador) cargar(desde, hasta)
  }, [desde, hasta, esAdministrador])

  const cargar = async (d, h) => {
    setLoading(true)
    setError(false)

    const inicio = dayjs.tz(`${d} 00:00:00`, TZ).toISOString()
    const fin = dayjs.tz(`${h} 23:59:59`, TZ).toISOString()

    // Período anterior del mismo largo, para comparar
    const dias = dayjs(h).diff(dayjs(d), 'day') + 1
    const desdePrevio = dayjs(d).subtract(dias, 'day').format('YYYY-MM-DD')
    const hastaPrevio = dayjs(d).subtract(1, 'day').format('YYYY-MM-DD')
    const inicioPrevio = dayjs.tz(`${desdePrevio} 00:00:00`, TZ).toISOString()
    const finPrevio = dayjs.tz(`${hastaPrevio} 23:59:59`, TZ).toISOString()

    const [datos, canceladas, devs, abs, datosPrevio, devsPrevio] = await Promise.all([
      salesService.getSalesForReport(d, h),
      salesService.getAnnulledSales(inicio, fin),
      devolucionService.getDevolucionesPeriodo(inicio, fin),
      fiadoService.getAbonosPeriodo(inicio, fin),
      salesService.getSalesForReport(desdePrevio, hastaPrevio),
      devolucionService.getDevolucionesPeriodo(inicioPrevio, finPrevio)
    ])

    // null = la consulta falló; distinto de [] , que es "no hubo ventas".
    // Sin las devoluciones, la ganancia saldría inflada.
    if (datos === null || devs === null) {
      setError(true)
      setVentas([])
      setDevoluciones([])
    } else {
      setVentas(datos)
      setDevoluciones(devs)
    }
    setAnuladas(canceladas)
    setAbonos(abs || [])
    // La comparación es un extra: si falla, la pantalla sigue funcionando
    setPrevio(datosPrevio && devsPrevio ? buildReportSummary(datosPrevio, devsPrevio) : null)
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
  const rep = useMemo(() => buildReportSummary(ventas, devoluciones), [ventas, devoluciones])
  const nombreUsuario = (id) => usuarios.find((u) => u.id === id)?.nombre || 'Usuario'

  // Ventas de cada día del período (ya descontadas las devoluciones de ese día)
  const porDia = useMemo(() => {
    if (desde === hasta) return []
    const fin = dayjs(hasta)
    if (fin.diff(dayjs(desde), 'day') > MAX_DIAS_GRAFICA) return []

    const dias = {}
    for (let c = dayjs(desde); !c.isAfter(fin); c = c.add(1, 'day')) {
      dias[c.format('YYYY-MM-DD')] = 0
    }
    ventas.forEach((v) => {
      const k = dayjs(v.fecha).tz(TZ).format('YYYY-MM-DD')
      if (k in dias) dias[k] += Number(v.total) || 0
    })
    devoluciones.forEach((d) => {
      const k = dayjs(d.fecha).tz(TZ).format('YYYY-MM-DD')
      if (k in dias) dias[k] -= Number(d.total) || 0
    })
    return Object.entries(dias).map(([dia, total]) => ({ dia, total }))
  }, [ventas, devoluciones, desde, hasta])

  const maxDia = Math.max(...porDia.map((d) => d.total), 1)
  const mejorDia = porDia.reduce((a, b) => (b.total > (a?.total ?? -Infinity) ? b : a), null)

  const porCobrar = useMemo(() => {
    if (!saldos) return null
    const conDeuda = Object.values(saldos)
      .filter((s) => s.saldo > 0)
      .map((s) => ({
        ...s,
        nombre: clientes.find((c) => c.id === s.cliente_id)?.nombre || `Cliente #${s.cliente_id}`
      }))
      .sort((a, b) => b.saldo - a.saldo)
    return { total: conDeuda.reduce((t, s) => t + s.saldo, 0), clientes: conDeuda }
  }, [saldos, clientes])

  const totalAbonos = abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0)
  const totalAnuladas = anuladas.reduce((s, v) => s + (Number(v.total) || 0), 0)

  const hayVentas = !loading && !error && ventas.length > 0
  const primeraCarga = loading && ventas.length === 0
  const sinDatos =
    rep.cantidadVentas === 0 && anuladas.length === 0 && devoluciones.length === 0 && abonos.length === 0
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

  // "Hoy", "El 12/09" o "Del 01/09 al 15/09": arranque de la frase de resumen
  const inicioFrase = () => {
    if (desde === hasta) {
      if (desde === getTodayColombia()) return 'Hoy'
      if (desde === haceDias(1)) return 'Ayer'
      return `El ${dayjs(desde).format('DD/MM')}`
    }
    return `Del ${dayjs(desde).format('DD/MM')} al ${dayjs(hasta).format('DD/MM')}`
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
        <div className="exportar-bloque">
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
          {!hayVentas && !loading && !error && (
            <p className="cierre-hint cierre-hint-export">
              Elige un período con ventas para poder descargar.
            </p>
          )}
        </div>
      </div>

      {/* ---------- Selector de período ---------- */}
      <div className="rango-barra">
        <div className="rango-botones">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => aplicarRango(r)}
              className={`rango-btn ${rangoActivo === r.id ? 'rango-activo' : ''}`}
              aria-pressed={rangoActivo === r.id}
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
            aria-label="Desde"
          />
          <span className="rango-sep">→</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={getTodayColombia()}
            onChange={(e) => cambiarFecha('hasta', e.target.value)}
            className="rango-input"
            aria-label="Hasta"
          />
        </div>
      </div>

      {/* Dinero por cobrar: va arriba porque es plata pendiente, no un dato más */}
      {porCobrar && porCobrar.total > 0 && (
        <ListaMovimientos
          titulo={`Te deben ${formatCOP(porCobrar.total)}`}
          nota="Ventas fiadas sin pagar, sin importar el período elegido."
          items={porCobrar.clientes.map((c) => ({
            clave: c.cliente_id,
            titulo: c.nombre,
            monto: c.saldo
          }))}
          accion={{ etiqueta: 'Cobrar en Clientes', onClick: () => navigate('/clients') }}
        />
      )}

      {primeraCarga ? (
        <div className="cierre-loading">⏳ Cargando...</div>
      ) : error ? (
        <div className="cierre-alert">
          <AlertTriangle size={16} />
          <span>
            No se pudieron cargar las ventas del período. Revisa tu conexión e
            inténtalo de nuevo.
          </span>
        </div>
      ) : sinDatos ? (
        <div className="cierre-vacio">
          <p className="cierre-empty">📭 No hubo ventas {etiquetaRango()}</p>
          <button type="button" className="cierre-accion" onClick={() => aplicarRango(RANGOS[2])}>
            Ver los últimos 7 días <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        // Al cambiar de período los datos anteriores se atenúan en vez de
        // desaparecer: cambiar de rango se siente instantáneo
        <div className={loading ? 'cierre-actualizando' : ''}>

          {/* ---------- Resumen en una frase ---------- */}
          <p className="cierre-frase">
            {inicioFrase()} vendiste <strong>{formatCOP(rep.ingresoNeto)}</strong> en{' '}
            <strong>{rep.cantidadVentas}</strong> {rep.cantidadVentas === 1 ? 'venta' : 'ventas'}
            {rep.ingresoNeto > 0 && (
              <> y te quedaron <strong className="cierre-frase-ganancia">{formatCOP(rep.ganancia)}</strong> ({formatPct(rep.margen)})</>
            )}.
          </p>

          {/* ---------- Cifras principales ---------- */}
          <div className="cierre-stats">
            <div className="cierre-stat">
              <Receipt size={18} />
              <span className="cierre-stat-label">Ventas</span>
              <span className="cierre-stat-value">{rep.cantidadVentas}</span>
              <Comparacion valor={variacion(rep.cantidadVentas, previo?.cantidadVentas)} />
            </div>
            <div className="cierre-stat">
              <TrendingUp size={18} />
              <span className="cierre-stat-label">Vendido</span>
              <span className="cierre-stat-value">{formatCOP(rep.ingresoNeto)}</span>
              {rep.totalDevuelto > 0 ? (
                <span className="cierre-stat-extra">ya sin {formatCOP(rep.totalDevuelto)} devueltos</span>
              ) : (
                <Comparacion valor={variacion(rep.ingresoNeto, previo?.ingresoNeto)} />
              )}
            </div>
            <div className="cierre-stat stat-ganancia">
              <Percent size={18} />
              <span className="cierre-stat-label">Te quedó</span>
              <span className="cierre-stat-value">{formatCOP(rep.ganancia)}</span>
              <span className="cierre-stat-extra">de cada $100, te quedan {formatPct(rep.margen).replace('%', '')}</span>
            </div>
            <div className="cierre-stat">
              <Wallet size={18} />
              <span className="cierre-stat-label">Venta promedio</span>
              <span className="cierre-stat-value">{formatCOP(rep.ticketPromedio)}</span>
              <Comparacion valor={variacion(rep.ticketPromedio, previo?.ticketPromedio)} />
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

          {/* ---------- Ventas por día ---------- */}
          {porDia.length > 1 && (
            <div className="cierre-card">
              <h2 className="cierre-card-title">Ventas por día</h2>
              <div className="grafica">
                {porDia.map((d) => (
                  <div
                    className={`grafica-col ${d.total > 0 && d.total === mejorDia?.total ? 'grafica-mejor' : ''}`}
                    key={d.dia}
                    title={`${dayjs(d.dia).format('DD/MM/YYYY')}: ${formatCOP(d.total)}`}
                  >
                    <span className="grafica-valor">{d.total > 0 ? formatCOP(d.total) : ''}</span>
                    <div
                      className="grafica-barra"
                      style={{ height: `${Math.max((d.total / maxDia) * 100, d.total > 0 ? 4 : 1)}%` }}
                    />
                    <span className="grafica-dia">{dayjs(d.dia).format('DD/MM')}</span>
                  </div>
                ))}
              </div>
              {mejorDia && mejorDia.total > 0 && (
                <p className="cierre-hint">
                  El mejor día fue el {dayjs(mejorDia.dia).format('DD/MM')} con {formatCOP(mejorDia.total)}.
                </p>
              )}
            </div>
          )}

          {/* ---------- Cómo te fue ---------- */}
          <div className="cierre-card">
            <h2 className="cierre-card-title">Cómo te fue</h2>
            <table className="cierre-table">
              <tbody>
                <tr>
                  <td className="cierre-medio">Ventas del período</td>
                  <td className="cierre-medio-total">{formatCOP(rep.totalVendido)}</td>
                </tr>
                {rep.totalDevuelto > 0 && (
                  <>
                    <tr>
                      <td className="cierre-medio">Devoluciones ({rep.cantidadDevoluciones})</td>
                      <td className="cierre-medio-total cierre-anulada-monto">
                        −{formatCOP(rep.totalDevuelto)}
                      </td>
                    </tr>
                    <tr className="fila-subtotal">
                      <td className="cierre-medio">Te entró en total</td>
                      <td className="cierre-medio-total">{formatCOP(rep.ingresoNeto)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td className="cierre-medio">Te costó la mercancía</td>
                  <td className="cierre-medio-total cierre-anulada-monto">
                    −{formatCOP(rep.totalCosto)}
                  </td>
                </tr>
                <tr className="fila-total">
                  <td className="cierre-medio">Te quedó</td>
                  <td className="cierre-medio-total">
                    {formatCOP(rep.ganancia)} · {formatPct(rep.margen)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="cierre-hint">
              Es lo que queda después de pagar la mercancía. Todavía no descuenta
              arriendo, servicios ni sueldos.
            </p>
          </div>

          {/* ---------- Productos ---------- */}
          {rep.productos.length > 0 && (
            <div className="cierre-card">
              <h2 className="cierre-card-title">
                <Package size={18} /> Los que más te venden
              </h2>
              <p className="cierre-hint">Ordenados por dinero vendido en el período.</p>
              <div className="tabla-scroll">
                <table className="cierre-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Unid.</th>
                      <th className="num">Vendido</th>
                      <th className="num">Te quedó</th>
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
                  Mostrando los 20 que más dinero dejaron, de {rep.productos.length} en total.
                </p>
              )}
            </div>
          )}

          {/* ---------- Medios de pago ---------- */}
          <div className="cierre-card">
            <h2 className="cierre-card-title">Cómo te pagaron</h2>
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
                  Hay {formatCOP(Math.abs(caja.descuadre))} en ventas que no quedaron
                  clasificadas por medio de pago.
                </span>
              </div>
            )}
          </div>

          {/* ---------- Abonos de fiado ---------- */}
          {abonos.length > 0 && (
            <ListaMovimientos
              titulo={`Abonos de fiado (${abonos.length})`}
              nota="Pagos de deudas anteriores. No son ventas nuevas: no suman a lo vendido ni a lo que te quedó."
              items={abonos.map((a) => ({
                clave: a.id,
                titulo: a.clientes?.nombre || 'Cliente',
                detalle: `Abono #${a.id} · ${a.medios_pago?.pago || 'Sin medio'}`,
                monto: Number(a.monto) || 0
              }))}
              total={totalAbonos}
              totalEtiqueta="Total abonado"
            />
          )}

          {/* ---------- Devoluciones ---------- */}
          {devoluciones.length > 0 && (
            <ListaMovimientos
              titulo={`Devoluciones (${devoluciones.length})`}
              nota="Ya están descontadas de los totales de arriba, en el día en que se hicieron."
              items={devoluciones.map((d) => ({
                clave: d.id,
                titulo: `Devolución #${d.id} · venta #${d.venta_id}`,
                detalle: `${nombreUsuario(d.user_id)} · ${etiquetaMotivoDevolucion(d.motivo)} · ${d.medios_pago?.pago || 'Sin medio'}`,
                monto: Number(d.total) || 0
              }))}
              total={rep.totalDevuelto}
              totalEtiqueta="Total devuelto"
              negativo
            />
          )}

          {/* ---------- Anuladas ---------- */}
          {anuladas.length > 0 && (
            <ListaMovimientos
              titulo={`Ventas anuladas (${anuladas.length})`}
              nota="No están incluidas en los totales de arriba. Se listan como control."
              items={anuladas.map((v) => ({
                clave: v.id,
                titulo: `Venta #${v.id}`,
                detalle: etiquetaMotivo(v.motivo_anulacion),
                monto: Number(v.total) || 0
              }))}
              total={totalAnuladas}
              totalEtiqueta="Total anulado"
              negativo
            />
          )}
        </div>
      )}
    </div>
  )
}

export default CierreCajaPage
