import { describe, it, expect } from 'vitest'
import {
  EDGE_SWIPE,
  rubberband,
  dragPosition,
  projectEnd,
  releaseTarget,
  backdropOpacity,
  recognizeDrag,
} from './edgeSwipe'

describe('rubberband', () => {
  it('gives no offset at the boundary', () => {
    expect(rubberband(0, 260, 0.55)).toBe(0)
  })

  it('follows a worked example: 100px past a 260px drawer moves ~45.4px', () => {
    // 100 * 260 * 0.55 / (260 + 0.55 * 100) = 14300 / 315
    expect(rubberband(100, 260, 0.55)).toBeCloseTo(45.397, 3)
  })

  it('resists more the further you pull, and never reaches the drawer width', () => {
    const a = rubberband(50, 260, 0.55)
    const b = rubberband(200, 260, 0.55)
    const c = rubberband(100_000, 260, 0.55)
    expect(a).toBeLessThan(b)
    expect(b - a).toBeLessThan(150) // 150px more pull, far less extra travel
    expect(c).toBeLessThan(260)
  })
})

describe('dragPosition (drawer x: -260 closed, 0 open)', () => {
  it('opening from the edge tracks the finger 1:1 from fully closed', () => {
    expect(dragPosition({ mode: 'open', dx: 0 })).toBe(-260)
    expect(dragPosition({ mode: 'open', dx: 100 })).toBe(-160)
    expect(dragPosition({ mode: 'open', dx: 260 })).toBe(0)
  })

  it('closing tracks the finger 1:1 from fully open', () => {
    expect(dragPosition({ mode: 'close', dx: 0 })).toBe(0)
    expect(dragPosition({ mode: 'close', dx: -100 })).toBe(-100)
  })

  it('clamps at fully closed', () => {
    expect(dragPosition({ mode: 'open', dx: -50 })).toBe(-260)
    expect(dragPosition({ mode: 'close', dx: -400 })).toBe(-260)
  })

  it('starts from the live position when grabbed mid-slide', () => {
    // Drawer visibly at -90 (still sliding) when the finger lands.
    expect(dragPosition({ mode: 'close', dx: -20, from: -90 })).toBe(-110)
    expect(dragPosition({ mode: 'open', dx: 30, from: -200 })).toBe(-170)
  })

  it('rubber-bands past fully open instead of stopping dead', () => {
    // 100px past open: 14300 / 315
    expect(dragPosition({ mode: 'open', dx: 360 })).toBeCloseTo(45.397, 3)
    // 50px past open: 50 * 260 * 0.55 / (260 + 27.5) = 7150 / 287.5
    expect(dragPosition({ mode: 'close', dx: 50 })).toBeCloseTo(24.87, 2)
  })
})

describe('projectEnd (where a released drawer is heading)', () => {
  it('stays put with no velocity', () => {
    expect(projectEnd(-100, 0)).toBe(-100)
  })

  it('projects momentum forward: (v / 1000) * 0.998 / 0.002 = v * 0.499', () => {
    expect(projectEnd(-200, 1000)).toBeCloseTo(299, 6)
    expect(projectEnd(-50, -500)).toBeCloseTo(-299.5, 6)
  })
})

describe('releaseTarget (open or closed when the finger lets go)', () => {
  it('a slow release past halfway opens; short of halfway closes', () => {
    expect(releaseTarget({ x: -100, velocity: 0 })).toBe('open')
    expect(releaseTarget({ x: -200, velocity: 0 })).toBe('closed')
  })

  it('exactly halfway with no velocity stays closed', () => {
    expect(releaseTarget({ x: -130, velocity: 0 })).toBe('closed')
  })

  it('a quick flick opens even short of halfway', () => {
    // -220 + 300 * 0.499 = -70.3, past -130
    expect(releaseTarget({ x: -220, velocity: 300 })).toBe('open')
  })

  it('a quick flick back closes even past halfway', () => {
    // -50 - 400 * 0.499 = -249.6
    expect(releaseTarget({ x: -50, velocity: -400 })).toBe('closed')
  })

  it('a slow drift back from open still closes once the projection is short of halfway', () => {
    // -120 - 40 * 0.499 = -139.96
    expect(releaseTarget({ x: -120, velocity: -40 })).toBe('closed')
  })
})

describe('backdropOpacity (the scrim follows the drawer)', () => {
  it('is 0 closed, 1 open, and proportional between', () => {
    expect(backdropOpacity(-260)).toBe(0)
    expect(backdropOpacity(-130)).toBe(0.5)
    expect(backdropOpacity(0)).toBe(1)
  })

  it('stays within 0..1 while rubber-banding or clamped', () => {
    expect(backdropOpacity(40)).toBe(1)
    expect(backdropOpacity(-300)).toBe(0)
  })
})

describe('recognizeDrag (a drawer drag, or a page scroll?)', () => {
  const MIN = EDGE_SWIPE.scrollLockMinDxPx // 8
  const DRIFT_LIMIT = EDGE_SWIPE.maxVerticalDriftPx // 80

  it('waits until horizontal travel passes the minimum', () => {
    expect(recognizeDrag({ dx: MIN, dy: 0 })).toBe('pending')
    expect(recognizeDrag({ dx: MIN + 1, dy: 0 })).toBe('drag')
  })

  it('recognises a drag in either direction (opening or closing)', () => {
    expect(recognizeDrag({ dx: -(MIN + 1), dy: 0 })).toBe('drag')
  })

  it('needs horizontal travel to beat vertical', () => {
    expect(recognizeDrag({ dx: 20, dy: 19 })).toBe('drag')
    expect(recognizeDrag({ dx: 20, dy: 20 })).toBe('scroll')
    expect(recognizeDrag({ dx: 20, dy: 30 })).toBe('scroll')
  })

  it('treats clear vertical travel as a scroll before any horizontal', () => {
    expect(recognizeDrag({ dx: 0, dy: MIN })).toBe('pending')
    expect(recognizeDrag({ dx: 2, dy: MIN + 1 })).toBe('scroll')
  })

  it('treats vertical drift at the limit as a scroll whatever the horizontal', () => {
    expect(recognizeDrag({ dx: 200, dy: DRIFT_LIMIT - 1 })).toBe('drag')
    expect(recognizeDrag({ dx: 200, dy: DRIFT_LIMIT })).toBe('scroll')
  })
})
