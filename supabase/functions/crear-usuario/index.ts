// =====================================================================
// Edge Function: crear-usuario
//
// Crea un usuario de Supabase Auth y su perfil, opcionalmente junto con un
// negocio nuevo. Existe porque crear usuarios exige la service_role key,
// que ignora toda la RLS y por tanto NO puede vivir en el navegador.
//
// Quién puede usarla (se comprueba con el token de quien llama, contra la
// base y respetando la RLS, antes de tocar la service_role):
//  - El super admin: en cualquier negocio, o creando un negocio nuevo.
//  - El administrador de un negocio activo: solo en SU negocio. El negocio
//    sale de su sesión (mi_negocio()); el que venga en la petición se
//    ignora, y no puede crear negocios.
//
// El archivo se llama .ts porque es el punto de entrada que espera el CLI
// de Supabase, y Deno ejecuta TypeScript de forma nativa. Aun así, el código
// es JavaScript normal, sin anotaciones de tipos: no hay nada que aprender
// aquí que no se use ya en el resto del proyecto.
//
// Desplegar:  supabase functions deploy crear-usuario --use-api
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // ---- 1. Verificar que quien llama es super admin -------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Falta el token de sesión' }, 401)

    const clienteUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: errUser } = await clienteUsuario.auth.getUser()
    if (errUser || !user) return json({ error: 'Sesión inválida' }, 401)

    const { data: esSuper, error: errRol } = await clienteUsuario.rpc('es_super_admin')
    if (errRol) return json({ error: 'No se pudo verificar el permiso' }, 500)

    // Administrador de negocio: mi_negocio() es null si el usuario está
    // inactivo o su negocio suspendido, así que eso también queda cubierto
    let negocioDelAdmin = null
    if (!esSuper) {
      const [{ data: miNegocio }, { data: miRol }] = await Promise.all([
        clienteUsuario.rpc('mi_negocio'),
        clienteUsuario.rpc('mi_rol')
      ])
      if (!miNegocio || miRol !== 'administrador') {
        return json({ error: 'Solo un administrador puede crear usuarios' }, 403)
      }
      negocioDelAdmin = miNegocio
    }

    // ---- 2. Validar la entrada ----------------------------------------
    const body = await req.json()
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''
    const nombre = (body.nombre || '').trim()
    const rol = body.rol === 'administrador' ? 'administrador' : 'vendedor'
    const nombreNegocioNuevo = (body.nombre_negocio_nuevo || '').trim()
    let negocioId = body.negocio_id ? Number(body.negocio_id) : null

    // El administrador de un negocio solo crea usuarios en el suyo
    if (negocioDelAdmin) {
      if (nombreNegocioNuevo) {
        return json({ error: 'Solo el administrador de la plataforma puede crear negocios' }, 403)
      }
      negocioId = negocioDelAdmin
    }

    if (!email.includes('@')) return json({ error: 'Correo inválido' }, 400)
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    if (!negocioId && !nombreNegocioNuevo) {
      return json({ error: 'Indica un negocio existente o el nombre de uno nuevo' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ---- 3. Negocio nuevo, si se pidió --------------------------------
    // Se crea antes que el usuario: si algo falla aquí, no queda un usuario
    // de Auth huérfano, que es lo que no se puede deshacer fácilmente.
    let negocioCreado = null
    if (!negocioId) {
      const { data, error } = await admin
        .from('negocios')
        .insert([{ nombre_comercial: nombreNegocioNuevo }])
        .select()
        .single()

      if (error) return json({ error: 'No se pudo crear el negocio: ' + error.message }, 400)
      negocioCreado = data
      negocioId = data.id
    }

    // ---- 4. Usuario de Auth -------------------------------------------
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // sin correo de confirmación: entra de inmediato
      user_metadata: { full_name: nombre || email.split('@')[0] }
    })

    if (errCrear) {
      // Si el negocio se creó en esta misma llamada, se revierte para no
      // dejarlo vacío y sin dueño
      if (negocioCreado) await admin.from('negocios').delete().eq('id', negocioCreado.id)
      return json({ error: 'No se pudo crear el usuario: ' + errCrear.message }, 400)
    }

    // ---- 5. Perfil ------------------------------------------------------
    const { error: errPerfil } = await admin.from('perfiles').insert([{
      id: creado.user.id,
      nombre: nombre || email.split('@')[0],
      username: email,
      email_interno: email,
      rol,
      activo: true,
      // La contraseña la escribió el super admin: el usuario debe cambiarla al entrar
      debe_cambiar_contrasena: true,
      negocio_id: negocioId
    }])

    if (errPerfil) {
      // Sin perfil el usuario no vería nada, así que se deshace todo
      await admin.auth.admin.deleteUser(creado.user.id)
      if (negocioCreado) await admin.from('negocios').delete().eq('id', negocioCreado.id)
      return json({ error: 'No se pudo crear el perfil: ' + errPerfil.message }, 400)
    }

    return json({
      ok: true,
      usuario: { id: creado.user.id, email },
      negocio: negocioCreado
    })
  } catch (e) {
    console.error('crear-usuario:', e)
    return json({ error: 'Error inesperado en el servidor' }, 500)
  }
})
