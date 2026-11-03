// PROTOTYPE — Variant C "Income flow": one bar that splits the month's
// Income into where it went, then exceptions first (over / overdue / no
// actual figure), Unplanned, and everything on track collapsed by bucket.
import { useState } from 'react'
import { Card } from 'react-bootstrap'
import {
  bucketActual,
  bucketPlanned,
  money,
  totals,
  type PvaItem,
  type PvaMonth,
} from './fixture'
import { KindIcon, LeftOrOver, StatusChip, muted, danger, success } from './bits'

export const variantCName = 'Income flow'

function needsLook(i: PvaItem) {
  return (
    (i.actualCents != null && i.actualCents > i.plannedCents) ||
    i.status === 'overdue' ||
    i.status === 'no-link'
  )
}

export function VariantC({ month }: { month: PvaMonth }) {
  const t = totals(month)
  const done = month.state === 'done'
  const [showOnTrack, setShowOnTrack] = useState(false)

  const rest = done ? t.freeSpending : t.onTrackToSave
  const segs = [
    { key: 'plan', label: 'Spent on plan', cents: t.plannedActual, color: 'var(--vantura-primary)' },
    { key: 'unpl', label: 'Spent unplanned', cents: t.unplanned, color: 'var(--bs-warning)' },
    ...(done
      ? []
      : [{ key: 'still', label: 'Still planned', cents: t.stillPlanned, color: 'color-mix(in srgb, var(--vantura-primary) 30%, transparent)' }]),
    {
      key: 'rest',
      label: done ? 'Saved' : 'If the rest goes to plan',
      cents: Math.max(0, rest),
      color: 'var(--vantura-success)',
    },
  ]
  const denom = Math.max(
    t.income,
    segs.reduce((s, x) => s + Math.max(0, x.cents), 0)
  )

  const items = month.buckets.flatMap((b) => b.items.map((i) => ({ b, i })))
  const flagged = items.filter(({ i }) => needsLook(i))

  return (
    <div className="grid-margin">
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-1">
            <span className="fw-semibold">{month.label}</span>
            <span style={{ color: muted, fontSize: '0.8rem' }}>
              {done ? 'Month finished' : `Day ${month.day} of ${month.daysInMonth}`}
            </span>
          </div>
          <div className="d-flex align-items-baseline gap-2 flex-wrap mb-3">
            <span className="fw-bold" style={{ fontSize: '2rem', color: t.freeSpending >= 0 ? success : danger }}>
              {money(t.freeSpending)}
            </span>
            <span style={{ color: muted }}>
              {done ? 'free spending · saved' : 'free spending so far'}
            </span>
          </div>

          {/* Income bar */}
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--bs-tertiary-bg)' }}>
            {segs.map((s) => (
              <div key={s.key} title={`${s.label}: ${money(s.cents)}`} style={{ width: `${(Math.max(0, s.cents) / denom) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="d-flex flex-wrap gap-3 mt-2" style={{ fontSize: '0.75rem' }}>
            {segs.map((s) => (
              <span key={s.key} className="d-flex align-items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                <span style={{ color: muted }}>{s.label}</span>
                <strong>{money(s.cents)}</strong>
              </span>
            ))}
          </div>
          {!done && (
            <div className="mt-2" style={{ fontSize: '0.7rem', color: muted }}>
              <i className="mdi mdi-flask-outline me-1" aria-hidden />
              Prototype idea: “If the rest goes to plan” = Income − spent − planned still to spend (floored per item). Not a decided figure.
            </div>
          )}
          <hr />
          <div className="d-flex flex-wrap gap-3" style={{ fontSize: '0.8rem', color: muted }}>
            <span>Income <strong>{money(t.income)}</strong></span>
            <span>Committed <strong>{money(t.committed)}</strong></span>
            <span>Unallocated <strong>{money(t.unallocated)}</strong></span>
            <span>Actual {done ? '' : 'so far '}<strong>{money(t.actual)}</strong></span>
          </div>
        </Card.Body>
      </Card>

      {/* Needs a look */}
      <h6 className="mb-2" style={{ color: muted }}>Needs a look ({flagged.length})</h6>
      <Card className="mb-3">
        <ul className="list-group list-group-flush">
          {flagged.length === 0 && <li className="list-group-item" style={{ color: muted }}>Nothing over or unpaid.</li>}
          {flagged.map(({ b, i }) => (
            <li key={i.id} className="list-group-item d-flex justify-content-between align-items-center gap-2">
              <div className="min-w-0">
                <div>
                  <KindIcon kind={i.kind} />
                  {i.name}
                  <span style={{ color: muted, fontSize: '0.75rem' }}> · {b.name}</span>
                </div>
                <StatusChip item={i} />
              </div>
              <div className="text-end" style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}>
                <div>
                  {i.actualCents == null ? '—' : money(i.actualCents)}
                  <span style={{ color: muted }}> / {money(i.plannedCents)}</span>
                </div>
                <LeftOrOver item={i} done={done} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Unplanned */}
      <h6 className="mb-2" style={{ color: muted }}>Unplanned · {money(t.unplanned)}</h6>
      <Card className="mb-3">
        <ul className="list-group list-group-flush">
          {month.unplanned.map((r) => (
            <li key={r.id} className="list-group-item">
              <div className="d-flex justify-content-between">
                <span>{r.name}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.cents)}</strong>
              </div>
              {r.children && (
                <div style={{ fontSize: '0.75rem', color: muted }}>
                  {r.children.map((c) => `${c.name} ${money(c.cents)}`).join(' · ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* On track, collapsed */}
      <button type="button" className="btn btn-link p-0 mb-2" onClick={() => setShowOnTrack((s) => !s)}>
        <i className={`mdi ${showOnTrack ? 'mdi-chevron-down' : 'mdi-chevron-right'} me-1`} aria-hidden />
        {showOnTrack ? 'Hide' : 'Show'} everything by bucket
      </button>
      {showOnTrack &&
        month.buckets.map((b) => (
          <Card key={b.id} className="mb-2">
            <Card.Body className="py-2">
              <div className="d-flex justify-content-between fw-semibold">
                <span>
                  <i className={`mdi ${b.icon} me-1`} style={{ color: b.color }} aria-hidden />
                  {b.name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(bucketActual(b))}
                  <span style={{ color: muted, fontWeight: 400 }}> / {money(bucketPlanned(b))}</span>
                </span>
              </div>
              {b.items.map((i) => (
                <div key={i.id} className="d-flex justify-content-between ps-3" style={{ fontSize: '0.85rem' }}>
                  <span>
                    {i.name} <StatusChip item={i} />
                  </span>
                  <LeftOrOver item={i} done={done} />
                </div>
              ))}
            </Card.Body>
          </Card>
        ))}
    </div>
  )
}
