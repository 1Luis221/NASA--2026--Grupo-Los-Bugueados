import { describe, expect, it } from 'vitest'
import * as shared from '@astronaut-wellness/shared'
import * as examples from '@astronaut-wellness/shared/examples'
import { SOCKET_EVENTS } from '@astronaut-wellness/shared/events'
import { PORTS } from '@astronaut-wellness/shared/constants'
import { AlertSchema } from '@astronaut-wellness/shared/schemas'

describe('exportaciones públicas del paquete', () => {
  it.each([
    'CrewMemberSchema',
    'VitalSignsSchema',
    'WellnessCheckInSchema',
    'CameraMetricsSchema',
    'AlertSchema',
    'SyncEventSchema',
    'SyncAckSchema',
    'CrewMemberStrictSchema',
    'VitalSignsStrictSchema',
    'WellnessCheckInStrictSchema',
    'CameraMetricsStrictSchema',
    'AlertStrictSchema',
    'SyncEventStrictSchema',
    'SyncAckStrictSchema',
    'SYNC_ACK_RESULTS',
    'SOCKET_EVENTS',
    'PORTS',
    'ALERT_SEVERITIES',
    'SYNC_STATUSES',
    'canTransitionAlertStatus',
    'canTransitionSyncStatus',
  ])('exporta %s desde la raíz', (name) => {
    expect(shared[name]).toBeDefined()
  })

  it('expone los subpaths declarados en package.json', () => {
    expect(PORTS.GROUND_API).toBe(4000)
    expect(AlertSchema).toBe(shared.AlertSchema)
    expect(Object.keys(examples).length).toBe(8)
  })

  it('los nombres de eventos Socket.IO son únicos y siguen "dominio:acción"', () => {
    const names = Object.values(SOCKET_EVENTS)
    expect(new Set(names).size).toBe(names.length)
    names.forEach((name) => expect(name).toMatch(/^[a-z-]+:[a-z-]+$/))
    expect(Object.isFrozen(SOCKET_EVENTS)).toBe(true)
  })
})
