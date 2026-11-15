import { UserRoundSearch, Users } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@astronaut-wellness/ui'
import { useCrewSelection } from '../state/app-context.js'
import { CrewSelector } from './CrewSelector.jsx'

/** Muestra `children(tripulante)` solo cuando hay un tripulante válido seleccionado. */
export function RequireCrew({ children }) {
  const { selected, crewList, loading, error } = useCrewSelection()

  if (loading && crewList.length === 0) return <LoadingState label="Cargando tripulación…" />
  if (error && crewList.length === 0) return <ErrorState title="No se pudo cargar la tripulación" message={error.message} />
  if (crewList.length === 0) {
    return <EmptyState icon={Users} title="Sin tripulantes" description="Onboard API no tiene ningún tripulante registrado." />
  }
  if (!selected) {
    return (
      <EmptyState
        icon={UserRoundSearch}
        title="Ningún tripulante seleccionado"
        description="Elige de quién quieres ver o registrar datos. La selección se recuerda en este navegador; no es un inicio de sesión."
        action={<CrewSelector className="flex flex-col items-center gap-2" />}
      />
    )
  }
  return children(selected)
}
