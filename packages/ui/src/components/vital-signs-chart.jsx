import { useId, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@astronaut-wellness/ui/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { VITAL_SIGN_LABELS, formatNumber, formatVitalSign, unitLabel } from '@astronaut-wellness/ui/lib/format'
import { VITAL_SIGN_METRICS, summarizeVitalSign, toVitalPoints } from '@astronaut-wellness/ui/lib/vitals'

/** Presión arterial: dos series. El resto, una serie con su valor. */
const SERIES = {
  bloodPressure: [
    { dataKey: 'systolic', name: 'Sistólica', color: 'var(--chart-1)' },
    { dataKey: 'diastolic', name: 'Diastólica', color: 'var(--chart-4)' },
  ],
}
const seriesFor = (key) => SERIES[key] ?? [{ dataKey: 'value', name: VITAL_SIGN_LABELS[key], color: 'var(--chart-1)' }]

/**
 * Historial de un signo vital con Recharts, acompañado SIEMPRE de un resumen
 * textual y de una tabla accesible con las últimas lecturas. Sin animaciones
 * ni colores de normal/anormal: solo los valores recibidos.
 */
export function VitalSignsChart({ readings = [], defaultMetric = 'heartRate', tableRows = 8, height = 260 }) {
  const [metric, setMetric] = useState(defaultMetric)
  const captionId = useId()
  const points = toVitalPoints(readings, metric)
  const summary = summarizeVitalSign(readings, metric)
  const series = seriesFor(metric)
  const unit = unitLabel(points.at(-1)?.unit)
  const metricLabel = VITAL_SIGN_LABELS[metric].toLowerCase()

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Medición representada" className="flex flex-wrap gap-2">
        {VITAL_SIGN_METRICS.map(({ key, short }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={metric === key ? 'default' : 'outline'}
            aria-pressed={metric === key}
            title={VITAL_SIGN_LABELS[key]}
            onClick={() => setMetric(key)}
          >
            {short}{' '}
            <span className="sr-only">({VITAL_SIGN_LABELS[key]})</span>
          </Button>
        ))}
      </div>

      {points.length === 0 ? (
        <EmptyState title={`Sin lecturas de ${metricLabel}`} description="No hay datos para representar." />
      ) : (
        <figure className="space-y-3" aria-labelledby={captionId}>
          <figcaption id={captionId} className="text-sm text-muted-foreground">
            {summary}
          </figcaption>
          <div role="img" aria-label={`Gráfico. ${summary}`} className="w-full">
            <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 600, height }}>
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} accessibilityLayer={false}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 12 }}
                  domain={['auto', 'auto']}
                  width={56}
                  label={{ value: unit, angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  formatter={(value, name) => [`${formatNumber(value)} ${unit}`.trim(), name]}
                  labelFormatter={(label) => `${label} UTC`}
                />
                {series.length > 1 && <Legend />}
                {series.map((s) => (
                  <Line
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={points.length < 30}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Table>
            <TableCaption>
              Últimas {Math.min(tableRows, points.length)} lecturas de {metricLabel}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Hora (UTC)</TableHead>
                <TableHead scope="col">Valor</TableHead>
                <TableHead scope="col">Origen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points
                .slice(-tableRows)
                .reverse()
                .map((p) => (
                  <TableRow key={p.reading.id}>
                    <TableCell>{p.time}</TableCell>
                    <TableCell className="tabular-nums">{formatVitalSign(p.reading, metric)}</TableCell>
                    <TableCell>
                      <SourceBadge source={p.reading.source} />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </figure>
      )}
    </div>
  )
}
