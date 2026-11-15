import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from './api-client.js'
import { usePolling } from './use-polling.js'

/** Vacío = sin cuerpo, `{ data: null }` o `{ data: [] }`. Un `0` u objeto con datos no es vacío. */
export function isEmptyPayload(payload) {
  if (payload === null || payload === undefined) return true
  if (!('data' in Object(payload))) return false
  const { data } = payload
  return data === null || data === undefined || (Array.isArray(data) && data.length === 0)
}

const INITIAL = { data: undefined, dataKey: null, error: null, errorKey: null, status: 'idle', statusKey: null }

/**
 * Carga un recurso con `fetcher(signal)` y lo vuelve a cargar cuando cambia `key`.
 * `key = null` desactiva la carga.
 *
 * - Una sola solicitud activa por hook: recargar cancela la anterior y solo la
 *   más reciente puede actualizar el estado (nunca gana una respuesta antigua).
 * - Al desmontar cancela la solicitud en curso.
 * - Los errores se exponen tal cual (ApiError); las cancelaciones se ignoran.
 * - `pollIntervalMs` > 0 refresca periódicamente (usePolling) sin solapar
 *   peticiones; si ya hay una en curso, el ciclo se omite.
 * - Al recargar se conservan los datos previos (`refreshing`) para no
 *   provocar parpadeos; con `keepPreviousData: false` se limpian al cambiar `key`.
 */
export function useResource(key, fetcher, { pollIntervalMs = 0, keepPreviousData = true, isEmpty = isEmptyPayload } = {}) {
  const [state, setState] = useState(INITIAL)
  const fetcherRef = useRef(fetcher)
  const requestRef = useRef({ id: 0, controller: null })

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const load = useCallback(
    (activeKey) => {
      const request = requestRef.current
      request.controller?.abort()
      const controller = new AbortController()
      const id = ++request.id
      request.controller = controller

      return Promise.resolve()
        .then(() => {
          // Cancelada antes de empezar (p. ej. doble montaje de StrictMode): no se lanza la petición.
          if (controller.signal.aborted) throw new DOMException('La solicitud se canceló', 'AbortError')
          return fetcherRef.current(controller.signal, activeKey)
        })
        .then(
          (data) => {
            if (id !== request.id) return
            request.controller = null
            setState({ data, dataKey: activeKey, error: null, errorKey: null, status: 'success', statusKey: activeKey })
          },
          (error) => {
            if (id !== request.id || isAbortError(error)) return
            request.controller = null
            setState((s) => ({ ...s, error, errorKey: activeKey, status: 'error', statusKey: activeKey }))
          },
        )
    },
    [],
  )

  useEffect(() => {
    if (key === null || key === undefined) return undefined
    load(key)
    const request = requestRef.current
    return () => {
      request.id += 1 // invalida cualquier respuesta pendiente de esta clave
      request.controller?.abort()
      request.controller = null
    }
  }, [key, load])

  // En la carga inicial o al cambiar `key`, "pendiente" se deriva de statusKey;
  // al recargar la misma clave hay que marcarlo explícitamente.
  const reload = useCallback(() => {
    if (key === null || key === undefined) return Promise.resolve()
    setState((s) => ({ ...s, status: 'loading', statusKey: key }))
    return load(key)
  }, [key, load])

  // Refresco periódico: si hay una solicitud activa, se omite este ciclo.
  const revalidate = useCallback(
    () => (requestRef.current.controller ? undefined : reload()),
    [reload],
  )
  const polling = usePolling(revalidate, pollIntervalMs, {
    enabled: pollIntervalMs > 0 && key !== null && key !== undefined,
    immediate: false,
  })

  // El estado recuerda a qué clave pertenece cada dato: se deriva lo visible sin
  // tener que limpiar el estado dentro de un efecto al cambiar `key`.
  const enabled = key !== null && key !== undefined
  const data = keepPreviousData || state.dataKey === key ? state.data : undefined
  const error = state.errorKey === key ? state.error : null
  const hasData = data !== undefined
  // Mientras la carga de esta clave no ha empezado o sigue en curso, se considera pendiente
  // (evita mostrar un falso "vacío" antes de que corra el efecto).
  const pending = enabled && (state.statusKey !== key || state.status === 'loading')
  const status = !enabled ? 'idle' : state.statusKey === key ? state.status : 'loading'
  return {
    data,
    error,
    /** Primera carga, todavía sin datos. */
    loading: pending && !hasData,
    /** Recarga con datos previos visibles. */
    refreshing: pending && hasData,
    /** Hay respuesta correcta pero no contiene registros. */
    isEmpty: status === 'success' && hasData && isEmpty(data),
    status,
    pollingPaused: polling.paused,
    reload,
  }
}
