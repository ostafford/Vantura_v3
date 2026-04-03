/**
 * Per-chart color preferences stored in app_settings as JSON.
 * Safe JSON read; supports reset (clear key so chart falls back to theme/palette).
 */

import { getAppSetting, setAppSetting } from '@/db'

const INSIGHTS_CATEGORY_COLORS_KEY = 'insights_category_colors'

/** Sentinel for uncategorised transactions (null/empty category_id). */
export const UNCATEGORISED_COLOR_KEY = '__uncategorised__'

/**
 * Normalize category_id for color storage/lookup. Null/empty becomes a stable
 * sentinel so "Uncategorised" bars get consistent colors across weeks.
 */
export function normalizeCategoryIdForColor(
  categoryId: string | null | undefined
): string {
  const id = categoryId == null ? '' : String(categoryId).trim()
  return id === '' ? UNCATEGORISED_COLOR_KEY : id
}

function parseJsonMap(key: string): Record<string, string> {
  try {
    const raw = getAppSetting(key) ?? '{}'
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v
      }
      return out
    }
  } catch {
    // ignore corrupted or invalid JSON
  }
  return {}
}

export function getInsightsCategoryColors(): Record<string, string> {
  return parseJsonMap(INSIGHTS_CATEGORY_COLORS_KEY)
}

export function setInsightsCategoryColor(
  categoryId: string | null | undefined,
  hex: string | null
): void {
  const key = normalizeCategoryIdForColor(categoryId)
  const map = parseJsonMap(INSIGHTS_CATEGORY_COLORS_KEY)
  if (hex == null || hex === '') {
    delete map[key]
  } else {
    map[key] = hex
  }
  setAppSetting(INSIGHTS_CATEGORY_COLORS_KEY, JSON.stringify(map))
}

export function clearInsightsCategoryColor(
  categoryId: string | null | undefined
): void {
  setInsightsCategoryColor(categoryId, null)
}
