/**
 * Versión de la app y datos de soporte, en un solo lugar.
 *
 * Cuando haya dominio propio con correo, se cambia solo `correo` aquí y
 * cambia en el inicio de sesión y en "Acerca de".
 */

// La pone vite.config.js desde package.json: se sube la versión allá en
// cada entrega y aquí aparece sola. 'dev' si se corre sin Vite (pruebas)
export const VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

export const SOPORTE = {
  // Con el indicativo de Colombia (57), como lo pide wa.me
  whatsapp: '573022125646',
  whatsappVisible: '302 212 5646',
  correo: 'leyurbano@gmail.com'
}

// El mensaje ya lleva la versión: lo primero que hay que saber para ayudar
// es qué versión tiene la persona, y la app instalada puede estar atrasada
const MENSAJE = `Hola, necesito ayuda con Tiquet-App (versión ${VERSION}).`

export const enlaceWhatsApp = () =>
  `https://wa.me/${SOPORTE.whatsapp}?text=${encodeURIComponent(MENSAJE)}`

export const enlaceCorreo = () =>
  `mailto:${SOPORTE.correo}?subject=${encodeURIComponent(`Soporte Tiquet-App (versión ${VERSION})`)}&body=${encodeURIComponent(MENSAJE)}`
