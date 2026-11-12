import React, { useState, useEffect, useId } from 'react'
import { PackagePlus, Pencil, Save, X, Loader2 } from 'lucide-react'
import './ProductForm.css'

const VACIO = {
  descripcion: '',
  codigo_barras: '',
  cantidad: '',
  costo: '',
  precio_venta: '',
  stock_minimo: ''
}

// Deja solo los dígitos de lo que escribe el usuario (quita puntos y símbolos)
const parseCOP = (value) =>
  value.toString().replace(/\./g, '').replace(/[^0-9]/g, '')

// Deja solo los dígitos: type="number" acepta "e", "-" y "," y cambia el valor
// con la rueda del mouse
const soloDigitos = (valor) => valor.replace(/\D/g, '')

// Formato de presentación únicamente: nunca cambia el valor guardado
const formatDisplay = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const numero = parseFloat(value)
  if (isNaN(numero)) return ''
  return new Intl.NumberFormat('es-CO').format(numero)
}

function ProductForm({ onSubmit, initialData = null, onCancel, onDirtyChange, minimoNegocio = 0 }) {
  const [formData, setFormData] = useState(VACIO)
  // Evita el doble envío por doble clic y bloquea el botón mientras guarda
  const [enviando, setEnviando] = useState(false)
  // Conecta cada etiqueta con su campo: clic en la etiqueta enfoca el campo
  // y el lector de pantalla lee el nombre
  const idCampo = useId()

  useEffect(() => {
    if (initialData) {
      setFormData({
        descripcion: initialData.descripcion || '',
        codigo_barras: initialData.codigo_barras || '',
        cantidad: initialData.cantidad ?? '',
        costo: initialData.costo ?? '',
        precio_venta: initialData.precio_venta ?? '',
        stock_minimo: initialData.stock_minimo ?? ''
      })
    }
  }, [initialData])

  const cambiar = (name, value) => {
    // Avisa al contenedor que hay cambios sin guardar, para que pueda
    // confirmar antes de cerrar y no descartarlos por un clic mal puesto
    onDirtyChange?.(true)
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleChange = (e) => cambiar(e.target.name, e.target.value)

  const cantidad = parseFloat(formData.cantidad) || 0
  const costo = parseFloat(formData.costo) || 0
  const precio = parseFloat(formData.precio_venta) || 0
  const valorInventario = cantidad * costo
  // Aviso, no bloqueo: hay negocios que venden algo a pérdida a propósito
  const vendeAPerdida = costo > 0 && precio > 0 && precio < costo
  // $0 se permite (obsequios, bolsas) pero se avisa: el riesgo es crearlo
  // "para llenarlo después", olvidarlo y venderlo gratis
  const precioCero = formData.precio_venta !== '' && precio === 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (enviando) return

    setEnviando(true)
    const guardado = await onSubmit(formData)
    setEnviando(false)

    // 🔧 Solo se limpia si el guardado fue exitoso. Antes se limpiaba de
    // inmediato, así que un fallo de red dejaba el modal abierto con todos
    // los campos en blanco y el usuario tenía que reescribir la ficha.
    if (guardado === true) {
      setFormData(VACIO)
      onDirtyChange?.(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="product-form-wrapper">
      <div className="pf-header">
        <h2 className="product-form-title">
          {initialData
            ? <Pencil size={20} aria-hidden="true" />
            : <PackagePlus size={22} aria-hidden="true" />}
          {initialData ? 'Editar Producto' : 'Nuevo Producto'}
        </h2>
        {/* Solo se cerraba con Cancelar, Escape o clic afuera; en celular la
            ✕ es lo que se busca primero. Pasa por la misma confirmación de
            cambios sin guardar */}
        {onCancel && (
          <button
            type="button"
            className="pf-cerrar"
            onClick={onCancel}
            disabled={enviando}
            aria-label="Cerrar"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 🔧 Antes era un textarea de 2 líneas: más alto que los demás campos
          y Enter metía saltos de línea en el nombre, que salían en el tiquete
          y estorbaban la búsqueda. Enter no hace nada: solo envía el botón */}
      <label className="pf-label" htmlFor={`${idCampo}-descripcion`}>Descripción</label>
      <input
        id={`${idCampo}-descripcion`}
        type="text"
        name="descripcion"
        placeholder="Descripción del producto"
        value={formData.descripcion}
        onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        required
        className="pf-input"
      />

      {/* El lector de código de barras se comporta como un teclado: con el
          foco aquí, teclea el código y manda Enter. Por eso no se envía el
          formulario con Enter en este campo: se escanea y se sigue llenando */}
      <label className="pf-label" htmlFor={`${idCampo}-codigo-barras`}>
        Código de barras <span className="pf-opcional">(opcional)</span>
      </label>
      <input
        id={`${idCampo}-codigo-barras`}
        name="codigo_barras"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Escanéalo con el lector o escríbelo"
        value={formData.codigo_barras}
        onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        className="pf-input"
      />

      <div className="pf-grid-2">
        <div>
          <label className="pf-label" htmlFor={`${idCampo}-cantidad`}>
            {initialData ? 'Cantidad en stock' : 'Stock inicial'}
          </label>
          <input
            id={`${idCampo}-cantidad`}
            type="text"
            inputMode="numeric"
            name="cantidad"
            placeholder="0"
            value={formatDisplay(formData.cantidad)}
            onChange={(e) => cambiar('cantidad', soloDigitos(e.target.value))}
            readOnly={!!initialData}
            className={initialData ? 'pf-input pf-input-readonly' : 'pf-input'}
          />
        </div>

        <div>
          <label className="pf-label" htmlFor={`${idCampo}-costo`}>Costo unitario</label>
          <div className="pf-money">
            <span className="money-symbol" aria-hidden="true">$</span>
            <input
              id={`${idCampo}-costo`}
              type="text"
              inputMode="numeric"
              name="costo"
              placeholder="0"
              value={formatDisplay(formData.costo)}
              onChange={(e) => cambiar('costo', parseCOP(e.target.value))}
              readOnly={!!initialData}
              className={initialData ? 'pf-input pf-input-readonly' : 'pf-input'}
            />
          </div>
        </div>
      </div>

      {/* 🔧 Antes ambos eran obligatorios: dar de alta un producto que todavía
          no llega obligaba a escribir 0 y 0 a mano */}
      {!initialData && (
        <p className="pf-ayuda">
          Si el producto todavía no te ha llegado, deja el stock y el costo vacíos.
          Los llenas después con una entrada de mercancía en Inventario.
        </p>
      )}

      {/* Al editar, stock y costo solo se cambian en Inventario: así cada
          cambio queda registrado con su motivo y no se pisan ventas */}
      {initialData && (
        <p className="pf-ayuda pf-ayuda-bloqueo">
          El stock y el costo se cambian en <strong>Inventario</strong>: con una entrada
          de mercancía o con un ajuste. Así queda registrado por qué cambiaron.
        </p>
      )}

      {/* 🔧 Antes era un campo de formulario bloqueado, que parecía pendiente
          de llenar. Es solo una multiplicación: va como texto */}
      {valorInventario > 0 && (
        <p className="pf-resumen">
          {initialData ? 'Valor en inventario' : 'Valor del inventario inicial'}:{' '}
          <strong>${formatDisplay(valorInventario)}</strong>
          <span> ({formatDisplay(cantidad)} × ${formatDisplay(costo)})</span>
        </p>
      )}

      {/* Lado a lado como Stock y Costo: la alerta es un número corto y a
          todo el ancho quedaba casi vacía */}
      <div className="pf-grid-2">
        <div>
          <label className="pf-label" htmlFor={`${idCampo}-precio`}>Precio de venta</label>
          <div className="pf-money">
            <span className="money-symbol" aria-hidden="true">$</span>
            <input
              id={`${idCampo}-precio`}
              type="text"
              inputMode="numeric"
              name="precio_venta"
              placeholder="0"
              value={formatDisplay(formData.precio_venta)}
              onChange={(e) => cambiar('precio_venta', parseCOP(e.target.value))}
              required
              className="pf-input"
            />
          </div>
        </div>

        <div>
          <label className="pf-label" htmlFor={`${idCampo}-stock-minimo`}>Alerta de stock bajo</label>
          <input
            id={`${idCampo}-stock-minimo`}
            type="text"
            inputMode="numeric"
            name="stock_minimo"
            placeholder={`Por defecto: ${minimoNegocio}`}
            value={formatDisplay(formData.stock_minimo)}
            onChange={(e) => cambiar('stock_minimo', soloDigitos(e.target.value))}
            className="pf-input"
          />
        </div>
      </div>

      {vendeAPerdida && (
        <p className="pf-aviso-perdida">
          El precio es menor que el costo: perderías{' '}
          <strong>${formatDisplay(costo - precio)}</strong> por cada unidad que vendas.
          Revísalo antes de guardar.
        </p>
      )}

      {precioCero && (
        <p className="pf-aviso-perdida">
          Con precio <strong>$0</strong> este producto se venderá gratis. Si es un
          obsequio, está bien; si todavía no tiene precio, escríbelo antes de guardar.
        </p>
      )}

      {/* Nombra el campo: al ir bajo la fila ya no queda claro a cuál se refiere */}
      <p className="pf-ayuda">
        Alerta de stock: déjala vacía para usar el valor general del negocio.
        Pon 0 para no recibir alertas de este producto.
      </p>

      <div className="pf-buttons">
        <button type="submit" className="pf-btn-submit" disabled={enviando}>
          {enviando
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <Save size={16} aria-hidden="true" />}
          {enviando ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear producto'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="pf-btn-cancel"
            disabled={enviando}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export default ProductForm
