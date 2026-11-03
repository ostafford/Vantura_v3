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
 * Each value's rounded share of the total, as whole percents, in input order.
 * Null when any value is negative or the total isn't positive: shares of a
 * total with negative parts read as 150% / −50%.
 */
export function sharesOfTotal(values: number[]): number[] | null {
  if (values.some((v) => v < 0)) return null
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return null
  return values.map((v) => Math.round((v / total) * 100))
}
