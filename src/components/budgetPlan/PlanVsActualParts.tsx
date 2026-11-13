/**
 * The Budget Plan's plan vs actual pieces (#241): the month summary (header,
 * headline, Income bar, legend, figures line), bucket cards with item rows,
 * and the Unplanned card. Layout from #174's resolution: variant C's bar and
 * figures line over variant B's cards. A Month without a plan (#282) has its
 * own summary card, and shows the same breakdown as Spending by category. Every figure comes from
 * `getPlanVsActual` (#240); the display rules are in `./planFormat`.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import { formatShortDate } from '@/lib/format'
import { getCategoriesWithParent } from '@/services/categories'
import type {
  PlanItem,
  PlanVsActualNoPlan,
  PlanVsActualWithPlan,
} from '@/services/planVsActual'
import type { Unplanned } from '@/services/monthAttribution'
import {
  UNPLANNED_CARD_ID,
  incomeBarSegments,
  itemBar,
  markPaidDate,
  monthLabel,
  monthProgress,
  NO_PLAN_NOTE,
  noPlanBarSegments,
  noSavedLine,
  payPromptTitle,
  planMoney,
  savedHeadline,
  stateLine,
  type IncomeSegment,
  type PlanTone,
} from './planFormat'
import { planMonthSearch, type PlanMonth } from './planMonth'

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

// ─── Month nav ───────────────────────────────────────────────────────────────

/**
 * The month name with ‹ / › beside it (#243). A disabled chevron is a
 * disabled button, so it stays in the tab order's place and says why.
 * `path` is the page the chevrons stay on; the month rides in `?month=`.
 */
export function MonthNav({
  planMonth,
  path,
  as: Heading = 'h2',
}: {
  planMonth: PlanMonth
  path: string
  as?: 'h2' | 'span'
}) {
  const { month, current, prev, next } = planMonth
  const chevron = (
    target: string | null,
    dir: 'prev' | 'next',
    disabledWhy: string
  ) => {
    const icon = dir === 'prev' ? 'mdi-chevron-left' : 'mdi-chevron-right'
    const label = dir === 'prev' ? 'Previous month' : 'Next month'
    return target === null ? (
      <button
        type="button"
        className="plan-month-nav__chevron"
        disabled
        aria-label={`${label} (${disabledWhy})`}
        data-testid={`plan-month-${dir}`}
      >
        <i className={`mdi ${icon}`} aria-hidden />
      </button>
    ) : (
      <Link
        to={`${path}${planMonthSearch(target, current)}`}
        className="plan-month-nav__chevron"
        aria-label={`${label}: ${monthLabel(target)}`}
        data-testid={`plan-month-${dir}`}
      >
        <i className={`mdi ${icon}`} aria-hidden />
      </Link>
    )
  }
  return (
    <div className="plan-month-nav">
      {chevron(prev, 'prev', 'no earlier month to show')}
      <Heading
        className="h6 fw-semibold mb-0 plan-month-nav__name"
        data-testid="plan-month"
      >
        {monthLabel(month)}
      </Heading>
      {chevron(next, 'next', 'this is the current month')}
    </div>
  )
}

// ─── Month summary ───────────────────────────────────────────────────────────

const SEGMENT_CLASS = {
  actual: 'income-bar__seg--on-plan',
  'on-plan': 'income-bar__seg--on-plan',
  unplanned: 'income-bar__seg--unplanned',
  'to-go': 'income-bar__seg--to-go',
  rest: 'income-bar__seg--rest',
  saved: 'income-bar__seg--rest',
} as const

