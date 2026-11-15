import { existsSync } from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { LOCAL_MODEL_DIR, MODEL_FILE, mediapipeAssets } from '../mediapipe-assets.js'
import { REMOTE_MODEL_URL, describeModelOrigin, resolveMediapipeConfig } from '../src/camera/landmarker.js'

describe('MediaPipe · configuración sin conexión', () => {
  it('el runtime WASM SIEMPRE se sirve desde la propia app (nunca desde un CDN por defecto)', () => {
    expect(resolveMediapipeConfig({ VITE_MEDIAPIPE_LOCAL_MODEL: 'false' }).wasmBaseUrl).toBe('/mediapipe/wasm')
    expect(resolveMediapipeConfig({ VITE_MEDIAPIPE_LOCAL_MODEL: 'true' }).wasmBaseUrl).toBe('/mediapipe/wasm')
  })

  it('con el modelo descargado se usa el local; sin él, el remoto, y la pantalla lo dice explícitamente', () => {
    const local = resolveMediapipeConfig({ VITE_MEDIAPIPE_LOCAL_MODEL: 'true' })
    expect(local).toMatchObject({ modelUrl: '/mediapipe/models/face_landmarker.task', modelOrigin: 'local' })
    expect(describeModelOrigin(local)).toMatch(/funciona sin conexión/)

    const remote = resolveMediapipeConfig({})
    expect(remote).toMatchObject({ modelUrl: REMOTE_MODEL_URL, modelOrigin: 'remote' })
    expect(describeModelOrigin(remote)).toMatch(/REQUIERE RED.*npm run mediapipe:model/)
  })

  it('las URL configuradas explícitamente tienen prioridad y se muestran', () => {
    const cfg = resolveMediapipeConfig({ VITE_MEDIAPIPE_LOCAL_MODEL: 'true', VITE_FACE_LANDMARKER_MODEL_URL: 'https://example.test/m.task', VITE_MEDIAPIPE_WASM_URL: '/w' })
    expect(cfg).toMatchObject({ wasmBaseUrl: '/w', modelUrl: 'https://example.test/m.task', modelOrigin: 'configured' })
    expect(describeModelOrigin(cfg)).toContain('https://example.test/m.task')
  })
})

/** Ejecuta el middleware del plugin con una petición simulada. */
function request(url) {
  let middleware
  mediapipeAssets().configureServer({ middlewares: { use: (fn) => (middleware = fn) } })
  return new Promise((resolve) => {
    const res = new PassThrough()
    const headers = {}
    res.statusCode = 200
    res.setHeader = (k, v) => (headers[k.toLowerCase()] = v)
    let bytes = 0
    res.on('data', (chunk) => (bytes += chunk.length))
    res.on('end', () => resolve({ status: res.statusCode, headers, bytes, next: false }))
    middleware({ url }, res, () => resolve({ next: true }))
  })
}

describe('Plugin mediapipe-assets (Vite)', () => {
  it('sirve el runtime WASM instalado en node_modules con su tipo MIME', async () => {
    const res = await request('/mediapipe/wasm/vision_wasm_internal.wasm')
    expect(res).toMatchObject({ status: 200, headers: { 'content-type': 'application/wasm' } })
    expect(res.bytes).toBeGreaterThan(1_000_000)
  })

  it('responde 404 (nunca la página de la SPA) a recursos inexistentes o fuera de su carpeta', async () => {
    for (const url of ['/mediapipe/wasm/no-existe.wasm', '/mediapipe/models/otro.task', '/mediapipe/wasm/..', '/mediapipe/x/y']) {
      expect((await request(url)).status).toBe(404)
    }
    expect((await request('/index.html')).next).toBe(true)
  })

  it('declara en el build si hay modelo local, y lo sirve solo si existe', async () => {
    const hasModel = existsSync(path.join(LOCAL_MODEL_DIR, MODEL_FILE))
    expect(mediapipeAssets().config().define['import.meta.env.VITE_MEDIAPIPE_LOCAL_MODEL']).toBe(JSON.stringify(String(hasModel)))
    expect((await request(`/mediapipe/models/${MODEL_FILE}`)).status).toBe(hasModel ? 200 : 404)
  })

  it('el build copia todos los archivos del runtime WASM', () => {
    const emitted = []
    const plugin = mediapipeAssets()
    plugin.generateBundle.call({ emitFile: (f) => emitted.push(f.fileName) })
    expect(emitted).toEqual(expect.arrayContaining(['mediapipe/wasm/vision_wasm_internal.js', 'mediapipe/wasm/vision_wasm_internal.wasm']))
    expect(emitted.includes(`mediapipe/models/${MODEL_FILE}`)).toBe(existsSync(path.join(LOCAL_MODEL_DIR, MODEL_FILE)))
  })
})
