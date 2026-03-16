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
        <input
          type="number"
          name="cantidad"
          placeholder="Cantidad"
          value={formData.cantidad}
          onChange={handleChange}
          required
          className="form-input"
        />

        <input
          type="number"
          name="costo"
          placeholder="Costo unitario"
          value={formData.costo}
          onChange={handleChange}
          step="0.01"
          required
          className="form-input"
        />
      </div>

      <input
        type="number"
        name="costo_total"
        placeholder="Costo total (calculado automáticamente)"
        value={formData.costo_total}
        readOnly
        className="form-input form-input-readonly"
      />

      <input
        type="number"
        name="precio_venta"
        placeholder="Precio de venta"
        value={formData.precio_venta}
        onChange={handleChange}
        step="0.01"
        required
        className="form-input"
      />

      <div className="form-buttons">
        <button
          type="submit"
          className="btn-submit"
        >
          {initialData ? 'Actualizar' : 'Crear Producto'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-cancel"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export default ProductForm
