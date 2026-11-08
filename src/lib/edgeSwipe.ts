/**
 * Pure gesture math for the mobile edge-swipe sidebar (`useEdgeSwipe`).
 * The hook is a thin DOM adapter: it tracks the touch and writes the drawer's
 * position, and defers every decision and calculation to the functions here.
 */

import { SIDEBAR_WIDTH_PX } from '@/lib/constants'

/** Which sidebar action the gesture that started is a candidate for. */
export type EdgeSwipeMode = 'open' | 'close' | null

export const EDGE_SWIPE = {
  /** Touches starting within this many px of the left edge can trigger open. */
  edgeZonePx: 40,
  /** Maximum vertical travel before the gesture is treated as a scroll. */
  maxVerticalDriftPx: 80,
  /** Horizontal travel before a touch counts as a drawer drag (hysteresis). */
  scrollLockMinDxPx: 8,
} as const

/**
 * Soft boundary: how far the drawer moves when dragged `overshoot` px past a
 * bound. The further past, the less it follows, and it never travels the full
 * `dimension` — resistance instead of a dead stop (Apple, Designing Fluid
 * Interfaces).
 */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant: number
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  )
}

/** How hard the drawer resists being dragged past fully open (Apple's 0.55). */
const RUBBERBAND_CONSTANT = 0.55

/**
 * The drawer's x while a finger drags it: -SIDEBAR_WIDTH_PX is fully closed,
 * 0 fully open. Tracks the finger 1:1 from where the drawer was when the
 * gesture started, clamps at closed, and rubber-bands past open. `dx` is signed finger travel since touchstart.
 */
export function dragPosition({
  mode,
  dx,
  from,
}: {
  mode: 'open' | 'close'
  dx: number
  /**
   * The drawer's on-screen x when the drag began, if it was still sliding.
   * Omitted: fully closed for an open swipe, fully open for a close swipe.
   */
  from?: number
}): number {
  const start = from ?? (mode === 'open' ? -SIDEBAR_WIDTH_PX : 0)
  const x = start + dx
  if (x > 0) return rubberband(x, SIDEBAR_WIDTH_PX, RUBBERBAND_CONSTANT)
  return Math.max(x, -SIDEBAR_WIDTH_PX)
}

/** iOS scroll deceleration rate, used to project a released drawer forward. */
const DECELERATION_RATE = 0.998

/**
 * Where a drawer released at `x` moving at `velocityPxPerSec` would come to
 * rest under scroll-like deceleration (Apple's projection from Designing
 * Fluid Interfaces). Used to pick open vs closed from a flick, not just from
 * where the finger let go.
 */
export function projectEnd(x: number, velocityPxPerSec: number): number {
  return (
    x +
    ((velocityPxPerSec / 1000) * DECELERATION_RATE) / (1 - DECELERATION_RATE)
  )
}

/**
 * Whether a released drawer settles open or closed: open when its projected
 * resting point (`projectEnd`) is past halfway. A flick commits even from a
 * short drag; a slow release goes to whichever side is nearer.
 */
export function releaseTarget({
  x,
  velocity,
}: {
  x: number
  /** Finger velocity at release, px/s; positive is rightward (opening). */
  velocity: number
}): 'open' | 'closed' {
  return projectEnd(x, velocity) > -SIDEBAR_WIDTH_PX / 2 ? 'open' : 'closed'
}

/** The backdrop's opacity for a drawer at `x`: 0 closed, 1 open. */
export function backdropOpacity(x: number): number {
  return Math.min(1, Math.max(0, (x + SIDEBAR_WIDTH_PX) / SIDEBAR_WIDTH_PX))
}

/**
 * Whether a touch that may move the drawer is a drawer drag or a page scroll.
 * `dx` is signed horizontal travel since touchstart; `dy` is absolute
 * vertical travel. 'pending' until intent is clear: horizontal must pass
 * `scrollLockMinDxPx` and beat vertical; vertical travel that passes the same
 * minimum first, or ever reaches `maxVerticalDriftPx`, is a scroll.
 */
export function recognizeDrag({
  dx,
  dy,
}: {
  dx: number
  dy: number
}): 'pending' | 'drag' | 'scroll' {
  const across = Math.abs(dx)
  if (dy >= EDGE_SWIPE.maxVerticalDriftPx) return 'scroll'
  if (across > EDGE_SWIPE.scrollLockMinDxPx && dy < across) return 'drag'
  if (dy > EDGE_SWIPE.scrollLockMinDxPx && dy >= across) return 'scroll'
  return 'pending'
}
