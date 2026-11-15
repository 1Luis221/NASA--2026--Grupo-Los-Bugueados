import { describe, expect, it } from 'vitest'
import { exampleVitalSigns } from '@astronaut-wellness/shared/examples'
import { UNKNOWN_CREW_LABEL, collectCrew, resolveCrewMember, shortId } from '../src/lib/crew.js'
import {
  MISSING_TEXT,
  describeSource,
  formatBloodPressure,
  formatLocal,
  formatMeasurement,
  formatNumber,
  formatRelative,
  formatUtc,
  formatVitalSign,
  isMissing,
} from '../src/lib/format.js'

describe('fechas', () => {
  const iso = '2026-11-14T10:05:09.000Z'

  it('formatUtc muestra la referencia UTC explícita', () => {
    expect(formatUtc(iso)).toBe('2026-11-14 10:05:09 UTC')
    expect(formatUtc(iso, { seconds: false })).toBe('2026-11-14 10:05 UTC')
  })

  it('formatLocal muestra la hora local con su desplazamiento horario', () => {
    expect(formatLocal(iso, { timeZone: 'Europe/Madrid' })).toMatch(/14\/11\/2026,? 11:05:09 \(?GMT\+1\)?/)
    expect(formatLocal(iso, { timeZone: 'America/Mexico_City' })).toMatch(/04:05:09 \(?GMT-6\)?/)
  })

  it('formatRelative expresa la antigüedad', () => {
    const now = new Date('2026-11-14T10:06:09.000Z')
    expect(formatRelative(iso, { now })).toMatch(/hace 1 min/)
    expect(formatRelative('2026-11-14T10:06:04.000Z', { now })).toMatch(/hace 5 s/)
  })

  it.each([null, undefined, '', 'no-es-fecha'])('fecha ausente o inválida (%j) → "—"', (value) => {
    expect(formatUtc(value)).toBe(MISSING_TEXT)
    expect(formatLocal(value)).toBe(MISSING_TEXT)
    expect(formatRelative(value)).toBe(MISSING_TEXT)
  })
})

describe('valores y unidades', () => {
  it('distingue ausencia de cero', () => {
    expect(isMissing(0)).toBe(false)
    expect(isMissing(null)).toBe(true)
    expect(isMissing(Number.NaN)).toBe(true)
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(undefined)).toBe(MISSING_TEXT)
  })

  it('formatea mediciones del contrato con su unidad visible', () => {
    expect(formatMeasurement({ value: 72, unit: 'bpm' })).toBe('72 lpm')
    expect(formatMeasurement({ value: 14, unit: 'breaths/min' })).toBe('14 rpm')
    expect(formatMeasurement({ value: 98, unit: '%' })).toBe('98%')
    expect(formatMeasurement({ value: 36.7, unit: 'degC' })).toBe('36,7 °C')
    expect(formatMeasurement({ value: 0, unit: 'count' })).toBe('0')
    expect(formatMeasurement({ value: 1.5, unit: 'h' }, { decimals: 1 })).toBe('1,5 h')
    expect(formatMeasurement(undefined)).toBe(MISSING_TEXT)
  })

  it('formatea presión arterial y cualquier signo vital por su clave', () => {
    expect(formatBloodPressure({ systolic: 118, diastolic: 76, unit: 'mmHg' })).toBe('118/76 mmHg')
    expect(formatVitalSign(exampleVitalSigns, 'bloodPressure')).toBe('118/76 mmHg')
    expect(formatVitalSign(exampleVitalSigns, 'heartRateVariability')).toBe('45 ms')
    expect(formatVitalSign({ heartRate: { value: 60, unit: 'bpm' } }, 'oxygenSaturation')).toBe(MISSING_TEXT)
  })

  it('describe el origen distinguiendo datos simulados', () => {
    expect(describeSource(exampleVitalSigns.source)).toBe('Sensor · simulado (sim-wearable-01)')
    expect(describeSource({ type: 'self_report', simulated: false })).toBe('Autoevaluación · real')
  })
})

describe('tripulantes desconocidos', () => {
  const known = { id: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d', name: 'Ana Torres', callsign: 'Nova', role: 'commander', status: 'active' }
  const unknownId = 'c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a'

  it('resuelve perfiles conocidos', () => {
    expect(resolveCrewMember(known.id, new Map([[known.id, known]]))).toMatchObject({
      known: true,
      displayName: 'Ana Torres (Nova)',
      role: 'commander',
    })
  })

  it('un id sin perfil es "Tripulante desconocido" sin inventar nombre, rol, agencia ni estado', () => {
    const member = resolveCrewMember(unknownId, new Map())
    expect(member).toEqual({ id: unknownId, known: false, displayName: `${UNKNOWN_CREW_LABEL} · ${shortId(unknownId)}` })
  })

  it('collectCrew añade los ids presentes en mediciones reales, sin duplicados', () => {
    const vitals = [{ crewMemberId: unknownId }, { crewMemberId: known.id }, { crewMemberId: unknownId }]
    const checkIns = [{ crewMemberId: unknownId }]
    const crew = collectCrew([known], vitals, checkIns)

    expect(crew.map((m) => [m.id, m.known])).toEqual([
      [known.id, true],
      [unknownId, false],
    ])
  })

  it('un miembro ya resuelto (también desconocido) se devuelve sin alterarlo', () => {
    const crew = collectCrew([known], [{ crewMemberId: unknownId }])
    const resolvedMap = new Map(crew.map((m) => [m.id, m]))
    expect(resolveCrewMember(unknownId, resolvedMap).displayName).toBe(`${UNKNOWN_CREW_LABEL} · ${shortId(unknownId)}`)
    expect(resolveCrewMember(known.id, resolvedMap).displayName).toBe('Ana Torres (Nova)')
  })

  it('sin perfiles ni mediciones no hay tripulantes', () => {
    expect(collectCrew([], [])).toEqual([])
  })
})
