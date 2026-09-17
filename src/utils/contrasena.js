/**
 * Contraseña temporal para usuarios nuevos o restablecidos.
 *
 * 10 caracteres sin los que se confunden al dictarlos o copiarlos a mano
 * (0/O, 1/l/I). Se genera con crypto.getRandomValues, no con Math.random,
 * porque es una credencial. El usuario debe cambiarla al entrar.
 */
export const generarContrasenaTemporal = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const valores = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(valores, (n) => chars[n % chars.length]).join('')
}
