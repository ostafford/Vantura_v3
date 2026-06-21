import { useEffect } from 'react'
import { uiStore } from '@/stores/uiStore'

const EDGE_ZONE_PX = 40 // touches starting within this many px of the left edge trigger open
const OPEN_THRESHOLD_PX = 60 // minimum rightward travel to open
const CLOSE_THRESHOLD_PX = 60 // minimum leftward travel to close
const MAX_VERTICAL_DRIFT_PX = 80 // maximum vertical travel before gesture is treated as a scroll

/**
 * Attaches touch-swipe listeners to the document so that:
 *   - a rightward swipe starting within EDGE_ZONE_PX of the left edge opens the mobile sidebar
 *   - a leftward swipe anywhere closes it
 *
 * Should only be enabled when the mobile overlay sidebar is in use (isMobile === true).
 * Calls e.preventDefault() on touchmove for detected open-swipes so that the browser
 * back-navigation gesture and any scroll are suppressed while the swipe is in progress.
 */
export function useEdgeSwipe(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    let startX = 0
    let startY = 0
    let mode: 'open' | 'close' | null = null

    function handleTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      const isOpen = uiStore.getState().sidebarMobileOpen
      if (!isOpen && startX <= EDGE_ZONE_PX) {
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
      // Suppress back-navigation once we're confident this is a horizontal open swipe
      if (dx > 8 && dy < dx) {
        e.preventDefault()
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!mode) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      const isHorizontal = dy < MAX_VERTICAL_DRIFT_PX && Math.abs(dx) > dy

      if (mode === 'open' && dx >= OPEN_THRESHOLD_PX && isHorizontal) {
        uiStore.getState().setSidebarMobileOpen(true)
      } else if (
        mode === 'close' &&
        dx <= -CLOSE_THRESHOLD_PX &&
        isHorizontal
      ) {
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
