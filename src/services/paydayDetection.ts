/**
 * Detects a user's pay schedule by analysing historical transaction dates.
 *
 * Queries all settled credit transactions with the same raw_text (payroll
 * reference) and infers frequency + monthly rule from the date pattern.
 * Returns null when fewer than 2 matching transactions exist or the interval
 * pattern doesn't fit a known frequency.
 */

import { getDb } from '@/db'
import type { PaydayFrequency } from '@/lib/payday'
import {
  lastBusinessDayOfMonth,
  lastWeekdayOfMonth,
  computeNextMonthlyLastWeekday,
  getPaydayDayLabel,
} from '@/lib/payday'
import { localDateString } from '@/lib/format'

export interface PaydayDetectionResult {
  frequency: PaydayFrequency
  paydayDay: number
  nextPayday: string
  dayLabel: string
  /** All matched pay dates, ascending YYYY-MM-DD — shown to user as evidence. */
  sampleDates: string[]
}

function medianOf(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() -
      new Date(a + 'T12:00:00Z').getTime()) /
      86400000
  )
}

/**
 * Given a list of monthly pay dates (ascending), returns the payday_day code:
 *   100       — all dates are the last business day of their month
 *   101–105   — all dates are the last Mon–Fri of their month
 *   1–28      — all dates share the same day-of-month (fixed)
 * Falls back to the most recent date's day-of-month (capped 28) if inconclusive.
 */
function detectMonthlyPaydayDay(dates: string[]): number {
  // 1. Last business day of each month?
  const allLastBiz = dates.every((d) => {
    const dt = new Date(d + 'T12:00:00Z')
    return (
      lastBusinessDayOfMonth(dt.getUTCFullYear(), dt.getUTCMonth())
        .toISOString()
        .slice(0, 10) === d
    )
  })
  if (allLastBiz) return 100

  // 2. All the same weekday (Mon–Fri) AND each is the last of that weekday in its month?
  const jsDows = dates.map((d) => new Date(d + 'T12:00:00Z').getUTCDay())
  const firstDow = jsDows[0]
  if (firstDow >= 1 && firstDow <= 5 && jsDows.every((w) => w === firstDow)) {
    const allLastOfWeekday = dates.every((d) => {
      const dt = new Date(d + 'T12:00:00Z')
      return (
        lastWeekdayOfMonth(dt.getUTCFullYear(), dt.getUTCMonth(), firstDow)
          .toISOString()
          .slice(0, 10) === d
      )
    })
    if (allLastOfWeekday) return 100 + firstDow // 101=Mon … 105=Fri
  }

  // 3. Fixed day-of-month?
  const dayNums = dates.map((d) => new Date(d + 'T12:00:00Z').getUTCDate())
  if (dayNums.every((n) => n === dayNums[0])) return Math.min(dayNums[0], 28)

  // Inconclusive — use most recent date's day, capped at 28.
  return Math.min(
    new Date(dates[dates.length - 1] + 'T12:00:00Z').getUTCDate(),
    28
  )
}

/**
 * Detects pay schedule from transaction history matched by raw_text.
 * Requires at least 2 matching transactions to infer frequency.
 */
