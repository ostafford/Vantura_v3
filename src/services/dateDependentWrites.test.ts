/**
 * #242: boot's date-dependent writes run the Month-end plan freeze first, so
 * a finished month is frozen before the tracker roll-forward, sync or
 * anything else writes; and a freeze that throws never blocks the rest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[] = []
const freeze = vi.fn(() => {
  calls.push('freeze')
  return []
})
const recalc = vi.fn(() => {
  calls.push('recalculateTrackers')
})

vi.mock('@/services/monthEndPlan', () => ({ freezeMonthEndPlans: freeze }))
vi.mock('@/services/sync', () => ({ recalculateTrackers: recalc }))

const { runDateDependentWrites } = await import('./dateDependentWrites')

beforeEach(() => {
  calls.length = 0
  freeze.mockClear()
  recalc.mockClear()
})

describe('runDateDependentWrites', () => {
  it('freezes finished months before rolling tracker periods forward', () => {
    runDateDependentWrites()
    expect(calls).toEqual(['freeze', 'recalculateTrackers'])
  })

  it('still rolls trackers forward when the freeze throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    freeze.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    runDateDependentWrites()
    expect(recalc).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
