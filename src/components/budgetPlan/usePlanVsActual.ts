import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'
import {
  getPlanVsActual,
  type PlanVsActualWithPlan,
} from '@/services/planVsActual'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'
import { resolvePlanMonth, type PlanMonth } from './planMonth'

/**
 * The month the page shows (`?month=`, else the current month) and where
 * ‹ / › go (`resolvePlanMonth`). Follows the day signal, so a page left open
 * across a month end moves on with it.
 */
export function usePlanMonth(): PlanMonth {
  const today = useStore(todayStore, (s) => s.today)
  const [params] = useSearchParams()
  const requested = params.get('month')
  return useMemo(
    () => resolvePlanMonth(requested, today, getFirstPlannableMonth()),
    [requested, today]
  )
}

/**
 * The plan vs actual read for `month`, re-read after a sync, at local
 * midnight (`todayStore`, #164) and whenever `version` changes (the page
 * bumps it after its own writes). `null` when the read declines: a finished
 * month with no Month-end plan, or the month ticking over mid-read. A Month
 * without a plan (#282) reads `null` here until the page renders one; the
 * page can't reach one yet, since `resolvePlanMonth` stops at the First
 * plannable month.
 */
export function usePlanVsActual(
  version: number,
  month: string
): PlanVsActualWithPlan | null {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  return useMemo(
    () => {
      const read = getPlanVsActual(month)
      return read?.state === 'no-plan' ? null : read
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, today, lastSyncCompletedAt, version]
  )
}
