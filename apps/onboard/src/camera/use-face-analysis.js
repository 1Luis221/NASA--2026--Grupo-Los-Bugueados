import { useCallback, useEffect, useRef, useState } from 'react'
import { createFaceMetricsWindow, frameFromResult } from './face-metrics.js'
import { FACE_MODEL_INFO, createFaceLandmarker } from './landmarker.js'

/** Mensajes comprensibles para los errores de getUserMedia. */
export function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permiso de cámara denegado. Puedes concederlo desde la configuración del navegador y volver a intentarlo.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró ninguna cámara disponible.'
    case 'NotReadableError':
      return 'La cámara está en uso por otra aplicación.'
    default:
      return `No se pudo acceder a la cámara (${error?.message ?? 'error desconocido'}).`
  }
}

/** Dibuja una muestra de los landmarks del primer rostro (solo en local, sobre el vídeo). */
function drawLandmarks(canvas, video, result) {
  const ctx = canvas?.getContext?.('2d')
  if (!ctx) return
  const width = video?.videoWidth || canvas.width
  const height = video?.videoHeight || canvas.height
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  ctx.clearRect(0, 0, width, height)
  const points = result?.faceLandmarks?.[0]
  if (!points) return
  ctx.fillStyle = 'rgba(103, 200, 255, 0.85)'
  for (let i = 0; i < points.length; i += 3) {
    ctx.fillRect(points[i].x * width - 1, points[i].y * height - 1, 2, 2)
  }
}

/**
 * Análisis facial local con la cámara del dispositivo.
 *
 * - La cámara solo se solicita al llamar a `start()` (acción explícita).
 * - Cada `windowMs` entrega a `onWindow` las métricas AGREGADAS de la ventana;
 *   nunca imágenes ni landmarks.
 * - `stop()` y el desmontaje liberan todo: pistas de la cámara, bucle de
 *   fotogramas y el detector de MediaPipe.
 * Las dependencias del navegador son inyectables para las pruebas.
 */
