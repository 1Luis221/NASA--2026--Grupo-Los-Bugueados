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
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}
