import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { API_PREFIX, PORTS } from '@astronaut-wellness/shared/constants'
import { mediapipeAssets } from './mediapipe-assets.js'

// La API de destino puede sobrescribirse con ONBOARD_API_URL (p. ej. en otra máquina).
const apiTarget = process.env.ONBOARD_API_URL ?? `http://localhost:${PORTS.ONBOARD_API}`
const proxy = { [API_PREFIX]: { target: apiTarget, changeOrigin: true } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mediapipeAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: PORTS.ONBOARD_UI, strictPort: true, proxy },
  preview: { port: PORTS.ONBOARD_PREVIEW, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['@astronaut-wellness/ui/test-setup'],
    css: false,
  },
})
