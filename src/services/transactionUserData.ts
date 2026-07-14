/**
 * Local-only user data for transactions: notes, category override, and
 * transfer-account override. Sync does not touch this; upstream category is
 * preserved in transactions table.
 */

import { getDb, schedulePersist } from '@/db'

export interface TransactionUserRow {
  transaction_id: string
  user_notes: string | null
  user_category_override: string | null
}

export function getTransactionUserData(
  transactionId: string
): TransactionUserRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT transaction_id, user_notes, user_category_override
     FROM transaction_user_data WHERE transaction_id = ?`
  )
  stmt.bind([transactionId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [string, string | null, string | null]
  stmt.free()
  return {
    transaction_id: row[0],
    user_notes: row[1],
    user_category_override: row[2],
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
    `SELECT transaction_id, user_notes, user_category_override
     FROM transaction_user_data WHERE transaction_id IN (${placeholders})`
  )
  stmt.bind(transactionIds)
  while (stmt.step()) {
    const row = stmt.get() as [string, string | null, string | null]
    out[row[0]] = {
      transaction_id: row[0],
      user_notes: row[1],
      user_category_override: row[2],
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
    if (existing?.user_category_override) {
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
        `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override) VALUES (?, ?, NULL)`,
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
    if (existing?.user_notes) {
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
        `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override) VALUES (?, NULL, ?)`,
        [transactionId, categoryId]
      )
    }
  }
  schedulePersist()
}
