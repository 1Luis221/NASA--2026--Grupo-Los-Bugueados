import { describe, expect, it } from 'vitest'
import { VITAL_SIGNS_PLAUSIBILITY, VitalSignsStrictSchema } from '@astronaut-wellness/shared'
import { CREW_ROSTER } from '../src/data/crew-roster.js'
import { createRandom } from '../src/lib/runtime.js'
import { createTelemetrySimulator } from '../src/simulator/telemetry-simulator.js'
import { createManualClock, createTestContext } from './helpers.js'

function generateSeries(seed, rounds) {
  let n = 0
  const simulator = createTelemetrySimulator({
    rng: createRandom(seed),
    clock: createManualClock(),
    generateId: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
  })
  return Array.from({ length: rounds }, () => simulator.generate(CREW_ROSTER)).flat()
}

describe('simulador de telemetría', () => {
  it('genera lecturas válidas en modo estricto y marcadas como simuladas', () => {
    for (const reading of generateSeries(42, 50)) {
      expect(VitalSignsStrictSchema.safeParse(reading).success).toBe(true)
      expect(reading.source).toMatchObject({ type: 'sensor', simulated: true })
      expect(reading.source.deviceId).toMatch(/^sim-wearable-\d{2}$/)
    }
  })

  it('es determinista: misma semilla, mismas lecturas', () => {
    expect(generateSeries(42, 10)).toEqual(generateSeries(42, 10))
    expect(generateSeries(42, 10)).not.toEqual(generateSeries(43, 10))
  })

  it('se mantiene dentro de los límites de plausibilidad del contrato', () => {
    const P = VITAL_SIGNS_PLAUSIBILITY
    for (const r of generateSeries(3, 200)) {
      expect(r.heartRate.value).toBeGreaterThanOrEqual(P.heartRate.min)
      expect(r.heartRate.value).toBeLessThanOrEqual(P.heartRate.max)
      expect(r.bloodPressure.systolic).toBeGreaterThan(r.bloodPressure.diastolic)
    }
  })

  it('una lectura por tripulante activo, guardada y encolada para tierra', () => {
    const { ctx } = createTestContext()
    const before = ctx.queue.stats().total
    const readings = ctx.services.telemetryService.tick()

    expect(readings).toHaveLength(CREW_ROSTER.length)
    expect(ctx.stores.vitals.size()).toBe(CREW_ROSTER.length)
    const events = ctx.queue.list().slice(before)
    expect(events.map((e) => e.entityType)).toEqual(['vital_signs', 'vital_signs', 'vital_signs'])
    expect(events.map((e) => e.entityId)).toEqual(readings.map((r) => r.id))
  })
})
