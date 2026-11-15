import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { SYNC_STATUSES } from '@astronaut-wellness/shared'
import App from '../src/App.jsx'
import { AppProviders, SELECTED_CREW_STORAGE_KEY } from '../src/state/AppProviders.jsx'

export const ANA = {
  id: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d',
  name: 'Ana Torres',
  callsign: 'Nova',
  role: 'commander',
  agency: 'ESA',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}
export const KENJI = { ...ANA, id: '2b9e4d6f-8a1c-4e3b-a5d7-9f0e1c2b3a4d', name: 'Kenji Watanabe', callsign: 'Orbit', role: 'flight_engineer', agency: 'JAXA' }

const list = (data) => ({ data, count: data.length })

export function vital(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    crewMemberId: ANA.id,
    recordedAt: '2026-11-14T10:00:00.000Z',
    source: { type: 'sensor', simulated: true, deviceId: 'sim-wearable-01' },
    heartRate: { value: 72, unit: 'bpm' },
    respiratoryRate: { value: 14, unit: 'breaths/min' },
    oxygenSaturation: { value: 98, unit: '%' },
    bodyTemperature: { value: 36.7, unit: 'degC' },
    bloodPressure: { systolic: 118, diastolic: 76, unit: 'mmHg' },
    heartRateVariability: { value: 45, unit: 'ms' },
    ...overrides,
  }
}

let sequence = 0
export function syncEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    sequence: sequence++,
    origin: 'onboard',
    destination: 'ground',
    entityType: 'vital_signs',
    entityId: crypto.randomUUID(),
    operation: 'create',
    status: 'pending',
    attempts: 0,
    maxAttempts: 10,
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  }
}

/** Estado simulado de Onboard API. */
export function fixtures() {
  return {
    crew: [ANA, KENJI],
    vitals: [
      vital({ recordedAt: '2026-11-14T10:00:05.000Z', heartRate: { value: 76, unit: 'bpm' } }),
      vital({ recordedAt: '2026-11-14T10:00:00.000Z', heartRate: { value: 70, unit: 'bpm' } }),
    ],
    checkIns: [],
    cameraMetrics: [],
    vigilanceTests: [],
    alerts: [],
    link: { state: 'connected', latencyMs: 0, degradedLatencyMs: 1500, degradedFailureRate: 0.3, pendingFailures: 0, changedAt: '2026-11-14T09:00:00.000Z' },
    events: [syncEvent({ status: 'acknowledged' }), syncEvent({ status: 'acknowledged' })],
    submitResponse: null, // { error } o { status, body } para forzar respuestas
  }
}

/**
 * Doble de Onboard API con estado: una autoevaluación con el enlace caído
 * queda `pending`; al reconectar, los pendientes pasan a `acknowledged`
 * (como haría el despachador real). Las colas se filtran por estado.
 */
