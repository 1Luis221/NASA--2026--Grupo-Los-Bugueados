/** Error HTTP controlado con estado y detalles opcionales. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

/** Responde 404 en JSON para rutas no definidas. */
export function notFound(req, res) {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl })
}

/** Manejador de errores final: nunca expone trazas fuera de desarrollo. */
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500
  if (status >= 500) console.error(err)
  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : err.message,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && status >= 500 && { stack: err.stack }),
  })
}
