// PROTOTYPE — Variant B "The sum": On hand − Still to go out = Headroom as
// three side-by-side tiles; each part lists its own items. Toggled-off
// Savers sit greyed in On hand and add up to Net worth at its foot.
// Due-soon stays a slim one-line banner. No Free spending on the Dashboard.
import { Card } from 'react-bootstrap'
import { dueSoon, headroom, money, type DashFixture } from './fixture'
import { MonthReviewCard, Stub, WeekBars, danger, muted, warning } from './bits'

export const variantBName = 'The sum'

const Op = ({ c }: { c: string }) => (
  <div
    className="d-none d-md-flex align-items-center justify-content-center fs-3"
    style={{ color: muted, width: 24 }}
  >
    {c}
  </div>
)

export function VariantB({ f }: { f: DashFixture }) {
  const h = headroom(f)
  const soon = dueSoon(f)
  return (
    <div>
      {soon.length > 0 && (
        <div
          className="d-flex align-items-center gap-2 small mb-2 px-3 py-2"
          style={{
            borderRadius: 8,
            background:
              'color-mix(in srgb, var(--bs-warning) 15%, transparent)',
          }}
        >
          <i
            className="mdi mdi-bell-ring-outline"
            style={{ color: warning }}
            aria-hidden
          />
          <span className="flex-grow-1">
            <strong>Due soon:</strong>{' '}
            {soon
              .map(
                (t) =>
                  `${t.name} ${money(t.cents)} ${t.status === 'overdue' ? '(overdue)' : `(${t.day} Nov)`}`
              )
              .join(' · ')}
          </span>
          <button
            type="button"
            className="btn-close"
            style={{ fontSize: '0.6rem' }}
            aria-label="Dismiss for today"
          />
        </div>
      )}
      <MonthReviewCard f={f} compact />

      <div className="d-flex flex-column flex-md-row gap-2 mb-3 align-items-stretch">
        <Card className="flex-grow-1" style={{ flexBasis: 0 }}>
          <Card.Body>
            <div style={{ color: muted, fontSize: '0.8rem' }}>On hand</div>
            <div className="fw-bold fs-3">{money(h.onHand)}</div>
            <div className="mt-2">
              {f.accounts.map((a) => (
                <div
                  key={a.name}
                  className="d-flex justify-content-between align-items-center small py-1"
                  style={{ opacity: a.inHeadroom ? 1 : 0.5 }}
                >
                  <span>
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={a.inHeadroom}
                      readOnly
                    />
                    {a.name}
                  </span>
                  <span>{money(a.cents)}</span>
                </div>
              ))}
              <div
                className="d-flex justify-content-between small pt-2 mt-1"
                style={{
                  borderTop: '1px solid var(--bs-border-color)',
                  color: muted,
                }}
              >
                <span>Net worth (all Up)</span>
                <span>{money(h.netWorth)}</span>
              </div>
            </div>
          </Card.Body>
        </Card>
        <Op c="−" />
        <Card className="flex-grow-1" style={{ flexBasis: 0 }}>
          <Card.Body>
            <div style={{ color: muted, fontSize: '0.8rem' }}>
              Still to go out · Nov
            </div>
            <div className="fw-bold fs-3">{money(h.toGo)}</div>
            <div className="mt-2 small">
              <div
                className="fw-semibold mt-1"
                style={{ fontSize: '0.75rem', color: muted }}
              >
                Regulars not paid yet
              </div>
              {f.stillToGo
                .filter((t) => t.kind === 'regular')
                .map((t) => (
                  <div
                    key={t.name}
                    className="d-flex justify-content-between py-1"
                  >
                    <span>
                      {t.name}{' '}
                      <span
                        style={{
                          color: t.status === 'overdue' ? warning : muted,
                          fontSize: '0.7rem',
                        }}
                      >
                        {t.status === 'overdue' ? 'overdue' : `${t.day} Nov`}
                      </span>
                    </span>
                    <span>{money(t.cents)}</span>
                  </div>
                ))}
              <div
                className="fw-semibold mt-2"
                style={{ fontSize: '0.75rem', color: muted }}
              >
                Trackers left
              </div>
              {f.stillToGo
                .filter((t) => t.kind === 'tracker')
                .map((t) => (
                  <div
                    key={t.name}
                    className="d-flex justify-content-between py-1"
                    style={{ opacity: t.cents === 0 ? 0.5 : 1 }}
                  >
                    <span>{t.name}</span>
                    <span>{money(t.cents)}</span>
                  </div>
                ))}
            </div>
          </Card.Body>
        </Card>
        <Op c="=" />
        <Card
          className="flex-grow-1"
          style={{
            flexBasis: 0,
            borderColor:
              h.headroom < 0
                ? 'var(--vantura-danger)'
                : 'var(--vantura-primary)',
            borderWidth: 2,
          }}
        >
          <Card.Body>
            <div style={{ color: muted, fontSize: '0.8rem' }}>Headroom</div>
            <div
              className="fw-bold"
              style={{
                fontSize: '2.2rem',
                color: h.headroom < 0 ? danger : undefined,
              }}
            >
              {money(h.headroom)}
            </div>
            <div className="small" style={{ color: muted }}>
              {h.headroom < 0
                ? 'Short of what’s still going out this month.'
                : 'What’s yours after everything still going out this month.'}
            </div>
          </Card.Body>
        </Card>
      </div>

      <Card className="mb-3">
        <Card.Body>
          <div className="fw-semibold mb-2">
            Spending this week{' '}
            <span className="small fw-normal" style={{ color: muted }}>
              vs last week (dashed)
            </span>
          </div>
          <WeekBars f={f} height={70} />
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