export function createFakeOnboardApi(state = fixtures()) {
  const byCrew = (records, crewMemberId) => records.filter((r) => !crewMemberId || r.crewMemberId === crewMemberId)
  const limited = (records, limit) => (limit ? records.slice(0, limit) : records)
  const deliverPending = () => {
    if (state.link.state === 'disconnected') return
    for (const e of state.events) if (e.status === 'pending') Object.assign(e, { status: 'acknowledged', attempts: e.attempts + 1 })
  }

  return {
    listCrew: vi.fn(async () => list(state.crew)),
    listVitals: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(state.vitals, crewMemberId), limit))),
    listCheckIns: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(state.checkIns, crewMemberId), limit))),
    listAlerts: vi.fn(async ({ limit } = {}) => list(limited(state.alerts, limit))),
    submitCheckIn: vi.fn(async (body) => {
      const forced = state.submitResponse
      if (forced) {
        state.submitResponse = null
        if (forced.wait) await forced.wait
        if (forced.error) throw forced.error
        if (forced.status) return forced
      }
      const checkIn = { ...body, id: crypto.randomUUID(), recordedAt: new Date().toISOString(), source: { type: 'self_report', simulated: false } }
      state.checkIns.unshift(checkIn)
      state.events.push(syncEvent({ entityType: 'wellness_check_in', entityId: checkIn.id, status: 'pending' }))
      deliverPending()
      return { status: 201, body: { data: checkIn } }
    }),
    listCameraMetrics: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(state.cameraMetrics ?? [], crewMemberId), limit))),
    submitCameraMetrics: vi.fn(async (body) => {
      const record = { ...body, id: crypto.randomUUID(), recordedAt: new Date().toISOString(), source: { type: 'camera', simulated: false, deviceId: 'onboard-browser-camera' } }
      ;(state.cameraMetrics ??= []).unshift(record)
      state.events.push(syncEvent({ entityType: 'camera_metrics', entityId: record.id, status: 'pending' }))
      deliverPending()
      return { status: 201, body: { data: record } }
    }),
    listVigilanceTests: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(state.vigilanceTests ?? [], crewMemberId), limit))),
    submitVigilanceTest: vi.fn(async (body) => {
      const record = { ...body, id: crypto.randomUUID(), recordedAt: new Date().toISOString(), source: { type: 'cognitive_test', simulated: false, deviceId: 'onboard-ui' } }
      ;(state.vigilanceTests ??= []).unshift(record)
      state.events.push(syncEvent({ entityType: 'vigilance_test', entityId: record.id, status: 'pending' }))
      deliverPending()
      return { status: 201, body: { data: record } }
    }),
    getSyncStatus: vi.fn(async () => {
      const byStatus = Object.fromEntries(SYNC_STATUSES.map((s) => [s, state.events.filter((e) => e.status === s).length]))
      return { data: { link: { ...state.link }, queue: { total: state.events.length, byStatus, lastSequence: sequence - 1 }, dispatcherRunning: true } }
    }),
    // Igual que Onboard API: orden ascendente por secuencia y recorte a `limit` desde el principio.
    listSyncEvents: vi.fn(async ({ status, limit = 50 } = {}) =>
      list(state.events.filter((e) => !status || e.status === status).sort((a, b) => a.sequence - b.sequence).slice(0, limit)),
    ),
    dev: {
      getLink: vi.fn(async () => ({ data: { ...state.link } })),
      updateLink: vi.fn(async (changes) => {
        Object.assign(state.link, changes, changes.state ? { changedAt: new Date().toISOString() } : {})
        deliverPending()
        return { data: { ...state.link } }
      }),
      injectFailures: vi.fn(async (count) => {
        state.link.pendingFailures += count
        return { data: { ...state.link } }
      }),
      tickTelemetry: vi.fn(async () => {
        const readings = state.crew.map((c) => vital({ crewMemberId: c.id, recordedAt: new Date().toISOString() }))
        state.vitals.unshift(...readings)
        return { data: readings, count: readings.length }
      }),
      flushSync: vi.fn(async () => {
        const pending = state.events.filter((e) => e.status === 'pending').length
        if (state.link.state === 'disconnected') return { data: { skipped: true, sent: 0, accepted: 0, duplicate: 0, rejected: 0, retry: 0, failed: 0 } }
        deliverPending()
        return { data: { skipped: false, sent: pending, accepted: pending, duplicate: 0, rejected: 0, retry: 0, failed: 0 } }
      }),
    },
  }
}

/** Almacenamiento en memoria con la interfaz de localStorage. */
export function createMemoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key) => (items.has(key) ? items.get(key) : null)),
    setItem: vi.fn((key, value) => items.set(key, String(value))),
    removeItem: vi.fn((key) => items.delete(key)),
    snapshot: () => Object.fromEntries(items),
  }
}

export const storageWithCrew = (id = ANA.id) => createMemoryStorage({ [SELECTED_CREW_STORAGE_KEY]: id })

/** Monta Onboard completo con API y almacenamiento simulados. */
export function renderApp({ path = '/', state = fixtures(), api, storage = storageWithCrew(), devTools = true, pollIntervalMs = 60_000 } = {}) {
  const onboardApi = api ?? createFakeOnboardApi(state)
  const user = userEvent.setup()
  const utils = render(
    <AppProviders api={onboardApi} storage={storage} devTools={devTools} pollIntervalMs={pollIntervalMs}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  )
  return { ...utils, api: onboardApi, state, storage, user }
}
