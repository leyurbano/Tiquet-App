import { supabase } from './supabaseClient'
import { productService } from './productService'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const COLOMBIA_TZ = 'America/Bogota'

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

      if (fecha) {
        const start = dayjs.tz(`${fecha} 00:00:00`, COLOMBIA_TZ).toISOString()
        const end   = dayjs.tz(`${fecha} 23:59:59`, COLOMBIA_TZ).toISOString()
        query = query.gte('fecha', start).lte('fecha', end)

      } else if (filterByToday) {
        const today = dayjs().tz(COLOMBIA_TZ).format('YYYY-MM-DD')
        const start = dayjs.tz(`${today} 00:00:00`, COLOMBIA_TZ).toISOString()
        const end   = dayjs.tz(`${today} 23:59:59`, COLOMBIA_TZ).toISOString()
        query = query.gte('fecha', start).lte('fecha', end)
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
          fecha: sale.fecha || dayjs().tz(COLOMBIA_TZ).toISOString(),
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

  // Eliminar venta y restaurar stock
  async deleteSaleWithRestore(saleId) {
    try {
      // 1. Obtener los items de la venta antes de eliminar
      const sale = await this.getSaleById(saleId)
      if (!sale) throw new Error('Venta no encontrada')

      const items = sale.detalle_ventas || []

      // 2. Restaurar stock de cada producto
      for (const item of items) {
        await productService.restoreStock(item.producto_id, parseInt(item.cantidad))
      }

      // 3. Eliminar los detalles de la venta
      const { error: errorDetalle } = await supabase
        .from('detalle_ventas')
        .delete()
        .eq('venta_id', saleId)

      if (errorDetalle) throw errorDetalle

      // 4. Eliminar la venta
      const { error: errorVenta } = await supabase
        .from('ventas')
        .delete()
        .eq('id', saleId)

      if (errorVenta) throw errorVenta

      return { success: true, itemsRestored: items.length }
    } catch (error) {
      console.error('Error eliminando venta y restaurando stock:', error)
      return { success: false, error: error.message }
    }
  },

  // Eliminar venta simple (sin restaurar stock)
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