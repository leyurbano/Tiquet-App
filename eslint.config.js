// Configuración de ESLint (formato "flat", ESLint 9+).
//
// Las reglas se declaran explícitamente en vez de usar los presets de cada
// plugin: los nombres de las reglas son estables entre versiones, y los
// presets cambian de forma de una versión mayor a otra.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      // Las Edge Functions corren en Deno, no en el navegador
      'supabase/functions/**'
    ]
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,

      // Llamar hooks condicionalmente rompe React: siempre error
      'react-hooks/rules-of-hooks': 'error',
      // Dependencias faltantes en useEffect/useCallback. Es la regla que habría
      // detectado el bug del Escape que saltaba la confirmación de cambios
      // sin guardar (un useEffect al que le faltaba `formSucio`)
      'react-hooks/exhaustive-deps': 'warn',

      // Sin eslint-plugin-react, ESLint no ve que un componente usado solo en
      // JSX sí se usa; los nombres en mayúscula (componentes, React) se ignoran,
      // igual que en la plantilla oficial de Vite
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none'
      }]
    }
  },
  {
    // Archivos de configuración: corren en Node
    files: ['*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
