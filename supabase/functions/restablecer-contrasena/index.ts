// =====================================================================
// Edge Function: restablecer-contrasena
//
// Le pone una contraseña temporal a otro usuario y lo obliga a cambiarla
// en su próximo inicio de sesión. Existe porque cambiar la contraseña de
// OTRA persona exige la service_role key, que no puede vivir en el
// navegador.
//
// Quién puede usarla:
//  - El super admin, sobre cualquier usuario.
//  - El administrador de un negocio, sobre los usuarios de SU negocio,
//    excepto un super admin.
// Nadie la usa sobre su propia cuenta: para eso está "Cambiar contraseña",
// que exige conocer la contraseña actual.
//
// Por qué no se usa el correo de recuperación de Supabase: sin un SMTP
// propio configurado, Supabase solo envía correos a los miembros del
// equipo del proyecto, así que no les llegaría a los usuarios del negocio.
//
// El archivo es .ts porque es el punto de entrada que espera el CLI, pero
// el código es JavaScript normal, igual que crear-usuario.
//
// Desplegar:  supabase functions deploy restablecer-contrasena --use-api
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

    // ---- 1. Quién llama ------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Falta el token de sesión' }, 401)

    const clienteUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: errUser } = await clienteUsuario.auth.getUser()
    if (errUser || !user) return json({ error: 'Sesión inválida' }, 401)

    // ---- 2. Entrada ------------------------------------------------------
    const body = await req.json()
    const userId = body.user_id
    const password = body.password || ''

    if (!userId) return json({ error: 'Falta el usuario' }, 400)
    if (password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }
    if (userId === user.id) {
      return json({ error: 'Para tu propia cuenta usa "Cambiar contraseña"' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ---- 3. Permiso -----------------------------------------------------
    const { data: objetivo } = await admin
      .from('perfiles')
      .select('id, negocio_id, es_super_admin')
      .eq('id', userId)
      .maybeSingle()

    if (!objetivo) return json({ error: 'Usuario no encontrado' }, 404)

    const { data: esSuper, error: errRol } = await clienteUsuario.rpc('es_super_admin')
    if (errRol) return json({ error: 'No se pudo verificar el permiso' }, 500)

    let permitido = !!esSuper
    if (!permitido) {
      const { data: yo } = await admin
        .from('perfiles')
        .select('rol, negocio_id, activo')
        .eq('id', user.id)
        .maybeSingle()

      permitido =
        !!yo?.activo &&
        yo.rol === 'administrador' &&
        yo.negocio_id === objetivo.negocio_id &&
        !objetivo.es_super_admin
    }

    if (!permitido) {
      return json({ error: 'No tienes permiso para restablecer la contraseña de este usuario' }, 403)
    }

    // ---- 4. Nueva contraseña y cambio obligatorio -----------------------
    const { error: errUpd } = await admin.auth.admin.updateUserById(userId, { password })
    if (errUpd) return json({ error: 'No se pudo cambiar la contraseña: ' + errUpd.message }, 400)

    const { error: errMarca } = await admin
      .from('perfiles')
      .update({ debe_cambiar_contrasena: true })
      .eq('id', userId)

    if (errMarca) {
      // La contraseña ya cambió: se informa, pero no se revierte
      return json({
        ok: true,
        aviso: 'La contraseña cambió, pero no se pudo marcar el cambio obligatorio'
      })
    }

    return json({ ok: true })
  } catch (e) {
    console.error('restablecer-contrasena:', e)
    return json({ error: 'Error inesperado en el servidor' }, 500)
  }
})
