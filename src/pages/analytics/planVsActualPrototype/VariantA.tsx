// PROTOTYPE — Variant A "Ledger": one reconciling table, buckets as row
// groups, Unplanned as the last group, an equation footer.
import { Fragment, useState } from 'react'
import { Card } from 'react-bootstrap'
import {
  bucketActual,
  bucketPlanned,
  money,
  totals,
  unplannedTotal,
  type PvaMonth,
} from './fixture'
import { KindIcon, LeftOrOver, StatusChip, muted, success, danger } from './bits'

export const variantAName = 'Ledger'

export function VariantA({ month }: { month: PvaMonth }) {
  const t = totals(month)
  const done = month.state === 'done'
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const num: React.CSSProperties = {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="grid-margin">
      <div className="d-flex align-items-baseline justify-content-between mb-3 flex-wrap gap-2">
        <h5 className="mb-0">{month.label}</h5>
        <span style={{ color: muted, fontSize: '0.85rem' }}>
          {done ? 'Month finished' : `Day ${month.day} of ${month.daysInMonth}`}
        </span>
      </div>

      <Card className="mb-3">
        <div className="table-responsive">
          <table className="table mb-0 align-middle" style={{ fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ color: muted, fontSize: '0.75rem' }}>
                <th style={{ fontWeight: 500 }}>Item</th>
                <th style={{ ...num, fontWeight: 500 }}>Planned</th>
                <th style={{ ...num, fontWeight: 500 }}>
                  {done ? 'Actual' : 'Actual so far'}
                </th>
                <th style={{ ...num, fontWeight: 500 }}>
                  {done ? 'Over / under' : 'Left / over'}
                </th>
              </tr>
            </thead>
            <tbody>
              {month.buckets.map((b) => {
                const p = bucketPlanned(b)
                const a = bucketActual(b)
                return (
                  <Fragment key={b.id}>
                    <tr style={{ background: `${b.color}14` }}>
                      <td className="fw-semibold">
                        <i
                          className={`mdi ${b.icon} me-2`}
                          style={{ color: b.color }}
                          aria-hidden
                        />
                        {b.name}
                      </td>
                      <td style={{ ...num, fontWeight: 600 }}>{money(p)}</td>
                      <td style={{ ...num, fontWeight: 600 }}>{money(a)}</td>
                      <td style={num}>
                        <LeftOrOver
                          item={{ plannedCents: p, actualCents: a }}
                          done={done}
                        />
                      </td>
                    </tr>
                    {b.items.map((i) => (
                      <tr key={i.id}>
                        <td style={{ paddingLeft: 32 }}>
                          <div>
                            <KindIcon kind={i.kind} />
                            {i.name}
                          </div>
                          <div
                            className="d-flex gap-2 flex-wrap"
                            style={{ fontSize: '0.7rem', color: muted }}
                          >
                            <span>{i.detail}</span>
                            <StatusChip item={i} />
                          </div>
                        </td>
                        <td style={num}>{money(i.plannedCents)}</td>
                        <td style={num}>
                          {i.actualCents == null ? (
                            <span style={{ color: muted }}>—</span>
                          ) : (
                            money(i.actualCents)
                          )}
                        </td>
                        <td style={num}>
                          <LeftOrOver item={i} done={done} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}

              {/* Unplanned */}
              <tr style={{ background: 'var(--bs-tertiary-bg)' }}>
                <td className="fw-semibold">
                  <i className="mdi mdi-help-circle-outline me-2" aria-hidden />
                  Unplanned
                </td>
                <td style={{ ...num, color: muted }}>—</td>
                <td style={{ ...num, fontWeight: 600 }}>
                  {money(unplannedTotal(month))}
                </td>
                <td />
              </tr>
              {month.unplanned.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    style={{ cursor: r.children ? 'pointer' : undefined }}
                    onClick={() =>
                      r.children && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))
                    }
                  >
                    <td style={{ paddingLeft: 32 }}>
                      {r.children && (
                        <i
                          className={`mdi ${open[r.id] ? 'mdi-chevron-down' : 'mdi-chevron-right'} me-1`}
                          aria-hidden
                        />
                      )}
                      {r.name}
                    </td>
                    <td />
                    <td style={num}>{money(r.cents)}</td>
                    <td />
                  </tr>
                  {open[r.id] &&
                    r.children?.map((c) => (
                      <tr key={c.name} style={{ fontSize: '0.8rem', color: muted }}>
                        <td style={{ paddingLeft: 56 }}>{c.name}</td>
                        <td />
                        <td style={num}>{money(c.cents)}</td>
                        <td />
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="fw-bold">
                <td>Total</td>
                <td style={num}>{money(t.committed)}</td>
                <td style={num}>{money(t.actual)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Equation footer */}
      <Card>
        <Card.Body>
          <div
            className="d-flex flex-wrap align-items-end gap-3 justify-content-center text-center"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <Fig label="Income" value={money(t.income)} />
            <Op>−</Op>
            <Fig label={done ? 'Actual spending' : 'Actual spending so far'} value={money(t.actual)} />
            <Op>=</Op>
            <Fig
              label={done ? 'Free spending · saved' : 'Free spending so far'}
              value={money(t.freeSpending)}
              color={t.freeSpending >= 0 ? success : danger}
              big
            />
          </div>
          <hr />
          <div
            className="d-flex flex-wrap gap-3 justify-content-center text-center"
            style={{ fontSize: '0.8rem', color: muted }}
          >
            <span>
              Plan: Income {money(t.income)} − Committed {money(t.committed)} ={' '}
              <strong>Unallocated {money(t.unallocated)}</strong>
            </span>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

function Fig({
  label,
  value,
  color,
  big,
}: {
  label: string
  value: string
  color?: string
  big?: boolean
}) {
  return (
    <div>
      <div style={{ color: muted, fontSize: '0.75rem' }}>{label}</div>
      <div className={big ? 'fw-bold fs-4' : 'fw-bold fs-5'} style={{ color }}>
        {value}
      </div>
    </div>
  )
}
function Op({ children }: { children: string }) {
  return (
    <div className="fs-4" style={{ color: muted, paddingBottom: 2 }}>
      {children}
    </div>
  )
}
