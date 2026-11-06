import { useMemo } from 'react'
import { useStore } from 'zustand'
import { localDateString } from '@/lib/format'
import { getPlanVsActual, type PlanVsActual } from '@/services/planVsActual'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'

/**
 * The plan vs actual read for the current calendar month, re-read after a
 * sync, at local midnight (`todayStore`, #164) and whenever `version` changes
 * (the page bumps it after its own writes). The month is the local date at
 * read time, so it can't lag the day signal. `null` only if the month ticks
 * over between the two date reads inside one call.
 */
export function usePlanVsActual(version: number): PlanVsActual | null {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  return useMemo(
    () => getPlanVsActual(localDateString().slice(0, 7)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, lastSyncCompletedAt, version]
  )
}
