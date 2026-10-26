import React, { useState, useMemo } from 'react'
import { inventarioService } from '../services/inventarioService'
import { useDialogo } from '../hooks/useDialogo'
import { toast } from '../utils/toast'
import { formatCOP } from '../utils/currencyFormatter'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import { numeroProducto } from '../utils/producto'
import { numeroDoc } from '../utils/documento'
import { calcularMovimiento, motivosDe, buscarMotivo } from '../utils/movimientosStock'
import { PackagePlus, PackageMinus } from 'lucide-react'
import './CajaModal.css'
import './MovimientoStockModal.css'

/**
 * Movimiento rápido de stock de UN producto, desde la lista de Productos.
 *
 * 🔧 Antes, para sumarle unidades a un producto que ya estaba en pantalla
 * había que irse a Inventario y buscarlo otra vez. Esto lo resuelve en la
 * misma fila, sin perder el rastro: cada movimiento lleva motivo y queda en
 * el historial del producto igual que si se hubiera hecho en Inventario.
 *
 * Según el motivo, el servicio reusa registrar_entrada (compra: suma y
 * recalcula el costo promedio) o registrar_ajuste (todo lo demás y las
 * salidas: fija el stock y guarda la diferencia). No hay función nueva en la
 * base de datos, así que los permisos y las validaciones son los mismos.
 *
 * Para una factura con varias líneas sigue estando Inventario: esto es para
 * uno o dos productos, que es la mayoría de las veces.
 */
