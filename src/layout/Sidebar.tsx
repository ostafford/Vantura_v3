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
}

interface SidebarProps {
  collapsed: boolean
  /** When true, sidebar is an overlay drawer (mobile); width is full, labels shown. */
  overlay?: boolean
  /** When overlay, whether the drawer is visible (slide-in). */
  mobileOpen?: boolean
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'mdi-home' },
  { to: '/analytics', label: 'Analytics', icon: 'mdi-chart-box' },
  {
    to: '/transactions',
    label: 'Transactions',
    icon: 'mdi-credit-card-multiple',
  },
]

const UTILITY_NAV: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: 'mdi-cog' },
  { to: '/help', label: 'Help', icon: 'mdi-book-open-page-variant' },
  { to: '/changelog', label: "What's new", icon: 'mdi-rocket-launch-outline' },
]

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

  function isActive(to: string) {
    return to === '/'
      ? location.pathname === '/'
      : location.pathname === to ||
          (to !== '/' && location.pathname.startsWith(to + '/'))
  }

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
        zIndex: overlay ? 1101 : 1040,
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
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-block">
              <VanturaLogo variant="icon" height={44} />
              {isDemoMode && (
                <span className="sidebar-demo-badge" aria-hidden>
                  DEMO
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => uiStore.getState().toggleSidebar()}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i
              className={`mdi ${collapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'}`}
              aria-hidden
            />
          </button>
        </div>
      )}

      <div className="sidebar-body">
        <ul className="nav">
          {PRIMARY_NAV.map((item) => (
            <li
              key={item.to}
              className={`nav-item${isActive(item.to) ? ' active' : ''}`}
            >
              <Link
                className="nav-link"
                to={item.to}
                aria-label={!showLabels ? item.label : undefined}
                style={{ color: 'inherit' }}
              >
                <i className={`mdi ${item.icon} menu-icon`} aria-hidden />
                {showLabels && <span className="menu-title">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          {UTILITY_NAV.map((item) => (
            <Link
              key={item.to}
              className={`sidebar-footer-btn${isActive(item.to) ? ' active' : ''}`}
              to={item.to}
              aria-label={!showLabels ? item.label : undefined}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <i className={`mdi ${item.icon} menu-icon`} aria-hidden />
              {showLabels && <span className="menu-title">{item.label}</span>}
            </Link>
          ))}
          <div className="sidebar-footer-divider" />
          <button
            type="button"
            className="sidebar-footer-btn"
            data-tour="sidebar-lock"
            onClick={() => sessionStore.getState().lock()}
            aria-label={!showLabels ? 'Lock' : undefined}
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
