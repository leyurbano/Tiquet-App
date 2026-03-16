import { supabase } from './supabaseClient'

export const authService = {
  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error en login:', error)
      throw error
    }
  },

  async register(email, password, fullName) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error en registro:', error)
      throw error
    }
  },

  async logout() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Error en logout:', error)
      throw error
    }
  },

  async getCurrentUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.user || null
    } catch (error) {
      console.error('Error obteniendo usuario actual:', error)
      return null
    }
  }
}
