import { z } from 'zod'

/** Identificador de entidad: UUID (generable con crypto.randomUUID() en navegador y Node). */
export const idSchema = z.uuid()

/** Marca temporal ISO 8601 en UTC (sufijo "Z" obligatorio, sin desplazamientos horarios). */
export const timestampSchema = z.iso.datetime()

/** Texto recortado y no vacío con longitud máxima. */
export const textSchema = (max) => z.string().trim().min(1).max(max)

/**
 * Construye las dos variantes de un esquema a partir de una única definición:
 *
 * - tolerante (`z.object`): descarta campos desconocidos. Para datos ENTRANTES
 *   (otro nodo puede ejecutar una versión más nueva del modelo).
 * - estricta (`z.strictObject`): rechaza campos desconocidos en TODOS los
 *   niveles. Para registros que nuestro sistema CREA o ENVÍA (detecta erratas).
 *
 * `build` recibe `{ object, strict }` y debe usar `object` para cada objeto
 * del esquema, incluidos los anidados.
 *
 * @returns {[tolerant: import('zod').ZodType, strict: import('zod').ZodType]}
 */
export function defineSchemas(build) {
  return [build({ object: z.object, strict: false }), build({ object: z.strictObject, strict: true })]
}

/**
 * Medición con unidad explícita: { value, unit }.
 * `min`/`max` son límites de DOMINIO o PLAUSIBILIDAD FÍSICA para descartar
 * lecturas corruptas; no son umbrales clínicos.
 */
export function measurementSchema(unit, { min, max, integer = false }, object = z.object) {
  const value = (integer ? z.int() : z.number()).min(min).max(max)
  return object({ value, unit: z.literal(unit) })
}

/**
 * Procedencia de un dato. `type` fija la modalidad de captura y
 * `simulated` indica si el valor proviene del simulador.
 */
export function dataSourceSchema(type, object = z.object) {
  return object({
    type: z.literal(type),
    simulated: z.boolean(),
    deviceId: textSchema(64).optional(),
  })
}

/** Error descriptivo { code, message } (sincronización, acuses de recibo). */
export function errorInfoSchema(object = z.object) {
  return object({ code: textSchema(50), message: textSchema(500) })
}

/** true si `later` no es anterior a `earlier` (ambos ISO 8601). */
export function isNotBefore(later, earlier) {
  return Date.parse(later) >= Date.parse(earlier)
}

/**
 * Añade un issue de Zod en `path` cuando `condition` es falsa.
 * Pensado para usarse dentro de superRefine.
 */
export function check(ctx, condition, path, message) {
  if (!condition) ctx.addIssue({ code: 'custom', path, message })
}
