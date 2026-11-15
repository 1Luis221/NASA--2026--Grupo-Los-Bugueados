import { PVT_DEFAULT_PROTOCOL, classifyPvtTrial, summarizePvtTrials } from '@astronaut-wellness/shared'

/** Protocolo breve de DEMOSTRACIÓN (no estándar): mismos umbrales que PVT-B, 60 s. */
export const PVT_DEMO_PROTOCOL = Object.freeze({ ...PVT_DEFAULT_PROTOCOL, name: 'PVT-demo', durationSeconds: 60 })

/** El contrato admite como máximo 1000 ensayos por prueba. */
export const PVT_MAX_TRIALS = 1000

const round1 = (value) => Math.round(value * 10) / 10

/**
 * Origen de una respuesta según el navegador:
 * - 'human': evento de confianza (`isTrusted`): lo produjo una persona con el teclado o el puntero.
 * - 'automated': evento generado por un script (p. ej. el E2E). Solo se admite en
 *   desarrollo, y el resultado se guardará como SIMULADO.
 * - 'ignored': evento generado por un script fuera de desarrollo: no cuenta como respuesta.
 */
export function classifyResponseEvent(event, { allowAutomated = false } = {}) {
  if (event?.isTrusted) return 'human'
  return allowAutomated ? 'automated' : 'ignored'
}

/**
 * Motor de la prueba de vigilancia psicomotora (PVT). Lógica pura: reloj,
 * temporizadores y azar inyectables, sin React ni DOM.
 *
 * Fases: idle → waiting (intervalo entre estímulos) ⇄ stimulus → finished | cancelled.
 * - Responder en `waiting` = falsa salida sin estímulo (se reinicia el intervalo).
 * - Responder en `stimulus` registra el tiempo de reacción; la clasificación
 *   (válida, lapso, falsa salida < umbral) la hace `classifyPvtTrial`, la misma
 *   función con la que el servidor verifica el resultado.
 * - Sin respuesta en `responseTimeoutMs` = omisión.
 * - Al cumplirse la duración, la prueba termina (si hay un estímulo en curso,
 *   se espera a su respuesta u omisión).
 */
export function createPvtEngine({
  protocol = PVT_DEFAULT_PROTOCOL,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  random = Math.random,
  onChange = () => {},
} = {}) {
  let phase = 'idle'
  let startedAt = null
  let stimulusAt = null
  let timer = null
  let endTimer = null
  let durationElapsed = false
  let trials = []
  let lastTrial = null

  const clear = () => {
    if (timer !== null) clearTimer(timer)
    if (endTimer !== null) clearTimer(endTimer)
    timer = null
    endTimer = null
  }

  const emit = () => onChange(getState())

  function record(stimulusOffsetMs, reactionTimeMs) {
    const trial = { index: trials.length, stimulusOffsetMs, reactionTimeMs }
    lastTrial = { ...trial, outcome: classifyPvtTrial(trial, protocol) }
    trials = [...trials, lastTrial]
  }

  function finishNow() {
    clear()
    phase = 'finished'
    emit()
  }

  function scheduleStimulus() {
    if (durationElapsed || trials.length >= PVT_MAX_TRIALS) return finishNow()
    phase = 'waiting'
    stimulusAt = null
    const isi = protocol.isiMinMs + random() * (protocol.isiMaxMs - protocol.isiMinMs)
    if (timer !== null) clearTimer(timer)
    timer = setTimer(showStimulus, isi)
  }

  function showStimulus() {
    timer = null
    phase = 'stimulus'
    stimulusAt = now()
    timer = setTimer(() => {
      timer = null
      record(round1(stimulusAt - startedAt), null) // omisión
      scheduleStimulus()
      emit()
    }, protocol.responseTimeoutMs)
    emit()
  }

  function start() {
    if (phase !== 'idle') return
    startedAt = now()
    trials = []
    lastTrial = null
    endTimer = setTimer(() => {
      endTimer = null
      durationElapsed = true
      if (phase === 'waiting') finishNow() // con un estímulo en curso se espera a la respuesta u omisión
    }, protocol.durationSeconds * 1000)
    scheduleStimulus()
    emit()
  }

  /** Respuesta del tripulante (tecla o pulsación). */
  function respond() {
    if (phase === 'waiting') {
      record(null, null) // falsa salida: respuesta sin estímulo
      scheduleStimulus()
      emit()
    } else if (phase === 'stimulus') {
      const reactionTimeMs = round1(Math.min(now() - stimulusAt, protocol.responseTimeoutMs))
      record(round1(stimulusAt - startedAt), reactionTimeMs)
      scheduleStimulus()
      emit()
    }
  }

  function cancel() {
    if (phase !== 'waiting' && phase !== 'stimulus') return
    clear()
    phase = 'cancelled'
    emit()
  }

  /** Resultado listo para enviar (sin id, recordedAt ni source), o null. */
  function result() {
    if (phase !== 'finished' || trials.length === 0) return null
    return { testType: 'pvt', protocol: { ...protocol }, trials, summary: summarizePvtTrials(trials, protocol) }
  }

  function getState() {
    return {
      phase,
      elapsedMs: startedAt === null ? 0 : now() - startedAt,
      trialCount: trials.length,
      lastTrial,
      stimulusShownAt: phase === 'stimulus' ? stimulusAt : null,
    }
  }

  return { start, respond, cancel, result, getState, dispose: clear }
}
