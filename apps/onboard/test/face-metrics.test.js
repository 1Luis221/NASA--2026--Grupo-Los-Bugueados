import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CameraMetricsStrictSchema } from '@astronaut-wellness/shared'
import { createFaceMetricsWindow, frameFromResult, headPoseFromMatrix } from '../src/camera/face-metrics.js'
import { FACE_MODEL_INFO, MEDIAPIPE_VERSION } from '../src/camera/landmarker.js'
import { faceResult, identity, yawMatrix } from './face-fixtures.js'

/** Alimenta la ventana con fotogramas cada `dt` ms. */
function feed(win, frames, { t0 = 0, dt = 100 } = {}) {
  frames.forEach((frame, i) => win.addFrame({ ...frame, t: t0 + i * dt }))
}

const open = { faceDetected: true, eyeClosure: 0.1, jawOpen: 0.05 }
const closed = { faceDetected: true, eyeClosure: 0.9, jawOpen: 0.05 }

describe('frameFromResult y orientación de la cabeza', () => {
  it('sin rostro no produce métricas', () => {
    expect(frameFromResult({ faceLandmarks: [] }, 10)).toEqual({ t: 10, faceDetected: false })
  })

  it('cierre ocular = media de eyeBlinkLeft/Right; mandíbula = jawOpen', () => {
    const frame = frameFromResult(faceResult({ blinkL: 0.2, blinkR: 0.6, jaw: 0.7 }), 5)
    expect(frame).toMatchObject({ t: 5, faceDetected: true, jawOpen: 0.7 })
    expect(frame.eyeClosure).toBeCloseTo(0.4)
  })

  it('matriz identidad → cabeza recta; rotación en Y → giro de ese ángulo', () => {
    expect(headPoseFromMatrix(identity())).toEqual({ pitch: 0, yaw: expect.closeTo(0), roll: 0 })
    const pose = headPoseFromMatrix(yawMatrix(20))
    expect(pose.yaw).toBeCloseTo(20)
    expect(pose.pitch).toBeCloseTo(0)
    expect(pose.roll).toBeCloseTo(0)
    expect(headPoseFromMatrix(null)).toBeNull()
  })
})

describe('createFaceMetricsWindow', () => {
  it('cuenta parpadeos breves con histéresis, pero no los cierres largos', () => {
    const win = createFaceMetricsWindow()
    // abierto · parpadeo de 200 ms · abierto · cierre de 1 s (no es parpadeo) · abierto
    feed(win, [open, closed, closed, open, open, ...Array(10).fill(closed), open, open])
    const s = win.snapshot()
    expect(s.blinks).toBe(1)
    expect(s.eyeClosureRatio).toBeCloseTo(12 / 17)
  })

  it('el ruido entre los dos umbrales no genera parpadeos', () => {
    const win = createFaceMetricsWindow()
    feed(win, [open, { ...open, eyeClosure: 0.45 }, { ...open, eyeClosure: 0.4 }, open])
    expect(win.snapshot().blinks).toBe(0)
  })

  it('un bostezo es mandíbula abierta sostenida y cuenta una vez por episodio', () => {
    const win = createFaceMetricsWindow()
    const yawn = { ...open, jawOpen: 0.8 }
    feed(win, [...Array(20).fill(yawn), open, ...Array(5).fill(yawn)]) // 1,9 s sostenido + 0,4 s breve
    expect(win.snapshot().yawns).toBe(1)
  })

  it('finish produce un CameraMetrics válido (tras añadir los campos del servidor) sin imágenes ni landmarks', () => {
    const win = createFaceMetricsWindow()
    const frames = Array.from({ length: 301 }, (_, i) => (i % 50 === 10 || i % 50 === 11 ? closed : { ...open, headPose: { pitch: 5, yaw: -10, roll: 2 } }))
    feed(win, frames) // 30 s a 10 fps
    const metrics = win.finish({ model: FACE_MODEL_INFO })

    expect(metrics.windowDuration).toEqual({ value: 30, unit: 's' })
    expect(metrics.blinkRate.value).toBeCloseTo(12) // 6 parpadeos en 0,5 min
    expect(metrics.headPose.yaw).toEqual({ value: -10, unit: 'deg' })
    expect(Object.keys(metrics).sort()).toEqual(['blinkRate', 'eyeClosureRatio', 'faceDetected', 'headPose', 'model', 'windowDuration', 'yawnCount'])

    const record = {
      ...metrics,
      id: crypto.randomUUID(),
      crewMemberId: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      source: { type: 'camera', simulated: false, deviceId: 'onboard-browser-camera' },
    }
    expect(CameraMetricsStrictSchema.safeParse(record).success).toBe(true)
  })

  it('sin rostro en toda la ventana solo informa faceDetected: false', () => {
    const win = createFaceMetricsWindow()
    feed(win, Array(50).fill({ faceDetected: false }))
    expect(win.finish()).toEqual({ windowDuration: { value: 5, unit: 's' }, faceDetected: false })
  })

  it('omite la frecuencia de parpadeo cuando no es plausible (p. ej. ventana muy corta)', () => {
    const win = createFaceMetricsWindow()
    feed(win, [open, closed, open, closed, open, closed, open], { dt: 100 })
    expect(win.finish().blinkRate).toBeUndefined()
  })
})

describe('MediaPipe', () => {
  it('la versión declarada coincide con la instalada (URL del WASM y metadatos del modelo)', () => {
    const require = createRequire(import.meta.url)
    const entry = require.resolve('@mediapipe/tasks-vision')
    let dir = dirname(entry)
    while (!readPkg(dir)) dir = dirname(dir)
    expect(readPkg(dir).version).toBe(MEDIAPIPE_VERSION)
    expect(FACE_MODEL_INFO.version).toBe(MEDIAPIPE_VERSION)
  })
})

function readPkg(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return pkg.name === '@mediapipe/tasks-vision' ? pkg : null
  } catch {
    return null
  }
}
