import { describe, it } from 'vitest'
import { exampleCrewMember } from '../src/examples.js'
import { CrewMemberSchema } from '../src/schemas/crew-member.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

describe('CrewMemberSchema', () => {
  it('acepta el ejemplo documentado', () => {
    expectValid(CrewMemberSchema, exampleCrewMember)
  })

  it('acepta sin campos opcionales', () => {
    expectValid(CrewMemberSchema, variant(exampleCrewMember, (c) => {
      delete c.callsign
      delete c.agency
    }))
  })

  it('rechaza nombre vacío o solo espacios', () => {
    expectInvalid(CrewMemberSchema, variant(exampleCrewMember, (c) => { c.name = '   ' }), ['name'])
  })

  it('rechaza un rol desconocido', () => {
    expectInvalid(CrewMemberSchema, variant(exampleCrewMember, (c) => { c.role = 'captain' }), ['role'])
  })

  it('rechaza un estado desconocido', () => {
    expectInvalid(CrewMemberSchema, variant(exampleCrewMember, (c) => { c.status = 'sick' }), ['status'])
  })

  it('rechaza updatedAt anterior a createdAt', () => {
    expectInvalid(CrewMemberSchema, variant(exampleCrewMember, (c) => { c.updatedAt = '2026-10-01T00:00:00Z' }), ['updatedAt'])
  })
})
