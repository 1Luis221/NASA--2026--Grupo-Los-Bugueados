import { WellnessCheckInStrictSchema } from '@astronaut-wellness/shared'
import { CHECK_IN_SCALES } from '@astronaut-wellness/ui'

/**
 * Cuerpo de POST /api/check-ins: el contrato WellnessCheckIn sin los campos que
 * pone el servidor (id, recordedAt, source). Es la MISMA derivación que usa
 * Onboard API, así que la validación del navegador y la del servidor coinciden.
 */
export const CheckInInputSchema = WellnessCheckInStrictSchema.omit({ id: true, recordedAt: true, source: true })

export const SCALE_KEYS = CHECK_IN_SCALES.map((scale) => scale.key)

export const emptyForm = () => ({ mood: null, stress: null, fatigue: null, sleepQuality: null, sleepHours: '', notes: '' })

/** Formulario → cuerpo HTTP. Los campos opcionales vacíos no se envían. */
export function toCheckInBody(form, crewMemberId) {
  const notes = form.notes.trim()
  return {
    crewMemberId,
    mood: form.mood,
    stress: form.stress,
    fatigue: form.fatigue,
    sleepQuality: form.sleepQuality,
    ...(form.sleepHours !== '' && { sleepDuration: { value: Number(form.sleepHours), unit: 'h' } }),
    ...(notes && { notes }),
  }
}

/** Mensajes comprensibles por campo (los de Zod son técnicos y en inglés). */
const FIELD_MESSAGES = {
  crewMemberId: 'Selecciona un tripulante válido.',
  sleepDuration: 'Indica las horas de sueño como un número entre 0 y 24.',
  notes: 'Las notas admiten como máximo 500 caracteres.',
  _unknown: 'Hay un campo que no admite la API.',
}
for (const key of SCALE_KEYS) FIELD_MESSAGES[key] = 'Elige un valor de 1 a 5.'

/** Campo del formulario al que corresponde la ruta de un issue (`sleepDuration.value` → `sleepDuration`). */
export const fieldOf = (path) => {
  const first = Array.isArray(path) ? path[0] : String(path ?? '').split('.')[0]
  return first || '_unknown'
}

/** Issues (de Zod o del 400 de la API) → { campo: mensaje }. */
export function issuesToFieldErrors(issues = []) {
  const errors = {}
  for (const issue of issues) {
    const field = fieldOf(issue.path)
    errors[field] ??= FIELD_MESSAGES[field] ?? issue.message
  }
  return errors
}

/** Valida en el navegador. Devuelve { body } o { fieldErrors }. */
export function validateCheckIn(form, crewMemberId) {
  const body = toCheckInBody(form, crewMemberId)
  const result = CheckInInputSchema.safeParse(body)
  return result.success ? { body: result.data } : { fieldErrors: issuesToFieldErrors(result.error.issues) }
}
