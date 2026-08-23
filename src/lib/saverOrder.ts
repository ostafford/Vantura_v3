import { getAppSetting, setAppSetting } from '@/db'
import { reorderAgainstKnownIds } from '@/lib/orderedIdList'

const SAVER_ORDER_KEY = 'saver_account_order'

export function getSaverOrder(knownIds: string[]): string[] {
  try {
    const raw = getAppSetting(SAVER_ORDER_KEY)
    if (!raw) return knownIds
    const parsed = JSON.parse(raw) as unknown
    return reorderAgainstKnownIds(parsed, knownIds)
  } catch {
    return knownIds
  }
}

export function setSaverOrder(order: string[]): void {
  setAppSetting(SAVER_ORDER_KEY, JSON.stringify(order))
}
