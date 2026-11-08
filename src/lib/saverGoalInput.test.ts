import { describe, expect, it } from 'vitest'
import { saverGoalFromInput } from './saverGoalInput'

describe('saverGoalFromInput', () => {
  it('sets the goal from a plain positive amount', () => {
    expect(saverGoalFromInput('1500')).toEqual({ kind: 'set', cents: 150000 })
    expect(saverGoalFromInput(' 1500.50 ')).toEqual({
      kind: 'set',
      cents: 150050,
    })
    expect(saverGoalFromInput('0.29')).toEqual({ kind: 'set', cents: 29 })
  })

  it('clears the goal when blank or zero, as before', () => {
    expect(saverGoalFromInput('')).toEqual({ kind: 'clear' })
    expect(saverGoalFromInput('   ')).toEqual({ kind: 'clear' })
    expect(saverGoalFromInput('0')).toEqual({ kind: 'clear' })
    expect(saverGoalFromInput('0.004')).toEqual({ kind: 'clear' })
  })

  it('refuses anything else, so a typo never clears or rewrites a goal', () => {
    // 'abc' used to clear the goal; '12,50' used to become $1,250.
    for (const input of ['abc', '12,50', '1,500', '$1500', '-50', '12abc']) {
      expect(saverGoalFromInput(input), input).toEqual({ kind: 'invalid' })
    }
  })
})
