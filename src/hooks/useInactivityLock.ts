import { useEffect, useRef } from 'react'
import { sessionStore } from '@/stores/sessionStore'

const INACTIVITY_MS = 3 * 60 * 1000

export function useInactivityLock(active: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) return

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        () => sessionStore.getState().lock(),
        INACTIVITY_MS
      )
    }

    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [active])
}
