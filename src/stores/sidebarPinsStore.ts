import { createStore } from 'zustand/vanilla'
import { setAppSetting } from '@/db'
import { loadValidatedSetting } from '@/lib/loadValidatedSetting'

export interface PinnedNavItem {
  path: string
  label: string
  icon: string
}

export const PINNABLE_ANALYTICS_PAGES: PinnedNavItem[] = [
  { path: '/analytics', label: 'Analytics', icon: 'mdi-chart-box' },
  { path: '/analytics/trackers', label: 'Trackers', icon: 'mdi-chart-line' },
  { path: '/analytics/reports', label: 'Reports', icon: 'mdi-file-chart' },
  { path: '/analytics/savers', label: 'Savers', icon: 'mdi-piggy-bank' },
  {
    path: '/analytics/budget',
    label: 'Budget Plan',
    icon: 'mdi-wallet-outline',
  },
  {
    path: '/analytics/net-worth',
    label: 'Net Worth',
    icon: 'mdi-chart-timeline-variant',
  },
]

interface SidebarPinsState {
  pins: PinnedNavItem[]
  hydrated: boolean
  toggle: (item: PinnedNavItem) => void
  hydrateFromDb: () => void
}

const PINS_KEY = 'sidebar_pins'

function isPinnedNavItem(value: unknown): value is PinnedNavItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).path === 'string' &&
    typeof (value as Record<string, unknown>).label === 'string' &&
    typeof (value as Record<string, unknown>).icon === 'string'
  )
}

function isPinnedNavItemArray(value: unknown): value is PinnedNavItem[] {
  return Array.isArray(value) && value.every(isPinnedNavItem)
}

function loadPins(): PinnedNavItem[] {
  return loadValidatedSetting(PINS_KEY, isPinnedNavItemArray, [])
}

function savePins(pins: PinnedNavItem[]): void {
  setAppSetting(PINS_KEY, JSON.stringify(pins))
}

export const sidebarPinsStore = createStore<SidebarPinsState>((set, get) => ({
  pins: [],
  hydrated: false,
  toggle(item) {
    const current = get().pins
    const exists = current.some((p) => p.path === item.path)
    const next = exists
      ? current.filter((p) => p.path !== item.path)
      : [...current, item]
    savePins(next)
    set({ pins: next })
  },
  hydrateFromDb() {
    set({ pins: loadPins(), hydrated: true })
  },
}))
