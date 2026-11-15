/**
 * Cliente HTTP mínimo sobre fetch para las API del sistema (rutas relativas /api,
 * servidas por el proxy de Vite). Sin dependencias.
 *
 * - Devuelve el cuerpo JSON tal cual ({ data } o { data, count }); un cuerpo vacío
 *   en una respuesta correcta es `null`, nunca un error.
 * - Normaliza todos los fallos en ApiError { status, code, message, issues }.
 * - Una cancelación se propaga como AbortError (ver isAbortError) para que la
 *   interfaz la ignore en lugar de mostrarla como error.
 * - Las GET idénticas en curso se comparten: varios componentes que piden la
 *   misma URL a la vez generan una sola petición de red.
 */

export class ApiError extends Error {
  constructor({ status = 0, code, message, issues = [], details, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
    this.details = details
  }

  /** Errores de validación por campo: { 'mood': 'Too big…', … } */
  get fieldErrors() {
    return Object.fromEntries(this.issues.filter((i) => i.path).map((i) => [i.path, i.message]))
  }
}

export const isAbortError = (error) => error?.name === 'AbortError'

const abortError = () => new DOMException('La solicitud se canceló', 'AbortError')

/** Construye `/api/ruta?a=1`, omitiendo parámetros undefined, null o ''. */
export function buildUrl(baseUrl, path, query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
  }
  const search = params.toString()
  return `${baseUrl}${path}${search ? `?${search}` : ''}`
}

function httpMessage(status, payload) {
  if (typeof payload?.error === 'string') return payload.error
  return `La API respondió con HTTP ${status}`
}

export function createApiClient({ baseUrl = '/api', fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const inflight = new Map() // url → { promise, controller, subscribers }

  async function send(method, url, { body, signal, withStatus = false, headers = {} } = {}) {
    const hasBody = body !== undefined
    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers: { accept: 'application/json', ...(hasBody && { 'content-type': 'application/json' }), ...headers },
        body: hasBody ? JSON.stringify(body) : undefined,
        signal,
      })
    } catch (err) {
      if (isAbortError(err)) throw err
      throw new ApiError({ code: 'NETWORK_ERROR', message: 'No se pudo conectar con la API', cause: err })
    }

    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch (err) {
        throw new ApiError({
          status: response.status,
          code: 'INVALID_JSON',
          message: 'La API devolvió una respuesta que no es JSON válido',
          cause: err,
        })
      }
    }

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: `HTTP_${response.status}`,
        message: httpMessage(response.status, payload),
        issues: Array.isArray(payload?.issues) ? payload.issues : [],
        details: payload?.details,
      })
    }
    // `withStatus` permite exigir un estado concreto (p. ej. 201 Created) además del cuerpo.
    return withStatus ? { status: response.status, body: payload } : payload
  }

  /**
   * GET compartida. La petición de red solo se cancela cuando TODOS los que la
   * esperan se cancelan; se aplaza a una microtarea para que el doble montaje
   * de React StrictMode reutilice la misma petición en vez de lanzar otra.
   */
  function sharedGet(url, signal) {
    let entry = inflight.get(url)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, subscribers: 0 }
      entry.promise = send('GET', url, { signal: controller.signal }).finally(() => {
        if (inflight.get(url) === entry) inflight.delete(url)
      })
      inflight.set(url, entry)
    }
    const current = entry
    current.subscribers += 1

    return new Promise((resolve, reject) => {
      let settled = false
      const release = () => {
        current.subscribers -= 1
        queueMicrotask(() => {
          if (current.subscribers === 0 && inflight.get(url) === current) {
            inflight.delete(url)
            current.controller.abort()
          }
        })
      }
      const onAbort = () => {
        if (settled) return
        settled = true
        release()
        reject(abortError())
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })

      current.promise.then(
        (value) => {
          if (settled) return
          settled = true
          signal?.removeEventListener('abort', onAbort)
          current.subscribers -= 1
          resolve(value)
        },
        (error) => {
          if (settled) return
          settled = true
          signal?.removeEventListener('abort', onAbort)
          current.subscribers -= 1
          reject(error)
        },
      )
    })
  }

  return {
    get: (path, { query, signal } = {}) => sharedGet(buildUrl(baseUrl, path, query), signal),
    post: (path, body, { signal, withStatus, headers } = {}) => send('POST', buildUrl(baseUrl, path), { body, signal, withStatus, headers }),
    put: (path, body, { signal, withStatus } = {}) => send('PUT', buildUrl(baseUrl, path), { body, signal, withStatus }),
  }
}
