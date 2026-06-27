import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { notificationStore } from '@/stores/notificationStore'
import {
  getNotificationHistory,
  markNotificationsRead,
  clearAllNotifications,
  dismissNotification,
  type NotificationHistoryItem,
} from '@/lib/notifications'

// ─── relative time ────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ─── type → icon/colour mapping ───────────────────────────────────────────────

const TYPE_META: Record<string, { icon: string; color: string }> = {
  bills_due: { icon: 'mdi-calendar-clock', color: 'var(--vantura-warning)' },
  tracker_overspent: {
    icon: 'mdi-alert-circle',
    color: 'var(--vantura-danger)',
  },
  tracker_pace: { icon: 'mdi-trending-up', color: 'var(--vantura-warning)' },
  spendable_low: { icon: 'mdi-wallet-outline', color: 'var(--vantura-danger)' },
  payday: { icon: 'mdi-cash-check', color: 'var(--vantura-success)' },
  possible_payday: { icon: 'mdi-cash-plus', color: 'var(--vantura-primary)' },
  large_tx: { icon: 'mdi-receipt-text-outline', color: 'var(--vantura-info)' },
  saver_milestone: {
    icon: 'mdi-piggy-bank-outline',
    color: 'var(--vantura-success)',
  },
  sync_stale: {
    icon: 'mdi-sync-alert',
    color: 'var(--vantura-text-secondary)',
  },
  whats_new: {
    icon: 'mdi-rocket-launch-outline',
    color: 'var(--vantura-primary)',
  },
}

function getMeta(type: string) {
  return (
    TYPE_META[type] ?? {
      icon: 'mdi-bell-outline',
      color: 'var(--vantura-primary)',
    }
  )
}

// ─── Sections config ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: 'alerts',
    label: 'Alerts',
    types: new Set([
      'bills_due',
      'tracker_overspent',
      'tracker_pace',
      'spendable_low',
    ]),
  },
  {
    key: 'activity',
    label: 'Activity',
    types: new Set([
      'payday',
      'possible_payday',
      'large_tx',
      'saver_milestone',
    ]),
  },
  {
    key: 'system',
    label: 'System',
    types: new Set(['sync_stale', 'whats_new']),
  },
]

// ─── Single notification row ──────────────────────────────────────────────────

interface NotifRowProps {
  item: NotificationHistoryItem
  onRead: (id: number) => void
  onClick: (item: NotificationHistoryItem) => void
  onDismiss: (id: number) => void
}

