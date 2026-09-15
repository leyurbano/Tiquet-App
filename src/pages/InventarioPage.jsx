import React, { useState, useEffect, useMemo, useRef } from 'react'
import { productService } from '../services/productService'
import { inventarioService } from '../services/inventarioService'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombiaShort } from '../utils/dateFormatter'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import './InventarioPage.css'
import { PackagePlus, Trash2, ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import AjusteInventario from '../components/AjusteInventario'
import ImportarProductos from '../components/ImportarProductos'

// Mismo cálculo que hace registrar_entrada en la base de datos: promedio
// ponderado entre lo que había y lo que llega. Aquí solo se usa para mostrar
// la vista previa; el valor que se guarda lo calcula la base de datos.
const costoPromedio = (stock, costoActual, cantidad, costoNuevo) =>
  stock <= 0
    ? costoNuevo
    : (stock * costoActual + cantidad * costoNuevo) / (stock + cantidad)

// Misma comparación que usa la base de datos para detectar nombres repetidos
const normalizar = (texto) => (texto || '').trim().toLowerCase()

const VACIO = { proveedor: '', factura: '', nota: '' }

/**
 * Inventario: entradas de mercancía y ajustes por conteo.
 *
 * 🔧 Antes la única forma de subir el stock era abrir cada producto y
 * sobrescribir la cantidad con el total calculado a mano: lento, propenso a
 * errores y sin rastro de que había sido una compra.
 *
 * Una entrada también puede crear productos que aún no están en el catálogo.
 * Se crean dentro de la misma transacción que la entrada: si la entrada no
 * se registra, el producto tampoco queda creado.
 *
 * Solo administradores. La base de datos lo exige igual (registrar_entrada).
 */
function InventarioPage() {
  const { esAdministrador } = useAuth()
  const [productos, setProductos] = useState([])
  const [entradas, setEntradas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [lineas, setLineas] = useState([])
  const [cabecera, setCabecera] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [pestana, setPestana] = useState('entradas')
  // Formulario del producto nuevo que se está por agregar (o null)
  const [nuevoForm, setNuevoForm] = useState(null)
  // Las líneas de productos nuevos aún no tienen id: se identifican con esto
  const contadorNuevos = useRef(0)

  const cargar = async () => {
    setCargando(true)
    const [resultado, recientes] = await Promise.all([
      productService.getTodosLosProductos(),
      inventarioService.getEntradasRecientes()
    ])
    setProductos(resultado.data || [])
    setEntradas(recientes)
    setCargando(false)
  }

  useEffect(() => {
    if (esAdministrador) cargar()
  }, [esAdministrador])

  // Hasta 8 coincidencias por descripción o por número de producto
  const sugerencias = useMemo(() => {
    const t = normalizar(busqueda)
    if (!t) return []
    return productos
      .filter((p) => normalizar(p.descripcion).includes(t) || String(p.id) === t)
      .slice(0, 8)
  }, [busqueda, productos])

  // Solo se ofrece crear si no hay un producto con exactamente ese nombre
  const existeExacto = productos.some((p) => normalizar(p.descripcion) === normalizar(busqueda))

  const agregar = (p) => {
    if (lineas.some((l) => l.producto_id === p.id)) {
      toast.aviso(`"${p.descripcion}" ya está en la entrada`)
      return
    }
    setLineas((prev) => [
      ...prev,
      {
        clave: `p-${p.id}`,
        producto_id: p.id,
        descripcion: p.descripcion,
        stock: Number(p.cantidad) || 0,
        costoActual: Number(p.costo) || 0,
        cantidad: '',
        // Se sugiere el costo actual; se cambia si el proveedor subió el precio
        costo: String(Math.round(Number(p.costo) || 0))
      }
    ])
    setBusqueda('')
  }

  const abrirNuevo = () => {
    setNuevoForm({ descripcion: busqueda.trim(), precio: '', stockMinimo: '' })
    setBusqueda('')
  }

  const agregarNuevo = () => {
    const descripcion = nuevoForm.descripcion.trim()
    if (!descripcion) return toast.aviso('Escribe el nombre del producto nuevo')
    if (nuevoForm.precio === '') return toast.aviso('Escribe el precio de venta del producto nuevo')

    const existente = productos.find((p) => normalizar(p.descripcion) === normalizar(descripcion))
    if (existente) {
      return toast.aviso(`Ya existe "${existente.descripcion}": búscalo y agrégalo en vez de crearlo`)
    }
    if (lineas.some((l) => l.esNuevo && normalizar(l.descripcion) === normalizar(descripcion))) {
      return toast.aviso(`"${descripcion}" ya está en la entrada como producto nuevo`)
    }

    contadorNuevos.current += 1
    setLineas((prev) => [
      ...prev,
      {
        clave: `n-${contadorNuevos.current}`,
        producto_id: null,
        esNuevo: true,
        descripcion,
        precio_venta: Number(nuevoForm.precio) || 0,
        stock_minimo: nuevoForm.stockMinimo === '' ? null : Number(nuevoForm.stockMinimo),
        stock: 0,
        costoActual: 0,
        cantidad: '',
        costo: ''
      }
    ])
    setNuevoForm(null)
  }

  const editarLinea = (clave, campo, valor) =>
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)))

  const quitarLinea = (clave) => setLineas((prev) => prev.filter((l) => l.clave !== clave))

  const total = lineas.reduce(
    (s, l) => s + (parseInt(l.cantidad, 10) || 0) * (parseFloat(l.costo) || 0), 0
  )

  const guardar = async () => {
    if (lineas.length === 0) return toast.aviso('Agrega al menos un producto')

    const invalida = lineas.find((l) => !(parseInt(l.cantidad, 10) > 0) || l.costo === '')
    if (invalida) {
      return toast.aviso(`Revisa "${invalida.descripcion}": falta la cantidad o el costo`)
    }

    setGuardando(true)
    const { entrada, error } = await inventarioService.registrarEntrada({
      ...cabecera,
      items: lineas.map((l) => {
        const base = {
          cantidad: parseInt(l.cantidad, 10),
          costo_unitario: parseFloat(l.costo) || 0
        }
        return l.esNuevo
          ? {
              ...base,
              nuevo: {
                descripcion: l.descripcion,
                precio_venta: l.precio_venta,
                stock_minimo: l.stock_minimo
              }
            }
          : { ...base, producto_id: l.producto_id }
      })
    })
    setGuardando(false)

    if (error) return toast.error('No se pudo registrar la entrada: ' + error)

    const creados = entrada.productos_creados?.length || 0
    toast.exito(
      `Entrada #${entrada.id} registrada: ${lineas.length} ${lineas.length === 1 ? 'producto' : 'productos'}` +
      (creados > 0 ? ` (${creados} ${creados === 1 ? 'nuevo' : 'nuevos'} en el catálogo)` : '')
    )
    setLineas([])
    setCabecera(VACIO)
    cargar()
  }

  if (!esAdministrador) {
    return (
      <div className="inv-page">
        <p className="inv-vacio">Esta sección es solo para administradores del negocio.</p>
      </div>
    )
  }

  return (
    <div className="inv-page">
      <h1 className="inv-title"><PackagePlus size={26} /> Inventario</h1>

      {/* Stock y costo solo cambian aquí: entradas (compras) y ajustes */}
      <div className="inv-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'entradas'}
          className={`inv-tab ${pestana === 'entradas' ? 'inv-tab-activa' : ''}`}
          onClick={() => setPestana('entradas')}
        >
          <PackagePlus size={16} /> Entrada de mercancía
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'ajustes'}
          className={`inv-tab ${pestana === 'ajustes' ? 'inv-tab-activa' : ''}`}
          onClick={() => setPestana('ajustes')}
        >
          <ClipboardCheck size={16} /> Ajuste por conteo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'importar'}
          className={`inv-tab ${pestana === 'importar' ? 'inv-tab-activa' : ''}`}
          onClick={() => setPestana('importar')}
        >
          <FileSpreadsheet size={16} /> Importar desde Excel
        </button>
      </div>

      {pestana === 'importar' ? (
        // Al importar se recargan productos y entradas de la otra pestaña
        <ImportarProductos onImportado={cargar} />
      ) : pestana === 'ajustes' ? (
        <AjusteInventario />
      ) : (
        <>
          <div className="inv-card">
            {/* ---------- Datos de la compra ---------- */}
            <div className="inv-cabecera">
              <label className="inv-campo">
                <span>Proveedor</span>
                <input
                  type="text"
                  value={cabecera.proveedor}
                  onChange={(e) => setCabecera((c) => ({ ...c, proveedor: e.target.value }))}
                  disabled={guardando}
                  className="inv-input"
                />
              </label>
              <label className="inv-campo">
                <span>N.º de factura (opcional)</span>
                <input
                  type="text"
                  value={cabecera.factura}
                  onChange={(e) => setCabecera((c) => ({ ...c, factura: e.target.value }))}
                  disabled={guardando}
                  className="inv-input"
                />
              </label>
              <label className="inv-campo inv-campo-ancho">
                <span>Nota (opcional)</span>
                <input
                  type="text"
                  value={cabecera.nota}
                  onChange={(e) => setCabecera((c) => ({ ...c, nota: e.target.value }))}
                  disabled={guardando}
                  className="inv-input"
                />
              </label>
            </div>

            {/* ---------- Buscar, agregar o crear productos ---------- */}
            <div className="inv-buscador">
              <input
                type="text"
                placeholder={cargando ? 'Cargando productos...' : 'Buscar producto por nombre o número...'}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                disabled={cargando || guardando || !!nuevoForm}
                className="inv-input"
              />
              {busqueda.trim() && (sugerencias.length > 0 || !existeExacto) && (
                <ul className="inv-sugerencias">
                  {sugerencias.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => agregar(p)}>
                        <span>#{p.id} · {p.descripcion}</span>
                        <span className="inv-sug-stock">stock {p.cantidad ?? 0}</span>
                      </button>
                    </li>
                  ))}
                  {!existeExacto && (
                    <li>
                      <button type="button" className="inv-crear" onClick={abrirNuevo}>
                        + Crear producto «{busqueda.trim()}»
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {nuevoForm && (
              <div className="inv-nuevo-form">
                <p className="inv-nuevo-titulo">Producto nuevo</p>
                <div className="inv-cabecera">
                  <label className="inv-campo">
                    <span>Nombre</span>
                    <input
                      type="text"
                      value={nuevoForm.descripcion}
                      onChange={(e) => setNuevoForm((f) => ({ ...f, descripcion: e.target.value }))}
                      autoFocus
                      className="inv-input"
                    />
                  </label>
                  <label className="inv-campo">
                    <span>Precio de venta</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCOPInput(nuevoForm.precio)}
                      onChange={(e) => setNuevoForm((f) => ({ ...f, precio: parseCOP(e.target.value) }))}
                      className="inv-input"
                    />
                  </label>
                  <label className="inv-campo">
                    <span>Stock mínimo (opcional)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={nuevoForm.stockMinimo}
                      onChange={(e) => setNuevoForm((f) => ({ ...f, stockMinimo: e.target.value }))}
                      className="inv-input"
                    />
                  </label>
                </div>
                <p className="inv-hint">
                  Se crea solo si registras la entrada. Su costo será el de esta compra.
                </p>
                <div className="inv-nuevo-acciones">
                  <button type="button" className="inv-btn" onClick={agregarNuevo}>
                    Agregar a la entrada
                  </button>
                  <button type="button" className="inv-btn-sec" onClick={() => setNuevoForm(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* ---------- Líneas de la entrada ---------- */}
            {lineas.length === 0 ? (
              <p className="inv-vacio">Busca los productos que llegaron y agrégalos aquí.</p>
            ) : (
              <div className="inv-tabla-wrap">
                <table className="inv-tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Llegan</th>
                      <th className="num">Costo unit.</th>
                      <th className="num">Stock</th>
                      <th className="num">Costo prom.</th>
                      <th className="num">Subtotal</th>
                      <th aria-label="Quitar" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => {
                      const cant = parseInt(l.cantidad, 10) || 0
                      const costo = parseFloat(l.costo) || 0
                      const nuevoCosto = cant > 0 ? costoPromedio(l.stock, l.costoActual, cant, costo) : l.costoActual
                      return (
                        <tr key={l.clave}>
                          <td className="inv-desc">
                            {l.descripcion}
                            {l.esNuevo && <span className="inv-badge-nuevo">Nuevo</span>}
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={l.cantidad}
                              onChange={(e) => editarLinea(l.clave, 'cantidad', e.target.value)}
                              disabled={guardando}
                              className="inv-input inv-input-num"
                              aria-label={`Unidades que llegan de ${l.descripcion}`}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatCOPInput(l.costo)}
                              onChange={(e) => editarLinea(l.clave, 'costo', parseCOP(e.target.value))}
                              disabled={guardando}
                              className="inv-input inv-input-num"
                              aria-label={`Costo unitario de ${l.descripcion}`}
                            />
                          </td>
                          {/* Vista previa: lo que queda después de la entrada */}
                          <td className="num">
                            {l.stock}
                            {cant > 0 && <span className="inv-nuevo"> → {l.stock + cant}</span>}
                          </td>
                          <td className="num">
                            {l.esNuevo ? '—' : formatCOP(l.costoActual)}
                            {cant > 0 && Math.round(nuevoCosto) !== Math.round(l.costoActual) && (
                              <span className="inv-nuevo"> → {formatCOP(nuevoCosto)}</span>
                            )}
                          </td>
                          <td className="num">{formatCOP(cant * costo)}</td>
                          <td>
                            <button
                              type="button"
                              className="inv-quitar"
                              onClick={() => quitarLinea(l.clave)}
                              disabled={guardando}
                              aria-label={`Quitar ${l.descripcion}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="inv-pie">
              <span className="inv-total">Total de la compra: <strong>{formatCOP(total)}</strong></span>
              <button
                type="button"
                className="inv-btn"
                onClick={guardar}
                disabled={guardando || lineas.length === 0 || !!nuevoForm}
              >
                {guardando ? 'Registrando...' : 'Registrar entrada'}
              </button>
            </div>
            <p className="inv-hint">
              Las unidades se <strong>suman</strong> al stock. El costo pasa a ser el promedio
              entre lo que había y lo que llegó, así el margen de los reportes sigue siendo exacto.
            </p>
          </div>

          {/* ---------- Entradas recientes ---------- */}
          <div className="inv-card">
            <h2 className="inv-subtitle">Entradas recientes</h2>
            {entradas.length === 0 ? (
              <p className="inv-vacio">Todavía no hay entradas registradas.</p>
            ) : (
              <div className="inv-tabla-wrap">
                <table className="inv-tabla">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha</th>
                      <th>Proveedor</th>
                      <th>Factura</th>
                      <th>Productos</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entradas.map((e) => {
                      const det = e.detalle_entradas || []
                      const unidades = det.reduce((s, d) => s + (Number(d.cantidad) || 0), 0)
                      return (
                        <tr key={e.id}>
                          <td>{e.id}</td>
                          <td className="inv-fecha">{formatToColombiaShort(e.fecha)}</td>
                          <td>{e.proveedor || '—'}</td>
                          <td>{e.factura || '—'}</td>
                          <td>
                            {det.length} {det.length === 1 ? 'producto' : 'productos'} · {unidades} unid.
                          </td>
                          <td className="num">{formatCOP(e.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default InventarioPage
