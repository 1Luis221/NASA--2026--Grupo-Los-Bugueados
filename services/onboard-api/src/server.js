import { createApp } from './app.js'
import { createOnboardContext } from './context.js'

const ctx = createOnboardContext()
const { config, logger } = ctx

// En Express 5, el callback de listen() recibe el error si el arranque falla.
const server = createApp(ctx).listen(config.port, (err) => {
  if (err) {
    const reason = err.code === 'EADDRINUSE' ? `el puerto ${config.port} ya está en uso` : err.message
    logger.error(`no se pudo iniciar: ${reason}`)
    process.exit(1)
  }
  ctx.start()
  logger.info(`escuchando en http://localhost:${config.port} (${config.env}) → tierra: ${config.groundApiUrl}`)
  if (config.devControls) logger.info('controles del simulador habilitados en /api/dev')
})

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} recibido, cerrando…`)
  await ctx.stop()
  server.close(() => process.exit(0))
  server.closeAllConnections()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
