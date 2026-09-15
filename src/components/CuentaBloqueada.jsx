import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useDialogo } from '../hooks/useDialogo'
import './CajaModal.css'

// Por qué un usuario autenticado no puede operar. Viene de la función
// estado_mi_cuenta() de la base de datos.
const MENSAJES = {
  sin_perfil: {
    titulo: 'Tu cuenta no está asignada',
    texto: 'Tu usuario existe pero todavía no pertenece a ningún negocio. ' +
           'Pídele al administrador de la plataforma que te asigne.'
  },
  sin_negocio: {
    titulo: 'Tu cuenta no está asignada',
    texto: 'Tu usuario no pertenece a ningún negocio. ' +
           'Pídele al administrador de la plataforma que te asigne.'
  },
  usuario_inactivo: {
    titulo: 'Usuario desactivado',
    texto: 'Tu acceso fue desactivado. Habla con el administrador de tu negocio ' +
           'si crees que es un error.'
  },
  negocio_suspendido: {
    titulo: 'Acceso suspendido',
    texto: 'El acceso de tu negocio al sistema está suspendido. ' +
           'Comunícate con tu proveedor del sistema para reactivarlo.'
  }
}

/**
 * Pantalla para un usuario que inició sesión pero no puede operar.
 *
 * Sin esto la app simplemente se veía vacía: la RLS devolvía cero filas y
 * nadie sabía si era un error, un problema de conexión o una suspensión.
 */
function CuentaBloqueada() {
  const { estadoCuenta, logout } = useAuth()
  const m = MENSAJES[estadoCuenta] || MENSAJES.sin_perfil
  // No se descarta: la única salida es cerrar sesión
  const refDialogo = useDialogo()

  return (
    <div className="caja-overlay">
      <div className="caja-box" ref={refDialogo} role="alertdialog" aria-modal="true" aria-labelledby="bloqueo-titulo" tabIndex={-1}>
        <h2 id="bloqueo-titulo" className="caja-title">🔒 {m.titulo}</h2>
        <p className="caja-subtitle">{m.texto}</p>
        <div className="caja-buttons">
          <button type="button" className="caja-btn-secondary" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

export default CuentaBloqueada
