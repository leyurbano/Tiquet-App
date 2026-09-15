import { supabase } from './supabaseClient'

// El cupo de fiado solo se envía si el formulario lo trae (administradores,
// con la migración 26 aplicada). La base de datos igual lo protege.
const conCupo = (client, fila) =>
  client.cupo_fiado === undefined ? fila : { ...fila, cupo_fiado: client.cupo_fiado }

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
        .insert([conCupo(client, {
          documento: client.documento,
          nombre: client.nombre,
          telefono: client.telefono
        })])
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
        .update(conCupo(client, {
          documento: client.documento,
          nombre: client.nombre,
          telefono: client.telefono
        }))
        .eq('id', id)
        .select()
      
      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error updating client:', error)
      return null
    }
  },

  /**
   * Últimas compras de un cliente, con sus productos y pagos, y lo devuelto
   * de cada una (`devuelto`). Incluye las anuladas: la pantalla las marca.
   * null si la consulta falló.
   */
  async getComprasCliente(clienteId, limite = 200) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, fecha, total, anulada_en, motivo_anulacion,
          detalle_ventas ( producto_id, cantidad, precio, productos ( descripcion ) ),
          pagos_venta ( monto, medios_pago ( pago ) )
        `)
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .limit(limite)

      if (error) throw error
      const ventas = data || []

      // Devoluciones (migración 25). Si la tabla no existe, se omiten
      if (ventas.length > 0) {
        const { data: devs, error: errorDev } = await supabase
          .from('devoluciones')
          .select('venta_id, total')
          .in('venta_id', ventas.map((v) => v.id))

        if (!errorDev) {
          const porVenta = {}
          ;(devs || []).forEach((d) => {
            porVenta[d.venta_id] = (porVenta[d.venta_id] || 0) + (Number(d.total) || 0)
          })
          ventas.forEach((v) => { v.devuelto = porVenta[v.id] || 0 })
        }
      }

      return ventas
    } catch (error) {
      console.error('Error leyendo las compras del cliente:', error.message || error)
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
  /**
   * Elimina un cliente. Devuelve { ok: true } o { ok: false, error } con un
   * motivo que se puede mostrar tal cual.
   *
   * 🔧 Antes devolvía true/false y la pantalla ignoraba el false: el usuario
   * confirmaba el borrado y no pasaba nada, sin ninguna explicación.
   */
  async deleteClient(id) {
    try {
      // .select() devuelve las filas borradas. Hace falta porque cuando la
      // RLS no deja borrar, Supabase no da error: simplemente borra cero
      // filas, y sin esto se informaría "eliminado" sin haber borrado nada.
      const { data, error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        // 23503: el cliente tiene ventas (lo lanza el trigger de la migración 17)
        if (error.code === '23503') {
          return {
            ok: false,
            error: 'No se puede eliminar: el cliente tiene ventas registradas. ' +
                   'Se conserva para no dañar el historial de facturas.'
          }
        }
        throw error
      }

      if (!data || data.length === 0) {
        return { ok: false, error: 'No tienes permiso para eliminar este cliente.' }
      }
      return { ok: true }
    } catch (error) {
      console.error('Error deleting client:', error.message || error)
      return { ok: false, error: 'No se pudo eliminar el cliente. Revisa tu conexión.' }
    }
  }
}
