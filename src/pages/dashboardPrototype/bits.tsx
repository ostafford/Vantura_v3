// PROTOTYPE — shared bits for the Dashboard variants (#181).
import { money, type DashFixture } from './fixture'

export const muted = 'var(--bs-secondary-color)'
export const danger = 'var(--vantura-danger-text)'
export const success = 'var(--vantura-success-text)'
export const warning = 'var(--bs-warning-text-emphasis)'
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function MonthReviewCard({
  f,
  compact,
}: {
  f: DashFixture
  compact?: boolean
}) {
  if (!f.review) return null
  return (
    <div
      className={`d-flex align-items-center gap-2 ${compact ? 'py-2 px-3' : 'p-3'} mb-3`}
      style={{
        border: '1px solid var(--vantura-success)',
        borderRadius: 8,
        background:
          'color-mix(in srgb, var(--vantura-success) 10%, transparent)',
      }}
    >
      <i
        className="mdi mdi-calendar-check-outline"
        aria-hidden
        style={{ color: success, fontSize: compact ? '1rem' : '1.4rem' }}
      />
      <div className="flex-grow-1">
        <strong>{f.review.month}:</strong> you saved{' '}
        <strong>{money(f.review.savedCents)}</strong>
        {!compact && (
          <div className="small" style={{ color: muted }}>
            Tap to open October on the Budget Plan
          </div>
        )}
      </div>
      <button type="button" className="btn btn-sm btn-outline-secondary">
        Mark reviewed
      </button>
    </div>
  )
}

/** Light weekly spending bars, Mon–Sun this week; optional last-week ghost. */
export function WeekBars({
  f,
  height = 90,
  ghost = true,
  bills = false,
}: {
  f: DashFixture
  height?: number
  ghost?: boolean
  bills?: boolean
}) {
  const max = Math.max(...f.lastWeek, ...f.week.map((x) => x ?? 0))
  // Nov 2026: Mon 2 .. Sun 8 for this prototype
  const dates = [2, 3, 4, 5, 6, 7, 8]
  return (
    <div
      className="d-flex align-items-end gap-2"
      style={{ height: height + 34 }}
    >
      {f.week.map((v, i) => {
        const billsToday = bills
          ? f.stillToGo.filter(
              (t) => t.day === dates[i] && t.kind === 'regular'
            )
          : []
        const isToday = dates[i] === f.day
        return (
          <div
            key={i}
            className="flex-grow-1 d-flex flex-column align-items-center"
            style={{ minWidth: 0 }}
          >
            <div
              className="position-relative w-100 d-flex align-items-end justify-content-center"
              style={{ height }}
            >
              {ghost && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    width: '70%',
                    height: (f.lastWeek[i] / max) * height,
                    border: '1px dashed var(--bs-border-color)',
                    borderRadius: 3,
                  }}
                />
              )}
              {v != null && (
                <div
                  title={money(v)}
                  style={{
                    position: 'relative',
                    width: '70%',
                    height: Math.max(2, (v / max) * height),
                    background: 'var(--vantura-primary)',
                    opacity: isToday ? 1 : 0.65,
                    borderRadius: 3,
                  }}
                />
              )}
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: isToday ? undefined : muted,
                fontWeight: isToday ? 700 : 400,
              }}
            >
              {DAYS[i]}
            </div>
            {bills && billsToday.length > 0 && (
              <div
                style={{
                  fontSize: '0.6rem',
                  color: warning,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
                title={billsToday.map((b) => b.name).join(', ')}
              >
                <i className="mdi mdi-calendar-sync-outline" aria-hidden />{' '}
                {money(billsToday.reduce((s, b) => s + b.cents, 0))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Stub({ label }: { label: string }) {
  return (
    <div
      className="p-3 text-center small"
      style={{
        border: '1px dashed var(--bs-border-color)',
        borderRadius: 8,
        color: muted,
      }}
    >
      {label}{' '}
      <span className="d-block" style={{ fontSize: '0.7rem' }}>
        (existing section, unchanged)
      </span>
    </div>
  )
}
