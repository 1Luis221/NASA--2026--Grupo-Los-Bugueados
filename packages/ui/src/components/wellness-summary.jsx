import { formatNumber } from '@astronaut-wellness/ui/lib/format'
import { CHECK_IN_SCALES } from '@astronaut-wellness/ui/lib/labels'
import { WELLNESS_MIN_CHECK_INS, summarizeCheckIns } from '@astronaut-wellness/ui/lib/wellness'

/**
 * Resumen de bienestar autoinformado: medias de las escalas 1–5 con el
 * significado de sus extremos y el número de registros. Colores neutros: no
 * se marca ningún valor como bueno o malo.
 */
export function WellnessSummary({ checkIns = [], minimum = WELLNESS_MIN_CHECK_INS }) {
  const { count, averages, sleepHours } = summarizeCheckIns(checkIns)

  if (count < minimum) {
    return (
      <p className="text-sm text-muted-foreground">
        Se necesitan al menos {minimum} autoevaluaciones para calcular medias descriptivas (hay {count}).
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Medias descriptivas de {count} autoevaluaciones (escala 1–5). Son percepciones de la tripulación, no una valoración
        clínica.
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHECK_IN_SCALES.map(({ key, label, low, high }) => (
          <div key={key} className="rounded-lg border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>
              <span className="text-xl font-semibold tabular-nums">{formatNumber(averages[key], { decimals: 1 })}</span>
              <span className="text-sm text-muted-foreground"> / 5</span>
              <span className="block text-xs text-muted-foreground">
                1 = {low} · 5 = {high}
              </span>
            </dd>
          </div>
        ))}
        {sleepHours.count > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">Horas de sueño</dt>
            <dd>
              <span className="text-xl font-semibold tabular-nums">{formatNumber(sleepHours.average, { decimals: 1 })} h</span>
              <span className="block text-xs text-muted-foreground">Media de {sleepHours.count} registros que lo indican</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
