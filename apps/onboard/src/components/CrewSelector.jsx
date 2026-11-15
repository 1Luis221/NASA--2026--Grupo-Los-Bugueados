import { useId } from 'react'
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, resolveCrewMember } from '@astronaut-wellness/ui'
import { useCrewSelection } from '../state/app-context.js'

/**
 * Selector del tripulante que usa esta interfaz. Se recuerda en el navegador.
 * No es autenticación: solo decide de quién se muestran y registran los datos.
 */
export function CrewSelector({ className }) {
  const id = useId()
  const { crewList, selectedId, select, loading, error } = useCrewSelection()
  const byId = new Map(crewList.map((m) => [m.id, m]))

  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <Label htmlFor={id} className="whitespace-nowrap text-sm text-muted-foreground">
        Tripulante
      </Label>
      <Select value={selectedId ?? ''} onValueChange={select} disabled={loading || Boolean(error) || crewList.length === 0}>
        <SelectTrigger id={id} className="w-56" aria-describedby={error ? `${id}-error` : undefined}>
          <SelectValue placeholder={loading ? 'Cargando…' : crewList.length ? 'Selecciona un tripulante' : 'No hay tripulantes'} />
        </SelectTrigger>
        <SelectContent>
          {crewList.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {resolveCrewMember(member.id, byId).displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span id={`${id}-error`} className="sr-only">
          No se pudo cargar la tripulación
        </span>
      )}
    </div>
  )
}
