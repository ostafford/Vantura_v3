// PROTOTYPE — throwaway. Wayfinder ticket #183: the Regulars page that takes
// over the Dashboard's Upcoming section. Fixture data only (today = Wed 4 Nov
// 2026, same as the #181 Dashboard prototype). ?once=done|hidden toggles where
// a paid ONCE Regular goes. No persistence: Mark paid / Delete live in memory.
import { useMemo, useState } from 'react'
import { Button, Card, Modal } from 'react-bootstrap'
import { useSearchParams } from 'react-router-dom'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { money } from '@/pages/dashboardPrototype/fixture'
import { danger, muted } from '@/pages/dashboardPrototype/bits'

const TODAY = 4 // 4 Nov 2026
const MONTH_END = 30

interface Occ {
  /** day offset from 1 Nov 2026 (negative = earlier, >30 = later months) */
  day: number
  paid: boolean
  how?: 'linked' | 'manual'
}
interface Reg {
  name: string
  freq: string
  category: string
  bucket: string | null
  cents: number
  occ: Occ[]
}

const fmt = (d: number) => {
  if (d <= 30) return `${d} Nov`
  if (d <= 61) return `${d - 30} Dec`
  return d === 163 ? '14 Mar 2027' : `day ${d}`
}

const START: Reg[] = [
  {
    name: 'Phone',
    freq: 'Monthly',
    category: 'Mobile phone',
    bucket: 'Bills',
    cents: 4_500,
    occ: [
      { day: 2, paid: false },
      { day: 32, paid: false },
    ],
  },
  {
    name: 'Internet',
    freq: 'Monthly',
    category: 'Internet',
    bucket: 'Bills',
    cents: 7_499,
    occ: [
      { day: 1, paid: true, how: 'linked' },
      { day: 31, paid: false },
    ],
  },
  {
    name: 'Streaming',
    freq: 'Monthly',
    category: 'TV & music',
    bucket: 'Subscriptions',
    cents: 1_899,
    occ: [
      { day: 5, paid: false },
      { day: 35, paid: false },
    ],
  },
  {
    name: 'Insurance',
    freq: 'Monthly',
    category: 'Insurance',
    bucket: 'Bills',
    cents: 8_740,
    occ: [
      { day: 6, paid: false },
      { day: 36, paid: false },
    ],
  },
  {
    name: 'Rent',
    freq: 'Monthly',
    category: 'Rent & mortgage',
    bucket: 'Home',
    cents: 120_000,
    occ: [
      { day: 15, paid: false },
      { day: 45, paid: false },
    ],
  },
  {
    name: 'Dentist',
    freq: 'Once',
    category: 'Health & medical',
    bucket: null,
    cents: 18_000,
    occ: [{ day: 18, paid: false }],
  },
  {
    name: 'Gym',
    freq: 'Monthly',
    category: 'Fitness',
    bucket: 'Subscriptions',
    cents: 2_990,
    occ: [
      { day: 22, paid: false },
      { day: 52, paid: false },
    ],
  },
  {
    name: 'Concert tickets',
    freq: 'Once',
    category: 'Events & gigs',
    bucket: null,
    cents: 24_500,
    occ: [{ day: 3, paid: true, how: 'linked' }],
  },
  {
    name: 'Car rego',
    freq: 'Yearly',
    category: 'Car',
    bucket: 'Car',
    cents: 86_000,
    occ: [{ day: 163, paid: false }],
  },
]

type Group = 'overdue' | 'month' | 'later' | 'done'

/** Q6 rule: placed by the earliest unpaid occurrence. */
function place(r: Reg): { group: Group; next: Occ | null } {
  const next = r.occ.find((o) => !o.paid) ?? null
  if (!next) return { group: 'done', next: null }
  if (next.day < TODAY && next.day >= 1) return { group: 'overdue', next }
  if (next.day <= MONTH_END) return { group: 'month', next }
  return { group: 'later', next }
}

