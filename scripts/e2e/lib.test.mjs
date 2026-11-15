import net from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { StepError, createProcessRegistry, getFreePort, isPortFree, poll, runSteps, withTimeout } from './lib.mjs'

describe('utilidades del script E2E', () => {
  it('poll devuelve el valor y el tiempo cuando la condición se cumple', async () => {
    let calls = 0
    const result = await poll(async () => ++calls >= 3 && 'listo', { interval: 5, timeout: 1000 })
    expect(result.value).toBe('listo')
    expect(calls).toBe(3)
  })

  it('poll nunca espera indefinidamente: falla con la etiqueta y el último error', async () => {
    await expect(
      poll(
        async () => {
          throw new Error('ECONNREFUSED')
        },
        { interval: 5, timeout: 50, label: 'Ground API' },
      ),
    ).rejects.toThrow(/Tiempo agotado \(50 ms\) esperando: Ground API · último error: ECONNREFUSED/)
  })

  it('withTimeout corta promesas que no terminan', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'CDP Page.navigate')).rejects.toThrow('Tiempo agotado (20 ms): CDP Page.navigate')
    await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7)
  })

  it('runSteps se detiene en el primer fallo e informa del paso y la causa', async () => {
    const third = vi.fn()
    const log = vi.fn()
    const error = await runSteps(
      [
        { title: 'Primero', run: async () => 1 },
        {
          title: 'Desconectar el enlace',
          run: async () => {
            throw new Error('Onboard API informa «connected»')
          },
        },
        { title: 'Tercero', run: third },
      ],
      {},
      log,
    ).catch((e) => e)

    expect(error).toBeInstanceOf(StepError)
    expect(error).toMatchObject({ step: 2, title: 'Desconectar el enlace' })
    expect(error.message).toBe('Paso 2 «Desconectar el enlace» falló: Onboard API informa «connected»')
    expect(third).not.toHaveBeenCalled()
  })

  it('isPortFree detecta puertos ocupados y libres', async () => {
    const port = await getFreePort()
    expect(await isPortFree(port)).toBe(true)

    const server = net.createServer().listen({ port, host: '127.0.0.1' })
    await new Promise((resolve) => server.once('listening', resolve))
    try {
      expect(await isPortFree(port)).toBe(false)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('el registro detiene SOLO los procesos que lanzó, incluso tras un fallo', async () => {
    const registry = createProcessRegistry()
    const child = registry.start('dormido', process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    expect(registry.size()).toBe(1)

    // Simula un fallo del flujo seguido de la limpieza garantizada.
    try {
      throw new Error('fallo simulado')
    } catch {
      await registry.stopAll()
    }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(registry.size()).toBe(0)
    await registry.stopAll() // idempotente
  })
})
