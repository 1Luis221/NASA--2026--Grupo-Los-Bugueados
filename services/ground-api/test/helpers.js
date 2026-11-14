import { vi } from 'vitest'
import {
  exampleAlert,
  exampleCameraMetrics,
  exampleCrewMember,
  exampleVitalSigns,
  exampleWellnessCheckIn,
} from '@astronaut-wellness/shared/examples'
import { loadConfig } from '../src/config.js'
import { createGroundContext } from '../src/context.js'
import { silentLogger } from '../src/lib/runtime.js'

export const NOW = '2026-11-14T12:00:00.000Z'
export const fixedClock = Object.freeze({ now: () => new Date(NOW) })

const EXAMPLES = {
  crew_member: exampleCrewMember,
  vital_signs: exampleVitalSigns,
  wellness_check_in: exampleWellnessCheckIn,
  camera_metrics: exampleCameraMetrics,
  alert: exampleAlert,
}

let sequence = 0

/**
 * SyncEvent tal como lo envía la nave (estado `sending`), con UUID nuevo.
 * `payload` permite sobrescribir campos de la entidad de ejemplo.
 */
export function makeEvent({ entityType = 'vital_signs', operation = 'create', payload = {}, ...overrides } = {}) {
  const entity = { ...structuredClone(EXAMPLES[entityType]), id: crypto.randomUUID(), ...payload }
  return {
    id: crypto.randomUUID(),
    sequence: sequence++,
    origin: 'onboard',
    destination: 'ground',
    entityType,
    entityId: entity.id,
    operation,
    payload: entity,
    status: 'sending',
    attempts: 1,
    maxAttempts: 10,
    lastAttemptAt: '2026-11-14T10:00:30.000Z',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:30.000Z',
    ...overrides,
  }
}

/** Contexto de tierra aislado con notificador espía. */
export function createTestContext() {
  const notifier = { publish: vi.fn() }
  const ctx = createGroundContext({
    config: loadConfig({ NODE_ENV: 'test' }),
    clock: fixedClock,
    logger: silentLogger,
    notifier,
  })
  return { ctx, notifier }
}
