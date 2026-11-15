import { ChevronRight, UserRound, UserRoundX } from 'lucide-react'
import { Badge } from '@astronaut-wellness/ui/components/ui/badge'
import { Button } from '@astronaut-wellness/ui/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@astronaut-wellness/ui/components/ui/card'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { formatRelative, formatUtc, formatVitalSign } from '@astronaut-wellness/ui/lib/format'
import { CREW_STATUS_LABELS, ROLE_LABELS, labelFor } from '@astronaut-wellness/ui/lib/labels'

/**
 * Tarjeta de tripulante. `member` viene de resolveCrewMember/collectCrew:
 * si no hay perfil (`known: false`) solo se muestra su identificador real.
 */
export function CrewCard({
  member,
  latestReading,
  activeAlertCount = 0,
  linkComponent: LinkComponent = 'a',
  to,
  actionLabel = 'Ver detalle',
  headingLevel = 3,
  now,
}) {
  const Heading = `h${headingLevel}`
  const Icon = member.known ? UserRound : UserRoundX
  const linkProps = LinkComponent === 'a' ? { href: to } : { to }

  return (
    <Card data-slot="crew-card" className="gap-4 py-5">
      <CardHeader className="flex flex-row items-start gap-3 px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <Heading className="truncate font-semibold">{member.displayName}</Heading>
          <p className="truncate font-mono text-xs text-muted-foreground" title={member.id}>
            <span className="sr-only">Identificador: </span>
            {member.id}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {member.known ? (
              <>
                <Badge variant="secondary">{labelFor(ROLE_LABELS, member.role)}</Badge>
                <Badge variant="outline">{labelFor(CREW_STATUS_LABELS, member.status)}</Badge>
                {member.agency && <Badge variant="outline">{member.agency}</Badge>}
              </>
            ) : (
              <Badge variant="outline">Perfil no recibido por Ground API</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 px-5 text-sm">
        {latestReading ? (
          <div className="space-y-1">
            <p className="text-muted-foreground">
              Última medición:{' '}
              <time dateTime={latestReading.recordedAt} title={formatUtc(latestReading.recordedAt)}>
                {formatRelative(latestReading.recordedAt, now && { now })}
              </time>
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
              <span>FC {formatVitalSign(latestReading, 'heartRate')}</span>
              <span>SpO₂ {formatVitalSign(latestReading, 'oxygenSaturation')}</span>
              <SourceBadge source={latestReading.source} />
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Sin mediciones recibidas.</p>
        )}
        <p>
          Alertas activas: <span className="font-medium tabular-nums">{activeAlertCount}</span>
        </p>
      </CardContent>

      {to && (
        <CardFooter className="px-5">
          <Button asChild variant="outline" size="sm">
            <LinkComponent {...linkProps}>
              {actionLabel}{' '}
              <span className="sr-only">de {member.displayName}</span>
              <ChevronRight aria-hidden="true" />
            </LinkComponent>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
