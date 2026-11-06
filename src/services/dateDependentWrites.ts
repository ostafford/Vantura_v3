/**
 * The writes that depend on the local date, in the order they must run. Boot
 * runs them straight after `initDb`, before sync or anything else, and the
 * day-change watcher runs them again when the date changes with the app open
 * (#164):
 *
 * 1. `freezeMonthEndPlans` (#242): a month that has just finished is frozen
 *    from the plan as it stood at month end, before anything else writes.
 * 2. `recalculateTrackers`: roll tracker periods forward.
 *
 * A freeze that throws is logged and skipped, never fatal: the month is left
 * without a plan (its read declines, and the next run tries again), and the
 * app still boots.
 */

import { freezeMonthEndPlans } from '@/services/monthEndPlan'
import { recalculateTrackers } from '@/services/sync'

export function runDateDependentWrites(): void {
  try {
    freezeMonthEndPlans()
  } catch (err) {
    console.error('Could not freeze the Month-end plan', err)
  }
  recalculateTrackers()
}
