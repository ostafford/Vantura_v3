import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button, Spinner } from 'react-bootstrap'
import { useStore } from 'zustand'
import { uiStore } from '@/stores/uiStore'
import { sessionStore } from '@/stores/sessionStore'
import { syncStore } from '@/stores/syncStore'
import { notificationStore } from '@/stores/notificationStore'
import { getAppSetting } from '@/db'
import { performSync } from '@/services/sync'
import { toast } from '@/stores/toastStore'
import { UpBankUnauthorizedError, SYNC_401_MESSAGE } from '@/api/upBank'
import { VanturaLogo } from '@/components/VanturaLogo'
import { isNotificationSupported } from '@/lib/notifications'

interface NavbarProps {
  sidebarCollapsed: boolean
  isMobile?: boolean
  sidebarMobileOpen?: boolean
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return 'Unknown'
  }
}

export function Navbar({
  sidebarCollapsed,
  isMobile = false,
  sidebarMobileOpen = false,
}: NavbarProps) {
  const toggleSidebar = useStore(uiStore, (s) => s.toggleSidebar)
  const setSidebarMobileOpen = useStore(uiStore, (s) => s.setSidebarMobileOpen)
  const unreadCount = useStore(notificationStore, (s) => s.unreadCount)
  const openDrawer = useStore(notificationStore, (s) => s.openDrawer)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const isDemoMode = getAppSetting('demo_mode') === '1'

  function handleNavToggle() {
    if (isMobile) {
      setSidebarMobileOpen(!sidebarMobileOpen)
    } else {
      toggleSidebar()
    }
  }

  useEffect(() => {
    setLastSync(getAppSetting('last_sync'))
  }, [syncing])

  async function handleSync() {
    const token = sessionStore.getState().getToken()
    if (!token || syncing) return
    if (isDemoMode) {
      toast.info('Demo mode – no sync.')
      return
    }
    setSyncing(true)
    syncStore.getState().setSyncing(true)
    try {
      await performSync(token, () => {})
      setLastSync(getAppSetting('last_sync'))
      syncStore.getState().syncCompleted()
      toast.success('Sync complete. Data updated.')
    } catch (err) {
      const message =
        err instanceof UpBankUnauthorizedError
          ? SYNC_401_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Sync failed. Please try again.'
      toast.error(message)
    } finally {
      setSyncing(false)
      syncStore.getState().setSyncing(false)
    }
  }

  return (
    <nav
      className={`vantura-navbar ${sidebarCollapsed && !isMobile ? 'collapsed' : ''} ${isMobile ? 'vantura-navbar-mobile' : ''}`}
    >
      <div className="navbar-brand-wrapper">
        <button
          type="button"
          className="navbar-toggler"
          onClick={handleNavToggle}
          aria-label={isMobile ? 'Open menu' : 'Toggle sidebar'}
          aria-expanded={isMobile ? sidebarMobileOpen : undefined}
        >
          <VanturaLogo variant="icon" height={36} />
        </button>
      </div>
      {sidebarCollapsed && !isMobile && (
        <Link
          to="/"
          className="navbar-collapsed-brand"
          aria-label="Go to dashboard"
        >
          <VanturaLogo variant="text" height={28} />
          {isDemoMode && <span className="navbar-demo-badge">DEMO</span>}
        </Link>
      )}
      {isMobile && !sidebarMobileOpen && (
        <Link
          to="/"
          className="navbar-mobile-brand"
          aria-label="Go to dashboard"
        >
          <VanturaLogo variant="text" height={28} />
          {isDemoMode && <span className="navbar-demo-badge">DEMO</span>}
        </Link>
      )}
      <div className="navbar-menu-wrapper">
        <div className="ms-auto d-flex flex-column align-items-end gap-1">
          <div className="d-flex align-items-center gap-2">
            {isNotificationSupported() && (
              <button
                type="button"
                className="notif-bell"
                onClick={openDrawer}
                aria-label={
                  unreadCount > 0
                    ? `Notifications — ${unreadCount} unread`
                    : 'Notifications'
                }
              >
                <i
                  className={`mdi ${unreadCount > 0 ? 'mdi-bell' : 'mdi-bell-outline'}`}
                  aria-hidden
                />
                {unreadCount > 0 && (
                  <span className="notif-bell__badge" aria-hidden>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            <Button
              className="btn-gradient-primary"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              aria-label="Sync with Up Bank"
              aria-busy={syncing}
            >
              {syncing ? (
                <>
                  <Spinner
                    animation="border"
                    size="sm"
                    className="me-1"
                    role="status"
                    aria-hidden
                  />
                  Syncing…
                </>
              ) : (
                <>
                  <i className="mdi mdi-sync me-1" aria-hidden />
                  Sync
                </>
              )}
            </Button>
          </div>
          <div className="d-none d-md-block navbar-sync-label">
            Last synced: {formatLastSync(lastSync)}
          </div>
        </div>
      </div>
    </nav>
  )
}
