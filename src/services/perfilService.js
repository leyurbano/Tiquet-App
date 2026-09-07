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
  }
}
