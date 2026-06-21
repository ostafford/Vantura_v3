import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { toastStore } from '@/stores/toastStore'

const AUTO_HIDE_MS = 4000
const EXIT_MS = 240

export function ToastProvider() {
  const show = useStore(toastStore, (s) => s.show)
  const message = useStore(toastStore, (s) => s.message)
  const variant = useStore(toastStore, (s) => s.variant)
  const persistent = useStore(toastStore, (s) => s.persistent)
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
    if (!show) {
      setExiting(false)
      return
    }
    if (persistent) return
    hideTimer.current = setTimeout(triggerExit, AUTO_HIDE_MS)
    return () => clearTimeout(hideTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, persistent])

  if (!show) return null

  return (
    <div
      className={`vantura-toast vantura-toast--${variant}${exiting ? ' vantura-toast--exit' : ''}`}
      role="alert"
      aria-live="polite"
    >
      {message}
    </div>
  )
}
