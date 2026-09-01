import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { RouterProvider } from 'react-router-dom'
import { initDb, getAppSetting } from '@/db'
import { advanceNextPaydayIfNeeded, recalculateTrackers } from '@/services/sync'
import { reconcileSaverGoalAchievement } from '@/services/accounts'
import {
  themeStore,
  resolveTheme,
  THEME_LOCALSTORAGE_KEY,
} from '@/stores/themeStore'
import { sidebarPinsStore } from '@/stores/sidebarPinsStore'
import { sessionStore } from '@/stores/sessionStore'
import { ToastProvider } from '@/components/ToastProvider'
import { VanturaLogo } from '@/components/VanturaLogo'
import { Unlock } from '@/pages/Unlock'
import { Onboarding } from '@/pages/Onboarding'
import { Changelog } from '@/pages/Changelog'
import { appRouter } from '@/appRouter'
import { useInactivityLock } from '@/hooks/useInactivityLock'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner'

// Detect if the app was loaded directly at /changelog (public, no auth required)
const _base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const IS_CHANGELOG_PUBLIC_PATH =
  window.location.pathname === `${_base}/changelog` ||
  window.location.pathname === `${_base}/changelog/`

function ChangelogPublicShell() {
  return (
    <div className="changelog-public-shell">
      <header className="changelog-public-header">
        <div className="changelog-public-brand">
          <VanturaLogo variant="wordmark" height={32} />
        </div>
        <a
          href={import.meta.env.BASE_URL || '/'}
          className="btn btn-sm btn-outline-secondary"
        >
          <i className="mdi mdi-arrow-left me-1" aria-hidden />
          Back to Vantura
        </a>
      </header>
      <div className="changelog-public-content">
        <Changelog />
      </div>
    </div>
  )
}

function AppContent() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null
  )
  const themeMode = useStore(themeStore, (s) => s.mode)
  const themeHydrated = useStore(themeStore, (s) => s.hydrated)
  const unlocked = useStore(sessionStore, (s) => s.unlocked)
  useInactivityLock(unlocked)
  const { updateReady, applyUpdate } = usePwaUpdate()
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    if (!themeHydrated) return
    const apply = () => {
      const resolved = resolveTheme(themeMode)
      document.documentElement.setAttribute('data-theme', resolved)
      document.documentElement.setAttribute('data-bs-theme', resolved)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta)
        meta.setAttribute(
          'content',
          resolved === 'light' ? '#f5f4f0' : '#13131c'
        )
      localStorage.setItem(THEME_LOCALSTORAGE_KEY, themeMode)
    }
    apply()
    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [themeMode, themeHydrated])

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
      sidebarPinsStore.getState().hydrateFromDb()
      if (cancelled) return
      advanceNextPaydayIfNeeded()
      if (cancelled) return
      recalculateTrackers()
      if (cancelled) return
      reconcileSaverGoalAchievement()
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

  // Allow /changelog to load without auth only for non-onboarded users
  if (IS_CHANGELOG_PUBLIC_PATH && !onboardingComplete) {
    return <ChangelogPublicShell />
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
    return (
      <>
        <Unlock />
        {updateReady && !bannerDismissed && (
          <PwaUpdateBanner
            onReload={applyUpdate}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
      </>
    )
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
