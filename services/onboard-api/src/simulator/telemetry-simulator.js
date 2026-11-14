import { UNITS, VitalSignsStrictSchema } from '@astronaut-wellness/shared'

/**
 * Bandas del GENERADOR: acotan el paseo aleatorio para producir datos
 * verosímiles en la demo. No son rangos de normalidad ni umbrales clínicos,
 * y ningún módulo los usa para evaluar a la tripulación.
 */
const GENERATOR_BANDS = Object.freeze({
  heartRate: { min: 55, max: 110, step: 3, decimals: 0 },
  respiratoryRate: { min: 10, max: 22, step: 1, decimals: 0 },
  oxygenSaturation: { min: 94, max: 100, step: 1, decimals: 0 },
  bodyTemperature: { min: 36, max: 37.5, step: 0.1, decimals: 1 },
  systolic: { min: 100, max: 140, step: 3, decimals: 0 },
  diastolic: { min: 60, max: 90, step: 2, decimals: 0 },
  heartRateVariability: { min: 20, max: 90, step: 4, decimals: 0 },
})

const round = (value, decimals) => Number(value.toFixed(decimals))
const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value))

/**
 * Simulador determinista de constantes vitales: con la misma semilla (`rng`)
 * y el mismo reloj produce exactamente las mismas lecturas. Todas las lecturas
 * se marcan como `source: { type: 'sensor', simulated: true }`.
 */
export function createTelemetrySimulator({ rng, clock, generateId }) {
  const current = new Map() // crewMemberId → últimos valores

  const between = ({ min, max }) => min + rng() * (max - min)

  function initialValues() {
    return Object.fromEntries(Object.entries(GENERATOR_BANDS).map(([key, band]) => [key, between(band)]))
  }

  function step(values) {
    return Object.fromEntries(
      Object.entries(GENERATOR_BANDS).map(([key, band]) => [
        key,
        clamp(values[key] + (rng() * 2 - 1) * band.step, band),
      ]),
    )
  }

  function readingFor(crewMember, index) {
    const previous = current.get(crewMember.id)
    const values = previous ? step(previous) : initialValues()
    current.set(crewMember.id, values)
    const v = (key) => round(values[key], GENERATOR_BANDS[key].decimals)

    return VitalSignsStrictSchema.parse({
      id: generateId(),
      crewMemberId: crewMember.id,
      recordedAt: clock.now().toISOString(),
      source: { type: 'sensor', simulated: true, deviceId: `sim-wearable-${String(index + 1).padStart(2, '0')}` },
      heartRate: { value: v('heartRate'), unit: UNITS.BPM },
      respiratoryRate: { value: v('respiratoryRate'), unit: UNITS.BREATHS_PER_MIN },
      oxygenSaturation: { value: v('oxygenSaturation'), unit: UNITS.PERCENT },
      bodyTemperature: { value: v('bodyTemperature'), unit: UNITS.CELSIUS },
      bloodPressure: { systolic: v('systolic'), diastolic: v('diastolic'), unit: UNITS.MMHG },
      heartRateVariability: { value: v('heartRateVariability'), unit: UNITS.MILLISECONDS },
    })
  }

  return {
    /** Una lectura simulada por cada tripulante recibido. */
    generate: (crewMembers) => crewMembers.map(readingFor),
  }
}

export { GENERATOR_BANDS }
