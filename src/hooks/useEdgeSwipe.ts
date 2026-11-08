import { useEffect } from 'react'
import { uiStore } from '@/stores/uiStore'
import {
  EDGE_SWIPE,
  backdropOpacity,
  dragPosition,
  recognizeDrag,
  releaseTarget,
  type EdgeSwipeMode,
} from '@/lib/edgeSwipe'

/** Release velocity is measured over the end of the drag, not all of it. */
const VELOCITY_WINDOW_MS = 100
/** After release, drop the inline drag styles once the CSS slide has ended. */
const RELEASE_SETTLE_MS = 400

/**
 * The mobile drawer follows the finger. A drag that starts within
 * EDGE_SWIPE.edgeZonePx of the left edge opens it; a drag anywhere while it's
 * open closes it. The drawer and backdrop track the finger 1:1 (no React
 * render per frame), and on release the drawer settles open or closed by
 * where the flick was heading (`releaseTarget`), sliding there on its CSS
 * transition from wherever the finger left it.
 *
 * The non-passive touchmove listener exists only for the length of a
 * candidate gesture, so ordinary scrolling elsewhere never waits on JS.
 *
 * Enable only while the mobile overlay drawer is in use (isMobile === true).
 * All decisions and arithmetic live in `@/lib/edgeSwipe`.
 */
export function useEdgeSwipe(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    let mode: EdgeSwipeMode = null
    let startX = 0
    let startY = 0
    let dragging = false
    let from: number | undefined
    let lastDx = 0
    let samples: { x: number; t: number }[] = []
    let drawer: HTMLElement | null = null
    let backdrop: HTMLElement | null = null
    // The drawer's transition is set inline by React; restore it, never wipe it.
    let drawerTransition = ''
    let settleTimer: number | undefined

    function endGesture() {
      mode = null
      dragging = false
      drawer = null
      backdrop = null
      document.removeEventListener('touchmove', handleTouchMove)
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length > 1) return
      const t = e.touches[0]
      const isOpen = uiStore.getState().sidebarMobileOpen
      mode =
        !isOpen && t.clientX <= EDGE_SWIPE.edgeZonePx
          ? 'open'
          : isOpen
            ? 'close'
            : null
      if (!mode) return
      startX = t.clientX
      startY = t.clientY
      dragging = false
      lastDx = 0
      samples = [{ x: t.clientX, t: e.timeStamp }]
      document.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      })
    }

    function handleTouchMove(e: TouchEvent) {
      if (!mode) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)

      if (!dragging) {
        const intent = recognizeDrag({ dx, dy })
        if (intent === 'pending') return
        if (intent === 'scroll') return endGesture()
        drawer = document.querySelector<HTMLElement>('.sidebar.sidebar-overlay')
        backdrop = document.querySelector<HTMLElement>('.sidebar-backdrop')
        if (!drawer || !backdrop) return endGesture()
        window.clearTimeout(settleTimer)
        // Pick the drawer up where it visibly is (even mid-slide), so the
        // first tracked frame doesn't jump.
        const live = new DOMMatrixReadOnly(getComputedStyle(drawer).transform)
          .m41
        from = live - dx
        drawerTransition = drawer.style.transition
        drawer.style.transition = 'none'
        backdrop.style.transition = 'none'
        backdrop.style.visibility = 'visible'
        dragging = true
      }

      e.preventDefault()
      lastDx = dx
      samples.push({ x: t.clientX, t: e.timeStamp })
      while (
        samples.length > 2 &&
        e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS
      ) {
        samples.shift()
      }
      const x = dragPosition({ mode, dx, from })
      drawer!.style.transform = `translateX(${x}px)`
      backdrop!.style.opacity = String(backdropOpacity(x))
    }

    function handleTouchEnd() {
      if (dragging && mode && drawer && backdrop) {
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = last.t - first.t
        const velocity = dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0
        const x = dragPosition({ mode, dx: lastDx, from })
        const open = releaseTarget({ x, velocity }) === 'open'

        // Hand back to CSS: the restored transition runs from the live
        // position to the target, while React catches the class up.
        drawer.style.transition = drawerTransition
        backdrop.style.transition = ''
        drawer.style.transform = open ? 'translateX(0px)' : 'translateX(-100%)'
        backdrop.style.opacity = open ? '1' : '0'
        uiStore.getState().setSidebarMobileOpen(open)

        // Then drop the inline values; the class now says the same thing.
        const d = drawer
        const b = backdrop
        settleTimer = window.setTimeout(() => {
          d.style.transform = ''
          b.style.opacity = ''
          b.style.visibility = ''
        }, RELEASE_SETTLE_MS)
      }
      endGesture()
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      window.clearTimeout(settleTimer)
      endGesture()
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [enabled])
}
