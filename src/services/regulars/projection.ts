/**
 * Projection (docs/adr/0004): a Regular's stored date is never advanced; these
 * functions compute its occurrences from the stored anchor at read time. Every
 * occurrence is counted from the anchor (`nthOccurrence`), so month-end days
 * survive short months (#145). Pure — no DB.
 */

import { localDateString } from '@/lib/format'
import type { Regular } from './rows'

function parseDate(dateStr: string): Date {
  return new Date(dateStr.slice(0, 10) + 'T12:00:00Z')
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const monthIndex = month + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonth = ((monthIndex % 12) + 12) % 12
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate()
  const targetDay = Math.min(day, daysInTargetMonth)
  return new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0))
}

/**
 * The `n`th occurrence (`n = 0` is the anchor itself) of a recurring charge,
 * always measured from the stored anchor — never by stepping from a previous,
 * already-clamped occurrence. So a Jan 31 monthly anchor gives Feb 28, then
 * Mar 31, Apr 30: the anchor's day survives a short month (#145). Returns
 * `null` for `ONCE` and any unrecognised frequency (they don't recur).
 */
export function nthOccurrence(
  anchorDateStr: string,
  frequency: string,
  n: number
): string | null {
  const d = parseDate(anchorDateStr)
  switch (frequency) {
    case 'WEEKLY':
      return formatDate(addDays(d, 7 * n))
    case 'FORTNIGHTLY':
      return formatDate(addDays(d, 14 * n))
    case 'MONTHLY':
      return formatDate(addMonthsClamped(d, n))
    case 'QUARTERLY':
      return formatDate(addMonthsClamped(d, 3 * n))
    case 'YEARLY':
      return formatDate(addMonthsClamped(d, 12 * n))
    default:
      return null
  }
}

/**
 * Next charge date to prefill when creating a recurring charge from a past
 * transaction: step the anchor forward by `frequency` until it lands on or
 * after `today` (default: local today). `ONCE` and any unrecognised frequency
 * fall back to `today`. Returns `YYYY-MM-DD`.
 *
 * On-or-after is the same boundary as `firstOccurrenceOnOrAfter`, which the
 * list and Reserved use, so the date the create form shows is
 * the date the list shows once the Regular is saved (#163). A cycle that falls
 * today is shown as due today, even if today's payment already settled.
 *
 * Projects via `nthOccurrence`, so month-end anchors clamp correctly — a Jan 31
 * monthly anchor gives Feb 28/29, not Mar 3, and Mar 31 after that (#145).
 */
export function nextChargeDateFromAnchor(
  anchorDateStr: string,
  frequency: string,
  today: string = localDateString()
): string {
  if (frequency === 'ONCE') return today

  const anchor = anchorDateStr.slice(0, 10)
  // Every real frequency advances monotonically with `n` and nthOccurrence
  // returns null for anything else, so this terminates; the counter is only a
  // stop against a pathological anchor (decades in the past). If it ever trips
  // we fall back to `today` rather than return a still-past occurrence.
  for (let n = 0; n < 1000; n++) {
    const occurrence = nthOccurrence(anchor, frequency, n)
    if (!occurrence) return today // unrecognised frequency
    if (occurrence >= today) return occurrence
  }
  return today
}

export function firstOccurrenceOnOrAfter(
  nextChargeDate: string,
  frequency: string,
  targetDate: string,
  cancelByDate: string | null
): string | null {
  const base = nextChargeDate.slice(0, 10)
  const target = targetDate.slice(0, 10)
  const cancelBy = cancelByDate ? cancelByDate.slice(0, 10) : null
  if (cancelBy && target > cancelBy) return null
  if (frequency === 'ONCE') {
    if (base < target) return null
    if (cancelBy && base > cancelBy) return null
    return base
  }

  const n = firstRecurringIndexOnOrAfter(base, frequency, target)
  if (n == null) return null
  const occurrence = nthOccurrence(base, frequency, n)
  if (!occurrence) return null
  if (cancelBy && occurrence > cancelBy) return null
  return occurrence
}

/**
 * Index `n` of a recurring charge's first occurrence on or after `target`,
 * counted from the anchor (see `nthOccurrence`, #145). `null` for `ONCE`, an
 * unrecognised frequency, or a month-based anchor too far past to resolve
 * within the guard.
 */
