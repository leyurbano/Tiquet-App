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
          ),
          pagos_venta (
            *,
            medios_pago (*)
          )
        `) // 🔧 CAMBIO: se agregó pagos_venta con su join a medios_pago,
           // así cada venta trae de una vez con qué medio(s) se pagó

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
          ),
          pagos_venta (
            *,
            medios_pago (*)
          )
        `) // 🔧 CAMBIO: mismo join agregado aquí, por consistencia con getAllSales
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching sale:', error)
      return null
    }
  },

  // 🔧 CAMBIO: createSale ahora recibe también `sale.pagos` (array) y los inserta en pagos_venta.
  // Ya NO depende únicamente de sale.medio_pago_id — ese campo se mantiene por compatibilidad
  // pero puede venir null cuando el pago es mixto (ver SalesForm.jsx).
  async createSale(sale) {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .insert([{
          cliente_id: sale.cliente_id,
          fecha: sale.fecha || dayjs().tz(COLOMBIA_TZ).toISOString(),
          total: sale.total,
          medio_pago_id: sale.medio_pago_id // null si es pago mixto, o el id real si es simple
        }])
        .select()

      if (error) {
        console.error('Error de Supabase:', error)
        throw error
      }

      const nuevaVenta = data?.[0]
      if (!nuevaVenta) throw new Error('No se pudo crear la venta')

      // 🆕 NUEVO: insertar los pagos asociados a la venta recién creada
      if (sale.pagos && sale.pagos.length > 0) {
        const pagosResult = await this.addSalePayments(nuevaVenta.id, sale.pagos)
        if (!pagosResult.success) {
          // Si falla el registro de pagos, revertimos la venta para no dejar datos huérfanos
          await this.deleteSale(nuevaVenta.id)
          throw new Error('Error registrando los pagos de la venta: ' + pagosResult.error)
        }
      }

      return nuevaVenta
    } catch (error) {
      console.error('Error creating sale:', error.message || error)
      return null
    }
  },

  // 🆕 NUEVO: inserta uno o varios pagos asociados a una venta (soporta pago simple y mixto)
  // sale.pagos siempre llega como array desde SalesForm.jsx, ej:
  // [{ medio_pago_id: 1, monto: 30000 }, { medio_pago_id: 2, monto: 20000 }]
  async addSalePayments(saleId, pagos) {
    try {
      const registros = pagos.map((pago) => ({
        venta_id: saleId,
        medio_pago_id: pago.medio_pago_id,
        monto: pago.monto
      }))

      const { data, error } = await supabase
        .from('pagos_venta')
        .insert(registros)
        .select()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error adding sale payments:', error)
      return { success: false, error: error.message }
    }
  },

  // 🆕 NUEVO: trae los medios de pago disponibles (excluye "Sin definir")
  // Se usa en SalesForm.jsx para generar los botones dinámicamente
  async getMediosPago() {
    try {
      const { data, error } = await supabase
        .from('medios_pago')
        .select('id, pago')
        .neq('id', 3)
        .order('id', { ascending: true })

      console.log('medios_pago =>', data, error)
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching medios de pago:', error)
      return []
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
  // 🔧 CAMBIO: no requiere ajustes porque pagos_venta tiene ON DELETE CASCADE
  // (al borrar la venta, sus filas en pagos_venta se eliminan automáticamente)
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

      // 4. Eliminar la venta (pagos_venta se elimina solo, por el ON DELETE CASCADE)
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