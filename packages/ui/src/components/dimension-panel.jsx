import { FlaskConical } from 'lucide-react'
import { Badge } from '@astronaut-wellness/ui/components/ui/badge'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { describeSource, formatNumber, formatRelative, formatUtc } from '@astronaut-wellness/ui/lib/format'

const W = 160
const H = 36

/** Mini gráfico de la evolución (decorativo: el texto contiguo da la misma información). */
function Sparkline({ points }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const times = points.map((p) => Date.parse(p.t))
  const [vMin, vMax] = [Math.min(...values), Math.max(...values)]
  const [tMin, tMax] = [Math.min(...times), Math.max(...times)]
  const x = (t) => (tMax === tMin ? W / 2 : ((t - tMin) / (tMax - tMin)) * (W - 4) + 2)
  const y = (v) => (vMax === vMin ? H / 2 : H - 3 - ((v - vMin) / (vMax - vMin)) * (H - 6))
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="text-primary" data-slot="sparkline">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(times.at(-1))} cy={y(values.at(-1))} r="2.5" fill="currentColor" />
    </svg>
  )
}

function IndicatorCard({ indicator: ind, now }) {
  const fmt = (v) => formatNumber(v, { decimals: ind.decimals ?? 0 })
  const withUnit = (v) => (ind.scale ? `${fmt(v)}/${ind.scale[1]}` : `${fmt(v)}${ind.unit ? (ind.unit === '%' ? ' %' : ` ${ind.unit}`) : ''}`)
  const latest = ind.latest

  return (
    <article className="flex flex-col gap-2 rounded-lg border bg-card p-4" aria-labelledby={`ind-${ind.key}`} data-indicator={ind.key}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`ind-${ind.key}`} className="text-sm font-medium text-muted-foreground">
          {ind.label}
        </h3>
        <div className="flex flex-wrap gap-1">
          {ind.experimental && (
            <Badge variant="outline" title="Medida experimental del modelo de visión">
              <FlaskConical aria-hidden="true" /> Experimental
            </Badge>
          )}
          {latest && <SourceBadge source={latest.source} />}
        </div>
      </header>

      {latest ? (
        <>
          <p className="text-2xl font-semibold tabular-nums">{withUnit(latest.value)}</p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={latest.t}>{formatUtc(latest.t, { seconds: false })}</time>
            {now && ` · ${formatRelative(latest.t, { now })}`} · {describeSource(latest.source)}
          </p>
          {ind.detail && <p className="text-xs text-muted-foreground">{ind.detail(latest.record)}</p>}
          <div className="flex items-center gap-3">
            <Sparkline points={ind.points} />
            <p className="text-xs text-muted-foreground" data-slot="trend">
              {ind.count === 1
                ? 'Un solo registro: sin tendencia todavía.'
                : `${ind.count} registros · primero ${withUnit(ind.first.value)}, último ${withUnit(latest.value)} · rango ${fmt(ind.min)}–${fmt(ind.max)}`}
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Sin datos.</span> {ind.missing}
        </p>
      )}
      {ind.note && <p className="text-xs text-muted-foreground">{ind.note}</p>}
    </article>
  )
}

/**
 * Panel descriptivo de una dimensión (fatiga, respuesta al estrés…): una
 * tarjeta por indicador con último valor, fecha, procedencia y evolución.
 * Sin puntuación compuesta ni clasificación clínica.
 */
export function DimensionPanel({ indicators, now, label }) {
  const available = indicators.filter((i) => i.latest).length
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground" data-slot="coverage">
        {available} de {indicators.length} indicadores con datos.
        {available < indicators.length && ' Los que faltan indican cómo obtenerlos.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4" role="list" aria-label={label}>
        {indicators.map((indicator) => (
          <div role="listitem" key={indicator.key}>
            <IndicatorCard indicator={indicator} now={now} />
          </div>
        ))}
      </div>
    </div>
  )
}
