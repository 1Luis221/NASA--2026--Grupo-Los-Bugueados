import { describe, expect, it, vi } from 'vitest'
import { createRecordStore } from '../src/realtime/record-store.js'
import { alert, vital } from './helpers.js'

describe('createRecordStore', () => {
  it('fusiona por UUID: el mismo registro dos veces no se duplica ni notifica', () => {
    const store = createRecordStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const reading = vital()

    expect(store.upsertMany([reading])).toBe(true)
    expect(store.upsertMany([structuredClone(reading)])).toBe(false)
    expect(store.getSnapshot()).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ordena del más reciente al más antiguo y mantiene la referencia si no hay cambios', () => {
    const store = createRecordStore()
    const old = vital({ recordedAt: '2026-11-14T09:00:00.000Z' })
    const recent = vital({ recordedAt: '2026-11-14T11:00:00.000Z' })
    store.upsertMany([old, recent])
    const snapshot = store.getSnapshot()
    expect(snapshot.map((r) => r.id)).toEqual([recent.id, old.id])
    store.upsertMany([old])
    expect(store.getSnapshot()).toBe(snapshot)
  })

  it('last-write-wins: una versión antigua (p. ej. HTTP tardío) no deshace una más reciente', () => {
    const store = createRecordStore({ timestampOf: (r) => r.createdAt })
    const active = alert()
    const resolved = { ...active, status: 'resolved', resolvedAt: '2026-11-14T10:05:00.000Z', updatedAt: '2026-11-14T10:05:00.000Z' }

    store.upsertMany([resolved])
    expect(store.upsertMany([active])).toBe(false)
    expect(store.get(active.id).status).toBe('resolved')
  })

  it('respeta el límite por grupo descartando los más antiguos', () => {
    const store = createRecordStore({ limit: 2, groupBy: 'crewMemberId' })
    const at = (h, crewMemberId = 'a') => vital({ crewMemberId, recordedAt: `2026-11-14T0${h}:00:00.000Z` })
    store.upsertMany([at(1), at(2), at(3), at(1, 'b')])

    expect(store.getSnapshot().map((r) => [r.crewMemberId, r.recordedAt.slice(11, 13)])).toEqual([
      ['a', '03'],
      ['a', '02'],
      ['b', '01'],
    ])
    expect(store.size()).toBe(3)
  })

  it('ignora entradas sin id', () => {
    const store = createRecordStore()
    expect(store.upsertMany([null, {}, { foo: 1 }])).toBe(false)
  })
})
