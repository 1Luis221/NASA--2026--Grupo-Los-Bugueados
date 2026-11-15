import { useEffect, useState } from 'react'

/** Fecha actual que se refresca cada `intervalMs` (para antigüedades "hace X"). */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
