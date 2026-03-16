import { supabase } from './supabaseClient'

export const diagnosticService = {
  // Test de conexión a Supabase
  async testConnection() {
    console.log('\n🧪 === INICIANDO DIAGNÓSTICO === 🧪\n')
    
    try {
      // 1. Verificar conexión
      console.log('1️⃣ Probando conexión a Supabase...')
      const { data, error } = await supabase
        .from('productos')
        .select('count(*)', { count: 'exact' })
        .limit(1)
      
      if (error) {
        console.error('❌ Error de conexión:', error.message)
        console.error('📝 Detalles:', error)
        return false
      }
      
      console.log('✅ Conexión exitosa a Supabase')
      
      // 2. Obtener todos los productos
      console.log('\n2️⃣ Obteniendo productos...')
      const { data: products, error: productsError, count } = await supabase
        .from('productos')
        .select('*', { count: 'exact' })
      
      if (productsError) {
        console.error('❌ Error al obtener productos:', productsError.message)
        return false
      }
      
      console.log(`✅ Productos obtenidos: ${products?.length || 0}`)
      console.log(`📊 Total en BD: ${count || 0}`)
      console.log('📋 Primeros 3 productos:')
      console.table(products?.slice(0, 3) || [])
      
      // 3. Verificar estructura de tabla
      console.log('\n3️⃣ Verificando estructura de tabla...')
      if (products && products.length > 0) {
        const firstProduct = products[0]
        console.log('📌 Columnas encontradas:')
        Object.keys(firstProduct).forEach(key => {
          console.log(`   - ${key}: ${typeof firstProduct[key]}`)
        })
      }
      
      // 4. Test de crear producto
      console.log('\n4️⃣ Test de creación (SIN guardar)...')
      const testData = {
        descripcion: 'TEST',
        cantidad: 1,
        costo: 100,
        costo_total: 100,
        precio_venta: 150
      }
      console.log('📝 Datos a validar:', testData)
      
      console.log('\n✅ === DIAGNÓSTICO COMPLETADO === ✅\n')
      return true
      
    } catch (error) {
      console.error('❌ Error durante diagnóstico:', error)
      return false
    }
  }
}
