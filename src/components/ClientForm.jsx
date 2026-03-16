import React, { useState, useEffect } from 'react'
import './ClientForm.css'

function ClientForm({ onSubmit, initialData = null, onCancel }) {
  const [formData, setFormData] = useState({
    documento: '',
    nombre: '',
    telefono: ''
  })

  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
    }
  }, [initialData])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
    setFormData({
      documento: '',
      nombre: '',
      telefono: ''
    })
  }

  return (
    <form onSubmit={handleSubmit} className="client-form-wrapper">
      <h2 className="form-title">
        {initialData ? 'Editar Cliente' : 'Nuevo Cliente'}
      </h2>
      
      <input
        type="text"
        name="documento"
        placeholder="Documento (DNI, RUC, etc.)"
        value={formData.documento}
        onChange={handleChange}
        required
        className="form-input"
      />

      <input
        type="text"
        name="nombre"
        placeholder="Nombre completo"
        value={formData.nombre}
        onChange={handleChange}
        required
        className="form-input"
      />

      <input
        type="tel"
        name="telefono"
        placeholder="Teléfono"
        value={formData.telefono}
        onChange={handleChange}
        className="form-input"
      />

      <div className="form-buttons">
        <button
          type="submit"
          className="btn-submit"
        >
          {initialData ? 'Actualizar' : 'Crear Cliente'}
        </button>
        {initialData && (
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

export default ClientForm
