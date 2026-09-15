import { supabase } from './supabaseClient'

export const inventarioService = {
  /**
   * Registra una entrada de mercancía (una compra al proveedor) en UNA
   * transacción, mediante la función registrar_entrada de la base de datos.
   *
   * Por cada línea la base de datos SUMA las unidades al stock (no lo
   * reemplaza), recalcula el costo como promedio ponderado entre lo que había
   * y lo que llegó, y deja el movimiento en el historial del producto.
   *
   * Devuelve { entrada } o { error } con el motivo legible.
   */
  async registrarEntrada({ proveedor, factura, nota, items }) {
    try {
      const { data, error } = await supabase.rpc('registrar_entrada', {
        p_proveedor: proveedor?.trim() || null,
        p_factura: factura?.trim() || null,
        p_nota: nota?.trim() || null,
        p_items: (items || []).map((i) => ({
          producto_id: i.producto_id,
          cantidad: Number(i.cantidad),
          costo_unitario: Number(i.costo_unitario)
        }))
      })

      if (error) throw error
      return { entrada: data }
    } catch (error) {
      console.error('Error registrando la entrada:', error.message || error)
      return { error: error.message || 'Error desconocido' }
    }
  },

  // Últimas entradas del negocio, para consultarlas debajo del formulario
  async getEntradasRecientes(limite = 20) {
    try {
      const { data, error } = await supabase
        .from('entradas')
        .select(`
          id, fecha, proveedor, factura, total,
          detalle_entradas ( cantidad, productos ( descripcion ) )
        `)
        .order('fecha', { ascending: false })
        .limit(limite)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error cargando entradas:', error.message || error)
      return []
    }
  },

  /**
   * Registra un ajuste de inventario (conteo físico o corrección) en UNA
   * transacción, mediante la función registrar_ajuste de la base de datos.
   *
   * Cada línea fija el stock en lo contado y puede corregir el costo. La base
   * de datos rechaza la línea si el stock cambió desde que se abrió la
   * pantalla (una venta en medio), para no pisar esa venta.
   *
   * Devuelve { ajuste } (con `lineas` y `cambios`) o { error }.
   */
  async registrarAjuste({ nota, items }) {
    try {
      const { data, error } = await supabase.rpc('registrar_ajuste', {
        p_nota: nota?.trim() || null,
        p_items: items
      })

      if (error) throw error
      return { ajuste: data }
    } catch (error) {
      console.error('Error registrando el ajuste:', error.message || error)
      return { error: error.message || 'Error desconocido' }
    }
  },

  async getAjustesRecientes(limite = 20) {
    try {
      const { data, error } = await supabase
        .from('ajustes')
        .select('id, fecha, nota, detalle_ajustes ( diferencia, valor_diferencia )')
        .order('fecha', { ascending: false })
        .limit(limite)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error cargando ajustes:', error.message || error)
      return []
    }
  }
}
