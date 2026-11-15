import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CameraMetricsStrictSchema } from '@astronaut-wellness/shared'
import { WebGLUnavailableError, createFaceLandmarker, isWebGLAvailable } from '../src/camera/landmarker.js'
import { useFaceAnalysis } from '../src/camera/use-face-analysis.js'
import { CameraPage } from '../src/pages/CameraPage.jsx'
import { AppProviders } from '../src/state/AppProviders.jsx'
import { faceResult } from './face-fixtures.js'
import { ANA, createFakeOnboardApi, fixtures, storageWithCrew } from './render-app.jsx'

/** Navegador simulado: cámara, detector de MediaPipe, reloj y bucle de fotogramas controlados. */
function createBrowser({ getUserMedia, createLandmarker } = {}) {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  const landmarker = { detectForVideo: vi.fn(() => faceResult()), close: vi.fn() }
  let clock = 0
  let pending = null
  let nextId = 1
  const cancelFrame = vi.fn(() => {
    pending = null
  })
  const options = {
    getMediaDevices: () => ({ getUserMedia: getUserMedia ?? vi.fn(async () => stream) }),
    createLandmarker: createLandmarker ?? vi.fn(async () => landmarker),
    requestFrame: (cb) => {
      pending = cb
      return nextId++
    },
    cancelFrame,
    now: () => clock,
    isFrameReady: () => true,
    dedupeFrames: false,
    uiIntervalMs: 0,
  }
  /** Avanza `count` fotogramas de `dt` ms. */
  const frames = (count, dt = 100) =>
    act(() => {
      for (let i = 0; i < count && pending; i++) {
        clock += dt
        const cb = pending
        pending = null
        cb()
      }
    })
  return { options, track, landmarker, cancelFrame, frames, hasPendingFrame: () => pending !== null }
}

function renderCamera(browser, { state = fixtures() } = {}) {
  const api = createFakeOnboardApi(state)
  const user = userEvent.setup()
  const utils = render(
    <AppProviders api={api} storage={storageWithCrew()} devTools pollIntervalMs={60_000}>
      <MemoryRouter>
        <CameraPage analysisOptions={browser.options} />
      </MemoryRouter>
    </AppProviders>,
  )
  return { ...utils, api, state, user }
}

const activate = async (user) => {
  await user.click(await screen.findByRole('button', { name: /Activar cámara/ }))
  await screen.findByText('Analizando en este dispositivo')
}

