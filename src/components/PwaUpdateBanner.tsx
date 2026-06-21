import { APP_VERSION } from '@/lib/appVersion'

interface PwaUpdateBannerProps {
  onReload: () => void
  onDismiss: () => void
  /** Left offset in px so the banner starts at the content edge, not behind the sidebar. */
  sidebarOffset?: number
}

export function PwaUpdateBanner({
  onReload,
  onDismiss,
  sidebarOffset = 0,
}: PwaUpdateBannerProps) {
  return (
    <div
      className="pwa-update-banner"
      role="alert"
      aria-live="polite"
      style={sidebarOffset > 0 ? { left: sidebarOffset } : undefined}
    >
      <div className="pwa-update-banner__inner">
        <div className="pwa-update-banner__message">
          <i className="mdi mdi-rocket-launch-outline" aria-hidden />
          <span>v{APP_VERSION} is ready</span>
        </div>
        <div className="pwa-update-banner__actions">
          <a href="/changelog" className="pwa-update-banner__link">
            What&apos;s new
          </a>
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
