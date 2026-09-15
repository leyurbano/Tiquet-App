import React, { useState, useEffect, useMemo, useRef } from 'react'
import { productService } from '../services/productService'
import { inventarioService } from '../services/inventarioService'
import { toast } from '../utils/toast'
import { formatCOP } from '../utils/currencyFormatter'
import { descargarCSV } from '../utils/csv'
import {
  COLUMNAS_PLANTILLA, MAX_FILAS, leerArchivo, clasificarFilas, aItems
} from '../utils/importarProductos'
import { Download, Upload } from 'lucide-react'
import './ImportarProductos.css'

const ESTADOS = {
  nuevo: { etiqueta: 'Nuevo', clase: 'imp-nuevo' },
  existente: { etiqueta: 'Suma stock', clase: 'imp-existente' },
  omitida: { etiqueta: 'Sin cambios', clase: 'imp-omitida' },
  error: { etiqueta: 'Error', clase: 'imp-error' }
}

/**
 * Importar productos desde Excel (.xlsx o .csv).
 *
 * El archivo se revisa en pantalla antes de guardar nada. Al importar, todo
 * queda como UNA entrada con registrar_entrada: o entra todo o no entra
 * nada, y el stock queda con historial desde el primer día. Los productos
 * que ya existen solo suman stock; su precio de venta no se toca.
 */
function ImportarProductos({ onImportado }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  // Sin catálogo, todo el archivo se vería como productos nuevos
  const [errorCatalogo, setErrorCatalogo] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [filas, setFilas] = useState([])
  const [leyendo, setLeyendo] = useState(false)
  const [proveedor, setProveedor] = useState('')
  const [guardando, setGuardando] = useState(false)
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
    cargarProductos()
  }, [])

  const conteo = useMemo(() => {
    const c = { nuevo: 0, existente: 0, omitida: 0, error: 0, avisos: 0, total: 0 }
    for (const f of filas) {
      c[f.estado] += 1
      if (f.aviso) c.avisos += 1
      if (f.estado === 'nuevo' || f.estado === 'existente') c.total += f.cantidad * f.costo
    }
    return c
  }, [filas])

  const importables = conteo.nuevo + conteo.existente
  const visibles = soloRevisar ? filas.filter((f) => f.estado === 'error' || f.aviso) : filas

  const descargarPlantilla = () => descargarCSV('plantilla_productos.csv', COLUMNAS_PLANTILLA, [])

  const alElegirArchivo = async (e) => {
    const elegido = e.target.files?.[0]
    // Permite volver a subir el mismo archivo después de corregirlo
    e.target.value = ''
    if (!elegido) return

    setLeyendo(true)
    try {
      const crudas = await leerArchivo(elegido)
      const resultado = clasificarFilas(crudas, productos)
      if (resultado.error) {
        toast.error(resultado.error)
        setFilas([])
        setArchivo(null)
      } else {
        setFilas(resultado.filas)
        setArchivo(elegido.name)
        setSoloRevisar(false)
      }
    } catch (err) {
      toast.error('No se pudo leer el archivo: ' + (err.message || err))
    }
    setLeyendo(false)
  }

  const descartar = () => {
    setFilas([])
    setArchivo(null)
  }

  const importar = async () => {
    const items = aItems(filas)
    if (items.length === 0) return toast.aviso('No hay filas para importar')

    setGuardando(true)
    const { entrada, error } = await inventarioService.registrarEntrada({
      proveedor,
      factura: '',
      nota: `Importación: ${archivo}`,
      items
    })
    setGuardando(false)

    if (error) return toast.error('No se importó nada: ' + error)

    toast.exito(
      `Importación lista (entrada #${entrada.id}): ${conteo.nuevo} ${conteo.nuevo === 1 ? 'producto nuevo' : 'productos nuevos'}` +
      ` y ${conteo.existente} con stock sumado`
    )
    descartar()
    setProveedor('')
    cargarProductos()
    onImportado?.()
  }

  return (
    <div className="inv-card">
      <h2 className="inv-subtitle">Importar productos desde Excel</h2>

      {errorCatalogo && (
        <p className="imp-alerta">
          No se pudo cargar el catálogo actual. Recarga la página antes de importar.
        </p>
      )}

      {!archivo && (
        <>
          <p className="imp-texto">
            Sube un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con estas columnas
            (la primera fila son los encabezados):
          </p>
          <ul className="imp-columnas">
            <li><strong>Nombre</strong> — obligatorio.</li>
            <li><strong>Precio venta</strong> — obligatorio para productos nuevos.</li>
            <li><strong>Cantidad</strong> — unidades que entran. Si el producto ya existe, se <strong>suman</strong> a su stock.</li>
            <li><strong>Costo</strong> — costo unitario de compra.</li>
            <li><strong>Stock mínimo</strong> — opcional, para las alertas de stock bajo.</li>
          </ul>
          <p className="inv-hint">
            Antes de guardar vas a ver qué pasará con cada fila. Máximo {MAX_FILAS.toLocaleString('es-CO')} filas
            por archivo. El precio de venta de los productos que ya existen no se cambia.
          </p>
        </>
      )}

      <div className="imp-acciones">
        <button type="button" className="inv-btn-sec" onClick={descargarPlantilla}>
          <Download size={16} /> Descargar plantilla
        </button>
        <button
          type="button"
          className="inv-btn"
          onClick={() => inputRef.current?.click()}
          disabled={cargando || errorCatalogo || leyendo || guardando}
        >
          <Upload size={16} />{' '}
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

      {archivo && (
        <>
          <p className="imp-archivo">
            <strong>{archivo}</strong> · {filas.length} {filas.length === 1 ? 'fila' : 'filas'}
          </p>

          <div className="imp-resumen">
            <span className="imp-chip imp-nuevo">{conteo.nuevo} nuevos</span>
            <span className="imp-chip imp-existente">{conteo.existente} suman stock</span>
            {conteo.omitida > 0 && <span className="imp-chip imp-omitida">{conteo.omitida} sin cambios</span>}
            {conteo.error > 0 && <span className="imp-chip imp-error">{conteo.error} con error</span>}
          </div>

          {(conteo.error > 0 || conteo.avisos > 0) && (
            <label className="imp-filtro">
              <input
                type="checkbox"
                checked={soloRevisar}
                onChange={(e) => setSoloRevisar(e.target.checked)}
              />
              Ver solo errores y avisos
            </label>
          )}

          <div className="inv-tabla-wrap imp-tabla-wrap">
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
                    <td className="num">{f.cantidad}</td>
                    <td className="num">{formatCOP(f.costo)}</td>
                    <td className="imp-obs">{f.errores.length > 0 ? f.errores.join(' · ') : f.aviso || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          <div className="inv-pie">
            <span className="inv-total">Valor de lo que entra: <strong>{formatCOP(conteo.total)}</strong></span>
            <div className="imp-acciones">
              <button type="button" className="inv-btn-sec" onClick={descartar} disabled={guardando}>
                Descartar
              </button>
              <button
                type="button"
                className="inv-btn"
                onClick={importar}
                disabled={guardando || importables === 0}
              >
                {guardando ? 'Importando...' : `Importar ${importables} ${importables === 1 ? 'fila' : 'filas'}`}
              </button>
            </div>
          </div>
          {conteo.error > 0 && (
            <p className="inv-hint">
              Las filas con error no se importan. Corrígelas en el archivo y súbelo de nuevo, o importa las demás.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default ImportarProductos
