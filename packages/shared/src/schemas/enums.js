/**
 * Enumeraciones del dominio. Son arrays congelados para poder usarlos
 * tanto en z.enum() como en la UI (selects, leyendas, etc.).
 */

/** Nodos del sistema que producen o consumen datos. */
export const SYSTEM_NODES = Object.freeze(['onboard', 'ground'])

/** Modalidad de captura de un dato. La simulación se indica aparte (source.simulated). */
export const DATA_SOURCE_TYPES = Object.freeze(['sensor', 'camera', 'self_report', 'cognitive_test'])

export const CREW_ROLES = Object.freeze([
  'commander',
  'pilot',
  'flight_engineer',
  'mission_specialist',
  'payload_specialist',
  'medical_officer',
])

export const CREW_STATUSES = Object.freeze(['active', 'inactive'])

/** Severidad operativa de una alerta (no es un diagnóstico). */
export const ALERT_SEVERITIES = Object.freeze(['info', 'warning', 'critical'])

/** Ciclo de vida: active → acknowledged → resolved (ver transitions.js). */
export const ALERT_STATUSES = Object.freeze(['active', 'acknowledged', 'resolved'])

/** Ámbito que originó la alerta. */
export const ALERT_CATEGORIES = Object.freeze([
  'vital_signs',
  'wellness',
  'camera',
  'communication',
  'system',
  /** Rendimiento en pruebas cognitivas (PVT). */
  'cognitive',
  /** Datos insuficientes o desactualizados: NO es una alerta de bienestar. */
  'data_quality',
])

/** Entidades que pueden viajar entre nave y tierra dentro de un SyncEvent. */
export const SYNC_ENTITY_TYPES = Object.freeze([
  'crew_member',
  'vital_signs',
  'wellness_check_in',
  'camera_metrics',
  'alert',
  'vigilance_test',
])

/**
 * Resultado de cada ensayo de la prueba de vigilancia psicomotora (PVT):
 * - valid:       respuesta entre el umbral de falsa salida y el de lapso.
 * - lapse:       respuesta lenta (≥ umbral de lapso del protocolo).
 * - false_start: respuesta anticipada (antes del estímulo o más rápida que el umbral).
 * - timeout:     sin respuesta dentro del tiempo máximo (error de omisión).
 * Son definiciones de MEDICIÓN del protocolo, no criterios clínicos.
 */
export const PVT_OUTCOMES = Object.freeze(['valid', 'lapse', 'false_start', 'timeout'])

export const SYNC_OPERATIONS = Object.freeze(['create', 'update'])

/**
 * Estado de entrega de un SyncEvent (cola store-and-forward):
 * - pending:         en cola, esperando enlace disponible.
 * - sending:         intento de envío en curso.
 * - retry_scheduled: el intento falló (p. ej. corte de enlace); hay reintento programado.
 * - acknowledged:    el destino confirmó la recepción. Estado final.
 * - failed:          se agotaron los reintentos o el error no es recuperable.
 */
export const SYNC_STATUSES = Object.freeze([
  'pending',
  'sending',
  'retry_scheduled',
  'acknowledged',
  'failed',
])

/**
 * Resultado que el receptor comunica en un SyncAck:
 * - accepted:  procesado por primera vez.
 * - duplicate: ya se había procesado ese SyncEvent.id (idempotencia); no se reaplica.
 * - rejected:  inválido o no procesable; no debe reintentarse sin cambios.
 */
export const SYNC_ACK_RESULTS = Object.freeze(['accepted', 'duplicate', 'rejected'])

/** Estado del enlace de comunicaciones nave-tierra. */
export const LINK_STATES = Object.freeze(['connected', 'degraded', 'disconnected'])

/** Unidades admitidas en las mediciones (ASCII, legibles). */
export const UNITS = Object.freeze({
  BPM: 'bpm',
  BREATHS_PER_MIN: 'breaths/min',
  PERCENT: '%',
  CELSIUS: 'degC',
  MMHG: 'mmHg',
  MILLISECONDS: 'ms',
  BLINKS_PER_MIN: 'blinks/min',
  RATIO: 'ratio',
  DEGREES: 'deg',
  COUNT: 'count',
  HOURS: 'h',
  SECONDS: 's',
  /** Equivalente metabólico de la actividad (1 MET ≈ reposo). */
  MET: 'MET',
})
