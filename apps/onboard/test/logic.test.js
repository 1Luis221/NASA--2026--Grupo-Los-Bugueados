import { describe, expect, it } from 'vitest'
import { CheckInInputSchema, emptyForm, issuesToFieldErrors, toCheckInBody, validateCheckIn } from '../src/check-in/check-in-form.js'
import { buildIndex, deriveSyncStatus, latestSyncError, unacknowledgedCount } from '../src/state/sync-index.js'

const CREW = '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d'
const filled = (overrides = {}) => ({ ...emptyForm(), mood: 4, stress: 2, fatigue: 3, sleepQuality: 3, ...overrides })

describe('formulario de autoevaluación', () => {
  it('construye el cuerpo del contrato omitiendo opcionales vacíos', () => {
    expect(toCheckInBody(filled(), CREW)).toEqual({ crewMemberId: CREW, mood: 4, stress: 2, fatigue: 3, sleepQuality: 3 })
    expect(toCheckInBody(filled({ sleepHours: '6.5', notes: '  bien  ' }), CREW)).toMatchObject({
      sleepDuration: { value: 6.5, unit: 'h' },
      notes: 'bien',
    })
  })

  it('valida con el mismo esquema que Onboard API (estricto, sin campos del servidor)', () => {
    expect(validateCheckIn(filled(), CREW)).toEqual({ body: toCheckInBody(filled(), CREW) })
    expect(CheckInInputSchema.safeParse({ ...toCheckInBody(filled(), CREW), id: crypto.randomUUID() }).success).toBe(false)
  })

  it('traduce los errores a mensajes por campo', () => {
    const { fieldErrors } = validateCheckIn(filled({ mood: null, sleepHours: '30', notes: 'x'.repeat(501) }), CREW)
    expect(fieldErrors).toEqual({
      mood: 'Elige un valor de 1 a 5.',
      sleepDuration: 'Indica las horas de sueño como un número entre 0 y 24.',
      notes: 'Las notas admiten como máximo 500 caracteres.',
    })
  })

  it('las rutas de issues del 400 de la API se asignan al campo correcto', () => {
    expect(
      issuesToFieldErrors([
        { path: 'sleepDuration.value', message: 'Too big' },
        { path: 'stress', message: 'Too small' },
      ]),
    ).toEqual({ sleepDuration: expect.any(String), stress: 'Elige un valor de 1 a 5.' })
  })
})

describe('estado de sincronización derivado', () => {
  const index = (events, requestedAt = '2026-11-14T10:00:10.000Z') => ({ requestedAt, events })

  // Horas del NAVEGADOR: cuándo se supo que el registro existía y cuándo se pidieron los datos.
  const KNOWN = '2026-11-14T10:00:00.000Z'
  const LATER = '2026-11-14T10:00:10.000Z'
  const snapshot = (byStatus, requestedAt = LATER) => ({ requestedAt, receivedAt: requestedAt, byStatus })
  const drained = { pending: 0, sending: 0, retry_scheduled: 0, acknowledged: 7, failed: 0 }
  const busy = { ...drained, pending: 3 }
  const derive = (idx, snap) => deriveSyncStatus({ index: idx, snapshot: snap, entityId: 'a', existsSince: KNOWN })

  it('pendiente: el evento aparece en la lista de su estado (evidencia explícita)', () => {
    const event = { entityId: 'a', status: 'pending' }
    expect(derive(index([event]), snapshot(busy))).toEqual({ state: 'pending', evidence: 'event', event })
  })

  it('también se usa el estado explícito aunque la lista pudiera estar truncada', () => {
    const event = { entityId: 'a', status: 'retry_scheduled' }
    expect(derive({ ...index([event]), truncated: true }, snapshot(busy))).toMatchObject({ state: 'retry_scheduled', evidence: 'event' })
  })

  it('confirmado: una instantánea posterior sin eventos sin acuse prueba la recepción', () => {
    expect(derive(index([]), snapshot(drained))).toEqual({ state: 'acknowledged', evidence: 'queue-drained', verifiedAt: LATER })
  })

  it('no encontrado con la cola ocupada: NO se infiere la recepción por ausencia', () => {
    expect(derive(index([]), snapshot(busy))).toEqual({ state: 'unverified', reason: 'queue-busy' })
  })

  it('consulta incompleta (lista truncada a 500): no se afirma nada', () => {
    expect(derive({ ...index([]), truncated: true }, snapshot(busy))).toEqual({ state: 'unverified', reason: 'partial-query' })
  })

  it('un evento fallido impide la prueba de cola vacía', () => {
    expect(derive(index([]), snapshot({ ...drained, failed: 1 }))).toMatchObject({ state: 'unverified' })
  })

  it('datos pedidos antes de saber que el registro existía: todavía se está comprobando', () => {
    const before = '2026-11-14T09:59:59.000Z'
    expect(derive(index([], before), snapshot(drained, before))).toEqual({ state: 'checking' })
    expect(deriveSyncStatus({ index: null, snapshot: null, entityId: 'a', existsSince: KNOWN })).toEqual({ state: 'checking' })
    expect(deriveSyncStatus({ index: index([]), snapshot: snapshot(drained), entityId: 'a' })).toEqual({ state: 'checking' })
  })

  it('una instantánea vacía pero anterior a la creación no cuenta como evidencia', () => {
    expect(derive(index([]), snapshot(drained, '2026-11-14T09:59:59.000Z'))).toMatchObject({ state: 'unverified' })
  })

  it('no depende del reloj del servidor: solo compara horas del navegador', () => {
    // Eventos con horas de servidor muy desfasadas no alteran el resultado.
    const skewed = { entityId: 'a', status: 'pending', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' }
    expect(derive(index([skewed]), snapshot(busy))).toMatchObject({ state: 'pending' })
  })

  it('buildIndex marca como truncada cualquier lista que alcance el límite', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ entityId: `e${i}`, status: 'pending' }))
    expect(buildIndex(LATER, { pending: many, failed: [] }).truncated).toBe(true)
    expect(buildIndex(LATER, { pending: many.slice(0, 499), failed: [] })).toMatchObject({ truncated: false, requestedAt: LATER })
    expect(unacknowledgedCount(busy)).toBe(3)
  })

  it('latestSyncError devuelve el error más reciente', () => {
    const older = { lastError: { code: 'A' }, updatedAt: '2026-11-14T10:00:00.000Z' }
    const newer = { lastError: { code: 'B' }, updatedAt: '2026-11-14T10:01:00.000Z' }
    expect(latestSyncError(index([older, { updatedAt: 'x' }, newer]))).toBe(newer)
    expect(latestSyncError(index([]))).toBeNull()
  })
})

describe('Autoevaluación · somnolencia (KSS)', () => {
  it('se envía como entero solo si se indica, y se valida con el contrato', () => {
    const form = { ...emptyForm(), mood: 3, stress: 2, fatigue: 3, sleepQuality: 3 }
    expect(toCheckInBody(form, 'x')).not.toHaveProperty('sleepiness')
    expect(toCheckInBody({ ...form, sleepiness: '8' }, 'x').sleepiness).toBe(8)
    const crew = '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d'
    expect(validateCheckIn({ ...form, sleepiness: '8' }, crew).body.sleepiness).toBe(8)
    expect(validateCheckIn({ ...form, sleepiness: '12' }, crew).fieldErrors.sleepiness).toMatch(/de 1 a 9/)
  })
})