export function RegularsPrototype() {
  const [params] = useSearchParams()
  const onceMode = params.get('once') ?? 'done'
  const [regs, setRegs] = useState(START)
  const [editing, setEditing] = useState<string | null>(params.get('edit'))

  const grouped = useMemo(() => {
    const g: Record<Group, { r: Reg; next: Occ | null }[]> = {
      overdue: [],
      month: [],
      later: [],
      done: [],
    }
    for (const r of regs) {
      const p = place(r)
      g[p.group].push({ r, next: p.next })
    }
    for (const k of ['overdue', 'month', 'later'] as const)
      g[k].sort((a, b) => a.next!.day - b.next!.day)
    return g
  }, [regs])

  function markPaid(name: string) {
    setRegs((rs) =>
      rs.map((r) => {
        if (r.name !== name) return r
        const i = r.occ.findIndex((o) => !o.paid)
        return {
          ...r,
          occ: r.occ.map((o, j) =>
            j === i ? { ...o, paid: true, how: 'manual' as const } : o
          ),
        }
      })
    )
  }

  const editReg = regs.find((r) => r.name === editing)

  function Row({ r, next }: { r: Reg; next: Occ | null }) {
    const overdue = next && next.day < TODAY
    const paidThisMonth = r.occ.filter(
      (o) => o.paid && o.day >= 1 && o.day <= MONTH_END
    )
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditing(r.name)}
        className="d-flex justify-content-between align-items-center py-2 px-1 gap-2 border-bottom"
        style={{ cursor: 'pointer' }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            className="d-flex align-items-center flex-wrap"
            style={{ columnGap: '0.5rem', rowGap: '0.15rem' }}
          >
            <span className="fw-semibold">{r.name}</span>
            {next ? (
              <span
                className="px-2 rounded-pill"
                onClick={(e) => {
                  if (overdue) {
                    e.stopPropagation()
                    markPaid(r.name)
                  }
                }}
                style={{
                  whiteSpace: 'nowrap',
                  lineHeight: 1.6,
                  fontSize: '0.7rem',
                  background: overdue
                    ? 'color-mix(in srgb, var(--vantura-danger) 18%, transparent)'
                    : 'var(--bs-tertiary-bg)',
                  color: overdue ? danger : muted,
                  cursor: overdue ? 'pointer' : undefined,
                }}
              >
                {overdue
                  ? `${fmt(next.day)} · overdue · Mark paid`
                  : fmt(next.day)}
              </span>
            ) : (
              <span
                className="px-2 rounded-pill"
                style={{
                  lineHeight: 1.6,
                  fontSize: '0.7rem',
                  background: 'var(--bs-tertiary-bg)',
                  color: muted,
                }}
              >
                Paid {fmt(r.occ[0].day)}
              </span>
            )}
          </div>
          <div className="small" style={{ color: muted }}>
            {r.freq} · {r.category} · {r.bucket ?? 'Not in a bucket'}
            {next && paidThisMonth.length > 0 && (
              <>
                {' '}
                · <i className="mdi mdi-check" aria-hidden /> paid{' '}
                {paidThisMonth.map((o) => fmt(o.day)).join(', ')} (
                {paidThisMonth[0].how === 'linked'
                  ? 'Linked payment'
                  : 'marked paid'}
                )
              </>
            )}
          </div>
        </div>
        <span className="flex-shrink-0">{money(r.cents)}</span>
      </div>
    )
  }

  function GroupCard({
    title,
    hint,
    items,
    tone,
  }: {
    title: string
    hint: string
    items: { r: Reg; next: Occ | null }[]
    tone?: string
  }) {
    if (items.length === 0) return null
    return (
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-baseline gap-2 mb-1">
            <strong style={{ color: tone }}>{title}</strong>
            <span className="small" style={{ color: muted }}>
              {hint}
            </span>
          </div>
          {items.map((x) => (
            <Row key={x.r.name} r={x.r} next={x.next} />
          ))}
        </Card.Body>
      </Card>
    )
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        className="mb-3 px-2 py-1 small"
        style={{
          border: '1px dashed var(--bs-warning)',
          borderRadius: 6,
          color: muted,
        }}
      >
        PROTOTYPE (#183) · fixture data · today is Wed 4 Nov 2026 · Mark paid
        and Delete are in-memory only
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <div className="small" style={{ color: muted, maxWidth: 520 }}>
          Bills and subscriptions you know are coming. Each Regular is listed
          once, by its next unpaid payment.
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm">
            <i className="mdi mdi-magnify" aria-hidden /> Find recurring charges
          </Button>
          <Button variant="primary" size="sm">
            <i className="mdi mdi-plus" aria-hidden /> Add Regular
          </Button>
        </div>
      </div>

      <GroupCard
        title="Overdue"
        hint="due earlier this month, no payment found"
        items={grouped.overdue}
        tone={danger}
      />
      <GroupCard
        title="This month"
        hint={`from today to ${MONTH_END} Nov`}
        items={grouped.month}
      />
      <GroupCard
        title="Later"
        hint="next payment after this month"
        items={grouped.later}
      />
      {onceMode === 'done' && (
        <GroupCard
          title="Paid one-offs"
          hint="Once Regulars already paid; kept for that month's plan"
          items={grouped.done}
        />
      )}

      <Modal show={!!editReg} onHide={() => setEditing(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit “{editReg?.name}”</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div
            className="p-3 text-center small"
            style={{
              border: '1px dashed var(--bs-border-color)',
              borderRadius: 8,
              color: muted,
            }}
          >
            The existing Regular editor, moved here unchanged
            <span className="d-block" style={{ fontSize: '0.75rem' }}>
              name · amount · frequency · date · category · bucket · linked
              payments
            </span>
          </div>
          <div className="small mt-2" style={{ color: muted }}>
            Wasn’t paid and won’t be? Delete it. Moved to another day? Change
            its date.
          </div>
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button
            variant="outline-danger"
            onClick={() => {
              setRegs((rs) => rs.filter((r) => r.name !== editing))
              setEditing(null)
            }}
          >
            Delete
          </Button>
          <Button variant="primary" onClick={() => setEditing(null)}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      <PrototypeSwitcher
        variants={[{ key: 'R', name: 'Regulars page' }]}
        toggles={[
          {
            param: 'once',
            options: [
              { value: 'done', label: 'Paid one-offs: shown' },
              { value: 'hidden', label: 'Paid one-offs: hidden' },
            ],
          },
        ]}
      />
    </div>
  )
}
