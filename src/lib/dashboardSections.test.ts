import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  DASHBOARD_SECTION_ORDER_KEY,
  DEFAULT_DASHBOARD_SECTION_ORDER,
  DASHBOARD_SECTION_IDS,
  getDashboardSectionSizes,
  DEFAULT_SECTION_SIZES,
  DASHBOARD_SECTION_SIZES_KEY,
  getDashboardSectionVisibility,
  DEFAULT_SECTION_VISIBILITY,
  DASHBOARD_SECTION_VISIBILITY_KEY,
} = await import('./dashboardSections')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

describe('getDashboardSectionOrder', () => {
  it('returns the curated default order when nothing is stored', () => {
    expect(getDashboardSectionOrder()).toEqual(DEFAULT_DASHBOARD_SECTION_ORDER)
  })

  it('returns the curated default order (not DASHBOARD_SECTION_IDS order) on invalid JSON', () => {
    appSettings[DASHBOARD_SECTION_ORDER_KEY] = 'not json'
    expect(getDashboardSectionOrder()).toEqual(DEFAULT_DASHBOARD_SECTION_ORDER)
  })

  it('returns the curated default order when stored value is not an array', () => {
    appSettings[DASHBOARD_SECTION_ORDER_KEY] = JSON.stringify({ a: 1 })
    expect(getDashboardSectionOrder()).toEqual(DEFAULT_DASHBOARD_SECTION_ORDER)
  })

  it('preserves stored order for known ids', () => {
    appSettings[DASHBOARD_SECTION_ORDER_KEY] = JSON.stringify([
      'trackers',
      'month_summary',
    ])
    expect(getDashboardSectionOrder()).toEqual([
      'trackers',
      'month_summary',
      'insights',
      'upcoming',
      'net_worth',
    ])
  })

  it('drops removed legacy section ids no longer in DASHBOARD_SECTION_IDS', () => {
    appSettings[DASHBOARD_SECTION_ORDER_KEY] = JSON.stringify([
      'goals',
      'trackers',
      'need_vs_want',
      'month_summary',
    ])
    expect(getDashboardSectionOrder()).toEqual([
      'trackers',
      'month_summary',
      'insights',
      'upcoming',
      'net_worth',
    ])
  })

  it('setDashboardSectionOrder round-trips through getDashboardSectionOrder', () => {
    setDashboardSectionOrder([...DASHBOARD_SECTION_IDS].reverse())
    expect(getDashboardSectionOrder()).toEqual(
      [...DASHBOARD_SECTION_IDS].reverse()
    )
  })
})

describe('getDashboardSectionSizes', () => {
  it('returns full defaults when nothing is stored', () => {
    expect(getDashboardSectionSizes()).toEqual(DEFAULT_SECTION_SIZES)
  })

  it('merges valid stored values onto defaults, keeping default for missing/invalid keys', () => {
    appSettings[DASHBOARD_SECTION_SIZES_KEY] = JSON.stringify({
      trackers: 'large',
      net_worth: 'not-a-size',
    })
    expect(getDashboardSectionSizes()).toEqual({
      ...DEFAULT_SECTION_SIZES,
      trackers: 'large',
    })
  })

  it('returns full defaults on invalid JSON', () => {
    appSettings[DASHBOARD_SECTION_SIZES_KEY] = 'not json'
    expect(getDashboardSectionSizes()).toEqual(DEFAULT_SECTION_SIZES)
  })
})

describe('getDashboardSectionVisibility', () => {
  it('returns full defaults when nothing is stored', () => {
    expect(getDashboardSectionVisibility()).toEqual(DEFAULT_SECTION_VISIBILITY)
  })

  it('merges valid stored values onto defaults, keeping default for missing/invalid keys', () => {
    appSettings[DASHBOARD_SECTION_VISIBILITY_KEY] = JSON.stringify({
      trackers: false,
      net_worth: 'yes',
    })
    expect(getDashboardSectionVisibility()).toEqual({
      ...DEFAULT_SECTION_VISIBILITY,
      trackers: false,
    })
  })
})
