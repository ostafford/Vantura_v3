/**
 * Copy for the Month by month card (#282, slice 3): a month's figure or the
 * reason it has none, the chart's labels and the year rows' lines.
 */

import type {
  MonthByMonthMonth,
  MonthByMonthReason,
  MonthByMonthYear,
} from '@/services/monthByMonth'
import { planMoney } from './planFormat'
import { monthLabel } from './planFormat'

/** Saved, Overspent, or no figure. */
export type MonthTone = 'saved' | 'over' | 'none'

const REASON: Record<MonthByMonthReason, string> = {
  'part-month': 'Part month',
  'closed-saver': 'Closed Saver',
  'pay-not-confirmed': 'Pay not confirmed',
  'no-pay-set': 'No pay set',
  'plan-unreadable': 'Plan can’t be read',
}

/** "Saved $1.00" / "Overspent $1.00" for a signed Saved figure. */
function savedOrOverspent(cents: number, prefix = ''): string {
  return cents < 0
    ? `${prefix}Overspent ${planMoney(-cents)}`
    : `${prefix}Saved ${planMoney(cents)}`
}

/** A month's figure ("Saved $397.65", "Overspent $12.00") or its reason. */
export function monthFigure(m: MonthByMonthMonth): {
  text: string
  tone: MonthTone
} {
  if (m.savedCents === null) {
    return { text: m.reason ? REASON[m.reason] : '', tone: 'none' }
  }
  return {
    text: savedOrOverspent(m.savedCents),
    tone: m.savedCents < 0 ? 'over' : 'saved',
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

/** A column's accessible name: "October 2026: Saved $397.65", or the reason. */
export function columnName(m: MonthByMonthMonth): string {
  return `${monthLabel(m.month)}: ${monthFigure(m).text}`
}

/** "2026", or "2027 so far" for the current year. */
export function yearTitle(y: MonthByMonthYear): string {
  return y.soFar ? `${y.year} so far` : y.year
}

const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`

/**
 * What a year's total covers: "across 9 of 12 months · 3 not counted",
 * "across 12 months", or "No total · 3 months not counted".
 */
export function yearCoverage(y: MonthByMonthYear): string {
  const all = y.countedMonths + y.notCountedMonths
  if (y.countedMonths === 0) return `No total · ${months(all)} not counted`
  if (y.notCountedMonths === 0) return `across ${months(all)}`
  return `across ${y.countedMonths} of ${months(all)} · ${y.notCountedMonths} not counted`
}

/** "Average Saved $1.00" / "Average Overspent $1.00", or `null`. */
export function yearAverage(y: MonthByMonthYear): string | null {
  return y.averageSavedCents === null
    ? null
    : savedOrOverspent(y.averageSavedCents, 'Average ')
}

/** The year's total as "Saved $1.00" / "Overspent $1.00", or `null`. */
export function yearTotal(y: MonthByMonthYear): string | null {
  return y.totalCents === null ? null : savedOrOverspent(y.totalCents)
}

/** A year's total or average tone. */
export function toneOf(cents: number | null): MonthTone {
  if (cents === null) return 'none'
  return cents < 0 ? 'over' : 'saved'
}
