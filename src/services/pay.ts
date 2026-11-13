/**
 * Pay: the take-home Pay amount and the Pay frequency, as set in Onboarding
 * and Settings → Pay. One rule for both screens: a blank amount clears it, a
 * plain non-negative dollar amount is saved in cents (rounded to the nearest
 * cent), and anything else is refused with nothing written. Monthly Income is
 * read from these settings by `getMonthlyIncomeCents` (`budgetBuckets.ts`).
 */

import { getAppSetting, setAppSetting } from '@/db'
import { centsToAmountInput, parseAmountInput } from '@/lib/amountInput'
import { type PayFrequency, isPayFrequency } from '@/lib/payFrequency'

/** Shown by both Pay forms when `savePay` refuses the amount. */
export const INVALID_PAY_AMOUNT_MESSAGE =
  'Enter your take-home pay as numbers only, without commas, like 3200 or 3200.50, or leave it blank.'

/**
 * Saves the Pay frequency and amount. Returns false, writing nothing, when
 * the amount text is invalid (see `parseAmountInput`); blank clears it.
 */
export function savePay(frequency: PayFrequency, amountText: string): boolean {
  const amount = parseAmountInput(amountText)
  if (!amount.ok) return false
  setAppSetting('payday_frequency', frequency)
  setAppSetting(
    'pay_amount_cents',
    amount.cents == null ? '' : String(amount.cents)
  )
  return true
}

/**
 * The stored pay, shaped for the Pay form: the frequency (null when unset or
 * not a Pay frequency) and the amount as a dollars string ('' when unset or
 * not a whole number of cents).
 */
/** A pay as a Pay form holds it: the amount as typed and the frequency. */
export interface PayFormValues {
  /** Dollars as typed, `''` when empty. */
  amountInput: string
  /** `null` when none is chosen. */
  frequency: PayFrequency | null
}

export function readPaySettings(): PayFormValues {
  const freq = getAppSetting('payday_frequency')
  const raw = getAppSetting('pay_amount_cents')?.trim() ?? ''
  return {
    frequency: isPayFrequency(freq) ? freq : null,
    amountInput: /^\d+$/.test(raw) ? centsToAmountInput(parseInt(raw, 10)) : '',
  }
}
