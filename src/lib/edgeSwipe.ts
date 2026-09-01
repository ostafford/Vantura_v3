/**
 * Pure gesture math for the mobile edge-swipe sidebar (`useEdgeSwipe`).
 * The hook is a thin DOM adapter: it captures the touch start point and the
 * mode, then defers every arithmetic decision to the functions here.
 */

/** Which sidebar action the gesture that started is a candidate for. */
export type EdgeSwipeMode = 'open' | 'close' | null

export const EDGE_SWIPE = {
  /** Touches starting within this many px of the left edge can trigger open. */
  edgeZonePx: 40,
  /** Minimum rightward travel to open. */
  openThresholdPx: 60,
  /** Minimum leftward travel to close. */
  closeThresholdPx: 60,
  /** Maximum vertical travel before the gesture is treated as a scroll. */
  maxVerticalDriftPx: 80,
  /** Minimum rightward travel before an in-progress open swipe locks scroll. */
  scrollLockMinDxPx: 8,
} as const

/**
 * Decide what a completed touch gesture does to the mobile sidebar.
 * `dx` is signed end-minus-start horizontal travel; `dy` is the absolute
 * vertical travel. `mode` is what was captured at touchstart.
 */
export function classifySwipe({
  mode,
  dx,
  dy,
}: {
  mode: EdgeSwipeMode
  dx: number
  dy: number
}): 'open-triggered' | 'close-triggered' | 'ignore' {
  if (!mode) return 'ignore'

  const isHorizontal = dy < EDGE_SWIPE.maxVerticalDriftPx && Math.abs(dx) > dy
  if (!isHorizontal) return 'ignore'

  if (mode === 'open' && dx >= EDGE_SWIPE.openThresholdPx)
    return 'open-triggered'
  if (mode === 'close' && dx <= -EDGE_SWIPE.closeThresholdPx)
    return 'close-triggered'
  return 'ignore'
}

/**
 * During an in-progress open swipe, whether we're confident enough it's a
 * horizontal drag (rather than a vertical scroll) to call `preventDefault`
 * and suppress the browser back-navigation gesture. `dy` is absolute.
 */
export function shouldLockScrollDuringOpenSwipe({
  dx,
  dy,
}: {
  dx: number
  dy: number
}): boolean {
  return dx > EDGE_SWIPE.scrollLockMinDxPx && dy < dx
}
