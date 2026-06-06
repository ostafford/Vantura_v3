import { getAppSetting, setAppSetting } from '@/db'

const SAVER_ORDER_KEY = 'saver_account_order'

export function getSaverOrder(knownIds: string[]): string[] {
  try {
    const raw = getAppSetting(SAVER_ORDER_KEY)
    if (!raw || typeof raw !== 'string') return knownIds
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return knownIds
    const valid = (parsed as unknown[]).filter(
      (id): id is string => typeof id === 'string' && knownIds.includes(id)
    )
    const seen = new Set(valid)
    const missing = knownIds.filter((id) => !seen.has(id))
    return [...valid, ...missing]
  } catch {
    return knownIds
  }
}

export function setSaverOrder(order: string[]): void {
  setAppSetting(SAVER_ORDER_KEY, JSON.stringify(order))
}
