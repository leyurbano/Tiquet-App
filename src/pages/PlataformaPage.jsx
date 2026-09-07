import React, { useState, useEffect } from 'react'
import { negocioService } from '../services/negocioService'
import { perfilService } from '../services/perfilService'
import { useAuth } from '../contexts/AuthContext'
import { formatCOP } from '../utils/currencyFormatter'
import { formatToColombiaShort } from '../utils/dateFormatter'
import './PlataformaPage.css'
import { Building2, Users, PlusCircle, UserPlus } from 'lucide-react'

function PlataformaPage() {
  const { esSuperAdmin, loading: cargandoAuth } = useAuth()

  const [resumen, setResumen] = useState([])
  const [negocios, setNegocios] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState(null)

  const [nuevoNegocio, setNuevoNegocio] = useState('')
  const [creando, setCreando] = useState(false)
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

  const crearNegocio = async (e) => {
    e.preventDefault()
    if (!nuevoNegocio.trim()) return
    setCreando(true)
    setMensaje(null)

    const { error } = await negocioService.crearNegocio({
      nombre_comercial: nuevoNegocio.trim()
    })

    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo crear el negocio: ' + error })
    } else {
      setMensaje({
        tipo: 'ok',
        texto: 'Negocio creado. Su administrador podrá completar los datos en Configuración.'
      })
      setNuevoNegocio('')
      await cargar()
    }
    setCreando(false)
  }

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={crearNegocio} className="plat-form-inline">
          <input
            type="text"
            value={nuevoNegocio}
            onChange={(e) => setNuevoNegocio(e.target.value)}
            placeholder="Nombre del negocio nuevo"
            disabled={creando}
            className="plat-input"
          />
          <button type="submit" className="plat-btn" disabled={creando || !nuevoNegocio.trim()}>
            <PlusCircle size={16} /> {creando ? 'Creando...' : 'Crear negocio'}
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
                  <option value="">Negocio…</option>
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
