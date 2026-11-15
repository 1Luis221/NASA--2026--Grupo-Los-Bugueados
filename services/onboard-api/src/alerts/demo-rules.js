/**
 * Reglas OPERATIVAS DE DEMOSTRACIÓN para generar alertas a bordo.
 *
 * - Son configurables y están marcadas como `demonstrative: true` en cada alerta.
 * - No son criterios clínicos ni diagnósticos: señalan algo que merece la
 *   atención de la tripulación o del equipo de Tierra.
 * - Donde es posible se compara con la LÍNEA BASE PERSONAL del tripulante
 *   (sus propias pruebas anteriores con el mismo protocolo) en vez de con un
 *   valor absoluto.
 * - Las alertas de calidad de datos (`data_quality`) se distinguen de las de
 *   bienestar: indican que faltan datos o están desactualizados, no un estado.
 *
 * Cada regla es una función pura: (registro, contexto) → { fire, ... }.
 */
export const DEMO_ALERT_RULES = Object.freeze({
  pvtLapses: { enabled: true, minLapses: 5 },
  pvtErrors: { enabled: true, minErrors: 3 },
  pvtBaselineChange: { enabled: true, baselineTests: 3, minIncreasePercent: 20 },
  sleepinessHigh: { enabled: true, minKss: 7 },
  staleData: { enabled: true, vitalsMaxAgeMinutes: 10, checkInMaxAgeHours: 24, checkEveryMs: 60_000 },
})

/** Configuración efectiva: valores por defecto + cambios parciales. */
export function resolveRules(overrides = {}) {
  return Object.fromEntries(Object.entries(DEMO_ALERT_RULES).map(([key, value]) => [key, Object.freeze({ ...value, ...overrides[key] })]))
}

const fmt = (n, decimals = 0) => Number(n).toFixed(decimals).replace('.', ',')

/** Evidencia de un registro: tipo, id, momento y procedencia. */
export const evidenceOf = (entityType, record, summary) => ({
  entityType,
  id: record.id,
  recordedAt: record.recordedAt,
  source: { type: record.source.type, simulated: record.source.simulated },
  summary,
})

const pvtSummaryText = (t) =>
  `${t.protocol.name}: ${t.summary.trialCount} ensayos, ${t.summary.lapseCount} lapsos, ${t.summary.falseStartCount} falsas salidas, ${t.summary.timeoutCount} omisiones, TR medio ${t.summary.meanReactionTimeMs === null ? '—' : `${fmt(t.summary.meanReactionTimeMs)} ms`}`

