import { useState } from 'react'
import { CheckInTable, ErrorState, LoadingState, PageSection, useResource } from '@astronaut-wellness/ui'
import { CheckInForm } from '../components/CheckInForm.jsx'
import { CheckInReceipt } from '../components/CheckInReceipt.jsx'
import { RequireCrew } from '../components/RequireCrew.jsx'
import { SyncStatusLabel } from '../components/SyncStatusLabel.jsx'
import { useOnboardApi, useSyncState } from '../state/app-context.js'
import { deriveSyncStatus } from '../state/sync-index.js'

function CheckIn({ member }) {
  const api = useOnboardApi()
  const sync = useSyncState()
  const [saved, setSaved] = useState(null)
  const history = useResource(
    `checkins|${member.id}`,
    async (signal) => ({ ...(await api.listCheckIns({ crewMemberId: member.id, limit: 20, signal })), receivedAt: new Date().toISOString() }),
    { keepPreviousData: false },
  )

  const handleSaved = (result) => {
    setSaved(result)
    history.reload()
    sync.refresh() // consulta la cola en el acto para seguir el nuevo evento
  }

  return (
    <div className="space-y-6">
      {saved && saved.checkIn.crewMemberId === member.id && <CheckInReceipt checkIn={saved.checkIn} savedAt={saved.savedAt} />}

      <PageSection title={`Nueva autoevaluación · ${member.name}`}>
        <CheckInForm key={member.id} crewMember={member} onSaved={handleSaved} />
      </PageSection>

      <PageSection
        title="Historial"
        description="Guardadas en Onboard API. «Recibido por Tierra» solo se muestra con evidencia verificable de la cola de la nave."
      >
        {history.loading ? (
          <LoadingState label="Cargando historial…" rows={2} />
        ) : history.error ? (
          <ErrorState message={history.error.message} onRetry={history.reload} />
        ) : (
          <CheckInTable
            checkIns={history.data?.data ?? []}
            caption={`Autoevaluaciones de ${member.name}`}
            emptyDescription="Todavía no has registrado ninguna autoevaluación."
            extraColumn={{
              header: 'Sincronización con Tierra',
              // Se sabe que existe desde que llegó el historial (hora del navegador, sin depender del reloj del servidor).
              render: (checkIn) => (
                <SyncStatusLabel
                  derived={deriveSyncStatus({ index: sync.index, snapshot: sync.snapshot, entityId: checkIn.id, existsSince: history.data?.receivedAt })}
                />
              ),
            }}
          />
        )}
      </PageSection>
    </div>
  )
}

export function CheckInPage() {
  return <RequireCrew>{(member) => <CheckIn member={member} />}</RequireCrew>
}
