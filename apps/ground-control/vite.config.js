import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { API_PREFIX, PORTS } from '@astronaut-wellness/shared/constants'

// La API de destino puede sobrescribirse con GROUND_API_URL (p. ej. en otra máquina).
const apiTarget = process.env.GROUND_API_URL ?? `http://localhost:${PORTS.GROUND_API}`
const proxy = {
  [API_PREFIX]: { target: apiTarget, changeOrigin: true },
  // Actualizaciones en tiempo real (Socket.IO, WebSocket) desde ground-api.
  '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: PORTS.GROUND_CONTROL_UI, strictPort: true, proxy },
  preview: { port: PORTS.GROUND_CONTROL_PREVIEW, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['@astronaut-wellness/ui/test-setup'],
    css: false,
  },
})