/** Reglas por tipo de registro. `context.previousTests`: PVT anteriores del tripulante (más recientes primero). */
export const RECORD_RULES = Object.freeze({
  vigilance_test: [
    {
      id: 'demo.pvt.lapses',
      name: 'Lapsos en la prueba de vigilancia (regla demostrativa)',
      category: 'cognitive',
      configKey: 'pvtLapses',
      evaluate(test, _ctx, cfg) {
        const fire = test.summary.lapseCount >= cfg.minLapses
        return {
          fire,
          parameters: { minLapses: cfg.minLapses, lapseThresholdMs: test.protocol.lapseThresholdMs },
          title: 'Lapsos frecuentes en la prueba de vigilancia',
          message: `${test.summary.lapseCount} respuestas ≥ ${test.protocol.lapseThresholdMs} ms en ${test.protocol.name} (umbral de demostración: ≥ ${cfg.minLapses}). Orientativo, no diagnóstico.`,
          evidence: [evidenceOf('vigilance_test', test, pvtSummaryText(test))],
        }
      },
    },
    {
      id: 'demo.pvt.errors',
      name: 'Errores y anticipaciones en la prueba de vigilancia (regla demostrativa)',
      category: 'cognitive',
      configKey: 'pvtErrors',
      evaluate(test, _ctx, cfg) {
        const errors = test.summary.falseStartCount + test.summary.timeoutCount
        return {
          fire: errors >= cfg.minErrors,
          parameters: { minErrors: cfg.minErrors },
          title: 'Errores frecuentes en la prueba de vigilancia',
          message: `${test.summary.falseStartCount} falsas salidas y ${test.summary.timeoutCount} omisiones en ${test.protocol.name} (umbral de demostración: ≥ ${cfg.minErrors} en total). Orientativo, no diagnóstico.`,
          evidence: [evidenceOf('vigilance_test', test, pvtSummaryText(test))],
        }
      },
    },
    {
      id: 'demo.pvt.baseline',
      name: 'Cambio del tiempo de reacción respecto de la línea base personal (regla demostrativa)',
      category: 'cognitive',
      configKey: 'pvtBaselineChange',
      evaluate(test, { previousTests = [] }, cfg) {
        // Línea base: TR medio de las N pruebas anteriores del MISMO protocolo con datos.
        const baseline = previousTests
          .filter((t) => t.protocol.name === test.protocol.name && t.summary.meanReactionTimeMs !== null)
          .slice(0, cfg.baselineTests)
        const parameters = { baselineTests: cfg.baselineTests, minIncreasePercent: cfg.minIncreasePercent, available: baseline.length }
        if (baseline.length < cfg.baselineTests || test.summary.meanReactionTimeMs === null) {
          return { fire: false, parameters, insufficient: true } // sin línea base suficiente no se evalúa
        }
        const base = baseline.reduce((sum, t) => sum + t.summary.meanReactionTimeMs, 0) / baseline.length
        const change = ((test.summary.meanReactionTimeMs - base) / base) * 100
        return {
          fire: change >= cfg.minIncreasePercent,
          parameters: { ...parameters, baselineMeanMs: Math.round(base * 10) / 10 },
          title: 'Tiempo de reacción más lento que su línea base',
          message: `TR medio ${fmt(test.summary.meanReactionTimeMs)} ms frente a ${fmt(base)} ms de media en sus ${baseline.length} pruebas anteriores (+${fmt(change)} %; umbral de demostración: +${cfg.minIncreasePercent} %). Orientativo, no diagnóstico.`,
          evidence: [
            evidenceOf('vigilance_test', test, pvtSummaryText(test)),
            ...baseline.map((t) => evidenceOf('vigilance_test', t, `Línea base · ${pvtSummaryText(t)}`)),
          ],
        }
      },
    },
  ],
  wellness_check_in: [
    {
      id: 'demo.sleepiness.self_report',
      name: 'Somnolencia autodeclarada elevada (regla demostrativa)',
      category: 'wellness',
      configKey: 'sleepinessHigh',
      evaluate(checkIn, _ctx, cfg) {
        if (checkIn.sleepiness === undefined) return { fire: false, skip: true } // sin dato no se cambia el estado
        return {
          fire: checkIn.sleepiness >= cfg.minKss,
          parameters: { minKss: cfg.minKss, scale: 'KSS 1–9' },
          title: 'Somnolencia autodeclarada elevada',
          message: `El tripulante indica somnolencia ${checkIn.sleepiness}/9 en la escala KSS (umbral de demostración: ≥ ${cfg.minKss}). Dato autodeclarado, no diagnóstico.`,
          evidence: [
            evidenceOf(
              'wellness_check_in',
              checkIn,
              `KSS ${checkIn.sleepiness}/9 · fatiga ${checkIn.fatigue}/5${checkIn.sleepDuration ? ` · ${fmt(checkIn.sleepDuration.value, 1)} h de sueño` : ''}`,
            ),
          ],
        }
      },
    },
  ],
})

/** Reglas de calidad de datos (evaluación periódica). */
export const STALE_RULES = Object.freeze([
  {
    id: 'data.vitals.stale',
    name: 'Telemetría ausente o desactualizada (calidad de datos)',
    entityType: 'vital_signs',
    maxAgeMs: (cfg) => cfg.vitalsMaxAgeMinutes * 60_000,
    parameters: (cfg) => ({ maxAgeMinutes: cfg.vitalsMaxAgeMinutes }),
    label: 'signos vitales',
  },
  {
    id: 'data.check_in.stale',
    name: 'Autoevaluación ausente o desactualizada (calidad de datos)',
    entityType: 'wellness_check_in',
    maxAgeMs: (cfg) => cfg.checkInMaxAgeHours * 3_600_000,
    parameters: (cfg) => ({ maxAgeHours: cfg.checkInMaxAgeHours }),
    label: 'autoevaluaciones',
  },
])
