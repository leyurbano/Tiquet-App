import React, { useState, useEffect, useMemo } from 'react'
import { productService } from '../services/productService'
import { inventarioService } from '../services/inventarioService'
import { toast } from '../utils/toast'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombiaShort } from '../utils/dateFormatter'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import { MOTIVOS_AJUSTE } from '../utils/motivosAjuste'
import { Trash2 } from 'lucide-react'
import '../pages/InventarioPage.css'

/**
 * Ajuste de inventario: conteo físico y correcciones.
 *
 * Se escribe lo que se contó; el sistema calcula la diferencia contra lo
 * registrado y la valoriza al costo. Cada línea lleva un motivo, así un
 * faltante queda registrado en vez de desaparecer al sobrescribir el stock.
 *
 * También es el único lugar para corregir un costo: en Productos, stock y
 * costo son de solo lectura al editar.
 */
function AjusteInventario() {
  const [productos, setProductos] = useState([])
  const [ajustes, setAjustes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [lineas, setLineas] = useState([])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    setCargando(true)
    const [resultado, recientes] = await Promise.all([
      productService.getTodosLosProductos(),
      inventarioService.getAjustesRecientes()
    ])
    setProductos(resultado.data || [])
    setAjustes(recientes)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const sugerencias = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return []
    return productos
      .filter((p) => (p.descripcion || '').toLowerCase().includes(t) || String(p.id) === t)
      .slice(0, 8)
  }, [busqueda, productos])

  const agregar = (p) => {
    if (lineas.some((l) => l.producto_id === p.id)) {
      toast.aviso(`"${p.descripcion}" ya está en el ajuste`)
      return
    }
    setLineas((prev) => [
      ...prev,
      {
        producto_id: p.id,
        descripcion: p.descripcion,
        // Foto de lo que mostraba la pantalla: la base de datos la compara al
        // registrar y rechaza la línea si una venta movió el stock en medio
        stockSistema: Number(p.cantidad) || 0,
        costoActual: Math.round(Number(p.costo) || 0),
        contado: '',
        costo: String(Math.round(Number(p.costo) || 0)),
        motivo: 'conteo'
      }
    ])
    setBusqueda('')
  }

  const editarLinea = (id, campo, valor) =>
    setLineas((prev) => prev.map((l) => (l.producto_id === id ? { ...l, [campo]: valor } : l)))

  const quitarLinea = (id) => setLineas((prev) => prev.filter((l) => l.producto_id !== id))

  const calcular = (l) => {
    const contado = l.contado === '' ? null : parseInt(l.contado, 10)
    const costo = parseFloat(l.costo) || 0
    const diferencia = contado === null ? null : contado - l.stockSistema
    return { diferencia, valor: diferencia === null ? 0 : diferencia * costo }
  }

  const resumen = lineas.reduce(
    (acc, l) => {
      const { valor } = calcular(l)
      if (valor < 0) acc.faltante += valor
      else acc.sobrante += valor
      return acc
    },
    { faltante: 0, sobrante: 0 }
  )

  const guardar = async () => {
    if (lineas.length === 0) return toast.aviso('Agrega al menos un producto')

    const invalida = lineas.find((l) => {
      const n = Number(l.contado)
      return l.contado === '' || !Number.isInteger(n) || n < 0 || l.costo === ''
    })
    if (invalida) {
      return toast.aviso(`Revisa "${invalida.descripcion}": escribe cuántas unidades contaste`)
    }

    setGuardando(true)
    const { ajuste, error } = await inventarioService.registrarAjuste({
      nota,
      items: lineas.map((l) => {
        const costo = parseFloat(l.costo) || 0
        return {
          producto_id: l.producto_id,
          stock_sistema: l.stockSistema,
          stock_contado: parseInt(l.contado, 10),
          // null = no se toca el costo; solo se manda si se cambió
          costo_unitario: costo !== l.costoActual ? costo : null,
          motivo: l.motivo
        }
      })
    })
    setGuardando(false)

    if (error) return toast.error('No se pudo registrar el ajuste: ' + error)

    toast.exito(
      ajuste.cambios > 0
        ? `Ajuste #${ajuste.id} registrado: ${ajuste.cambios} ${ajuste.cambios === 1 ? 'producto corregido' : 'productos corregidos'}`
        : `Ajuste #${ajuste.id} registrado: el conteo coincidió con el sistema`
    )
    setLineas([])
    setNota('')
    cargar()
  }

  return (
    <>
      <div className="inv-card">
        <label className="inv-campo inv-campo-ancho">
          <span>Nota (opcional)</span>
          <input
            type="text"
            placeholder="Por ejemplo: conteo mensual de septiembre"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={guardando}
            className="inv-input"
          />
        </label>

        <div className="inv-buscador inv-buscador-ajuste">
          <input
            type="text"
            placeholder={cargando ? 'Cargando productos...' : 'Buscar el producto que contaste...'}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            disabled={cargando || guardando}
            className="inv-input"
          />
          {sugerencias.length > 0 && (
            <ul className="inv-sugerencias">
              {sugerencias.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => agregar(p)}>
                    <span>#{p.id} · {p.descripcion}</span>
                    <span className="inv-sug-stock">sistema: {p.cantidad ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lineas.length === 0 ? (
          <p className="inv-vacio">Agrega los productos que contaste o que necesitas corregir.</p>
        ) : (
          <div className="inv-tabla-wrap">
            <table className="inv-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Sistema</th>
                  <th className="num">Contado</th>
                  <th className="num">Diferencia</th>
                  <th className="num">Costo unit.</th>
                  <th className="num">Valor</th>
                  <th>Motivo</th>
                  <th aria-label="Quitar" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const { diferencia, valor } = calcular(l)
                  const claseDif =
                    diferencia === null || diferencia === 0 ? '' : diferencia < 0 ? 'inv-falta' : 'inv-sobra'
                  return (
                    <tr key={l.producto_id}>
                      <td className="inv-desc">{l.descripcion}</td>
                      <td className="num">{l.stockSistema}</td>
                      <td className="num">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={l.contado}
                          onChange={(e) => editarLinea(l.producto_id, 'contado', e.target.value)}
                          disabled={guardando}
                          className="inv-input inv-input-num"
                          aria-label={`Unidades contadas de ${l.descripcion}`}
                        />
                      </td>
                      <td className={`num ${claseDif}`}>
                        {diferencia === null ? '—' : diferencia > 0 ? `+${diferencia}` : diferencia}
                      </td>
                      <td className="num">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCOPInput(l.costo)}
                          onChange={(e) => editarLinea(l.producto_id, 'costo', parseCOP(e.target.value))}
                          disabled={guardando}
                          className="inv-input inv-input-num"
                          title="Cámbialo solo para corregir un costo mal registrado"
                          aria-label={`Costo unitario de ${l.descripcion}`}
                        />
                      </td>
                      <td className={`num ${claseDif}`}>{diferencia ? formatCOP(valor) : '—'}</td>
                      <td>
                        <select
                          value={l.motivo}
                          onChange={(e) => editarLinea(l.producto_id, 'motivo', e.target.value)}
                          disabled={guardando}
                          className="inv-input inv-input-motivo"
                          aria-label={`Motivo del ajuste de ${l.descripcion}`}
                        >
                          {MOTIVOS_AJUSTE.map((m) => (
                            <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="inv-quitar"
                          onClick={() => quitarLinea(l.producto_id)}
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
          <span className="inv-total">
            {resumen.faltante < 0 && (
              <span className="inv-falta">Faltante: <strong>{formatCOP(resumen.faltante)}</strong></span>
            )}
            {resumen.faltante < 0 && resumen.sobrante > 0 && ' · '}
            {resumen.sobrante > 0 && (
              <span className="inv-sobra">Sobrante: <strong>+{formatCOP(resumen.sobrante)}</strong></span>
            )}
            {resumen.faltante === 0 && resumen.sobrante === 0 && 'Sin diferencias todavía'}
          </span>
          <button
            type="button"
            className="inv-btn"
            onClick={guardar}
            disabled={guardando || lineas.length === 0}
          >
            {guardando ? 'Registrando...' : 'Registrar ajuste'}
          </button>
        </div>
        <p className="inv-hint">
          El stock queda igual a lo contado y cada diferencia se guarda con su motivo. Si una
          venta mueve el stock mientras cuentas, esa línea se rechaza para no pisarla: lo ideal
          es contar con la caja quieta.
        </p>
      </div>

      <div className="inv-card">
        <h2 className="inv-subtitle">Ajustes recientes</h2>
        {ajustes.length === 0 ? (
          <p className="inv-vacio">Todavía no hay ajustes registrados.</p>
        ) : (
          <div className="inv-tabla-wrap">
            <table className="inv-tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Nota</th>
                  <th>Productos</th>
                  <th className="num">Valor neto</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a) => {
                  const det = a.detalle_ajustes || []
                  const conCambio = det.filter((d) => Number(d.diferencia) !== 0).length
                  const neto = det.reduce((s, d) => s + (Number(d.valor_diferencia) || 0), 0)
                  return (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td className="inv-fecha">{formatToColombiaShort(a.fecha)}</td>
                      <td>{a.nota || '—'}</td>
                      <td>{det.length} contados · {conCambio} con diferencia</td>
                      <td className={`num ${neto < 0 ? 'inv-falta' : neto > 0 ? 'inv-sobra' : ''}`}>
                        {formatCOP(neto)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default AjusteInventario
