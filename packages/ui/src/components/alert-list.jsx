import { BellOff } from 'lucide-react'
import { Badge } from '@astronaut-wellness/ui/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { StatusIndicator } from '@astronaut-wellness/ui/components/status-indicator'
import { MISSING_TEXT, formatLocal, formatUtc } from '@astronaut-wellness/ui/lib/format'
import {
  ALERT_CATEGORY_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_TONES,
  ALERT_STATUS_LABELS,
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
