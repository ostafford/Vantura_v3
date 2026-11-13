/**
 * The **Month review** (#244, Spec D #239, decided in #180): a card at the top
 * of the Dashboard for the latest finished month, from the First plannable
 * month on, that hasn't been reviewed. Computed on render; the only thing
 * stored is the **last reviewed month** (`app_settings`).
 *
 * - Only the latest such month is ever shown. Marking it reviewed counts
 *   every earlier month as reviewed too (they stay reachable with ‹).
 * - Its figure is the finished-month read's Saved (`getFinishedMonthRead`, as
 *   of the `today` it's given), so the
 *   card and the Budget Plan always agree, and it stays live like Saved does.
 * - A month whose Month-end plan can't be read is still offered, with no
 *   figure (#288): skipping it would offer an earlier month as the latest,
 *   and once that was marked reviewed the skipped month would never show.
 * - In-page only: no OS or push notification, badge, count, history log,
 *   setting or schedule (the cut Notifications feature stays cut).
 */

import { getAppSetting, getDb, setAppSetting } from '@/db'
import { localDateString } from '@/lib/format'
import { addMonthsToMonthStr } from '@/lib/dateStr'
import { getFirstPlannableMonth, isMonth } from '@/services/monthEndPlan'
import { getFinishedMonthRead } from '@/services/planVsActual'

/** `app_settings` key: the last reviewed month, `YYYY-MM`. */
export const LAST_REVIEWED_MONTH_KEY = 'last_reviewed_month'

export type MonthReview =
  | { month: string; kind: 'saved'; cents: number }
  /** `cents` is the overspend, as a positive figure. */
  | { month: string; kind: 'overspent'; cents: number }
  /** The month's plan had no pay, so there's no figure. */
  | { month: string; kind: 'no-pay' }
  /** The month's Month-end plan can't be read, so there's no figure. */
  | { month: string; kind: 'plan-unreadable' }

/** The stored last reviewed month, or `null` when unset or malformed. */
export function getLastReviewedMonth(): string | null {
  const value = getAppSetting(LAST_REVIEWED_MONTH_KEY)
  return isMonth(value) ? value : null
}

/**
 * The Month review to show, or `null`: last month, when it's on or after the
 * First plannable month and later than the last reviewed month.
 */
export function getMonthReview(
  today: string = localDateString()
): MonthReview | null {
  const first = getFirstPlannableMonth()
  if (first === null) return null
  const latest = addMonthsToMonthStr(today.slice(0, 7), -1)
  if (latest < first) return null
  const reviewed = getLastReviewedMonth()
  if (reviewed !== null && latest <= reviewed) return null

  const read = getFinishedMonthRead(latest, today)
  // From the First plannable month on, a `null` read means the Month-end plan
  // can't be read (or has no row). Any other state isn't defined here: decline.
  if (read === null) return { month: latest, kind: 'plan-unreadable' }
  if (read.state !== 'finished') return null
  if (read.savedCents === null) return { month: latest, kind: 'no-pay' }
  return read.savedCents < 0
    ? { month: latest, kind: 'overspent', cents: -read.savedCents }
    : { month: latest, kind: 'saved', cents: read.savedCents }
}

/**
 * Stores `month` as the last reviewed month, so it and every earlier month
 * count as reviewed. Never moves it backwards.
 */
export function markMonthReviewed(month: string): void {
  if (!isMonth(month)) return
  const reviewed = getLastReviewedMonth()
  if (reviewed !== null && reviewed >= month) return
  setAppSetting(LAST_REVIEWED_MONTH_KEY, month)
}

/**
 * Replaces the last reviewed month (a profile import): `null` clears it.
 * Must run inside the import's transaction; it opens none.
 */
export function replaceLastReviewedMonth(month: string | null): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM app_settings WHERE key = ?`, [LAST_REVIEWED_MONTH_KEY])
  if (month !== null) {
    db.run(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, [
      LAST_REVIEWED_MONTH_KEY,
      month,
    ])
  }
}
