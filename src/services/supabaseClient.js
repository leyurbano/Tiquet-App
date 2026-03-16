import { createClient } from '@supabase/supabase-js'

// Obtener credenciales de variables de entorno
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validar que las credenciales estén configuradas
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ CRÍTICO: Credenciales de Supabase no configuradas')
  console.error('📝 Asegúrate de tener un archivo .env.local con:')
  console.error('   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co')
  console.error('   VITE_SUPABASE_ANON_KEY=tu-clave-anonima')
  throw new Error('Credenciales de Supabase faltantes')
}

console.log('✅ Supabase configurado correctamente')
console.log(`📍 URL: ${SUPABASE_URL}`)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
