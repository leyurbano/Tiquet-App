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
        // Cada línea trae el id de un producto existente o los datos de uno
        // nuevo, que la base de datos crea dentro de la misma transacción
        p_items: (items || []).map((i) => ({
          ...(i.nuevo ? { nuevo: i.nuevo } : { producto_id: i.producto_id }),
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

  /**
   * Movimiento rápido de un solo producto, desde la lista de Productos.
   *
   * No es una función nueva de la base de datos: según el motivo reusa la
   * que corresponde, con una sola línea.
   *
   *  - 'entrada' (compra) → registrar_entrada: suma y recalcula el costo
   *    como promedio ponderado.
   *  - 'ajuste' (todo lo demás, y todas las salidas) → registrar_ajuste:
   *    fija el stock en lo que queda y guarda la diferencia con su motivo.
   *    `stockActual` es la foto de lo que mostraba la pantalla: la base de
   *    datos rechaza la línea si una venta movió el stock en medio.
   *
   * Devuelve { movimiento } o { error } con el motivo legible.
   */
  async registrarMovimientoStock({
    rpc,
    productoId,
    stockActual,
    stockFinal,
    unidades,
    motivo,
    etiquetaMotivo,
    costoUnitario,
    nota
  }) {
    const detalle = [etiquetaMotivo, nota?.trim()].filter(Boolean).join(' · ') || null

    if (rpc === 'entrada') {
      const { entrada, error } = await this.registrarEntrada({
        nota: detalle,
        items: [{ producto_id: productoId, cantidad: unidades, costo_unitario: costoUnitario }]
      })
      return error ? { error } : { movimiento: entrada }
    }

    const { ajuste, error } = await this.registrarAjuste({
      nota: detalle,
      items: [{
        producto_id: productoId,
        stock_sistema: stockActual,
        stock_contado: stockFinal,
        // null = el ajuste no toca el costo. Solo una compra lo cambia.
        costo_unitario: null,
        motivo
      }]
    })
    return error ? { error } : { movimiento: ajuste }
  },

  // Últimas entradas del negocio, para consultarlas debajo del formulario
  async getEntradasRecientes(limite = 20) {
    try {
      const { data, error } = await supabase
        .from('entradas')
        .select(`
          id, numero, fecha, proveedor, factura, total,
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
