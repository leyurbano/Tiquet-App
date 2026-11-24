import React, { useState, useEffect, useMemo, useRef } from 'react'
import { productService } from '../services/productService'
import { inventarioService } from '../services/inventarioService'
import { toast } from '../utils/toast'
import { formatCOP, formatNumero } from '../utils/currencyFormatter'
import { descargarCSV } from '../utils/csv'
import { getTodayColombia } from '../utils/dateFormatter'
import { numeroDoc } from '../utils/documento'
import { nombreProducto } from '../utils/producto'
import {
  COLUMNAS_PLANTILLA, COLUMNAS_CONTEO, MAX_FILAS, leerArchivo, clasificarFilas, aItems,
  clasificarConteo, aItemsAjuste, resumenConteo, filasPlantillaConteo
} from '../utils/importarProductos'
import { useCambiosPendientes } from '../hooks/useCambiosPendientes'
import ConfirmarRegistroModal from './ConfirmarRegistroModal'
import { Download, Upload, PackagePlus, ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import './ImportarProductos.css'

const ESTADOS = {
  // Mercancía que llegó
  nuevo: { etiqueta: 'Nuevo', clase: 'imp-nuevo' },
  existente: { etiqueta: 'Suma stock', clase: 'imp-existente' },
  omitida: { etiqueta: 'Sin cambios', clase: 'imp-omitida' },
  // Conteo físico
  ajuste: { etiqueta: 'Diferencia', clase: 'imp-nuevo' },
  igual: { etiqueta: 'Coincide', clase: 'imp-existente' },
  sin_conteo: { etiqueta: 'Sin conteo', clase: 'imp-omitida' },
  error: { etiqueta: 'Error', clase: 'imp-error' }
}

/**
 * Importar desde Excel (.xlsx o .csv), de dos formas:
 *
 *  - Mercancía que llegó: las unidades se SUMAN al stock, como una factura
 *    de compra (registrar_entrada). Puede crear productos nuevos.
 *  - Conteo físico: el stock queda IGUAL a lo contado (registrar_ajuste),
 *    con cada diferencia registrada como faltante o sobrante. No crea
 *    productos.
 *
 * 🔧 Antes solo existía la primera, y con un conteo en Excel la única salida
 * era el Ajuste por conteo, producto por producto. El modo se elige a
 * propósito y sin uno marcado por defecto: sumar un conteo duplicaría el
 * stock, y fijar una compra lo borraría.
 *
 * El archivo se revisa en pantalla antes de guardar nada, y se confirma con
 * un resumen. O entra todo o no entra nada.
 *
 * version: sube cuando otra pestaña registró algo; se recarga el catálogo.
 * onRegistrado: avisa a la página para que las otras pestañas se recarguen.
 */
function ImportarProductos({ version = 0, onRegistrado }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  // Sin catálogo, todo el archivo se vería como productos nuevos
  const [errorCatalogo, setErrorCatalogo] = useState(false)
  const [modo, setModo] = useState(null) // null | 'entrada' | 'conteo'
  const [archivo, setArchivo] = useState(null)
  // Las celdas tal como vinieron: al cambiar de modo o recargar el catálogo
  // se vuelven a clasificar sin pedir el archivo otra vez
  const [crudas, setCrudas] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [proveedor, setProveedor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [soloRevisar, setSoloRevisar] = useState(false)
  const inputRef = useRef(null)

  const cargarProductos = async () => {
    setCargando(true)
    const resultado = await productService.getTodosLosProductos()
    setProductos(resultado.data)
    setErrorCatalogo(!!resultado.error)
    setCargando(false)
  }

  useEffect(() => {
    // Al abrir la pestaña y cada vez que otra pestaña registra algo
    cargarProductos()
  }, [version])

  // Clasificación derivada: cambia sola con el modo o con el catálogo
  const resultado = useMemo(() => {
    if (!crudas || !modo) return null
    return modo === 'conteo' ? clasificarConteo(crudas, productos) : clasificarFilas(crudas, productos)
  }, [crudas, modo, productos])

  const filas = useMemo(() => resultado?.filas || [], [resultado])

  // Archivo que no sirve en conjunto (sin columnas, vacío...): se avisa y se descarta
  useEffect(() => {
    if (resultado?.error) {
      toast.error(resultado.error)
      setCrudas(null)
      setArchivo(null)
    }
  }, [resultado])

  useCambiosPendientes(!!archivo, 'Hay un archivo revisado sin importar.')

  const conteo = useMemo(() => {
    const c = { nuevo: 0, existente: 0, omitida: 0, error: 0, avisos: 0, total: 0, unidades: 0 }
    for (const f of filas) {
      if (c[f.estado] !== undefined) c[f.estado] += 1
      if (f.aviso) c.avisos += 1
      if (f.estado === 'nuevo' || f.estado === 'existente') {
        c.total += f.cantidad * f.costo
        c.unidades += f.cantidad
      }
    }
    return c
  }, [filas])

  const resumen = useMemo(() => resumenConteo(filas), [filas])

  const importables = modo === 'conteo'
    ? resumen.ajuste + resumen.igual
    : conteo.nuevo + conteo.existente

  // "Revisar": en una compra, errores y avisos; en un conteo, lo que cambia
  const aRevisar = (f) =>
    modo === 'conteo' ? f.estado === 'error' || f.estado === 'ajuste' : f.estado === 'error' || f.aviso
  const visibles = soloRevisar ? filas.filter(aRevisar) : filas
  const hayParaRevisar = filas.some(aRevisar)

  const descargarPlantilla = () =>
    modo === 'conteo'
      ? descargarCSV(`conteo_inventario_${getTodayColombia()}.csv`, COLUMNAS_CONTEO, filasPlantillaConteo(productos))
      : descargarCSV('plantilla_productos.csv', COLUMNAS_PLANTILLA, [])

  const alElegirArchivo = async (e) => {
    const elegido = e.target.files?.[0]
    // Permite volver a subir el mismo archivo después de corregirlo
    e.target.value = ''
    if (!elegido) return

    setLeyendo(true)
    try {
      setCrudas(await leerArchivo(elegido))
      setArchivo(elegido.name)
      setSoloRevisar(false)
    } catch (err) {
      toast.error('No se pudo leer el archivo: ' + (err.message || err))
    }
    setLeyendo(false)
  }

  const descartar = () => {
    setCrudas(null)
    setArchivo(null)
  }

  const importar = async () => {
    setGuardando(true)

    if (modo === 'conteo') {
      const { ajuste, error } = await inventarioService.registrarAjuste({
        nota: `Conteo importado: ${archivo}`,
        items: aItemsAjuste(filas)
      })
      setGuardando(false)
      setConfirmando(false)

      if (error) {
        // Casi siempre es una venta que movió el stock en medio: se recarga
        // el catálogo y la vista previa se recalcula sola contra el actual
        toast.error('No se importó nada: ' + error)
        cargarProductos()
        return
      }
      toast.exito(
        `Conteo importado (ajuste #${numeroDoc(ajuste)}): ${resumen.ajuste} ` +
        `${resumen.ajuste === 1 ? 'producto corregido' : 'productos corregidos'}`
      )
    } else {
      const { entrada, error } = await inventarioService.registrarEntrada({
        proveedor,
        factura: '',
        nota: `Importación: ${archivo}`,
        items: aItems(filas)
      })
      setGuardando(false)
      setConfirmando(false)

      if (error) return toast.error('No se importó nada: ' + error)
      toast.exito(
        `Importación lista (entrada #${numeroDoc(entrada)}): ${conteo.nuevo} ${conteo.nuevo === 1 ? 'producto nuevo' : 'productos nuevos'}` +
        ` y ${conteo.existente} con stock sumado`
      )
      setProveedor('')
    }

    descartar()
    onRegistrado?.()
  }

  // Resumen del modal de confirmación, según el modo
  const confirmacion = modo === 'conteo'
    ? {
        titulo: 'Importar conteo',
        icono: ClipboardCheck,
        lineas: [
          { etiqueta: 'Productos contados', valor: formatNumero(importables) },
          { etiqueta: 'Con diferencia', valor: formatNumero(resumen.ajuste) },
          ...(resumen.faltante < 0 ? [{ etiqueta: 'Faltante (al costo)', valor: formatCOP(resumen.faltante), tono: 'falta' }] : []),
          ...(resumen.sobrante > 0 ? [{ etiqueta: 'Sobrante (al costo)', valor: `+${formatCOP(resumen.sobrante)}`, tono: 'sobra' }] : [])
        ],
        aviso: 'El stock de estos productos queda IGUAL a lo contado, y el ajuste no se puede editar después. ' +
          'Si alguien vende mientras tanto, no se importa nada y la vista previa se actualiza.',
        textoConfirmar: 'Fijar stock'
      }
    : {
        titulo: 'Importar mercancía',
        icono: PackagePlus,
        lineas: [
          { etiqueta: 'Productos nuevos', valor: formatNumero(conteo.nuevo) },
          { etiqueta: 'Productos que suman stock', valor: formatNumero(conteo.existente) },
          { etiqueta: 'Unidades que entran', valor: formatNumero(conteo.unidades) },
          { etiqueta: 'Valor de lo que entra', valor: formatCOP(conteo.total) }
        ],
        aviso: 'Las unidades se SUMAN al stock, y la entrada no se puede editar después. ' +
          'Si algo queda mal, se corrige con un ajuste.',
        textoConfirmar: 'Importar'
      }

  return (
    <div className="inv-card">
      <h2 className="inv-subtitle inv-subtitle-icono">
        <FileSpreadsheet size={20} aria-hidden="true" /> Importar desde Excel
      </h2>

      {errorCatalogo && (
        <p className="imp-alerta">
          No se pudo cargar el catálogo actual. Recarga la página antes de importar.
        </p>
      )}

      {/* ---------- Qué tiene el archivo ---------- */}
      <fieldset className="imp-modos" disabled={guardando}>
        <legend className="imp-modos-titulo">¿Qué tiene este archivo?</legend>
        <label className={`imp-modo ${modo === 'entrada' ? 'imp-modo-activo' : ''}`}>
          <input
            type="radio"
            name="modo-importar"
            value="entrada"
            checked={modo === 'entrada'}
            onChange={() => setModo('entrada')}
          />
          <PackagePlus size={20} aria-hidden="true" />
          <span>
            <strong>Mercancía que llegó</strong>
            <small>Las unidades se <b>suman</b> al stock. Puede crear productos nuevos.</small>
          </span>
        </label>
        <label className={`imp-modo ${modo === 'conteo' ? 'imp-modo-activo' : ''}`}>
          <input
            type="radio"
            name="modo-importar"
            value="conteo"
            checked={modo === 'conteo'}
            onChange={() => setModo('conteo')}
          />
          <ClipboardCheck size={20} aria-hidden="true" />
          <span>
            <strong>Conteo físico</strong>
            <small>El stock queda <b>igual</b> a lo contado. Cada diferencia queda registrada.</small>
          </span>
        </label>
      </fieldset>

      {modo && !archivo && (
        modo === 'conteo' ? (
          <>
            <p className="imp-texto">
              Descarga el catálogo, cuenta y escribe en la columna <strong>Contado</strong> cuántas
              unidades hay de cada producto. Deja vacío lo que no contaste: no cambia.
            </p>
            <p className="inv-hint">
              Importa apenas termines de contar y con la caja quieta: lo que se venda después de
              contar ya no está en el estante, pero el conteo lo volvería a sumar. Los productos que
              no existen se importan primero como «Mercancía que llegó».
            </p>
          </>
        ) : (
          <>
            <p className="imp-texto">
              Sube un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con estas columnas
              (la primera fila son los encabezados):
            </p>
            <ul className="imp-columnas">
              <li><strong>Nombre</strong>: obligatorio.</li>
              <li><strong>Precio venta</strong>: obligatorio para productos nuevos.</li>
              <li><strong>Cantidad</strong>: unidades que entran. Si el producto ya existe, se <strong>suman</strong> a su stock.</li>
              <li><strong>Costo</strong>: costo unitario de compra.</li>
              <li><strong>Stock mínimo</strong>: opcional, para las alertas de stock bajo.</li>
            </ul>
            <p className="inv-hint">
              Máximo {formatNumero(MAX_FILAS)} filas por archivo. El precio de venta de los productos
              que ya existen no se cambia.
            </p>
          </>
        )
      )}

      {modo && (
        <div className="imp-acciones">
          <button
            type="button"
            className="inv-btn-sec"
            onClick={descargarPlantilla}
            disabled={modo === 'conteo' && (cargando || errorCatalogo)}
          >
            <Download size={16} aria-hidden="true" />
            {modo === 'conteo' ? 'Descargar catálogo para contar' : 'Descargar plantilla'}
          </button>
          <button
            type="button"
            className="inv-btn"
            onClick={() => inputRef.current?.click()}
            disabled={cargando || errorCatalogo || leyendo || guardando}
          >
            <Upload size={16} aria-hidden="true" />
            {cargando ? 'Cargando catálogo...' : leyendo ? 'Leyendo archivo...' : archivo ? 'Subir otro archivo' : 'Subir archivo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={alElegirArchivo}
            hidden
          />
        </div>
      )}

      {archivo && filas.length > 0 && (
        <>
          <p className="imp-archivo">
            <strong>{archivo}</strong> · {formatNumero(filas.length)} {filas.length === 1 ? 'fila' : 'filas'}
          </p>

          <div className="imp-resumen">
            {modo === 'conteo' ? (
              <>
                <span className="imp-chip imp-nuevo">{resumen.ajuste} con diferencia</span>
                <span className="imp-chip imp-existente">{resumen.igual} coinciden</span>
                {resumen.sin_conteo > 0 && <span className="imp-chip imp-omitida">{resumen.sin_conteo} sin conteo</span>}
                {resumen.error > 0 && <span className="imp-chip imp-error">{resumen.error} con error</span>}
              </>
            ) : (
              <>
                <span className="imp-chip imp-nuevo">{conteo.nuevo} nuevos</span>
                <span className="imp-chip imp-existente">{conteo.existente} suman stock</span>
                {conteo.omitida > 0 && <span className="imp-chip imp-omitida">{conteo.omitida} sin cambios</span>}
                {conteo.error > 0 && <span className="imp-chip imp-error">{conteo.error} con error</span>}
              </>
            )}
          </div>

          {hayParaRevisar && (
            <label className="imp-filtro">
              <input
                type="checkbox"
                checked={soloRevisar}
                onChange={(e) => setSoloRevisar(e.target.checked)}
              />
              {modo === 'conteo' ? 'Ver solo diferencias y errores' : 'Ver solo errores y avisos'}
            </label>
          )}

          <div className="inv-tabla-wrap imp-tabla-wrap">
            {modo === 'conteo' ? (
              <table className="inv-tabla">
                <thead>
                  <tr>
                    <th className="num">Fila</th>
                    <th>Estado</th>
                    <th>Producto</th>
                    <th className="num">Sistema</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                    <th className="num">Valor</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const tono = f.diferencia < 0 ? 'inv-falta' : f.diferencia > 0 ? 'inv-sobra' : ''
                    return (
                      <tr key={f.fila} className={f.estado === 'error' ? 'imp-fila-error' : ''}>
                        <td className="num">{f.fila}</td>
                        <td>
                          <span className={`imp-chip ${ESTADOS[f.estado].clase}`}>{ESTADOS[f.estado].etiqueta}</span>
                        </td>
                        <td className="inv-desc">
                          {f.producto ? nombreProducto(f.nombre) : f.nombre || f.numero || '—'}
                        </td>
                        <td className="num">{f.producto ? formatNumero(f.stockSistema) : '—'}</td>
                        <td className="num">{f.contado === null || Number.isNaN(f.contado) ? '—' : formatNumero(f.contado)}</td>
                        <td className={`num ${tono}`}>
                          {f.diferencia === null ? '—' : f.diferencia > 0 ? `+${formatNumero(f.diferencia)}` : formatNumero(f.diferencia)}
                        </td>
                        <td className={`num ${tono}`}>{f.diferencia ? formatCOP(f.valor) : '—'}</td>
                        <td className="imp-obs">{f.errores.length > 0 ? f.errores.join(' · ') : f.aviso || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="inv-tabla">
                <thead>
                  <tr>
                    <th className="num">Fila</th>
                    <th>Estado</th>
                    <th>Nombre</th>
                    <th className="num">Precio</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Costo</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.fila} className={f.estado === 'error' ? 'imp-fila-error' : ''}>
                      <td className="num">{f.fila}</td>
                      <td>
                        <span className={`imp-chip ${ESTADOS[f.estado].clase}`}>{ESTADOS[f.estado].etiqueta}</span>
                      </td>
                      <td className="inv-desc">{f.nombre || '—'}</td>
                      <td className="num">
                        {f.producto ? formatCOP(f.producto.precio_venta) : f.precio === null || Number.isNaN(f.precio) ? '—' : formatCOP(f.precio)}
                      </td>
                      <td className="num">{formatNumero(f.cantidad)}</td>
                      <td className="num">{formatCOP(f.costo)}</td>
                      <td className="imp-obs">{f.errores.length > 0 ? f.errores.join(' · ') : f.aviso || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {modo === 'entrada' && (
            <label className="inv-campo imp-proveedor">
              <span>Proveedor (opcional)</span>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                disabled={guardando}
                className="inv-input"
              />
            </label>
          )}

          <div className="inv-pie">
            <span className="inv-total">
              {modo === 'conteo' ? (
                <>
                  {resumen.faltante < 0 && (
                    <span className="inv-falta">Faltante: <strong>{formatCOP(resumen.faltante)}</strong></span>
                  )}
                  {resumen.faltante < 0 && resumen.sobrante > 0 && ' · '}
                  {resumen.sobrante > 0 && (
                    <span className="inv-sobra">Sobrante: <strong>+{formatCOP(resumen.sobrante)}</strong></span>
                  )}
                  {resumen.faltante === 0 && resumen.sobrante === 0 && 'Sin diferencias de valor'}
                </>
              ) : (
                <>Valor de lo que entra: <strong>{formatCOP(conteo.total)}</strong></>
              )}
            </span>
            <div className="imp-acciones">
              <button type="button" className="inv-btn-sec" onClick={descartar} disabled={guardando}>
                Descartar
              </button>
              <button
                type="button"
                className="inv-btn"
                onClick={() => setConfirmando(true)}
                disabled={guardando || importables === 0 || cargando}
              >
                {modo === 'conteo'
                  ? `Fijar ${formatNumero(importables)} ${importables === 1 ? 'producto' : 'productos'}`
                  : `Importar ${formatNumero(importables)} ${importables === 1 ? 'fila' : 'filas'}`}
              </button>
            </div>
          </div>
          {(modo === 'conteo' ? resumen.error : conteo.error) > 0 && (
            <p className="inv-hint">
              Las filas con error no se importan. Corrígelas en el archivo y súbelo de nuevo, o importa las demás.
            </p>
          )}
        </>
      )}

      {confirmando && (
        <ConfirmarRegistroModal
          {...confirmacion}
          procesando={guardando}
          onConfirmar={importar}
          onCancelar={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}

export default ImportarProductos
