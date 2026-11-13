/**
 * The pay form's rule on a Month without a plan (#282): why a pay can't be
 * saved, in the words the form shows. Mirrors the Confirmed pay services'
 * validation (`src/services/confirmedPay.ts`).
 */

import { parseAmountInput } from '@/lib/amountInput'
import type { PayFrequency } from '@/lib/payFrequency'

/** Shown when the amount is blank, zero, or not a plain dollar amount. */
export const INVALID_CONFIRMED_PAY_MESSAGE =
  'Enter your take-home pay as numbers only, without commas, like 3200 or 3200.50.'

/** Shown when no Pay frequency is chosen. */
export const NO_PAY_FREQUENCY_MESSAGE = 'Choose how often you’re paid.'

/** Shown when the pay is valid but the save still didn't happen. */
export const PAY_NOT_SAVED_MESSAGE =
  'Vantura couldn’t save this pay. Nothing was changed.'

/**
 * Why the pay can't be saved, or `null` when it can: the rule the Confirmed
 * pay services apply (an amount above zero through `parseAmountInput`, and a
 * Pay frequency).
 */
export function payFormError(
  amountText: string,
  frequency: PayFrequency | ''
): string | null {
  if (frequency === '') return NO_PAY_FREQUENCY_MESSAGE
  const amount = parseAmountInput(amountText)
  if (!amount.ok || amount.cents === null || amount.cents <= 0) {
    return INVALID_CONFIRMED_PAY_MESSAGE
  }
  return null
}