describe('Cámara · análisis facial local', () => {
  it('con consentimiento, envía SOLO métricas agregadas de cada ventana (sin imágenes)', async () => {
    const browser = createBrowser()
    const { user, api } = renderCamera(browser)
    await user.click(await screen.findByRole('checkbox', { name: /Enviar métricas agregadas/ }))
    await activate(user)

    await browser.frames(20)
    expect(screen.getByLabelText('Métricas en vivo')).toHaveTextContent('Detectado')
    expect(api.submitCameraMetrics).not.toHaveBeenCalled() // la ventana (30 s) aún no ha terminado

    await browser.frames(290)
    await waitFor(() => expect(api.submitCameraMetrics).toHaveBeenCalledTimes(1))
    const body = api.submitCameraMetrics.mock.calls[0][0]
    expect(body).toMatchObject({ crewMemberId: ANA.id, faceDetected: true, model: { name: 'mediapipe-face-landmarker' } })
    const allowed = ['crewMemberId', 'windowDuration', 'faceDetected', 'blinkRate', 'eyeClosureRatio', 'yawnCount', 'headPose', 'model']
    for (const key of Object.keys(body)) expect(allowed).toContain(key)
    const record = { ...body, id: crypto.randomUUID(), recordedAt: new Date().toISOString(), source: { type: 'camera', simulated: false } }
    expect(CameraMetricsStrictSchema.safeParse(record).success).toBe(true)

    expect(await screen.findByRole('list', { name: 'Ventanas enviadas' })).toHaveTextContent('HTTP 201')
  })

  it('sin consentimiento, las ventanas se descartan y no se envía nada', async () => {
    const browser = createBrowser()
    const { user, api } = renderCamera(browser)
    await activate(user)
    await browser.frames(310)
    expect(await screen.findByText(/1 descartada/)).toBeInTheDocument()
    expect(api.submitCameraMetrics).not.toHaveBeenCalled()
  })

  it('«Detener cámara» libera pistas, bucle y modelo', async () => {
    const browser = createBrowser()
    const { user } = renderCamera(browser)
    await activate(user)
    await browser.frames(3)
    await user.click(screen.getByRole('button', { name: /Detener cámara/ }))

    expect(browser.track.stop).toHaveBeenCalled()
    expect(browser.landmarker.close).toHaveBeenCalledTimes(1)
    expect(browser.cancelFrame).toHaveBeenCalled()
    expect(browser.hasPendingFrame()).toBe(false)
    expect(screen.getByText('Cámara detenida y liberada')).toBeInTheDocument()
  })

  it('al salir de la pantalla (desmontar) también se liberan cámara y modelo', async () => {
    const browser = createBrowser()
    const { user, unmount } = renderCamera(browser)
    await activate(user)
    unmount()
    expect(browser.track.stop).toHaveBeenCalled()
    expect(browser.landmarker.close).toHaveBeenCalledTimes(1)
  })

  it('permiso denegado: mensaje claro y no se carga el modelo', async () => {
    const createLandmarker = vi.fn()
    const browser = createBrowser({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
      }),
      createLandmarker,
    })
    const { user } = renderCamera(browser)
    await user.click(await screen.findByRole('button', { name: /Activar cámara/ }))
    expect(await screen.findByText(/Permiso de cámara denegado/)).toBeInTheDocument()
    expect(createLandmarker).not.toHaveBeenCalled()
  })

  it('si el modelo no se puede cargar, se informa y se apaga la cámara', async () => {
    const browser = createBrowser({ createLandmarker: vi.fn(async () => Promise.reject(new Error('sin red'))) })
    const { user } = renderCamera(browser)
    await user.click(await screen.findByRole('button', { name: /Activar cámara/ }))
    expect(await screen.findByText(/modelo de MediaPipe \(sin red\)/)).toBeInTheDocument()
    expect(browser.track.stop).toHaveBeenCalled()
  })

  it('el historial muestra las métricas guardadas con su procedencia', async () => {
    const state = fixtures()
    state.cameraMetrics = [
      {
        id: crypto.randomUUID(),
        crewMemberId: ANA.id,
        recordedAt: '2026-11-14T10:00:30.000Z',
        source: { type: 'camera', simulated: false, deviceId: 'onboard-browser-camera' },
        windowDuration: { value: 30, unit: 's' },
        faceDetected: true,
        blinkRate: { value: 14, unit: 'blinks/min' },
        model: { name: 'mediapipe-face-landmarker', version: '1.2.3' },
      },
    ]
    renderCamera(createBrowser(), { state })
    expect(await screen.findByText('mediapipe-face-landmarker 1.2.3')).toBeInTheDocument()
  })
})

describe('useFaceAnalysis · estabilidad', () => {
  it('regresión: opciones con funciones nuevas en cada render no liberan la cámara (fallo detectado en Edge real)', async () => {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const landmarker = { detectForVideo: vi.fn(() => faceResult()), close: vi.fn() }
    // Como los valores por defecto reales: funciones con identidad nueva en cada render.
    const { result, rerender } = renderHook(() =>
      useFaceAnalysis({
        getMediaDevices: () => ({ getUserMedia: async () => stream }),
        createLandmarker: async () => landmarker,
        requestFrame: () => 1,
        cancelFrame: () => {},
        onWindow: () => {},
      }),
    )
    await act(() => result.current.start())
    rerender()
    rerender()
    expect(result.current.status).toBe('running')
    expect(track.stop).not.toHaveBeenCalled()
    expect(landmarker.close).not.toHaveBeenCalled()
  })
})

