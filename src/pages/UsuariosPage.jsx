import React, { useState, useEffect } from 'react'
import { perfilService } from '../services/perfilService'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../utils/toast'
import { generarContrasenaTemporal } from '../utils/contrasena'
import './UsuariosPage.css'
import { Users, UserPlus } from 'lucide-react'

const VACIO = { nombre: '', email: '', rol: 'vendedor' }

/**
 * Usuarios del negocio, para su administrador (de cualquier negocio).
 *
 * Permite crear usuarios, restablecer contraseñas, activarlos o
 * desactivarlos y cambiarles el rol, sin depender del super admin.
 *
 * Los permisos reales viven en la base de datos y en las Edge Functions:
 *  - RLS: un administrador solo ve y edita perfiles de su negocio.
 *  - Trigger proteger_perfil: nadie que no sea super admin toca a un super
 *    admin ni cambia negocio, correo o permiso de plataforma.
 *  - crear-usuario / restablecer-contrasena: el negocio sale de la sesión.
 * Esta pantalla solo evita mostrar acciones que igual serían rechazadas.
 */
function UsuariosPage() {
  const { perfil, esAdministrador } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(VACIO)
  const [creando, setCreando] = useState(false)
  // Contraseña temporal recién generada: se muestra hasta que se confirme
  // que se entregó (un aviso emergente se iría antes de poder anotarla)
  const [credencial, setCredencial] = useState(null)

  const cargar = async () => {
    setCargando(true)
    const todos = await perfilService.getPerfiles()
    // El super admin recibe los perfiles de todos los negocios: aquí solo
    // interesan los del negocio propio
    setUsuarios(todos.filter((u) => u.negocio_id === perfil?.negocio_id))
    setCargando(false)
  }

  useEffect(() => {
    if (perfil?.negocio_id) cargar()
  }, [perfil?.negocio_id])

  const crear = async (e) => {
    e.preventDefault()
    setCreando(true)

    const password = generarContrasenaTemporal()
    const email = nuevo.email.trim().toLowerCase()
    const { error } = await perfilService.crearUsuario({
      email,
      password,
      nombre: nuevo.nombre,
      rol: nuevo.rol,
      negocio_id: perfil.negocio_id,
      nombre_negocio_nuevo: null
    })
    setCreando(false)

    if (error) return toast.error(error)

    setCredencial({ nombre: nuevo.nombre || email, email, password, motivo: 'creado' })
    setNuevo(VACIO)
    toast.exito('Usuario creado')
    cargar()
  }

  const restablecer = async (u) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.nombre}? Deberá cambiarla al volver a entrar.`)) return

    const password = generarContrasenaTemporal()
    const { error, aviso } = await perfilService.restablecerContrasena(u.id, password)
    if (error) return toast.error(error)

    setCredencial({ nombre: u.nombre, email: u.email_interno, password, motivo: 'restablecido' })
    if (aviso) toast.aviso(aviso)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cambiar = async (u, campo, valor) => {
    if (campo === 'activo' && !valor &&
        !window.confirm(`¿Desactivar a ${u.nombre}? No podrá entrar hasta que lo reactives.`)) return
    if (campo === 'rol' && valor === 'administrador' &&
        !window.confirm(`¿Dar permisos de administrador a ${u.nombre}? Podrá anular ventas, cambiar precios y gestionar usuarios.`)) return

    const { perfil: actualizado, error } = await perfilService.actualizarPerfil(u.id, { [campo]: valor })
    // Sin error pero sin fila: la RLS no dejó modificarlo
    if (error || !actualizado) {
      toast.error('No se pudo actualizar' + (error ? ': ' + error : ': no tienes permiso sobre este usuario'))
      return
    }

    if (campo === 'activo') toast.exito(`${u.nombre} ${valor ? 'activado' : 'desactivado'}`)
    else toast.exito(`${u.nombre} ahora es ${valor}`)
    cargar()
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(credencial.password)
      toast.exito('Contraseña copiada')
    } catch {
      toast.aviso('No se pudo copiar automáticamente; anótala a mano')
    }
  }

  if (!esAdministrador) {
    return (
      <div className="usr-page">
        <p className="usr-vacio">Esta sección es solo para administradores del negocio.</p>
      </div>
    )
  }

  return (
    <div className="usr-page">
      <h1 className="usr-title"><Users size={26} /> Usuarios del negocio</h1>

      {credencial && (
        <div className="usr-credencial" role="status">
          <p className="usr-credencial-titulo">
            {credencial.motivo === 'creado' ? 'Usuario creado' : 'Contraseña restablecida'}: {credencial.nombre}
          </p>
          <p className="usr-credencial-dato">Correo: <strong>{credencial.email}</strong></p>
          <p className="usr-credencial-dato">
            Contraseña temporal: <code className="usr-password">{credencial.password}</code>
          </p>
          <p className="usr-credencial-nota">
            Entrégasela a la persona. Al entrar por primera vez, la app le pedirá
            crear una contraseña propia. Esta contraseña no se vuelve a mostrar.
          </p>
          <div className="usr-credencial-acciones">
            <button type="button" className="usr-btn" onClick={copiar}>Copiar contraseña</button>
            <button type="button" className="usr-btn usr-btn-sec" onClick={() => setCredencial(null)}>
              Ya la entregué
            </button>
          </div>
        </div>
      )}

      {/* ---------- Crear usuario ---------- */}
      <div className="usr-card">
        <h2 className="usr-subtitle"><UserPlus size={18} /> Nuevo usuario</h2>
        <form onSubmit={crear} className="usr-form">
          <label className="usr-campo">
            <span>Nombre</span>
            <input
              type="text"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
              required
              disabled={creando}
              className="usr-input"
            />
          </label>
          <label className="usr-campo">
            <span>Correo</span>
            <input
              type="email"
              value={nuevo.email}
              onChange={(e) => setNuevo((p) => ({ ...p, email: e.target.value }))}
              required
              disabled={creando}
              className="usr-input"
            />
          </label>
          <label className="usr-campo">
            <span>Rol</span>
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo((p) => ({ ...p, rol: e.target.value }))}
              disabled={creando}
              className="usr-input"
            >
              <option value="vendedor">Vendedor</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          <button type="submit" className="usr-btn usr-btn-crear" disabled={creando}>
            {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
        <p className="usr-hint">
          La contraseña temporal la genera el sistema y se muestra una sola vez.
        </p>
      </div>

      {/* ---------- Lista ---------- */}
      <div className="usr-card">
        <h2 className="usr-subtitle">Equipo ({usuarios.length})</h2>

        {cargando ? (
          <p className="usr-vacio">⏳ Cargando...</p>
        ) : (
          <div className="usr-tabla-wrap">
            <table className="usr-tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th className="centro">Activo</th>
                  <th>Contraseña</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const esYo = u.id === perfil?.id
                  // La cuenta propia se gestiona desde el menú; la de un super
                  // admin, solo desde la plataforma (la base de datos lo exige)
                  const bloqueado = esYo || u.es_super_admin
                  return (
                    <tr key={u.id} className={!u.activo ? 'usr-inactivo' : ''}>
                      <td>
                        <strong>{u.nombre}</strong>
                        {esYo && <span className="usr-badge">Tú</span>}
                        {u.es_super_admin && <span className="usr-badge usr-badge-plat">Plataforma</span>}
                        <div className="usr-email">{u.email_interno}</div>
                      </td>
                      <td>
                        <select
                          value={u.rol}
                          onChange={(e) => cambiar(u, 'rol', e.target.value)}
                          disabled={bloqueado}
                          className="usr-input usr-input-sm"
                        >
                          <option value="vendedor">Vendedor</option>
                          <option value="administrador">Administrador</option>
                        </select>
                      </td>
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={u.activo}
                          onChange={(e) => cambiar(u, 'activo', e.target.checked)}
                          disabled={bloqueado}
                          aria-label={`Activo: ${u.nombre}`}
                        />
                      </td>
                      <td>
                        {!bloqueado && (
                          <button type="button" className="usr-btn usr-btn-sm" onClick={() => restablecer(u)}>
                            Restablecer
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="usr-hint">
          Desactivar a alguien le corta el acceso sin borrar su historial de ventas.
        </p>
      </div>
    </div>
  )
}

export default UsuariosPage
