import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom'
import { initDb, getAppSetting } from '@/db'
import { advanceNextPaydayIfNeeded, recalculateTrackers } from '@/services/sync'
import { themeStore } from '@/stores/themeStore'
import { accentStore } from '@/stores/accentStore'
import { sessionStore } from '@/stores/sessionStore'
import { Layout } from '@/layout/Layout'
import { ToastProvider } from '@/components/ToastProvider'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { AnalyticsLayout } from '@/pages/analytics/AnalyticsLayout'
import { AnalyticsIndex } from '@/pages/analytics/AnalyticsIndex'
import { AnalyticsTrackers } from '@/pages/analytics/AnalyticsTrackers'
import { AnalyticsTrackersDetail } from '@/pages/analytics/AnalyticsTrackersDetail'
import { AnalyticsInsights } from '@/pages/analytics/AnalyticsInsights'
import { AnalyticsReports } from '@/pages/analytics/AnalyticsReports'
import { AnalyticsMonthlyReview } from '@/pages/analytics/AnalyticsMonthlyReview'
import { AnalyticsSavers } from '@/pages/analytics/AnalyticsSavers'
import { Settings } from '@/pages/Settings'
import { Help } from '@/pages/Help'
import { Unlock } from '@/pages/Unlock'
import { Onboarding } from '@/pages/Onboarding'

function SaverAccountTransactionsRedirect() {
  const { saverId } = useParams<{ saverId: string }>()
  const id = saverId?.trim()
  if (!id) return <Navigate to="/analytics/savers" replace />
  const q = new URLSearchParams({
    saverActivity: '1',
    linkedAccountId: id,
  })
  return <Navigate to={`/transactions?${q.toString()}`} replace />
}

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
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="plan" element={<Navigate to="/analytics" replace />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="analytics" element={<AnalyticsLayout />}>
              <Route index element={<AnalyticsIndex />} />
              <Route
                path="budget"
                element={<Navigate to="/analytics" replace />}
              />
              <Route
                path="income"
                element={<Navigate to="/analytics" replace />}
              />
              <Route path="trackers" element={<AnalyticsTrackers />} />
              <Route
                path="trackers/:trackerId"
                element={<AnalyticsTrackersDetail />}
              />
              <Route path="savers" element={<AnalyticsSavers />} />
              <Route
                path="savers/:saverId"
                element={<SaverAccountTransactionsRedirect />}
              />
              <Route
                path="wants"
                element={<Navigate to="/analytics" replace />}
              />
              <Route
                path="wants/:wantId"
                element={<Navigate to="/analytics" replace />}
              />
              <Route
                path="goals"
                element={<Navigate to="/analytics" replace />}
              />
              <Route
                path="goals/:goalId"
                element={<Navigate to="/analytics" replace />}
              />
              <Route path="insights" element={<AnalyticsInsights />} />
              <Route path="reports" element={<AnalyticsReports />} />
              <Route
                path="net-worth"
                element={<Navigate to="/analytics" replace />}
              />
              <Route
                path="monthly-review"
                element={<AnalyticsMonthlyReview />}
              />
            </Route>
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

function App() {
  return <AppContent />
}

export default App
