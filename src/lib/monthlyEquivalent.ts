export type RecurringFrequency =
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'

export type BudgetDisplayPeriod = 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export function monthlyEquivalentMultiplier(
  frequency: RecurringFrequency | string
): number {
  switch (frequency) {
    case 'WEEKLY':
      return 52 / 12
    case 'FORTNIGHTLY':
      return 26 / 12
    case 'MONTHLY':
      return 1
    case 'QUARTERLY':
      return 1 / 3
    case 'YEARLY':
      return 1 / 12
    default:
      return 0
  }
}

export function toMonthlyEquivalentCents(
  amountCents: number,
  frequency: RecurringFrequency | string
): number {
  const mult = monthlyEquivalentMultiplier(frequency)
  return Math.round(Math.max(0, amountCents) * mult)
}

function toYearlyCents(amountCents: number, frequency: string): number {
  const safe = Math.max(0, amountCents)
  switch (frequency) {
    case 'WEEKLY':
      return Math.round(safe * 52)
    case 'FORTNIGHTLY':
      return Math.round(safe * 26)
    case 'MONTHLY':
      return Math.round(safe * 12)
    case 'QUARTERLY':
      return Math.round(safe * 4)
    case 'YEARLY':
      return Math.round(safe)
    default:
      return 0
  }
}

/**
 * Convert an amount at a given frequency to a budget display period.
 * Routes through yearly as the canonical unit for consistency.
 * Returns 0 for unknown or ONCE frequencies.
 */
export function toPeriodCents(
  amountCents: number,
  frequency: string,
  targetPeriod: BudgetDisplayPeriod
): number {
  const yearly = toYearlyCents(amountCents, frequency)
  switch (targetPeriod) {
    case 'WEEKLY':
      return Math.round(yearly / 52)
    case 'MONTHLY':
      return Math.round(yearly / 12)
    case 'YEARLY':
      return yearly
  }
}
