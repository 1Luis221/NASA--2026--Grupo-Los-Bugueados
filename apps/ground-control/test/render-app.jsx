import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import App from '../src/App.jsx'
import { RealtimeProvider } from '../src/realtime/RealtimeProvider.jsx'
import { alert, createFakeSocket, list, vital } from './helpers.js'

export const ANA_ID = '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d'
export const UNKNOWN_ID = 'c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a'

const ana = {
  id: ANA_ID,
  name: 'Ana Torres',
  callsign: 'Nova',
  role: 'commander',
  agency: 'ESA',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const checkIn = (overrides) => ({
  id: crypto.randomUUID(),
  crewMemberId: ANA_ID,
  recordedAt: '2026-11-14T07:30:00.000Z',
  source: { type: 'self_report', simulated: false },
  mood: 4,
  stress: 2,
  fatigue: 3,
  sleepQuality: 3,
  sleepDuration: { value: 6.5, unit: 'h' },
  ...overrides,
})

/** Datos que Ground API devolvería (más recientes primero, como la API real). */
export function fixtures() {
  return {
    crew: [ana],
    vitals: [
      vital({ crewMemberId: ANA_ID, recordedAt: '2026-11-14T10:00:05.000Z', heartRate: { value: 76, unit: 'bpm' }, oxygenSaturation: { value: 97, unit: '%' } }),
      vital({ crewMemberId: UNKNOWN_ID, recordedAt: '2026-11-14T10:00:03.000Z', heartRate: { value: 65, unit: 'bpm' } }),
      vital({ crewMemberId: ANA_ID, recordedAt: '2026-11-14T10:00:00.000Z', heartRate: { value: 70, unit: 'bpm' }, oxygenSaturation: { value: 98, unit: '%' } }),
    ],
    checkIns: [
      checkIn({ recordedAt: '2026-11-14T09:00:00.000Z', mood: 2, notes: 'Dolor de cabeza leve' }),
      checkIn({ recordedAt: '2026-11-14T08:00:00.000Z', mood: 3 }),
      checkIn({ recordedAt: '2026-11-14T07:00:00.000Z', mood: 4, sleepDuration: undefined }),
    ],
    camera: [],
    vigilanceTests: [],
    alerts: [
      alert({ title: 'Enlace nave–Tierra interrumpido', status: 'active', severity: 'warning', createdAt: '2026-11-14T10:01:00.000Z', updatedAt: '2026-11-14T10:01:00.000Z' }),
      alert({
        crewMemberId: ANA_ID,
        category: 'wellness',
        severity: 'info',
        title: 'Autoevaluación pendiente',
        status: 'resolved',
        createdAt: '2026-11-14T06:00:00.000Z',
        updatedAt: '2026-11-14T06:30:00.000Z',
        resolvedAt: '2026-11-14T06:30:00.000Z',
      }),
    ],
    stats: {
      accepted: 42,
      duplicate: 1,
      rejected: 1,
      processedEvents: 42,
      lastSequenceByOrigin: { onboard: 44 },
      recentRejections: [
        { eventId: crypto.randomUUID(), sequence: 7, origin: 'onboard', code: 'INVALID_EVENT', message: 'payload.heartRate.value: Too big', receivedAt: '2026-11-14T09:59:00.000Z' },
      ],
    },
    syncEvents: [
      { eventId: crypto.randomUUID(), sequence: 44, origin: 'onboard', entityType: 'vital_signs', entityId: crypto.randomUUID(), operation: 'create', receivedAt: '2026-11-14T10:00:06.000Z' },
    ],
  }
}

export const emptyFixtures = () => ({
  crew: [],
  vitals: [],
  checkIns: [],
  camera: [],
  vigilanceTests: [],
  alerts: [],
  stats: { accepted: 0, duplicate: 0, rejected: 0, processedEvents: 0, lastSequenceByOrigin: {}, recentRejections: [] },
  syncEvents: [],
})

/** API simulada que filtra como Ground API. `data` se puede mutar durante la prueba. */
export function createFakeGroundApi(data) {
  const byCrew = (records, crewMemberId) => records.filter((r) => !crewMemberId || r.crewMemberId === crewMemberId)
  const limited = (records, limit) => (limit ? records.slice(0, limit) : records)
  return {
    listCrew: vi.fn(async () => list(data.crew)),
    getCrewMember: vi.fn(async (id) => ({ data: data.crew.find((c) => c.id === id) })),
    listVitals: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(data.vitals, crewMemberId), limit))),
    listCheckIns: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(data.checkIns, crewMemberId), limit))),
    listCameraMetrics: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(data.camera, crewMemberId), limit))),
    listVigilanceTests: vi.fn(async ({ crewMemberId, limit } = {}) => list(limited(byCrew(data.vigilanceTests ?? [], crewMemberId), limit))),
    listAlerts: vi.fn(async ({ status, severity, limit } = {}) =>
      list(limited(data.alerts.filter((a) => (!status || a.status === status) && (!severity || a.severity === severity)), limit)),
    ),
    getSyncStats: vi.fn(async () => ({ data: data.stats })),
    listSyncEvents: vi.fn(async ({ limit } = {}) => list(limited(data.syncEvents, limit))),
  }
}

/** Monta Ground Control completo (proveedor + router) con socket y API simulados. */
export function renderApp({ path = '/', data = fixtures(), api } = {}) {
  const socket = createFakeSocket()
  const groundApi = api ?? createFakeGroundApi(data)
  const user = userEvent.setup()
  const utils = render(
    <RealtimeProvider socketFactory={() => socket} api={groundApi}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </RealtimeProvider>,
  )
  return { ...utils, socket, api: groundApi, data, user }
}
