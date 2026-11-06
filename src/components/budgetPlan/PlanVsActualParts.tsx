/**
 * The Budget Plan's plan vs actual pieces (#241): the month summary (header,
 * headline, Income bar, legend, figures line), bucket cards with item rows,
 * and the Unplanned card. Layout from #174's resolution: variant C's bar and
 * figures line over variant B's cards. Every figure comes from
 * `getPlanVsActual` (#240); the display rules are in `./planFormat`.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import { getCategoriesWithParent } from '@/services/categories'
import type { PlanItem, PlanVsActual } from '@/services/planVsActual'
import type { Unplanned } from '@/services/monthAttribution'
import {
  UNPLANNED_CARD_ID,
  incomeBarSegments,
  itemBar,
  monthLabel,
  planMoney,
  stateLine,
  type PlanTone,
} from './planFormat'

const toneClass: Record<PlanTone, string> = {
  muted: 'plan-muted',
  over: 'plan-over',
  warn: 'plan-warn',
}

// ─── Bars ────────────────────────────────────────────────────────────────────

interface PlanBarProps {
  plannedCents: number | null
  actualCents: number | null
  paceCents?: number | null
  /** The bucket's colour, used for the fill only when over. */
  color: string
  label: string
}

/** Actual vs planned: grey fill, coloured with a red extension when over, and a pace tick. */
export function PlanBar({
  plannedCents,
  actualCents,
  paceCents = null,
  color,
  label,
}: PlanBarProps) {
  const bar = itemBar(plannedCents, actualCents, paceCents)
  if (!bar) return null
  const over = bar.overPct > 0
  return (
    <div
      className="plan-bar"
      role="img"
      aria-label={label}
      style={{ ['--plan-tone' as string]: color }}
    >
      <div
        className={`plan-bar__fill${over ? ' plan-bar__fill--over' : ''}`}
        style={{ width: `${bar.fillPct}%` }}
      />
      {over && (
        <div
          className="plan-bar__over"
          style={{ left: `${bar.plannedPct}%`, width: `${bar.overPct}%` }}
        />
      )}
      {bar.pacePct !== null && (
        <div
          className="plan-bar__pace"
          style={{ left: `${bar.pacePct}%` }}
          title="Where spending would be today if spread evenly"
        />
      )}
    </div>
  )
}

function barLabel(
  name: string,
  actual: number | null,
  planned: number | null,
  pace: number | null = null
): string {
  const base = `${name}: ${planMoney(actual)} of ${planMoney(planned)} planned`
  return pace === null ? base : `${base}, pace ${planMoney(pace)} by today`
}

// ─── Month summary ───────────────────────────────────────────────────────────

const SEGMENT_CLASS = {
  'on-plan': 'income-bar__seg--on-plan',
  unplanned: 'income-bar__seg--unplanned',
  'to-go': 'income-bar__seg--to-go',
  rest: 'income-bar__seg--rest',
} as const

interface MonthSummaryProps {
  plan: PlanVsActual
  /** Scrolls to the Unplanned card. */
  onShowUnplanned: () => void
  /** Help popover and actions beside the month. */
  aside?: ReactNode
}

function SetYourPay() {
  return (
    <Link to="/settings" className="plan-link">
      Set your pay
    </Link>
  )
}

