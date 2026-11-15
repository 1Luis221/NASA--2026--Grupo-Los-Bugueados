/**
 * Utilidades de presentación. Todas distinguen un valor AUSENTE (null,
 * undefined, NaN, '') de un valor real como 0: lo ausente se muestra con
 * MISSING_TEXT y nunca se sustituye por un número.
 */

export const MISSING_TEXT = '—'

export const isMissing = (value) =>
  value === null || value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))

const toDate = (iso) => {
  if (isMissing(iso)) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const pad = (n) => String(n).padStart(2, '0')

/** "2026-11-14 10:00:00 UTC". Referencia común para nave y tierra. */
export function formatUtc(iso, { seconds = true } = {}) {
  const d = toDate(iso)
  if (!d) return MISSING_TEXT
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ''}`
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${time} UTC`
}

/**
 * Fecha en la zona horaria local CON su desplazamiento visible
 * ("14/11/2026, 11:00:00 GMT+1"), para no perder la referencia temporal.
 */
export function formatLocal(iso, { locale = 'es-ES', timeZone } = {}) {
  const d = toDate(iso)
  if (!d) return MISSING_TEXT
  // Intl no admite dateStyle/timeStyle junto a timeZoneName: componentes explícitos.
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'shortOffset',
  }).format(d)
}

/** "hace 5 s", "hace 3 min"… respecto a `now`. */
export function formatRelative(iso, { now = new Date(), locale = 'es' } = {}) {
  const d = toDate(iso)
  if (!d) return MISSING_TEXT
  const diffSeconds = Math.round((d.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return rtf.format(diffSeconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour')
  return rtf.format(Math.round(diffSeconds / 86_400), 'day')
}

/** Etiquetas visibles de las unidades del contrato (packages/shared UNITS). */
export const UNIT_LABELS = Object.freeze({
  bpm: 'lpm',
  'breaths/min': 'rpm',
  '%': '%',
  degC: '°C',
  mmHg: 'mmHg',
  ms: 'ms',
  'blinks/min': 'parpadeos/min',
  ratio: '',
  deg: '°',
  count: '',
  h: 'h',
  s: 's',
})

export const unitLabel = (unit) => UNIT_LABELS[unit] ?? unit ?? ''

/** Número con decimales fijos; ausente → MISSING_TEXT. 0 se muestra como 0. */
export function formatNumber(value, { decimals, locale = 'es-ES' } = {}) {
  if (isMissing(value)) return MISSING_TEXT
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals ?? 2,
  }).format(value)
}

/** { value, unit } → "72 lpm". Medición ausente → MISSING_TEXT. */
export function formatMeasurement(measurement, options) {
  if (!measurement || isMissing(measurement.value)) return MISSING_TEXT
  const label = unitLabel(measurement.unit)
  const number = formatNumber(measurement.value, options)
  if (!label) return number
  return label === '%' || label === '°' ? `${number}${label}` : `${number} ${label}`
}

/** { systolic, diastolic, unit } → "118/76 mmHg". */
export function formatBloodPressure(bp) {
  if (!bp || isMissing(bp.systolic) || isMissing(bp.diastolic)) return MISSING_TEXT
  return `${formatNumber(bp.systolic)}/${formatNumber(bp.diastolic)} ${unitLabel(bp.unit)}`
}

/** Nombres visibles de las mediciones de VitalSigns. */
export const VITAL_SIGN_LABELS = Object.freeze({
  heartRate: 'Frecuencia cardiaca',
  respiratoryRate: 'Frecuencia respiratoria',
  oxygenSaturation: 'Saturación de oxígeno',
  bodyTemperature: 'Temperatura corporal',
  bloodPressure: 'Presión arterial',
  heartRateVariability: 'Variabilidad de la frecuencia cardiaca',
})

/** Texto de cualquier medición de VitalSigns por su clave. */
export function formatVitalSign(reading, key) {
  if (!reading) return MISSING_TEXT
  return key === 'bloodPressure' ? formatBloodPressure(reading.bloodPressure) : formatMeasurement(reading[key])
}

/** Origen del dato legible: "Sensor · simulado (sim-wearable-01)". */
export function describeSource(source) {
  if (!source) return MISSING_TEXT
  const type = { sensor: 'Sensor', camera: 'Cámara', self_report: 'Autoevaluación' }[source.type] ?? source.type
  const nature = source.simulated ? 'simulado' : 'real'
  return `${type} · ${nature}${source.deviceId ? ` (${source.deviceId})` : ''}`
}
