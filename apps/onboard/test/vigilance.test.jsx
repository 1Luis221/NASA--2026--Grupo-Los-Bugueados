import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { VigilanceTestStrictSchema } from '@astronaut-wellness/shared'
import { VigilancePage } from '../src/pages/VigilancePage.jsx'
import { AppProviders } from '../src/state/AppProviders.jsx'
import { PVT_DEMO_PROTOCOL, PVT_MAX_TRIALS, classifyResponseEvent, createPvtEngine } from '../src/vigilance/pvt-engine.js'
import { ANA, createFakeOnboardApi, fixtures, storageWithCrew } from './render-app.jsx'

/** Reloj y temporizadores manuales (deterministas). */
function createScheduler() {
  let clock = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, at: clock + ms })
      return id
    },
    clearTimer: (id) => timers.delete(id),
    /** Avanza el reloj ejecutando los temporizadores vencidos en orden. */
    advance(ms) {
      const target = clock + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        clock = due[1].at
        due[1].fn()
      }
      clock = target
    },
    pending: () => timers.size,
  }
}

const protocol = { ...PVT_DEMO_PROTOCOL, durationSeconds: 10 }
const engineWith = (scheduler, overrides = {}) =>
  createPvtEngine({ protocol, now: scheduler.now, setTimer: scheduler.setTimer, clearTimer: scheduler.clearTimer, random: () => 0, ...overrides })

describe('Motor PVT', () => {
  it('registra respuestas, lapsos, falsas salidas y omisiones con la clasificación del contrato', () => {
    const s = createScheduler()
    const engine = engineWith(s) // intervalo fijo de 1000 ms (random = 0)
    engine.start()
    expect(engine.getState().phase).toBe('waiting')

    s.advance(1000) // estímulo en t=1000
    expect(engine.getState().phase).toBe('stimulus')
    s.advance(250)
    engine.respond() // válida: 250 ms

    s.advance(500)
    engine.respond() // durante la espera: falsa salida sin estímulo (reinicia el intervalo)

    s.advance(1000) // estímulo
    s.advance(400)
    engine.respond() // lapso: 400 ms

    s.advance(1000) // estímulo
    s.advance(50)
    engine.respond() // anticipación: 50 ms < 100 ms

    s.advance(1000) // estímulo
    s.advance(3000) // sin respuesta → omisión

    expect(engine.getState().trialCount).toBe(5) // t = 8200
    s.advance(10_000) // estímulo en t=9200 sin respuesta; la prueba (10 s) termina tras esa omisión
    expect(engine.getState().phase).toBe('finished')
    expect(s.pending()).toBe(0)

    const result = engine.result()
    expect(result.trials.map((t) => t.outcome)).toEqual(['valid', 'false_start', 'lapse', 'false_start', 'timeout', 'timeout'])
    expect(result.trials[0]).toMatchObject({ index: 0, stimulusOffsetMs: 1000, reactionTimeMs: 250 })
    expect(result.trials[1]).toMatchObject({ stimulusOffsetMs: null, reactionTimeMs: null })
    expect(result.trials[5]).toMatchObject({ stimulusOffsetMs: 9200, reactionTimeMs: null })
    expect(result.summary).toMatchObject({ trialCount: 6, validCount: 1, lapseCount: 1, falseStartCount: 2, timeoutCount: 2, errorCount: 4, meanReactionTimeMs: 325 })

    const record = { ...result, id: crypto.randomUUID(), crewMemberId: ANA.id, recordedAt: new Date().toISOString(), source: { type: 'cognitive_test', simulated: false } }
    expect(VigilanceTestStrictSchema.safeParse(record).success).toBe(true)
  })

  it('el intervalo entre estímulos respeta el protocolo (1–4 s)', () => {
    const s = createScheduler()
    const engine = engineWith(s, { random: () => 0.999 })
    engine.start()
    s.advance(3990)
    expect(engine.getState().phase).toBe('waiting')
    s.advance(10)
    expect(engine.getState().phase).toBe('stimulus')
  })

  it('al cumplirse la duración espera a que termine el estímulo en curso', () => {
    const s = createScheduler()
    const engine = engineWith(s) // 10 s; estímulos en t = 1000, 2200, … 9400 (espera 1000 + respuesta 200)
    engine.start()
    for (let i = 0; i < 8; i++) {
      s.advance(1000)
      s.advance(200)
      engine.respond()
    }
    expect(s.now()).toBe(9600)
    s.advance(1000) // el siguiente estímulo tocaría en t=10 600, pero la prueba acaba en t=10 000 durante la espera
    expect(engine.getState().phase).toBe('finished')
    expect(engine.result().trials).toHaveLength(8)

    // Estímulo en curso al cumplirse la duración: se espera a la respuesta.
    const s2 = createScheduler()
    const engine2 = engineWith(s2)
    engine2.start()
    for (let i = 0; i < 7; i++) {
      s2.advance(1000)
      s2.advance(200)
      engine2.respond()
    }
    s2.advance(1000) // estímulo en t=9400
    s2.advance(700) // t=10 100: la duración se cumplió con el estímulo visible
    expect(engine2.getState().phase).toBe('stimulus')
    engine2.respond()
    expect(engine2.getState().phase).toBe('finished')
    expect(engine2.result().trials.at(-1)).toMatchObject({ stimulusOffsetMs: 9400, reactionTimeMs: 700, outcome: 'lapse' })
  })

  it('cancelar detiene los temporizadores y no produce resultado', () => {
    const s = createScheduler()
    const engine = engineWith(s)
    engine.start()
    s.advance(1500)
    engine.cancel()
    expect(engine.getState().phase).toBe('cancelled')
    expect(s.pending()).toBe(0)
    expect(engine.result()).toBeNull()
  })

  it(`no supera ${PVT_MAX_TRIALS} ensayos aunque se pulse sin parar`, () => {
    const s = createScheduler()
    const engine = engineWith(s, { protocol: { ...protocol, durationSeconds: 600 } })
    engine.start()
    for (let i = 0; i < PVT_MAX_TRIALS + 50; i++) engine.respond()
    expect(engine.getState()).toMatchObject({ phase: 'finished', trialCount: PVT_MAX_TRIALS })
  })
})

