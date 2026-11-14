import { Server } from 'socket.io'

/**
 * Servidor Socket.IO para los clientes terrestres (dashboard). Solo emite
 * (tierra → dashboard): la sincronización con la nave va por HTTP.
 * Se crea sin servidor HTTP y se adjunta después con `io.attach(httpServer)`.
 */
export function createSocketServer({ corsOrigins = [], logger }) {
  const io = new Server({
    serveClient: false,
    cors: { origin: corsOrigins },
  })

  io.on('connection', (socket) => {
    logger.info(`cliente en tiempo real conectado (${socket.id}); total: ${io.engine.clientsCount}`)
    socket.on('disconnect', (reason) => {
      logger.info(`cliente en tiempo real desconectado (${socket.id}): ${reason}`)
    })
  })

  return io
}
