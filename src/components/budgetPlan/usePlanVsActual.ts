import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'
import { getMonthsWithoutAPlan } from '@/services/monthsWithoutAPlan'
import {
  getPlanVsActual,
  type PlanVsActual,
  type PlanVsActualWithPlan,
} from '@/services/planVsActual'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'
import { resolvePlanMonth, type PlanMonth } from './planMonth'

/**
 * The month the page shows (`?month=`, else the current month) and where
 * ‹ / › go (`resolvePlanMonth`). Follows the day signal, so a page left open
 * across a month end moves on with it. `withMonthsWithoutAPlan` lets ‹ reach
 * back to the opening month (#282): the Budget Plan passes true, the bucket
 * page false, since a Month without a plan has no buckets.
 */
export function usePlanMonth({
  withMonthsWithoutAPlan,
}: {
  withMonthsWithoutAPlan: boolean
}): PlanMonth {
  const today = useStore(todayStore, (s) => s.today)
  const [params] = useSearchParams()
  const requested = params.get('month')
  return useMemo(
    () =>
      resolvePlanMonth(
        requested,
        today,
        getFirstPlannableMonth(),
        withMonthsWithoutAPlan ? getMonthsWithoutAPlan() : null
      ),
    [requested, today, withMonthsWithoutAPlan]
  )
}

/**
 * The plan vs actual read for `month`, re-read after a sync, at local
 * midnight (`todayStore`, #164) and whenever `version` changes (the page
 * bumps it after its own writes). `null` when the read declines: a finished
 * month with no Month-end plan, or the month ticking over mid-read. A Month
 * without a plan (#282) reads as `state: 'no-plan'`, which only the Budget Plan
 * reaches; the bucket page reads through `usePlanVsActualWithPlan`.
 */
export function usePlanVsActual(
  version: number,
  month: string
): PlanVsActual | null {
  return useBudgetPlanRead(() => getPlanVsActual(month), version, month)
}

/**
 * Runs a Budget Plan read, and re-runs it after a sync, at local midnight
 * (`todayStore`, #164), when `version` changes (the page bumps it after its
 * own writes) and when `key` changes (the month it reads).
 */
export function useBudgetPlanRead<T>(
  read: () => T,
  version: number,
  key?: string
): T {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  return useMemo(
    () => read(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, today, lastSyncCompletedAt, version]
  )
}

/**
 * `usePlanVsActual` for a page that only shows months with a plan (the
 * bucket page): a Month without a plan reads as `null`. With
 * `usePlanMonth({ withMonthsWithoutAPlan: false })` it never gets one.
 */
export function usePlanVsActualWithPlan(
  version: number,
  month: string
): PlanVsActualWithPlan | null {
  const read = usePlanVsActual(version, month)
  return read?.state === 'no-plan' ? null : read
}
