import { describe, it } from 'vitest'
import { exampleCameraMetrics } from '../src/examples.js'
import { CameraMetricsSchema } from '../src/schemas/camera-metrics.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

const FACE_METRICS = ['blinkRate', 'eyeClosureRatio', 'yawnCount', 'headPose']

describe('CameraMetricsSchema', () => {
  it('acepta el ejemplo documentado', () => {
    expectValid(CameraMetricsSchema, exampleCameraMetrics)
  })

  it('acepta una ventana sin rostro detectado y sin métricas', () => {
    expectValid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => {
      m.faceDetected = false
      FACE_METRICS.forEach((key) => delete m[key])
    }))
  })

  it('rechaza métricas faciales si no se detectó rostro', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.faceDetected = false }), [])
  })

  it('rechaza rostro detectado sin ninguna métrica', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => {
      FACE_METRICS.forEach((key) => delete m[key])
    }), [])
  })

  it('exige que el origen sea la cámara', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.source.type = 'self_report' }), ['source', 'type'])
  })

  it('rechaza ratio de ojos cerrados fuera de 0–1', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.eyeClosureRatio.value = 1.2 }), ['eyeClosureRatio', 'value'])
  })

  it('rechaza conteo de bostezos decimal', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.yawnCount.value = 1.5 }), ['yawnCount', 'value'])
  })

  it('rechaza ángulos fuera de ±180°', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.headPose.yaw.value = 270 }), ['headPose', 'yaw', 'value'])
  })

  it('rechaza ventanas de análisis nulas o superiores a 1 h', () => {
    for (const value of [0, 3601]) {
      expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.windowDuration.value = value }), ['windowDuration', 'value'])
    }
  })

  it('rechaza confianza fuera de 0–1', () => {
    expectInvalid(CameraMetricsSchema, variant(exampleCameraMetrics, (m) => { m.confidence = 92 }), ['confidence'])
  })
})
