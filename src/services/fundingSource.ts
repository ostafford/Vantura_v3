/**
 * Linked payments: which synced payments belong to a Regular, and so which
 * account actually pays it (docs/adr/0020, amending docs/adr/0019). Shared by
 * the notification checks (bill-settled clearing, liability-repayment
 * prompts, `src/services/notificationChecks.ts`) and the Essentials-era
 * Reserved formula branch — the rule must agree everywhere on what counts as
 * "paid" and by which account.
 */

import type { Database } from 'sql.js'

export interface SettledDebitMatch {
  transactionId: string
  accountId: string
  settledDate: string
}

/** The fields of a Regular that decide which payments are linked to it. */
export interface LinkableRegular {
  id: number
  amount: number
  match_description: string | null
}

/** ±20% of the Regular's amount, inclusive — the band docs/adr/0016 uses. */
const LINKED_AMOUNT_TOLERANCE = 0.2

/**
 * A Regular's most recent **linked payment** (docs/adr/0020), optionally
 * restricted to on-or-after `windowStartStr` (`YYYY-MM-DD`), or null if none.
 *
 * A linked payment is a settled, non-transfer Up debit whose `description`
 * exactly equals the Regular's `match_description` and whose amount is within
 * ±20% of the Regular's amount. A payment that also falls inside another
 * Regular's band for the same description belongs to neither — ambiguity
 * resolves to "no linked payment", which callers treat as unknown (never as
 * Essentials-funded).
 *
 * Omit `windowStartStr` when the question is "which account currently pays
 * this?" rather than "did this specific cycle settle?" (the latter is what
 * the notification checks use a window for).
 */
export function findLinkedPayment(
  db: Database,
  regular: LinkableRegular,
  windowStartStr?: string
): SettledDebitMatch | null {
  if (!regular.match_description) return null
  const windowClause = windowStartStr
    ? `AND substr(COALESCE(t.settled_at, t.created_at), 1, 10) >= ?`
    : ''
  const res = db.exec(
    `SELECT t.id, t.account_id, substr(COALESCE(t.settled_at, t.created_at), 1, 10)
     FROM transactions t
     WHERE t.description = ?
       AND t.status = 'SETTLED'
       AND t.amount < 0
       AND t.transfer_account_id IS NULL
       AND t.source = 'up'
       AND ABS(ABS(t.amount) - ?) <= ? * ?
       AND NOT EXISTS (
         SELECT 1 FROM upcoming_charges other
         WHERE other.id != ?
           AND other.match_description = t.description
           AND ABS(ABS(t.amount) - other.amount) <= ? * other.amount
       )
       ${windowClause}
     ORDER BY COALESCE(t.settled_at, t.created_at) DESC
     LIMIT 1`,
    [
      regular.match_description,
      regular.amount,
      LINKED_AMOUNT_TOLERANCE,
      regular.amount,
      regular.id,
      LINKED_AMOUNT_TOLERANCE,
      ...(windowStartStr ? [windowStartStr] : []),
    ]
  )
  const row = res[0]?.values?.[0]
  if (!row) return null
  return {
    transactionId: String(row[0]),
    accountId: String(row[1]),
    settledDate: String(row[2]),
  }
}

/** True when the Regular has a linked payment — see `findLinkedPayment`. */
export function hasLinkedPayment(
  db: Database,
  regular: LinkableRegular,
  windowStartStr?: string
): boolean {
  return findLinkedPayment(db, regular, windowStartStr) !== null
}

/**
 * A Regular's **funding source**: the account of its most recent linked
 * payment, any time. Null means unknown (no linked payment) — per
 * docs/adr/0019, callers must treat unknown as transactional, never assume
 * Essentials.
 */
export function getFundingSourceAccountId(
  db: Database,
  regular: LinkableRegular
): string | null {
  return findLinkedPayment(db, regular)?.accountId ?? null
}
