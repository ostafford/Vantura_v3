// PROTOTYPE — Variant C "This week": two equal headline numbers (Headroom,
// Free spending so far) in one slim row, then a week strip that is both the
// spending graph and the due-soon list (bills sit on their day). No banner,
// no net-worth figure.
import { Card } from 'react-bootstrap'
import { dueSoon, headroom, money, type DashFixture } from './fixture'
import {
  MonthReviewCard,
  Stub,
  WeekBars,
  danger,
  muted,
  success,
  warning,
} from './bits'

export const variantCName = 'This week'

export function VariantC({ f }: { f: DashFixture }) {
  const h = headroom(f)
  const overdue = dueSoon(f).filter((t) => t.status === 'overdue')
  return (
    <div>
      <MonthReviewCard f={f} />
      <Card className="mb-3">
        <Card.Body>
          <div className="row g-3">
            <div
              className="col-6"
              style={{ borderRight: '1px solid var(--bs-border-color)' }}
            >
              <div style={{ color: muted, fontSize: '0.8rem' }}>Headroom</div>
              <div
                className="fw-bold fs-2"
                style={{ color: h.headroom < 0 ? danger : undefined }}
              >
                {money(h.headroom)}
              </div>
              <div className="small" style={{ color: muted }}>
                {money(h.onHand)} on hand · {money(h.toGo)} to go out
              </div>
            </div>
            <div className="col-6">
              <div style={{ color: muted, fontSize: '0.8rem' }}>
                Free spending so far
              </div>
              <div
                className="fw-bold fs-2"
                style={{ color: f.freeSoFarCents < 0 ? danger : success }}
              >
                {money(f.freeSoFarCents)}
              </div>
              <div className="small" style={{ color: muted }}>
                Day {f.day} of {f.daysInMonth} · of {money(f.incomeCents)}{' '}
                income
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between mb-2">
            <span className="fw-semibold">This week</span>
            <span className="small" style={{ color: muted }}>
              bars = spending ·{' '}
              <i className="mdi mdi-calendar-sync-outline" aria-hidden /> =
              Regulars due
            </span>
          </div>
          {overdue.length > 0 && (
            <div className="small mb-2" style={{ color: warning }}>
              <i className="mdi mdi-alert-outline me-1" aria-hidden />
              {overdue
                .map((t) => `${t.name} ${money(t.cents)} overdue`)
                .join(' · ')}{' '}
              · <a href="#">Mark paid</a>
            </div>
          )}
          <WeekBars f={f} height={80} ghost={false} bills />
        </Card.Body>
      </Card>

      <div className="dashboard-grid">
        <Stub label="Month at a glance (chart + money in/out)" />
        <Stub label="Trackers" />
        <Stub label="Upcoming (Overdue / This month / Later)" />
      </div>
    </div>
  )
}