export function detectPaySchedule(
  rawText: string
): PaydayDetectionResult | null {
  const db = getDb()
  if (!db || !rawText.trim()) return null

  const stmt = db.prepare(
    `SELECT COALESCE(settled_at, created_at) AS pay_date
     FROM transactions
     WHERE raw_text = ?
       AND amount > 0
       AND transfer_account_id IS NULL
       AND source = 'up'
     ORDER BY pay_date ASC
     LIMIT 24`
  )
  const dates: string[] = []
  stmt.bind([rawText])
  while (stmt.step()) {
    const row = stmt.get() as [string]
    if (row[0]) dates.push(row[0].slice(0, 10))
  }
  stmt.free()

  if (dates.length < 2) return null

  // Determine frequency from median interval between consecutive pays.
  const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
  const med = medianOf(intervals)

  let frequency: PaydayFrequency
  if (med >= 6 && med <= 8) frequency = 'WEEKLY'
  else if (med >= 13 && med <= 15) frequency = 'FORTNIGHTLY'
  else if (med >= 25 && med <= 35) frequency = 'MONTHLY'
  else return null

  const today = localDateString()
  let paydayDay: number
  let nextPayday: string

  if (frequency === 'MONTHLY') {
    paydayDay = detectMonthlyPaydayDay(dates)
    if (paydayDay >= 100) {
      nextPayday = computeNextMonthlyLastWeekday(paydayDay, today)
    } else {
      const next = new Date(today + 'T12:00:00Z')
      next.setUTCDate(paydayDay)
      if (next.toISOString().slice(0, 10) <= today) {
        next.setUTCMonth(next.getUTCMonth() + 1)
        next.setUTCDate(paydayDay)
      }
      nextPayday = next.toISOString().slice(0, 10)
    }
  } else {
    // WEEKLY / FORTNIGHTLY: anchor to the most recent pay date's weekday.
    const refDate = dates[dates.length - 1]
    const refDt = new Date(refDate + 'T12:00:00Z')
    const refJsDow = refDt.getUTCDay()
    paydayDay = refJsDow === 0 ? 7 : refJsDow

    const todayDt = new Date(today + 'T12:00:00Z')
    if (frequency === 'WEEKLY') {
      const daysUntil = (refJsDow - todayDt.getUTCDay() + 7) % 7 || 7
      const next = new Date(todayDt)
      next.setUTCDate(todayDt.getUTCDate() + daysUntil)
      nextPayday = next.toISOString().slice(0, 10)
    } else {
      // FORTNIGHTLY: align to the last pay's 14-day cycle.
      const daysSinceRef = Math.floor(
        (todayDt.getTime() - refDt.getTime()) / 86400000
      )
      const periodsSince = Math.max(0, Math.floor(daysSinceRef / 14))
      const next = new Date(refDt)
      next.setUTCDate(refDt.getUTCDate() + 14 * (periodsSince + 1))
      if (next.toISOString().slice(0, 10) <= today)
        next.setUTCDate(next.getUTCDate() + 14)
      nextPayday = next.toISOString().slice(0, 10)
    }
  }

  return {
    frequency,
    paydayDay,
    nextPayday,
    dayLabel: getPaydayDayLabel(frequency, paydayDay),
    sampleDates: dates,
  }
}

/**
 * A unique incoming payee, grouped from transaction history.
 * Used by the Settings payday search to let users pick their salary source.
 */
export interface PayeeSummary {
  description: string
  raw_text: string | null
  latestAmount: number
  latestDate: string
  occurrences: number
}

/**
 * Searches incoming (credit) transactions for payees matching the query,
 * grouped by payee so repeated pays from the same source appear once.
 * Results are ordered by frequency (most recurring first), then recency.
 */
export function searchCreditTransactions(
  query: string,
  limit = 8
): PayeeSummary[] {
  const db = getDb()
  if (!db || query.trim().length < 2) return []
  const term = `%${query.trim()}%`
  const stmt = db.prepare(
    `SELECT
       description,
       raw_text,
       MAX(amount) AS latest_amount,
       MAX(COALESCE(settled_at, created_at)) AS latest_date,
       COUNT(*) AS occurrences
     FROM transactions
     WHERE amount > 0
       AND transfer_account_id IS NULL
       AND source = 'up'
       AND (description LIKE ? OR raw_text LIKE ?)
     GROUP BY COALESCE(raw_text, description)
     ORDER BY occurrences DESC, latest_date DESC
     LIMIT ?`
  )
  const results: PayeeSummary[] = []
  stmt.bind([term, term, limit])
  while (stmt.step()) {
    const row = stmt.get() as [string, string | null, number, string, number]
    results.push({
      description: row[0],
      raw_text: row[1],
      latestAmount: row[2],
      latestDate: (row[3] ?? '').slice(0, 10),
      occurrences: row[4],
    })
  }
  stmt.free()
  return results
}
