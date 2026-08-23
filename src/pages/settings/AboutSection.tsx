import { useNavigate, Link } from 'react-router-dom'
import { Button, Spinner } from 'react-bootstrap'
import { APP_VERSION } from '@/lib/appVersion'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'
import { setDashboardTourCompleted } from '@/lib/dashboardTour'

export function AboutSection() {
  const { updateReady, applyUpdate, checkForUpdate, checking } = usePwaUpdate()
  const navigate = useNavigate()

  return (
    <>
      {/* Version + URL */}
      <div className="mb-4">
        <div
          className="d-flex align-items-center gap-2 mb-1"
          style={{ fontSize: '0.9rem' }}
        >
          <i
            className="mdi mdi-information-outline"
            style={{
              color: 'var(--vantura-primary)',
              fontSize: '1.1rem',
            }}
            aria-hidden
          />
          <span className="text-muted">
            Vantura{' '}
            <span className="fw-semibold text-body">v{APP_VERSION}</span>
          </span>
        </div>
        <div
          className="d-flex align-items-center gap-2 mb-3"
          style={{ fontSize: '0.9rem' }}
        >
          <i
            className="mdi mdi-earth"
            style={{
              color: 'var(--vantura-primary)',
              fontSize: '1.1rem',
            }}
            aria-hidden
          />
          <span className="text-muted">
            Live at{' '}
            <a
              href="https://myvantura.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-body fw-semibold"
            >
              myvantura.xyz
            </a>
          </span>
        </div>
        {updateReady ? (
          <Button
            variant="outline-success"
            size="sm"
            onClick={applyUpdate}
            aria-label="Install the available app update"
          >
            <i className="mdi mdi-arrow-down-circle-outline me-1" aria-hidden />
            Update available — Install now
          </Button>
        ) : (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={checkForUpdate}
            disabled={checking}
            aria-label="Check for app updates"
            aria-busy={checking}
          >
            {checking ? (
              <>
                <Spinner
                  animation="border"
                  size="sm"
                  className="me-1"
                  role="status"
                  aria-hidden="true"
                />
                Checking…
              </>
            ) : (
              <>
                <i className="mdi mdi-refresh me-1" aria-hidden />
                Check for updates
              </>
            )}
          </Button>
        )}
      </div>

      <hr className="mb-4" />

      {/* Resource cards */}
      <div className="d-flex flex-column gap-3 mb-4">
        <Link
          to="/help"
          className="d-flex align-items-center gap-3 p-3 rounded text-decoration-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            transition: 'border-color 0.15s',
          }}
          aria-label="Open user guide"
        >
          <i
            className="mdi mdi-book-open-page-variant flex-shrink-0"
            style={{
              color: 'var(--vantura-primary)',
              fontSize: '1.4rem',
            }}
            aria-hidden
          />
          <div>
            <div className="fw-semibold small text-body">User guide</div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              How everything works — features, calculations, tips
            </div>
          </div>
          <i
            className="mdi mdi-chevron-right ms-auto flex-shrink-0"
            style={{
              color: 'var(--vantura-text-secondary)',
              fontSize: '1.1rem',
            }}
            aria-hidden
          />
        </Link>

        <Link
          to="/changelog"
          className="d-flex align-items-center gap-3 p-3 rounded text-decoration-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            transition: 'border-color 0.15s',
          }}
          aria-label="See what's new"
        >
          <i
            className="mdi mdi-rocket-launch-outline flex-shrink-0"
            style={{
              color: 'var(--vantura-primary)',
              fontSize: '1.4rem',
            }}
            aria-hidden
          />
          <div>
            <div className="fw-semibold small text-body">What&apos;s new</div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              Changelog and release milestones
            </div>
          </div>
          <i
            className="mdi mdi-chevron-right ms-auto flex-shrink-0"
            style={{
              color: 'var(--vantura-text-secondary)',
              fontSize: '1.1rem',
            }}
            aria-hidden
          />
        </Link>
      </div>

      <hr className="mb-4" />

      {/* Dashboard tour */}
      <div>
        <p className="small text-muted mb-2">
          New to Vantura? Run the dashboard tour to see how everything works.
        </p>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => {
            setDashboardTourCompleted(false)
            navigate('/')
          }}
          aria-label="Show dashboard tour again"
        >
          <i className="mdi mdi-play-circle-outline me-1" aria-hidden />
          Show dashboard tour
        </Button>
      </div>
    </>
  )
}
