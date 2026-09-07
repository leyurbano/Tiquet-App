import React, { useState, useEffect } from 'react'
import './ClientForm.css'

function ClientForm({ onSubmit, initialData = null, onCancel, onDirtyChange }) {
  const [formData, setFormData] = useState({
    documento: '',
    nombre: '',
    telefono: ''
  })
  // Evita el doble envío por doble clic y bloquea el botón mientras guarda
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
    }
  }, [initialData])

  const handleChange = (e) => {
    const { name, value } = e.target
    // Avisa al contenedor que hay cambios sin guardar
    onDirtyChange?.(true)
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (enviando) return

    setEnviando(true)
    const guardado = await onSubmit(formData)
    setEnviando(false)

    // 🔧 Solo se limpia si el guardado fue exitoso: antes un fallo dejaba
    // el formulario en blanco y había que reescribir todo
    if (guardado === true) {
      setFormData({ documento: '', nombre: '', telefono: '' })
      onDirtyChange?.(false)
    }
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
          disabled={enviando}
        >
          {enviando ? 'Guardando...' : initialData ? 'Actualizar' : 'Crear Cliente'}
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

export default ClientForm
