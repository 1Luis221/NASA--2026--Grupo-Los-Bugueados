import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/node_modules/']),

  // Base para todo el JavaScript del monorepo.
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Permite marcar argumentos intencionadamente sin usar con "_" (p. ej. middlewares Express).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // Código compartido no visual (shared): debe funcionar en navegador y en Node.
  {
    files: ['packages/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] },
  },

  // React (navegador + JSX): apps, componentes compartidos y sus pruebas.
  {
    files: ['apps/*/{src,test}/**/*.{js,jsx}', 'packages/ui/{src,test}/**/*.{js,jsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Componentes de shadcn/ui: exportan también sus variantes (cva) junto al componente.
  {
    files: ['packages/ui/src/components/ui/**/*.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Las pruebas no son módulos con recarga en caliente.
  {
    files: ['apps/*/test/**/*.{js,jsx}', 'packages/ui/test/**/*.{js,jsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // APIs Express y archivos de configuración que se ejecutan en Node.
  {
    files: [
      'services/**/*.js',
      '*.config.js',
      'apps/*/*.config.js',
      'packages/*/*.config.js',
      // Herramientas de línea de comandos (contraste, E2E).
      'packages/*/scripts/**/*.{js,mjs}',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: { globals: globals.node },
  },
])
