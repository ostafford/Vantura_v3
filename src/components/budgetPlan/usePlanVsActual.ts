import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'
import { getPlanVsActual, type PlanVsActual } from '@/services/planVsActual'
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
 * month with no Month-end plan, or the month ticking over mid-read.
 */
export function usePlanVsActual(
  version: number,
  month: string
): PlanVsActual | null {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  return useMemo(
    () => getPlanVsActual(month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, today, lastSyncCompletedAt, version]
  )
}
