import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // App instalable (PWA). Los íconos salen de public/icono.svg con
    // `npm run iconos` (ver pwa-assets.config.js).
    VitePWA({
      // 'prompt' y no 'autoUpdate': una recarga automática en medio de una
      // venta haría perder lo cargado. EstadoApp pregunta antes de actualizar.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icono.svg'],
      manifest: {
        name: 'Tiquet-App',
        short_name: 'Tiquet',
        description: 'Punto de venta e inventario para negocios',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Solo se guarda la app en sí (HTML, JS, CSS, íconos) para que abra
        // rápido. Las llamadas a Supabase NUNCA se guardan: ventas, stock y
        // caja tienen que ser siempre los datos reales del servidor.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // No se usa en la app y pesa casi 1 MB: no se descarga a cada dispositivo
        globIgnores: ['**/logoApp.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    port: 5173,
    open: true
  }
})
