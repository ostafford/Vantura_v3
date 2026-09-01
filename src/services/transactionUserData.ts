/**
 * Local-only user notes for transactions. Sync does not touch this table — the
 * upstream `transactions` row always mirrors Up Bank exactly
 * (see docs/adr/0008-transaction-user-data-is-a-separate-overlay.md).
 */

import { getDb, schedulePersist } from '@/db'

export interface TransactionUserRow {
  transaction_id: string
  user_notes: string | null
}

export function getTransactionUserData(
  transactionId: string
): TransactionUserRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT transaction_id, user_notes
     FROM transaction_user_data WHERE transaction_id = ?`
  )
  stmt.bind([transactionId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [string, string | null]
  stmt.free()
  return {
    transaction_id: row[0],
    user_notes: row[1],
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
    `SELECT transaction_id, user_notes
     FROM transaction_user_data WHERE transaction_id IN (${placeholders})`
  )
  stmt.bind(transactionIds)
  while (stmt.step()) {
    const row = stmt.get() as [string, string | null]
    out[row[0]] = {
      transaction_id: row[0],
      user_notes: row[1],
    }
  }
  stmt.free()
  return out
}

/**
 * Set (or clear) a transaction's local note, keeping the row a pure overlay:
 * an empty/`null` value deletes the row, so an untouched transaction has no row
 * at all. `user_notes` is the only user-owned column on the table.
 */
export function setTransactionUserNote(
  transactionId: string,
  userNotes: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const trimmed = userNotes?.trim() ?? ''
  const value = trimmed === '' ? null : trimmed
  const exists = getTransactionUserData(transactionId) !== null

  if (value === null) {
    if (exists) {
      db.run(`DELETE FROM transaction_user_data WHERE transaction_id = ?`, [
        transactionId,
      ])
    }
  } else if (exists) {
    db.run(
      `UPDATE transaction_user_data SET user_notes = ? WHERE transaction_id = ?`,
      [value, transactionId]
    )
  } else {
    db.run(
      `INSERT INTO transaction_user_data (transaction_id, user_notes) VALUES (?, ?)`,
      [transactionId, value]
    )
  }
  schedulePersist()
}
