/**
 * Ejemplos válidos de cada entidad. Los tests garantizan que cumplen sus
 * esquemas, así que sirven como documentación viva y como datos semilla
 * para simuladores. Todos están marcados como simulados.
 */

const CREW_ID = '12326863-919b-42a3-959e-837237f6fc6f'

export const exampleCrewMember = Object.freeze({
  id: CREW_ID,
  name: 'Ana Torres',
  callsign: 'Nova',
  role: 'commander',
  agency: 'ESA',
  status: 'active',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
})

export const exampleVitalSigns = Object.freeze({
  id: '5ac17ecf-bf3e-440a-b91a-6ac7ac16ca89',
  crewMemberId: CREW_ID,
  recordedAt: '2026-11-14T10:00:00.000Z',
  source: { type: 'sensor', simulated: true, deviceId: 'sim-wearable-01' },
  heartRate: { value: 72, unit: 'bpm' },
  respiratoryRate: { value: 14, unit: 'breaths/min' },
  oxygenSaturation: { value: 98, unit: '%' },
  bodyTemperature: { value: 36.7, unit: 'degC' },
  bloodPressure: { systolic: 118, diastolic: 76, unit: 'mmHg' },
  heartRateVariability: { value: 45, unit: 'ms' },
})

export const exampleWellnessCheckIn = Object.freeze({
  id: '0a4475e4-5e74-4d23-a0ad-0f62835ea787',
  crewMemberId: CREW_ID,
  recordedAt: '2026-11-14T07:30:00.000Z',
  source: { type: 'self_report', simulated: true },
  mood: 4,
  stress: 2,
  fatigue: 3,
  sleepQuality: 3,
  sleepDuration: { value: 6.5, unit: 'h' },
  notes: 'Ligera congestión nasal al despertar.',
})

export const exampleCameraMetrics = Object.freeze({
  id: 'cb4fdf57-2caa-41c0-a89c-31eb99ee2884',
  crewMemberId: CREW_ID,
  recordedAt: '2026-11-14T10:05:00.000Z',
  source: { type: 'camera', simulated: true, deviceId: 'sim-cabin-cam-01' },
  windowDuration: { value: 60, unit: 's' },
  faceDetected: true,
  confidence: 0.92,
  model: { name: 'simulator', version: '0.1.0' },
  blinkRate: { value: 17, unit: 'blinks/min' },
  eyeClosureRatio: { value: 0.08, unit: 'ratio' },
  yawnCount: { value: 1, unit: 'count' },
  headPose: {
    pitch: { value: -5, unit: 'deg' },
    yaw: { value: 3, unit: 'deg' },
    roll: { value: 0, unit: 'deg' },
  },
})

export const exampleAlert = Object.freeze({
  id: 'ccb569e3-4aec-4697-82de-683c741087c9',
  crewMemberId: CREW_ID,
  origin: 'onboard',
  category: 'wellness',
  severity: 'warning',
  status: 'acknowledged',
  title: 'Fatiga autoinformada elevada',
  message: 'La tripulante reporta fatiga 3/5 con 6,5 h de sueño.',
  relatedRecord: { entityType: 'wellness_check_in', id: '0a4475e4-5e74-4d23-a0ad-0f62835ea787' },
  createdAt: '2026-11-14T07:31:00.000Z',
  updatedAt: '2026-11-14T07:45:00.000Z',
  acknowledgedAt: '2026-11-14T07:45:00.000Z',
  acknowledgedBy: 'Flight Surgeon',
})

/** Evento a la espera de reintento tras una pérdida de enlace. */
export const exampleSyncEvent = Object.freeze({
  id: '73d6589e-c6df-43ee-a92a-ca9e3d5fecd5',
  sequence: 42,
  origin: 'onboard',
  destination: 'ground',
  entityType: 'vital_signs',
  entityId: exampleVitalSigns.id,
  operation: 'create',
  payload: exampleVitalSigns,
  status: 'retry_scheduled',
  attempts: 2,
  maxAttempts: 10,
  lastAttemptAt: '2026-11-14T10:00:30.000Z',
  nextRetryAt: '2026-11-14T10:01:30.000Z',
  lastError: { code: 'LINK_DOWN', message: 'Enlace nave-tierra no disponible (LOS).' },
  createdAt: '2026-11-14T10:00:01.000Z',
  updatedAt: '2026-11-14T10:00:30.000Z',
})

/** Acuse de tierra tras recibir el evento anterior en un reintento. */
export const exampleSyncAck = Object.freeze({
  eventId: exampleSyncEvent.id,
  sequence: exampleSyncEvent.sequence,
  origin: 'ground',
  destination: 'onboard',
  result: 'accepted',
  receivedAt: '2026-11-14T10:01:31.000Z',
})
