import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAppSetting } from '@/db'
import { sidebarPinsStore, type PinnedNavItem } from './sidebarPinsStore'

vi.mock('@/db', () => ({
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
}))

const mockGet = vi.mocked(getAppSetting)

const VALID: PinnedNavItem = {
  path: '/analytics/reports',
  label: 'Reports',
  icon: 'mdi-file-chart',
}

describe('sidebarPinsStore.hydrateFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sidebarPinsStore.setState({ pins: [], hydrated: false })
  })

  it('loads a well-formed stored list', () => {
    mockGet.mockReturnValue(JSON.stringify([VALID]))
    sidebarPinsStore.getState().hydrateFromDb()
    expect(sidebarPinsStore.getState().pins).toEqual([VALID])
    expect(sidebarPinsStore.getState().hydrated).toBe(true)
  })

  it('falls back to [] when nothing is stored', () => {
    mockGet.mockReturnValue(null)
    sidebarPinsStore.getState().hydrateFromDb()
    expect(sidebarPinsStore.getState().pins).toEqual([])
  })

  it('drops only the malformed entries and keeps the valid ones', () => {
    mockGet.mockReturnValue(
      JSON.stringify([VALID, { path: '/x', label: 'X' }, { nope: true }])
    )
    sidebarPinsStore.getState().hydrateFromDb()
    expect(sidebarPinsStore.getState().pins).toEqual([VALID])
  })

  it('falls back to [] on a non-array payload', () => {
    mockGet.mockReturnValue('{"path":"/x"}')
    sidebarPinsStore.getState().hydrateFromDb()
    expect(sidebarPinsStore.getState().pins).toEqual([])
  })

  it('falls back to [] on invalid JSON', () => {
    mockGet.mockReturnValue('[not json')
    sidebarPinsStore.getState().hydrateFromDb()
    expect(sidebarPinsStore.getState().pins).toEqual([])
  })
})
