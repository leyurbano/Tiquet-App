import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { perfilService } from '../services/perfilService'
import { toast } from '../utils/toast'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 🆕 Perfil: rol dentro del negocio, negocio_id y si es super admin
  const [perfil, setPerfil] = useState(null)
  // 🆕 Si puede operar, o por qué no (negocio suspendido, usuario inactivo...)
  const [estadoCuenta, setEstadoCuenta] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar sesión actual
    checkUser()

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
    } catch (error) {
      console.error('Error checking user:', error)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Cierra la sesión.
   *
   * 🔧 Antes, si `signOut()` devolvía error, el estado local NO se limpiaba
   * y la persona se quedaba adentro sin ningún aviso: desde el modal de
   * apertura de caja no había manera de salir, y desde el menú `navigate('/')`
   * rebotaba de vuelta a /sales porque la sesión seguía viva. `signOut()`
   * falla por cosas normales —el token venció, no hay red—, así que no puede
   * ser lo que decida si el usuario sale o no.
   *
   * Ahora el estado local se limpia pase lo que pase. Dejar a alguien dentro
   * después de que pidió salir es peor que cualquier error de red, sobre todo
   * en un computador compartido entre turnos.
   */
  async function logout() {
    let fallo = null

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      fallo = error
      // El cierre global necesita servidor. Si no se pudo, al menos se borra
      // la sesión guardada en este navegador: si no, el token sigue ahí y al
      // recargar la persona vuelve a entrar sola.
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Ya no hay sesión que borrar: es el resultado que se buscaba
      }
    } finally {
      setUser(null)
      setPerfil(null)
      setEstadoCuenta(null)
    }

    return fallo ? { success: false, error: fallo.message } : { success: true }
  }

  // Carga el perfil cada vez que cambia el usuario
  useEffect(() => {
    let cancelado = false
    if (!user) {
      setPerfil(null)
      setEstadoCuenta(null)
      return
    }
    Promise.all([perfilService.getMiPerfil(), perfilService.getEstadoCuenta()])
      .then(([p, estado]) => {
        if (cancelado) return
        setPerfil(p)
        setEstadoCuenta(estado)
      })
    return () => { cancelado = true }
  }, [user])

  // 🆕 El rol se leía una sola vez al iniciar sesión: si el super admin lo
  // cambiaba, la persona seguía con los permisos viejos en pantalla hasta
  // cerrar sesión. Ahora se vuelve a leer al volver a la pestaña y cada 5
  // minutos, así el cambio se aplica solo.
  //
  // Esto es comodidad, no seguridad: quien manda es la base de datos, que
  // rechaza igual lo que el rol nuevo no permita.
  useEffect(() => {
    if (!user) return

    const refrescar = async () => {
      if (document.visibilityState !== 'visible') return
      const [p, estado] = await Promise.all([
        perfilService.getMiPerfil(),
        perfilService.getEstadoCuenta()
      ])
      setPerfil((anterior) => {
        // Si cambiaron los permisos, se avisa: el menú cambia solo y sin
        // explicación se siente como un error
        if (anterior && p && anterior.rol !== p.rol) {
          toast.aviso(
            p.rol === 'administrador'
              ? 'Ahora eres administrador de este negocio'
              : 'Tu perfil cambió a vendedor'
          )
        }
        return p
      })
      setEstadoCuenta(estado)
    }

    document.addEventListener('visibilitychange', refrescar)
    const id = setInterval(refrescar, 5 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', refrescar)
      clearInterval(id)
    }
  }, [user])

  // Vuelve a leer el perfil, por ejemplo después de cambiar la contraseña
  const recargarPerfil = async () => {
    const p = await perfilService.getMiPerfil()
    setPerfil(p)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        estadoCuenta,
        // 🆕 Contraseña asignada por el administrador que aún no se cambia
        debeCambiarContrasena: !!perfil?.debe_cambiar_contrasena,
        recargarPerfil,
        esAdministrador: perfil?.rol === 'administrador',
        esSuperAdmin: !!perfil?.es_super_admin,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider')
  }
  return context
}
