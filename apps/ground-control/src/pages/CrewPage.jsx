import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, CrewCard, EmptyState, ErrorState, LoadingState } from '@astronaut-wellness/ui'
import { useCrewDirectory } from '../hooks/use-crew-directory.js'
import { useNow } from '@astronaut-wellness/ui'

export function CrewPage() {
  const { members, latestReadings, activeAlertsByCrew, loading, error, reload } = useCrewDirectory()
  const now = useNow()
  const unknownCount = members.filter((m) => !m.known).length

  if (loading && members.length === 0) return <LoadingState label="Cargando tripulación…" rows={3} />
  if (error && members.length === 0) return <ErrorState message={error.message} onRetry={reload} />
  if (members.length === 0) {
    return (
      <EmptyState
        title="Sin tripulantes"
        description="Ground API no ha recibido perfiles ni mediciones de ningún tripulante."
      />
    )
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState title="Algunos datos no se pudieron actualizar" message={error.message} onRetry={reload} />}
      {unknownCount > 0 && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>
            {unknownCount === 1 ? '1 tripulante sin perfil' : `${unknownCount} tripulantes sin perfil`}
          </AlertTitle>
          <AlertDescription>
            Ground API tiene mediciones de estos identificadores pero no su perfil (por ejemplo, tras reiniciarse). Se muestran
            solo con su identificador real.
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {members.length} {members.length === 1 ? 'tripulante' : 'tripulantes'}
      </p>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Tripulación">
        {members.map((member) => (
          <li key={member.id}>
            <CrewCard
              member={member}
              latestReading={latestReadings.get(member.id)}
              activeAlertCount={activeAlertsByCrew.get(member.id) ?? 0}
              linkComponent={Link}
              to={`/crew/${member.id}`}
              headingLevel={2}
              now={now}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
