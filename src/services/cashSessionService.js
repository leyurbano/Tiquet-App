import { supabase } from './supabaseClient'

export const cashSessionService = {
  // Devuelve la caja abierta del usuario (cerrada_en null), o null si no tiene
  async getOpenSession(userId) {
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select('*')
        .eq('user_id', userId)
        .is('cerrada_en', null)
        .order('abierta_en', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error obteniendo la caja abierta:', error.message)
      return null
    }
  },

  // Abre la caja del turno con la base con la que arranca
  async openSession(userId, baseInicial) {
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .insert([{
          user_id: userId,
          base_inicial: baseInicial
        }])
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error abriendo la caja:', error.message)
      return null
    }
  },

  /**
   * Cierra la caja del turno.
   * `arqueo` trae lo contado y los totales calculados; si el usuario decidió
   * salir sin contar el efectivo, se marca arqueo_omitido y los montos van null.
   */
  async closeSession(sessionId, arqueo) {
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .update({
          cerrada_en: new Date().toISOString(),
          efectivo_contado: arqueo.efectivoContado,
          efectivo_ventas: arqueo.efectivoVentas,
          total_vendido: arqueo.totalVendido,
          cantidad_ventas: arqueo.cantidadVentas,
          diferencia: arqueo.diferencia,
          detalle_arqueo: arqueo.detalle || null,
          arqueo_omitido: arqueo.omitido || false
        })
        .eq('id', sessionId)
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error cerrando la caja:', error.message)
      return null
    }
  }
}
