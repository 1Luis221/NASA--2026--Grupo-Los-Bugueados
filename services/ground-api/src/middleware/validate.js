/** Convierte los issues de Zod en un formato estable para respuestas HTTP. */
export const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
    ...(issue.keys && { keys: issue.keys }),
  }))

/**
 * Valida `req[source]` con un esquema Zod. El resultado parseado se guarda en
 * `res.locals[source]` (en Express 5 `req.query` es de solo lectura).
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {})
  if (!result.success) {
    return res.status(400).json({ error: 'Validation Error', issues: formatIssues(result.error) })
  }
  res.locals[source] = result.data
  next()
}
