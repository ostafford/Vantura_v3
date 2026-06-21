import { createStore } from 'zustand/vanilla'
import { getUnreadCount } from '@/lib/notifications'

type NotificationStore = {
  unreadCount: number
  drawerOpen: boolean
  refreshUnreadCount: () => void
  openDrawer: () => void
  closeDrawer: () => void
}

export const notificationStore = createStore<NotificationStore>((set) => ({
  unreadCount: 0,
  drawerOpen: false,

  refreshUnreadCount() {
    set({ unreadCount: getUnreadCount() })
  },

  openDrawer() {
    set({ drawerOpen: true })
  },

  closeDrawer() {
    set({ drawerOpen: false })
  },
}))
