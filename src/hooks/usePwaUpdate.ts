import { useCallback, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from '@/stores/toastStore'

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const VISIBILITY_DEBOUNCE_MS = 30 * 1000 // min gap between visibility-triggered checks

// Module-level so multiple hook instances share one registration and one setup
let _registration: ServiceWorkerRegistration | null = null
let _initialized = false
let _lastVisibilityCheck = 0

export function usePwaUpdate() {
  const [checking, setChecking] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r || _initialized) return
      _initialized = true
      _registration = r

      // Background check every 30 minutes for long-running sessions
      setInterval(() => void r.update(), CHECK_INTERVAL_MS)

      // Check silently whenever the user returns to the app (tab/PWA focus)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return
        const now = Date.now()
        if (now - _lastVisibilityCheck < VISIBILITY_DEBOUNCE_MS) return
        _lastVisibilityCheck = now
        void r.update()
      })
    },
  })

  const checkForUpdate = useCallback(async () => {
    if (checking) return
    if (!_registration) {
      toast.info('App updates are only available in the installed PWA.')
      return
    }
    setChecking(true)
    try {
      await _registration.update()
      if (_registration.waiting) {
        // needRefresh will flip to true via the SW event — banner + button handle the install
        toast.info('Update found! See the banner below to install.')
      } else {
        toast.success('Vantura is up to date.')
      }
    } catch {
      toast.error('Update check failed. Check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }, [checking])

  const applyUpdate = useCallback(() => {
    updateServiceWorker(true)
  }, [updateServiceWorker])

  return { updateReady: needRefresh, applyUpdate, checkForUpdate, checking }
}
