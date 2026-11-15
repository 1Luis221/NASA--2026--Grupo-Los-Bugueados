import { BellOff } from 'lucide-react'
import { Badge } from '@astronaut-wellness/ui/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { StatusIndicator } from '@astronaut-wellness/ui/components/status-indicator'
import { MISSING_TEXT, describeSource, formatLocal, formatUtc } from '@astronaut-wellness/ui/lib/format'
import {
  ALERT_CATEGORY_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_TONES,
  ALERT_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  labelFor,
} from '@astronaut-wellness/ui/lib/labels'

function DateCell({ iso }) {
  if (!iso) return <span className="text-muted-foreground">{MISSING_TEXT}</span>
  return (
    <time dateTime={iso} title={formatLocal(iso)} className="whitespace-nowrap tabular-nums">
      {formatUtc(iso, { seconds: false })}
    </time>
  )
}

/** Regla que originó la alerta; las de demostración se identifican siempre como tales. */
function RuleInfo({ rule }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <Badge variant="outline">{rule.demonstrative ? 'Regla demostrativa' : 'Regla'}</Badge>
      <span className="text-muted-foreground" title={rule.name}>
        <span className="font-mono">{rule.id}</span>
        {rule.parameters && ` · ${Object.entries(rule.parameters).map(([k, v]) => `${k}=${v}`).join(', ')}`}
      </span>
    </p>
  )
}

/** Registros que sustentan la alerta, con tipo, momento y procedencia. */
function Evidence({ evidence }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Evidencia ({evidence.length})</summary>
      <ul className="mt-1 space-y-1">
        {evidence.map((e) => (
          <li key={e.id}>
            <span className="font-medium">{labelFor(ENTITY_TYPE_LABELS, e.entityType)}</span> · {formatUtc(e.recordedAt, { seconds: false })} ·{' '}
            {describeSource(e.source)} — {e.summary}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Tabla de alertas (solo lectura). La severidad y el estado se muestran con
 * texto además de color. `renderCrew(crewMemberId)` decide cómo mostrar al
 * tripulante relacionado (p. ej. un enlace al detalle).
 */
export function AlertList({
  alerts = [],
  renderCrew = (id) => id,
  caption = 'Alertas',
  emptyTitle = 'Sin alertas',
  emptyDescription = 'No se ha recibido ninguna alerta.',
  showCrew = true,
}) {
  if (alerts.length === 0) return <EmptyState icon={BellOff} title={emptyTitle} description={emptyDescription} />

  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Alerta</TableHead>
          <TableHead scope="col">Severidad</TableHead>
          <TableHead scope="col">Estado</TableHead>
          {showCrew && <TableHead scope="col">Tripulante</TableHead>}
          <TableHead scope="col">Creada (UTC)</TableHead>
          <TableHead scope="col">Resuelta (UTC)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow key={alert.id}>
            <TableCell className="min-w-56 whitespace-normal">
              <p className="font-medium">{alert.title}</p>
              {alert.message && <p className="text-xs text-muted-foreground">{alert.message}</p>}
              <p className="text-xs text-muted-foreground">{labelFor(ALERT_CATEGORY_LABELS, alert.category)}</p>
              {alert.rule && <RuleInfo rule={alert.rule} />}
              {alert.evidence?.length > 0 && <Evidence evidence={alert.evidence} />}
            </TableCell>
            <TableCell>
              <StatusIndicator tone={ALERT_SEVERITY_TONES[alert.severity] ?? 'neutral'} label={labelFor(ALERT_SEVERITY_LABELS, alert.severity)} />
            </TableCell>
            <TableCell>
              <Badge variant={alert.status === 'active' ? 'default' : 'secondary'}>{labelFor(ALERT_STATUS_LABELS, alert.status)}</Badge>
            </TableCell>
            {showCrew && (
              <TableCell>{alert.crewMemberId ? renderCrew(alert.crewMemberId) : <span className="text-muted-foreground">General</span>}</TableCell>
            )}
            <TableCell>
              <DateCell iso={alert.createdAt} />
            </TableCell>
            <TableCell>
              <DateCell iso={alert.resolvedAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
