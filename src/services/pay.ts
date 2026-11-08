/**
 * Pay: the take-home Pay amount and the Pay frequency, as set in Onboarding
 * and Settings → Pay. One rule for both screens: a blank amount clears it, a
 * plain non-negative dollar amount is saved in cents (rounded to the nearest
 * cent), and anything else is refused with nothing written. Monthly Income is
 * read from these settings by `getMonthlyIncomeCents` (`budgetBuckets.ts`).
 */

import { getAppSetting, setAppSetting } from '@/db'
import { parseAmountInput } from '@/lib/amountInput'
import { type PayFrequency, isPayFrequency } from '@/lib/payFrequency'

/** Shown by both Pay forms when `savePay` refuses the amount. */
export const INVALID_PAY_AMOUNT_MESSAGE =
  'Enter your take-home pay as an amount of $0 or more, or leave it blank.'

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
export function readPaySettings(): {
  frequency: PayFrequency | null
  amountInput: string
} {
  const freq = getAppSetting('payday_frequency')
  const raw = getAppSetting('pay_amount_cents')?.trim() ?? ''
  return {
    frequency: isPayFrequency(freq) ? freq : null,
    amountInput: /^\d+$/.test(raw) ? (parseInt(raw, 10) / 100).toFixed(2) : '',
  }
}