export function MonthSummaryCard({
  plan,
  onShowUnplanned,
  aside,
}: MonthSummaryProps) {
  const { figures, bar } = plan
  const segments = incomeBarSegments(bar, figures.incomeCents)
  const free = plan.freeSpendingSoFarCents

  return (
    <Card className="mb-3" data-testid="plan-summary">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <div className="d-flex align-items-baseline gap-2 flex-wrap">
            <h2 className="h6 fw-semibold mb-0">{monthLabel(plan.month)}</h2>
            <span className="plan-muted small">
              Day {plan.dayOfMonth} of {plan.daysInMonth}
            </span>
          </div>
          {aside}
        </div>

        {segments === null ? (
          <div className="plan-set-pay mb-3" data-testid="plan-set-pay">
            <i className="mdi mdi-cash me-2" aria-hidden />
            <span>
              <SetYourPay /> to see Free spending so far and where your Income
              goes this month.
            </span>
          </div>
        ) : (
          <>
            <div className="d-flex align-items-baseline gap-2 flex-wrap mb-3">
              <span
                className={`plan-headline${free !== null && free < 0 ? ' plan-over' : ''}`}
                data-testid="plan-headline"
              >
                {planMoney(free)}
              </span>
              <span className="plan-muted">Free spending so far</span>
            </div>

            <div
              className="income-bar"
              role="img"
              aria-label={`Income ${planMoney(figures.incomeCents)}: ${segments
                .map((s) => `${s.label} ${planMoney(s.cents)}`)
                .join(', ')}`}
              data-testid="income-bar"
            >
              {segments.map((s) => (
                <div
                  key={s.key}
                  className={`income-bar__seg ${SEGMENT_CLASS[s.key]}`}
                  style={{ flexBasis: `${s.widthPct}%` }}
                  data-segment={s.key}
                  onClick={s.key === 'unplanned' ? onShowUnplanned : undefined}
                  aria-hidden
                />
              ))}
            </div>
            <div className="plan-legend">
              {segments.map((s) => {
                const content = (
                  <>
                    <span
                      className={`plan-legend__swatch ${SEGMENT_CLASS[s.key]}`}
                      aria-hidden
                    />
                    <span className="plan-legend__name">{s.label}</span>
                    <span
                      className={`plan-legend__fig${s.over ? ' plan-over' : ''}`}
                    >
                      {planMoney(s.cents)}
                    </span>
                  </>
                )
                return s.key === 'unplanned' ? (
                  <button
                    key={s.key}
                    type="button"
                    className="plan-legend__item plan-legend__item--button"
                    onClick={onShowUnplanned}
                  >
                    {content}
                  </button>
                ) : (
                  <span key={s.key} className="plan-legend__item">
                    {content}
                  </span>
                )
              })}
            </div>
            {bar.stillToGoOutCents === null && (
              <div className="plan-muted small mt-2">
                A tracker’s budget can’t be worked out for this month, so Still
                to go out and If the rest goes to plan aren’t shown.
              </div>
            )}
          </>
        )}

        <hr className="my-3" />
        <div className="plan-figures" data-testid="plan-figures">
          <span>
            Income{' '}
            {figures.incomeCents === null ? (
              <SetYourPay />
            ) : (
              <strong>{planMoney(figures.incomeCents)}</strong>
            )}
          </span>
          <span>
            Committed <strong>{planMoney(figures.committedCents)}</strong>
          </span>
          <span>
            Unallocated{' '}
            {figures.unallocatedCents === null ? (
              <SetYourPay />
            ) : (
              <strong>{planMoney(figures.unallocatedCents)}</strong>
            )}
          </span>
          <span>
            Actual so far <strong>{planMoney(figures.actualCents)}</strong>
          </span>
        </div>
      </Card.Body>
    </Card>
  )
}

// ─── Items and bucket cards ──────────────────────────────────────────────────

export function PlanItemRow({
  item,
  color,
}: {
  item: PlanItem
  color: string
}) {
  const line = stateLine(item)
  const pace = item.type === 'tracker' ? item.paceCents : null
  return (
    <div className="plan-item" data-testid="plan-item">
      <div className="plan-item__head">
        <span className="plan-item__name">
          <i
            className={`mdi ${item.type === 'regular' ? 'mdi-calendar-sync-outline' : 'mdi-target'} plan-muted me-1`}
            title={item.type === 'regular' ? 'Regular' : 'Tracker'}
            aria-hidden
          />
          {item.name}
        </span>
        <span className="plan-item__fig">
          {planMoney(item.actualCents)}
          <span className="plan-muted"> / {planMoney(item.plannedCents)}</span>
        </span>
      </div>
      <PlanBar
        plannedCents={item.plannedCents}
        actualCents={item.actualCents}
        paceCents={pace}
        color={color}
        label={barLabel(item.name, item.actualCents, item.plannedCents, pace)}
      />
      <div className={`plan-item__state ${toneClass[line.tone]}`}>
        {line.icon && <i className={`mdi ${line.icon} me-1`} aria-hidden />}
        {line.text}
      </div>
    </div>
  )
}

interface BucketPlanCardProps {
  title: ReactNode
  /** Plain name for the bar's accessible label. */
  name: string
  icon: string
  color: string
  plannedCents: number
  actualCents: number
  items: PlanItem[]
  dashed?: boolean
  caption?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  empty?: ReactNode
  testId?: string
}

