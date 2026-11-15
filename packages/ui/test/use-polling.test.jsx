import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from '../src/data/use-polling.js'
import { deferred, setVisibility } from './helpers.js'

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

const tick = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('usePolling', () => {
  it('ejecuta al montar y después cada intervalo', async () => {
    const task = vi.fn(async () => {})
    renderHook(() => usePolling(task, 3000))
    await tick(0)
    expect(task).toHaveBeenCalledTimes(1)
    await tick(3000)
    await tick(3000)
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('no solapa ejecuciones: espera a que termine la anterior', async () => {
    const slow = deferred()
    const task = vi.fn(() => slow.promise)
    renderHook(() => usePolling(task, 1000))
    await tick(10_000)
    expect(task).toHaveBeenCalledTimes(1)

    await act(async () => slow.resolve())
    await tick(1000)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('se pausa con la pestaña oculta y se reanuda al volver a ser visible', async () => {
    const task = vi.fn(async () => {})
    const { result } = renderHook(() => usePolling(task, 3000))
    await tick(0)
    expect(task).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    expect(result.current.paused).toBe(true)
    await tick(30_000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)

    act(() => setVisibility('visible'))
    await tick(0)
    expect(result.current.paused).toBe(false)
    expect(task).toHaveBeenCalledTimes(2) // al volver, se ejecuta en el acto
    await tick(3000)
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('al ocultarse cancela la ejecución en curso', async () => {
    let signal
    renderHook(() =>
      usePolling((s) => {
        signal = s
        return new Promise(() => {})
      }, 3000),
    )
    await tick(0)
    act(() => setVisibility('hidden'))
    expect(signal.aborted).toBe(true)
  })

  it('enabled: false no ejecuta nada', async () => {
    const task = vi.fn()
    renderHook(() => usePolling(task, 1000, { enabled: false }))
    await tick(10_000)
    expect(task).not.toHaveBeenCalled()
  })

  it('al desmontar limpia temporizadores, listeners y la solicitud en curso', async () => {
    let signal
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() =>
      usePolling((s) => {
        signal = s
        return new Promise(() => {})
      }, 1000),
    )
    await tick(0)
    unmount()
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('sigue funcionando con el doble montaje de React StrictMode', async () => {
    const task = vi.fn(async () => {})
    renderHook(() => usePolling(task, 1000), { wrapper: StrictMode })
    await tick(0)
    await tick(1000)
    await tick(1000)
    expect(task.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(vi.getTimerCount()).toBe(1) // un único ciclo programado
  })
})
