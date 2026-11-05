/**
 * Percentages over spending figures, which can net negative since Actual
 * spending subtracts categorised refunds (#186). A percentage of, or change
 * from, a zero or negative figure has no defined meaning, so both helpers
 * decline (return null) rather than show one (#197).
 */

/**
 * Rounded size of the change from `previous` to `current`, as a whole percent.
 * Null when either period is zero or negative.
 */
export function changePercent(
  current: number,
  previous: number
): number | null {
  if (previous <= 0 || current <= 0) return null
  return Math.round((Math.abs(current - previous) / previous) * 100)
}

/**
 * Rounded percent of a tracker's budget spent, as a whole percent. Not
 * clamped: overspending reads above 100%. Null when spend is zero or negative
 * (refunds met or exceeded purchases) or the budget isn't positive (#201).
 */
export function budgetPercent(spent: number, budget: number): number | null {
  if (spent <= 0 || budget <= 0) return null
  return Math.round((spent / budget) * 100)
}
