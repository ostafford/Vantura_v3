import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import { uiStore } from '@/stores/uiStore'
import { persistErrorStore } from '@/stores/persistErrorStore'
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './Sidebar'
import { Navbar } from './Navbar'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY, MOBILE_BREAKPOINT_PX } from '@/lib/constants'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'
import {
  hasNewVersion,
  markVersionSeen,
  getLastSeenVersion,
} from '@/lib/appVersion'
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner'
import { WhatsNewModal } from '@/components/WhatsNewModal'
import { NotificationDrawer } from '@/components/NotificationDrawer'

const VIEWPORT_AUTO_COLLAPSE_PX = 1280
const SIDEBAR_COLLAPSED_KEY = 'vantura_sidebar_collapsed'

export function Layout() {
  const sidebarCollapsed = useStore(uiStore, (s) => s.sidebarCollapsed)
  const sidebarMobileOpen = useStore(uiStore, (s) => s.sidebarMobileOpen)
  const setSidebarMobileOpen = useStore(uiStore, (s) => s.setSidebarMobileOpen)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const location = useLocation()
  const widthRef = useRef(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  )

  const { updateReady, applyUpdate } = usePwaUpdate()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(() => hasNewVersion())

  // On first ever load (no version stored), silently record the current version
  // so the next update can be detected.
  useEffect(() => {
    if (getLastSeenVersion() === null) {
      markVersionSeen()
    }
  }, [])

  const sidebarWidth = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_WIDTH

  useEffect(() => {
    const w =
      typeof window !== 'undefined'
        ? window.innerWidth
        : VIEWPORT_AUTO_COLLAPSE_PX
    if (w <= MOBILE_BREAKPOINT_PX) return

    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored !== null) {
      uiStore.getState().setSidebarCollapsed(stored === '1')
    } else {
      uiStore.getState().setSidebarCollapsed(w < VIEWPORT_AUTO_COLLAPSE_PX)
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      if (w > MOBILE_BREAKPOINT_PX) {
        const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
        if (stored !== null) {
          uiStore.getState().setSidebarCollapsed(stored === '1')
        } else {
          uiStore.getState().setSidebarCollapsed(w < VIEWPORT_AUTO_COLLAPSE_PX)
        }
      }

      widthRef.current = w
      if (window.matchMedia(MOBILE_MEDIA_QUERY).matches === false) {
        uiStore.getState().setSidebarMobileOpen(false)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname])

  useEffect(() => {
    if (!isMobile) return
    setSidebarMobileOpen(false)
  }, [isMobile, location.pathname, setSidebarMobileOpen])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  const persistError = useStore(persistErrorStore, (s) => s.message)
  const setPersistError = useStore(persistErrorStore, (s) => s.setPersistError)

  const contentMarginLeft = isMobile ? 0 : sidebarWidth

  return (
    <div className="container-scroller">
      {isMobile && sidebarMobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={!isMobile && sidebarCollapsed}
        overlay={isMobile}
        mobileOpen={sidebarMobileOpen}
      />
      <Navbar
        sidebarCollapsed={sidebarCollapsed}
        isMobile={isMobile}
        sidebarMobileOpen={sidebarMobileOpen}
      />
      <div
        className="page-body-wrapper"
        style={{ marginLeft: contentMarginLeft }}
      >
        <main
          className="content-wrapper"
          style={{ minHeight: 'calc(100vh - 70px)' }}
        >
          {persistError && (
            <div
              className="d-flex align-items-center justify-content-between px-3 py-2 small mb-3 rounded"
              style={{
                backgroundColor: 'var(--vantura-surface)',
                border: '1px solid var(--vantura-text-secondary)',
              }}
              role="alert"
            >
              <span>{persistError}</span>
              <button
                type="button"
                className="btn-close btn-close-sm"
                aria-label="Dismiss"
                onClick={() => setPersistError(null)}
              />
            </div>
          )}
          <Outlet />
        </main>
      </div>
      {updateReady && !bannerDismissed && (
        <PwaUpdateBanner
          onReload={applyUpdate}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}
      <WhatsNewModal
        show={showWhatsNew}
        onClose={() => setShowWhatsNew(false)}
      />
      <NotificationDrawer />
    </div>
  )
}