function MovimientoStockModal({ producto, onCancel, onRegistrado }) {
  const [direccion, setDireccion] = useState('entrada')
  const [unidades, setUnidades] = useState('')
  const [motivo, setMotivo] = useState('compra')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const stockActual = Number(producto.cantidad) || 0
  const costoActual = Math.round(Number(producto.costo) || 0)
  // El costo se deja vacío a propósito cuando el producto no tiene uno: así
  // no se "confirma" un cero que después arruina el margen del reporte
  const [costo, setCosto] = useState(costoActual ? String(costoActual) : '')

  const motivos = motivosDe(direccion)
  const elegido = buscarMotivo(direccion, motivo)
  // Solo una compra cambia el costo: es la única entrada de plata real
  const tocaCosto = elegido?.rpc === 'entrada'

  const resultado = useMemo(
    () => calcularMovimiento({
      direccion,
      unidades,
      stockActual,
      costoActual,
      costoNuevo: costo === '' ? '' : Number(costo),
      tocaCosto
    }),
    [direccion, unidades, stockActual, costoActual, costo, tocaCosto]
  )

  const cambiarDireccion = (nueva) => {
    setDireccion(nueva)
    // El motivo por defecto de cada lado: comprar, o dar algo de baja
    setMotivo(nueva === 'salida' ? 'dano' : 'compra')
    setError('')
  }

  const refDialogo = useDialogo({ onCerrar: guardando ? null : onCancel })

  const MENSAJES = {
    unidades: 'Escribe cuántas unidades, en números enteros y mayor que cero',
    excede: `Solo hay ${stockActual} ${stockActual === 1 ? 'unidad' : 'unidades'} en el sistema: no puedes sacar más`,
    costo: 'Escribe a cómo te quedó cada unidad'
  }

  const confirmar = async () => {
    setError('')
    if (resultado.error) return setError(MENSAJES[resultado.error])

    setGuardando(true)
    const { movimiento, error: errorGuardado } = await inventarioService.registrarMovimientoStock({
      rpc: elegido.rpc,
      productoId: producto.id,
      stockActual,
      stockFinal: resultado.stockFinal,
      unidades: resultado.unidades,
      motivo: elegido.codigo,
      etiquetaMotivo: elegido.etiqueta,
      costoUnitario: tocaCosto ? Number(costo) || 0 : costoActual,
      nota
    })
    setGuardando(false)

    if (errorGuardado) return setError(errorGuardado)

    const signo = direccion === 'salida' ? '-' : '+'
    toast.exito(
      `${signo}${resultado.unidades} en ${producto.descripcion}: queda en ${resultado.stockFinal} ` +
      `(${elegido.rpc === 'entrada' ? 'entrada' : 'ajuste'} #${numeroDoc(movimiento)})`
    )
    onRegistrado?.(movimiento)
  }

  return (
    <div className="caja-overlay" onClick={guardando ? undefined : onCancel}>
      <div
        className="caja-box mov-box"
        onClick={(e) => e.stopPropagation()}
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`Mover stock de ${producto.descripcion}`}
      >
        <h2 className="caja-title">Mover stock</h2>
        <p className="caja-subtitle mov-producto">
          <span className="mov-numero">#{numeroProducto(producto)}</span>
          {producto.descripcion}
        </p>
        <p className="mov-estado">
          Hoy hay <strong>{stockActual}</strong> {stockActual === 1 ? 'unidad' : 'unidades'}
          {costoActual > 0 && <> · costo {formatCOP(costoActual)}</>}
        </p>

        {/* Entrada o salida primero: define los motivos y el resto del formulario */}
        <div className="mov-direccion" role="group" aria-label="Tipo de movimiento">
          <button
            type="button"
            className={`mov-dir-btn ${direccion === 'entrada' ? 'mov-dir-entrada' : ''}`}
            aria-pressed={direccion === 'entrada'}
            onClick={() => cambiarDireccion('entrada')}
            disabled={guardando}
          >
            <PackagePlus size={16} aria-hidden="true" /> Entraron
          </button>
          <button
            type="button"
            className={`mov-dir-btn ${direccion === 'salida' ? 'mov-dir-salida' : ''}`}
            aria-pressed={direccion === 'salida'}
            onClick={() => cambiarDireccion('salida')}
            disabled={guardando}
          >
            <PackageMinus size={16} aria-hidden="true" /> Salieron
          </button>
        </div>

        <label className="caja-label" htmlFor="mov-unidades">Unidades</label>
        <input
          id="mov-unidades"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="0"
          value={unidades}
          onChange={(e) => { setUnidades(e.target.value); setError('') }}
          disabled={guardando}
          autoFocus
          className="mov-input mov-input-unidades"
        />

        <label className="caja-label" htmlFor="mov-motivo">Motivo</label>
        <select
          id="mov-motivo"
          value={motivo}
          onChange={(e) => { setMotivo(e.target.value); setError('') }}
          disabled={guardando}
          className="mov-input"
        >
          {motivos.map((m) => (
            <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>
          ))}
        </select>

        {/* Solo en una compra: es el único movimiento que mueve el costo */}
        {tocaCosto && (
          <>
            <label className="caja-label" htmlFor="mov-costo">Costo de cada unidad</label>
            <div className="caja-money mov-money">
              <span className="caja-money-symbol">$</span>
              <input
                id="mov-costo"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatCOPInput(costo)}
                onChange={(e) => { setCosto(parseCOP(e.target.value)); setError('') }}
                disabled={guardando}
                className="caja-input"
              />
            </div>
            <p className="mov-hint">
              Viene con el costo que ya tenía. Cámbialo solo si el proveedor te
              cobró distinto: el costo del producto queda en el promedio entre
              lo que tenías y lo que llegó.
            </p>
          </>
        )}

        <label className="caja-label" htmlFor="mov-nota">
          Detalle <span className="mov-opcional">(opcional)</span>
        </label>
        <input
          id="mov-nota"
          type="text"
          placeholder={direccion === 'salida' ? 'Por ejemplo: se rompió en la bodega' : 'Por ejemplo: factura 1042'}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={guardando}
          className="mov-input"
        />

        {/* Lo que quita la duda de "suma o reemplaza": se ve el resultado */}
        {!resultado.error && (
          <p className={`mov-resumen ${direccion === 'salida' ? 'mov-resumen-salida' : ''}`}>
            Queda en <strong>{resultado.stockFinal}</strong>{' '}
            {resultado.stockFinal === 1 ? 'unidad' : 'unidades'}
            {tocaCosto && resultado.costoFinal !== costoActual && (
              <> · el costo pasa a <strong>{formatCOP(resultado.costoFinal)}</strong></>
            )}
            {!tocaCosto && resultado.valor < 0 && (
              <> · se pierden <strong>{formatCOP(Math.abs(resultado.valor))}</strong> al costo</>
            )}
            {tocaCosto && resultado.valor > 0 && (
              <> · compra de <strong>{formatCOP(resultado.valor)}</strong></>
            )}
          </p>
        )}

        {error && <div className="caja-alert mov-error">{error}</div>}

        <div className="mov-acciones">
          <button
            type="button"
            className="caja-btn-primary"
            onClick={confirmar}
            disabled={guardando || !!resultado.error}
          >
            {guardando ? 'Registrando...' : 'Registrar movimiento'}
          </button>
          <button
            type="button"
            className="caja-btn-ghost"
            onClick={onCancel}
            disabled={guardando}
          >
            Cancelar
          </button>
        </div>

        <p className="mov-pie">
          Queda en el historial del producto con su motivo. Para una factura con
          varios productos usa <strong>Inventario → Entrada de mercancía</strong>.
        </p>
      </div>
    </div>
  )
}

export default MovimientoStockModal
