import { vi } from 'vitest'

/** Respuesta HTTP simulada. `body` objeto → JSON; string → texto tal cual; undefined → sin cuerpo. */
export function httpResponse(status, body) {
  const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(status === 204 ? null : text, { status, headers: { 'content-type': 'application/json' } })
}

/** Promesa controlable desde la prueba (para respuestas fuera de orden). */
export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** fetch simulado que respeta AbortSignal como el real. */
export function createFetchMock(responder) {
  return vi.fn(
    (url, init = {}) =>
      new Promise((resolve, reject) => {
        const { signal } = init
        const abort = () => reject(new DOMException('aborted', 'AbortError'))
        if (signal?.aborted) return abort()
        signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve(responder(url, init)).then(resolve, reject)
      }),
  )
}

/** Cambia la visibilidad de la pestaña y notifica el evento. */
export function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}
