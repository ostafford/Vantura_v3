/**
 * Dashboard section order and visibility. Stored in app_settings as JSON array.
 */

import { getAppSetting, setAppSetting } from '@/db'

export const DASHBOARD_SECTION_ORDER_KEY = 'dashboard_section_order'
export const DASHBOARD_SECTION_SIZES_KEY = 'dashboard_section_sizes'

export type DashboardSectionSize = 'full' | 'compact'

export const DASHBOARD_SECTION_IDS = [
  'month_summary',
  'insights',
  'trackers',
  'upcoming',
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

export const DEFAULT_DASHBOARD_SECTION_ORDER: DashboardSectionId[] = [
  'month_summary',
  'insights',
  'trackers',
  'upcoming',
]

function migrateLegacySectionId(id: unknown): DashboardSectionId | null {
  if (id === 'goals' || id === 'need_vs_want' || id === 'savers') return null
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
  month_summary: 'This month',
  insights: 'Weekly insights',
  trackers: 'Trackers',
  upcoming: 'Upcoming transactions',
}

export function getDashboardSectionSizes(): Record<
  DashboardSectionId,
  DashboardSectionSize
> {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_SIZES_KEY)
    if (!raw || typeof raw !== 'string') return defaultSectionSizes()
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return defaultSectionSizes()
    const p = parsed as Record<string, string>
    const result = { ...defaultSectionSizes() }
    for (const id of DASHBOARD_SECTION_IDS) {
      const v = p[id]
      if (v === 'full' || v === 'compact') result[id] = v
    }
    return result
  } catch {
    return defaultSectionSizes()
  }
}

function defaultSectionSizes(): Record<
  DashboardSectionId,
  DashboardSectionSize
> {
  return DASHBOARD_SECTION_IDS.reduce(
    (acc, id) => {
      acc[id] = 'full'
      return acc
    },
    {} as Record<DashboardSectionId, DashboardSectionSize>
  )
}

export function setDashboardSectionSizes(
  sizes: Record<DashboardSectionId, DashboardSectionSize>
): void {
  setAppSetting(DASHBOARD_SECTION_SIZES_KEY, JSON.stringify(sizes))
}
