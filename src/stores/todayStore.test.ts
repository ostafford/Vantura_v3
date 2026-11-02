import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  todayStore,
  checkForDayChange,
  msUntilNextLocalMidnight,
  watchForDayChange,
} from './todayStore'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 2, 23, 59, 0)) // 2 Nov 2026, 23:59 local
  todayStore.setState({ today: '2026-11-02' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('checkForDayChange', () => {
  it('does nothing while it is still the same day', () => {
    const onDayChange = vi.fn()
    expect(checkForDayChange(onDayChange)).toBe(false)
    expect(onDayChange).not.toHaveBeenCalled()
    expect(todayStore.getState().today).toBe('2026-11-02')
  })

  it('runs the day-change work before publishing the new date', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 0, 0, 5))
    const seen: string[] = []
    const onDayChange = vi.fn(() => seen.push(todayStore.getState().today))
    expect(checkForDayChange(onDayChange)).toBe(true)
    expect(seen).toEqual(['2026-11-02'])
    expect(todayStore.getState().today).toBe('2026-11-03')
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 10, 2, 23, 59, 0))).toBe(
      60_000
    )
  })

  it('rolls over the end of a month and a year', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 11, 31, 23, 0, 0))).toBe(
      3_600_000
    )
  })
})

describe('watchForDayChange', () => {
  it('publishes the new day at local midnight, once', () => {
    const onDayChange = vi.fn()
    const stop = watchForDayChange(onDayChange, new EventTarget())
    vi.advanceTimersByTime(59_000)
    expect(todayStore.getState().today).toBe('2026-11-02')
    vi.advanceTimersByTime(1_000)
    expect(todayStore.getState().today).toBe('2026-11-03')
    expect(onDayChange).toHaveBeenCalledTimes(1)
    stop()
  })

  it('keeps watching on later nights', () => {
    const onDayChange = vi.fn()
    const stop = watchForDayChange(onDayChange, new EventTarget())
    vi.advanceTimersByTime(60_000 + 24 * 3_600_000)
    expect(todayStore.getState().today).toBe('2026-11-04')
    expect(onDayChange).toHaveBeenCalledTimes(2)
    stop()
  })

  it('re-checks when the page becomes visible, e.g. a PWA resumed after midnight', () => {
    const onDayChange = vi.fn()
    const visibility = new EventTarget()
    const stop = watchForDayChange(onDayChange, visibility)
    // Time moves on without the timer firing (suspended in the background).
    vi.setSystemTime(new Date(2026, 10, 3, 8, 0, 0))
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(todayStore.getState().today).toBe('2026-11-03')
    expect(onDayChange).toHaveBeenCalledTimes(1)
    stop()
  })

  it('catches a day that changed before watching started', () => {
    todayStore.setState({ today: '2026-11-01' })
    const onDayChange = vi.fn()
    const stop = watchForDayChange(onDayChange, new EventTarget())
    expect(todayStore.getState().today).toBe('2026-11-02')
    expect(onDayChange).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops watching when stopped', () => {
    const onDayChange = vi.fn()
    const visibility = new EventTarget()
    watchForDayChange(onDayChange, visibility)()
    vi.advanceTimersByTime(2 * 24 * 3_600_000)
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(onDayChange).not.toHaveBeenCalled()
    expect(todayStore.getState().today).toBe('2026-11-02')
  })
})
