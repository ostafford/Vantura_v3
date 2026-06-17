import { useEffect, useRef } from 'react'
import { sessionStore } from '@/stores/sessionStore'
import { getAppSetting } from '@/db'

const DEFAULT_TIMEOUT_MINUTES = 3

function getLockTimeoutMs(): number {
  const raw = getAppSetting('lock_timeout_minutes')
  const minutes = raw ? parseInt(raw, 10) : DEFAULT_TIMEOUT_MINUTES
  return (
    (Number.isNaN(minutes) || minutes < 1 ? DEFAULT_TIMEOUT_MINUTES : minutes) *
    60 *
    1000
  )
}

export function useInactivityLock(active: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) return

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        () => sessionStore.getState().lock(),
        getLockTimeoutMs()
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
