// Genera los íconos de la app instalable (PWA) a partir de public/icono.svg:
//   npx pwa-assets-generator
// Deja en public/ los PNG para Android, iPhone y la pestaña del navegador.
// Solo hay que volver a correrlo si cambia el ícono.
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

const AZUL = '#2563eb'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    // Android recorta el ícono en círculo o cuadrado según el teléfono: se
    // deja margen de seguridad con el mismo azul de fondo
    maskable: { ...preset.maskable, resizeOptions: { background: AZUL } },
    apple: { ...preset.apple, resizeOptions: { background: AZUL } }
  },
  images: ['public/icono.svg']
})
