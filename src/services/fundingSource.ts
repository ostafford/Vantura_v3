/**
 * Funding-source matching: which account actually paid a Regular, inferred
 * from its most recent matched settled debit (docs/adr/0019). Shared by the
 * notification checks (bill-settled clearing, liability-repayment prompts,
 * `src/services/notificationChecks.ts`) and the Essentials-era Reserved
 * formula branch — the funding-source predicate must agree everywhere on
 * what counts as "paid" and by which account.
 */

import type { Database } from 'sql.js'

export interface SettledDebitMatch {
  transactionId: string
  accountId: string
  settledDate: string
}

/**
 * The most recent settled, non-transfer debit matching `rawText` (a
 * `raw_text` fingerprint), optionally restricted to on-or-after
 * `windowStartStr` (`YYYY-MM-DD`), or null if none. A fingerprint can match
 * more than one settlement (e.g. a bill paid, then a refund and re-charge,
 * or simply many past cycles) — "most recent" (by settled/created date) is
 * the one whose account counts as the funding source.
 *
 * Omit `windowStartStr` when the question is "which account currently pays
 * this?" rather than "did this specific cycle settle?" (the latter is what
 * the notification checks below use a window for).
 */
export function findMatchingSettledDebit(
  db: Database,
  rawText: string,
  windowStartStr?: string
): SettledDebitMatch | null {
  const windowClause = windowStartStr
    ? `AND substr(COALESCE(settled_at, created_at), 1, 10) >= ?`
    : ''
  const params = windowStartStr ? [rawText, windowStartStr] : [rawText]
  const res = db.exec(
    `SELECT id, account_id, substr(COALESCE(settled_at, created_at), 1, 10)
     FROM transactions
     WHERE raw_text = ?
       AND amount < 0
       AND transfer_account_id IS NULL
       ${windowClause}
     ORDER BY COALESCE(settled_at, created_at) DESC
     LIMIT 1`,
    params
  )
  const row = res[0]?.values?.[0]
  if (!row) return null
  return {
    transactionId: String(row[0]),
    accountId: String(row[1]),
    settledDate: String(row[2]),
  }
}

/** True when a matching settled debit exists — see `findMatchingSettledDebit`. */
export function hasMatchingSettledDebit(
  db: Database,
  rawText: string,
  windowStartStr?: string
): boolean {
  return findMatchingSettledDebit(db, rawText, windowStartStr) !== null
}

/**
 * The funding-source account id for a Regular: the account of its most
 * recent matched settled debit (any time, if `windowStartStr` is omitted).
 * Null means funding source is unknown (no matching payment has settled
 * yet) — per docs/adr/0019, callers must treat unknown as transactional,
 * never assume Essentials.
 */
export function getFundingSourceAccountId(
  db: Database,
  rawText: string,
  windowStartStr?: string
): string | null {
  return (
    findMatchingSettledDebit(db, rawText, windowStartStr)?.accountId ?? null
  )
}