function firstRecurringIndexOnOrAfter(
  base: string,
  frequency: string,
  target: string
): number | null {
  if (frequency === 'WEEKLY' || frequency === 'FORTNIGHTLY') {
    const stepDays = frequency === 'WEEKLY' ? 7 : 14
    const diffDays = Math.max(
      0,
      Math.ceil(
        (parseDate(target).getTime() - parseDate(base).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    )
    return Math.ceil(diffDays / stepDays)
  }
  if (
    frequency !== 'MONTHLY' &&
    frequency !== 'QUARTERLY' &&
    frequency !== 'YEARLY'
  ) {
    return null
  }
  for (let n = 0; n < 1000; n++) {
    const occurrence = nthOccurrence(base, frequency, n)
    if (occurrence && occurrence >= target) return n
  }
  return null
}

export function getProjectedOccurrencesInRange(
  row: Regular,
  startDate: string,
  endDate: string
): Regular[] {
  const list: Regular[] = []
  if (row.frequency === 'ONCE') {
    const once = firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      startDate,
      row.cancel_by_date
    )
    if (once && once <= endDate) list.push({ ...row, next_charge_date: once })
    return list
  }

  // Every occurrence is counted from the anchor, not stepped from the previous
  // one, so a clamped month-end occurrence doesn't carry forward (#145).
  const anchor = row.next_charge_date.slice(0, 10)
  const cancelBy = row.cancel_by_date ? row.cancel_by_date.slice(0, 10) : null
  const first = firstRecurringIndexOnOrAfter(
    anchor,
    row.frequency,
    startDate.slice(0, 10)
  )
  if (first == null) return list
  for (let n = first; ; n++) {
    const occurrence = nthOccurrence(anchor, row.frequency, n)
    if (!occurrence || occurrence > endDate) break
    if (cancelBy && occurrence > cancelBy) break
    list.push({ ...row, next_charge_date: occurrence })
  }
  return list
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from `a` to `b` (`YYYY-MM-DD`), signed. */
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS)
}

/** True when `date` is one of `row`'s projected occurrences (docs/adr/0004). */
export function isProjectedOccurrence(row: Regular, date: string): boolean {
  const day = date.slice(0, 10)
  return getProjectedOccurrencesInRange(row, day, day).length > 0
}

/**
 * The projected occurrence of a **recurring** Regular that a payment dated
 * `date` pays (#214), or `null` when it pays none. Pure: the caller supplies
 * the Linked payment.
 *
 * Every occurrence's window runs halfway to its neighbours, so the payment
 * pays the nearest occurrence; at the exact midpoint, the **earlier** one.
 * The neighbours come from the series ignoring `cancel_by_date`:
 *
 * - Before the first occurrence (the anchor), the window reaches back half the
 *   gap to the second occurrence. A payment exactly on that boundary pays
 *   nothing: the tie goes to the earlier side, where there is no occurrence.
 * - After the last occurrence before `cancel_by_date`, the window reaches half
 *   a step towards where the next one would have fallen. A payment nearer that
 *   cancelled date pays nothing.
 *
 * `ONCE` and unrecognised frequencies return `null`: `ONCE` has its own rule.
 */
export function occurrencePaidBy(row: Regular, date: string): string | null {
  const anchor = row.next_charge_date.slice(0, 10)
  const day = date.slice(0, 10)
  const cancelBy = row.cancel_by_date ? row.cancel_by_date.slice(0, 10) : null
  const k = firstRecurringIndexOnOrAfter(anchor, row.frequency, day)
  if (k == null) return null
  const atOrAfter = nthOccurrence(anchor, row.frequency, k)
  if (!atOrAfter) return null

  let paid: string | null
  if (k === 0) {
    // On or before the anchor: compare with a virtual occurrence one gap
    // (anchor → second occurrence) before the anchor.
    const second = nthOccurrence(anchor, row.frequency, 1)
    if (!second) return null
    const gap = daysBetween(anchor, second)
    const beforeAnchor = daysBetween(day, anchor)
    paid = gap - beforeAnchor <= beforeAnchor ? null : anchor
  } else {
    const before = nthOccurrence(anchor, row.frequency, k - 1)
    if (!before) return null
    paid =
      daysBetween(before, day) <= daysBetween(day, atOrAfter)
        ? before
        : atOrAfter
  }
  if (paid && cancelBy && paid > cancelBy) return null
  return paid
}
