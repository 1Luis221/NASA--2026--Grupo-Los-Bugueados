import { vi } from 'vitest'

/** Socket.IO falso: la prueba decide cuándo conecta, desconecta o llega un evento. */
export function createFakeSocket() {
  const listeners = new Map()
  const managerListeners = new Map()

  const add = (map) => (event, fn) => {
    if (!map.has(event)) map.set(event, new Set())
    map.get(event).add(fn)
  }
  const remove = (map) => (event, fn) => map.get(event)?.delete(fn)
  const fire = (map, event, ...args) => [...(map.get(event) ?? [])].forEach((fn) => fn(...args))

  const socket = {
    connected: false,
    on: vi.fn(add(listeners)),
    off: vi.fn(remove(listeners)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn(add(managerListeners)), off: vi.fn(remove(managerListeners)) },

    // Controles de la prueba
    serverConnect() {
      socket.connected = true
      fire(listeners, 'connect')
    },
    serverDisconnect(reason = 'transport close') {
      socket.connected = false
      fire(listeners, 'disconnect', reason)
    },
    serverEmit: (event, payload) => fire(listeners, event, payload),
    managerEmit: (event, ...args) => fire(managerListeners, event, ...args),
    listenerCount: () =>
      [...listeners.values(), ...managerListeners.values()].reduce((total, set) => total + set.size, 0),
  }
  return socket
}

/** Lectura de constantes válida según el contrato. */
export function vital(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    crewMemberId: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d',
    recordedAt: '2026-11-14T10:00:00.000Z',
    source: { type: 'sensor', simulated: true, deviceId: 'sim-wearable-01' },
    heartRate: { value: 72, unit: 'bpm' },
    ...overrides,
  }
}

/** Alerta válida según el contrato. */
export function alert(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    origin: 'onboard',
    category: 'communication',
    severity: 'warning',
    status: 'active',
    title: 'Enlace nave–Tierra interrumpido',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  }
}

export const list = (data) => ({ data, count: data.length })

/** Promesa controlable desde la prueba (respuestas que llegan tarde). */
export function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}
