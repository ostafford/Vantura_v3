import { describe, expect, it } from 'vitest'
import {
  INVALID_CONFIRMED_PAY_MESSAGE,
  NO_PAY_FREQUENCY_MESSAGE,
  payFormError,
} from '@/components/budgetPlan/payForm'

describe('payFormError (#282)', () => {
  it('asks for a frequency when none is chosen', () => {
    expect(payFormError('4500', '')).toBe(NO_PAY_FREQUENCY_MESSAGE)
  })

  it.each(['', '   ', '0', '0.00', '4,500', '$4500', '-10', '1e3', 'abc'])(
    'refuses %j as an amount',
    (text) => {
      expect(payFormError(text, 'MONTHLY')).toBe(INVALID_CONFIRMED_PAY_MESSAGE)
    }
  )

  it.each(['4500', '4500.5', '3200.50', '0.01', '45.001'])(
    'accepts %j with a frequency',
    (text) => {
      expect(payFormError(text, 'FORTNIGHTLY')).toBeNull()
    }
  )
})
