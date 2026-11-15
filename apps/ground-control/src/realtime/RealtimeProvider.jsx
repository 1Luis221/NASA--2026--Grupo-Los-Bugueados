import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { usePolling } from '@astronaut-wellness/ui'
import { groundApi } from '../api/ground-api.js'
import { COLLECTIONS, createStores } from './collections.js'
import { RealtimeDataContext, RealtimeStatusContext, SyncOverviewContext } from './realtime-context.js'

/** Socket al mismo origen (/socket.io, proxy de Vite). Se conecta desde el proveedor. */
const defaultSocketFactory = () => io({ autoConnect: false })

/** Frecuencia de consulta de /api/sync/stats (vigencia de los datos). */
export const SYNC_OVERVIEW_INTERVAL_MS = 5000

const nowIso = () => new Date().toISOString()

/**
 * Única conexión Socket.IO de Ground Control. Debe envolver toda la app.
 *
 * - El socket se crea una sola vez (también con React StrictMode) y se
 *   conecta/desconecta con el ciclo de vida del proveedor.
 * - Cada payload se valida con el esquema tolerante del contrato y se fusiona
 *   por UUID en su almacén; los inválidos se descartan.
 * - Vigencia: consulta /api/sync/stats al conectar y cada 5 s. `processedEvents`
 *   solo crece mientras Ground API sigue en marcha; si retrocede, Ground API se
 *   reinició (todo en memoria): se vacían los almacenes del navegador para no
 *   presentar como actuales datos que el servidor ya no tiene.
 * - `dataEpoch` se incrementa tras cada (re)conexión ya comprobada y tras un
 *   reinicio: las colecciones montadas recargan entonces por HTTP.
 */
export function RealtimeProvider({
  children,
  socketFactory = defaultSocketFactory,
  api = groundApi,
  limits,
  overviewIntervalMs = SYNC_OVERVIEW_INTERVAL_MS,
}) {
  const [stores] = useState(() => createStores(limits))
  const socketRef = useRef(null)
  const lastProcessedRef = useRef(null)
  const [status, setStatus] = useState({
    status: 'connecting',
    lastConnectedAt: null,
    lastEventAt: null,
    lastError: null,
    connectionEpoch: 0,
    dataEpoch: 0,
  })
  const [overview, setOverview] = useState({ stats: null, lastReceivedAt: null, error: null, updatedAt: null, reset: null })

  /** Consulta stats y último evento recibido; detecta reinicios de Ground API. */
  const refreshOverview = useCallback(
    async (signal) => {
      try {
        const [statsPayload, eventsPayload] = await Promise.all([
          api.getSyncStats({ signal }),
          api.listSyncEvents({ limit: 1, signal }),
        ])
        const stats = statsPayload?.data ?? null
        const processed = stats?.processedEvents
        const previous = lastProcessedRef.current
        let reset = null
        if (typeof processed === 'number') {
          if (previous !== null && processed < previous) {
            const discarded = Object.values(stores).reduce((total, store) => total + store.clear(), 0)
            reset = { detectedAt: nowIso(), previousProcessedEvents: previous, processedEvents: processed, discarded }
          }
          lastProcessedRef.current = processed
        }
        setOverview((o) => ({
          stats,
          lastReceivedAt: eventsPayload?.data?.[0]?.receivedAt ?? null,
          error: null,
          updatedAt: nowIso(),
          reset: reset ?? o.reset,
        }))
        if (reset) setStatus((s) => ({ ...s, dataEpoch: s.dataEpoch + 1 }))
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        setOverview((o) => ({ ...o, error }))
      }
    },
    [api, stores],
  )

  usePolling(refreshOverview, overviewIntervalMs)

  useEffect(() => {
    socketRef.current ??= socketFactory()
    const socket = socketRef.current
    const update = (changes) => setStatus((s) => ({ ...s, ...changes }))
    let cancelled = false

    const onConnect = () => {
      setStatus((s) => ({ ...s, status: 'connected', lastConnectedAt: nowIso(), lastError: null, connectionEpoch: s.connectionEpoch + 1 }))
      // Primero se comprueba si Ground API se reinició; después se recargan las colecciones.
      refreshOverview()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setStatus((s) => ({ ...s, dataEpoch: s.dataEpoch + 1 }))
        })
    }
    const onDisconnect = (reason) => {
      if (reason === 'io client disconnect') return update({ status: 'disconnected' })
      update({ status: 'reconnecting', lastError: reason })
      // Tras un cierre ordenado del servidor, socket.io no reintenta solo.
      if (reason === 'io server disconnect') socket.connect()
    }
    const onConnectError = (error) => update({ status: 'reconnecting', lastError: error?.message ?? 'Error de conexión' })
    const onReconnectAttempt = () => update({ status: 'reconnecting' })

    const entityHandlers = Object.entries(COLLECTIONS).flatMap(([type, config]) =>
      config.events.map((eventName) => {
        const handler = (payload) => {
          const parsed = config.schema.safeParse(payload)
          if (!parsed.success) {
            console.warn(`Evento ${eventName} descartado: no cumple el contrato`, parsed.error.issues)
            return
          }
          stores[type].upsertMany([parsed.data])
          update({ lastEventAt: nowIso() })
        }
        return [eventName, handler]
      }),
    )

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.io?.on('reconnect_attempt', onReconnectAttempt)
    entityHandlers.forEach(([eventName, handler]) => socket.on(eventName, handler))
    socket.connect()

    return () => {
      cancelled = true
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.io?.off('reconnect_attempt', onReconnectAttempt)
      entityHandlers.forEach(([eventName, handler]) => socket.off(eventName, handler))
      socket.disconnect()
    }
  }, [socketFactory, stores, refreshOverview])

  const dismissReset = useCallback(() => setOverview((o) => ({ ...o, reset: null })), [])
  const data = useMemo(() => ({ stores, api }), [stores, api])
  const overviewValue = useMemo(() => ({ ...overview, dismissReset }), [overview, dismissReset])

  return (
    <RealtimeDataContext.Provider value={data}>
      <RealtimeStatusContext.Provider value={status}>
        <SyncOverviewContext.Provider value={overviewValue}>{children}</SyncOverviewContext.Provider>
      </RealtimeStatusContext.Provider>
    </RealtimeDataContext.Provider>
  )
}
