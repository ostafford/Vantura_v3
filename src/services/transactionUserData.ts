/**
 * Local-only user data for transactions: notes and category override.
 * Sync does not touch this; upstream category is preserved in transactions table.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'

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
    } else {
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
    } else {
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

/** User-defined categorization rule: pattern (substring match) → category ID. */
export interface CategorizationRule {
  id: string
  pattern: string
  categoryId: string
}

const CATEGORIZATION_RULES_KEY = 'categorization_rules'

export function getCategorizationRules(): CategorizationRule[] {
  try {
    const raw = getAppSetting(CATEGORIZATION_RULES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is CategorizationRule =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as CategorizationRule).id === 'string' &&
        typeof (r as CategorizationRule).pattern === 'string' &&
        typeof (r as CategorizationRule).categoryId === 'string'
    )
  } catch {
    return []
  }
}

export function setCategorizationRules(rules: CategorizationRule[]): void {
  setAppSetting(CATEGORIZATION_RULES_KEY, JSON.stringify(rules))
}

/** Suggest category for a transaction description using user-defined rules (no AI). */
export function suggestCategoryFromRules(description: string): string | null {
  const rules = getCategorizationRules()
  const lower = description.toLowerCase()
  for (const r of rules) {
    if (r.pattern && lower.includes(r.pattern.toLowerCase()))
      return r.categoryId
  }
  return null
}

/**
 * Auto-learn a categorization rule from a user's category override.
 * If the description already matches an existing rule, update its category;
 * otherwise add a new learned rule. Skips empty descriptions.
 */
export function learnCategoryFromOverride(
  description: string,
  categoryId: string
): void {
  const pattern = description.trim()
  if (!pattern || !categoryId) return

  const rules = getCategorizationRules()
  const existing = rules.find(
    (r) => r.pattern.toLowerCase() === pattern.toLowerCase()
  )
  if (existing) {
    if (existing.categoryId !== categoryId) {
      existing.categoryId = categoryId
      setCategorizationRules(rules)
    }
    return
  }
  const rule: CategorizationRule = {
    id: `learned-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pattern,
    categoryId,
  }
  rules.push(rule)
  setCategorizationRules(rules)
}
