import { Activity } from 'lucide-react'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { VITAL_SIGN_LABELS, formatLocal, formatUtc, formatVitalSign } from '@astronaut-wellness/ui/lib/format'

const KEYS = Object.keys(VITAL_SIGN_LABELS)

/**
 * Valores de una lectura de constantes con sus unidades, hora y origen.
 * Sin colores ni rangos de normalidad: solo los valores recibidos.
 */
export function VitalSignsSummary({ reading, emptyTitle = 'Sin mediciones', emptyDescription }) {
  if (!reading) return <EmptyState icon={Activity} title={emptyTitle} description={emptyDescription} />

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Registrada el{' '}
          <time dateTime={reading.recordedAt} title={formatLocal(reading.recordedAt)}>
            {formatUtc(reading.recordedAt)}
          </time>
        </span>
        <SourceBadge source={reading.source} />
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KEYS.map((key) => (
          <div key={key} className="rounded-lg border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{VITAL_SIGN_LABELS[key]}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatVitalSign(reading, key)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
