import { describe, it, expect } from 'vitest'
import {
  EDGE_SWIPE,
  classifySwipe,
  shouldLockScrollDuringOpenSwipe,
} from './edgeSwipe'

const OPEN = EDGE_SWIPE.openThresholdPx // 60
const CLOSE = EDGE_SWIPE.closeThresholdPx // 60
const DRIFT = EDGE_SWIPE.maxVerticalDriftPx // 80

describe('classifySwipe', () => {
  it('ignores when no mode was captured at touchstart', () => {
    expect(classifySwipe({ mode: null, dx: 999, dy: 0 })).toBe('ignore')
  })

  describe('open (rightward from the left edge)', () => {
    it('triggers exactly at the open threshold', () => {
      expect(classifySwipe({ mode: 'open', dx: OPEN, dy: 0 })).toBe(
        'open-triggered'
      )
    })

    it('does not trigger one px short of the threshold', () => {
      expect(classifySwipe({ mode: 'open', dx: OPEN - 1, dy: 0 })).toBe(
        'ignore'
      )
    })

    it('triggers past the threshold', () => {
      expect(classifySwipe({ mode: 'open', dx: OPEN + 40, dy: 10 })).toBe(
        'open-triggered'
      )
    })

    it('ignores a leftward drag while in open mode', () => {
      expect(classifySwipe({ mode: 'open', dx: -OPEN - 10, dy: 0 })).toBe(
        'ignore'
      )
    })
  })

  describe('close (leftward)', () => {
    it('triggers exactly at the close threshold', () => {
      expect(classifySwipe({ mode: 'close', dx: -CLOSE, dy: 0 })).toBe(
        'close-triggered'
      )
    })

    it('does not trigger one px short of the threshold', () => {
      expect(classifySwipe({ mode: 'close', dx: -CLOSE + 1, dy: 0 })).toBe(
        'ignore'
      )
    })

    it('triggers past the threshold', () => {
      expect(classifySwipe({ mode: 'close', dx: -CLOSE - 40, dy: 10 })).toBe(
        'close-triggered'
      )
    })

    it('ignores a rightward drag while in close mode', () => {
      expect(classifySwipe({ mode: 'close', dx: CLOSE + 10, dy: 0 })).toBe(
        'ignore'
      )
    })
  })

  describe('vertical drift / scroll rejection', () => {
    it('accepts vertical travel just under the drift limit', () => {
      expect(
        classifySwipe({ mode: 'open', dx: OPEN + 30, dy: DRIFT - 1 })
      ).toBe('open-triggered')
    })

    it('rejects vertical travel at the drift limit', () => {
      expect(classifySwipe({ mode: 'open', dx: OPEN + 30, dy: DRIFT })).toBe(
        'ignore'
      )
    })

    it('rejects a diagonal where vertical travel meets or exceeds horizontal', () => {
      expect(classifySwipe({ mode: 'open', dx: OPEN, dy: OPEN })).toBe('ignore')
      expect(classifySwipe({ mode: 'open', dx: OPEN + 5, dy: OPEN + 5 })).toBe(
        'ignore'
      )
    })
  })
})

describe('shouldLockScrollDuringOpenSwipe', () => {
  it('is false until horizontal travel passes the lock minimum', () => {
    expect(
      shouldLockScrollDuringOpenSwipe({
        dx: EDGE_SWIPE.scrollLockMinDxPx,
        dy: 0,
      })
    ).toBe(false)
    expect(
      shouldLockScrollDuringOpenSwipe({
        dx: EDGE_SWIPE.scrollLockMinDxPx + 1,
        dy: 0,
      })
    ).toBe(true)
  })

  it('is false once vertical travel catches up to horizontal', () => {
    expect(shouldLockScrollDuringOpenSwipe({ dx: 20, dy: 19 })).toBe(true)
    expect(shouldLockScrollDuringOpenSwipe({ dx: 20, dy: 20 })).toBe(false)
    expect(shouldLockScrollDuringOpenSwipe({ dx: 20, dy: 30 })).toBe(false)
  })

  it('is false for a leftward drag', () => {
    expect(shouldLockScrollDuringOpenSwipe({ dx: -20, dy: 0 })).toBe(false)
  })
})
