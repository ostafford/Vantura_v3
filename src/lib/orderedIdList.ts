/**
 * Reorders a stored (untrusted) id list against a set of known ids: keeps only ids that
 * are still known, drops duplicates, and appends any known id missing from storage (so a
 * newly-added id always appears even for users who saved an order before it existed).
 *
 * `fallback` (default: knownIds itself) is what's returned when `stored` isn't a valid
 * array at all — distinct from `knownIds`, which also supplies the order missing ids are
 * appended in. Callers that want a specific first-run order (rather than knownIds' own
 * order) pass both.
 */
export function reorderAgainstKnownIds<T extends string>(
  stored: unknown,
  knownIds: readonly T[],
  fallback: readonly T[] = knownIds
): T[] {
  if (!Array.isArray(stored)) return [...fallback]

  const valid: T[] = []
  const seen = new Set<T>()
  for (const id of stored) {
    if (
      typeof id === 'string' &&
      knownIds.includes(id as T) &&
      !seen.has(id as T)
    ) {
      valid.push(id as T)
      seen.add(id as T)
    }
  }
  const missing = knownIds.filter((id) => !seen.has(id))
  return [...valid, ...missing]
}
