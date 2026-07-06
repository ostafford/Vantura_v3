/**
 * Merchant -> category rules for imported credit-card statement rows. Up's
 * own categories remain the source of truth (category_id references the
 * existing `categories` table synced from Up) — a rule just remembers which
 * category a merchant keyword maps to so future statement imports can
 * auto-categorize without the user repeating themselves.
 */

import { getDb, schedulePersist } from '@/db'

export interface MerchantCategoryRuleRow {
  id: number
  match_text: string
  category_id: string
  created_at: string
  last_matched_at: string | null
}

function parseRow(row: unknown[]): MerchantCategoryRuleRow {
  return {
    id: row[0] as number,
    match_text: row[1] as string,
    category_id: row[2] as string,
    created_at: row[3] as string,
    last_matched_at: (row[4] as string | null) ?? null,
  }
}

const SELECT_COLS = `id, match_text, category_id, created_at, last_matched_at`

export function getMerchantCategoryRules(): MerchantCategoryRuleRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT ${SELECT_COLS} FROM merchant_category_rules ORDER BY LENGTH(match_text) DESC`
  )
  const rows: MerchantCategoryRuleRow[] = []
  while (stmt.step()) rows.push(parseRow(stmt.get()))
  stmt.free()
  return rows
}

/**
 * Case-insensitive "contains" match against a merchant description. When
 * multiple rules match, the longest match_text wins (most specific).
 * `rules` must already be sorted longest-first (getMerchantCategoryRules
 * does this) so the first hit is the right one.
 */
export function matchCategoryRule(
  description: string,
  rules: MerchantCategoryRuleRow[]
): MerchantCategoryRuleRow | null {
  const lower = description.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.match_text.toLowerCase())) return rule
  }
  return null
}

export function saveMerchantCategoryRule(
  matchText: string,
  categoryId: string
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const trimmed = matchText.trim()
  if (!trimmed) return
  const existing = db.exec(
    `SELECT id FROM merchant_category_rules WHERE LOWER(match_text) = LOWER(?)`,
    [trimmed]
  )
  const existingId = existing[0]?.values?.[0]?.[0] as number | undefined
  if (existingId != null) {
    db.run(`UPDATE merchant_category_rules SET category_id = ? WHERE id = ?`, [
      categoryId,
      existingId,
    ])
  } else {
    db.run(
      `INSERT INTO merchant_category_rules (match_text, category_id, created_at) VALUES (?, ?, ?)`,
      [trimmed, categoryId, new Date().toISOString()]
    )
  }
  schedulePersist()
}

export function touchMerchantCategoryRule(id: number): void {
  const db = getDb()
  if (!db) return
  db.run(
    `UPDATE merchant_category_rules SET last_matched_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  )
  schedulePersist()
}

export function deleteMerchantCategoryRule(id: number): void {
  const db = getDb()
  if (!db) return
  db.run(`DELETE FROM merchant_category_rules WHERE id = ?`, [id])
  schedulePersist()
}