describe('MediaPipe sin WebGL y delegado GPU/CPU (regresión «activeTexture»)', () => {
  const fakeTasksVision = (impl) => {
    const created = []
    const FaceLandmarker = {
      createFromOptions: vi.fn(async (_fileset, options) => {
        const lm = await impl(options)
        created.push(options)
        return lm
      }),
    }
    return { created, load: async () => ({ FaceLandmarker, FilesetResolver: { forVisionTasks: async () => ({}) } }) }
  }
  const canvases = () => {
    let n = 0
    return () => ({ id: ++n })
  }

  it('sin WebGL lanza un error explicativo y no intenta crear un detector que fallaría en el primer fotograma', async () => {
    const tv = fakeTasksVision(async () => ({ close() {} }))
    const load = vi.fn(tv.load)
    const err = await createFaceLandmarker(undefined, { webglAvailable: () => false, loadTasksVision: load }).catch((e) => e)
    expect(err).toBeInstanceOf(WebGLUnavailableError)
    expect(err.message).toMatch(/WebGL no está disponible.*también al procesar con CPU/)
    expect(load).not.toHaveBeenCalled()
  })

  it('con GPU disponible usa GPU y entrega a MediaPipe un canvas propio', async () => {
    const tv = fakeTasksVision(async () => ({ close() {} }))
    const lm = await createFaceLandmarker(undefined, { webglAvailable: () => true, loadTasksVision: tv.load, createCanvas: canvases() })
    expect(lm).toMatchObject({ delegate: 'GPU', canvas: { id: 1 } })
    expect(lm.fallbackReason).toBeUndefined()
    expect(tv.created[0]).toMatchObject({ canvas: { id: 1 }, baseOptions: { delegate: 'GPU' }, runningMode: 'VIDEO' })
  })

  it('si falla el delegado GPU usa CPU con un canvas nuevo, avisa en consola y conserva el motivo (nunca en silencio)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tv = fakeTasksVision(async (options) => {
      if (options.baseOptions.delegate === 'GPU') throw new Error('INTERNAL: Service "kGpuService" … emscripten_webgl_create_context() returned error 0\nmás detalle')
      return { close() {} }
    })
    const lm = await createFaceLandmarker(undefined, { webglAvailable: () => true, loadTasksVision: tv.load, createCanvas: canvases() })
    expect(lm).toMatchObject({ delegate: 'CPU', canvas: { id: 2 } })
    expect(lm.fallbackReason).toBe('INTERNAL: Service "kGpuService" … emscripten_webgl_create_context() returned error 0')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('se usa CPU'), expect.any(Error))
    warn.mockRestore()
  })

  it('VITE_MEDIAPIPE_DELEGATE=CPU fuerza la CPU (diagnóstico) e indica el motivo', async () => {
    const tv = fakeTasksVision(async () => ({ close() {} }))
    const lm = await createFaceLandmarker({ wasmBaseUrl: '/w', modelUrl: '/m', delegate: 'CPU' }, { webglAvailable: () => true, loadTasksVision: tv.load, createCanvas: canvases() })
    expect(lm).toMatchObject({ delegate: 'CPU', fallbackReason: expect.stringContaining('VITE_MEDIAPIPE_DELEGATE=CPU') })
    expect(tv.created.map((o) => o.baseOptions.delegate)).toEqual(['CPU'])
  })

  it('isWebGLAvailable: false si no hay contexto o si crear el canvas falla', () => {
    expect(isWebGLAvailable(() => ({ getContext: () => null }))).toBe(false)
    expect(isWebGLAvailable(() => { throw new Error('x') })).toBe(false)
    const lose = vi.fn()
    expect(isWebGLAvailable(() => ({ getContext: () => ({ getExtension: () => ({ loseContext: lose }) }) }))).toBe(true)
    expect(lose).toHaveBeenCalled() // el contexto de prueba se libera enseguida
  })

  it('la pantalla muestra el error de WebGL (no «activeTexture») y apaga la cámara', async () => {
    const browser = createBrowser({ createLandmarker: vi.fn(async () => Promise.reject(new WebGLUnavailableError())) })
    const { user } = renderCamera(browser)
    await user.click(await screen.findByRole('button', { name: /Activar cámara/ }))
    expect(await screen.findByText(/WebGL no está disponible/)).toBeInTheDocument()
    expect(screen.queryByText(/activeTexture/)).not.toBeInTheDocument()
    expect(browser.track.stop).toHaveBeenCalled()
  })

  it('informa al usuario cuando se procesa con CPU y del motivo', async () => {
    const browser = createBrowser()
    Object.assign(browser.landmarker, { delegate: 'CPU', fallbackReason: 'GPU no disponible (prueba)' })
    const { user } = renderCamera(browser)
    await activate(user)
    expect(screen.getByText('Procesando con CPU')).toBeInTheDocument()
    expect(screen.getByText(/Motivo: GPU no disponible \(prueba\)/)).toBeInTheDocument()
    expect(screen.getByText('Procesamiento: CPU')).toBeInTheDocument()
  })

  it('si se pierde el contexto WebGL durante el análisis, se detiene con un mensaje claro y se puede reactivar', async () => {
    const browser = createBrowser()
    const glCanvas = new EventTarget()
    browser.landmarker.canvas = glCanvas
    const { user } = renderCamera(browser)
    await activate(user)
    await browser.frames(3)
    act(() => glCanvas.dispatchEvent(new Event('webglcontextlost')))
    expect(await screen.findByText(/Se perdió el contexto WebGL/)).toBeInTheDocument()
    expect(browser.track.stop).toHaveBeenCalled()
    expect(browser.hasPendingFrame()).toBe(false)

    await user.click(screen.getByRole('button', { name: /Activar cámara/ }))
    expect(await screen.findByText('Analizando en este dispositivo')).toBeInTheDocument()
  })

  it('regresión: si close() falla, la sesión queda liberada y la cámara se puede volver a activar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const browser = createBrowser()
    browser.landmarker.close = vi.fn(() => {
      throw new Error('close tras perder el contexto')
    })
    const { user } = renderCamera(browser)
    await activate(user)
    await user.click(screen.getByRole('button', { name: /Detener cámara/ }))
    expect(screen.getByText('Cámara detenida y liberada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Activar cámara/ }))
    expect(await screen.findByText('Analizando en este dispositivo')).toBeInTheDocument()
    expect(browser.track.stop).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('activar y detener rápidamente 10 veces no deja pistas activas ni detectores abiertos', async () => {
    const tracks = []
    const landmarkers = []
    const browser = createBrowser({
      getUserMedia: vi.fn(async () => {
        const track = { stop: vi.fn() }
        tracks.push(track)
        return { getTracks: () => [track] }
      }),
      createLandmarker: vi.fn(async () => {
        const lm = { detectForVideo: vi.fn(() => faceResult()), close: vi.fn() }
        landmarkers.push(lm)
        return lm
      }),
    })
    const { user } = renderCamera(browser)
    for (let i = 0; i < 10; i++) {
      await user.click(await screen.findByRole('button', { name: /Activar cámara/ }))
      // detener sin esperar a que termine de cargar (si ya cargó, el botón es «Detener»)
      await user.click(await screen.findByRole('button', { name: /Detener cámara/ }))
    }
    expect(tracks).toHaveLength(10)
    expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true)
    await waitFor(() => expect(landmarkers.every((lm) => lm.close.mock.calls.length === 1)).toBe(true))
  })
})