export function useFaceAnalysis(options = {}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const sessionRef = useRef(null)
  // Dependencias y opciones más recientes. Los callbacks las leen de aquí para
  // ser ESTABLES: si cambiaran en cada render, la limpieza del efecto de
  // desmontaje se ejecutaría en cada render y liberaría la cámara recién abierta.
  const optionsRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | requesting | loading-model | running | stopped | error
  const [error, setError] = useState(null)
  const [live, setLive] = useState(null)
  // Delegado en uso: { delegate: 'GPU' | 'CPU', fallbackReason? }. Se informa al usuario si se pasó a CPU.
  const [engine, setEngine] = useState(null)

  useEffect(() => {
    optionsRef.current = withDefaults(options)
  })
  const opts = () => optionsRef.current ?? withDefaults(options)

  /** Libera todos los recursos de una sesión. Idempotente. */
  const release = useCallback((session) => {
    if (!session || session.released) return
    session.released = true
    if (session.frameId !== null) session.cancelFrame(session.frameId)
    session.stream?.getTracks().forEach((track) => track.stop())
    const video = videoRef.current
    if (video) {
      try {
        video.pause?.()
      } catch {
        /* jsdom / vídeo ya detenido */
      }
      video.srcObject = null
    }
    session.unwatchContext?.()
    // Se libera la sesión ANTES de cerrar el detector: si close() fallara (p. ej. con
    // el contexto WebGL perdido), la cámara debe poder volver a activarse.
    if (sessionRef.current === session) sessionRef.current = null
    try {
      session.landmarker?.close()
    } catch (err) {
      console.warn('[MediaPipe] Error al cerrar el detector (se ignora: la sesión ya está liberada).', err)
    }
  }, [])

  const stop = useCallback(() => {
    release(sessionRef.current)
    setStatus('stopped')
    setLive(null)
  }, [release])

  const start = useCallback(async () => {
    if (sessionRef.current) return
    const o = opts()
    const session = { stream: null, landmarker: null, frameId: null, released: false, lastVideoTime: -1, lastUi: -Infinity, window: null, cancelFrame: o.cancelFrame }
    sessionRef.current = session
    setError(null)
    setEngine(null)
    setStatus('requesting')

    const fail = (message) => {
      release(session)
      setError(message)
      setStatus('error')
    }

    try {
      const mediaDevices = o.getMediaDevices()
      if (!mediaDevices?.getUserMedia) throw Object.assign(new Error('API de cámara no disponible'), { name: 'NotFoundError' })
      session.stream = await mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
    } catch (err) {
      if (!session.released) fail(cameraErrorMessage(err))
      return
    }
    if (session.released) {
      session.stream.getTracks().forEach((track) => track.stop()) // se detuvo mientras se pedía el permiso
      return
    }

    const video = videoRef.current
    if (video) {
      video.srcObject = session.stream
      // Sin esperar: play() puede no resolverse hasta que llegan datos. El bucle comprueba readyState.
      try {
        video.play?.()?.catch?.(() => {})
      } catch {
        /* jsdom: play no implementado */
      }
    }

    setStatus('loading-model')
    try {
      session.landmarker = await o.createLandmarker()
    } catch (err) {
      if (!session.released) {
        fail(err?.name === 'WebGLUnavailableError' ? err.message : `No se pudo cargar el modelo de MediaPipe (${err?.message ?? 'error'}). Comprueba la conexión o la configuración.`)
      }
      return
    }
    if (session.released) {
      try {
        session.landmarker.close() // se detuvo mientras se cargaba el modelo
      } catch {
        /* nada que liberar */
      }
      return
    }

    // Si el navegador pierde el contexto WebGL del detector (reinicio de la GPU, falta de
    // recursos), MediaPipe seguiría devolviendo resultados vacíos sin avisar: se detiene
    // la sesión con un mensaje claro. Al volver a activar se crea un detector nuevo.
    const glCanvas = session.landmarker.canvas
    if (glCanvas?.addEventListener) {
      const onLost = () => {
        if (!session.released) fail('Se perdió el contexto WebGL del modelo (la GPU se reinició o el navegador liberó recursos). La cámara se ha detenido: vuelve a activarla.')
      }
      glCanvas.addEventListener('webglcontextlost', onLost)
      session.unwatchContext = () => glCanvas.removeEventListener('webglcontextlost', onLost)
    }
    setEngine({ delegate: session.landmarker.delegate ?? null, fallbackReason: session.landmarker.fallbackReason ?? null })

    session.window = createFaceMetricsWindow()
    setStatus('running')

    const tick = () => {
      if (session.released) return
      const { windowMs, uiIntervalMs, isFrameReady, dedupeFrames, now, onWindow } = opts()
      const currentVideo = videoRef.current
      try {
        if (currentVideo && isFrameReady(currentVideo) && (!dedupeFrames || currentVideo.currentTime !== session.lastVideoTime)) {
          session.lastVideoTime = currentVideo.currentTime
          const t = now()
          const result = session.landmarker.detectForVideo(currentVideo, t)
          const frame = frameFromResult(result, t)
          session.window.addFrame(frame)
          drawLandmarks(canvasRef.current, currentVideo, result)

          if (t - session.lastUi >= uiIntervalMs) {
            session.lastUi = t
            setLive({ ...session.window.snapshot(), faceNow: frame.faceDetected, eyeClosureNow: frame.eyeClosure ?? null, windowMs })
          }
          if (session.window.elapsedMs() >= windowMs) {
            const metrics = session.window.finish({ model: FACE_MODEL_INFO })
            session.window = createFaceMetricsWindow()
            onWindow?.(metrics)
          }
        }
      } catch (err) {
        fail(`El análisis se detuvo por un error del modelo (${err?.message ?? 'error'}).`)
        return
      }
      session.frameId = o.requestFrame(tick)
    }
    session.frameId = o.requestFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- estable a propósito: lee las opciones de optionsRef
  }, [release])

  // Solo al desmontar (o cambiar de pantalla): se liberan cámara y modelo.
  useEffect(() => () => release(sessionRef.current), [release])

  return { videoRef, canvasRef, status, error, live, engine, start, stop }
}

function withDefaults({
  windowMs = 30_000,
  onWindow,
  createLandmarker = createFaceLandmarker,
  getMediaDevices = () => navigator.mediaDevices,
  requestFrame = (cb) => window.requestAnimationFrame(cb),
  cancelFrame = (id) => window.cancelAnimationFrame(id),
  now = () => performance.now(),
  isFrameReady = (video) => video.readyState >= 2,
  dedupeFrames = true,
  uiIntervalMs = 500,
} = {}) {
  return { windowMs, onWindow, createLandmarker, getMediaDevices, requestFrame, cancelFrame, now, isFrameReady, dedupeFrames, uiIntervalMs }
}
