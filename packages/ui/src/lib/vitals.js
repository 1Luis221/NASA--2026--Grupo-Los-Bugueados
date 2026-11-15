import { VITAL_SIGN_LABELS, formatNumber, formatUtc, formatVitalSign, unitLabel } from './format.js'

/** Mediciones representables y su abreviatura visible. */
export const VITAL_SIGN_METRICS = Object.freeze([
  { key: 'heartRate', short: 'FC' },
  { key: 'oxygenSaturation', short: 'SpO₂' },
  { key: 'respiratoryRate', short: 'FR' },
  { key: 'bodyTemperature', short: 'Temp.' },
  { key: 'bloodPressure', short: 'PA' },
  { key: 'heartRateVariability', short: 'VFC' },
  { key: 'activityLevel', short: 'Actividad' },
])

/** HH:MM:SS en UTC. */
export const utcTimeOf = (iso) => formatUtc(iso).slice(11, 19)

/**
 * Puntos de una medición ordenados cronológicamente. Se omiten las lecturas
 * que no incluyen esa medición (nunca se rellenan huecos).
 */
export function toVitalPoints(readings, key) {
  return [...readings]
    .filter((r) => (key === 'bloodPressure' ? r.bloodPressure : r[key]))
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
    .map((r) => ({
      reading: r,
      time: utcTimeOf(r.recordedAt),
      ...(key === 'bloodPressure'
        ? { systolic: r.bloodPressure.systolic, diastolic: r.bloodPressure.diastolic, unit: r.bloodPressure.unit }
        : { value: r[key].value, unit: r[key].unit }),
    }))
}

/** Resumen textual descriptivo (sin valoración clínica) de una medición. */
export function summarizeVitalSign(readings, key) {
  const points = toVitalPoints(readings, key)
  if (points.length === 0) return null
  const first = points[0]
  const last = points.at(-1)
  const range = (field) => {
    const values = points.map((p) => p[field])
    return `${formatNumber(Math.min(...values))}–${formatNumber(Math.max(...values))} ${unitLabel(last.unit)}`.trim()
  }
  const rangeText =
    key === 'bloodPressure' ? `sistólica ${range('systolic')}, diastólica ${range('diastolic')}` : `rango ${range('value')}`
  return `${VITAL_SIGN_LABELS[key]}: ${points.length} lecturas entre ${first.time} y ${last.time} UTC; ${rangeText}; última ${formatVitalSign(last.reading, key)}.`
}

/** Lectura más reciente de cada tripulante (`readings` en cualquier orden). */
export function latestByCrew(records) {
  const latest = new Map()
  for (const record of records) {
    const current = latest.get(record.crewMemberId)
    if (!current || Date.parse(record.recordedAt) > Date.parse(current.recordedAt)) latest.set(record.crewMemberId, record)
  }
  return latest
}
