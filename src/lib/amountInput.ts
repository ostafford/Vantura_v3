/**
 * Amount fields: the one rule for turning typed dollars into cents, used by
 * every money input (Pay, Regulars, trackers, Saver goals, Transactions
 * filters). Plain digits with an optional single `.` only — no `,`, `$`, sign
 * or exponent — so an ambiguous entry like `12,50` is refused, never guessed.
 */

/** A plain dollar amount: digits, optionally a decimal point and digits. */
const AMOUNT_PATTERN = /^(\d+(\.\d*)?|\.\d+)$/

export type AmountInputResult =
  | { ok: true; cents: number | null }
  | { ok: false }

/**
 * An amount field's text as cents. Blank is `{ ok: true, cents: null }`
 * (what blank means is up to the field). Rounds half up on the decimal string
 * itself, so `10.005` is 1001 cents and `0.29` is exactly 29 — float
 * multiplication would give 1000 and 28.999999999999996.
 */
export function parseAmountInput(text: string): AmountInputResult {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, cents: null }
  if (!AMOUNT_PATTERN.test(trimmed)) return { ok: false }
  const cents = Math.round(Number(`${trimmed}e2`))
  if (!Number.isSafeInteger(cents)) return { ok: false }
  return { ok: true, cents }
}

/** Cents as the text an amount field shows: `1250` → `"12.50"`. */
export function centsToAmountInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
