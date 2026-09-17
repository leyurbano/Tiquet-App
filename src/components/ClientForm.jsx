import React, { useState, useEffect } from 'react'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import { formatCOP } from '../utils/currencyFormatter'
import './ClientForm.css'

const VACIO = { documento: '', nombre: '', telefono: '', cupo_fiado: '' }

/**
 * mostrarCupo: el fiado está instalado (migración 26).
 * puedeEditarCupo: además, el usuario es administrador. El cupo solo se
 * envía en ese caso; la base de datos lo protege igual con un trigger.
 */
function ClientForm({ onSubmit, initialData = null, onCancel, onDirtyChange, mostrarCupo = false, puedeEditarCupo = false }) {
  const [formData, setFormData] = useState(VACIO)
  // Evita el doble envío por doble clic y bloquea el botón mientras guarda
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData({
        documento: initialData.documento || '',
        nombre: initialData.nombre || '',
        telefono: initialData.telefono || '',
        cupo_fiado: initialData.cupo_fiado != null ? String(Math.round(Number(initialData.cupo_fiado))) : ''
      })
    }
  }, [initialData])

  const cambiar = (name, value) => {
    // Avisa al contenedor que hay cambios sin guardar
    onDirtyChange?.(true)
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleChange = (e) => cambiar(e.target.name, e.target.value)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (enviando) return

    const datos = {
      documento: formData.documento,
      nombre: formData.nombre,
      telefono: formData.telefono,
      ...(puedeEditarCupo ? { cupo_fiado: Number(formData.cupo_fiado) || 0 } : {})
    }

    setEnviando(true)
    const guardado = await onSubmit(datos)
    setEnviando(false)

    // 🔧 Solo se limpia si el guardado fue exitoso: antes un fallo dejaba
    // el formulario en blanco y había que reescribir todo
    if (guardado === true) {
      setFormData(VACIO)
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

      {mostrarCupo && (puedeEditarCupo ? (
        <>
          <label className="cf-label">Cupo de fiado</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatCOPInput(formData.cupo_fiado)}
            onChange={(e) => cambiar('cupo_fiado', parseCOP(e.target.value))}
            className="form-input"
          />
          <p className="cf-ayuda">
            Lo máximo que puede deber este cliente. En 0 no se le fía.
          </p>
        </>
      ) : (
        <p className="cf-ayuda">
          Cupo de fiado: {formatCOP(initialData?.cupo_fiado || 0)} (lo asigna un administrador)
        </p>
      ))}

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
