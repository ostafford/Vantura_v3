import { getDb } from '@/db'

export interface AnchorDebitRow {
  id: string
  description: string
  raw_text: string | null
  amount: number
  date: string
  category_id: string | null
}

/** Recent debit transactions for the transaction picker, optionally filtered by search text. */
export function searchRecentDebits(
  search: string,
  limit = 40
): AnchorDebitRow[] {
  const db = getDb()
  if (!db) return []
  const pattern = search.trim() ? `%${search.trim()}%` : '%'
  const stmt = db.prepare(
    `SELECT id, description, raw_text, ABS(amount), COALESCE(settled_at, created_at), category_id
     FROM transactions
     WHERE amount < 0
       AND transfer_account_id IS NULL
       AND round_up_parent_id IS NULL
       AND (description LIKE ? ESCAPE '\\' OR raw_text LIKE ? ESCAPE '\\')
     ORDER BY substr(COALESCE(settled_at, created_at), 1, 10) DESC,
              COALESCE(settled_at, created_at) DESC
     LIMIT ?`
  )
  stmt.bind([pattern, pattern, limit])
  const list: AnchorDebitRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string | null,
      number,
      string,
      string | null,
    ]
    list.push({
      id: r[0],
      description: r[1],
      raw_text: r[2] ?? null,
      amount: r[3],
      date: r[4],
      category_id: r[5] ?? null,
    })
  }
  stmt.free()
  return list
}
