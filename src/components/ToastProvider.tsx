import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { toastStore } from '@/stores/toastStore'

const AUTO_HIDE_MS = 4000
// A toast with an action (Undo) stays up longer, so there's time to reach it.
const ACTION_AUTO_HIDE_MS = 6000
// Keep in sync with --duration-base on `.vantura-toast--exit` (src/index.css).
const EXIT_MS = 200

export function ToastProvider() {
  const show = useStore(toastStore, (s) => s.show)
  const message = useStore(toastStore, (s) => s.message)
  const variant = useStore(toastStore, (s) => s.variant)
  const persistent = useStore(toastStore, (s) => s.persistent)
  const action = useStore(toastStore, (s) => s.action)
  const id = useStore(toastStore, (s) => s.id)
  const hide = useStore(toastStore, (s) => s.hide)
  const [exiting, setExiting] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const exitTimer = useRef<ReturnType<typeof setTimeout>>()

  const triggerExit = () => {
    clearTimeout(hideTimer.current)
    setExiting(true)
    exitTimer.current = setTimeout(() => {
      setExiting(false)
      hide()
    }, EXIT_MS)
  }

  useEffect(() => {
    // ToastProvider is unmounted while the app is locked, so its auto-hide
    // timer can't run — a toast fired during that window (e.g. a
    // background sync finishing after inactivity-lock) would otherwise sit
    // as `show: true` and flash out of context on the next mount. Discard
    // whatever was pending before this instance existed.
    hide()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!show) {
      setExiting(false)
      return
    }
    // A new toast replaces one that was on its way out.
    clearTimeout(exitTimer.current)
    setExiting(false)
    if (persistent) return
    hideTimer.current = setTimeout(
      triggerExit,
      action ? ACTION_AUTO_HIDE_MS : AUTO_HIDE_MS
    )
    return () => clearTimeout(hideTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, persistent, id])

  if (!show) return null

  return (
    <div
      key={id}
      className={`vantura-toast vantura-toast--${variant}${exiting ? ' vantura-toast--exit' : ''}`}
      role="alert"
      aria-live="polite"
    >
      {message}
      {action && (
        <button
          type="button"
          className="vantura-toast__action"
          onClick={() => {
            action.onClick()
            triggerExit()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
