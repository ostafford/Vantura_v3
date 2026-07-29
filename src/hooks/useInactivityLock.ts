import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
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
  const lockTimeoutVersion = useStore(sessionStore, (s) => s.lockTimeoutVersion)

  useEffect(() => {
    if (!active) return

    // Read once per activation rather than on every mousemove/scroll event —
    // those can fire dozens of times a second and each read is a sql.js
    // prepare/step/free call. Re-reads when lockTimeoutVersion changes, so a
    // Settings change takes effect immediately instead of only after the
    // next lock/unlock cycle.
    const timeoutMs = getLockTimeoutMs()

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        () => sessionStore.getState().lock(),
        timeoutMs
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
  }, [active, lockTimeoutVersion])
}
