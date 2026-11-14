import { describe, expect, it } from 'vitest'
import { dataSourceSchema, idSchema, measurementSchema, timestampSchema } from '../src/schemas/common.js'

describe('idSchema', () => {
  it('acepta UUID generados con crypto.randomUUID()', () => {
    expect(idSchema.safeParse(crypto.randomUUID()).success).toBe(true)
  })

  it.each(['', 'crew-001', '12345', '12326863-919b-42a3-959e'])('rechaza %j', (value) => {
    expect(idSchema.safeParse(value).success).toBe(false)
  })
})

describe('timestampSchema', () => {
  it.each(['2026-11-14T10:00:00Z', '2026-11-14T10:00:00.123Z', new Date().toISOString()])('acepta %s', (value) => {
    expect(timestampSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    '2026-11-14T10:00:00+02:00', // solo UTC
    '2026-11-14',
    '14/11/2026 10:00',
    '2026-13-01T00:00:00Z',
    1763114400000,
  ])('rechaza %j', (value) => {
    expect(timestampSchema.safeParse(value).success).toBe(false)
  })
})

describe('measurementSchema', () => {
  const schema = measurementSchema('bpm', { min: 20, max: 300 })

  it('acepta valor en dominio con su unidad', () => {
    expect(schema.safeParse({ value: 72.5, unit: 'bpm' }).success).toBe(true)
  })

  it.each([
    [{ value: 72 }, 'sin unidad'],
    [{ value: 72, unit: 'Hz' }, 'unidad incorrecta'],
    [{ value: 10, unit: 'bpm' }, 'por debajo del dominio'],
    [{ value: 301, unit: 'bpm' }, 'por encima del dominio'],
    [{ value: Number.NaN, unit: 'bpm' }, 'NaN'],
    [{ value: Infinity, unit: 'bpm' }, 'Infinity'],
    [{ value: '72', unit: 'bpm' }, 'valor como texto'],
  ])('rechaza %j (%s)', (value) => {
    expect(schema.safeParse(value).success).toBe(false)
  })

  it('con integer=true rechaza decimales', () => {
    const count = measurementSchema('count', { min: 0, max: 10, integer: true })
    expect(count.safeParse({ value: 2, unit: 'count' }).success).toBe(true)
    expect(count.safeParse({ value: 2.5, unit: 'count' }).success).toBe(false)
  })
})

describe('dataSourceSchema', () => {
  const sensor = dataSourceSchema('sensor')

  it('distingue datos reales y simulados de la misma modalidad', () => {
    expect(sensor.safeParse({ type: 'sensor', simulated: false }).success).toBe(true)
    expect(sensor.safeParse({ type: 'sensor', simulated: true, deviceId: 'sim-01' }).success).toBe(true)
  })

  it('rechaza otra modalidad o sin indicar si es simulado', () => {
    expect(sensor.safeParse({ type: 'camera', simulated: false }).success).toBe(false)
    expect(sensor.safeParse({ type: 'sensor' }).success).toBe(false)
  })
})
