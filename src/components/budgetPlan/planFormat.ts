/**
 * Presentation rules for the Budget Plan's plan vs actual view (#241), kept
 * pure so they can be tested without rendering. The figures themselves come
 * from `getPlanVsActual` (#240); nothing here computes money, it only decides
 * how each figure is shown.
 *
 * Colour is for **over** only (#174): an over item, Overspent, and a negative
 * *If the rest goes to plan*. An overdue Regular, and a finished month's
 * *no payment found*, get the warning tone, as in the #174 prototype.
 * Everything else reads muted.
 */

import { formatSignedMoney } from '@/lib/format'
import type {
  NoSavedReason,
  PlanItem,
  PlanVsActualFinished,
  PlanVsActualInProgress,
} from '@/services/planVsActual'

/** The Unplanned card's element id, the target of the bar's unplanned segment. */
export const UNPLANNED_CARD_ID = 'budget-unplanned'

/**
 * "November 2026" for `2026-11`, in the device's locale (`locale` is for
 * tests).
 */
export function monthLabel(month: string, locale?: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * "14 March" for `2026-03-14`, in the device's locale. Built from the
 * calendar date's parts, so the day never shifts with the time zone.
 */
function dayMonthLabel(day: string, locale?: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  })
}

/** The note on a Month without a plan (#282). */
export const NO_PLAN_NOTE =
  'No plan for this month · Saved uses the pay you confirmed'

/**
 * The line shown in place of Saved on a Month without a plan (#282), or
 * `null` for Pay not confirmed, which shows the pay prompt instead.
 * `openingDate` is the Spending account's opening day, `YYYY-MM-DD`.
 */
export function noSavedLine(
  reason: NoSavedReason,
  openingDate: string,
  locale?: string
): string | null {
  switch (reason) {
    case 'part-month':
      return `Your account opened on ${dayMonthLabel(openingDate, locale)} · Saved isn’t worked out for a part month`
    case 'closed-saver':
      return 'This month used a Saver that’s since closed. Its spending can’t be seen, so Saved isn’t worked out'
    case 'pay-not-confirmed':
      return null
  }
}

/** The pay prompt's title (#282), naming the First plannable month. */
export function payPromptTitle(
  firstPlannableMonth: string,
  locale?: string
): string {
  return `Confirm your pay for months before ${monthLabel(firstPlannableMonth, locale)} to see Saved`
}

/** "Day N of M" while the month runs, or "Month finished" (#243). */
export function monthProgress(
  plan:
    | Pick<PlanVsActualInProgress, 'state' | 'dayOfMonth' | 'daysInMonth'>
    | Pick<PlanVsActualFinished, 'state'>
): string {
  return plan.state === 'finished'
    ? 'Month finished'
    : `Day ${plan.dayOfMonth} of ${plan.daysInMonth}`
}

export type PlanTone = 'muted' | 'over' | 'warn'

export interface StateLine {
  text: string
  tone: PlanTone
  /** An mdi icon for a Regular's status chip; none for an amount line. */
  icon?: string
}

/** `$12.34`, `−$12.34`, or `—` for a figure Vantura can't give. */
export function planMoney(cents: number | null): string {
  return cents === null ? '—' : formatSignedMoney(cents)
}

/** The line under an item: Tracker *left* / *over*, or a Regular's chip / *under* / *over*. */
export function stateLine(item: PlanItem): StateLine {
  const { state } = item
  switch (state.kind) {
    case 'left':
      return { text: `${planMoney(state.cents)} left`, tone: 'muted' }
    case 'over':
      return { text: `${planMoney(state.cents)} over`, tone: 'over' }
    case 'under':
      return state.cents === 0
        ? { text: 'on plan', tone: 'muted' }
        : { text: `${planMoney(state.cents)} under`, tone: 'muted' }
    case 'no-planned-figure':
      return { text: 'no planned figure', tone: 'muted' }
    case 'not-paid-yet':
      return { text: 'not paid yet', tone: 'muted', icon: 'mdi-clock-outline' }
    case 'overdue':
      return { text: 'overdue', tone: 'warn', icon: 'mdi-alert-outline' }
    case 'no-actual-figure':
      return {
        text: 'no actual figure',
        tone: 'muted',
        icon: 'mdi-link-variant-off',
      }
    case 'paid':
      return { text: 'paid', tone: 'muted', icon: 'mdi-check' }
    case 'not-due':
      return { text: 'not due this month', tone: 'muted' }
    case 'no-payment-found':
      return {
        text: 'No payment found',
        tone: 'warn',
        icon: 'mdi-alert-outline',
      }
  }
}

/**
 * The occurrence Mark paid would mark, or `null` when Mark paid isn't offered:
 * a Regular that is overdue (#212 offers it there), has no actual figure
 * (#174: Vantura can't see it paid), or, in a finished month, has no payment
 * found (#243), at its oldest unpaid occurrence.
 */
export function markPaidDate(item: PlanItem): string | null {
  if (item.type !== 'regular') return null
  const { kind } = item.state
  if (
    kind !== 'overdue' &&
    kind !== 'no-actual-figure' &&
    kind !== 'no-payment-found'
  ) {
    return null
  }
  return item.unpaidDates[0] ?? null
}

