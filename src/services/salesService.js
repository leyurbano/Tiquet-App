import { supabase } from './supabaseClient'

export const salesService = {
  // Obtener ventas por fecha específica (por defecto hoy)
  async getAllSales(filterByToday = false, fecha = null) {
    try {
      let query = supabase
        .from('ventas')
        .select(`
          *,
          detalle_ventas (
            *,
            productos (*)
          )
        `)

      // Filtrar por fecha específica
      if (fecha) {
        const start = new Date(fecha)
        start.setHours(0, 0, 0, 0)
        const end = new Date(fecha)
        end.setHours(23, 59, 59, 999)

        query = query
          .gte('fecha', start.toISOString())
          .lte('fecha', end.toISOString())

      } else if (filterByToday) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        query = query
          .gte('fecha', today.toISOString())
          .lt('fecha', tomorrow.toISOString())
      }

      const { data, error } = await query.order('id', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching sales:', error)
      return []
    }
  },

  // Obtener venta por ID
  async getSaleById(id) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          *,
          detalle_ventas (
            *,
            productos (*)
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching sale:', error)
      return null
    }
  },

  // Crear venta
  async createSale(sale) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .insert([{
          cliente_id: sale.cliente_id,
          fecha: sale.fecha || new Date().toISOString(),
          total: sale.total
        }])
        .select()

      if (error) {
        console.error('Error de Supabase:', error)
        throw error
      }

      return data?.[0]
    } catch (error) {
      console.error('Error creating sale:', error.message || error)
      return null
    }
  },

  // Agregar items a venta
  async addSaleItem(saleId, item) {
    try {
      const { data, error } = await supabase
        .from('detalle_ventas')
        .insert([{
          venta_id: saleId,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio: item.precio,
          total: item.cantidad * item.precio
        }])
        .select()

      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error adding sale item:', error)
      return null
    }
  },

  // Eliminar venta
  async deleteSale(id) {
    try {
      const { error } = await supabase
        .from('ventas')
        .delete()
        .eq('id', id)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting sale:', error)
      return false
    }
  }
}