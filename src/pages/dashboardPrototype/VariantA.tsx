// PROTOTYPE — Variant A "Headroom hero": one big Headroom card, both parts
// itemised under it; due-soon folded into Still to go out (no banner);
// Free spending so far + Net worth as two small tiles; light week bars.
import { useState } from 'react'
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

export const variantAName = 'Headroom hero'

export function VariantA({ f }: { f: DashFixture }) {
  const h = headroom(f)
  const soon = new Set(dueSoon(f).map((t) => t.name))
  const [open, setOpen] = useState(true)
  return (
    <div>
      <MonthReviewCard f={f} />
      <Card className="mb-3">
        <Card.Body>
          <div style={{ color: muted, fontSize: '0.8rem' }}>
            Headroom · to the end of November
          </div>
          <div
            className="fw-bold"
            style={{
              fontSize: '2.6rem',
              lineHeight: 1.1,
              color: h.headroom < 0 ? danger : undefined,
            }}
          >
            {money(h.headroom)}
          </div>
          <div className="small mb-2" style={{ color: muted }}>
            {money(h.onHand)} on hand − {money(h.toGo)} still to go out
            <button
              type="button"
              className="btn btn-link btn-sm p-0 ms-2 align-baseline"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Hide' : 'Show'} breakdown
            </button>
          </div>
          {open && (
            <div className="row g-3 mt-1">
              <div className="col-md-5">
                <div className="fw-semibold small mb-1">On hand</div>
                {f.accounts
                  .filter((a) => a.inHeadroom)
                  .map((a) => (
                    <div
                      key={a.name}
                      className="d-flex justify-content-between small py-1"
                      style={{
                        borderBottom: '1px solid var(--bs-border-color)',
                      }}
                    >
                      <span>{a.name}</span>
                      <span>{money(a.cents)}</span>
                    </div>
                  ))}
              </div>
              <div className="col-md-7">
                <div className="fw-semibold small mb-1">Still to go out</div>
                {f.stillToGo
                  .filter((t) => t.cents > 0)
                  .map((t) => (
                    <div
                      key={t.name}
                      className="d-flex justify-content-between small py-1 gap-2"
                      style={{
                        borderBottom: '1px solid var(--bs-border-color)',
                      }}
                    >
                      <span>
                        <i
                          className={`mdi ${t.kind === 'regular' ? 'mdi-calendar-sync-outline' : 'mdi-target'} me-1`}
                          style={{ color: muted }}
                          aria-hidden
                        />
                        {t.name}
                        {t.status === 'overdue' && (
                          <span
                            className="ms-2"
                            style={{ color: warning, fontSize: '0.7rem' }}
                          >
                            overdue · Mark paid
                          </span>
                        )}
                        {t.status === 'due' && soon.has(t.name) && (
                          <span
                            className="ms-2"
                            style={{ color: warning, fontSize: '0.7rem' }}
                          >
                            due {t.day} Nov
                          </span>
                        )}
                        {t.kind === 'tracker' && (
                          <span
                            className="ms-2"
                            style={{ color: muted, fontSize: '0.7rem' }}
                          >
                            left this month
                          </span>
                        )}
                      </span>
                      <span>{money(t.cents)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      <div className="row g-3 mb-3">
        <div className="col-6">
          <Card className="h-100">
            <Card.Body>
              <div style={{ color: muted, fontSize: '0.8rem' }}>
                Free spending so far
              </div>
              <div
                className="fw-bold fs-4"
                style={{ color: f.freeSoFarCents < 0 ? danger : success }}
              >
                {money(f.freeSoFarCents)}
              </div>
              <a href="#" className="small">
                Budget Plan →
              </a>
            </Card.Body>
          </Card>
        </div>
        <div className="col-6">
          <Card className="h-100">
            <Card.Body>
              <div style={{ color: muted, fontSize: '0.8rem' }}>
                Net worth · all Up balances
              </div>
              <div className="fw-bold fs-4">{money(h.netWorth)}</div>
              <div className="small" style={{ color: muted }}>
                incl. {money(h.netWorth - h.onHand)} not in Headroom
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>

      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between mb-2">
            <span className="fw-semibold">Spending this week</span>
            <span className="small" style={{ color: muted }}>
              dashed = last week
            </span>
          </div>
          <WeekBars f={f} />
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
