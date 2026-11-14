import http from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createGroundContext } from './context.js'
import { createLogger } from './lib/runtime.js'
import { createSocketNotifier } from './realtime/notifier.js'
import { createSocketServer } from './realtime/socket-server.js'

/**
 * Servidor completo de tierra: Express + Socket.IO sobre un único servidor HTTP.
 * Lo usan server.js y las pruebas (con puerto 0 para evitar conflictos).
 */
export function createGroundServer({ config = loadConfig(), logger = createLogger(config.serviceName), clock } = {}) {
  const io = createSocketServer({ corsOrigins: config.socketCorsOrigins, logger })
  const ctx = createGroundContext({ config, logger, clock, notifier: createSocketNotifier(io) })
  const httpServer = http.createServer(createApp(ctx))
  io.attach(httpServer)

  return {
    ctx,
    io,
    httpServer,

    /** Abre el puerto. Rechaza (p. ej. EADDRINUSE) en lugar de abortar el proceso. */
    listen(port = config.port, host) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject)
          resolve(httpServer.address())
        })
      })
    },

    /** Cierra clientes Socket.IO, conexiones HTTP abiertas y el servidor. */
    close() {
      return new Promise((resolve) => {
        io.close(() => resolve())
        httpServer.closeAllConnections()
      })
    },
  }
}
