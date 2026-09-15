import { supabase } from './supabaseClient'

export const perfilService = {
  /**
   * Trae el perfil del usuario logueado: su rol dentro del negocio, a qué
   * negocio pertenece y si es super admin de la plataforma.
   *
   * Es la fuente de verdad para mostrar u ocultar opciones en la interfaz.
   * Ojo: ocultar un botón no es seguridad — quien mande la petición a mano
   * igual la manda. Lo que protege de verdad son las políticas de RLS; esto
   * solo evita mostrarle a la gente cosas que no puede usar.
   */
  async getMiPerfil() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return null

      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error obteniendo el perfil:', error.message || error)
      return null
    }
  },

  /**
   * Por qué el usuario puede o no operar: 'activo', 'sin_perfil',
   * 'sin_negocio', 'usuario_inactivo' o 'negocio_suspendido'.
   */
  async getEstadoCuenta() {
    try {
      const { data, error } = await supabase.rpc('estado_mi_cuenta')
      if (error) throw error
      return data || 'sin_perfil'
    } catch (error) {
      console.error('Error obteniendo el estado de la cuenta:', error.message || error)
      // Ante un fallo de red no se bloquea al usuario: la RLS sigue protegiendo
      return 'activo'
    }
  },

  // Todos los perfiles. La RLS decide cuántos devuelve: el administrador ve
  // los de su negocio, el super admin ve todos.
  async getPerfiles() {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .order('nombre')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error listando perfiles:', error.message || error)
      return []
    }
  },

  // Usuarios de Auth que aún no tienen perfil (solo responde a super admins)
  async getUsuariosSinPerfil() {
    try {
      const { data, error } = await supabase.rpc('usuarios_sin_perfil')
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error listando usuarios sin perfil:', error.message || error)
      return []
    }
  },

  async crearPerfil(perfil) {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .insert([perfil])
        .select()

      if (error) throw error
      return { perfil: data?.[0] || null }
    } catch (error) {
      console.error('Error creando el perfil:', error.message || error)
      return { error: error.message }
    }
  },

  /**
   * Crea un usuario completo (Auth + perfil), opcionalmente con un negocio
   * nuevo, a través de la Edge Function `crear-usuario`.
   *
   * No se puede hacer desde el navegador con supabase-js: crear usuarios
   * exige la service_role key, que ignora la RLS y jamás debe salir del
   * servidor. La función verifica por su cuenta que quien llama sea super
   * admin, así que el permiso no depende de esta pantalla.
   */
  async crearUsuario({ email, password, nombre, rol, negocio_id, nombre_negocio_nuevo }) {
    try {
      const { data, error } = await supabase.functions.invoke('crear-usuario', {
        body: { email, password, nombre, rol, negocio_id, nombre_negocio_nuevo }
      })

      if (error) {
        console.error('crear-usuario falló:', error.name, error)

        // No se pudo llegar a la función: casi siempre es que no está desplegada
        if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
          return {
            error: 'No se pudo contactar la función `crear-usuario`. ' +
                   'Verifica que esté desplegada (supabase functions deploy crear-usuario).'
          }
        }

        // La función respondió con un código de error: el motivo va en el cuerpo
        const status = error.context?.status
        let detalle = null
        try {
          detalle = await error.context.json()
        } catch {
          try { detalle = { error: await error.context.text() } } catch { /* sin cuerpo */ }
        }

        if (detalle?.error) return { error: detalle.error }
        if (status === 404) {
          return { error: 'La función `crear-usuario` no existe en el proyecto. Falta desplegarla.' }
        }
        if (status === 401) {
          return { error: 'Sesión no válida para la función. Vuelve a iniciar sesión.' }
        }
        return { error: `La función respondió con error ${status || 'desconocido'}. Revisa sus logs en Supabase.` }
      }

      if (data?.error) return { error: data.error }
      return { data }
    } catch (error) {
      console.error('Error creando usuario:', error)
      return { error: 'Error inesperado: ' + (error.message || error) }
    }
  },

  async actualizarPerfil(id, cambios) {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .update(cambios)
        .eq('id', id)
        .select()

      if (error) throw error
      return { perfil: data?.[0] || null }
    } catch (error) {
      console.error('Error actualizando el perfil:', error.message || error)
      return { error: error.message }
    }
  },

  /**
   * Cambia la contraseña del usuario con sesión iniciada.
   *
   * Primero comprueba la contraseña actual volviendo a iniciar sesión con
   * ella: así, quien encuentre una sesión abierta en el computador del local
   * no puede quedarse con la cuenta cambiándole la contraseña. Un intento
   * fallido no cierra la sesión existente.
   */
  async cambiarMiContrasena(email, actual, nueva) {
    try {
      const { error: errActual } = await supabase.auth.signInWithPassword({ email, password: actual })
      if (errActual) return { error: 'La contraseña actual no es correcta.' }

      const { error: errNueva } = await supabase.auth.updateUser({ password: nueva })
      if (errNueva) {
        const m = errNueva.message || ''
        if (/different from the old/i.test(m)) {
          return { error: 'La nueva contraseña debe ser distinta de la actual.' }
        }
        if (/at least/i.test(m)) {
          return { error: 'La nueva contraseña es demasiado corta.' }
        }
        if (/weak|pwned|leaked/i.test(m)) {
          return { error: 'Esa contraseña es muy común o apareció en filtraciones. Elige otra.' }
        }
        return { error: 'No se pudo cambiar la contraseña: ' + m }
      }

      // Limpia la marca de cambio obligatorio (si la había)
      const { error: errMarca } = await supabase.rpc('marcar_contrasena_cambiada')
      if (errMarca) console.warn('No se pudo limpiar la marca de cambio obligatorio:', errMarca.message)

      return { ok: true }
    } catch (error) {
      console.error('Error cambiando la contraseña:', error.message || error)
      return { error: 'No se pudo cambiar la contraseña. Revisa tu conexión.' }
    }
  },

  /**
   * Le pone una contraseña temporal a otro usuario, vía la Edge Function
   * `restablecer-contrasena` (necesita la service_role key, que no puede
   * vivir en el navegador). El usuario deberá cambiarla al entrar.
   */
  async restablecerContrasena(userId, password) {
    try {
      const { data, error } = await supabase.functions.invoke('restablecer-contrasena', {
        body: { user_id: userId, password }
      })

      if (error) {
        console.error('restablecer-contrasena falló:', error.name, error)
        if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
          return {
            error: 'No se pudo contactar la función `restablecer-contrasena`. ' +
                   'Verifica que esté desplegada.'
          }
        }
        let detalle = null
        try { detalle = await error.context.json() } catch { /* respuesta sin cuerpo */ }
        if (detalle?.error) return { error: detalle.error }
        if (error.context?.status === 404) {
          return { error: 'La función `restablecer-contrasena` no existe en el proyecto. Falta desplegarla.' }
        }
        return { error: `La función respondió con error ${error.context?.status || 'desconocido'}.` }
      }

      if (data?.error) return { error: data.error }
      return { ok: true, aviso: data?.aviso }
    } catch (error) {
      console.error('Error restableciendo la contraseña:', error)
      return { error: 'Error inesperado: ' + (error.message || error) }
    }
  }
}
