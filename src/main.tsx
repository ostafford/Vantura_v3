import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import './index.css'

// When iOS/macOS Safari restores this page from the Back-Forward Cache
// (bfcache), the sql.js WASM context and module-level DB reference are
// stale. A full reload is the safest recovery — it costs one extra load
// but prevents the ErrorBoundary "Something went wrong" on PWA reopen.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload()
})

// iOS applies :active (all press feedback) only when a touchstart listener
// exists. Register one explicitly instead of relying on the inactivity lock's
// listener, which is absent on Unlock/Onboarding.
document.addEventListener('touchstart', () => {}, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
