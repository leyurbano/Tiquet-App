import { supabase } from './supabaseClient'

export const salesService = {
  // Obtener todas las ventas
  async getAllSales() {
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
        .order('id', { ascending: false })
      
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
      console.log('📝 Intentando crear venta con:', sale)
      
      const { data, error } = await supabase
        .from('ventas')
        .insert([{
          cliente_id: sale.cliente_id,
          fecha: sale.fecha || new Date().toISOString(),
          total: sale.total
        }])
        .select()
      
      if (error) {
        console.error('❌ Error de Supabase:', error)
        throw error
      }
      
      console.log('✅ Venta creada:', data?.[0])
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