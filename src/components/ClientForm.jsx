import React, { useState, useEffect, useId } from 'react'
import { UserPlus, Pencil, Save, X, Loader2 } from 'lucide-react'
import { parseCOP, formatCOPInput } from '../utils/cashSummary'
import { formatCOP } from '../utils/currencyFormatter'
import { esConsumidorFinal } from '../utils/clientes'
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
  // Conecta cada etiqueta con su campo
  const idCampo = useId()

  // La venta rápida busca al Consumidor final por su documento: la base de
  // datos no deja cambiarlo, así que el campo ni se ofrece
  const documentoFijo = esConsumidorFinal(initialData)

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
      <div className="cf-header">
        <h2 className="cf-title">
          {initialData
            ? <Pencil size={20} aria-hidden="true" />
            : <UserPlus size={22} aria-hidden="true" />}
          {initialData ? 'Editar Cliente' : 'Nuevo Cliente'}
        </h2>
        {onCancel && (
          <button
            type="button"
            className="cf-cerrar"
            onClick={onCancel}
            disabled={enviando}
            aria-label="Cerrar"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 🔧 Antes los campos no tenían etiqueta, solo el texto gris de
          adentro: al escribir desaparecía y al editar un cliente no se sabía
          qué era cada dato. Y el ejemplo decía "DNI, RUC", que no son
          documentos colombianos */}
      <label className="cf-label" htmlFor={`${idCampo}-documento`}>Cédula o NIT</label>
      <input
        id={`${idCampo}-documento`}
        type="text"
        name="documento"
        autoComplete="off"
        placeholder="Ej: 1020304050 o 900123456-7"
        value={formData.documento}
        onChange={handleChange}
        readOnly={documentoFijo}
        required
        className={documentoFijo ? 'cf-input cf-input-readonly' : 'cf-input'}
      />
      {documentoFijo && (
        <p className="cf-ayuda">
          Lo usa la venta rápida: su documento no se puede cambiar.
        </p>
      )}

      <label className="cf-label" htmlFor={`${idCampo}-nombre`}>Nombre completo</label>
      <input
        id={`${idCampo}-nombre`}
        type="text"
        name="nombre"
        autoComplete="off"
        placeholder="Nombre y apellido, o razón social"
        value={formData.nombre}
        onChange={handleChange}
        required
        className="cf-input"
      />

      <label className="cf-label" htmlFor={`${idCampo}-telefono`}>
        Teléfono <span className="cf-opcional">(opcional)</span>
      </label>
      <input
        id={`${idCampo}-telefono`}
        type="tel"
        name="telefono"
        autoComplete="off"
        placeholder="Ej: 300 123 4567"
        value={formData.telefono}
        onChange={handleChange}
        className="cf-input"
      />

      {mostrarCupo && (puedeEditarCupo ? (
        <>
          <label className="cf-label" htmlFor={`${idCampo}-cupo`}>Cupo de fiado</label>
          <div className="cf-money">
            <span className="money-symbol" aria-hidden="true">$</span>
            <input
              id={`${idCampo}-cupo`}
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatCOPInput(formData.cupo_fiado)}
              onChange={(e) => cambiar('cupo_fiado', parseCOP(e.target.value))}
              className="cf-input"
            />
          </div>
          <p className="cf-ayuda">
            Lo máximo que puede deber este cliente. En 0 no se le fía.
          </p>
        </>
      ) : (
        <p className="cf-ayuda cf-ayuda-bloqueo">
          Cupo de fiado: <strong>{formatCOP(initialData?.cupo_fiado || 0)}</strong>. Lo asigna
          un administrador.
        </p>
      ))}

      <div className="cf-buttons">
        <button type="submit" className="cf-btn-submit" disabled={enviando}>
          {enviando
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <Save size={16} aria-hidden="true" />}
          {enviando ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear cliente'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="cf-btn-cancel"
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
