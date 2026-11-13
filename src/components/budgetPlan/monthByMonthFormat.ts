/**
 * Copy and geometry for the Month by month card (#282, slice 3): a month's
 * figure or the reason it has none, the chart's scale and labels, and the
 * year rows' lines.
 */

import type {
  MonthByMonthReason,
  MonthByMonthYear,
  MonthResult,
} from '@/services/monthByMonth'
import { monthLabel, planMoney, savedHeadline } from './planFormat'

/** Saved, Overspent, or no figure. */
export type MonthTone = 'saved' | 'over' | 'none'

const REASON: Record<MonthByMonthReason, string> = {
  'part-month': 'Part month',
  'closed-saver': 'Closed Saver',
  'pay-not-confirmed': 'Pay not confirmed',
  'no-pay-set': 'No pay set',
  'plan-unreadable': 'Plan can’t be read',
}

/**
 * A signed Saved figure as "Saved $1.00" / "Overspent $1.00" (with an
 * optional prefix) and its tone, or no figure when `null`.
 */
function signedFigure(
  cents: number | null,
  prefix = ''
): { text: string; tone: MonthTone } | null {
  if (cents === null) return null
  const { label, cents: amount, over } = savedHeadline(cents)
  return {
    text: `${prefix}${label} ${planMoney(amount)}`,
    tone: over ? 'over' : 'saved',
  }
}

/** A month's figure ("Saved $397.65", "Overspent $12.00") or its reason. */
export function monthFigure(m: MonthResult): {
  text: string
  tone: MonthTone
} {
  return (
    signedFigure(m.savedCents) ?? {
      text: m.reason ? REASON[m.reason] : '',
      tone: 'none',
    }
  )
}

/**
 * The chart's one shared scale (#282): the largest absolute figure across
 * every month fills its side of the baseline. With Saved and Overspent months
 * both present, the baseline is in the middle and each side is half the plot;
 * with only one sign, that side has the whole plot.
 */
export function chartScale(months: MonthResult[]): {
  /** The baseline's distance from the top, as a fraction of the plot. */
  baseline: number
  /** A figure's bar height, as a fraction of the plot. */
  height: (cents: number) => number
} {
  const figures = months.flatMap((m) =>
    m.savedCents === null ? [] : [m.savedCents]
  )
  const largest = Math.max(0, ...figures.map(Math.abs))
  const saved = figures.some((c) => c > 0)
  const overspent = figures.some((c) => c < 0)
  const side = saved && overspent ? 0.5 : 1
  return {
    baseline: overspent ? 1 - side : 1,
    height: (cents) => (largest === 0 ? 0 : (Math.abs(cents) / largest) * side),
  }
}

/**
 * Three-letter month names. Fixed rather than from the locale, which gives
 * "Sept" in en-AU, so every column label is the same width.
 */
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "Oct" for `2026-10`. */
export function shortMonth(month: string): string {
  return SHORT_MONTHS[Number(month.slice(5, 7)) - 1] ?? ''
}

/**
 * The year label under the chart's column `i` ("2026"): at the first month
 * and at each January, where a divider starts the year. `null` elsewhere.
 */
export function yearLabelAt(months: MonthResult[], i: number): string | null {
  const m = months[i]?.month
  if (m === undefined) return null
  return i === 0 || m.endsWith('-01') ? m.slice(0, 4) : null
}

/** A column's accessible name: "October 2026: Saved $397.65", or the reason. */
export function columnName(m: MonthResult): string {
  return `${monthLabel(m.month)}: ${monthFigure(m).text}`
}

/** "2026", or "2027 so far" for the current year. */
export function yearTitle(y: MonthByMonthYear): string {
  return y.soFar ? `${y.year} so far` : y.year
}

/** "1 month", "3 months". */
const monthCount = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`

/**
 * What a year's total covers: "across 9 of 12 months · 3 not counted",
 * "across 12 months", or "No total · 3 months not counted".
 */
export function yearCoverage(y: MonthByMonthYear): string {
  const all = y.countedMonths + y.notCountedMonths
  if (y.countedMonths === 0) return `No total · ${monthCount(all)} not counted`
  if (y.notCountedMonths === 0) return `across ${monthCount(all)}`
  return `across ${y.countedMonths} of ${monthCount(all)} · ${y.notCountedMonths} not counted`
}

/** The year's total, "Saved $1.00" / "Overspent $1.00", or `null`. */
export function yearTotal(y: MonthByMonthYear) {
  return signedFigure(y.totalCents)
}

/** "Average Saved $1.00" / "Average Overspent $1.00", or `null`. */
export function yearAverage(y: MonthByMonthYear) {
  return signedFigure(y.averageSavedCents, 'Average ')
}
