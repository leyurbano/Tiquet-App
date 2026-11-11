/**
 * Mensaje en español para un error al iniciar sesión.
 *
 * 🔧 Antes solo se traducía "credenciales incorrectas" y el resto llegaba
 * tal cual de Supabase o del navegador: sin internet el cajero veía
 * "Failed to fetch". En un local con internet inestable es el error más
 * común, y nadie sabía qué hacer con él.
 */
const SIN_CONEXION = /failed to fetch|networkerror|load failed|network request failed/i
const MUCHOS_INTENTOS = /rate limit|too many/i

export const mensajeErrorLogin = (mensaje) => {
  const texto = mensaje || ''

  if (/invalid login credentials/i.test(texto)) return 'Correo o contraseña incorrectos'
  if (SIN_CONEXION.test(texto)) return 'No hay conexión a internet. Revisa la red e inténtalo de nuevo.'
  if (/email not confirmed/i.test(texto)) {
    return 'Este correo todavía no está confirmado. Pídele al administrador de tu negocio que lo revise.'
  }
  if (MUCHOS_INTENTOS.test(texto)) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'

  return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
}
