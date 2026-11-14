import { expect } from 'vitest'

/** Copia profunda del ejemplo con modificaciones aplicadas por `mutate`. */
export function variant(example, mutate) {
  const copy = structuredClone(example)
  mutate(copy)
  return copy
}

/** Afirma que el esquema rechaza `data` con al menos un issue en `path`. */
export function expectInvalid(schema, data, path = []) {
  const result = schema.safeParse(data)
  expect(result.success, 'se esperaba que la validación fallara').toBe(false)
  const paths = result.error.issues.map((issue) => issue.path.join('.'))
  expect(paths).toContain(path.join('.'))
}

/** Afirma que el esquema acepta `data`. Muestra los issues si falla. */
export function expectValid(schema, data) {
  const result = schema.safeParse(data)
  expect(result.success ? [] : result.error.issues).toEqual([])
}
