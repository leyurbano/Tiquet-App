import React, { useState, useEffect } from 'react'
import './ProductForm.css'

function ProductForm({ onSubmit, initialData = null, onCancel, onDirtyChange, minimoNegocio = 0 }) {
  const [formData, setFormData] = useState({
    descripcion: '',
    cantidad: '',
    costo: '',
    costo_total: '',
    precio_venta: '',
    stock_minimo: ''
  })
  // Evita el doble envío por doble clic y bloquea el botón mientras guarda
  const [enviando, setEnviando] = useState(false)

  // Deja solo los dígitos de lo que escribe el usuario (quita puntos de miles y símbolos)
  const parseCOP = (value) => {
    return value.toString().replace(/\./g, '').replace(/[^0-9]/g, '')
  }

  // Formato de presentación únicamente: nunca modifica el valor guardado en el estado
  const formatDisplay = (value) => {
    if (value === '' || value === null || value === undefined) return ''
    const numero = parseFloat(value)
    if (isNaN(numero)) return ''
    return new Intl.NumberFormat('es-CO').format(numero)
  }

  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
    }
  }, [initialData])

  const handleChange = (e) => {
    const { name, value } = e.target
    let newValue = value

    // Avisa al contenedor que hay cambios sin guardar, para que pueda
    // confirmar antes de cerrar y no descartarlos por un clic mal puesto
    onDirtyChange?.(true)

    // Calcular costo_total automáticamente cuando cambia cantidad o costo
    if (name === 'cantidad' || name === 'costo') {
      const cantidad = name === 'cantidad' ? parseFloat(value) || 0 : parseFloat(formData.cantidad) || 0
      const costo = name === 'costo' ? parseFloat(value) || 0 : parseFloat(formData.costo) || 0
      const nuevoFormData = {
        ...formData,
        [name]: value,
        costo_total: (cantidad * costo).toFixed(2)
      }
      setFormData(nuevoFormData)
      return
    }

    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }))
  }

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
      setFormData({
        descripcion: '',
        cantidad: '',
        costo: '',
        costo_total: '',
        precio_venta: '',
        stock_minimo: ''
      })
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
          <label className="form-label">Cantidad en stock</label>
          <input
            type="number"
            name="cantidad"
            placeholder="0"
            value={formData.cantidad}
            onChange={handleChange}
            min="0"
            required
            className="form-input"
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
              onChange={(e) => handleChange({
                target: { name: 'costo', value: parseCOP(e.target.value) }
              })}
              required
              className="form-input"
            />
          </div>
        </div>
      </div>

      <label className="form-label">Costo total</label>
      <div className="form-input-money">
        <span className="money-symbol">$</span>
        <input
          type="text"
          name="costo_total"
          placeholder="Calculado automáticamente"
          value={formatDisplay(formData.costo_total)}
          readOnly
          className="form-input form-input-readonly"
        />
      </div>

      <label className="form-label">Precio de venta</label>
      <div className="form-input-money">
        <span className="money-symbol">$</span>
        <input
          type="text"
          inputMode="numeric"
          name="precio_venta"
          placeholder="0"
          value={formatDisplay(formData.precio_venta)}
          onChange={(e) => handleChange({
            target: { name: 'precio_venta', value: parseCOP(e.target.value) }
          })}
          required
          className="form-input"
        />
      </div>

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
