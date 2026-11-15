import { UNITS } from '@astronaut-wellness/shared'

/**
 * Métricas faciales EXPERIMENTALES a partir del resultado de MediaPipe Face
 * Landmarker. Todo se calcula en el navegador; solo salen métricas agregadas.
 *
 * Los umbrales son de PROCESAMIENTO DE SEÑAL (cuándo considerar un ojo cerrado
 * o la boca abierta según los blendshapes del modelo), configurables y sin
 * significado clínico. Dependen de la iluminación, el encuadre y el modelo.
 */
export const FACE_METRICS_DEFAULTS = Object.freeze({
  /** Cierre ocular (media de eyeBlinkLeft/Right) a partir del cual el ojo cuenta como cerrado. */
  closedThreshold: 0.5,
  /** Por debajo de este valor vuelve a contar como abierto (histéresis contra el ruido). */
  openThreshold: 0.35,
  /** Un cierre más largo que esto no cuenta como parpadeo (sí en la proporción de ojos cerrados). */
  maxBlinkMs: 500,
  /** Apertura de mandíbula (jawOpen) para considerar un posible bostezo… */
  yawnThreshold: 0.6,
  /** …si se mantiene al menos este tiempo. */
  yawnMinMs: 1500,
  /** Parpadeos/min por encima de los cuales la medida se considera no fiable y no se envía. */
  maxPlausibleBlinkRate: 120,
})

const MAX_ANGLE = 180

/** Puntuación de un blendshape del primer rostro (0–1) o null. */
export function blendshapeScore(result, name) {
  const categories = result?.faceBlendshapes?.[0]?.categories
  const category = categories?.find((c) => c.categoryName === name)
  return category ? category.score : null
}

/**
 * Orientación aproximada de la cabeza (grados) a partir de la matriz de
 * transformación facial 4×4 de MediaPipe (almacenada por columnas).
 * pitch = cabeceo, yaw = giro, roll = inclinación.
 */
export function headPoseFromMatrix(matrix) {
  if (!matrix?.data || matrix.data.length < 16) return null
  const m = (row, col) => matrix.data[col * 4 + row]
  const toDeg = (rad) => (rad * 180) / Math.PI
  const clamp = (v) => Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, v))
  const pitch = Math.atan2(m(2, 1), m(2, 2))
  const yaw = Math.asin(Math.max(-1, Math.min(1, -m(2, 0))))
  const roll = Math.atan2(m(1, 0), m(0, 0))
  return { pitch: clamp(toDeg(pitch)), yaw: clamp(toDeg(yaw)), roll: clamp(toDeg(roll)) }
}

/** Resultado de MediaPipe → muestra de un fotograma. */
export function frameFromResult(result, t) {
  const faceDetected = Boolean(result?.faceLandmarks?.length)
  if (!faceDetected) return { t, faceDetected: false }
  const left = blendshapeScore(result, 'eyeBlinkLeft')
  const right = blendshapeScore(result, 'eyeBlinkRight')
  return {
    t,
    faceDetected: true,
    eyeClosure: left !== null && right !== null ? (left + right) / 2 : null,
    jawOpen: blendshapeScore(result, 'jawOpen'),
    headPose: headPoseFromMatrix(result.facialTransformationMatrixes?.[0]),
  }
}

const round = (value, decimals = 2) => Number(value.toFixed(decimals))
const measure = (value, unit) => ({ value, unit })

/**
 * Agregador de una ventana de análisis. `addFrame` recibe muestras en orden
 * temporal (t en ms); `snapshot` da las cifras en vivo y `finish` produce los
 * campos del contrato CameraMetrics (sin id/recordedAt/source, que pone el servidor).
 */
export function createFaceMetricsWindow(options = {}) {
  const cfg = { ...FACE_METRICS_DEFAULTS, ...options }
  let startedAt = null
  let lastT = null
  let frames = 0
  let faceFrames = 0
  let closedFrames = 0
  let blinks = 0
  let yawns = 0
  let eyeClosed = false
  let closedSince = null
  let jawOpenSince = null
  let yawnCounted = false
  const pose = { pitch: 0, yaw: 0, roll: 0, n: 0 }

  function addFrame(frame) {
    startedAt ??= frame.t
    lastT = frame.t
    frames += 1
    if (!frame.faceDetected) return
    faceFrames += 1

    // Parpadeos y proporción de ojos cerrados (con histéresis).
    if (typeof frame.eyeClosure === 'number') {
      if (!eyeClosed && frame.eyeClosure >= cfg.closedThreshold) {
        eyeClosed = true
        closedSince = frame.t
      } else if (eyeClosed && frame.eyeClosure <= cfg.openThreshold) {
        eyeClosed = false
        if (frame.t - closedSince <= cfg.maxBlinkMs) blinks += 1
        closedSince = null
      }
      if (eyeClosed) closedFrames += 1
    }

    // Bostezos: mandíbula abierta de forma sostenida, una vez por episodio.
    if (typeof frame.jawOpen === 'number' && frame.jawOpen >= cfg.yawnThreshold) {
      jawOpenSince ??= frame.t
      if (!yawnCounted && frame.t - jawOpenSince >= cfg.yawnMinMs) {
        yawns += 1
        yawnCounted = true
      }
    } else {
      jawOpenSince = null
      yawnCounted = false
    }

    if (frame.headPose) {
      pose.pitch += frame.headPose.pitch
      pose.yaw += frame.headPose.yaw
      pose.roll += frame.headPose.roll
      pose.n += 1
    }
  }

  const elapsedMs = () => (startedAt === null ? 0 : lastT - startedAt)

  function snapshot() {
    const minutes = elapsedMs() / 60_000
    return {
      elapsedMs: elapsedMs(),
      frames,
      faceFrames,
      faceRatio: frames ? faceFrames / frames : 0,
      eyeClosureRatio: faceFrames ? closedFrames / faceFrames : null,
      blinks,
      blinkRate: minutes > 0 ? blinks / minutes : null,
      yawns,
      headPose: pose.n ? { pitch: pose.pitch / pose.n, yaw: pose.yaw / pose.n, roll: pose.roll / pose.n } : null,
    }
  }

  /** Campos del contrato CameraMetrics para la ventana completa. */
  function finish({ model } = {}) {
    const s = snapshot()
    const windowSeconds = Math.max(1, Math.min(3600, Math.round(s.elapsedMs / 1000)))
    const base = { windowDuration: measure(windowSeconds, UNITS.SECONDS), ...(model && { model }) }
    if (faceFrames === 0) return { ...base, faceDetected: false }

    return {
      ...base,
      faceDetected: true,
      ...(s.blinkRate !== null && s.blinkRate <= cfg.maxPlausibleBlinkRate && { blinkRate: measure(round(s.blinkRate, 1), UNITS.BLINKS_PER_MIN) }),
      ...(s.eyeClosureRatio !== null && { eyeClosureRatio: measure(round(s.eyeClosureRatio, 3), UNITS.RATIO) }),
      yawnCount: measure(Math.min(yawns, 1000), UNITS.COUNT),
      ...(s.headPose && {
        headPose: {
          pitch: measure(round(s.headPose.pitch, 1), UNITS.DEGREES),
          yaw: measure(round(s.headPose.yaw, 1), UNITS.DEGREES),
          roll: measure(round(s.headPose.roll, 1), UNITS.DEGREES),
        },
      }),
    }
  }

  return { addFrame, snapshot, finish, elapsedMs }
}
