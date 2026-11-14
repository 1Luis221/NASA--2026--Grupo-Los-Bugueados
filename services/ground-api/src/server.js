import { createApp } from './app.js'
import { config } from './config.js'

// En Express 5, el callback de listen() recibe el error si el arranque falla.
const server = createApp().listen(config.port, (err) => {
  if (err) {
    const reason = err.code === 'EADDRINUSE' ? `el puerto ${config.port} ya está en uso` : err.message
    console.error(`[${config.serviceName}] no se pudo iniciar: ${reason}`)
    process.exit(1)
  }
  console.log(`[${config.serviceName}] escuchando en http://localhost:${config.port} (${config.env})`)
})

function shutdown(signal) {
  console.log(`[${config.serviceName}] ${signal} recibido, cerrando…`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
