import { supabase } from './supabaseClient'

export const negocioService = {
  /**
   * Trae el negocio del usuario logueado.
   *
   * No hace falta pasarle un id: la RLS solo deja ver la fila del negocio
   * propio, así que un select sin filtro ya devuelve el correcto. Un super
   * admin sí ve varios, por eso se limita a uno.
   */
  async getMiNegocio() {
    try {
      const { data, error } = await supabase
        .from('negocios')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data || null
    } catch (error) {
      console.error('Error obteniendo el negocio:', error.message || error)
      return null
    }
  },


  // Tipos y tamaño aceptados para el logo
  LOGO_TIPOS: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  LOGO_MAX_BYTES: 1024 * 1024, // 1 MB: es un logo, no una foto

  /**
   * Sube el logo del negocio a Supabase Storage y devuelve su URL pública.
   *
   * La ruta lleva el negocio_id como carpeta (`<id>/logo-<timestamp>.png`),
   * que es justo lo que revisan las políticas del bucket para impedir que
   * un negocio escriba sobre el logo de otro.
   *
   * El timestamp en el nombre evita que la CDN siga sirviendo el logo
   * anterior desde caché tras un reemplazo.
   */
  async subirLogo(negocioId, file) {
    try {
      if (!this.LOGO_TIPOS.includes(file.type)) {
        return { error: 'Formato no admitido. Usa PNG, JPG, WEBP o SVG.' }
      }
      if (file.size > this.LOGO_MAX_BYTES) {
        return { error: 'La imagen pesa más de 1 MB. Usa una más liviana.' }
      }

      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const ruta = `${negocioId}/logo-${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('logos')
        .upload(ruta, file, { cacheControl: '3600', upsert: false })

      if (error) throw error

      const { data } = supabase.storage.from('logos').getPublicUrl(ruta)
      return { url: data.publicUrl }
    } catch (error) {
      console.error('Error subiendo el logo:', error.message || error)
      return { error: 'No se pudo subir la imagen. Revisa tu conexión.' }
    }
  },

  /**
   * Borra un logo anterior del bucket. Se llama al reemplazarlo para no
   * ir acumulando archivos huérfanos. Si falla no es grave: el logo nuevo
   * ya quedó guardado, así que solo se registra el aviso.
   */
  async borrarLogo(url) {
    try {
      if (!url || !url.includes('/logos/')) return
      const ruta = url.split('/logos/')[1]
      if (!ruta) return
      await supabase.storage.from('logos').remove([ruta])
    } catch (error) {
      console.warn('No se pudo borrar el logo anterior:', error.message || error)
    }
  },

  // Lista todos los negocios (solo devuelve varios si eres super admin)
  async getNegocios() {
    try {
      const { data, error } = await supabase
        .from('negocios')
        .select('*')
        .order('nombre_comercial')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error listando negocios:', error.message || error)
      return []
    }
  },

  // Crear un negocio. La política solo lo permite a un super admin.
  async crearNegocio(datos) {
    try {
      const { data, error } = await supabase
        .from('negocios')
        .insert([datos])
        .select()

      if (error) throw error
      return { negocio: data?.[0] || null }
    } catch (error) {
      console.error('Error creando el negocio:', error.message || error)
      return { error: error.message }
    }
  },

  async updateNegocio(id, cambios) {
    try {
      const { data, error } = await supabase
        .from('negocios')
        .update(cambios)
        .eq('id', id)
        .select()

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      console.error('Error actualizando el negocio:', error.message || error)
      return null
    }
  },

  // Cifras agregadas de todos los negocios. Solo responde a super admins:
  // la función tiene el filtro por dentro (ver multi_negocio.sql).
  async getResumenNegocios() {
    try {
      const { data, error } = await supabase.rpc('resumen_negocios')
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error obteniendo el resumen de negocios:', error.message || error)
      return []
    }
  }
}
