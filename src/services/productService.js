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

      if (error) throw error
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
          precio_venta: product.precio_venta,
          // vacío = usa el umbral del negocio; 0 = sin alertas
          stock_minimo: product.stock_minimo === '' || product.stock_minimo == null
            ? null : Number(product.stock_minimo)
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
    // 🔧 Ya NO se envían cantidad, costo ni costo_total. Antes se mandaba el
    // stock que tenía el formulario al abrirse: si en medio se vendía algo,
    // al guardar un cambio de precio el stock volvía al valor viejo y esa
    // venta desaparecía del inventario. Stock y costo cambian solo por
    // ventas, entradas de mercancía y ajustes (página Inventario).
    const { data, error } = await supabase
      .from('productos')
      .update({
        descripcion: product.descripcion,
        precio_venta: product.precio_venta,
        stock_minimo: product.stock_minimo === '' || product.stock_minimo == null
          ? null : Number(product.stock_minimo)
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
  },
  async getProductHistory(productoId) {
  try {
    const { data, error } = await supabase
      .from('producto_historial')
      .select('*')
      .eq('producto_id', productoId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error cargando historial:', error)
    return []
  }
} 
}
