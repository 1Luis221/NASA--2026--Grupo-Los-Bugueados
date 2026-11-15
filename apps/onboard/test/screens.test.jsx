import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@astronaut-wellness/ui'
import { SELECTED_CREW_STORAGE_KEY } from '../src/state/AppProviders.jsx'
import { ANA, KENJI, createFakeOnboardApi, createMemoryStorage, fixtures, renderApp, storageWithCrew, syncEvent } from './render-app.jsx'

const region = (name) => screen.findByRole('region', { name })

/** Rellena las cuatro escalas del formulario. */
async function fillScales(user, values = { 'Estado de ánimo': 4, Estrés: 2, Fatiga: 3, 'Calidad del sueño': 4 }) {
  for (const [legend, value] of Object.entries(values)) {
    const group = screen.getByRole('radiogroup', { name: legend })
    await user.click(within(group).getByRole('radio', { name: new RegExp(`^${value}\\b`) }))
  }
}

describe('Selección de tripulante', () => {
  it('sin selección pide elegir; al elegir se muestran sus datos y se recuerda', async () => {
    const storage = createMemoryStorage()
    const { user } = renderApp({ storage })
    expect(await screen.findByText('Ningún tripulante seleccionado')).toBeInTheDocument()

    await user.click(screen.getAllByRole('combobox', { name: 'Tripulante' })[0])
    await user.click(await screen.findByRole('option', { name: 'Kenji Watanabe (Orbit)' }))

    const selected = await region('Tripulante seleccionado')
    expect(within(selected).getByText('Kenji Watanabe')).toBeInTheDocument()
    expect(storage.setItem).toHaveBeenCalledWith(SELECTED_CREW_STORAGE_KEY, KENJI.id)
  })

  it('persistencia: recupera la selección guardada en el navegador', async () => {
    renderApp({ storage: storageWithCrew(KENJI.id) })
    const selected = await region('Tripulante seleccionado')
    expect(within(selected).getByText('Kenji Watanabe')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tripulante' })).toHaveTextContent('Kenji Watanabe (Orbit)')
  })

  it('tripulante inexistente: avisa, olvida la selección y pide elegir otro', async () => {
    const storage = storageWithCrew('c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a')
    renderApp({ storage })
    expect(await screen.findByText('El tripulante guardado ya no existe')).toBeInTheDocument()
    expect(screen.getByText('Ningún tripulante seleccionado')).toBeInTheDocument()
    await waitFor(() => expect(storage.removeItem).toHaveBeenCalledWith(SELECTED_CREW_STORAGE_KEY))
  })

  it('sin tripulantes: estado vacío', async () => {
    renderApp({ state: { ...fixtures(), crew: [] }, storage: createMemoryStorage() })
    expect(await screen.findByText('Sin tripulantes')).toBeInTheDocument()
  })
})

describe('Inicio', () => {
  it('con datos: signos vitales, bienestar, alertas, enlace y eventos pendientes', async () => {
    const state = fixtures()
    state.alerts = [
      { id: crypto.randomUUID(), origin: 'onboard', category: 'communication', severity: 'warning', status: 'active', title: 'Enlace nave–Tierra interrumpido', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z' },
    ]
    state.events.push(syncEvent({ status: 'pending' }), syncEvent({ status: 'retry_scheduled', attempts: 1, nextRetryAt: '2026-11-14T10:01:00.000Z', lastError: { code: 'LINK_DOWN', message: 'sin enlace' } }))
    state.link.state = 'disconnected'
    renderApp({ state })

    const vitals = await region('Últimos signos vitales')
    await waitFor(() => expect(within(vitals).getByText('76 lpm')).toBeInTheDocument())
    expect(within(vitals).getByText('Simulado')).toBeInTheDocument()

    const sync = screen.getByRole('region', { name: 'Enlace y sincronización' })
    await waitFor(() => expect(within(sync).getByText('Enlace simulado: desconectado')).toBeInTheDocument())
    const pending = within(sync).getByText('Eventos pendientes de envío').nextElementSibling
    expect(pending).toHaveTextContent('2')
    expect(within(sync).getByText('Última actualización').nextElementSibling.textContent).toMatch(/UTC$/)
    expect(within(sync).getByText(/No es una conexión espacial real/)).toBeInTheDocument()

    const alerts = screen.getByRole('region', { name: 'Alertas' })
    expect(await within(alerts).findByText('Enlace nave–Tierra interrumpido')).toBeInTheDocument()
    expect(within(alerts).getByText('General')).toBeInTheDocument()
  })

  it('sin datos del tripulante: estados vacíos, sin inventar valores', async () => {
    renderApp({ state: { ...fixtures(), vitals: [] } })
    const vitals = await region('Últimos signos vitales')
    expect(await within(vitals).findByText('Sin mediciones')).toBeInTheDocument()
    const wellness = screen.getByRole('region', { name: 'Bienestar autoinformado' })
    expect(await within(wellness).findByText(/Se necesitan al menos 3 autoevaluaciones/)).toBeInTheDocument()
    expect(screen.getByText('Sin alertas')).toBeInTheDocument()
  })
})

describe('Signos vitales', () => {
  it('muestra valores con unidades, fecha, origen "Simulado" e historial con resumen textual', async () => {
    renderApp({ path: '/vitals' })
    const last = await region('Última medición')
    await waitFor(() => expect(within(last).getByText('76 lpm')).toBeInTheDocument())
    for (const text of ['14 rpm', '98%', '36,7 °C', '118/76 mmHg', '45 ms', '2026-11-14 10:00:05 UTC', 'Simulado']) {
      expect(within(last).getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByText('Datos simulados')).toBeInTheDocument()
    expect(screen.getByText(/No son mediciones médicas reales/)).toBeInTheDocument()

    const history = screen.getByRole('region', { name: 'Historial' })
    expect(within(history).getByText('Frecuencia cardiaca: 2 lecturas entre 10:00:00 y 10:00:05 UTC; rango 70–76 lpm; última 76 lpm.')).toBeInTheDocument()
    const table = within(history).getByRole('table', { name: 'Últimas 2 lecturas de frecuencia cardiaca' })
    expect(within(table).getAllByText('Simulado')).toHaveLength(2)
  })

  it('la interfaz no genera telemetría por sí sola', async () => {
    const { api } = renderApp({ path: '/vitals' })
    await region('Historial')
    expect(api.dev.tickTelemetry).not.toHaveBeenCalled()
  })
})

describe('Autoevaluación', () => {
  it('formulario válido: muestra escalas, envía el contrato y confirma solo con HTTP 201', async () => {
    const { user, api } = renderApp({ path: '/check-in' })
    await region('Nueva autoevaluación · Ana Torres')
    expect(screen.getByText('1 = muy malo · 5 = muy bueno')).toBeInTheDocument()

    await fillScales(user)
    await user.type(screen.getByLabelText('Horas de sueño (opcional)'), '6.5')
    await user.type(screen.getByLabelText('Notas (opcional)'), 'Todo bien')
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))

    expect(api.submitCheckIn).toHaveBeenCalledWith({
      crewMemberId: ANA.id,
      mood: 4,
      stress: 2,
      fatigue: 3,
      sleepQuality: 4,
      sleepDuration: { value: 6.5, unit: 'h' },
      notes: 'Todo bien',
    })
    expect(await screen.findByText('Autoevaluación guardada en Onboard API')).toBeInTheDocument()
    expect(screen.getByText(/Respuesta HTTP 201/)).toBeInTheDocument()
    // El historial se actualiza tras el registro.
    const history = screen.getByRole('region', { name: 'Historial' })
    expect(await within(history).findByText('Todo bien')).toBeInTheDocument()
  })

  it('formulario inválido: errores por campo y ninguna llamada a la API', async () => {
    const { user, api } = renderApp({ path: '/check-in' })
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user, { 'Estado de ánimo': 3 })
    await user.type(screen.getByLabelText('Horas de sueño (opcional)'), '30')
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))

    expect(api.submitCheckIn).not.toHaveBeenCalled()
    expect(screen.getAllByText('Elige un valor de 1 a 5.')).toHaveLength(3)
    expect(screen.getByText('Indica las horas de sueño como un número entre 0 y 24.')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Estrés' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Horas de sueño (opcional)')).toBeInvalid()
  })

  it.each([
    [400, new ApiError({ status: 400, message: 'Validation Error', issues: [{ path: 'notes', code: 'too_big', message: 'Too big' }] }), 'Onboard API rechazó algunos datos', 'Las notas admiten como máximo 500 caracteres.'],
    [404, new ApiError({ status: 404, message: `Tripulante no encontrado: ${ANA.id}` }), 'Tripulante no encontrado', /Selecciona otro tripulante/],
    [409, new ApiError({ status: 409, message: `El tripulante ${ANA.id} no está activo` }), 'Tripulante no activo', /No admite nuevas autoevaluaciones/],
    [0, new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API' }), 'Sin conexión con Onboard API', /Tus respuestas se conservan/],
  ])('HTTP %i: mensaje comprensible y el formulario conserva los datos', async (_status, error, title, detail) => {
    const state = fixtures()
    state.submitResponse = { error }
    const { user } = renderApp({ path: '/check-in', state })
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    await user.type(screen.getByLabelText('Notas (opcional)'), 'Nota importante')
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))

    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.getByText(detail)).toBeInTheDocument()
    expect(screen.queryByText('Autoevaluación guardada en Onboard API')).not.toBeInTheDocument()
    // Conservación: las respuestas siguen ahí.
    expect(within(screen.getByRole('radiogroup', { name: 'Estado de ánimo' })).getByRole('radio', { name: /^4\b/ })).toBeChecked()
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('Nota importante')
  })

  it('solo confirma con 201: otra respuesta correcta se trata como inesperada', async () => {
    const state = fixtures()
    state.submitResponse = { status: 200, body: { data: null } }
    const { user } = renderApp({ path: '/check-in', state })
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))
    expect(await screen.findByText('Respuesta inesperada de Onboard API')).toBeInTheDocument()
    expect(screen.queryByText('Autoevaluación guardada en Onboard API')).not.toBeInTheDocument()
  })

  it('evita envíos duplicados mientras hay uno en curso', async () => {
    const state = fixtures()
    let release
    state.submitResponse = { wait: new Promise((r) => (release = r)), status: 201, body: { data: null } }
    const { user, api } = renderApp({ path: '/check-in', state })
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    const button = screen.getByRole('button', { name: 'Guardar autoevaluación' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Guardando…' }))
    expect(api.submitCheckIn).toHaveBeenCalledTimes(1)
    await act(async () => release())
  })

  it('distingue "guardada en Onboard API" de "recibida por Ground API"', async () => {
    const state = fixtures()
    state.link.state = 'disconnected'
    const { user } = renderApp({ path: '/check-in', state })
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))

    const receipt = (await screen.findByText('Autoevaluación guardada en Onboard API')).closest('[role="status"]')
    expect(within(receipt).getByText(/no significa que Tierra ya la tenga/)).toBeInTheDocument()
    expect(await within(receipt).findByText('Pendiente de envío')).toBeInTheDocument()
    expect(within(receipt).getByText(/se enviará automáticamente al reconectar/)).toBeInTheDocument()
    expect(within(receipt).queryByText('Recibido por Tierra')).not.toBeInTheDocument()
  })
})