interface MonthSummaryProps {
  plan: PlanVsActualWithPlan
  /** The month name with its chevrons. */
  nav: ReactNode
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

/**
 * The month's headline: Free spending so far while it runs; Saved, or
 * Overspent (red, as a positive figure), once it has finished (#243).
 */
function headline(plan: PlanVsActualWithPlan): {
  cents: number | null
  label: string
  over: boolean
} {
  if (plan.state === 'in-progress') {
    const free = plan.freeSpendingSoFarCents
    return {
      cents: free,
      label: 'Free spending so far',
      over: free !== null && free < 0,
    }
  }
  if (plan.savedCents === null) {
    return { cents: null, label: 'Saved', over: false }
  }
  return savedHeadline(plan.savedCents)
}

/** A finished month with no Income: its plan had no pay, and setting one now can't change it. */
function NoPayInPlan({ month }: { month: string }) {
  return (
    <div className="plan-set-pay mb-3" data-testid="plan-no-pay">
      <i className="mdi mdi-cash-off me-2" aria-hidden />
      <span>
        No pay was set when {monthLabel(month).split(' ')[0]} ended, so Saved
        can’t be worked out.
      </span>
    </div>
  )
}

/** The month's big figure and its label; red when over. */
function PlanHeadline({
  cents,
  label,
  over,
}: {
  cents: number | null
  label: string
  over: boolean
}) {
  return (
    <div className="d-flex align-items-baseline gap-2 flex-wrap mb-3">
      <span
        className={`plan-headline${over ? ' plan-over' : ''}`}
        data-testid="plan-headline"
      >
        {planMoney(cents)}
      </span>
      <span className="plan-muted" data-testid="plan-headline-label">
        {label}
      </span>
    </div>
  )
}

/** The Income bar and its legend; the unplanned segment scrolls to its card. */
function IncomeBar({
  incomeCents,
  segments,
  onShowUnplanned,
}: {
  incomeCents: number | null
  segments: IncomeSegment[]
  onShowUnplanned?: () => void
}) {
  return (
    <>
      <div
        className="income-bar"
        role="img"
        aria-label={`Income ${planMoney(incomeCents)}: ${segments
          .map((s) => `${s.label} ${planMoney(s.shownCents)}`)
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
              <span className={`plan-legend__fig${s.over ? ' plan-over' : ''}`}>
                {planMoney(s.shownCents)}
              </span>
            </>
          )
          return s.key === 'unplanned' && onShowUnplanned ? (
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
    </>
  )
}

export function MonthSummaryCard({
  plan,
  nav,
  onShowUnplanned,
  aside,
}: MonthSummaryProps) {
  const { figures } = plan
  const finished = plan.state === 'finished'
  const segments = incomeBarSegments(plan, figures.incomeCents)
  const head = headline(plan)
  const noIncome = finished ? <span>not set</span> : <SetYourPay />

  return (
    <Card className="mb-3" data-testid="plan-summary">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
          <div className="d-flex align-items-center gap-2 flex-wrap min-w-0">
            {nav}
            <span className="plan-muted small" data-testid="plan-progress">
              {monthProgress(plan)}
            </span>
          </div>
          <div className="flex-shrink-0">{aside}</div>
        </div>

        {segments === null ? (
          finished ? (
            <NoPayInPlan month={plan.month} />
          ) : (
            <div className="plan-set-pay mb-3" data-testid="plan-set-pay">
              <i className="mdi mdi-cash me-2" aria-hidden />
              <span>
                <SetYourPay /> to see Free spending so far and where your Income
                goes this month.
              </span>
            </div>
          )
        ) : (
          <>
            <PlanHeadline {...head} />

            <IncomeBar
              incomeCents={figures.incomeCents}
              segments={segments}
              onShowUnplanned={onShowUnplanned}
            />
            {plan.state === 'in-progress' &&
              plan.bar.stillToGoOutCents === null && (
                <div className="plan-muted small mt-2">
                  A tracker’s budget can’t be worked out for this month, so
                  Still to go out and If the rest goes to plan aren’t shown.
                </div>
              )}
          </>
        )}

        <hr className="my-3" />
        <div className="plan-figures" data-testid="plan-figures">
          <span>
            Income{' '}
            {figures.incomeCents === null ? (
              noIncome
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
              noIncome
            ) : (
              <strong>{planMoney(figures.unallocatedCents)}</strong>
            )}
          </span>
          <span>
            {finished ? 'Actual' : 'Actual so far'}{' '}
            <strong>{planMoney(figures.actualCents)}</strong>
          </span>
        </div>
      </Card.Body>
    </Card>
  )
}

// ─── Month without a plan ────────────────────────────────────────────────────

interface NoPlanSummaryProps {
  plan: PlanVsActualNoPlan
  /** The month name with its chevrons. */
  nav: ReactNode
  /** Help popover beside the month. */
  aside?: ReactNode
}

/**
 * A Month without a plan's summary (#282): Saved or Overspent, or the reason
 * there isn't one (the pay prompt when no pay is confirmed); the bar,
 * Actual spending · Saved, only with a Saved; Income · Actual; and a note
 * that the month has no plan.
 */
export function NoPlanSummaryCard({ plan, nav, aside }: NoPlanSummaryProps) {
  const { figures } = plan
  const segments = noPlanBarSegments(
    figures.incomeCents,
    figures.actualCents,
    plan.savedCents
  )
  const reason =
    plan.noSavedReason === null
      ? null
      : noSavedLine(plan.noSavedReason, plan.openingDate)

  return (
    <Card className="mb-3" data-testid="plan-summary">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
          <div className="d-flex align-items-center gap-2 flex-wrap min-w-0">
            {nav}
            <span className="plan-muted small" data-testid="plan-progress">
              Month finished
            </span>
          </div>
          <div className="flex-shrink-0">{aside}</div>
        </div>

        {plan.savedCents !== null && segments !== null ? (
          <>
            <PlanHeadline {...savedHeadline(plan.savedCents)} />
            <IncomeBar incomeCents={figures.incomeCents} segments={segments} />
          </>
        ) : reason !== null ? (
          <div className="plan-set-pay mb-3" data-testid="plan-no-saved">
            <i className="mdi mdi-information-outline me-2" aria-hidden />
            <span>{reason}</span>
          </div>
        ) : (
          <div className="plan-set-pay mb-3" data-testid="plan-pay-prompt">
            <i className="mdi mdi-cash me-2" aria-hidden />
            <span>{payPromptTitle(plan.firstPlannableMonth)}</span>
          </div>
        )}

        <hr className="my-3" />
        <div className="plan-figures" data-testid="plan-figures">
          <span>
            Income{' '}
            {figures.incomeCents === null ? (
              <span>not confirmed</span>
            ) : (
              <strong>{planMoney(figures.incomeCents)}</strong>
            )}
          </span>
          <span>
            Actual{' '}
            <strong data-testid="plan-actual">
              {planMoney(figures.actualCents)}
            </strong>
          </span>
        </div>
        <div className="plan-muted small mt-2" data-testid="plan-no-plan-note">
          {NO_PLAN_NOTE}
        </div>
      </Card.Body>
    </Card>
  )
}

// ─── Items and bucket cards ──────────────────────────────────────────────────

/** Marks one Regular occurrence paid (the bucket page offers it; the grid doesn't). */
export type MarkPaidHandler = (
  regularId: number,
  date: string,
  name: string
) => void

export function PlanItemRow({
  item,
  color,
  onMarkPaid,
}: {
  item: PlanItem
  color: string
  onMarkPaid?: MarkPaidHandler
}) {
  const line = stateLine(item)
  const pace = item.type === 'tracker' ? item.paceCents : null
  const markDate = onMarkPaid ? markPaidDate(item) : null
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
        {markDate && item.type === 'regular' && (
          <>
            {' · '}
            <button
              type="button"
              className="plan-mark-paid"
              aria-label={`Mark ${item.name} paid for ${formatShortDate(markDate)}`}
              onClick={() => onMarkPaid!(item.regularId, markDate, item.name)}
            >
              Mark paid
            </button>
          </>
        )}
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
  /** Offers Mark paid on overdue and no-actual-figure Regulars. */
  onMarkPaid?: MarkPaidHandler
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
  onMarkPaid,
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
                onMarkPaid={onMarkPaid}
              />
            ))}
        {footer}
      </Card.Body>
    </Card>
  )
}

// ─── Unplanned ───────────────────────────────────────────────────────────────

/** What the breakdown card is showing: a plan's Unplanned, or a Month without a plan's spending. */
type BreakdownKind = 'unplanned' | 'by-category'

const BREAKDOWN = {
  unplanned: {
    title: 'Unplanned',
    caption: 'Spending that matched no Regular or Tracker.',
    empty: 'Nothing unplanned this month.',
    icon: 'mdi-help-circle-outline',
    testId: 'plan-unplanned',
  },
  'by-category': {
    title: 'Spending by category',
    caption: 'Every dollar of Actual spending, by Up category.',
    empty: 'No spending this month.',
    icon: 'mdi-shape-outline',
    testId: 'plan-spending-by-category',
  },
} as const

/**
 * Spending by Up parent category, subcategory and Uncategorised, folding
 * open per parent. On a plan month it's Unplanned; on a Month without a plan
 * (#282) it's every counted transaction, titled Spending by category, and the
 * word Unplanned never appears.
 */
export function UnplannedCard({
  unplanned,
  kind = 'unplanned',
}: {
  unplanned: Unplanned
  kind?: BreakdownKind
}) {
  const copy = BREAKDOWN[kind]
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
      className="plan-card plan-card--unplanned"
      data-testid={copy.testId}
    >
      <Card.Body className="py-3">
        <div className="d-flex align-items-center gap-2 mb-1">
          <span
            className="plan-card__icon plan-card__icon--unplanned"
            aria-hidden
          >
            <i className={`mdi ${copy.icon}`} />
          </span>
          <h3 className="h6 fw-semibold flex-grow-1 mb-0">{copy.title}</h3>
          <span
            className="plan-card__total"
            data-testid={`${copy.testId}-total`}
          >
            {planMoney(unplanned.totalCents)}
          </span>
        </div>
        <div className="plan-muted small mb-2">{copy.caption}</div>
        {empty ? (
          <div className="plan-muted small">{copy.empty}</div>
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
