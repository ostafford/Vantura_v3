/**
 * UI state (e.g. sidebar collapsed). Persisted in memory; not in DB per arch.
 */

import { createStore } from 'zustand/vanilla'

const SIDEBAR_COLLAPSED_KEY = 'vantura_sidebar_collapsed'

function readInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
  return stored !== null ? stored === '1' : true
}

type UIStore = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  /** On mobile: sidebar drawer open. When true, overlay sidebar is visible. */
  sidebarMobileOpen: boolean
  setSidebarMobileOpen: (open: boolean) => void
}

export const uiStore = createStore<UIStore>((set) => ({
  sidebarCollapsed: readInitialSidebarCollapsed(),
  sidebarMobileOpen: false,

  setSidebarCollapsed(collapsed: boolean) {
    set({ sidebarCollapsed: collapsed })
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
  },

  setSidebarMobileOpen(open: boolean) {
    set({ sidebarMobileOpen: open })
  },
}))
