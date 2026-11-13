/**
 * The **Month by month** card's read (#282, Spec E; #277, #278): every
 * finished month's Saved / Overspent, side by side, and each calendar year's
 * total and **Average Saved**.
 *
 * - **Months:** from the first Month without a plan (or the First plannable
 *   month when there are none) through last month, plan months and Months
 *   without a plan together. The current month is never included: a
 *   projection is never mixed in with results. No First plannable month, no
 *   months.
 * - **Per month:** Saved from the same reads as the Budget Plan
 *   (`getFinishedMonthRead`), negative for Overspent, or the reason there's
 *   no figure: a Month without a plan's reason, *no pay set* (a Month-end
 *   plan with no pay) or *plan unreadable* (no readable Month-end plan).
 * - **Per year:** the total of the counted months' Saved (Overspent counts
 *   negative), how many months it counts and leaves out, and Average Saved =
 *   total ÷ counted months, rounded to the nearest cent with halves away from
 *   zero. Both `null` when no month is counted. The current year is *so far*.
 *
 * Computed on every call. Nothing is cached.
 */

import { addMonthsToMonthStr } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'
import { getMonthsWithoutAPlan } from '@/services/monthsWithoutAPlan'
import {
  getFinishedMonthRead,
  type NoSavedReason,
} from '@/services/planVsActual'

/** Why a month on the card has no figure. */
export type MonthByMonthReason =
  | NoSavedReason
  /** A plan month whose Month-end plan has no pay. */
  | 'no-pay-set'
  /** A plan month with no readable Month-end plan. */
  | 'plan-unreadable'

export interface MonthByMonthMonth {
  /** `YYYY-MM`. */
  month: string
  /** A Month without a plan. */
  noPlan: boolean
  /** Saved, negative for Overspent; `null` with a reason. */
  savedCents: number | null
  /** Set exactly when `savedCents` is `null`. */
  reason: MonthByMonthReason | null
}

export interface MonthByMonthYear {
  /** `YYYY`. */
  year: string
  /** The current year, covering only its finished months. */
  soFar: boolean
  /** The year's months on the card, newest first. */
  months: MonthByMonthMonth[]
  /** Months with a figure. */
  countedMonths: number
  /** Months without one. */
  notCountedMonths: number
  /** Sum of the counted months' Saved; `null` when none is counted. */
  totalCents: number | null
  /** `totalCents` ÷ `countedMonths`, halves away from zero; `null` as above. */
  averageSavedCents: number | null
}

export interface MonthByMonth {
  /** Every finished month on the card, oldest first. */
  months: MonthByMonthMonth[]
  /** One per calendar year, newest first. */
  years: MonthByMonthYear[]
}

/** `total ÷ count` to the nearest integer, halves away from zero. */
export function divideHalfAwayFromZero(total: number, count: number): number {
  const magnitude = Math.floor((2 * Math.abs(total) + count) / (2 * count))
  return total < 0 ? -magnitude : magnitude
}

function readMonth(month: string, today: string): MonthByMonthMonth {
  const read = getFinishedMonthRead(month, today)
  if (read === null) {
    return { month, noPlan: false, savedCents: null, reason: 'plan-unreadable' }
  }
  if (read.state === 'no-plan') {
    return {
      month,
      noPlan: true,
      savedCents: read.savedCents,
      reason: read.noSavedReason,
    }
  }
  return {
    month,
    noPlan: false,
    savedCents: read.savedCents,
    reason: read.savedCents === null ? 'no-pay-set' : null,
  }
}

function summariseYear(
  year: string,
  months: MonthByMonthMonth[],
  soFar: boolean
): MonthByMonthYear {
  const counted = months.flatMap((m) =>
    m.savedCents === null ? [] : [m.savedCents]
  )
  const totalCents =
    counted.length === 0 ? null : counted.reduce((sum, c) => sum + c, 0)
  return {
    year,
    soFar,
    months: [...months].reverse(),
    countedMonths: counted.length,
    notCountedMonths: months.length - counted.length,
    totalCents,
    averageSavedCents:
      totalCents === null
        ? null
        : divideHalfAwayFromZero(totalCents, counted.length),
  }
}

/** The Month by month card's read, or `null` when there's no finished month. */
export function getMonthByMonth(): MonthByMonth | null {
  const today = localDateString()
  const currentMonth = today.slice(0, 7)
  const start =
    getMonthsWithoutAPlan()?.firstMonth ?? getFirstPlannableMonth() ?? null
  if (start === null || start >= currentMonth) return null

  const months: MonthByMonthMonth[] = []
  for (let m = start; m < currentMonth; m = addMonthsToMonthStr(m, 1)) {
    months.push(readMonth(m, today))
  }

  const byYear = new Map<string, MonthByMonthMonth[]>()
  for (const m of months) {
    const year = m.month.slice(0, 4)
    byYear.set(year, [...(byYear.get(year) ?? []), m])
  }
  const currentYear = currentMonth.slice(0, 4)
  const years = [...byYear.entries()]
    .map(([year, ms]) => summariseYear(year, ms, year === currentYear))
    .reverse()

  return { months, years }
}
