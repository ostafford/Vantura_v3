// PROTOTYPE — Variant B "Pace cards": Free spending so far as the page's
// hero, bucket cards (today's grid) gaining actual-vs-planned bars with a
// pace tick on Trackers, Unplanned as its own card, 4-up footer.
import { useState } from 'react'
import { Card, Row, Col } from 'react-bootstrap'
import {
  bucketActual,
  bucketPlanned,
  money,
  totals,
  type PvaItem,
  type PvaMonth,
} from './fixture'
import { LeftOrOver, StatusChip, muted, success, danger } from './bits'

export const variantBName = 'Pace cards'

function Bar({
  planned,
  actual,
  color,
  pace,
}: {
  planned: number
  actual: number
  color: string
  pace?: number // 0..1, where spending "should" be by today (Trackers only)
}) {
  const max = Math.max(planned, actual, 1)
  const over = actual > planned
  return (
    <div
      style={{
        position: 'relative',
        height: 6,
        borderRadius: 3,
        background: 'var(--bs-tertiary-bg)',
        overflow: 'visible',
      }}
    >
      <div
        style={{
          width: `${(Math.min(actual, planned) / max) * 100}%`,
          height: '100%',
          borderRadius: 3,
          background: color,
        }}
      />
      {over && (
        <div
          style={{
            position: 'absolute',
            left: `${(planned / max) * 100}%`,
            top: 0,
            width: `${((actual - planned) / max) * 100}%`,
            height: '100%',
            borderRadius: '0 3px 3px 0',
            background: danger,
          }}
        />
      )}
      {pace != null && planned > 0 && (
        <div
          title="Where you'd be by today if spending were even"
          style={{
            position: 'absolute',
            left: `${((planned * pace) / max) * 100}%`,
            top: -3,
            width: 2,
            height: 12,
            background: 'var(--bs-body-color)',
            opacity: 0.55,
          }}
        />
      )}
    </div>
  )
}

function ItemRow({
  i,
  color,
  month,
}: {
  i: PvaItem
  color: string
  month: PvaMonth
}) {
  const done = month.state === 'done'
  const pace =
    i.kind === 'tracker' && !done ? month.day / month.daysInMonth : undefined
  return (
    <div className="mb-2">
      <div className="d-flex justify-content-between gap-2" style={{ fontSize: '0.85rem' }}>
        <span className="text-truncate">{i.name}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {i.actualCents == null ? '—' : money(i.actualCents)}
          <span style={{ color: muted }}> / {money(i.plannedCents)}</span>
        </span>
      </div>
      {i.actualCents != null && (
        <Bar planned={i.plannedCents} actual={i.actualCents} color={color} pace={pace} />
      )}
      <div className="d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
        <StatusChip item={i} />
        <span className="ms-auto">
          <LeftOrOver item={i} done={done} />
        </span>
      </div>
    </div>
  )
}

export function VariantB({ month }: { month: PvaMonth }) {
  const t = totals(month)
  const done = month.state === 'done'
  const [openUnplanned, setOpenUnplanned] = useState(false)

  return (
    <div className="grid-margin">
      {/* Hero */}
      <Card className="mb-3">
        <Card.Body className="text-center py-4">
          <div style={{ color: muted, fontSize: '0.8rem' }}>
            {month.label} ·{' '}
            {done ? 'month finished' : `day ${month.day} of ${month.daysInMonth}`}
          </div>
          <div style={{ color: muted, fontSize: '0.9rem' }} className="mt-2">
            {done ? 'Free spending — saved this month' : 'Free spending so far'}
          </div>
          <div
            className="fw-bold"
            style={{
              fontSize: '2.4rem',
              color: t.freeSpending >= 0 ? success : danger,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {money(t.freeSpending)}
          </div>
          <div style={{ color: muted, fontSize: '0.8rem' }}>
            {money(t.income)} income − {money(t.actual)} spent
          </div>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-3">
        {month.buckets.map((b) => {
          const p = bucketPlanned(b)
          const a = bucketActual(b)
          return (
            <Col key={b.id} xs={12} sm={6} lg={4}>
              <Card
                className="h-100"
                style={{
                  borderLeft: `4px solid ${b.color}`,
                  borderStyle: b.notInBucket ? 'dashed' : undefined,
                }}
              >
                <Card.Body className="py-3">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <i className={`mdi ${b.icon}`} style={{ color: b.color, fontSize: '1.2rem' }} aria-hidden />
                    <span className="fw-semibold flex-grow-1">{b.name}</span>
                    <span className="fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {money(a)}
                      <span style={{ color: muted, fontWeight: 400, fontSize: '0.8rem' }}>
                        {' '}
                        / {money(p)}
                      </span>
                    </span>
                  </div>
                  <div className="mb-3">
                    <Bar planned={p} actual={a} color={b.color} />
                  </div>
                  {b.items.map((i) => (
                    <ItemRow key={i.id} i={i} color={b.color} month={month} />
                  ))}
                </Card.Body>
              </Card>
            </Col>
          )
        })}

        <Col xs={12} sm={6} lg={4}>
          <Card className="h-100" style={{ borderLeft: '4px solid var(--bs-secondary-color)' }}>
            <Card.Body className="py-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="mdi mdi-help-circle-outline" style={{ fontSize: '1.2rem', color: muted }} aria-hidden />
                <span className="fw-semibold flex-grow-1">Unplanned</span>
                <span className="fw-bold">{money(t.unplanned)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: muted }} className="mb-2">
                Spending that matched no Regular or Tracker
              </div>
              {month.unplanned.map((r) => (
                <div key={r.id} style={{ fontSize: '0.85rem' }}>
                  <div className="d-flex justify-content-between">
                    <span>{r.name}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.cents)}</span>
                  </div>
                  {openUnplanned &&
                    r.children?.map((c) => (
                      <div
                        key={c.name}
                        className="d-flex justify-content-between ps-3"
                        style={{ fontSize: '0.75rem', color: muted }}
                      >
                        <span>{c.name}</span>
                        <span>{money(c.cents)}</span>
                      </div>
                    ))}
                </div>
              ))}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 mt-2"
                onClick={() => setOpenUnplanned((o) => !o)}
              >
                {openUnplanned ? 'Hide subcategories' : 'Show subcategories'}
              </button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card>
        <Card.Body>
          <Row className="g-3 text-center">
            <Col xs={6} md={3}>
              <div style={{ color: muted, fontSize: '0.75rem' }}>Income</div>
              <div className="fw-bold fs-5">{money(t.income)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div style={{ color: muted, fontSize: '0.75rem' }}>Committed (planned)</div>
              <div className="fw-bold fs-5">{money(t.committed)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div style={{ color: muted, fontSize: '0.75rem' }}>
                {done ? 'Actual spending' : 'Actual so far'}
              </div>
              <div className="fw-bold fs-5">{money(t.actual)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div style={{ color: muted, fontSize: '0.75rem' }}>Unallocated (planned)</div>
              <div className="fw-bold fs-5">{money(t.unallocated)}</div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </div>
  )
}