function renderVigilance(scheduler, { state = fixtures(), devTools = true } = {}) {
  const api = createFakeOnboardApi(state)
  const user = userEvent.setup()
  const engineOptions = { now: scheduler.now, setTimer: scheduler.setTimer, clearTimer: scheduler.clearTimer, random: () => 0 }
  const utils = render(
    <AppProviders api={api} storage={storageWithCrew()} devTools={devTools} pollIntervalMs={60_000}>
      <MemoryRouter>
        <VigilancePage engineOptions={engineOptions} />
      </MemoryRouter>
    </AppProviders>,
  )
  return { ...utils, api, state, user }
}

describe('Pantalla de vigilancia', () => {
  it('prueba de demostración con la barra espaciadora → resultado → envío explícito (HTTP 201) e historial', async () => {
    const s = createScheduler()
    const { user, api } = renderVigilance(s)
    await user.click(await screen.findByRole('radio', { name: /Demostración · 1 minuto/ }))
    expect(screen.getByText(/NO estándar/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Iniciar prueba/ }))

    expect(screen.getByRole('button', { name: /Zona de respuesta/ })).toHaveTextContent('Espera…')
    act(() => s.advance(1000))
    expect(screen.getByRole('button', { name: /Zona de respuesta/ })).toHaveTextContent('¡AHORA!')
    act(() => s.advance(230))
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(await screen.findByText(/Respuesta registrada \(230 ms\)/)).toBeInTheDocument()

    // Repetición automática del teclado: se ignora
    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true })
    expect(screen.getByText(/Ensayos: 1/)).toBeInTheDocument()

    act(() => s.advance(60_000))
    const summary = await screen.findByLabelText('Resultado de la prueba')
    expect(within(summary).getByText('TR medio').nextSibling).toHaveTextContent('230 ms')
    expect(screen.getByText(/protocolo de demostración \(no estándar\)/)).toBeInTheDocument()
    expect(api.submitVigilanceTest).not.toHaveBeenCalled() // nada se envía sin pulsar el botón

    await user.click(screen.getByRole('button', { name: /Enviar resultado/ }))
    await waitFor(() => expect(api.submitVigilanceTest).toHaveBeenCalledTimes(1))
    const body = api.submitVigilanceTest.mock.calls[0][0]
    expect(body).toMatchObject({ crewMemberId: ANA.id, testType: 'pvt', protocol: { name: 'PVT-demo', durationSeconds: 60 } })
    expect(body.trials[0]).toMatchObject({ stimulusOffsetMs: 1000, reactionTimeMs: 230, outcome: 'valid' })

    expect(await screen.findByText('Resultado guardado en Onboard API')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: /Pruebas de vigilancia de Ana Torres/ })).toBeInTheDocument()
  })

  it('pulsar antes del estímulo cuenta como falsa salida; cancelar no guarda nada', async () => {
    const s = createScheduler()
    const { user, api } = renderVigilance(s)
    await user.click(await screen.findByRole('button', { name: /Iniciar prueba/ }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Zona de respuesta/ }))
    expect(await screen.findByText(/Falsa salida/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(screen.getByText(/Prueba cancelada/)).toBeInTheDocument()
    expect(api.submitVigilanceTest).not.toHaveBeenCalled()
  })
})

