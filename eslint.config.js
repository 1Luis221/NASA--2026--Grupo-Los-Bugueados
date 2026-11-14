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

  // Frontends React (navegador + JSX).
  {
    files: ['apps/*/src/**/*.{js,jsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Código compartido: debe funcionar en navegador y en Node.
  {
    files: ['packages/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] },
  },

  // APIs Express y archivos de configuración que se ejecutan en Node.
  {
    files: ['services/**/*.js', '*.config.js', 'apps/*/*.config.js'],
    languageOptions: { globals: globals.node },
  },
])
