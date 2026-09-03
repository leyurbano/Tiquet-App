import React, { useState, useEffect } from 'react'
import './ProductForm.css'

function ProductForm({ onSubmit, initialData = null, onCancel }) {
  const [formData, setFormData] = useState({
    descripcion: '',
    cantidad: '',
    costo: '',
    costo_total: '',
    precio_venta: ''
  })

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

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
    setFormData({
      descripcion: '',
      cantidad: '',
      costo: '',
      costo_total: '',
      precio_venta: ''
    })
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

      <div className="form-buttons">
        <button type="submit" className="btn-submit">
          {initialData ? 'Actualizar' : 'Crear Producto'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-cancel">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export default ProductForm
