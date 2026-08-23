/**
 * Dashboard section order and visibility. Stored in app_settings as JSON array.
 */

import { getAppSetting, setAppSetting } from '@/db'
import { reorderAgainstKnownIds } from '@/lib/orderedIdList'

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

export function getDashboardSectionOrder(): DashboardSectionId[] {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_ORDER_KEY)
    if (!raw) return [...DEFAULT_DASHBOARD_SECTION_ORDER]
    const parsed = JSON.parse(raw) as unknown
    // Ids no longer in DASHBOARD_SECTION_IDS (e.g. removed legacy sections) are
    // dropped by the known-ids filter below same as any other unrecognized id.
    return reorderAgainstKnownIds(
      parsed,
      DASHBOARD_SECTION_IDS,
      DEFAULT_DASHBOARD_SECTION_ORDER
    )
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

/**
 * Merges a stored (untrusted) object onto a full defaults record, keeping only values
 * that pass `isValid` for each known key — an invalid or missing key keeps its default.
 * Shared by getDashboardSectionSizes/getDashboardSectionVisibility, the two settings
 * that are both "one validated value per dashboard section."
 */
function mergeValidatedRecord<K extends string, V>(
  parsed: unknown,
  knownIds: readonly K[],
  defaults: Record<K, V>,
  isValid: (val: unknown) => val is V
): Record<K, V> {
  if (typeof parsed !== 'object' || parsed === null) return { ...defaults }
  const result = { ...defaults }
  for (const id of knownIds) {
    const val = (parsed as Record<string, unknown>)[id]
    if (isValid(val)) result[id] = val
  }
  return result
}

function isSectionSize(val: unknown): val is DashboardSectionSize {
  return val === 'small' || val === 'medium' || val === 'large'
}

export function getDashboardSectionSizes(): Record<
  DashboardSectionId,
  DashboardSectionSize
> {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_SIZES_KEY)
    if (!raw) return { ...DEFAULT_SECTION_SIZES }
    const parsed = JSON.parse(raw) as unknown
    return mergeValidatedRecord(
      parsed,
      DASHBOARD_SECTION_IDS,
      DEFAULT_SECTION_SIZES,
      isSectionSize
    )
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

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean'
}

export function getDashboardSectionVisibility(): Record<
  DashboardSectionId,
  boolean
> {
  try {
    const raw = getAppSetting(DASHBOARD_SECTION_VISIBILITY_KEY)
    if (!raw) return { ...DEFAULT_SECTION_VISIBILITY }
    const parsed = JSON.parse(raw) as unknown
    return mergeValidatedRecord(
      parsed,
      DASHBOARD_SECTION_IDS,
      DEFAULT_SECTION_VISIBILITY,
      isBoolean
    )
  } catch {
    return { ...DEFAULT_SECTION_VISIBILITY }
  }
}

export function setDashboardSectionVisibility(
  visibility: Record<DashboardSectionId, boolean>
): void {
  setAppSetting(DASHBOARD_SECTION_VISIBILITY_KEY, JSON.stringify(visibility))
}
