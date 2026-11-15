import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '../src/data/api-client.js'
import { isEmptyPayload, useResource } from '../src/data/use-resource.js'
import { createFetchMock, deferred, httpResponse } from './helpers.js'

afterEach(() => vi.useRealTimers())

describe('isEmptyPayload', () => {
  it.each([
    [null, true],
    [{ data: [] , count: 0 }, true],
    [{ data: null }, true],
    [{ data: [{ id: 1 }], count: 1 }, false],
    [{ data: { id: 1 } }, false],
    [{ data: 0 }, false],
  ])('%j → %s', (payload, empty) => {
    expect(isEmptyPayload(payload)).toBe(empty)
  })
})

describe('useResource', () => {
  it('carga al montar y expone data, loading y error', async () => {
    const fetcher = vi.fn(async () => ({ data: [{ id: 'a' }], count: 1 }))
    const { result } = renderHook(() => useResource('crew', fetcher))

    expect(result.current.loading).toBe(true) // sin parpadeo de "vacío" antes del efecto
    expect(result.current.isEmpty).toBe(false)
    await waitFor(() => expect(result.current.data).toEqual({ data: [{ id: 'a' }], count: 1 }))
    expect(result.current).toMatchObject({ loading: false, error: null, isEmpty: false })
  })

  it('identifica una respuesta vacía sin tratarla como error', async () => {
    const { result } = renderHook(() => useResource('alerts', async () => ({ data: [], count: 0 })))
    await waitFor(() => expect(result.current.isEmpty).toBe(true))
    expect(result.current.error).toBeNull()
  })

  it('expone los errores de la API y permite recargar', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 500, code: 'HTTP_500', message: 'Internal Server Error' }))
      .mockResolvedValueOnce({ data: [1], count: 1 })
    const { result } = renderHook(() => useResource('vitals', fetcher))

    await waitFor(() => expect(result.current.error).toMatchObject({ status: 500 }))
    expect(result.current.isEmpty).toBe(false)

    await act(() => result.current.reload())
    expect(result.current).toMatchObject({ error: null, data: { data: [1], count: 1 } })
  })

  it('cancela la solicitud al desmontar', async () => {
    let signal
    const { unmount } = renderHook(() =>
      useResource('crew', (s) => {
        signal = s
        return new Promise(() => {})
      }),
    )
    await waitFor(() => expect(signal).toBeDefined())
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('una respuesta antigua nunca sobrescribe una más reciente (claves fuera de orden)', async () => {
    const slow = deferred()
    const fast = deferred()
    const fetcher = vi.fn((_signal, key) => (key === 'crew-A' ? slow.promise : fast.promise))
    const { result, rerender } = renderHook(({ key }) => useResource(key, fetcher), { initialProps: { key: 'crew-A' } })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    rerender({ key: 'crew-B' })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    await act(async () => fast.resolve({ data: 'B' }))
    await act(async () => slow.resolve({ data: 'A' })) // llega tarde
    expect(result.current.data).toEqual({ data: 'B' })
  })

  it('recargar mientras carga cancela la anterior: solo hay una solicitud activa', async () => {
    const signals = []
    const fetcher = vi.fn((signal) => {
      signals.push(signal)
      return new Promise(() => {})
    })
    const { result } = renderHook(() => useResource('crew', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.reload()
    })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('keepPreviousData: false no muestra datos de otra clave mientras carga la nueva', async () => {
    const next = deferred()
    const fetcher = vi.fn((_signal, key) => (key === 'crew-A' ? Promise.resolve({ data: 'A' }) : next.promise))
    const { result, rerender } = renderHook(({ key }) => useResource(key, fetcher, { keepPreviousData: false }), {
      initialProps: { key: 'crew-A' },
    })
    await waitFor(() => expect(result.current.data).toEqual({ data: 'A' }))

    rerender({ key: 'crew-B' })
    expect(result.current).toMatchObject({ data: undefined, loading: true })
    await act(async () => next.resolve({ data: 'B' }))
    expect(result.current.data).toEqual({ data: 'B' })
  })

  it('key null desactiva la carga', () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() => useResource(null, fetcher))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('con React StrictMode y el cliente real lanza una sola petición de red', async () => {
    const fetchImpl = createFetchMock(() => httpResponse(200, { data: [{ id: 'x' }], count: 1 }))
    const client = createApiClient({ fetchImpl })

    function Crew() {
      const { data, loading } = useResource('crew', (signal) => client.get('/crew', { signal }))
      return <p>{loading ? 'cargando' : `tripulantes: ${data.count}`}</p>
    }
    render(
      <StrictMode>
        <Crew />
      </StrictMode>,
    )

    expect(await screen.findByText('tripulantes: 1')).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('pollIntervalMs refresca periódicamente sin solapar peticiones', async () => {
    vi.useFakeTimers()
    let call = 0
    const pending = []
    const fetcher = vi.fn(() => {
      call += 1
      if (call === 1) return Promise.resolve({ data: [call] })
      const d = deferred()
      pending.push(d)
      return d.promise
    })
    const { result, unmount } = renderHook(() => useResource('status', fetcher, { pollIntervalMs: 3000 }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.data).toEqual({ data: [1] })

    await act(() => vi.advanceTimersByTimeAsync(3000)) // segundo ciclo: queda pendiente
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(9000)) // no se lanza otra mientras esté en curso
    expect(fetcher).toHaveBeenCalledTimes(2)

    await act(async () => pending[0].resolve({ data: [2] }))
    expect(result.current.data).toEqual({ data: [2] })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
