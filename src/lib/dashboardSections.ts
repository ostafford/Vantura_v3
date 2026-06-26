/**
 * Dashboard section order and visibility. Stored in app_settings as JSON array.
 */

import { getAppSetting, setAppSetting } from '@/db'

export const DASHBOARD_SECTION_ORDER_KEY = 'dashboard_section_order'

export const DASHBOARD_SECTION_IDS = [
  'month_summary',
  'insights',
  'trackers',
  'upcoming',
  'net_worth',
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

export const DEFAULT_DASHBOARD_SECTION_ORDER: DashboardSectionId[] = [
  'month_summary',
  'insights',
  'trackers',
  'upcoming',
  'net_worth',
]

function migrateLegacySectionId(id: unknown): DashboardSectionId | null {
  if (
    id === 'goals' ||
    id === 'need_vs_want' ||
    id === 'savers' ||
    id === 'maybuys'
  )
    return null
  if (
    typeof id === 'string' &&
    DASHBOARD_SECTION_IDS.includes(id as DashboardSectionId)
  ) {
    return id as DashboardSectionId
  }
  return null
}

export function getDashboardSectionOrder(): DashboardSectionId[] {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_ORDER_KEY)
    if (!raw || typeof raw !== 'string')
      return [...DEFAULT_DASHBOARD_SECTION_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_DASHBOARD_SECTION_ORDER]
    const valid = parsed
      .map((id) => migrateLegacySectionId(id))
      .filter((id): id is DashboardSectionId => id != null)
    const seen = new Set<string>()
    const deduped = valid.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    const missing = DASHBOARD_SECTION_IDS.filter((id) => !seen.has(id))
    return [...deduped, ...missing]
  } catch {
    return [...DEFAULT_DASHBOARD_SECTION_ORDER]
  }
}

export function setDashboardSectionOrder(order: DashboardSectionId[]): void {
  setAppSetting(DASHBOARD_SECTION_ORDER_KEY, JSON.stringify(order))
}

export const DASHBOARD_SECTION_LABELS: Record<DashboardSectionId, string> = {
  month_summary: 'Month at a glance',
  insights: 'Weekly insights',
  trackers: 'Trackers',
  upcoming: 'Upcoming transactions',
  net_worth: 'Net Worth',
}
