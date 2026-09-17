/**
 * Contraseña temporal para usuarios nuevos o restablecidos.
 *
 * Se generan sin los caracteres que se confunden al dictarlos o copiarlos
 * a mano (0/O, 1/l/I), porque casi siempre se le entregan al usuario en un
 * papel o por teléfono.
 *
 * 🔧 Antes el alfabeto era solo letras y números, y Supabase Auth rechazaba
 * la contraseña con "Password should contain at least one character of
 * each: ...". Eso dejaba rota la creación de usuarios en las dos pantallas.
 * Ahora se toma uno de cada grupo obligatorio y después se mezcla, así la
 * política se cumple siempre y no por casualidad: eligiendo 12 caracteres
 * al azar de un alfabeto que incluya símbolos, tarde o temprano sale uno
 * sin ningún símbolo y falla de forma intermitente, que es peor.
 *
 * Se usa crypto.getRandomValues y no Math.random porque es una credencial.
 */

// Sin l minúscula, sin I ni O mayúsculas, sin 0 ni 1
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz'
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITOS    = '23456789'
// Subconjunto de los que acepta Supabase, dejando fuera comillas, barras y
// acento grave: rompen al pegarlos en una terminal y se dictan pésimo
const SIMBOLOS   = '!@#$%*+-=?'

const GRUPOS = [MINUSCULAS, MAYUSCULAS, DIGITOS, SIMBOLOS]
const TODOS = GRUPOS.join('')
const LARGO = 12

const azar = (tope) => {
  const v = new Uint32Array(1)
  crypto.getRandomValues(v)
  return v[0] % tope
}

const tomar = (alfabeto) => alfabeto[azar(alfabeto.length)]

export const generarContrasenaTemporal = () => {
  const chars = [
    // Uno de cada grupo: es lo que garantiza que Auth la acepte
    ...GRUPOS.map(tomar),
    ...Array.from({ length: LARGO - GRUPOS.length }, () => tomar(TODOS))
  ]

  // Mezcla, si no los cuatro obligatorios quedarían siempre al principio
  for (let i = chars.length - 1; i > 0; i--) {
    const j = azar(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

/**
 * Qué le falta a una contraseña escrita a mano para que Auth la acepte.
 * Devuelve null si está bien, o el texto del problema.
 */
export const revisarContrasena = (valor) => {
  const v = valor || ''
  if (v.length < 8) return 'Debe tener al menos 8 caracteres'
  const faltan = []
  if (!/[a-z]/.test(v)) faltan.push('una minúscula')
  if (!/[A-Z]/.test(v)) faltan.push('una mayúscula')
  if (!/[0-9]/.test(v)) faltan.push('un número')
  if (!/[^a-zA-Z0-9]/.test(v)) faltan.push('un símbolo (por ejemplo * o #)')
  if (faltan.length === 0) return null
  return `Le falta ${faltan.join(', ')}`
}

/**
 * Traduce al español el error de Supabase Auth al cambiar la contraseña.
 * Devuelve null si no reconoce el mensaje, para que el llamador muestre el
 * original en vez de inventar una explicación equivocada.
 *
 * ⚠️ EL ORDEN DE ESTAS REGLAS IMPORTA. El error de política dice
 * "Password should contain AT LEAST one character of each: ...", así que
 * una regla /at least/ suelta lo capturaba y lo traducía como "demasiado
 * corta". El usuario alargaba la contraseña una y otra vez y nunca
 * funcionaba, porque lo que faltaba era un símbolo. La regla de variedad
 * va antes que la de largo.
 */
export const mensajeErrorAuth = (mensaje) => {
  const m = mensaje || ''

  if (/different from the old/i.test(m)) {
    return 'La nueva contraseña debe ser distinta de la actual.'
  }
  if (/one character of each|should contain/i.test(m)) {
    return 'A la contraseña le falta variedad: necesita una minúscula, ' +
           'una mayúscula, un número y un símbolo (por ejemplo * o #).'
  }
  if (/at least \d+ characters|too short/i.test(m)) {
    return 'La nueva contraseña es demasiado corta.'
  }
  if (/weak|pwned|leaked/i.test(m)) {
    return 'Esa contraseña es muy común o apareció en filtraciones. Elige otra.'
  }
  return null
}
