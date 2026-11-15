/**
 * Dimensiones de FATIGA y de RESPUESTA AL ESTRÉS: indicadores DESCRIPTIVOS
 * construidos con los registros existentes, cada uno con su fuente y fecha.
 *
 * Deliberadamente NO se combinan en una puntuación: no existe una fórmula
 * validada para hacerlo con estos datos y una cifra compuesta aparentaría una
 * precisión que no tiene. Tampoco se clasifican valores como normales o
 * anormales: se muestran el último valor, su evolución y qué falta.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * Definición de cada indicador:
 * - from: colección de origen (checkIns | vigilanceTests | cameraMetrics | vitals)
 * - pick(record) → número o undefined (sin dato: el registro no cuenta)
 * - unit: unidad visible · scale: [min, max] si es una escala autodeclarada
 * - experimental: medida experimental (cámara)
 * - missing: cómo se obtiene el dato si falta
 * - note: aclaración sobre su significado
 */
export const FATIGUE_INDICATORS = Object.freeze([
  {
    key: 'sleepDuration',
    label: 'Horas de sueño',
    from: 'checkIns',
    pick: (c) => num(c.sleepDuration?.value),
    unit: 'h',
    decimals: 1,
    missing: 'Se registra (opcional) en la autoevaluación a bordo.',
  },
  {
    key: 'sleepiness',
    label: 'Somnolencia autodeclarada',
    from: 'checkIns',
    pick: (c) => num(c.sleepiness),
    scale: [1, 9],
    note: 'Escala KSS: 1 = extremadamente despierto · 9 = luchando contra el sueño.',
    missing: 'Se registra (opcional) en la autoevaluación con la escala KSS.',
  },
  {
    key: 'fatigue',
    label: 'Fatiga autodeclarada',
    from: 'checkIns',
    pick: (c) => num(c.fatigue),
    scale: [1, 5],
    note: '1 = muy baja · 5 = muy alta.',
    missing: 'Se registra en la autoevaluación a bordo.',
  },
  {
    key: 'pvtMeanRt',
    label: 'PVT · tiempo de reacción medio',
    from: 'vigilanceTests',
    pick: (t) => num(t.summary?.meanReactionTimeMs),
    unit: 'ms',
    decimals: 0,
    detail: (t) => `${t.protocol.name} · ${t.summary.lapseCount} lapsos · ${t.summary.falseStartCount + t.summary.timeoutCount} errores`,
    missing: 'Se obtiene con la prueba de vigilancia (PVT) a bordo.',
  },
  {
    key: 'pvtLapses',
    label: 'PVT · lapsos',
    from: 'vigilanceTests',
    pick: (t) => num(t.summary?.lapseCount),
    decimals: 0,
    detail: (t) => `respuestas ≥ ${t.protocol.lapseThresholdMs} ms de ${t.summary.trialCount} ensayos`,
    missing: 'Se obtiene con la prueba de vigilancia (PVT) a bordo.',
  },
  {
    key: 'eyeClosure',
    label: 'Ojos cerrados (cámara)',
    from: 'cameraMetrics',
    pick: (m) => (m.eyeClosureRatio ? num(m.eyeClosureRatio.value * 100) : undefined),
    unit: '%',
    decimals: 0,
    experimental: true,
    note: 'Porcentaje de la ventana con los ojos cerrados según el modelo de visión.',
    missing: 'Requiere activar la cámara a bordo y consentir el envío de métricas agregadas.',
  },
  {
    key: 'blinkRate',
    label: 'Frecuencia de parpadeo (cámara)',
    from: 'cameraMetrics',
    pick: (m) => num(m.blinkRate?.value),
    unit: 'parpadeos/min',
    decimals: 0,
    experimental: true,
    missing: 'Requiere activar la cámara a bordo y consentir el envío de métricas agregadas.',
  },
])

export const STRESS_INDICATORS = Object.freeze([
  {
    key: 'heartRate',
    label: 'Frecuencia cardiaca',
    from: 'vitals',
    pick: (v) => num(v.heartRate?.value),
    unit: 'lpm',
    decimals: 0,
    missing: 'Procede del sensor de constantes vitales.',
  },
  {
    key: 'hrv',
    label: 'Variabilidad de la frecuencia cardiaca (RMSSD)',
    from: 'vitals',
    pick: (v) => num(v.heartRateVariability?.value),
    unit: 'ms',
    decimals: 0,
    note: 'RMSSD que calcula el dispositivo a partir de los intervalos entre latidos. No se deriva del pulso. Sin valor clínico en esta demo.',
    missing: 'Solo si el sensor la proporciona; no se calcula a partir de la frecuencia cardiaca.',
  },
  {
    key: 'stress',
    label: 'Estrés percibido',
    from: 'checkIns',
    pick: (c) => num(c.stress),
    scale: [1, 5],
    note: '1 = muy bajo · 5 = muy alto.',
    missing: 'Se registra en la autoevaluación a bordo.',
  },
  {
    key: 'activityLevel',
    label: 'Actividad física reciente',
    from: 'vitals',
    pick: (v) => num(v.activityLevel?.value),
    unit: 'MET',
    decimals: 1,
    note: 'Equivalente metabólico (1 MET ≈ reposo): ayuda a interpretar la frecuencia cardiaca.',
    missing: 'Procede del sensor de actividad (acelerómetro).',
  },
])

/**
 * Serie cronológica de cada indicador a partir de las colecciones disponibles.
 * Los registros sin ese dato se omiten (nunca se rellenan huecos).
 */
export function buildIndicators(definitions, sources) {
  return definitions.map((def) => {
    const points = (sources[def.from] ?? [])
      .map((record) => ({ record, value: def.pick(record) }))
      .filter((p) => p.value !== undefined)
      .sort((a, b) => Date.parse(a.record.recordedAt) - Date.parse(b.record.recordedAt))
      .map(({ record, value }) => ({ t: record.recordedAt, value, source: record.source, record }))
    const values = points.map((p) => p.value)
    return {
      ...def,
      points,
      count: points.length,
      latest: points.at(-1) ?? null,
      first: points[0] ?? null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      anySimulated: points.some((p) => p.source?.simulated),
    }
  })
}

export const buildFatigueIndicators = (sources) => buildIndicators(FATIGUE_INDICATORS, sources)
export const buildStressIndicators = (sources) => buildIndicators(STRESS_INDICATORS, sources)
