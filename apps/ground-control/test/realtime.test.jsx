import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SOCKET_EVENTS } from '@astronaut-wellness/shared'
import { RealtimeStatus } from '../src/components/RealtimeStatus.jsx'
import { RealtimeProvider } from '../src/realtime/RealtimeProvider.jsx'
import { useRealtimeCollection, useRealtimeStatus } from '../src/realtime/realtime-context.js'
import { alert, createFakeSocket, deferred, list, vital } from './helpers.js'

function setup({ api = {}, strict = false, limits } = {}) {
  const socket = createFakeSocket()
  const socketFactory = vi.fn(() => socket)
  const fakeApi = {
    listCrew: vi.fn(async () => list([])),
    listVitals: vi.fn(async () => list([])),
    listCheckIns: vi.fn(async () => list([])),
    listCameraMetrics: vi.fn(async () => list([])),
    listAlerts: vi.fn(async () => list([])),
    getSyncStats: vi.fn(async () => ({ data: { processedEvents: 0 } })),
    listSyncEvents: vi.fn(async () => list([])),
    ...api,
  }
  const Wrapper = ({ children }) => {
    const tree = (
      <RealtimeProvider socketFactory={socketFactory} api={fakeApi} limits={limits}>
        {children}
      </RealtimeProvider>
    )
    return strict ? <StrictMode>{tree}</StrictMode> : tree
  }
  return { socket, socketFactory, api: fakeApi, Wrapper }
}

