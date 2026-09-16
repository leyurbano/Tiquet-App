import React, { useState, useEffect } from 'react'
import './ProductForm.css'

const VACIO = {
  descripcion: '',
  cantidad: '',
  costo: '',
  precio_venta: '',
  stock_minimo: ''
}

// Deja solo los dígitos de lo que escribe el usuario (quita puntos y símbolos)
const parseCOP = (value) =>
  value.toString().replace(/\./g, '').replace(/[^0-9]/g, '')

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

  useEffect(() => {
    if (initialData) {
      setFormData({
        descripcion: initialData.descripcion || '',
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
      <h2 className="product-form-title">
        {initialData ? 'Editar Producto' : 'Nuevo Producto'}
      </h2>

      <label className="form-label">Descripción</label>
      <textarea
        name="descripcion"
        placeholder="Descripción del producto"
        value={formData.descripcion}
        onChange={handleChange}
        rows="2"
        required
        className="form-input"
      />

      <div className="form-grid-2">
        <div>
          <label className="form-label">{initialData ? 'Cantidad en stock' : 'Stock inicial'}</label>
          <input
            type="number"
            name="cantidad"
            placeholder="0"
            value={formData.cantidad}
            onChange={handleChange}
            min="0"
            readOnly={!!initialData}
            className={initialData ? 'form-input form-input-readonly' : 'form-input'}
          />
        </div>

        <div>
          <label className="form-label">Costo unitario</label>
          <div className="form-input-money">
            <span className="money-symbol">$</span>
            <input
              type="text"
              inputMode="numeric"
              name="costo"
              placeholder="0"
              value={formatDisplay(formData.costo)}
              onChange={(e) => cambiar('costo', parseCOP(e.target.value))}
              readOnly={!!initialData}
              className={initialData ? 'form-input form-input-readonly' : 'form-input'}
            />
          </div>
        </div>
      </div>

      {/* 🔧 Antes ambos eran obligatorios: dar de alta un producto que todavía
          no llega obligaba a escribir 0 y 0 a mano */}
      {!initialData && (
        <p className="form-ayuda">
          Si el producto todavía no te ha llegado, deja el stock y el costo vacíos.
          Los llenas después con una entrada de mercancía en Inventario.
        </p>
      )}

      {/* Al editar, stock y costo solo se cambian en Inventario: así cada
          cambio queda registrado con su motivo y no se pisan ventas */}
      {initialData && (
        <p className="form-ayuda form-ayuda-bloqueo">
          El stock y el costo se cambian en <strong>Inventario</strong>: con una entrada
          de mercancía o con un ajuste. Así queda registrado por qué cambiaron.
        </p>
      )}

      {/* 🔧 Antes era un campo de formulario bloqueado, que parecía pendiente
          de llenar. Es solo una multiplicación: va como texto */}
      {valorInventario > 0 && (
        <p className="form-resumen">
          {initialData ? 'Valor en inventario' : 'Valor del inventario inicial'}:{' '}
          <strong>${formatDisplay(valorInventario)}</strong>
          <span> ({cantidad} × ${formatDisplay(costo)})</span>
        </p>
      )}

      <label className="form-label">Precio de venta</label>
      <div className="form-input-money">
        <span className="money-symbol">$</span>
        <input
          type="text"
          inputMode="numeric"
          name="precio_venta"
          placeholder="0"
          value={formatDisplay(formData.precio_venta)}
          onChange={(e) => cambiar('precio_venta', parseCOP(e.target.value))}
          required
          className="form-input"
        />
      </div>

      {vendeAPerdida && (
        <p className="form-aviso-perdida">
          El precio es menor que el costo: perderías{' '}
          <strong>${formatDisplay(costo - precio)}</strong> por cada unidad que vendas.
          Revísalo antes de guardar.
        </p>
      )}

      <label className="form-label">Alerta de stock bajo</label>
      <input
        type="number"
        name="stock_minimo"
        placeholder={`Por defecto: ${minimoNegocio}`}
        value={formData.stock_minimo ?? ''}
        onChange={handleChange}
        min="0"
        className="form-input"
      />
      <p className="form-ayuda">
        Déjalo vacío para usar el valor general del negocio. Pon 0 para no
        recibir alertas de este producto.
      </p>

      <div className="form-buttons">
        <button type="submit" className="btn-submit" disabled={enviando}>
          {enviando ? 'Guardando...' : initialData ? 'Actualizar' : 'Crear Producto'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-cancel"
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
