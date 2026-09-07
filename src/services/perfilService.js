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
  }
}