describe('Procedencia de las respuestas de la PVT', () => {
  it('evento de confianza → persona; generado por script → automatizado solo en desarrollo, si no se ignora', () => {
    expect(classifyResponseEvent({ isTrusted: true }, { allowAutomated: false })).toBe('human')
    expect(classifyResponseEvent({ isTrusted: true }, { allowAutomated: true })).toBe('human')
    expect(classifyResponseEvent({ isTrusted: false }, { allowAutomated: true })).toBe('automated')
    expect(classifyResponseEvent({ isTrusted: false }, { allowAutomated: false })).toBe('ignored')
    expect(classifyResponseEvent(undefined)).toBe('ignored')
  })

  it('regresión: una PVT respondida por un script (E2E) se avisa y se envía como automatizada (se guardará como simulada)', async () => {
    const s = createScheduler()
    const { user, api } = renderVigilance(s)
    await user.click(await screen.findByRole('button', { name: /Iniciar prueba/ }))
    act(() => s.advance(1000))
    act(() => s.advance(250))
    fireEvent.keyDown(window, { code: 'Space', key: ' ' }) // fireEvent: isTrusted = false, como un script
    act(() => s.advance(200_000))
    expect(await screen.findByText('Respuestas automatizadas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Enviar resultado/ }))
    await waitFor(() => expect(api.submitVigilanceTest).toHaveBeenCalledTimes(1))
    expect(api.submitVigilanceTest.mock.calls[0][1]).toEqual({ automated: true })
  })

  it('fuera de desarrollo, las respuestas generadas por script no cuentan', async () => {
    const s = createScheduler()
    const { user } = renderVigilance(s, { devTools: false })
    await user.click(await screen.findByRole('button', { name: /Iniciar prueba/ }))
    act(() => s.advance(1000))
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.pointerDown(screen.getByRole('button', { name: /Zona de respuesta/ }))
    expect(screen.getByRole('button', { name: /Zona de respuesta/ })).toHaveTextContent('¡AHORA!') // sigue esperando respuesta
    expect(screen.getByText(/Ensayos: 0/)).toBeInTheDocument()
  })
})