function NotifRow({ item, onRead, onClick, onDismiss }: NotifRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { icon, color } = getMeta(item.type)
  const isUnread = item.read_at === null

  useEffect(() => {
    if (!isUnread) return
    const el = rowRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timerRef.current = setTimeout(() => onRead(item.id), 400)
          observer.disconnect()
        }
      },
      { threshold: 0.8 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isUnread, item.id, onRead])

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      className={`notif-drawer__item${isUnread ? ' notif-drawer__item--unread' : ''}`}
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(item)
      }}
      aria-label={item.title}
    >
      <div className="notif-drawer__item-icon" style={{ color }} aria-hidden>
        <i className={`mdi ${icon}`} />
      </div>
      <div className="notif-drawer__item-content">
        <div className="notif-drawer__item-header">
          <span className="notif-drawer__item-title">{item.title}</span>
          <div className="notif-drawer__item-header-end">
            {item.type === 'whats_new' && (
              <span className="notif-drawer__item-badge">Update</span>
            )}
            <span className="notif-drawer__item-time">
              {relativeTime(item.created_at)}
            </span>
          </div>
        </div>
        <p className="notif-drawer__item-body">{item.body}</p>
        {item.link_label && (
          <span className="notif-drawer__item-link">{item.link_label} →</span>
        )}
      </div>
      <button
        type="button"
        className="notif-drawer__item-dismiss"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(item.id)
        }}
        aria-label="Dismiss notification"
      >
        <i className="mdi mdi-close" aria-hidden />
      </button>
      {isUnread && <div className="notif-drawer__item-dot" aria-hidden />}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  unreadCount,
}: {
  label: string
  unreadCount: number
}) {
  return (
    <div className="notif-drawer__section-header">
      <span className="notif-drawer__section-label">{label}</span>
      {unreadCount > 0 && (
        <span className="notif-drawer__section-count">{unreadCount}</span>
      )}
    </div>
  )
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function NotificationDrawer() {
  const drawerOpen = useStore(notificationStore, (s) => s.drawerOpen)
  const closeDrawer = useStore(notificationStore, (s) => s.closeDrawer)
  const refreshUnreadCount = useStore(
    notificationStore,
    (s) => s.refreshUnreadCount
  )
  const navigate = useNavigate()

  const [items, setItems] = useState<NotificationHistoryItem[]>([])

  const reload = useCallback(() => {
    setItems(getNotificationHistory())
  }, [])

  useEffect(() => {
    if (drawerOpen) reload()
  }, [drawerOpen, reload])

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('notif-drawer-open')
    } else {
      document.body.classList.remove('notif-drawer-open')
    }
    return () => document.body.classList.remove('notif-drawer-open')
  }, [drawerOpen])

  const handleRead = useCallback(
    (id: number) => {
      markNotificationsRead([id])
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, read_at: new Date().toISOString() } : i
        )
      )
      refreshUnreadCount()
    },
    [refreshUnreadCount]
  )

  const handleDismiss = useCallback(
    (id: number) => {
      dismissNotification(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      refreshUnreadCount()
    },
    [refreshUnreadCount]
  )

  const handleItemClick = useCallback(
    (item: NotificationHistoryItem) => {
      closeDrawer()
      if (item.link_path) {
        navigate(item.link_path)
      }
    },
    [closeDrawer, navigate]
  )

  const handleClearAll = useCallback(() => {
    clearAllNotifications()
    setItems([])
    refreshUnreadCount()
  }, [refreshUnreadCount])

  if (!drawerOpen) return null

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: items.filter((i) => s.types.has(i.type)),
  })).filter((s) => s.items.length > 0)

  // Items that don't belong to any defined section (future-proofing)
  const categorisedIds = new Set(SECTIONS.flatMap((s) => [...s.types]))
  const uncategorised = items.filter((i) => !categorisedIds.has(i.type))

  return (
    <>
      <div
        className="notif-drawer__backdrop"
        onClick={closeDrawer}
        aria-hidden
      />
      <aside
        className="notif-drawer"
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
      >
        <div className="notif-drawer__header">
          <span className="notif-drawer__title">Notifications</span>
          <div className="notif-drawer__header-actions">
            {items.length > 0 && (
              <button
                type="button"
                className="notif-drawer__clear"
                onClick={handleClearAll}
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              className="notif-drawer__close"
              onClick={closeDrawer}
              aria-label="Close notifications"
            >
              <i className="mdi mdi-close" aria-hidden />
            </button>
          </div>
        </div>

        <div className="notif-drawer__list">
          {items.length === 0 ? (
            <div className="notif-drawer__empty">
              <i
                className="mdi mdi-bell-check-outline notif-drawer__empty-icon"
                aria-hidden
              />
              <p>You&apos;re all caught up</p>
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <div key={section.key} className="notif-drawer__section">
                  <SectionHeader
                    label={section.label}
                    unreadCount={
                      section.items.filter((i) => i.read_at === null).length
                    }
                  />
                  {section.items.map((item) => (
                    <NotifRow
                      key={item.id}
                      item={item}
                      onRead={handleRead}
                      onClick={handleItemClick}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              ))}
              {uncategorised.map((item) => (
                <NotifRow
                  key={item.id}
                  item={item}
                  onRead={handleRead}
                  onClick={handleItemClick}
                  onDismiss={handleDismiss}
                />
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
