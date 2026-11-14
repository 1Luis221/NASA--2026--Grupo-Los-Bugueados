import { describe, expect, it } from 'vitest'
import * as examples from '../src/examples.js'
import {
  AlertSchema,
  AlertStrictSchema,
  CameraMetricsSchema,
  CameraMetricsStrictSchema,
  CrewMemberSchema,
  CrewMemberStrictSchema,
  SyncAckSchema,
  SyncAckStrictSchema,
  SyncEventSchema,
  SyncEventStrictSchema,
  VitalSignsSchema,
  VitalSignsStrictSchema,
  WellnessCheckInSchema,
  WellnessCheckInStrictSchema,
} from '../src/schemas/index.js'
import { expectValid, variant } from './helpers.js'

/** [nombre, tolerante, estricto, ejemplo válido] */
const PAIRS = [
  ['CrewMember', CrewMemberSchema, CrewMemberStrictSchema, examples.exampleCrewMember],
  ['VitalSigns', VitalSignsSchema, VitalSignsStrictSchema, examples.exampleVitalSigns],
  ['WellnessCheckIn', WellnessCheckInSchema, WellnessCheckInStrictSchema, examples.exampleWellnessCheckIn],
  ['CameraMetrics', CameraMetricsSchema, CameraMetricsStrictSchema, examples.exampleCameraMetrics],
  ['Alert', AlertSchema, AlertStrictSchema, examples.exampleAlert],
  ['SyncEvent', SyncEventSchema, SyncEventStrictSchema, examples.exampleSyncEvent],
  ['SyncAck', SyncAckSchema, SyncAckStrictSchema, examples.exampleSyncAck],
]

const unrecognized = (result) =>
  result.error.issues
    .filter((issue) => issue.code === 'unrecognized_keys')
    .map((issue) => [issue.path.join('.'), issue.keys])

describe.each(PAIRS)('%s: modo tolerante vs estricto', (_name, tolerant, strict, example) => {
  it('ambos modos aceptan el ejemplo documentado', () => {
    expectValid(tolerant, example)
    expectValid(strict, example)
  })

  it('ENTRANTE: el modo tolerante acepta un campo adicional y lo descarta', () => {
    const incoming = variant(example, (r) => { r.fieldFromNewerVersion = 'x' })
    const result = tolerant.safeParse(incoming)
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('fieldFromNewerVersion')
  })

  it('LOCAL: el modo estricto rechaza el mismo campo adicional', () => {
    const result = strict.safeParse(variant(example, (r) => { r.fieldFromNewerVersion = 'x' }))
    expect(result.success).toBe(false)
    expect(unrecognized(result)).toEqual([['', ['fieldFromNewerVersion']]])
  })
})

describe('erratas en registros creados localmente', () => {
  it('rechaza un nombre de campo mal escrito (crewMemberID en lugar de crewMemberId)', () => {
    const typo = variant(examples.exampleVitalSigns, (v) => {
      v.crewMemberID = v.crewMemberId
      delete v.crewMemberId
    })
    const result = VitalSignsStrictSchema.safeParse(typo)
    expect(result.success).toBe(false)
    expect(unrecognized(result)).toEqual([['', ['crewMemberID']]])
  })

  it('detecta erratas en objetos anidados que el modo tolerante descartaría en silencio', () => {
    const typo = variant(examples.exampleVitalSigns, (v) => {
      v.source.devicId = v.source.deviceId // errata en un campo OPCIONAL
      delete v.source.deviceId
    })

    const lenient = VitalSignsSchema.safeParse(typo)
    expect(lenient.success).toBe(true)
    expect(lenient.data.source).toEqual({ type: 'sensor', simulated: true })

    const strictResult = VitalSignsStrictSchema.safeParse(typo)
    expect(strictResult.success).toBe(false)
    expect(unrecognized(strictResult)).toEqual([['source', ['devicId']]])
  })

  it('detecta erratas en mediciones anidadas profundamente (headPose.yaw)', () => {
    const typo = variant(examples.exampleCameraMetrics, (m) => { m.headPose.yaw.units = 'deg' })
    expect(unrecognized(CameraMetricsStrictSchema.safeParse(typo))).toEqual([['headPose.yaw', ['units']]])
  })

  it('el SyncEvent estricto valida su payload en modo estricto', () => {
    const typo = variant(examples.exampleSyncEvent, (e) => { e.payload.heartRate.unidad = 'bpm' })
    expect(unrecognized(SyncEventStrictSchema.safeParse(typo))).toEqual([['payload.heartRate', ['unidad']]])
  })

  it('el SyncEvent tolerante también limpia los campos desconocidos del payload', () => {
    const incoming = variant(examples.exampleSyncEvent, (e) => { e.payload.firmware = '2.0' })
    const result = SyncEventSchema.safeParse(incoming)
    expect(result.success).toBe(true)
    expect(result.data.payload).not.toHaveProperty('firmware')
    expect(result.data.payload).toEqual(examples.exampleVitalSigns)
  })
})
