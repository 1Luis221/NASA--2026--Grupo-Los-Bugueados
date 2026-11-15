import { CHECK_IN_SCALES } from './labels.js'

/** Mínimo de autoevaluaciones para calcular medias descriptivas. */
export const WELLNESS_MIN_CHECK_INS = 3

const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** Medias descriptivas de las autoevaluaciones (sin interpretación clínica). */
export function summarizeCheckIns(checkIns) {
  const sleep = checkIns.map((c) => c.sleepDuration?.value).filter((v) => typeof v === 'number')
  return {
    count: checkIns.length,
    averages: Object.fromEntries(CHECK_IN_SCALES.map(({ key }) => [key, average(checkIns.map((c) => c[key]))])),
    sleepHours: { average: average(sleep), count: sleep.length },
  }
}
