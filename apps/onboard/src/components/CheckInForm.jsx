import { useId, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { WellnessCheckInSchema } from '@astronaut-wellness/shared'
import { Alert, AlertDescription, AlertTitle, Button, CHECK_IN_SCALES, Input, Label, Textarea } from '@astronaut-wellness/ui'
import { emptyForm, issuesToFieldErrors, validateCheckIn } from '../check-in/check-in-form.js'
import { useOnboardApi } from '../state/app-context.js'
import { ScaleField } from './ScaleField.jsx'

const NOTES_MAX = 500

/** Mensaje comprensible para errores que no son de un campo concreto. */
function formErrorFor(error) {
  if (error?.status === 404) return { title: 'Tripulante no encontrado', message: `${error.message}. Selecciona otro tripulante.` }
  if (error?.status === 409) return { title: 'Tripulante no activo', message: `${error.message}. No admite nuevas autoevaluaciones.` }
  if (error?.status === 0) {
    return { title: 'Sin conexión con Onboard API', message: 'No se pudo guardar. Tus respuestas se conservan: vuelve a intentarlo.' }
  }
  return {
    title: 'No se pudo guardar la autoevaluación',
    message: `${error?.message ?? 'Error desconocido'}. Tus respuestas se conservan: vuelve a intentarlo.`,
  }
}

/**
 * Formulario de autoevaluación (POST /api/check-ins).
 * - Valida con el contrato antes de enviar y muestra errores por campo.
 * - Un único envío a la vez.
 * - Solo confirma con HTTP 201 y una entidad válida; ante errores conserva los datos.
 */
export function CheckInForm({ crewMember, onSaved }) {
  const api = useOnboardApi()
  const formId = useId()
  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const formRef = useRef(null)

  const update = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    // El campo de horas se valida como `sleepDuration` en el contrato.
    const errorKey = field === 'sleepHours' ? 'sleepDuration' : field
    setFieldErrors((errors) => {
      if (!(errorKey in errors)) return errors
      const next = { ...errors }
      delete next[errorKey]
      return next
    })
  }

  const focusFirstError = (errors) => {
    const field = Object.keys(errors)[0]
    const target = formRef.current?.querySelector(`[data-field="${field}"] input, [name="${field}"], [data-field="${field}"]`)
    target?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return // evita envíos duplicados (doble clic, Enter repetido)
    setFormError(null)

    const { body, fieldErrors: clientErrors } = validateCheckIn(form, crewMember.id)
    if (clientErrors) {
      setFieldErrors(clientErrors)
      focusFirstError(clientErrors)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const { status, body: payload } = await api.submitCheckIn(body)
      const created = WellnessCheckInSchema.safeParse(payload?.data)
      if (status !== 201 || !created.success) {
        setFormError({ title: 'Respuesta inesperada de Onboard API', message: `Se esperaba HTTP 201 con la autoevaluación creada (recibido HTTP ${status}).` })
        return
      }
      setForm(emptyForm())
      setFieldErrors({})
      onSaved?.({ checkIn: created.data, savedAt: new Date().toISOString() })
    } catch (error) {
      if (error?.status === 400 && error.issues?.length) {
        const errors = issuesToFieldErrors(error.issues)
        setFieldErrors(errors)
        setFormError({ title: 'Onboard API rechazó algunos datos', message: 'Revisa los campos marcados.' })
        focusFirstError(errors)
      } else {
        setFormError(formErrorFor(error))
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const notesLength = form.notes.length
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-describedby={`${formId}-intro`} className="space-y-6">
      <p id={`${formId}-intro`} className="text-sm text-muted-foreground">
        Indica cómo te encuentras. Son percepciones propias, no un diagnóstico. Los campos de escala son obligatorios.
      </p>

      {formError && (
        <Alert variant="destructive">
          <AlertTitle>{formError.title}</AlertTitle>
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {CHECK_IN_SCALES.map(({ key, label, low, high }) => (
          <ScaleField
            key={key}
            name={key}
            label={label}
            low={low}
            high={high}
            value={form[key]}
            onChange={update(key)}
            error={fieldErrors[key]}
            disabled={submitting}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2" data-field="sleepDuration">
          <Label htmlFor={`${formId}-sleep`}>Horas de sueño (opcional)</Label>
          <Input
            id={`${formId}-sleep`}
            name="sleepDuration"
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={form.sleepHours}
            onChange={(e) => update('sleepHours')(e.target.value)}
            aria-invalid={fieldErrors.sleepDuration ? true : undefined}
            aria-describedby={`${formId}-sleep-hint${fieldErrors.sleepDuration ? ` ${formId}-sleep-error` : ''}`}
            disabled={submitting}
          />
          <p id={`${formId}-sleep-hint`} className="text-xs text-muted-foreground">
            Entre 0 y 24 horas; admite decimales (p. ej. 6,5).
          </p>
          {fieldErrors.sleepDuration && (
            <p id={`${formId}-sleep-error`} className="text-sm text-destructive">
              {fieldErrors.sleepDuration}
            </p>
          )}
        </div>

        <div className="space-y-2" data-field="notes">
          <Label htmlFor={`${formId}-notes`}>Notas (opcional)</Label>
          <Textarea
            id={`${formId}-notes`}
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes')(e.target.value)}
            aria-invalid={fieldErrors.notes ? true : undefined}
            aria-describedby={`${formId}-notes-count${fieldErrors.notes ? ` ${formId}-notes-error` : ''}`}
            disabled={submitting}
          />
          <p id={`${formId}-notes-count`} className="text-xs text-muted-foreground">
            {notesLength} / {NOTES_MAX} caracteres
          </p>
          {fieldErrors.notes && (
            <p id={`${formId}-notes-error`} className="text-sm text-destructive">
              {fieldErrors.notes}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={submitting} aria-disabled={submitting}>
        <Send aria-hidden="true" />
        {submitting ? 'Guardando…' : 'Guardar autoevaluación'}
      </Button>
    </form>
  )
}
