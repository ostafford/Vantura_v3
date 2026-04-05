/** Arithmetic mean of monthly values (cents). Empty input yields null. */
export function meanOfFiniteNumbers(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}
