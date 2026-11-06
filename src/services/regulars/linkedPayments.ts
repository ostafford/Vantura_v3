/**
 * Each Regular's **Linked payments** in a calendar month (GLOSSARY: Linked
 * payment; docs/adr/0020), for the month attribution read (#186, #190).
 *
 * A Linked payment is an Actual spending **debit** whose `description` exactly
 * equals the Regular's `match_description` and whose amount is within ±20%
 * (inclusive) of the Regular's amount. A payment inside two Regulars' bands
 * links to neither. HELD and SETTLED both count, and the payment is dated by
 * its **Display date** (`created_at ?? settled_at`, local day). Refunds are
 * never Linked payments.
 */

import type { Database } from 'sql.js'
import { getDb } from '@/db'
import { calendarMonthDayBounds } from '@/lib/dateStr'
import { actualSpendingWhere } from '@/services/actualSpending'
import { displayDaySql } from '@/services/displayDay'
import { readRegulars, type Regular } from './rows'

export interface LinkedPayment {
  transactionId: string
  accountId: string
  /** Signed cents, as stored (a debit, so negative). */
  amount: number
  /** Display date's local day, `YYYY-MM-DD`. */
  displayDate: string
  status: 'HELD' | 'SETTLED'
}

/**
 * A Regular's Linked payments in the month. `linked: false` means the Regular
 * has no `match_description`, so Vantura can't know what it paid — that is
 * not the same as a linked Regular with zero payments.
 */
export type RegularLinkedPayments =
  | { regularId: number; linked: false }
  | { regularId: number; linked: true; payments: LinkedPayment[] }

/**
 * True when `debitCents` (negative) is within ±20% of the Regular's amount,
 * inclusive. Integer arithmetic (|Δ| × 5 ≤ amount) so the boundary is exact.
 */
function withinBand(debitCents: number, regularAmount: number): boolean {
  return Math.abs(Math.abs(debitCents) - regularAmount) * 5 <= regularAmount
}

/**
 * Actual spending **debits** (the shared #187 predicate plus `amount < 0`:
 * Linked payments are always debits) in `[start, end]` whose description is
 * one of `descriptions`.
 */
function readDebitsBetween(
  db: Database,
  descriptions: string[],
  start: string,
  end: string
): Array<LinkedPayment & { description: string }> {
  if (descriptions.length === 0) return []
  const placeholders = descriptions.map(() => '?').join(', ')
  const spending = actualSpendingWhere({ from: start, to: end }, 't')
  const stmt = db.prepare(
    `SELECT t.id, t.account_id, t.amount, ${displayDaySql('t')}, t.status, t.description
     FROM transactions t
     WHERE ${spending.sql}
       AND t.amount < 0
       AND t.description IN (${placeholders})
     ORDER BY ${displayDaySql('t')}, COALESCE(t.created_at, t.settled_at), t.id`
  )
  stmt.bind([...spending.params, ...descriptions])
  const out: Array<LinkedPayment & { description: string }> = []
  while (stmt.step()) {
    const r = stmt.get()
    out.push({
      transactionId: String(r[0]),
      accountId: String(r[1]),
      amount: Number(r[2]),
      displayDate: String(r[3]),
      status: r[4] as LinkedPayment['status'],
      description: String(r[5]),
    })
  }
  stmt.free()
  return out
}

/**
 * Every Regular, in id order, with its Linked payments whose Display date falls
 * in `month` (`YYYY-MM`), oldest first. Computed on every call; a deleted
 * Regular isn't listed. Empty when the DB isn't ready.
 */
export function linkedPaymentsInMonth(month: string): RegularLinkedPayments[] {
  const { first, last } = calendarMonthDayBounds(month)
  return linkedPaymentsBetween(first, last)
}

/**
 * Every Regular, in id order, with its Linked payments whose Display date falls
 * in `[start, end]` (`YYYY-MM-DD`, inclusive), oldest first. Same rule as
 * `linkedPaymentsInMonth`, over any span of days.
 */
export function linkedPaymentsBetween(
  start: string,
  end: string
): RegularLinkedPayments[] {
  const db = getDb()
  if (!db) return []
  const regulars = readRegulars(db)
  const linkable = regulars.filter(
    (r): r is Regular & { match_description: string } => !!r.match_description
  )
  const debits = readDebitsBetween(
    db,
    [...new Set(linkable.map((r) => r.match_description))],
    start,
    end
  )

  const paymentsByRegular = new Map<number, LinkedPayment[]>()
  for (const { description, ...payment } of debits) {
    const owners = linkable.filter(
      (r) =>
        r.match_description === description &&
        withinBand(payment.amount, r.amount)
    )
    // ADR 0020: a payment in two Regulars' bands links to neither.
    if (owners.length !== 1) continue
    const list = paymentsByRegular.get(owners[0].id) ?? []
    list.push(payment)
    paymentsByRegular.set(owners[0].id, list)
  }

  return regulars.map((r) =>
    r.match_description
      ? {
          regularId: r.id,
          linked: true,
          payments: paymentsByRegular.get(r.id) ?? [],
        }
      : { regularId: r.id, linked: false }
  )
}
