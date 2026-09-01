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

/** The two nullable user-owned columns on transaction_user_data. */
type UserDataField = 'user_notes' | 'user_category_override'

const SIBLING_FIELD: Record<UserDataField, UserDataField> = {
  user_notes: 'user_category_override',
  user_category_override: 'user_notes',
}

/**
 * Set (or clear) one user-owned field on a transaction's row, keeping the row
 * a pure overlay: a `null` value clears the field, and the row is deleted once
 * both fields are empty so an untouched transaction has no row at all.
 * `value` must already be normalised by the caller (trimmed, `''` → `null`).
 * Field names come from the `UserDataField` union, never caller input, so the
 * interpolation into the SQL is safe.
 */
function upsertUserDataField(
  transactionId: string,
  field: UserDataField,
  value: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const existing = getTransactionUserData(transactionId)

  if (value === null) {
    if (existing?.[SIBLING_FIELD[field]]) {
      db.run(
        `UPDATE transaction_user_data SET ${field} = NULL WHERE transaction_id = ?`,
        [transactionId]
      )
    } else if (existing) {
      db.run(`DELETE FROM transaction_user_data WHERE transaction_id = ?`, [
        transactionId,
      ])
    }
  } else if (existing) {
    db.run(
      `UPDATE transaction_user_data SET ${field} = ? WHERE transaction_id = ?`,
      [value, transactionId]
    )
  } else {
    db.run(
      `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override) VALUES (?, ?, ?)`,
      [
        transactionId,
        field === 'user_notes' ? value : null,
        field === 'user_category_override' ? value : null,
      ]
    )
  }
  schedulePersist()
}

export function setTransactionUserNote(
  transactionId: string,
  userNotes: string | null
): void {
  const trimmed = userNotes?.trim() ?? ''
  upsertUserDataField(
    transactionId,
    'user_notes',
    trimmed === '' ? null : trimmed
  )
}

export function setTransactionUserCategoryOverride(
  transactionId: string,
  categoryId: string | null
): void {
  upsertUserDataField(
    transactionId,
    'user_category_override',
    categoryId === null || categoryId === '' ? null : categoryId
  )
}
