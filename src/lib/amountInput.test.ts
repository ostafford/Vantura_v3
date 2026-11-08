import { describe, expect, it } from 'vitest'
import { centsToAmountInput, parseAmountInput } from './amountInput'

describe('parseAmountInput', () => {
  it('reads blank (or whitespace) as unset', () => {
    expect(parseAmountInput('')).toEqual({ ok: true, cents: null })
    expect(parseAmountInput('   ')).toEqual({ ok: true, cents: null })
  })

  it('reads dollars as cents, rounding half up to the nearest cent', () => {
    expect(parseAmountInput('3200')).toEqual({ ok: true, cents: 320000 })
    expect(parseAmountInput(' 1234.56 ')).toEqual({ ok: true, cents: 123456 })
    expect(parseAmountInput('12.5')).toEqual({ ok: true, cents: 1250 })
    expect(parseAmountInput('.5')).toEqual({ ok: true, cents: 50 })
    expect(parseAmountInput('5.')).toEqual({ ok: true, cents: 500 })
    expect(parseAmountInput('10.005')).toEqual({ ok: true, cents: 1001 })
    expect(parseAmountInput('12.344')).toEqual({ ok: true, cents: 1234 })
    expect(parseAmountInput('0')).toEqual({ ok: true, cents: 0 })
  })

  it('gives exact cents where float multiplication would not', () => {
    // 0.29 * 100 === 28.999999999999996 and 1.13 * 100 === 112.99999999999999
    expect(parseAmountInput('0.29')).toEqual({ ok: true, cents: 29 })
    expect(parseAmountInput('1.13')).toEqual({ ok: true, cents: 113 })
  })

  it('refuses anything that is not a plain non-negative amount', () => {
    for (const input of [
      '-5',
      '+5',
      '$12',
      'abc',
      '12abc',
      '1e3',
      'Infinity',
      '.',
      '1.2.3',
      // Ambiguous: decimal comma or thousands separator? Refused, never guessed.
      '12,50',
      '1,250',
      '1,000',
    ]) {
      expect(parseAmountInput(input), input).toEqual({ ok: false })
    }
  })

  it('handles worst-case typing and pasting', () => {
    expect(parseAmountInput('007')).toEqual({ ok: true, cents: 700 })
    expect(parseAmountInput('0.10')).toEqual({ ok: true, cents: 10 })
    for (const input of ['😀', '١٢', '１２', '12 50', '12\n5', '12.5.']) {
      expect(parseAmountInput(input), JSON.stringify(input)).toEqual({
        ok: false,
      })
    }
  })

  it('refuses an amount too large to hold as whole cents', () => {
    expect(parseAmountInput('9'.repeat(20))).toEqual({ ok: false })
  })
})

describe('centsToAmountInput', () => {
  it('shows cents as a two-decimal dollar amount', () => {
    expect(centsToAmountInput(1250)).toBe('12.50')
    expect(centsToAmountInput(29)).toBe('0.29')
    expect(centsToAmountInput(0)).toBe('0.00')
  })
})
