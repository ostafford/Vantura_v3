/**
 * The **Still to go out**, **Headroom** and **Free spending so far** reads
 * (#212, #215; decided in #173 and #185), for the current calendar month.
 *
 * - **Regulars not paid yet:** every Regular occurrence dated this month that
 *   isn't paid (`regularOccurrencesPaidInMonth`), overdue ones included. An
 *   occurrence is overdue when its date is before today.
 * - **Left in trackers:** each active Tracker's `max(0, planned − actual)` for
 *   the month, with planned and actual from `getMonthAttribution` (#191), so
 *   the figures agree with plan vs actual. The floor is per Tracker: one
 *   overspent Tracker never reduces another's remainder. A Tracker at $0 left
 *   is still listed.
 * - **Still to go out** = the sum of both. Unplanned spending isn't forecast.
 * - **Headroom** = On hand (`getOnHandCents`) − Still to go out, signed and
 *   never clamped.
 * - **Free spending so far** = monthly Income (#189) − total Actual spending
 *   for the month to date, or `null` ("not set") when Income is null.
 *
 * A Tracker the attribution read can't price (`plannedCents: null`) has no
 * remainder, so Still to go out and Headroom decline (`null`) rather than
 * guess. Reads no payday date. Computed on every call; nothing is cached or
 * stored.
 */

import { localDateString } from '@/lib/format'
import { getOnHandCents } from '@/services/accounts'
import { getMonthlyIncomeCents } from '@/services/budgetBuckets'
import { getMonthAttribution } from '@/services/monthAttribution'
import { regularOccurrencesPaidInMonth } from '@/services/regulars'
import { getTrackersList } from '@/services/trackers'

export interface RegularNotPaidYet {
  regularId: number
  name: string
  /** Occurrence date, `YYYY-MM-DD`. */
  date: string
  /** The occurrence's amount, cents, positive = money out. */
  amountCents: number
  /** True when the date is before today. */
  overdue: boolean
}

export interface TrackerLeft {
  trackerId: number
  name: string
  /** From the month attribution read; `null` when it can't be priced. */
  plannedCents: number | null
  /** From the month attribution read. Positive = money out; may be negative. */
  actualCents: number
  /** `max(0, planned − actual)`, or `null` when planned is `null`. */
  leftCents: number | null
}

export interface Headroom {
  /** `YYYY-MM`, the current calendar month. */
  month: string
  /** Today, `YYYY-MM-DD` (local). */
  today: string
  onHandCents: number
  /** By date, then Regular id. */
  regularsNotPaidYet: RegularNotPaidYet[]
  regularsNotPaidYetCents: number
  /** Every active Tracker, in id order. */
  trackersLeft: TrackerLeft[]
  /** Sum of `leftCents`, or `null` when any Tracker's is `null`. */
  trackersLeftCents: number | null
  /** Regulars not paid yet + Left in trackers, or `null` (see the header). */
  stillToGoOutCents: number | null
  /** On hand − Still to go out, signed, or `null` when Still to go out is. */
  headroomCents: number | null
  /** Monthly Income − total Actual spending to date, or `null` when Income isn't set. */
  freeSpendingSoFarCents: number | null
}

/** The Headroom read for the current calendar month. */
export function getHeadroom(): Headroom {
  const today = localDateString()
  const month = today.slice(0, 7)

  const regularsNotPaidYet: RegularNotPaidYet[] = regularOccurrencesPaidInMonth(
    month
  )
    .filter((o) => !o.paid)
    .map((o) => ({
      regularId: o.regular.id,
      name: o.regular.name,
      date: o.date,
      amountCents: o.regular.amount,
      overdue: o.date < today,
    }))
  const regularsNotPaidYetCents = regularsNotPaidYet.reduce(
    (sum, r) => sum + r.amountCents,
    0
  )

  const attribution = getMonthAttribution(month)
  const names = new Map(getTrackersList().map((t) => [t.id, t.name]))
  const trackersLeft: TrackerLeft[] = attribution.trackers.map((t) => ({
    trackerId: t.trackerId,
    name: names.get(t.trackerId) ?? '',
    plannedCents: t.plannedCents,
    actualCents: t.actualCents,
    leftCents:
      t.plannedCents === null
        ? null
        : Math.max(0, t.plannedCents - t.actualCents),
  }))
  const trackersLeftCents = trackersLeft.some((t) => t.leftCents === null)
    ? null
    : trackersLeft.reduce((sum, t) => sum + (t.leftCents ?? 0), 0)

  const stillToGoOutCents =
    trackersLeftCents === null
      ? null
      : regularsNotPaidYetCents + trackersLeftCents
  const onHandCents = getOnHandCents()
  const income = getMonthlyIncomeCents()

  return {
    month,
    today,
    onHandCents,
    regularsNotPaidYet,
    regularsNotPaidYetCents,
    trackersLeft,
    trackersLeftCents,
    stillToGoOutCents,
    headroomCents:
      stillToGoOutCents === null ? null : onHandCents - stillToGoOutCents,
    freeSpendingSoFarCents:
      income === null ? null : income - attribution.totalActualSpendingCents,
  }
}
