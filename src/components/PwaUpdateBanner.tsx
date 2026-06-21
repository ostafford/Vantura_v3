import { useNavigate } from 'react-router-dom'
import { APP_VERSION } from '@/lib/appVersion'

interface PwaUpdateBannerProps {
  onReload: () => void
  onDismiss: () => void
}

export function PwaUpdateBanner({ onReload, onDismiss }: PwaUpdateBannerProps) {
  const navigate = useNavigate()

  return (
    <div className="pwa-update-banner" role="alert" aria-live="polite">
      <div className="pwa-update-banner__inner">
        <div className="pwa-update-banner__message">
          <i className="mdi mdi-rocket-launch-outline" aria-hidden />
          <span>v{APP_VERSION} is ready</span>
        </div>
        <div className="pwa-update-banner__actions">
          <button
            type="button"
            className="pwa-update-banner__link"
            onClick={() => navigate('/changelog')}
          >
            What&apos;s new
          </button>
          <button
            type="button"
            className="pwa-update-banner__link"
            onClick={onDismiss}
            aria-label="Dismiss update banner"
          >
            Later
          </button>
          <button
            type="button"
            className="pwa-update-banner__reload"
            onClick={onReload}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
