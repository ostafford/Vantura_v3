import { Link, useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import { themeStore } from '@/stores/themeStore'
import { sessionStore } from '@/stores/sessionStore'
import { uiStore } from '@/stores/uiStore'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getAppSetting } from '@/db'

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
  useStore(themeStore, (s) => s.theme) // subscribe for theme re-renders
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
      badge: 'Coming soon',
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
        backgroundColor: 'var(--vantura-sidebar-bg)',
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
              <span className="brand-text">Vantura</span>
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
        >
          {showLabels ? (
            <>
              <div className="sidebar-brand-block">
                <span className="brand-text">Vantura</span>
                {isDemoMode && (
                  <span className="sidebar-demo-badge" aria-hidden>
                    DEMO
                  </span>
                )}
              </div>
              <i
                className="mdi mdi-chevron-left sidebar-brand-icon"
                aria-hidden
              />
            </>
          ) : (
            <i
              className="mdi mdi-chevron-right sidebar-brand-icon"
              aria-hidden
            />
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
          <div className="sidebar-footer-btn-wrapper">
            <ThemeToggle showLabel={showLabels} />
          </div>
        </div>
      </div>
    </nav>
  )
}

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH }
