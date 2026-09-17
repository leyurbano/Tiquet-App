import { supabase } from './supabaseClient'

// El costo vive en productos_costos, que solo pueden leer los
// administradores (migración 28). A un vendedor el join le llega vacío y
// costo/costo_total quedan en null: la pantalla no muestra esas columnas.
const conCosto = (fila) => ({
  ...fila,
  costo: fila.productos_costos?.costo ?? null,
  costo_total: fila.productos_costos?.costo_total ?? null,
  productos_costos: undefined
})

// El error del índice único no le dice nada al usuario: "duplicate key
// value violates unique constraint" no explica qué hacer.
const mensajeDeError = (error) => {
  if (error?.code === '23505' && String(error?.message).includes('codigo_barras')) {
    return 'Ese código de barras ya lo tiene otro producto'
  }
  return error?.message || 'Error desconocido'
}

const SELECT_PRODUCTO = '*, productos_costos ( costo, costo_total )'

export const productService = {
  /**
   * Unidades vendidas por producto en los últimos `dias`, como
   * { [producto_id]: unidades }. Alimenta la alerta de stock bajo, que solo
   * avisa de lo que rota (migración 33).
   *
   * La suma la hace Postgres: 30 días de ventas pasan de las 1.000 filas
   * que devuelve Supabase por consulta, así que sumarlas en el navegador
   * daría un conteo corto y sin error visible.
   *
   * Si la migración 33 no se ha corrido devuelve null, y `estadoStock`
   * vuelve al comportamiento anterior (avisar por umbral solamente).
   */
  async getRotacion(dias = 30) {
    try {
      const { data, error } = await supabase.rpc('rotacion_productos', { p_dias: dias })
      if (error) throw error

      const porProducto = {}
      for (const fila of data || []) {
        porProducto[fila.producto_id] = Number(fila.vendidos) || 0
      }
      return porProducto
    } catch (error) {
      console.warn('Sin datos de rotación, la alerta de stock usa solo el umbral:', error.message || error)
      return null
    }
  },

  /**
   * Todo el catálogo, en páginas de 1.000 (lo máximo que Supabase devuelve
   * por consulta). Para buscar productos o comparar contra un archivo
   * importado, una lista cortada haría ver como "nuevos" a los que ya
   * existen. Devuelve { data } o { data: [], error }.
   */
  async getTodosLosProductos() {
    const TAM = 1000
    const todos = []
    // Si la tabla de costos todavía no existe (migración 28 sin correr) o no
    // hay permiso para leerla, se reintenta sin ella: el catálogo tiene que
    // cargar igual. Sin esto, la pantalla de Productos quedaba vacía.
    let conCostos = true
    try {
      for (let desde = 0; ; desde += TAM) {
        const consulta = () => supabase
          .from('productos')
          .select(conCostos ? SELECT_PRODUCTO : '*')
          .order('id', { ascending: true })
          .range(desde, desde + TAM - 1)

        let { data, error } = await consulta()

        if (error && conCostos) {
          console.warn('Sin acceso a productos_costos, se cargan los productos sin costo:', error.message)
          conCostos = false
          ;({ data, error } = await consulta())
        }

        if (error) throw error
        todos.push(...(data || []).map(conCosto))
        if (!data || data.length < TAM) break
      }
      return { data: todos }
    } catch (error) {
      console.error('❌ Error fetching products:', error.message)
      return { data: [], error: error.message }
    }
  },

  // Obtener producto por ID
  async getProductById(id) {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select(SELECT_PRODUCTO)
        .eq('id', id)
        .single()

      if (error) throw error
      return data ? conCosto(data) : null
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
        p_costo: Number(product.costo) || 0,
        p_codigo_barras: product.codigo_barras?.trim() || null
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
          ? null : Number(product.stock_minimo),
        // Vacío = sin código. Nunca cadena vacía: chocaría contra el
        // índice único con los demás productos sin código.
        codigo_barras: product.codigo_barras?.trim() || null
      })
      .eq('id', id)
      .select()

    if (error) throw error
    return { producto: data?.[0] }
  } catch (error) {
    console.error('Error updating product:', error)
    return { error: mensajeDeError(error) }
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
    // Se piden los números de cada documento (consecutivos por negocio) para
    // no mostrar los ids internos en la columna de referencia
    const CON_NUMEROS = `
        *,
        ventas ( numero ),
        entradas ( numero ),
        ajustes ( numero ),
        devoluciones ( numero )
      `

    const consulta = (select) => supabase
      .from('producto_historial')
      .select(select)
      .eq('producto_id', productoId)
      .order('created_at', { ascending: false })
      .limit(100)

    let { data, error } = await consulta(CON_NUMEROS)

    // Si alguna de esas relaciones no está declarada en la base de datos, la
    // consulta entera falla y el historial se veía vacío. Se reintenta sin
    // los números: es mejor mostrar los movimientos con el id que no mostrarlos
    if (error) {
      console.warn('Historial sin números de documento:', error.message)
      ;({ data, error } = await consulta('*'))
    }

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error cargando historial:', error)
    return []
  }
} 
}
