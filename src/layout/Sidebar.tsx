import { Link, useLocation } from 'react-router-dom'
import { sessionStore } from '@/stores/sessionStore'
import { uiStore } from '@/stores/uiStore'
import { getAppSetting } from '@/db'
import { VanturaLogo } from '@/components/VanturaLogo'

const SIDEBAR_WIDTH = 260
const SIDEBAR_COLLAPSED_WIDTH = 70

interface NavItem {
  to: string
  label: string
  icon: string
  short: string
  badge?: string
}

interface SidebarProps {
  collapsed: boolean
  /** When true, sidebar is an overlay drawer (mobile); width is full, labels shown. */
  overlay?: boolean
  /** When overlay, whether the drawer is visible (slide-in). */
  mobileOpen?: boolean
}

export function Sidebar({
  collapsed,
  overlay = false,
  mobileOpen = false,
}: SidebarProps) {
  const location = useLocation()
  const isDemoMode = getAppSetting('demo_mode') === '1'

  const width = overlay
    ? SIDEBAR_WIDTH
    : collapsed
      ? SIDEBAR_COLLAPSED_WIDTH
      : SIDEBAR_WIDTH
  const showLabels = overlay || !collapsed

  const navItems: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: 'mdi-home', short: 'D' },
    {
      to: '/analytics',
      label: 'Analytics',
      icon: 'mdi-chart-box',
      short: 'A',
    },
    {
      to: '/transactions',
      label: 'Transactions',
      icon: 'mdi-credit-card-multiple',
      short: 'T',
    },
    { to: '/settings', label: 'Settings', icon: 'mdi-cog', short: 'S' },
    {
      to: '/help',
      label: 'Help',
      icon: 'mdi-book-open-page-variant',
      short: 'H',
    },
    {
      to: '/changelog',
      label: "What's new",
      icon: 'mdi-rocket-launch-outline',
      short: 'N',
    },
  ]

  return (
    <nav
      data-tour="sidebar-nav"
      className={`sidebar ${!showLabels ? 'collapsed' : ''} ${overlay ? 'sidebar-overlay' : ''} ${overlay && mobileOpen ? 'sidebar-overlay-open' : ''}`}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width,
        minWidth: width,
        background: 'var(--vantura-sidebar-gradient)',
        color: 'var(--vantura-sidebar-menu-color)',
        zIndex: 1031,
        transition:
          'width 0.25s ease, background 0.25s ease, transform 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {overlay ? (
        <div className="sidebar-brand">
          {showLabels && (
            <div className="sidebar-brand-block">
              <VanturaLogo variant="icon" height={44} />
              {isDemoMode && (
                <span className="sidebar-demo-badge" aria-hidden>
                  DEMO
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="sidebar-brand sidebar-brand-btn"
          onClick={() => uiStore.getState().toggleSidebar()}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={
            showLabels
              ? { position: 'relative', justifyContent: 'center' }
              : undefined
          }
        >
          {showLabels ? (
            <>
              <div
                className="sidebar-brand-block"
                style={{ alignItems: 'center' }}
              >
                <VanturaLogo variant="icon" height={44} />
                {isDemoMode && (
                  <span className="sidebar-demo-badge" aria-hidden>
                    DEMO
                  </span>
                )}
              </div>
              <i
                className="mdi mdi-chevron-left sidebar-brand-icon"
                aria-hidden
                style={{ position: 'absolute', right: '1.25rem' }}
              />
            </>
          ) : (
            <VanturaLogo variant="icon" height={44} />
          )}
        </button>
      )}
      <div className="sidebar-body">
        <ul className="nav">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname === item.to ||
                  (item.to !== '/' &&
                    location.pathname.startsWith(item.to + '/'))
            return (
              <li
                key={item.to}
                className={`nav-item${isActive ? ' active' : ''}`}
              >
                <Link
                  className="nav-link"
                  to={item.to}
                  style={{ color: 'inherit' }}
                >
                  <span className="menu-title">
                    {showLabels ? item.label : item.short}
                  </span>
                  {showLabels && item.badge && (
                    <span className="sidebar-nav-badge" aria-hidden>
                      {item.badge}
                    </span>
                  )}
                  <i className={`mdi ${item.icon} menu-icon`} aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="sidebar-footer" data-tour="sidebar-lock">
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => sessionStore.getState().lock()}
            aria-label="Lock"
          >
            <i className="mdi mdi-lock menu-icon" aria-hidden />
            {showLabels && <span className="menu-title">Lock</span>}
          </button>
        </div>
      </div>
    </nav>
  )
}

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH }
