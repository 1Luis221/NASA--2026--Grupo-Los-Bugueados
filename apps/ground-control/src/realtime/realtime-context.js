import { createContext, useContext, useSyncExternalStore } from 'react'
import { useResource } from '@astronaut-wellness/ui'
import { COLLECTIONS } from './collections.js'

/** Almacenes y API: valor estable durante toda la vida del proveedor. */
export const RealtimeDataContext = createContext(null)

/**
 * Estado de la conexión Socket.IO entre el navegador y Ground API.
 * NO describe el enlace nave–Tierra: Ground API no puede verificarlo.
 */
export const RealtimeStatusContext = createContext({
  status: 'disconnected',
  lastConnectedAt: null,
  lastEventAt: null,
  lastError: null,
  connectionEpoch: 0,
  dataEpoch: 0,
})

/** { status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected', … } */
export const useRealtimeStatus = () => useContext(RealtimeStatusContext)

/**
 * Resumen de recepción de Ground API: { stats, lastReceivedAt, error,
 * updatedAt, reset, dismissReset }. `reset` existe si se detectó un reinicio.
 */
export const SyncOverviewContext = createContext({
  stats: null,
  lastReceivedAt: null,
  error: null,
  updatedAt: null,
  reset: null,
  dismissReset: () => {},
})

export const useSyncOverview = () => useContext(SyncOverviewContext)

/** Cliente de Ground API del proveedor (el real, o uno simulado en pruebas). */
export function useGroundApi() {
  const context = useContext(RealtimeDataContext)
  if (!context) throw new Error('useGroundApi requiere <RealtimeProvider>')
  return context.api
}

const FILTER_KEYS = ['crewMemberId', 'status', 'severity']

/**
 * Colección en tiempo real: carga por HTTP (al montar, al cambiar la consulta
 * y en cada (re)conexión del socket), la fusiona en el almacén compartido y se
 * actualiza con los eventos Socket.IO. Los filtros se aplican igual en la
 * consulta HTTP y sobre el almacén local.
 */
export function useRealtimeCollection(entityType, query = {}) {
  const context = useContext(RealtimeDataContext)
  if (!context) throw new Error('useRealtimeCollection requiere <RealtimeProvider>')
  const { stores, api } = context
  const { dataEpoch } = useRealtimeStatus()
  const store = stores[entityType]
  const config = COLLECTIONS[entityType]

  const records = useSyncExternalStore(store.subscribe, store.getSnapshot)

  const queryKey = JSON.stringify(query)
  const resource = useResource(`${entityType}|${queryKey}|${dataEpoch}`, async (signal) => {
    const payload = await config.fetch(api, { ...JSON.parse(queryKey), signal })
    store.upsertMany(payload?.data ?? [])
    return payload
  })

  const filters = FILTER_KEYS.filter((key) => query[key] !== undefined)
  const matching = filters.length ? records.filter((r) => filters.every((key) => r[key] === query[key])) : records
  const visible = query.limit ? matching.slice(0, query.limit) : matching

  return {
    records: visible,
    loading: resource.loading && visible.length === 0,
    refreshing: resource.refreshing,
    error: resource.error,
    isEmpty: !resource.loading && !resource.error && visible.length === 0,
    reload: resource.reload,
  }
}
