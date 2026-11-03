/**
 * **Actual spending** — the one definition of "money I spent" (#186 / #187).
 *
 * This is the only place the definition is written down. Every reader that
 * sums spending (Money out, Tracker spend, the month attribution read) narrows
 * it by category set and date window through {@link actualSpendingWhere}
 * instead of restating the filters.
 *
 * A transaction counts when all of these hold:
 * - it is Up-sourced (`source = 'up'`)
 * - it is on the Spending (`TRANSACTIONAL`) account or any `SAVER`, and that
 *   account isn't joint-owned (`ownership_type = 'JOINT'` is excluded)
 * - it isn't an own-account transfer (`transfer_account_id IS NULL`)
 * - it isn't a `Round Up` row, whatever its transfer account
 * - it is `HELD` or `SETTLED`
 * - it is a debit (`amount < 0`, categorised or not), or a positive amount
 *   with an Up category (a refund, which subtracts)
 *
 * Uncategorised positives (pay, interest, money from people) are excluded.
 * Amounts are used as stored — no round-up or cashback adjustment. A
 * transaction's day is the local day of its Display date (`displayDay.ts`).
 * Totals are signed and never clamped: a window can be net-negative.
 */

import { getDb } from '@/db'
import { displayDayBetweenSql, displayDaySql } from '@/services/displayDay'

/**
 * SQL predicate for the Actual spending definition, with no bound parameters.
 * `alias` is the `transactions` table alias in the caller's query, if any.
 */
export function actualSpendingSql(alias?: string): string {
  const p = alias ? `${alias}.` : ''
  return `(${p}source = 'up'
    AND ${p}account_id IN (
      SELECT id FROM accounts
      WHERE account_type IN ('TRANSACTIONAL', 'SAVER')
        AND COALESCE(ownership_type, '') <> 'JOINT'
    )
    AND ${p}transfer_account_id IS NULL
    AND COALESCE(${p}transaction_type, '') <> 'Round Up'
    AND ${p}status IN ('HELD', 'SETTLED')
    AND (${p}amount < 0 OR (${p}amount > 0 AND ${p}category_id IS NOT NULL)))`
}

/**
 * How a reader narrows Actual spending. Omitted fields don't narrow, so a
 * window may be open at either end.
 */
export interface ActualSpendingScope {
  /** First local day of the window, `YYYY-MM-DD`, inclusive (Display date). */
  from?: string
  /** Last local day of the window, `YYYY-MM-DD`, inclusive (Display date). */
  to?: string
  /**
   * Only transactions whose Up category (`category_id`) is in this set. An
   * empty set matches nothing.
   */
  categoryIds?: readonly string[]
}

/**
 * The Actual spending predicate narrowed by `scope`, as a SQL fragment plus
 * the parameters to bind, in order. Use inside a caller's own `WHERE`.
 */
export function actualSpendingWhere(
  scope: ActualSpendingScope = {},
  alias?: string
): { sql: string; params: string[] } {
  const p = alias ? `${alias}.` : ''
  const clauses = [actualSpendingSql(alias)]
  const params: string[] = []
  if (scope.from !== undefined && scope.to !== undefined) {
    clauses.push(displayDayBetweenSql(alias))
    params.push(scope.from.slice(0, 10), scope.to.slice(0, 10))
  } else if (scope.from !== undefined) {
    clauses.push(`${displayDaySql(alias)} >= ?`)
    params.push(scope.from.slice(0, 10))
  } else if (scope.to !== undefined) {
    clauses.push(`${displayDaySql(alias)} <= ?`)
    params.push(scope.to.slice(0, 10))
  }
  if (scope.categoryIds !== undefined) {
    if (scope.categoryIds.length === 0) {
      clauses.push('0')
    } else {
      clauses.push(
        `${p}category_id IN (${scope.categoryIds.map(() => '?').join(', ')})`
      )
      params.push(...scope.categoryIds)
    }
  }
  return { sql: clauses.join(' AND '), params }
}

export interface ActualSpendingTotal {
  /**
   * Net spending in cents, positive when money went out: debits minus
   * refunds. Signed and never clamped — negative when refunds exceed debits.
   */
  spentCents: number
  /** How many debits (purchases and payments out) are in the total. */
  debitCount: number
}

/** Total Actual spending within `scope`. */
export function getActualSpending(
  scope: ActualSpendingScope = {}
): ActualSpendingTotal {
  const db = getDb()
  if (!db) return { spentCents: 0, debitCount: 0 }
  const { sql, params } = actualSpendingWhere(scope)
  const stmt = db.prepare(
    `SELECT COALESCE(-SUM(amount), 0),
       COALESCE(SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END), 0)
     FROM transactions WHERE ${sql}`
  )
  stmt.bind(params)
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return {
    spentCents: row ? Number(row[0]) : 0,
    debitCount: row ? Number(row[1]) : 0,
  }
}