/** The headline for a finished month: Saved, or Overspent (as a positive figure) when negative. */
export function savedHeadline(savedCents: number): {
  label: 'Saved' | 'Overspent'
  cents: number
  over: boolean
} {
  return savedCents < 0
    ? { label: 'Overspent', cents: -savedCents, over: true }
    : { label: 'Saved', cents: savedCents, over: false }
}

/** True when an item's actual is above its planned. */
export function isOver(item: PlanItem): boolean {
  return item.state.kind === 'over'
}

export interface ItemBar {
  /** Grey (or coloured when over) fill up to `min(actual, planned)`, 0–100. */
  fillPct: number
  /** The red extension past the planned end, 0–100. */
  overPct: number
  /** Where the planned end sits, 0–100. */
  plannedPct: number
  /** The pace tick, 0–100, or `null` when there is none. */
  pacePct: number | null
}

/**
 * An item's (or a bucket's) actual-vs-planned bar. The track spans
 * `max(planned, actual)`, so an over item's red extension runs past the
 * planned end. A negative actual (net refunds) draws no fill. `null` when
 * there is nothing to draw: no planned figure, or no actual figure.
 */
export function itemBar(
  planned: number | null,
  actual: number | null,
  pace: number | null = null
): ItemBar | null {
  if (planned === null || actual === null) return null
  const spent = Math.max(0, actual)
  const span = Math.max(planned, spent)
  if (span <= 0) {
    return { fillPct: 0, overPct: 0, plannedPct: 0, pacePct: null }
  }
  const pct = (cents: number) => (cents / span) * 100
  return {
    fillPct: pct(Math.min(spent, planned)),
    overPct: pct(Math.max(0, spent - planned)),
    plannedPct: pct(planned),
    pacePct: pace === null || planned <= 0 ? null : pct(pace),
  }
}

export type IncomeSegmentKey =
  | 'on-plan'
  | 'unplanned'
  | 'to-go'
  | 'rest'
  | 'saved'

export interface IncomeSegment {
  key: IncomeSegmentKey
  label: string
  /** The segment's figure, signed (sets its width); `null` when the read declines it. */
  cents: number | null
  /** The legend figure: `cents`, except Overspent, shown as a positive figure. */
  shownCents: number | null
  /** Share of the bar, 0–100. Never negative; together never past 100. */
  widthPct: number
  /** True when the legend figure shows in the over colour. */
  over: boolean
}

/**
 * The Income bar, **capped at Income** (#241): segments fill Income in order,
 * each taking at most what's left of it. A negative segment gets no width but
 * keeps its legend figure. When spending passes Income the bar is full, and
 * the last segment's negative figure shows the shortfall in the over colour.
 *
 * - In progress: Spent on plan · Spent unplanned · Still to go out · If the
 *   rest goes to plan.
 * - Finished (#243): Spent on plan · Spent unplanned · Saved. Saved's legend
 *   reads Overspent, as a positive figure, when it's negative.
 *
 * `null` when Income isn't set (the page shows a prompt instead).
 */
export function incomeBarSegments(
  plan:
    | Pick<PlanVsActualInProgress, 'state' | 'bar'>
    | Pick<PlanVsActualFinished, 'state' | 'bar'>,
  incomeCents: number | null
): IncomeSegment[] | null {
  if (incomeCents === null || incomeCents <= 0) return null
  const spent: Omit<IncomeSegment, 'widthPct' | 'shownCents'>[] = [
    {
      key: 'on-plan',
      label: 'Spent on plan',
      cents: plan.bar.spentOnPlanCents,
      over: false,
    },
    {
      key: 'unplanned',
      label: 'Spent unplanned',
      cents: plan.bar.spentUnplannedCents,
      over: false,
    },
  ]
  if (plan.state === 'finished') {
    const saved = plan.bar.savedCents
    const headline = saved === null ? null : savedHeadline(saved)
    return fill(incomeCents, [
      ...spent,
      {
        key: 'saved',
        label: headline?.label ?? 'Saved',
        cents: saved,
        shownCents: headline?.cents ?? null,
        over: headline?.over ?? false,
      },
    ])
  }
  const { bar } = plan
  return fill(incomeCents, [
    ...spent,
    {
      key: 'to-go',
      label: 'Still to go out',
      cents: bar.stillToGoOutCents,
      over: false,
    },
    {
      key: 'rest',
      label: 'If the rest goes to plan',
      cents: bar.ifTheRestGoesToPlanCents,
      over:
        bar.ifTheRestGoesToPlanCents !== null &&
        bar.ifTheRestGoesToPlanCents < 0,
    },
  ])
}

function fill(
  incomeCents: number,
  parts: (Omit<IncomeSegment, 'widthPct' | 'shownCents'> &
    Partial<Pick<IncomeSegment, 'shownCents'>>)[]
): IncomeSegment[] {
  let remaining = incomeCents
  return parts.map((p) => {
    const width = Math.min(Math.max(0, p.cents ?? 0), remaining)
    remaining -= width
    return {
      ...p,
      shownCents: p.shownCents === undefined ? p.cents : p.shownCents,
      widthPct: (width / incomeCents) * 100,
    }
  })
}
