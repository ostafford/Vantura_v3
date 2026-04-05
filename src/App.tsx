import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { RouterProvider } from 'react-router-dom'
import { initDb, getAppSetting } from '@/db'
import { advanceNextPaydayIfNeeded, recalculateTrackers } from '@/services/sync'
import { themeStore } from '@/stores/themeStore'
import { accentStore } from '@/stores/accentStore'
import { sessionStore } from '@/stores/sessionStore'
import { ToastProvider } from '@/components/ToastProvider'
import { Unlock } from '@/pages/Unlock'
import { Onboarding } from '@/pages/Onboarding'
import { appRouter } from '@/appRouter'

function AppContent() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null
  )
  const theme = useStore(themeStore, (s) => s.theme)
  const themeHydrated = useStore(themeStore, (s) => s.hydrated)
  const accent = useStore(accentStore, (s) => s.accent)
  const accentHydrated = useStore(accentStore, (s) => s.hydrated)
  const unlocked = useStore(sessionStore, (s) => s.unlocked)

  useEffect(() => {
    if (!themeHydrated) return
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme, themeHydrated])

  useEffect(() => {
    if (!accentHydrated) return
    document.documentElement.setAttribute('data-accent', accent)
  }, [accent, accentHydrated])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setBootError(null)
      try {
        await initDb()
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err instanceof Error ? err.message : 'Could not load app storage.'
          )
        }
        return
      }
      if (cancelled) return
      themeStore.getState().hydrateFromDb()
      if (cancelled) return
      accentStore.getState().hydrateFromDb()
      if (cancelled) return
      advanceNextPaydayIfNeeded()
      if (cancelled) return
      recalculateTrackers()
      if (cancelled) return
      const theme = themeStore.getState().theme
      const accent = accentStore.getState().accent
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-accent', accent)
      if (!cancelled) setReady(true)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const complete = getAppSetting('onboarding_complete') === '1'
    setOnboardingComplete(complete)
  }, [ready])

  if (bootError) {
    return (
      <div className="app-boot-shell app-boot-shell--padded">
        <h2 className="mb-2">Could not load app storage</h2>
        <p className="text-muted mb-4 text-center">{bootError}</p>
        <p className="small text-muted mb-3 text-center">
          Try again, or clear site data for this origin and re-open the app.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setBootError(null)
            Promise.resolve().then(() => {
              initDb()
                .then(() => window.location.reload())
                .catch((err) =>
                  setBootError(
                    err instanceof Error
                      ? err.message
                      : 'Could not load app storage.'
                  )
                )
            })
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="app-boot-shell">
        <span className="visually-hidden">Loading</span>
      </div>
    )
  }

  if (onboardingComplete === null) {
    return (
      <div className="app-boot-shell">
        <span className="visually-hidden">Loading</span>
      </div>
    )
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={() => {
          window.history.replaceState(null, '', import.meta.env.BASE_URL || '/')
          setOnboardingComplete(true)
        }}
      />
    )
  }

  if (!unlocked) {
    return <Unlock />
  }

  return (
    <>
      <ToastProvider />
      <RouterProvider router={appRouter} />
    </>
  )
}

function App() {
  return <AppContent />
}

export default App
