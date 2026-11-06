/**
 * The local calendar date, as a signal (#164). Date-based views read
 * `today` from here, so a page left open across midnight re-reads its data
 * instead of staying on yesterday. `syncStore` does the same job for syncs.
 *
 * `watchForDayChange` keeps it current: a timer at the next local midnight,
 * plus a re-check whenever the page becomes visible again. The timer covers a
 * tab left open; the re-check covers PWAs and background tabs, where timers
 * are paused or throttled.
 */

import { createStore } from 'zustand/vanilla'
import { localDateString } from '@/lib/format'

type TodayStore = {
  /** Local `YYYY-MM-DD`. */
  today: string
}

export const todayStore = createStore<TodayStore>(() => ({
  today: localDateString(),
}))

/**
 * Re-reads the local date. When it has changed, runs `onDayChange` (writes
 * that depend on the date, e.g. rolling tracker periods forward) and then publishes
 * the new date, so views re-read after those writes. Returns whether the day
 * changed.
 */
export function checkForDayChange(onDayChange: () => void): boolean {
  const now = localDateString()
  if (now === todayStore.getState().today) return false
  onDayChange()
  todayStore.setState({ today: now })
  return true
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilNextLocalMidnight(now: Date): number {
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  )
  return midnight.getTime() - now.getTime()
}

/**
 * Starts watching for a day change; returns a function that stops it.
 * `visibility` is what fires `visibilitychange` (the document, in the app).
 */
export function watchForDayChange(
  onDayChange: () => void,
  visibility: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  function check() {
    checkForDayChange(onDayChange)
  }

  function scheduleMidnight() {
    // At least 1s, so a timer that fires a moment early can't spin.
    const delay = Math.max(1000, msUntilNextLocalMidnight(new Date()))
    timer = setTimeout(() => {
      check()
      scheduleMidnight()
    }, delay)
  }

  // The day may already have changed while nothing was watching.
  check()
  scheduleMidnight()
  visibility.addEventListener('visibilitychange', check)
  return () => {
    clearTimeout(timer)
    visibility.removeEventListener('visibilitychange', check)
  }
}
