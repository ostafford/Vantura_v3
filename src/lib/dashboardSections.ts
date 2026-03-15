/**
 * Dashboard section order and visibility. Stored in app_settings as JSON array.
 */

import { getAppSetting, setAppSetting } from '@/db'

export const DASHBOARD_SECTION_ORDER_KEY = 'dashboard_section_order'
export const DASHBOARD_SECTION_SIZES_KEY = 'dashboard_section_sizes'

export type DashboardSectionSize = 'full' | 'compact'

export const DASHBOARD_SECTION_IDS = [
  'month_summary',
  'savers',
  'goals',
  'insights',
  'trackers',
  'upcoming',
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

export const DEFAULT_DASHBOARD_SECTION_ORDER: DashboardSectionId[] = [
  'month_summary',
  'insights',
  'savers',
  'trackers',
  'goals',
  'upcoming',
]

export function getDashboardSectionOrder(): DashboardSectionId[] {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_ORDER_KEY)
    if (!raw || typeof raw !== 'string')
      return [...DEFAULT_DASHBOARD_SECTION_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_DASHBOARD_SECTION_ORDER]
    const valid = parsed.filter((id): id is DashboardSectionId =>
      DASHBOARD_SECTION_IDS.includes(id as DashboardSectionId)
    )
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
  savers: 'Savers',
  goals: 'Goals',
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
    const result = { ...defaultSectionSizes() }
    for (const id of DASHBOARD_SECTION_IDS) {
      const v = (parsed as Record<string, string>)[id]
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
