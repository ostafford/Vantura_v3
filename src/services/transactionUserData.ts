/**
 * Local-only user data for transactions: notes, category override, and
 * transfer-account override. Sync does not touch this; upstream category is
 * preserved in transactions table.
 */

import { getDb, schedulePersist } from '@/db'
import { getAccountById, CREDIT_CARD_IMPORT_TYPE } from '@/services/accounts'
import { writeNetWorthSnapshot } from '@/services/netWorth'

export interface TransactionUserRow {
  transaction_id: string
  user_notes: string | null
  user_category_override: string | null
  user_transfer_account_override: string | null
}

export function getTransactionUserData(
  transactionId: string
): TransactionUserRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT transaction_id, user_notes, user_category_override, user_transfer_account_override
     FROM transaction_user_data WHERE transaction_id = ?`
  )
  stmt.bind([transactionId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [
    string,
    string | null,
    string | null,
    string | null,
  ]
  stmt.free()
  return {
    transaction_id: row[0],
    user_notes: row[1],
    user_category_override: row[2],
    user_transfer_account_override: row[3],
  }
}

/** Batch load user data for many transactions. Returns map transaction_id -> row. */
export function getTransactionUserDataMap(
  transactionIds: string[]
): Record<string, TransactionUserRow> {
  const db = getDb()
  const out: Record<string, TransactionUserRow> = {}
  if (!db || transactionIds.length === 0) return out
  const placeholders = transactionIds.map(() => '?').join(',')
  const stmt = db.prepare(
    `SELECT transaction_id, user_notes, user_category_override, user_transfer_account_override
     FROM transaction_user_data WHERE transaction_id IN (${placeholders})`
  )
  stmt.bind(transactionIds)
  while (stmt.step()) {
    const row = stmt.get() as [
      string,
      string | null,
      string | null,
      string | null,
    ]
    out[row[0]] = {
      transaction_id: row[0],
      user_notes: row[1],
      user_category_override: row[2],
      user_transfer_account_override: row[3],
    }
  }
  stmt.free()
  return out
}

export function setTransactionUserNote(
  transactionId: string,
  userNotes: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const existing = getTransactionUserData(transactionId)
  if (userNotes === null || userNotes.trim() === '') {
    if (
      existing?.user_category_override ||
      existing?.user_transfer_account_override
    ) {
      db.run(
        `UPDATE transaction_user_data SET user_notes = NULL WHERE transaction_id = ?`,
        [transactionId]
      )
    } else if (existing) {
      db.run(`DELETE FROM transaction_user_data WHERE transaction_id = ?`, [
        transactionId,
      ])
    }
  } else {
    if (existing) {
      db.run(
        `UPDATE transaction_user_data SET user_notes = ? WHERE transaction_id = ?`,
        [userNotes.trim(), transactionId]
      )
    } else {
      db.run(
        `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override) VALUES (?, ?, NULL, NULL)`,
        [transactionId, userNotes.trim()]
      )
    }
  }
  schedulePersist()
}

export function setTransactionUserCategoryOverride(
  transactionId: string,
  categoryId: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const existing = getTransactionUserData(transactionId)
  if (categoryId === null || categoryId === '') {
    if (existing?.user_notes || existing?.user_transfer_account_override) {
      db.run(
        `UPDATE transaction_user_data SET user_category_override = NULL WHERE transaction_id = ?`,
        [transactionId]
      )
    } else if (existing) {
      db.run(`DELETE FROM transaction_user_data WHERE transaction_id = ?`, [
        transactionId,
      ])
    }
  } else {
    if (existing) {
      db.run(
        `UPDATE transaction_user_data SET user_category_override = ? WHERE transaction_id = ?`,
        [categoryId, transactionId]
      )
    } else {
      db.run(
        `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override) VALUES (?, NULL, ?, NULL)`,
        [transactionId, categoryId]
      )
    }
  }
  schedulePersist()
}

function getTransactionAccountAndAmount(
  transactionId: string
): { accountId: string; amountCents: number } | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT account_id, amount FROM transactions WHERE id = ?`
  )
  stmt.bind([transactionId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [string, number]
  stmt.free()
  return { accountId: row[0], amountCents: row[1] }
}

/**
 * Applies `deltaCents` to a credit-card-import account's stored balance —
 * used when a transfer-override link is created/removed/repointed, so the
 * card's displayed balance reflects a linked payoff immediately rather than
 * only updating on the next statement import. No-op for any other account
 * type (e.g. if accountId is null, or somehow points at an Up-synced account).
 */
function adjustCreditCardBalance(
  accountId: string | null,
  deltaCents: number
): void {
  if (!accountId || deltaCents === 0) return
  const db = getDb()
  if (!db) return
  const account = getAccountById(accountId)
  if (!account || account.account_type !== CREDIT_CARD_IMPORT_TYPE) return
  db.run(
    `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [deltaCents, new Date().toISOString(), accountId]
  )
}

/**
 * Links (or unlinks, when accountId is null) a transaction as a payment
 * against a manually-created account (e.g. a credit-card-import account).
 * This is the transfer exclusion mechanism for accounts Up's API doesn't
 * know about — see spend-aggregation call sites that check
 * `user_transfer_account_override IS NULL` alongside `transfer_account_id`.
 *
 * Also adjusts the target credit card's stored balance by the payoff amount
 * (the Up-side transaction's amount is negative for money leaving that
 * account; its absolute value is what reduces the card's debt), reversing the
 * adjustment on the previous target if the link is being removed or
 * repointed. Refuses a self-referential link (linking a transaction to the
 * very account it already belongs to).
 */
export function setTransactionTransferOverride(
  transactionId: string,
  accountId: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  const txInfo = getTransactionAccountAndAmount(transactionId)
  if (accountId != null && txInfo?.accountId === accountId) return

  const existing = getTransactionUserData(transactionId)
  const previousAccountId = existing?.user_transfer_account_override ?? null

  if (accountId === null) {
    if (existing?.user_notes || existing?.user_category_override) {
      db.run(
        `UPDATE transaction_user_data SET user_transfer_account_override = NULL WHERE transaction_id = ?`,
        [transactionId]
      )
    } else if (existing) {
      db.run(`DELETE FROM transaction_user_data WHERE transaction_id = ?`, [
        transactionId,
      ])
    }
  } else {
    if (existing) {
      db.run(
        `UPDATE transaction_user_data SET user_transfer_account_override = ? WHERE transaction_id = ?`,
        [accountId, transactionId]
      )
    } else {
      db.run(
        `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override) VALUES (?, NULL, NULL, ?)`,
        [transactionId, accountId]
      )
    }
  }

  if (previousAccountId !== accountId && txInfo) {
    const payoffCents = -txInfo.amountCents
    adjustCreditCardBalance(previousAccountId, -payoffCents)
    adjustCreditCardBalance(accountId, payoffCents)
    // A linked/unlinked payoff changes a credit card's balance outside the
    // normal Up sync flow — refresh the Net Worth history so the trend chart
    // reflects it immediately rather than waiting for the next sync.
    writeNetWorthSnapshot()
  }

  schedulePersist()
}
