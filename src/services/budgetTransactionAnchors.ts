import { getDb, schedulePersist } from '@/db'

export interface BucketAnchorItem {
  id: number
  bucket_id: number
  transaction_id: string
  description_pattern: string
  frequency: string
  /** Amount from the most recent matching transaction, or the original if none yet. */
  latest_amount_cents: number
  latest_transaction_date: string | null
  created_at: string
}

export interface AnchorDebitRow {
  id: string
  description: string
  amount: number
  date: string
}

/** Most recent debit transaction matching a description pattern (case-insensitive). */
function resolveLatestAmount(
  descriptionPattern: string,
  fallbackCents: number
): { amount: number; date: string | null } {
  const db = getDb()
  if (!db) return { amount: fallbackCents, date: null }
  const stmt = db.prepare(
    `SELECT ABS(amount), COALESCE(created_at, settled_at)
     FROM transactions
     WHERE LOWER(description) = LOWER(?)
       AND amount < 0
       AND transfer_account_id IS NULL
       AND is_round_up = 0
     ORDER BY COALESCE(created_at, settled_at) DESC
     LIMIT 1`
  )
  stmt.bind([descriptionPattern])
  if (!stmt.step()) {
    stmt.free()
    return { amount: fallbackCents, date: null }
  }
  const row = stmt.get() as [number, string | null]
  stmt.free()
  return { amount: row[0] ?? fallbackCents, date: row[1] ?? null }
}

export function getBucketAnchors(bucketId: number): BucketAnchorItem[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT a.id, a.bucket_id, a.transaction_id, a.description_pattern,
            a.frequency, a.created_at, ABS(t.amount)
     FROM budget_transaction_anchors a
     JOIN transactions t ON t.id = a.transaction_id
     WHERE a.bucket_id = ?
     ORDER BY a.created_at`
  )
  stmt.bind([bucketId])
  const list: BucketAnchorItem[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      number,
      number,
      string,
      string,
      string,
      string,
      number,
    ]
    const { amount, date } = resolveLatestAmount(r[3], r[6])
    list.push({
      id: r[0],
      bucket_id: r[1],
      transaction_id: r[2],
      description_pattern: r[3],
      frequency: r[4],
      created_at: r[5],
      latest_amount_cents: amount,
      latest_transaction_date: date,
    })
  }
  stmt.free()
  return list
}

export function pinTransactionToBucket(
  transactionId: string,
  bucketId: number,
  frequency: string
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const descRes = db.exec(`SELECT description FROM transactions WHERE id = ?`, [
    transactionId,
  ])
  const description = String(descRes[0]?.values?.[0]?.[0] ?? '')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO budget_transaction_anchors
       (bucket_id, transaction_id, description_pattern, frequency, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [bucketId, transactionId, description, frequency, now]
  )
  schedulePersist()
}

export function unpinAnchor(anchorId: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM budget_transaction_anchors WHERE id = ?`, [anchorId])
  schedulePersist()
}

/** Returns existing anchor info if this transaction is already pinned anywhere. */
export function getAnchorForTransaction(
  transactionId: string
): { anchorId: number; bucketId: number; bucketName: string } | null {
  const db = getDb()
  if (!db) return null
  const res = db.exec(
    `SELECT a.id, a.bucket_id, b.name
     FROM budget_transaction_anchors a
     JOIN budget_buckets b ON b.id = a.bucket_id
     WHERE a.transaction_id = ?
     LIMIT 1`,
    [transactionId]
  )
  const row = res[0]?.values?.[0]
  if (!row) return null
  return {
    anchorId: Number(row[0]),
    bucketId: Number(row[1]),
    bucketName: String(row[2]),
  }
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
    `SELECT id, description, ABS(amount), COALESCE(created_at, settled_at)
     FROM transactions
     WHERE amount < 0
       AND transfer_account_id IS NULL
       AND is_round_up = 0
       AND description LIKE ? ESCAPE '\\'
     ORDER BY COALESCE(created_at, settled_at) DESC
     LIMIT ?`
  )
  stmt.bind([pattern, limit])
  const list: AnchorDebitRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [string, string, number, string]
    list.push({ id: r[0], description: r[1], amount: r[2], date: r[3] })
  }
  stmt.free()
  return list
}