describe('Sincronización', () => {
  it('muestra enlace simulado, latencia, contadores, reintentos, intentos y último error', async () => {
    const state = fixtures()
    state.link = { ...state.link, state: 'degraded', latencyMs: 200, degradedLatencyMs: 1500 }
    state.events.push(
      syncEvent({ status: 'pending' }),
      syncEvent({ sequence: 90, status: 'retry_scheduled', attempts: 2, nextRetryAt: '2026-11-14T10:05:00.000Z', lastError: { code: 'LINK_DEGRADED_LOSS', message: 'Transmisión perdida' }, updatedAt: '2026-11-14T10:04:00.000Z' }),
    )
    renderApp({ path: '/sync', state })

    const link = await region('Enlace nave–Tierra (simulado)')
    await waitFor(() => expect(within(link).getByText('Enlace simulado: degradado')).toBeInTheDocument())
    expect(within(link).getByText(/1700 ms \(200 base \+ 1500 por degradación\)/)).toBeInTheDocument()
    expect(within(link).getByText('En marcha (envío automático)')).toBeInTheDocument()

    const queue = screen.getByRole('region', { name: 'Cola de sincronización' })
    const card = (label) => within(queue).getByText(label, { selector: '[data-slot="card-title"]' }).closest('[data-slot="metric-card"]')
    expect(within(card('Pendientes')).getByText('1')).toBeInTheDocument()
    expect(within(card('Reintento programado')).getByText('1')).toBeInTheDocument()
    expect(within(card('Recibidos por Tierra (con acuse)')).getByText('2')).toBeInTheDocument()

    const lastError = within(queue).getByRole('heading', { name: 'Último error disponible' }).nextElementSibling
    expect(lastError).toHaveTextContent(/LINK_DEGRADED_LOSS — Transmisión perdida \(evento #90, intento 2 de 10/)
    const table = within(queue).getByRole('table')
    expect(within(table).getByText('2 / 10')).toBeInTheDocument()
    expect(within(table).getByText('2026-11-14 10:05:00 UTC')).toBeInTheDocument()
  })

  it('sondeo periódico del estado (sin solapes)', async () => {
    const { api } = renderApp({ path: '/sync', pollIntervalMs: 40 })
    await waitFor(() => expect(api.getSyncStatus.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 })
  })

  it('error de Onboard API: mensaje y reintento', async () => {
    const api = createFakeOnboardApi()
    api.getSyncStatus.mockRejectedValueOnce(new ApiError({ status: 503, message: 'La API respondió con HTTP 503' }))
    const { user } = renderApp({ path: '/sync', api })
    expect(await screen.findByText('La API respondió con HTTP 503')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect((await screen.findAllByText('Enlace simulado: conectado', {}, { timeout: 2000 })).length).toBeGreaterThan(0)
    expect(screen.queryByText('La API respondió con HTTP 503')).not.toBeInTheDocument()
  })
})

describe('Simulación (desarrollo)', () => {
  it('cambia el enlace, inyecta fallos, genera telemetría y fuerza el envío mostrando el resultado real', async () => {
    const { user, api } = renderApp({ path: '/simulation' })
    await region('Estado del enlace')

    await user.click(screen.getByRole('button', { name: 'Desconectado' }))
    expect(api.dev.updateLink).toHaveBeenCalledWith({ state: 'disconnected' })
    expect(await screen.findByText('Cambiar enlace a desconectado: completado')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Número de fallos (1–100)'))
    await user.type(screen.getByLabelText('Número de fallos (1–100)'), '3')
    await user.click(screen.getByRole('button', { name: 'Simular fallos' }))
    expect(api.dev.injectFailures).toHaveBeenCalledWith(3)
    expect(await screen.findByText('Fallos transitorios pendientes de aplicar: 3.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generar una medición simulada' }))
    expect(await screen.findByText(/Se generaron 2 lecturas simuladas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forzar envío de pendientes' }))
    expect(await screen.findByText(/Envío omitido: el enlace simulado está desconectado/)).toBeInTheDocument()
  })

  it('latencia: envía solo los campos rellenados y deshabilita los controles mientras opera', async () => {
    const api = createFakeOnboardApi()
    let release
    api.dev.updateLink.mockImplementationOnce(async (changes) => {
      await new Promise((r) => (release = r))
      return { data: { state: 'connected', latencyMs: changes.latencyMs, degradedLatencyMs: 1500, degradedFailureRate: 0.3, pendingFailures: 0 } }
    })
    const { user } = renderApp({ path: '/simulation', api })
    await region('Latencia y pérdidas')
    await user.type(screen.getByLabelText('Latencia base (ms)'), '250')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(api.dev.updateLink).toHaveBeenCalledWith({ latencyMs: 250 })
    expect(screen.getByRole('button', { name: 'Desconectado' })).toBeDisabled()
    await act(async () => release())
    expect(await screen.findByText(/latencia base 250 ms/)).toBeInTheDocument()
  })

  it('muestra los errores reales de la API (400 por campo)', async () => {
    const api = createFakeOnboardApi()
    api.dev.injectFailures.mockRejectedValueOnce(
      new ApiError({ status: 400, message: 'Validation Error', issues: [{ path: 'count', code: 'too_big', message: 'Too big: expected number to be <=100' }] }),
    )
    const { user } = renderApp({ path: '/simulation', api })
    await region('Fallos transitorios')
    await user.clear(screen.getByLabelText('Número de fallos (1–100)'))
    await user.type(screen.getByLabelText('Número de fallos (1–100)'), '500')
    await user.click(screen.getByRole('button', { name: 'Simular fallos' }))
    expect(await screen.findByText('Inyectar fallos transitorios: error')).toBeInTheDocument()
    expect(screen.getByText('Too big: expected number to be <=100')).toBeInTheDocument()
  })
})

describe('Cámara', () => {
  it('informa de privacidad y carácter experimental, y no pide permiso hasta pulsar «Activar cámara»', async () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    renderApp({ path: '/camera' })
    expect(await screen.findByText('Privacidad: el vídeo no sale de este dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Métricas experimentales, no diagnósticas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activar cámara/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Enviar métricas agregadas/ })).not.toBeChecked()
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})

describe('Accesibilidad', () => {
  it('formulario: grupos con leyenda, escalas navegables y campos etiquetados', async () => {
    const { user } = renderApp({ path: '/check-in' })
    await region('Nueva autoevaluación · Ana Torres')
    const mood = screen.getByRole('radiogroup', { name: 'Estado de ánimo' })
    expect(within(mood).getAllByRole('radio')).toHaveLength(5)
    expect(within(mood).getByRole('radio', { name: '1 (muy malo)' })).toBeInTheDocument()
    expect(within(mood).getByRole('radio', { name: '5 (muy bueno)' })).toBeInTheDocument()

    await user.click(within(mood).getByRole('radio', { name: '1 (muy malo)' }))
    await user.keyboard('{ArrowRight}')
    expect(within(mood).getByRole('radio', { name: '2' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Guardar autoevaluación' })).toBeEnabled()
  })
})

describe('Flujo crítico: desconexión y reconexión', () => {
  it('guardada a bordo → pendiente con el enlace caído → recibida por Ground API al reconectar', async () => {
    const state = fixtures()
    const { user, api } = renderApp({ path: '/simulation', state, pollIntervalMs: 50 })

    // 1-2. Tripulante seleccionado (persistido) y enlace desconectado.
    await region('Estado del enlace')
    await user.click(screen.getByRole('button', { name: 'Desconectado' }))
    await waitFor(() => expect(screen.getAllByText('Enlace simulado: desconectado').length).toBeGreaterThan(0))

    // 3-4. Registrar la autoevaluación: Onboard API la guarda (201).
    await user.click(screen.getByRole('link', { name: 'Autoevaluación' }))
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    await user.type(screen.getByLabelText('Notas (opcional)'), 'Flujo crítico')
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))
    const receipt = (await screen.findByText('Autoevaluación guardada en Onboard API')).closest('[role="status"]')

    // 5. Queda pendiente de sincronización.
    expect(await within(receipt).findByText('Pendiente de envío')).toBeInTheDocument()
    const created = state.checkIns[0]
    expect(state.events.find((e) => e.entityId === created.id).status).toBe('pending')

    // 7-9. Reconectar: la nave entrega y el estado cambia sin intervención.
    await act(() => api.dev.updateLink({ state: 'connected' }))
    expect(await within(receipt).findByText('Recibido por Tierra', {}, { timeout: 2000 })).toBeInTheDocument()
    // La confirmación cita su evidencia: una instantánea de la cola sin eventos sin acuse.
    expect(within(receipt).getByText(/la cola de la nave no tenía ningún evento sin acuse/)).toBeInTheDocument()
  }, 15_000) // flujo completo de varias pantallas: con el equipo cargado puede superar 5 s
})

describe('Acuses de sincronización: solo con evidencia verificable', () => {
  async function submitCheckIn(user) {
    await region('Nueva autoevaluación · Ana Torres')
    await fillScales(user)
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))
    return (await screen.findByText('Autoevaluación guardada en Onboard API')).closest('[role="status"]')
  }

  it('entregada pero con otros eventos sin acuse en la cola: "Sin confirmación verificable"', async () => {
    const state = fixtures()
    // Un evento ajeno sigue con reintento programado: la cola no está vacía.
    state.events.push(syncEvent({ status: 'retry_scheduled', attempts: 1, nextRetryAt: '2026-11-14T10:05:00.000Z', lastError: { code: 'TRANSIENT_FAILURE', message: 'x' } }))
    const { user } = renderApp({ path: '/check-in', state })
    const receipt = await submitCheckIn(user)

    expect(await within(receipt).findByText('Sin confirmación verificable')).toBeInTheDocument()
    expect(within(receipt).getByText(/la recepción todavía no se puede verificar/)).toBeInTheDocument()
    expect(within(receipt).queryByText('Recibido por Tierra')).not.toBeInTheDocument()
    // El evento propio sí está entregado en el doble de la API: la interfaz no lo afirma sin prueba.
    expect(state.events.find((e) => e.entityId === state.checkIns[0].id).status).toBe('acknowledged')
  })

  it('consulta truncada (500 pendientes): no se infiere nada por ausencia', async () => {
    const state = fixtures()
    state.link.state = 'disconnected'
    // 500 pendientes ajenos más antiguos: la lista devuelta (límite 500) no incluye el nuevo.
    for (let i = 0; i < 500; i++) state.events.push(syncEvent({ status: 'pending' }))
    const { user } = renderApp({ path: '/check-in', state })
    const receipt = await submitCheckIn(user)

    expect(await within(receipt).findByText('Sin confirmación verificable')).toBeInTheDocument()
    expect(within(receipt).getByText(/la consulta disponible puede estar incompleta \(más de 500 eventos\)/)).toBeInTheDocument()
  })

  it('el historial también exige evidencia: con la cola vacía muestra "Recibido por Tierra"', async () => {
    const state = fixtures()
    // La evidencia llega con una instantánea posterior al historial (siguiente sondeo).
    const { user } = renderApp({ path: '/check-in', state, pollIntervalMs: 50 })
    await submitCheckIn(user)
    const history = screen.getByRole('region', { name: 'Historial' })
    expect(await within(history).findByText('Recibido por Tierra')).toBeInTheDocument()
  })
})

describe('Datos potencialmente obsoletos y accesibilidad de estados', () => {
  it('si Onboard API deja de responder tras haber respondido, avisa de posible desactualización', async () => {
    const api = createFakeOnboardApi()
    const { user } = renderApp({ path: '/sync', api })
    await screen.findAllByText('Enlace simulado: conectado')
    api.getSyncStatus.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API' }))
    await user.click(screen.getByRole('button', { name: 'Actualizar ahora' }))

    expect(await screen.findByText('Sin respuesta de Onboard API')).toBeInTheDocument()
    expect(screen.getByText(/Los datos mostrados pueden estar desactualizados\. Última respuesta: .* UTC/)).toBeInTheDocument()
  })

  it('el estado del enlace del encabezado se anuncia (y solo ese)', async () => {
    renderApp({ path: '/sync' })
    await screen.findAllByText('Enlace simulado: conectado')
    const live = screen.getByRole('banner').querySelectorAll('[role="status"][aria-live="polite"]')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent('Enlace simulado: conectado')
    expect(screen.getByRole('main').querySelectorAll('[data-slot="status-indicator"][role="status"]')).toHaveLength(0)
  })

  it('las escalas son grupos de radio obligatorios y marcan el error de forma accesible', async () => {
    const { user } = renderApp({ path: '/check-in' })
    await region('Nueva autoevaluación · Ana Torres')
    const mood = screen.getByRole('radiogroup', { name: 'Estado de ánimo' })
    expect(mood).toHaveAttribute('aria-required', 'true')
    await user.click(screen.getByRole('button', { name: 'Guardar autoevaluación' }))
    expect(mood).toHaveAttribute('aria-invalid', 'true')
    expect(mood).toHaveAccessibleDescription(/1 = muy malo · 5 = muy bueno Elige un valor de 1 a 5\./)
  })
})
