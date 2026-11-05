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
  { path: '/analytics/savers', label: 'Savers', icon: 'mdi-piggy-bank' },
  {
    path: '/analytics/budget',
    label: 'Budget Plan',
    icon: 'mdi-wallet-outline',
  },
]

interface SidebarPinsState {
  pins: PinnedNavItem[]
  hydrated: boolean
  toggle: (item: PinnedNavItem) => void
  hydrateFromDb: () => void
}

const PINS_KEY = 'sidebar_pins'

const PINNABLE_PATHS = new Set(PINNABLE_ANALYTICS_PAGES.map((p) => p.path))

function isPinnedNavItem(value: unknown): value is PinnedNavItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).path === 'string' &&
    typeof (value as Record<string, unknown>).label === 'string' &&
    typeof (value as Record<string, unknown>).icon === 'string'
  )
}

function loadPins(): PinnedNavItem[] {
  return loadValidatedSetting(
    PINS_KEY,
    (raw) => {
      const parsed = JSON.parse(raw) as unknown
      // Keep the valid entries and drop only the malformed ones — a single
      // bad pin (e.g. from a future required field) must not wipe the list.
      // A pin for a page that can no longer be pinned (a cut page, #205) is
      // dropped too, so it never renders as a dead link.
      return Array.isArray(parsed)
        ? parsed.filter(
            (p): p is PinnedNavItem =>
              isPinnedNavItem(p) && PINNABLE_PATHS.has(p.path)
          )
        : null
    },
    []
  )
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
