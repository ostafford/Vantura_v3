import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getInsightsCategoryColors,
  setInsightsCategoryColor,
  clearInsightsCategoryColor,
  normalizeCategoryIdForColor,
  UNCATEGORISED_COLOR_KEY,
} from './chartColors'

vi.mock('@/db', () => ({
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
}))

describe('chartColors', () => {
  beforeEach(async () => {
    const db = await import('@/db')
    vi.mocked(db.getAppSetting).mockReturnValue(null)
    vi.mocked(db.setAppSetting).mockReset()
  })

  describe('getInsightsCategoryColors', () => {
    it('returns empty object when not set', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockImplementation((key) =>
        key === 'insights_category_colors' ? null : null
      )
      expect(getInsightsCategoryColors()).toEqual({})
    })

    it('returns parsed map for valid JSON', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockImplementation((key) =>
        key === 'insights_category_colors' ? '{"cat-1":"#da8cff"}' : null
      )
      expect(getInsightsCategoryColors()).toEqual({ 'cat-1': '#da8cff' })
    })
  })

  describe('setInsightsCategoryColor', () => {
    it('calls setAppSetting with JSON string when adding color', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockReturnValue('{}')
      setInsightsCategoryColor('cat-1', '#da8cff')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        '{"cat-1":"#da8cff"}'
      )
    })

    it('normalizes null/empty category_id to uncategorised sentinel', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockReturnValue('{}')
      setInsightsCategoryColor(null, '#ff0000')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        `{"${UNCATEGORISED_COLOR_KEY}":"#ff0000"}`
      )

      vi.mocked(db.getAppSetting).mockReturnValue('{}')
      setInsightsCategoryColor('', '#00ff00')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        `{"${UNCATEGORISED_COLOR_KEY}":"#00ff00"}`
      )

      vi.mocked(db.getAppSetting).mockReturnValue('{}')
      setInsightsCategoryColor(undefined, '#0000ff')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        `{"${UNCATEGORISED_COLOR_KEY}":"#0000ff"}`
      )

      vi.mocked(db.getAppSetting).mockReturnValue('{}')
      setInsightsCategoryColor('   ', '#ffff00')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        `{"${UNCATEGORISED_COLOR_KEY}":"#ffff00"}`
      )
    })
  })

  describe('clearInsightsCategoryColor', () => {
    it('calls setInsightsCategoryColor with null', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockReturnValue('{"cat-1":"#da8cff"}')
      clearInsightsCategoryColor('cat-1')
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        '{}'
      )
    })

    it('normalizes null/empty when clearing uncategorised', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockReturnValue(
        `{"${UNCATEGORISED_COLOR_KEY}":"#da8cff"}`
      )
      clearInsightsCategoryColor(null)
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'insights_category_colors',
        '{}'
      )
    })
  })

  describe('normalizeCategoryIdForColor', () => {
    it('returns sentinel for null and undefined', () => {
      expect(normalizeCategoryIdForColor(null)).toBe(UNCATEGORISED_COLOR_KEY)
      expect(normalizeCategoryIdForColor(undefined)).toBe(
        UNCATEGORISED_COLOR_KEY
      )
    })

    it('returns sentinel for empty and whitespace-only strings', () => {
      expect(normalizeCategoryIdForColor('')).toBe(UNCATEGORISED_COLOR_KEY)
      expect(normalizeCategoryIdForColor('   ')).toBe(UNCATEGORISED_COLOR_KEY)
    })

    it('returns trimmed id for non-empty strings', () => {
      expect(normalizeCategoryIdForColor('cat-1')).toBe('cat-1')
      expect(normalizeCategoryIdForColor('  cat-2  ')).toBe('cat-2')
    })
  })
})
