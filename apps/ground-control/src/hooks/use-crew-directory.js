import { useMemo } from 'react'
import { collectCrew, latestByCrew } from '@astronaut-wellness/ui'
import { useRealtimeCollection } from '../realtime/realtime-context.js'

/** Lecturas que se cargan para resúmenes y listados (máximo admitido por la API: 500). */
export const OVERVIEW_VITALS_LIMIT = 200

/**
 * Directorio de tripulantes de Ground Control: perfiles recibidos más los
 * identificadores que aparecen en mediciones, autoevaluaciones o alertas reales
 * ("Tripulante desconocido"). Incluye la última lectura y las alertas activas
 * de cada uno.
 */
export function useCrewDirectory() {
  const crew = useRealtimeCollection('crew_member')
  const vitals = useRealtimeCollection('vital_signs', { limit: OVERVIEW_VITALS_LIMIT })
  const checkIns = useRealtimeCollection('wellness_check_in', { limit: 100 })
  const activeAlerts = useRealtimeCollection('alert', { status: 'active', limit: 500 })

  const members = useMemo(
    () => collectCrew(crew.records, vitals.records, checkIns.records, activeAlerts.records),
    [crew.records, vitals.records, checkIns.records, activeAlerts.records],
  )
  const latestReadings = useMemo(() => latestByCrew(vitals.records), [vitals.records])
  const activeAlertsByCrew = useMemo(() => {
    const counts = new Map()
    for (const alert of activeAlerts.records) {
      if (alert.crewMemberId) counts.set(alert.crewMemberId, (counts.get(alert.crewMemberId) ?? 0) + 1)
    }
    return counts
  }, [activeAlerts.records])

  const collections = [crew, vitals, checkIns, activeAlerts]
  return {
    members,
    crewById: new Map(members.map((m) => [m.id, m])),
    latestReadings,
    activeAlertsByCrew,
    crew,
    vitals,
    checkIns,
    activeAlerts,
    loading: collections.some((c) => c.loading),
    error: collections.find((c) => c.error)?.error ?? null,
    reload: () => Promise.all(collections.map((c) => c.reload())),
  }
}
