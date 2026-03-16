import { supabase } from './supabaseClient'

export const clientService = {
  // Obtener todos los clientes
  async getAllClients() {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('id', { ascending: false })
      
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching clients:', error)
      return []
    }
  },

  // Obtener cliente por ID
  async getClientById(id) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching client:', error)
      return null
    }
  },

  // Crear cliente
  async createClient(client) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{
          documento: client.documento,
          nombre: client.nombre,
          telefono: client.telefono
        }])
        .select()
      
      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error creating client:', error)
      return null
    }
  },

  // Actualizar cliente
  async updateClient(id, client) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .update({
          documento: client.documento,
          nombre: client.nombre,
          telefono: client.telefono
        })
        .eq('id', id)
        .select()
      
      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error updating client:', error)
      return null
    }
  },

  // Obtener cliente por documento
  async getClientByDocument(documento) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('documento', documento)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      return data || null
    } catch (error) {
      console.error('Error fetching client by document:', error)
      return null
    }
  },

  // Eliminar cliente
  async deleteClient(id) {
    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting client:', error)
      return false
    }
  }
}
