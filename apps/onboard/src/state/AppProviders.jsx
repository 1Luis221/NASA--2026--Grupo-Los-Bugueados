import { useCallback, useEffect, useMemo, useState } from 'react'
import { useResource } from '@astronaut-wellness/ui'
import { ONBOARD_POLL_INTERVAL_MS, onboardApi } from '../api/onboard-api.js'
import { OnboardContext } from './app-context.js'
import { SYNC_EVENTS_LIMIT, UNACKNOWLEDGED, buildIndex } from './sync-index.js'

export const SELECTED_CREW_STORAGE_KEY = 'astronaut-wellness.onboard.selectedCrewId'

// localStorage puede no existir o lanzar excepciones (modo privado, cuota): nunca debe romper la interfaz.
function readStoredId(storage) {
  try {
    return storage?.getItem(SELECTED_CREW_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}
function writeStoredId(storage, id) {
  try {
    if (id) storage?.setItem(SELECTED_CREW_STORAGE_KEY, id)
    else storage?.removeItem(SELECTED_CREW_STORAGE_KEY)
  } catch {
    /* sin persistencia: la selección sigue funcionando en memoria */
  }
}

const defaultStorage = () => (typeof window !== 'undefined' ? window.localStorage : undefined)

/**
 * Proveedor raíz de Onboard: un único sondeo del estado de sincronización para
 * toda la app (sin solapes y en pausa con la pestaña oculta) y la selección de
 * tripulante persistida en el navegador.
 */
export function AppProviders({
  children,
  api = onboardApi,
  pollIntervalMs = ONBOARD_POLL_INTERVAL_MS,
  storage = defaultStorage(),
  devTools = import.meta.env.DEV,
}) {
  // --- Tripulación y selección -------------------------------------------
  const crew = useResource('crew', (signal) => api.listCrew({ signal }))
  const [selectedId, setSelectedId] = useState(() => readStoredId(storage))
  const crewList = useMemo(() => crew.data?.data ?? [], [crew.data])
  const selected = crewList.find((member) => member.id === selectedId) ?? null
  // El identificador guardado ya no corresponde a ningún tripulante de Onboard API.
  const missingId = crew.status === 'success' && selectedId && !selected ? selectedId : null

  useEffect(() => {
    if (missingId) writeStoredId(storage, null)
  }, [missingId, storage])

  const select = useCallback(
    (id) => {
      setSelectedId(id)
      writeStoredId(storage, id)
    },
    [storage],
  )

  // --- Sincronización (sondeo ~3 s) --------------------------------------
  // Instantánea atómica de la cola: se guarda cuándo se pidió para poder usarla como evidencia.
  const status = useResource(
    'sync-status',
    async (signal) => {
      const requestedAt = new Date().toISOString()
      const payload = await api.getSyncStatus({ signal })
      return { ...payload, requestedAt, receivedAt: new Date().toISOString() }
    },
    { pollIntervalMs },
  )
  // Eventos sin acuse por estado (para mostrar pendientes, reintentos y errores).
  const index = useResource(
    'sync-index',
    async (signal) => {
      const requestedAt = new Date().toISOString()
      const lists = await Promise.all(UNACKNOWLEDGED.map((s) => api.listSyncEvents({ status: s, limit: SYNC_EVENTS_LIMIT, signal })))
      return buildIndex(requestedAt, Object.fromEntries(UNACKNOWLEDGED.map((s, i) => [s, lists[i]?.data ?? []])))
    },
    { pollIntervalMs },
  )
  const { reload: reloadStatus } = status
  const { reload: reloadIndex } = index
  const refresh = useCallback(() => Promise.all([reloadStatus(), reloadIndex()]), [reloadStatus, reloadIndex])

  const value = useMemo(
    () => ({
      api,
      devTools,
      crew: { list: crewList, loading: crew.loading, error: crew.error, reload: crew.reload },
      selection: { selectedId: selected ? selectedId : null, selected, missingId, select, crewList, loading: crew.loading, error: crew.error },
      sync: {
        link: status.data?.data?.link ?? null,
        queue: status.data?.data?.queue ?? null,
        dispatcherRunning: status.data?.data?.dispatcherRunning ?? null,
        updatedAt: status.data?.receivedAt ?? null,
        snapshot: status.data?.data?.queue
          ? { requestedAt: status.data.requestedAt, receivedAt: status.data.receivedAt, byStatus: status.data.data.queue.byStatus }
          : null,
        loading: status.loading,
        error: status.error ?? index.error,
        index: index.data ?? null,
        refresh,
      },
    }),
    [api, devTools, crewList, crew.loading, crew.error, crew.reload, selected, selectedId, missingId, select, status.data, status.loading, status.error, index.data, index.error, refresh],
  )

  return <OnboardContext.Provider value={value}>{children}</OnboardContext.Provider>
}
