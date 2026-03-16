import { supabase } from './supabaseClient'

export const productService = {
  // Obtener todos los productos con paginación
  async getAllProducts(page = 1, limit = 1000) {
    try {
      const offset = (page - 1) * limit
      const { data, error, count } = await supabase
        .from('productos')
        .select('*', { count: 'exact' })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
      
      if (error) {
        throw error
      }
      
      return { data: data || [], total: count || 0, page, limit }
    } catch (error) {
      console.error('❌ Error fetching products:', error.message)
      return { data: [], total: 0, page, limit }
    }
  },

  // Obtener producto por ID
  async getProductById(id) {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching product:', error)
      return null
    }
  },

  // Crear producto
  async createProduct(product) {
    try {
      const { data, error } = await supabase
        .from('productos')
        .insert([{
          descripcion: product.descripcion,
          cantidad: product.cantidad,
          costo: product.costo,
          costo_total: product.costo_total,
          precio_venta: product.precio_venta
        }])
        .select()
      
      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error creating product:', error)
      return null
    }
  },

  // Actualizar producto
  async updateProduct(id, product) {
    try {
      const { data, error } = await supabase
        .from('productos')
        .update({
          descripcion: product.descripcion,
          cantidad: product.cantidad,
          costo: product.costo,
          costo_total: product.costo_total,
          precio_venta: product.precio_venta
        })
        .eq('id', id)
        .select()
      
      if (error) throw error
      return data?.[0]
    } catch (error) {
      console.error('Error updating product:', error)
      return null
    }
  },

  // Eliminar producto
  async deleteProduct(id) {
    try {
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting product:', error)
      return false
    }
  }
}
