/**
 * Textos visibles de las enumeraciones del contrato (packages/shared).
 * Solo traducen valores existentes: no añaden significado clínico.
 */

export const ROLE_LABELS = Object.freeze({
  commander: 'Comandante',
  pilot: 'Piloto',
  flight_engineer: 'Ingeniería de vuelo',
  mission_specialist: 'Especialista de misión',
  payload_specialist: 'Especialista de carga útil',
  medical_officer: 'Oficial médico',
})

export const CREW_STATUS_LABELS = Object.freeze({ active: 'Activo', inactive: 'Inactivo' })

/** La severidad es prioridad operativa de atención, no un diagnóstico. */
export const ALERT_SEVERITY_LABELS = Object.freeze({ info: 'Informativa', warning: 'Aviso', critical: 'Crítica' })
export const ALERT_SEVERITY_TONES = Object.freeze({ info: 'info', warning: 'warning', critical: 'danger' })

export const ALERT_STATUS_LABELS = Object.freeze({ active: 'Activa', acknowledged: 'Reconocida', resolved: 'Resuelta' })
export const ALERT_STATUS_TONES = Object.freeze({ active: 'warning', acknowledged: 'info', resolved: 'neutral' })

export const ALERT_CATEGORY_LABELS = Object.freeze({
  vital_signs: 'Signos vitales',
  wellness: 'Bienestar',
  camera: 'Cámara',
  communication: 'Comunicaciones',
  system: 'Sistema',
  cognitive: 'Rendimiento cognitivo',
  data_quality: 'Calidad de datos',
})

/** Karolinska Sleepiness Scale (KSS): somnolencia autodeclarada en este momento. */
export const KSS_SCALE = Object.freeze([
  { value: 1, label: 'Extremadamente despierto' },
  { value: 2, label: 'Muy despierto' },
  { value: 3, label: 'Despierto' },
  { value: 4, label: 'Bastante despierto' },
  { value: 5, label: 'Ni despierto ni somnoliento' },
  { value: 6, label: 'Algunos signos de somnolencia' },
  { value: 7, label: 'Somnoliento, sin esfuerzo por mantenerse despierto' },
  { value: 8, label: 'Somnoliento, con algo de esfuerzo por mantenerse despierto' },
  { value: 9, label: 'Muy somnoliento, gran esfuerzo, luchando contra el sueño' },
])

export const ENTITY_TYPE_LABELS = Object.freeze({
  crew_member: 'Tripulante',
  vital_signs: 'Signos vitales',
  wellness_check_in: 'Autoevaluación',
  camera_metrics: 'Métricas de cámara',
  alert: 'Alerta',
  vigilance_test: 'Prueba de vigilancia',
})

export const OPERATION_LABELS = Object.freeze({ create: 'Alta', update: 'Actualización' })

/** Dimensiones de la autoevaluación (escala 1–5) y el significado de sus extremos. */
export const CHECK_IN_SCALES = Object.freeze([
  { key: 'mood', label: 'Estado de ánimo', low: 'muy malo', high: 'muy bueno' },
  { key: 'stress', label: 'Estrés', low: 'muy bajo', high: 'muy alto' },
  { key: 'fatigue', label: 'Fatiga', low: 'muy baja', high: 'muy alta' },
  { key: 'sleepQuality', label: 'Calidad del sueño', low: 'muy mala', high: 'muy buena' },
])

/** Estados de entrega de un SyncEvent (cola de la nave). */
export const SYNC_STATUS_LABELS = Object.freeze({
  pending: 'Pendiente de envío',
  sending: 'Enviando',
  retry_scheduled: 'Reintento programado',
  acknowledged: 'Recibido por Tierra',
  failed: 'Fallido',
})
export const SYNC_STATUS_TONES = Object.freeze({
  pending: 'warning',
  sending: 'info',
  retry_scheduled: 'warning',
  acknowledged: 'success',
  failed: 'danger',
})

/** Estados del enlace SIMULADO por Onboard API (no es una conexión espacial real). */
export const LINK_STATE_LABELS = Object.freeze({ connected: 'Conectado', degraded: 'Degradado', disconnected: 'Desconectado' })
export const LINK_STATE_TONES = Object.freeze({ connected: 'success', degraded: 'warning', disconnected: 'danger' })

export const labelFor = (labels, value) => labels[value] ?? value ?? '—'