describe('RealtimeProvider · conexión', () => {
  it('crea una sola conexión para toda la app, también con StrictMode', () => {
    const { socket, socketFactory, Wrapper } = setup({ strict: true })
    render(
      <Wrapper>
        <RealtimeStatus />
        <RealtimeStatus />
      </Wrapper>,
    )
    expect(socketFactory).toHaveBeenCalledTimes(1)
    expect(socket.connect).toHaveBeenCalled()
  })

  it('expone el estado de la conexión: conectando → conectado → reconectando', () => {
    const { socket, Wrapper } = setup()
    const { result } = renderHook(() => useRealtimeStatus(), { wrapper: Wrapper })
    expect(result.current.status).toBe('connecting')

    act(() => socket.serverConnect())
    expect(result.current).toMatchObject({ status: 'connected', connectionEpoch: 1 })

    act(() => socket.serverDisconnect('transport close'))
    expect(result.current).toMatchObject({ status: 'reconnecting', lastError: 'transport close' })

    act(() => socket.managerEmit('reconnect_attempt', 1))
    expect(result.current.status).toBe('reconnecting')
  })

  it('tras un cierre ordenado del servidor vuelve a intentar conectar', () => {
    const { socket, Wrapper } = setup()
    renderHook(() => useRealtimeStatus(), { wrapper: Wrapper })
    act(() => socket.serverConnect())
    socket.connect.mockClear()
    act(() => socket.serverDisconnect('io server disconnect'))
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it('el indicador habla de la conexión en tiempo real, no del enlace espacial', () => {
    const { socket, Wrapper } = setup()
    render(<RealtimeStatus />, { wrapper: Wrapper })
    act(() => socket.serverConnect())
    const indicator = screen.getByText('Tiempo real: conectado').closest('[data-slot="status-indicator"]')
    expect(indicator).toHaveAttribute('title', expect.stringContaining('No indica el estado del enlace nave–Tierra'))
  })

  it('al desmontar elimina todos los listeners y cierra la conexión', () => {
    const { socket, Wrapper } = setup()
    const { unmount } = render(<RealtimeStatus />, { wrapper: Wrapper })
    expect(socket.listenerCount()).toBeGreaterThan(0)
    unmount()
    expect(socket.listenerCount()).toBe(0)
    expect(socket.disconnect).toHaveBeenCalled()
  })
})

describe('useRealtimeCollection', () => {
  it('carga por HTTP y añade los registros que llegan por Socket.IO', async () => {
    const first = vital()
    const { socket, Wrapper } = setup({ api: { listVitals: vi.fn(async () => list([first])) } })
    const { result } = renderHook(() => useRealtimeCollection('vital_signs'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.records).toHaveLength(1))

    const live = vital({ recordedAt: '2026-11-14T10:00:05.000Z' })
    act(() => socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, live))
    expect(result.current.records.map((r) => r.id)).toEqual([live.id, first.id])
  })

  it('el mismo UUID repetido por Socket.IO no duplica registros', async () => {
    const { socket, Wrapper } = setup()
    const { result } = renderHook(() => useRealtimeCollection('vital_signs'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const reading = vital()
    act(() => {
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, reading)
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, structuredClone(reading))
    })
    expect(result.current.records).toHaveLength(1)
  })

  it('descarta payloads que no cumplen el contrato', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { socket, Wrapper } = setup()
    const { result } = renderHook(() => useRealtimeCollection('vital_signs'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, { id: 'no-uuid', heartRate: 72 }))
    expect(result.current.records).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('al reconectar recupera por HTTP lo emitido sin conexión, sin duplicar', async () => {
    const known = vital({ recordedAt: '2026-11-14T10:00:00.000Z' })
    const missed = vital({ recordedAt: '2026-11-14T10:00:10.000Z' })
    const listVitals = vi.fn().mockResolvedValueOnce(list([known])).mockResolvedValue(list([missed, known]))
    const { socket, Wrapper } = setup({ api: { listVitals } })
    const { result } = renderHook(() => useRealtimeCollection('vital_signs'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.records).toHaveLength(1))

    act(() => socket.serverDisconnect('transport close'))
    act(() => socket.serverConnect()) // reconexión → nueva carga HTTP

    await waitFor(() => expect(result.current.records.map((r) => r.id)).toEqual([missed.id, known.id]))
    expect(listVitals).toHaveBeenCalledTimes(2)
  })

  it('una respuesta HTTP antigua no deshace un evento más reciente', async () => {
    const created = alert()
    const slowHttp = deferred()
    const { socket, Wrapper } = setup({ api: { listAlerts: vi.fn(() => slowHttp.promise) } })
    const { result } = renderHook(() => useRealtimeCollection('alert'), { wrapper: Wrapper })

    const resolved = { ...created, status: 'resolved', resolvedAt: '2026-11-14T10:05:00.000Z', updatedAt: '2026-11-14T10:05:00.000Z' }
    act(() => socket.serverEmit(SOCKET_EVENTS.ALERT_UPDATED, resolved))
    await act(async () => slowHttp.resolve(list([created]))) // llega tarde con la versión activa

    expect(result.current.records).toEqual([resolved])
  })

  it('filtra por tripulante igual en HTTP y en los datos en vivo', async () => {
    const crewA = '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d'
    const listVitals = vi.fn(async () => list([]))
    const { socket, Wrapper } = setup({ api: { listVitals } })
    const { result } = renderHook(() => useRealtimeCollection('vital_signs', { crewMemberId: crewA, limit: 10 }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isEmpty).toBe(true))
    expect(listVitals).toHaveBeenCalledWith(expect.objectContaining({ crewMemberId: crewA, limit: 10 }))

    act(() => {
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, vital({ crewMemberId: crewA }))
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, vital({ crewMemberId: 'c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a' }))
    })
    expect(result.current.records.map((r) => r.crewMemberId)).toEqual([crewA])
  })

  it('aplica el límite configurable en memoria', async () => {
    const { socket, Wrapper } = setup({ limits: { vital_signs: 2 } })
    const { result } = renderHook(() => useRealtimeCollection('vital_signs'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      for (let s = 0; s < 5; s++) socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, vital({ recordedAt: `2026-11-14T10:00:0${s}.000Z` }))
    })
    expect(result.current.records).toHaveLength(2)
  })

  it('expone los errores HTTP sin ocultarlos', async () => {
    const { Wrapper } = setup({ api: { listCrew: vi.fn(async () => Promise.reject(Object.assign(new Error('HTTP 500'), { status: 500 }))) } })
    const { result } = renderHook(() => useRealtimeCollection('crew_member'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 500 }))
    expect(result.current.isEmpty).toBe(false)
  })

  it('exige estar dentro de RealtimeProvider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useRealtimeCollection('vital_signs'))).toThrow(/RealtimeProvider/)
    error.mockRestore()
  })
})