export function BucketPlanCard({
  title,
  name,
  icon,
  color,
  plannedCents,
  actualCents,
  items,
  dashed,
  caption,
  actions,
  footer,
  empty,
  testId,
}: BucketPlanCardProps) {
  return (
    <Card
      className={`h-100 plan-card${dashed ? ' plan-card--dashed' : ''}`}
      style={{ borderLeftColor: color }}
      data-testid={testId}
    >
      <Card.Body className="py-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <span
            className="plan-card__icon"
            style={{ backgroundColor: `${color}22`, color }}
            aria-hidden
          >
            <i className={`mdi ${icon}`} />
          </span>
          <div className="fw-semibold flex-grow-1 min-w-0 text-truncate">
            {title}
          </div>
          <span className="plan-card__total">
            {planMoney(actualCents)}
            <span className="plan-muted fw-normal">
              {' '}
              / {planMoney(plannedCents)}
            </span>
          </span>
          {actions}
        </div>
        {caption && <div className="plan-muted small mb-2">{caption}</div>}
        <div className="mb-3">
          <PlanBar
            plannedCents={plannedCents}
            actualCents={actualCents}
            color={color}
            label={barLabel(name, actualCents, plannedCents)}
          />
        </div>
        {items.length === 0
          ? empty
          : items.map((i) => (
              <PlanItemRow
                key={`${i.type}-${i.type === 'regular' ? i.regularId : i.trackerId}`}
                item={i}
                color={color}
              />
            ))}
        {footer}
      </Card.Body>
    </Card>
  )
}

// ─── Unplanned ───────────────────────────────────────────────────────────────

export function UnplannedCard({ unplanned }: { unplanned: Unplanned }) {
  const names = useMemo(
    () => new Map(getCategoriesWithParent().map((c) => [c.id, c.name])),
    []
  )
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const empty =
    unplanned.parents.length === 0 && unplanned.uncategorisedCents === 0

  return (
    <Card
      id={UNPLANNED_CARD_ID}
      tabIndex={-1}
      className="h-100 plan-card plan-card--unplanned"
      data-testid="plan-unplanned"
    >
      <Card.Body className="py-3">
        <div className="d-flex align-items-center gap-2 mb-1">
          <span
            className="plan-card__icon plan-card__icon--unplanned"
            aria-hidden
          >
            <i className="mdi mdi-help-circle-outline" />
          </span>
          <h3 className="h6 fw-semibold flex-grow-1 mb-0">Unplanned</h3>
          <span className="plan-card__total">
            {planMoney(unplanned.totalCents)}
          </span>
        </div>
        <div className="plan-muted small mb-2">
          Spending that matched no Regular or Tracker.
        </div>
        {empty ? (
          <div className="plan-muted small">Nothing unplanned this month.</div>
        ) : (
          <ul className="plan-unplanned">
            {unplanned.parents.map((p) => {
              const name = names.get(p.parentCategoryId) ?? p.parentCategoryId
              const expandable = p.subcategories.length > 0
              const isOpen = open.has(p.parentCategoryId)
              return (
                <li key={p.parentCategoryId}>
                  <div className="plan-unplanned__row">
                    {expandable ? (
                      <button
                        type="button"
                        className="plan-unplanned__toggle"
                        aria-expanded={isOpen}
                        onClick={() => toggle(p.parentCategoryId)}
                      >
                        <i
                          className={`mdi mdi-chevron-right plan-unplanned__chevron${isOpen ? ' is-open' : ''}`}
                          aria-hidden
                        />
                        {name}
                      </button>
                    ) : (
                      <span className="plan-unplanned__name">{name}</span>
                    )}
                    <span className="plan-item__fig">
                      {planMoney(p.totalCents)}
                    </span>
                  </div>
                  {expandable && isOpen && (
                    <ul className="plan-unplanned__subs">
                      {p.subcategories.map((s) => (
                        <li key={s.categoryId} className="plan-unplanned__row">
                          <span className="plan-unplanned__name">
                            {names.get(s.categoryId) ?? s.categoryId}
                          </span>
                          <span className="plan-item__fig">
                            {planMoney(s.totalCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
            {unplanned.uncategorisedCents !== 0 && (
              <li className="plan-unplanned__row">
                <span className="plan-unplanned__name">Uncategorised</span>
                <span className="plan-item__fig">
                  {planMoney(unplanned.uncategorisedCents)}
                </span>
              </li>
            )}
          </ul>
        )}
      </Card.Body>
    </Card>
  )
}
