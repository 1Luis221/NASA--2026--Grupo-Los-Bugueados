import { createGroundServer } from './ground-server.js'

const server = createGroundServer()
const { config, logger } = server.ctx

try {
  await server.listen(config.port)
  logger.info(`escuchando en http://localhost:${config.port} (${config.env}) · Socket.IO activo`)
} catch (err) {
  const reason = err.code === 'EADDRINUSE' ? `el puerto ${config.port} ya está en uso` : err.message
  logger.error(`no se pudo iniciar: ${reason}`)
  process.exit(1)
}

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} recibido, cerrando…`)
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
