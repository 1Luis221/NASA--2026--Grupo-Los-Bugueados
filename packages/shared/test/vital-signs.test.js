import { describe, it } from 'vitest'
import { exampleVitalSigns } from '../src/examples.js'
import { VitalSignsSchema } from '../src/schemas/vital-signs.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

describe('VitalSignsSchema', () => {
  it('acepta el ejemplo documentado', () => {
    expectValid(VitalSignsSchema, exampleVitalSigns)
  })

  it('acepta una lectura real (no simulada) con una sola medición', () => {
    const { id, crewMemberId, recordedAt } = exampleVitalSigns
    expectValid(VitalSignsSchema, {
      id,
      crewMemberId,
      recordedAt,
      source: { type: 'sensor', simulated: false },
      heartRate: { value: 61, unit: 'bpm' },
    })
  })

  it('rechaza una lectura sin mediciones', () => {
    const { id, crewMemberId, recordedAt, source } = exampleVitalSigns
    expectInvalid(VitalSignsSchema, { id, crewMemberId, recordedAt, source }, [])
  })

  it('rechaza origen distinto de sensor', () => {
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => { v.source.type = 'camera' }), ['source', 'type'])
  })

  it.each([
    ['heartRate', { value: 500, unit: 'bpm' }],
    ['oxygenSaturation', { value: 101, unit: '%' }],
    ['bodyTemperature', { value: 98.6, unit: 'degC' }], // Fahrenheit enviado como Celsius
    ['respiratoryRate', { value: -1, unit: 'breaths/min' }],
  ])('rechaza %s fuera de dominio físico', (key, measurement) => {
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => { v[key] = measurement }), [key, 'value'])
  })

  it('rechaza unidades incorrectas', () => {
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => { v.bodyTemperature.unit = 'degF' }), ['bodyTemperature', 'unit'])
  })

  it('rechaza sistólica no mayor que diastólica', () => {
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => {
      v.bloodPressure = { systolic: 70, diastolic: 80, unit: 'mmHg' }
    }), ['bloodPressure', 'systolic'])
  })

  it('acepta valores atípicos pero físicamente posibles (sin umbrales clínicos)', () => {
    expectValid(VitalSignsSchema, variant(exampleVitalSigns, (v) => {
      v.heartRate.value = 185
      v.oxygenSaturation.value = 85
    }))
  })
})

describe('VitalSignsSchema · actividad y HRV', () => {
  it('actividad en MET (0–25) como única medición válida; unidad obligatoria', () => {
    expectValid(VitalSignsSchema, { ...structuredClone(exampleVitalSigns), activityLevel: { value: 2.5, unit: 'MET' } })
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => { v.activityLevel = { value: 2.5, unit: 'kcal' } }), ['activityLevel', 'unit'])
    expectInvalid(VitalSignsSchema, variant(exampleVitalSigns, (v) => { v.activityLevel = { value: 40, unit: 'MET' } }), ['activityLevel', 'value'])
    const { id, crewMemberId, recordedAt, source } = exampleVitalSigns
    expectValid(VitalSignsSchema, { id, crewMemberId, recordedAt, source, activityLevel: { value: 1, unit: 'MET' } })
  })
})
