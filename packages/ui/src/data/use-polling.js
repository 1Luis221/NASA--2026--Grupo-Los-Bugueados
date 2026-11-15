import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from './api-client.js'

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

/**
 * Ejecuta `task(signal)` periódicamente sin solapamientos: la siguiente
 * ejecución se programa cuando termina la anterior (setTimeout encadenado).
 *
 * - `enabled: false` detiene el sondeo.
 * - Con la pestaña oculta se pausa; al volver a ser visible se ejecuta en el
 *   acto y se reanuda.
 * - Al desmontar se cancelan el temporizador y la ejecución en curso.
 * - Compatible con el doble montaje de React StrictMode: cada montaje del
 *   efecto tiene su propio ciclo, y la limpieza lo detiene por completo.
 */
export function usePolling(task, intervalMs, { enabled = true, immediate = true, pauseWhenHidden = true } = {}) {
  const taskRef = useRef(task)
  const runNowRef = useRef(() => Promise.resolve())
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(() => pauseWhenHidden && isHidden())

  useEffect(() => {
    taskRef.current = task
  })

  useEffect(() => {
    if (!enabled || !(intervalMs > 0)) return undefined

    let active = false
    let timer = null
    let controller = null
    let inFlight = null

    const run = () => {
      if (inFlight) return inFlight
      const current = new AbortController()
      controller = current
      setRunning(true)
      const promise = Promise.resolve()
        .then(() => taskRef.current(current.signal))
        .catch((err) => {
          // Los errores los gestiona quien define la tarea; el sondeo continúa.
          if (!isAbortError(err)) console.error('Error en tarea de sondeo', err)
        })
        .finally(() => {
          if (inFlight !== promise) return // ejecución liberada por stop()
          inFlight = null
          controller = null
          setRunning(false)
          if (active) timer = setTimeout(run, intervalMs)
        })
      inFlight = promise
      return promise
    }

    const stop = () => {
      active = false
      clearTimeout(timer)
      timer = null
      controller?.abort()
      controller = null
      inFlight = null
    }

    const start = (runNow) => {
      active = true
      if (runNow) run()
      else timer = setTimeout(run, intervalMs)
    }

    const onVisibilityChange = () => {
      if (isHidden()) {
        stop()
        setRunning(false)
        setPaused(true)
      } else {
        setPaused(false)
        start(true)
      }
    }

    runNowRef.current = run
    if (!(pauseWhenHidden && isHidden())) start(immediate)
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
      runNowRef.current = () => Promise.resolve()
    }
  }, [enabled, intervalMs, immediate, pauseWhenHidden])

  const runNow = useCallback(() => runNowRef.current(), [])

  return { running, paused: enabled && paused, runNow }
}
