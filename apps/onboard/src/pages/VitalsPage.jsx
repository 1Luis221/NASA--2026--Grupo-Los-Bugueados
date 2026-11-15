import { FlaskConical } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  ErrorState,
  LoadingState,
  PageSection,
  VitalSignsChart,
  VitalSignsSummary,
  useResource,
} from '@astronaut-wellness/ui'
import { ONBOARD_POLL_INTERVAL_MS } from '../api/onboard-api.js'
import { RequireCrew } from '../components/RequireCrew.jsx'
import { useOnboardApi } from '../state/app-context.js'

const VITALS_HISTORY_LIMIT = 100

function Vitals({ member }) {
  const api = useOnboardApi()
  const vitals = useResource(
    `vitals|${member.id}`,
    (signal) => api.listVitals({ crewMemberId: member.id, limit: VITALS_HISTORY_LIMIT, signal }),
    { pollIntervalMs: ONBOARD_POLL_INTERVAL_MS, keepPreviousData: false },
  )
  const readings = vitals.data?.data ?? []
  const anySimulated = readings.some((r) => r.source?.simulated)

  if (vitals.loading) return <LoadingState label="Cargando signos vitales…" rows={4} />
  if (vitals.error && !vitals.data) return <ErrorState message={vitals.error.message} onRetry={vitals.reload} />

  return (
    <div className="space-y-6">
      {anySimulated && (
        <Alert>
          <FlaskConical aria-hidden="true" />
          <AlertTitle>Datos simulados</AlertTitle>
          <AlertDescription>
            Estas lecturas las genera el simulador de telemetría de Onboard API para la demostración. No son mediciones médicas
            reales ni se clasifican como normales o anormales.
          </AlertDescription>
        </Alert>
      )}
      {vitals.error && <ErrorState title="No se pudieron actualizar los datos" message={vitals.error.message} onRetry={vitals.reload} />}

      <PageSection title="Última medición" description={`${member.name}: valores recibidos con unidad, fecha y origen.`}>
        <VitalSignsSummary reading={readings[0]} emptyDescription="Onboard API no tiene mediciones de este tripulante." />
      </PageSection>

      <PageSection title="Historial" description={`Hasta ${VITALS_HISTORY_LIMIT} lecturas más recientes; se actualiza cada ~3 s.`}>
        <VitalSignsChart readings={readings} />
      </PageSection>
    </div>
  )
}

export function VitalsPage() {
  return <RequireCrew>{(member) => <Vitals member={member} />}</RequireCrew>
}
