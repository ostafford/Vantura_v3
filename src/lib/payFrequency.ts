/**
 * Pay frequency: how often the pay amount lands. Stored in app_settings as
 * `payday_frequency`, beside `pay_amount_cents`. Turns the pay amount into
 * monthly Income (`getMonthlyIncomeCents`); there is no payday date (#195).
 */

export type PayFrequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY'

/** Every Pay frequency, in the order the pickers list them. */
export const PAY_FREQUENCIES: readonly PayFrequency[] = [
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
]

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
}

export function isPayFrequency(value: unknown): value is PayFrequency {
  return (
    typeof value === 'string' &&
    (PAY_FREQUENCIES as readonly string[]).includes(value)
  )
}
