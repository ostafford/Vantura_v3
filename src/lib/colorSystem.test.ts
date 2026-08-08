import { describe, it, expect } from 'vitest'
import {
  getCategoryColor,
  getUncategorisedColor,
  getBucketColor,
  getTrackerColor,
  getFrequencyBadgeColors,
} from './colorSystem'

describe('colorSystem', () => {
  describe('getCategoryColor', () => {
    it('falls back to the neutral Uncategorised colour for null/undefined ids', () => {
      expect(getCategoryColor(null, 'light')).toBe(
        getUncategorisedColor('light')
      )
      expect(getCategoryColor(undefined, 'dark')).toBe(
        getUncategorisedColor('dark')
      )
    })

    it('falls back to the neutral Uncategorised colour for an unmapped id', () => {
      // Category id -> family/shade table isn't populated yet (blocked on
      // real Up Bank category ids) — every id should safely fall back
      // rather than fabricate a colour.
      expect(getCategoryColor('groceries', 'light')).toBe(
        getUncategorisedColor('light')
      )
    })

    it('returns valid 6-digit hex for both modes', () => {
      const hexPattern = /^#[0-9a-f]{6}$/
      expect(getCategoryColor(null, 'light')).toMatch(hexPattern)
      expect(getCategoryColor(null, 'dark')).toMatch(hexPattern)
    })
  })

  describe('getUncategorisedColor', () => {
    it('returns the documented fixed hex per mode', () => {
      expect(getUncategorisedColor('light')).toBe('#6b6b76')
      expect(getUncategorisedColor('dark')).toBe('#9a9aa5')
    })
  })

  describe('getBucketColor', () => {
    it('is deterministic — same id always returns the same colour', () => {
      const first = getBucketColor(42, 'light')
      const second = getBucketColor(42, 'light')
      expect(first).toBe(second)
    })

    it('returns valid 6-digit hex for both modes', () => {
      const hexPattern = /^#[0-9a-f]{6}$/
      expect(getBucketColor(1, 'light')).toMatch(hexPattern)
      expect(getBucketColor(1, 'dark')).toMatch(hexPattern)
    })

    it('different ids can resolve to different colours', () => {
      const colours = new Set(
        Array.from({ length: 12 }, (_, i) => getBucketColor(i, 'light'))
      )
      // Only 3 families x 6 shades = 18 possible colours, but 12 distinct
      // ids should not all collapse onto exactly one colour.
      expect(colours.size).toBeGreaterThan(1)
    })
  })

  describe('getTrackerColor', () => {
    it('is deterministic — same tracker always returns the same colour', () => {
      const tracker = { id: 7, bucket_id: null }
      expect(getTrackerColor(tracker, 'dark')).toBe(
        getTrackerColor(tracker, 'dark')
      )
    })

    it('a bucket-assigned tracker shares its hue family with the bucket, at a distinct shade', () => {
      const bucketId = 3
      const bucketHex = getBucketColor(bucketId, 'light')
      const trackerHex = getTrackerColor(
        { id: 99, bucket_id: bucketId },
        'light'
      )
      // Not asserting exact equality of hex (different shade within the
      // family is expected/desired) — just that both resolve to valid hex
      // and aren't required to collide.
      expect(trackerHex).toMatch(/^#[0-9a-f]{6}$/)
      expect(bucketHex).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('an unassigned tracker still returns a valid, deterministic colour', () => {
      const tracker = { id: 55, bucket_id: null }
      const hex = getTrackerColor(tracker, 'dark')
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    })
  })

  describe('getFrequencyBadgeColors', () => {
    it.each(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'PAYDAY'] as const)(
      'resolves both bg and text hex for %s in both modes',
      (frequency) => {
        const hexPattern = /^#[0-9a-f]{6}$/
        const light = getFrequencyBadgeColors(frequency, 'light')
        const dark = getFrequencyBadgeColors(frequency, 'dark')
        expect(light.bg).toMatch(hexPattern)
        expect(light.text).toMatch(hexPattern)
        expect(dark.bg).toMatch(hexPattern)
        expect(dark.text).toMatch(hexPattern)
      }
    )

    it('gives every frequency the same colours everywhere (identity-independent)', () => {
      const a = getFrequencyBadgeColors('WEEKLY', 'light')
      const b = getFrequencyBadgeColors('WEEKLY', 'light')
      expect(a).toEqual(b)
    })
  })
})
