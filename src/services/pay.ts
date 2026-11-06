/**
 * Pay: the take-home Pay amount and the Pay frequency, as set in Onboarding
 * and Settings → Pay. One rule for both screens: a blank amount clears it, a
 * plain non-negative dollar amount is saved in cents (rounded to the nearest
 * cent), and anything else is refused with nothing written. Monthly Income is
 * read from these settings by `getMonthlyIncomeCents` (`budgetBuckets.ts`).
 */

import { getAppSetting, setAppSetting } from '@/db'
import { type PayFrequency, isPayFrequency } from '@/lib/payFrequency'

/** Shown by both Pay forms when `savePay` refuses the amount. */
export const INVALID_PAY_AMOUNT_MESSAGE =
  'Enter your take-home pay as an amount of $0 or more, or leave it blank.'

/** A plain dollar amount: digits, optionally a decimal point and digits. */
const AMOUNT_PATTERN = /^(\d+(\.\d*)?|\.\d+)$/

/**
 * The Pay amount field's text as cents. Blank is `{ ok: true, cents: null }`
 * (unset). Rounds half up on the decimal string itself, so `10.005` is 1001
 * cents, not the 1000 that float multiplication gives.
 */
export function parsePayAmountInput(
  text: string
): { ok: true; cents: number | null } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, cents: null }
  if (!AMOUNT_PATTERN.test(trimmed)) return { ok: false }
  const cents = Math.round(Number(`${trimmed}e2`))
  if (!Number.isSafeInteger(cents)) return { ok: false }
  return { ok: true, cents }
}

/**
 * Saves the Pay frequency and amount. Returns false, writing nothing, when
 * the amount text is invalid (see `parsePayAmountInput`).
 */
export function savePay(frequency: PayFrequency, amountText: string): boolean {
  const amount = parsePayAmountInput(amountText)
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
