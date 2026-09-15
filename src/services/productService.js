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

  /**
   * Crea un producto mediante la función crear_producto de la base de datos.
   *
   * 🔧 Antes era un insert directo: el "stock inicial" entraba sin dejar
   * rastro. Ahora, si hay stock inicial, queda registrado como una entrada
   * "Stock inicial" en el historial, con su costo de origen. Además se
   * rechazan nombres repetidos.
   *
   * Devuelve { producto } o { error } con el motivo legible.
   */
  async createProduct(product) {
    try {
      const { data, error } = await supabase.rpc('crear_producto', {
        p_descripcion: product.descripcion,
        p_precio_venta: Number(product.precio_venta) || 0,
        // vacío = usa el umbral del negocio; 0 = sin alertas
        p_stock_minimo: product.stock_minimo === '' || product.stock_minimo == null
          ? null : Number(product.stock_minimo),
        p_stock_inicial: Number(product.cantidad) || 0,
        p_costo: Number(product.costo) || 0
      })

      if (error) throw error
      return { producto: data }
    } catch (error) {
      console.error('Error creating product:', error.message || error)
      return { error: error.message || 'Error desconocido' }
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
