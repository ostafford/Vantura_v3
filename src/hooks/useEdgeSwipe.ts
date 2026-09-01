import { useEffect } from 'react'
import { uiStore } from '@/stores/uiStore'
import {
  EDGE_SWIPE,
  classifySwipe,
  shouldLockScrollDuringOpenSwipe,
  type EdgeSwipeMode,
} from '@/lib/edgeSwipe'

/**
 * Attaches touch-swipe listeners to the document so that:
 *   - a rightward swipe starting within EDGE_SWIPE.edgeZonePx of the left edge
 *     opens the mobile sidebar
 *   - a leftward swipe anywhere closes it
 *
 * Should only be enabled when the mobile overlay sidebar is in use (isMobile === true).
 * Calls e.preventDefault() on touchmove for detected open-swipes so that the browser
 * back-navigation gesture and any scroll are suppressed while the swipe is in progress.
 *
 * All gesture arithmetic lives in `@/lib/edgeSwipe`; this hook only captures the
 * touch start point / mode and dispatches the result to `uiStore`.
 */
export function useEdgeSwipe(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    let startX = 0
    let startY = 0
    let mode: EdgeSwipeMode = null

    function handleTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      const isOpen = uiStore.getState().sidebarMobileOpen
      if (!isOpen && startX <= EDGE_SWIPE.edgeZonePx) {
        mode = 'open'
      } else if (isOpen) {
        mode = 'close'
      } else {
        mode = null
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (mode !== 'open') return
      const dx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (shouldLockScrollDuringOpenSwipe({ dx, dy })) {
        e.preventDefault()
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!mode) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      const result = classifySwipe({ mode, dx, dy })
      if (result === 'open-triggered') {
        uiStore.getState().setSidebarMobileOpen(true)
      } else if (result === 'close-triggered') {
        uiStore.getState().setSidebarMobileOpen(false)
      }
      mode = null
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [enabled])
}
