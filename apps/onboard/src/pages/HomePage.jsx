import { Link } from 'react-router-dom'
import {
  AlertList,
  Badge,
  Button,
  CREW_STATUS_LABELS,
  ErrorState,
  LoadingState,
  PageSection,
  ROLE_LABELS,
  VitalSignsSummary,
  WellnessSummary,
  formatUtc,
  labelFor,
  useResource,
} from '@astronaut-wellness/ui'
import { ONBOARD_POLL_INTERVAL_MS } from '../api/onboard-api.js'
import { LinkStatus, SIMULATED_LINK_NOTE } from '../components/LinkStatus.jsx'
import { RequireCrew } from '../components/RequireCrew.jsx'
import { useOnboardApi, useSyncState } from '../state/app-context.js'

function SyncSummary() {
  const { queue, dispatcherRunning, updatedAt, error } = useSyncState()
  const waiting = queue ? queue.byStatus.pending + queue.byStatus.sending + queue.byStatus.retry_scheduled : null
  return (
    <PageSection
      title="Enlace y sincronización"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/sync">Ver detalle</Link>
        </Button>
      }
    >
      <div className="space-y-2 text-sm">
        <LinkStatus />
        <p className="text-xs text-muted-foreground">{SIMULATED_LINK_NOTE}</p>
        {error && !queue ? (
          <p className="text-destructive">No se pudo consultar la cola de sincronización: {error.message}</p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Eventos pendientes de envío</dt>
            <dd className="font-medium tabular-nums">{waiting ?? '—'}</dd>
            <dt className="text-muted-foreground">Fallidos</dt>
            <dd className="tabular-nums">{queue?.byStatus.failed ?? '—'}</dd>
            <dt className="text-muted-foreground">Despachador</dt>
            <dd>{dispatcherRunning === null ? '—' : dispatcherRunning ? 'En marcha' : 'Detenido'}</dd>
            <dt className="text-muted-foreground">Última actualización</dt>
            <dd>{formatUtc(updatedAt)}</dd>
          </dl>
        )}
      </div>
    </PageSection>
  )
}

function CrewHome({ member }) {
  const api = useOnboardApi()
  const vitals = useResource(`home-vitals|${member.id}`, (signal) => api.listVitals({ crewMemberId: member.id, limit: 1, signal }), {
    pollIntervalMs: ONBOARD_POLL_INTERVAL_MS,
    keepPreviousData: false,
  })
  const checkIns = useResource(`home-checkins|${member.id}`, (signal) => api.listCheckIns({ crewMemberId: member.id, limit: 20, signal }), {
    pollIntervalMs: ONBOARD_POLL_INTERVAL_MS,
    keepPreviousData: false,
  })
  const alerts = useResource('home-alerts', (signal) => api.listAlerts({ limit: 50, signal }), { pollIntervalMs: ONBOARD_POLL_INTERVAL_MS })

  // Alertas de este tripulante y alertas generales de la nave (sin tripulante asociado).
  const related = (alerts.data?.data ?? []).filter((a) => !a.crewMemberId || a.crewMemberId === member.id)
  const checkInList = checkIns.data?.data ?? []

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <PageSection title="Tripulante seleccionado">
        <div className="space-y-2">
          <p className="text-lg font-semibold">
            {member.name}
            {member.callsign && <span className="text-muted-foreground"> ({member.callsign})</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{labelFor(ROLE_LABELS, member.role)}</Badge>
            <Badge variant="outline">{labelFor(CREW_STATUS_LABELS, member.status)}</Badge>
            {member.agency && <Badge variant="outline">{member.agency}</Badge>}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{member.id}</p>
        </div>
      </PageSection>

      <SyncSummary />

      <PageSection title="Últimos signos vitales" description="Valores con su unidad y origen. Sin rangos de normalidad.">
        {vitals.loading ? (
          <LoadingState label="Cargando signos vitales…" rows={2} />
        ) : vitals.error ? (
          <ErrorState message={vitals.error.message} onRetry={vitals.reload} />
        ) : (
          <VitalSignsSummary reading={vitals.data?.data?.[0]} emptyDescription="Onboard API no tiene mediciones de este tripulante." />
        )}
      </PageSection>

      <PageSection title="Bienestar autoinformado">
        {checkIns.loading ? (
          <LoadingState label="Cargando autoevaluaciones…" rows={2} />
        ) : checkIns.error ? (
          <ErrorState message={checkIns.error.message} onRetry={checkIns.reload} />
        ) : (
          <div className="space-y-4">
            <WellnessSummary checkIns={checkInList} />
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {checkInList[0] ? (
                  <>
                    Última autoevaluación: <time dateTime={checkInList[0].recordedAt}>{formatUtc(checkInList[0].recordedAt)}</time>
                  </>
                ) : (
                  'Todavía no has registrado ninguna autoevaluación.'
                )}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link to="/check-in">{checkInList[0] ? 'Ver historial o registrar' : 'Registrar autoevaluación'}</Link>
              </Button>
            </p>
          </div>
        )}
      </PageSection>

      <PageSection title="Alertas" description="De este tripulante y generales de la nave." className="xl:col-span-2">
        {alerts.loading ? (
          <LoadingState label="Cargando alertas…" rows={2} />
        ) : alerts.error ? (
          <ErrorState message={alerts.error.message} onRetry={alerts.reload} />
        ) : (
          <AlertList
            alerts={related}
            caption="Alertas a bordo"
            renderCrew={(id) => (id === member.id ? member.name : id)}
            emptyDescription="No hay alertas para este tripulante ni alertas generales."
          />
        )}
      </PageSection>
    </div>
  )
}

export function HomePage() {
  return <RequireCrew>{(member) => <CrewHome member={member} />}</RequireCrew>
}
