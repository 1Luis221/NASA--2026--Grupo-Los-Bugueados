/**
 * Carga de MediaPipe Face Landmarker (procesamiento LOCAL en el navegador).
 *
 * El vídeo nunca sale del dispositivo. Recursos estáticos necesarios:
 * - Runtime WASM: lo sirve la propia app en /mediapipe/wasm (copiado de
 *   node_modules por mediapipe-assets.js): funciona sin conexión.
 * - Modelo: /mediapipe/models/face_landmarker.task si se descargó con
 *   `npm run mediapipe:model`; si no, la URL oficial con versión fijada (requiere red).
 * Ambos se pueden sustituir con VITE_MEDIAPIPE_WASM_URL y VITE_FACE_LANDMARKER_MODEL_URL.
 */

/** Debe coincidir con la versión instalada de @mediapipe/tasks-vision (lo comprueba una prueba). */
export const MEDIAPIPE_VERSION = '1.2.3'

export const REMOTE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const BASE = import.meta.env.BASE_URL ?? '/'

export function resolveMediapipeConfig(env = import.meta.env) {
  const localModel = env.VITE_MEDIAPIPE_LOCAL_MODEL === 'true'
  return Object.freeze({
    wasmBaseUrl: env.VITE_MEDIAPIPE_WASM_URL || `${BASE}mediapipe/wasm`,
    modelUrl: env.VITE_FACE_LANDMARKER_MODEL_URL || (localModel ? `${BASE}mediapipe/models/face_landmarker.task` : REMOTE_MODEL_URL),
    /** Para mostrar en pantalla de dónde se carga el modelo. */
    modelOrigin: env.VITE_FACE_LANDMARKER_MODEL_URL ? 'configured' : localModel ? 'local' : 'remote',
    /** Diagnóstico: VITE_MEDIAPIPE_DELEGATE=CPU fuerza la CPU; por defecto GPU con reserva en CPU. */
    delegate: env.VITE_MEDIAPIPE_DELEGATE === 'CPU' ? 'CPU' : 'auto',
  })
}

export const MEDIAPIPE_CONFIG = resolveMediapipeConfig()

/** Texto visible del origen del modelo: la dependencia de red nunca es silenciosa. */
export function describeModelOrigin(config = MEDIAPIPE_CONFIG) {
  if (config.modelOrigin === 'local') return 'servido por esta aplicación: funciona sin conexión'
  if (config.modelOrigin === 'configured') return `desde ${config.modelUrl} (configurado con VITE_FACE_LANDMARKER_MODEL_URL)`
  return 'descargado de storage.googleapis.com: REQUIERE RED. Para usarlo sin conexión ejecuta «npm run mediapipe:model» y reinicia Onboard'
}

/** Identificación del modelo que acompaña a cada métrica enviada. */
export const FACE_MODEL_INFO = Object.freeze({ name: 'mediapipe-face-landmarker', version: MEDIAPIPE_VERSION })

/**
 * WebGL no disponible. MediaPipe lo necesita SIEMPRE en modo VIDEO: con el
 * delegado GPU para la inferencia y, también con el de CPU, para subir cada
 * fotograma. Sin él, el detector se crea pero falla en el primer fotograma con
 * "Cannot read properties of undefined (reading 'activeTexture')".
 */
export class WebGLUnavailableError extends Error {
  constructor() {
    super(
      'WebGL no está disponible en este navegador ahora mismo y MediaPipe lo necesita (también al procesar con CPU). ' +
        'Suele ocurrir si el navegador bloqueó la aceleración gráfica tras un fallo o reinicio de la GPU (p. ej. con poca memoria). ' +
        'Recarga la página o reinicia el navegador; en edge://gpu puedes comprobar el estado de WebGL.',
    )
    this.name = 'WebGLUnavailableError'
  }
}

const newCanvas = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'))

/** ¿Se puede crear un contexto WebGL (como hará MediaPipe)? El contexto de prueba se libera enseguida. */
export function isWebGLAvailable(createCanvas = newCanvas) {
  try {
    const canvas = createCanvas()
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Crea el detector. Se importa bajo demanda: MediaPipe solo se descarga cuando
 * el tripulante activa la cámara.
 *
 * - Sin WebGL lanza WebGLUnavailableError (no se intenta un detector que fallaría después).
 * - Si falla el delegado GPU se usa CPU, pero NO en silencio: se registra el
 *   motivo y el detector devuelto lo indica (`delegate`, `fallbackReason`).
 * - Cada detector recibe un canvas propio (`canvas`) para poder vigilar la
 *   pérdida de su contexto WebGL (evento `webglcontextlost`).
 */
export async function createFaceLandmarker(
  { wasmBaseUrl, modelUrl, delegate = 'auto' } = MEDIAPIPE_CONFIG,
  { webglAvailable = isWebGLAvailable, loadTasksVision = () => import('@mediapipe/tasks-vision'), createCanvas = newCanvas } = {},
) {
  if (!webglAvailable()) throw new WebGLUnavailableError()
  const { FaceLandmarker, FilesetResolver } = await loadTasksVision()
  const fileset = await FilesetResolver.forVisionTasks(wasmBaseUrl)
  const create = async (delegate) => {
    const canvas = createCanvas()
    const landmarker = await FaceLandmarker.createFromOptions(fileset, {
      canvas,
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
    return Object.assign(landmarker, { delegate, canvas })
  }
  if (delegate === 'CPU') return Object.assign(await create('CPU'), { fallbackReason: 'CPU forzada con VITE_MEDIAPIPE_DELEGATE=CPU' })
  try {
    return await create('GPU')
  } catch (gpuError) {
    const reason = String(gpuError?.message ?? gpuError).split('\n')[0].slice(0, 200)
    console.warn('[MediaPipe] El delegado GPU no está disponible; se usa CPU.', gpuError)
    return Object.assign(await create('CPU'), { fallbackReason: reason })
  }
}
