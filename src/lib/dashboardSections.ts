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
  'net_worth',
  'insights',
  'trackers',
  'upcoming',
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

// --- Section sizing ---

export type DashboardSectionSize = 'small' | 'medium' | 'large'

export const DASHBOARD_SECTION_SIZES_KEY = 'dashboard_section_sizes'

export const DEFAULT_SECTION_SIZES: Record<
  DashboardSectionId,
  DashboardSectionSize
> = {
  month_summary: 'medium',
  insights: 'medium',
  trackers: 'medium',
  upcoming: 'large',
  net_worth: 'small',
}

export function getDashboardSectionSizes(): Record<
  DashboardSectionId,
  DashboardSectionSize
> {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_SIZES_KEY)
    if (!raw) return { ...DEFAULT_SECTION_SIZES }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null)
      return { ...DEFAULT_SECTION_SIZES }
    const result = { ...DEFAULT_SECTION_SIZES }
    for (const id of DASHBOARD_SECTION_IDS) {
      const val = (parsed as Record<string, unknown>)[id]
      if (val === 'small' || val === 'medium' || val === 'large')
        result[id] = val
    }
    return result
  } catch {
    return { ...DEFAULT_SECTION_SIZES }
  }
}

export function setDashboardSectionSizes(
  sizes: Record<DashboardSectionId, DashboardSectionSize>
): void {
  setAppSetting(DASHBOARD_SECTION_SIZES_KEY, JSON.stringify(sizes))
}

// --- Section visibility ---

export const DASHBOARD_SECTION_VISIBILITY_KEY = 'dashboard_section_visibility'

export const DEFAULT_SECTION_VISIBILITY: Record<DashboardSectionId, boolean> = {
  month_summary: true,
  insights: true,
  trackers: true,
  upcoming: true,
  net_worth: true,
}

export function getDashboardSectionVisibility(): Record<
  DashboardSectionId,
  boolean
> {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_VISIBILITY_KEY)
    if (!raw) return { ...DEFAULT_SECTION_VISIBILITY }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null)
      return { ...DEFAULT_SECTION_VISIBILITY }
    const result = { ...DEFAULT_SECTION_VISIBILITY }
    for (const id of DASHBOARD_SECTION_IDS) {
      const val = (parsed as Record<string, unknown>)[id]
      if (typeof val === 'boolean') result[id] = val
    }
    return result
  } catch {
    return { ...DEFAULT_SECTION_VISIBILITY }
  }
}

export function setDashboardSectionVisibility(
  visibility: Record<DashboardSectionId, boolean>
): void {
  setAppSetting(DASHBOARD_SECTION_VISIBILITY_KEY, JSON.stringify(visibility))
}
