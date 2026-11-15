import { Link } from 'react-router-dom'
import { resolveCrewMember } from '@astronaut-wellness/ui'

/** Enlace al detalle de un tripulante (o "Tripulante desconocido · id"). */
export function CrewLink({ id, crewById }) {
  const member = resolveCrewMember(id, crewById)
  return (
    <Link to={`/crew/${id}`} className="text-primary underline-offset-4 hover:underline" title={id}>
      {member.displayName}
    </Link>
  )
}
