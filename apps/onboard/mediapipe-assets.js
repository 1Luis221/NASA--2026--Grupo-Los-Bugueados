import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Recursos de MediaPipe servidos por la propia aplicación (sin CDN):
 *
 * - /mediapipe/wasm/*  → runtime WASM de @mediapipe/tasks-vision (ya instalado
 *   en node_modules: siempre disponible, también sin conexión).
 * - /mediapipe/models/face_landmarker.task → modelo, SOLO si se descargó con
 *   `npm run mediapipe:model` (no se versiona: ~3,6 MB). Si no existe, la app
 *   usa la URL oficial con versión fijada.
 *
 * En desarrollo se sirven con un middleware; en el build se copian a dist/.
 */
const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))

export const MODEL_FILE = 'face_landmarker.task'
export const LOCAL_MODEL_DIR = path.join(HERE, 'mediapipe-models')

function wasmDir() {
  let dir = path.dirname(require.resolve('@mediapipe/tasks-vision'))
  while (!existsSync(path.join(dir, 'wasm'))) dir = path.dirname(dir)
  return path.join(dir, 'wasm')
}

const TYPES = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.task': 'application/octet-stream' }

export function mediapipeAssets() {
  const wasm = wasmDir()
  const modelPath = path.join(LOCAL_MODEL_DIR, MODEL_FILE)
  const hasLocalModel = existsSync(modelPath)

  const resolveFile = (url) => {
    const [, kind, name] = url.match(/^\/mediapipe\/(wasm|models)\/([\w.-]+)$/) ?? []
    if (kind === 'wasm') return path.join(wasm, name)
    if (kind === 'models' && name === MODEL_FILE && hasLocalModel) return modelPath
    return null
  }

  return {
    name: 'astronaut-wellness:mediapipe-assets',
    config: () => ({
      // La app sabe en tiempo de compilación si hay modelo local.
      define: { 'import.meta.env.VITE_MEDIAPIPE_LOCAL_MODEL': JSON.stringify(hasLocalModel ? 'true' : 'false') },
    }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/mediapipe/')) return next()
        const file = resolveFile(url)
        if (!file || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404 // nunca la página SPA en lugar de un recurso binario
          return res.end('Not found')
        }
        res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const name of readdirSync(wasm)) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/wasm/${name}`, source: readFileSync(path.join(wasm, name)) })
      }
      if (hasLocalModel) this.emitFile({ type: 'asset', fileName: `mediapipe/models/${MODEL_FILE}`, source: readFileSync(modelPath) })
    },
  }
}
