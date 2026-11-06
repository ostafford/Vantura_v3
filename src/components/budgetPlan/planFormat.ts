/**
 * Presentation rules for the Budget Plan's plan vs actual view (#241), kept
 * pure so they can be tested without rendering. The figures themselves come
 * from `getPlanVsActual` (#240); nothing here computes money, it only decides
 * how each figure is shown.
 *
 * Colour is for **over** only (#174): an over item, and a negative
 * *If the rest goes to plan*. An overdue Regular gets the warning tone, as in
 * the #174 prototype. Everything else reads muted.
 */

import { formatSignedMoney } from '@/lib/format'
import type { PlanItem, PlanVsActual } from '@/services/planVsActual'

/** The Unplanned card's element id, the target of the bar's unplanned segment. */
export const UNPLANNED_CARD_ID = 'budget-unplanned'

/** "November 2026" for `2026-11`. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
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
  }
}

/**
 * The occurrence Mark paid would mark, or `null` when Mark paid isn't offered:
 * a Regular that is overdue (#212 offers it there) or has no actual figure
 * (#174: Vantura can't see it paid), at its oldest unpaid occurrence.
 */
export function markPaidDate(item: PlanItem): string | null {
  if (item.type !== 'regular') return null
  if (item.state.kind !== 'overdue' && item.state.kind !== 'no-actual-figure')
    return null
  return item.unpaidDates[0] ?? null
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

export type IncomeSegmentKey = 'on-plan' | 'unplanned' | 'to-go' | 'rest'

export interface IncomeSegment {
  key: IncomeSegmentKey
  label: string
  /** The legend figure, signed; `null` when the read declines it. */
  cents: number | null
  /** Share of the bar, 0–100. Never negative; the four never pass 100. */
  widthPct: number
  /** True when the legend figure shows in the over colour. */
  over: boolean
}

/**
 * The Income bar, **capped at Income** (#241): segments fill Income in order
 * (Spent on plan, Spent unplanned, Still to go out, If the rest goes to plan),
 * each taking at most what's left of it. A negative segment gets no width but
 * keeps its legend figure. When spending passes Income the bar is full, and a
 * negative *If the rest goes to plan* shows the shortfall in the over colour.
 * `null` when Income isn't set (the page shows "Set your pay" instead).
 */
export function incomeBarSegments(
  bar: PlanVsActual['bar'],
  incomeCents: number | null
): IncomeSegment[] | null {
  if (incomeCents === null || incomeCents <= 0) return null
  const parts: Omit<IncomeSegment, 'widthPct'>[] = [
    {
      key: 'on-plan',
      label: 'Spent on plan',
      cents: bar.spentOnPlanCents,
      over: false,
    },
    {
      key: 'unplanned',
      label: 'Spent unplanned',
      cents: bar.spentUnplannedCents,
      over: false,
    },
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
  ]
  let remaining = incomeCents
  return parts.map((p) => {
    const width = Math.min(Math.max(0, p.cents ?? 0), remaining)
    remaining -= width
    return { ...p, widthPct: (width / incomeCents) * 100 }
  })
}
