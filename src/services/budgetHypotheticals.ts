import { getDb, schedulePersist } from '@/db'

export interface BudgetLineRow {
  id: number
  bucket_id: number
  name: string
  amount_cents: number
  frequency: string
  is_hypothetical: boolean
  created_at: string
}

function rowToLine(
  r: [number, number, string, number, string, number, string]
): BudgetLineRow {
  return {
    id: r[0],
    bucket_id: r[1],
    name: r[2],
    amount_cents: r[3],
    frequency: r[4],
    is_hypothetical: r[5] === 1,
    created_at: r[6],
  }
}

/** All lines (variable + hypothetical) for a bucket. */
export function getBudgetLines(bucketId: number): BudgetLineRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, bucket_id, name, amount_cents, frequency, is_hypothetical, created_at
     FROM budget_hypotheticals WHERE bucket_id = ? ORDER BY is_hypothetical, name`
  )
  stmt.bind([bucketId])
  const list: BudgetLineRow[] = []
  while (stmt.step()) {
    list.push(
      rowToLine(
        stmt.get() as [number, number, string, number, string, number, string]
      )
    )
  }
  stmt.free()
  return list
}

/** Variable budget lines only (is_hypothetical = 0). */
export function getVariableLines(bucketId: number): BudgetLineRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, bucket_id, name, amount_cents, frequency, is_hypothetical, created_at
     FROM budget_hypotheticals WHERE bucket_id = ? AND is_hypothetical = 0 ORDER BY name`
  )
  stmt.bind([bucketId])
  const list: BudgetLineRow[] = []
  while (stmt.step()) {
    list.push(
      rowToLine(
        stmt.get() as [number, number, string, number, string, number, string]
      )
    )
  }
  stmt.free()
  return list
}

/** Hypothetical lines only (is_hypothetical = 1). */
export function getHypotheticalLines(bucketId: number): BudgetLineRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, bucket_id, name, amount_cents, frequency, is_hypothetical, created_at
     FROM budget_hypotheticals WHERE bucket_id = ? AND is_hypothetical = 1 ORDER BY name`
  )
  stmt.bind([bucketId])
  const list: BudgetLineRow[] = []
  while (stmt.step()) {
    list.push(
      rowToLine(
        stmt.get() as [number, number, string, number, string, number, string]
      )
    )
  }
  stmt.free()
  return list
}

export function createBudgetLine(
  bucketId: number,
  name: string,
  amountCents: number,
  frequency: string,
  isHypothetical: boolean
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO budget_hypotheticals (bucket_id, name, amount_cents, frequency, is_hypothetical, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bucketId, name, amountCents, frequency, isHypothetical ? 1 : 0, now]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  const id = (result[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function deleteBudgetLine(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM budget_hypotheticals WHERE id = ?`, [id])
  schedulePersist()
}
