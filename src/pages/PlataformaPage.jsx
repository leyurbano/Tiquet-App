import React, { useState, useEffect } from 'react'
import { negocioService } from '../services/negocioService'
import { perfilService } from '../services/perfilService'
import { useAuth } from '../contexts/AuthContext'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombiaShort } from '../utils/dateFormatter'
import './PlataformaPage.css'
import { Building2, Users, PlusCircle, UserPlus } from 'lucide-react'

function PlataformaPage() {
  const { esSuperAdmin, perfil, loading: cargandoAuth } = useAuth()

  const [resumen, setResumen] = useState([])
  const [negocios, setNegocios] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState(null)

  const [creando, setCreando] = useState(false)

  // Alta completa: usuario + (opcionalmente) su negocio, en un solo paso
  const VACIO = {
    email: '', password: '', nombre: '', rol: 'administrador',
    negocio_id: '', nombre_negocio_nuevo: '', negocioNuevo: true
  }
  const [alta, setAlta] = useState(VACIO)
  // Asignación en curso por usuario: { [userId]: { nombre, negocio_id, rol } }
  const [asignacion, setAsignacion] = useState({})

  const cargar = async () => {
    setCargando(true)
    const [r, n, p, sp] = await Promise.all([
      negocioService.getResumenNegocios(),
      negocioService.getNegocios(),
      perfilService.getPerfiles(),
      perfilService.getUsuariosSinPerfil()
    ])
    setResumen(r)
    setNegocios(n)
    setPerfiles(p)
    setPendientes(sp)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const crearUsuario = async (e) => {
    e.preventDefault()
    setCreando(true)
    setMensaje(null)

    const { error } = await perfilService.crearUsuario({
      email: alta.email,
      password: alta.password,
      nombre: alta.nombre,
      rol: alta.rol,
      negocio_id: alta.negocioNuevo ? null : alta.negocio_id,
      nombre_negocio_nuevo: alta.negocioNuevo ? alta.nombre_negocio_nuevo : null
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: error })
    } else {
      setMensaje({
        tipo: 'ok',
        texto: `Usuario ${alta.email} creado. Entrégale la contraseña para que pueda entrar.`
      })
      setAlta(VACIO)
      await cargar()
    }
    setCreando(false)
  }

  const editarAlta = (campo, valor) => setAlta((p) => ({ ...p, [campo]: valor }))

  const asignar = async (usuario) => {
    const datos = asignacion[usuario.id] || {}
    if (!datos.negocio_id) {
      setMensaje({ tipo: 'error', texto: 'Selecciona a qué negocio pertenece.' })
      return
    }
    setMensaje(null)

    const { error } = await perfilService.crearPerfil({
      id: usuario.id,
      nombre: datos.nombre?.trim() || usuario.email.split('@')[0],
      username: usuario.email,
      email_interno: usuario.email,
      rol: datos.rol || 'vendedor',
      activo: true,
      negocio_id: Number(datos.negocio_id)
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo asignar: ' + error })
    } else {
      setMensaje({ tipo: 'ok', texto: usuario.email + ' asignado correctamente.' })
      await cargar()
    }
  }

  const cambiarPerfil = async (perfil, campo, valor) => {
    setMensaje(null)
    const { error } = await perfilService.actualizarPerfil(perfil.id, { [campo]: valor })
    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo actualizar: ' + error })
    } else {
      await cargar()
    }
  }

  const editarAsignacion = (userId, campo, valor) =>
    setAsignacion((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [campo]: valor }
    }))

  const cambiarEstadoNegocio = async (n) => {
    const suspender = n.activo
    const aviso = suspender
      ? `¿Suspender "${n.nombre_comercial}"? Sus usuarios perderán el acceso de inmediato.`
      : `¿Reactivar "${n.nombre_comercial}"?`
    if (!window.confirm(aviso)) return

    setMensaje(null)
    const actualizado = await negocioService.updateNegocio(n.negocio_id, { activo: !suspender })
    if (!actualizado) {
      setMensaje({ tipo: 'error', texto: 'No se pudo cambiar el estado del negocio.' })
      return
    }
    setMensaje({
      tipo: 'ok',
      texto: `"${n.nombre_comercial}" ${suspender ? 'suspendido' : 'reactivado'}.`
    })
    await cargar()
  }

  // Contraseña temporal legible: sin caracteres que se confunden (0/O, 1/l/I)
  const generarContrasenaTemporal = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const valores = crypto.getRandomValues(new Uint32Array(10))
    return Array.from(valores, (n) => chars[n % chars.length]).join('')
  }

  const restablecerContrasena = async (p) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${p.nombre}? Deberá cambiarla al volver a entrar.`)) return

    setMensaje(null)
    const temporal = generarContrasenaTemporal()
    const { error, aviso } = await perfilService.restablecerContrasena(p.id, temporal)

    // El aviso se muestra arriba de la página: se lleva la vista hasta él
    window.scrollTo({ top: 0, behavior: 'smooth' })

    if (error) {
      setMensaje({ tipo: 'error', texto: error })
      return
    }
    setMensaje({
      tipo: 'ok',
      texto: `Contraseña temporal de ${p.nombre}: ${temporal} — entrégasela; ` +
             'deberá cambiarla al entrar.' + (aviso ? ` (${aviso})` : '')
    })
  }

  const nombreNegocio = (id) =>
    negocios.find((n) => n.id === id)?.nombre_comercial || 'Sin negocio'

  if (cargandoAuth || cargando) {
    return <div className="plat-page"><p className="plat-loading">⏳ Cargando...</p></div>
  }

  // La RLS ya impide leer los datos; esto solo evita mostrar una pantalla rota
  if (!esSuperAdmin) {
    return (
      <div className="plat-page">
        <p className="plat-error">Esta sección es solo para administradores de la plataforma.</p>
      </div>
    )
  }

  return (
    <div className="plat-page">
      <h1 className="plat-title"><Building2 size={26} /> Plataforma</h1>

      {mensaje && (
        <div className={`plat-mensaje ${mensaje.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* ---------- Negocios ---------- */}
      <div className="plat-card">
        <h2 className="plat-subtitle">Negocios ({resumen.length})</h2>

        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th className="num">Usuarios</th>
                <th className="num">Productos</th>
                <th className="num">Ventas</th>
                <th className="num">Vendido</th>
                <th>Última venta</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((n) => (
                <tr key={n.negocio_id}>
                  <td>
                    <strong>{n.nombre_comercial}</strong>
                    {!n.activo && <span className="plat-inactivo">inactivo</span>}
                  </td>
                  <td className="num">{n.usuarios}</td>
                  <td className="num">{n.productos}</td>
                  <td className="num">{n.ventas}</td>
                  <td className="num">{formatCOP(n.monto_vendido)}</td>
                  <td className="plat-fecha">
                    {n.ultima_venta ? formatToColombiaShort(n.ultima_venta) : 'Sin ventas'}
                  </td>
                  <td>
                    {/* No se permite suspender el propio negocio: te dejaría
                        sin acceso a la plataforma desde la que se reactiva */}
                    {n.negocio_id === perfil?.negocio_id ? (
                      <span className="plat-email">Tu negocio</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cambiarEstadoNegocio(n)}
                        className={`plat-btn-sm ${n.activo ? 'plat-btn-peligro' : ''}`}
                      >
                        {n.activo ? 'Suspender' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* ---------- Alta de usuario (y negocio) ---------- */}
      <div className="plat-card">
        <h2 className="plat-subtitle"><PlusCircle size={18} /> Crear usuario</h2>
        <p className="plat-hint">
          Crea la cuenta y su perfil de una vez. Si es un cliente nuevo, se crea
          también su negocio y esta persona queda como su administrador.
        </p>

        <form onSubmit={crearUsuario} className="plat-form">
          <div className="plat-opciones">
            <label className="plat-radio">
              <input
                type="radio"
                checked={alta.negocioNuevo}
                onChange={() => editarAlta('negocioNuevo', true)}
                disabled={creando}
              />
              <span>Negocio nuevo</span>
            </label>
            <label className="plat-radio">
              <input
                type="radio"
                checked={!alta.negocioNuevo}
                onChange={() => editarAlta('negocioNuevo', false)}
                disabled={creando}
              />
              <span>Negocio existente</span>
            </label>
          </div>

          <div className="plat-form-grid">
            {alta.negocioNuevo ? (
              <label className="plat-campo">
                <span>Nombre del negocio</span>
                <input
                  type="text"
                  value={alta.nombre_negocio_nuevo}
                  onChange={(e) => editarAlta('nombre_negocio_nuevo', e.target.value)}
                  required
                  disabled={creando}
                  className="plat-input"
                />
              </label>
            ) : (
              <label className="plat-campo">
                <span>Negocio</span>
                <select
                  value={alta.negocio_id}
                  onChange={(e) => editarAlta('negocio_id', e.target.value)}
                  required
                  disabled={creando}
                  className="plat-input"
                >
                  <option value="" disabled hidden>Selecciona…</option>
                  {negocios.map((n) => (
                    <option key={n.id} value={n.id}>{n.nombre_comercial}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="plat-campo">
              <span>Rol</span>
              <select
                value={alta.rol}
                onChange={(e) => editarAlta('rol', e.target.value)}
                disabled={creando}
                className="plat-input"
              >
                <option value="administrador">Administrador</option>
                <option value="vendedor">Vendedor</option>
              </select>
            </label>

            <label className="plat-campo">
              <span>Nombre de la persona</span>
              <input
                type="text"
                value={alta.nombre}
                onChange={(e) => editarAlta('nombre', e.target.value)}
                disabled={creando}
                className="plat-input"
              />
            </label>

            <label className="plat-campo">
              <span>Correo</span>
              <input
                type="email"
                value={alta.email}
                onChange={(e) => editarAlta('email', e.target.value)}
                required
                disabled={creando}
                className="plat-input"
              />
            </label>

            <label className="plat-campo">
              <span>Contraseña inicial</span>
              <input
                type="text"
                value={alta.password}
                onChange={(e) => editarAlta('password', e.target.value)}
                minLength={8}
                required
                disabled={creando}
                className="plat-input"
              />
              <small>Mínimo 8 caracteres. Se la entregas al usuario.</small>
            </label>
          </div>

          <button type="submit" className="plat-btn" disabled={creando}>
            <PlusCircle size={16} /> {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      </div>

      {/* ---------- Usuarios pendientes de asignar ---------- */}
      {pendientes.length > 0 && (
        <div className="plat-card">
          <h2 className="plat-subtitle">
            <UserPlus size={18} /> Usuarios sin asignar ({pendientes.length})
          </h2>
          <p className="plat-hint">
            Existen en Supabase pero no tienen negocio, así que la aplicación se
            les ve vacía. Asígnalos para que puedan trabajar.
          </p>

          {pendientes.map((u) => (
            <div className="plat-pendiente" key={u.id}>
              <div className="plat-pendiente-email">{u.email}</div>
              <div className="plat-pendiente-campos">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={asignacion[u.id]?.nombre || ''}
                  onChange={(e) => editarAsignacion(u.id, 'nombre', e.target.value)}
                  className="plat-input"
                />
                <select
                  value={asignacion[u.id]?.negocio_id || ''}
                  onChange={(e) => editarAsignacion(u.id, 'negocio_id', e.target.value)}
                  className="plat-input"
                >
                  <option value="" disabled hidden>Negocio…</option>
                  {negocios.map((n) => (
                    <option key={n.id} value={n.id}>{n.nombre_comercial}</option>
                  ))}
                </select>
                <select
                  value={asignacion[u.id]?.rol || 'vendedor'}
                  onChange={(e) => editarAsignacion(u.id, 'rol', e.target.value)}
                  className="plat-input"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="administrador">Administrador</option>
                </select>
                <button onClick={() => asignar(u)} className="plat-btn">Asignar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Usuarios existentes ---------- */}
      <div className="plat-card">
        <h2 className="plat-subtitle"><Users size={18} /> Usuarios ({perfiles.length})</h2>

        <div className="plat-table-wrap">
          <table className="plat-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Negocio</th>
                <th>Rol</th>
                <th className="num">Activo</th>
                <th>Contraseña</th>
              </tr>
            </thead>
            <tbody>
              {perfiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nombre}</strong>
                    <div className="plat-email">{p.email_interno}</div>
                    {p.es_super_admin && <span className="plat-badge">super admin</span>}
                  </td>
                  <td>{nombreNegocio(p.negocio_id)}</td>
                  <td>
                    <select
                      value={p.rol}
                      onChange={(e) => cambiarPerfil(p, 'rol', e.target.value)}
                      className="plat-input plat-input-sm"
                    >
                      <option value="vendedor">Vendedor</option>
                      <option value="administrador">Administrador</option>
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="checkbox"
                      checked={p.activo}
                      onChange={(e) => cambiarPerfil(p, 'activo', e.target.checked)}
                    />
                  </td>
                  <td>
                    {/* La propia cuenta se cambia desde el menú, con la contraseña actual */}
                    {p.id !== perfil?.id && (
                      <button
                        type="button"
                        onClick={() => restablecerContrasena(p)}
                        className="plat-btn-sm"
                      >
                        Restablecer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="plat-hint">
          Desactivar a alguien le corta el acceso sin borrar su historial de ventas.
        </p>
      </div>
    </div>
  )
}

export default PlataformaPage
