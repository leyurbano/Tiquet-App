import React, { useState, useEffect } from 'react'
import { negocioService } from '../services/negocioService'
import { useAuth } from '../contexts/AuthContext'
import './ConfiguracionPage.css'
import { Store, Save, Upload, Trash2 } from 'lucide-react'

const CAMPOS = [
  { name: 'nombre_comercial', label: 'Nombre del negocio', requerido: true,
    ayuda: 'Se usa como encabezado del tiquete si no hay logo' },
  { name: 'nit', label: 'NIT', ayuda: 'Se imprime bajo los datos de contacto' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'ciudad', label: 'Ciudad' },
  { name: 'telefono', label: 'Teléfono' }
]

function ConfiguracionPage() {
  const { esAdministrador, esSuperAdmin } = useAuth()
  const [negocio, setNegocio] = useState(null)
  const [form, setForm] = useState({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  const puedeEditar = esAdministrador || esSuperAdmin

  useEffect(() => {
    negocioService.getMiNegocio().then((n) => {
      setNegocio(n)
      if (n) setForm(n)
      setCargando(false)
    })
  }, [])

  const cambiar = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setMensaje(null)
  }

  const subirLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    setSubiendoLogo(true)
    setMensaje(null)

    const anterior = form.logo_url
    const { url, error } = await negocioService.subirLogo(negocio.id, file)

    if (error) {
      setMensaje({ tipo: 'error', texto: error })
      setSubiendoLogo(false)
      return
    }

    // Se guarda de una vez: así el logo no se pierde si el usuario
    // cierra la página sin darle a "Guardar cambios"
    const actualizado = await negocioService.updateNegocio(negocio.id, { logo_url: url })
    if (actualizado) {
      setNegocio(actualizado)
      setForm(prev => ({ ...prev, logo_url: url }))
      if (anterior) negocioService.borrarLogo(anterior)
      setMensaje({ tipo: 'ok', texto: 'Logo actualizado' })
    } else {
      setMensaje({ tipo: 'error', texto: 'La imagen se subió pero no se pudo guardar.' })
    }
    setSubiendoLogo(false)
  }

  const quitarLogo = async () => {
    const anterior = form.logo_url
    const actualizado = await negocioService.updateNegocio(negocio.id, { logo_url: null })
    if (actualizado) {
      setNegocio(actualizado)
      setForm(prev => ({ ...prev, logo_url: null }))
      if (anterior) negocioService.borrarLogo(anterior)
      setMensaje({ tipo: 'ok', texto: 'Logo eliminado. Se imprimirá el nombre del negocio.' })
    }
  }

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje(null)

    // Solo se mandan los campos editables: nunca id, activo ni creado_en
    // logo_url no va aquí: se guarda solo al subir o quitar la imagen
    const cambios = {}
    CAMPOS.forEach((c) => { cambios[c.name] = form[c.name] || null })
    cambios.ancho_papel = form.ancho_papel || '55mm'
    cambios.mensaje_pie = form.mensaje_pie || null
    cambios.stock_minimo_defecto = Number(form.stock_minimo_defecto) || 0

    const actualizado = await negocioService.updateNegocio(negocio.id, cambios)

    if (actualizado) {
      setNegocio(actualizado)
      setForm(actualizado)
      setMensaje({ tipo: 'ok', texto: 'Configuración guardada' })
    } else {
      setMensaje({
        tipo: 'error',
        texto: 'No se pudo guardar. Revisa tu conexión o si tienes permisos de administrador.'
      })
    }
    setGuardando(false)
  }

  if (cargando) {
    return <div className="config-page"><p className="config-loading">⏳ Cargando configuración...</p></div>
  }

  if (!negocio) {
    return (
      <div className="config-page">
        <p className="config-error">
          No se pudo cargar el negocio. Puede que tu usuario no tenga un negocio asignado.
        </p>
      </div>
    )
  }

  return (
    <div className="config-page">
      <div className="config-header">
        <h1 className="config-title"><Store size={26} /> Configuración del negocio</h1>
      </div>

      {!puedeEditar && (
        <div className="config-aviso">
          Solo un administrador puede modificar estos datos. Puedes verlos, pero no guardarlos.
        </div>
      )}

      <div className="config-grid">
        <form onSubmit={guardar} className="config-card">
          {CAMPOS.map((campo) => (
            <div className="config-field" key={campo.name}>
              <label className="config-label">
                {campo.label}
                {campo.requerido && <span className="config-req"> *</span>}
              </label>
              <input
                type="text"
                value={form[campo.name] || ''}
                onChange={(e) => cambiar(campo.name, e.target.value)}
                required={campo.requerido}
                disabled={!puedeEditar || guardando}
                className="config-input"
              />
              {campo.ayuda && <p className="config-ayuda">{campo.ayuda}</p>}
            </div>
          ))}

          <div className="config-field">
            <label className="config-label">Mensaje del pie</label>
            <textarea
              value={form.mensaje_pie || ''}
              onChange={(e) => cambiar('mensaje_pie', e.target.value)}
              disabled={!puedeEditar || guardando}
              rows="3"
              className="config-input config-textarea"
            />
            <p className="config-ayuda">
              El texto se acomoda solo al ancho del papel. Usa Enter solo si
              quieres forzar un salto de línea.
            </p>
          </div>

          <div className="config-field">
            <label className="config-label">Logo del negocio</label>
            <div className="logo-box">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="logo-preview" />
              ) : (
                <div className="logo-vacio">Sin logo — se imprimirá el nombre</div>
              )}

              {puedeEditar && (
                <div className="logo-acciones">
                  <label className="logo-btn">
                    <Upload size={14} />
                    {subiendoLogo ? 'Subiendo...' : form.logo_url ? 'Cambiar' : 'Subir imagen'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={subirLogo}
                      disabled={subiendoLogo || guardando}
                      hidden
                    />
                  </label>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={quitarLogo}
                      className="logo-btn logo-btn-quitar"
                      disabled={subiendoLogo || guardando}
                    >
                      <Trash2 size={14} /> Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="config-ayuda">
              PNG, JPG, WEBP o SVG, máximo 1 MB. Para impresora térmica funciona
              mejor un PNG en blanco y negro con fondo transparente.
            </p>
          </div>

          <div className="config-field">
            <label className="config-label">Alerta de stock bajo</label>
            <input
              type="number"
              min="0"
              value={form.stock_minimo_defecto ?? 5}
              onChange={(e) => cambiar('stock_minimo_defecto', e.target.value)}
              disabled={!puedeEditar || guardando}
              className="config-input"
            />
            <p className="config-ayuda">
              Avisa cuando a un producto le queden estas unidades o menos.
              Aplica a todo el catálogo; puedes ajustar productos concretos
              desde su ficha. Pon 0 para desactivar las alertas.
            </p>
          </div>

          <div className="config-field">
            <label className="config-label">Ancho del papel</label>
            <select
              value={form.ancho_papel || '55mm'}
              onChange={(e) => cambiar('ancho_papel', e.target.value)}
              disabled={!puedeEditar || guardando}
              className="config-input"
            >
              <option value="55mm">55 mm</option>
              <option value="80mm">80 mm</option>
            </select>
            <p className="config-ayuda">Debe coincidir con tu impresora térmica</p>
          </div>

          {mensaje && (
            <div className={`config-mensaje ${mensaje.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
              {mensaje.texto}
            </div>
          )}

          {puedeEditar && (
            <button type="submit" className="config-btn" disabled={guardando}>
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}
        </form>

        {/* Vista previa: replica el encabezado y el pie reales del tiquete */}
        <div className="config-card config-preview-card">
          <h2 className="config-subtitle">Vista previa del tiquete</h2>
          <div className="ticket-preview" style={{ width: form.ancho_papel === '80mm' ? '80mm' : '55mm' }}>
            <div className="tp-header">
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" className="tp-logo" />
                : <div className="tp-nombre">{form.nombre_comercial || 'Nombre del negocio'}</div>}
              {form.direccion && <div className="tp-linea">{form.direccion}</div>}
              {form.ciudad && <div className="tp-linea">{form.ciudad}</div>}
              {form.telefono && <div className="tp-linea">{form.telefono}</div>}
              {form.nit && <div className="tp-linea">NIT: {form.nit}</div>}
              <div className="tp-fecha">07/09/2026, 3:45:00 PM</div>
            </div>
            <div className="tp-divider" />
            <div className="tp-cuerpo">Cliente, artículos y totales…</div>
            <div className="tp-divider" />
            <div className="tp-footer">
              {form.mensaje_pie || 'Gracias por su compra'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfiguracionPage
