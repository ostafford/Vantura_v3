import { getDb, getAppSetting, schedulePersist } from '@/db'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { getHypotheticalLines } from '@/services/budgetHypotheticals'

export interface BudgetBucketRow {
  id: number
  name: string
  icon: string
  sort_order: number
  created_at: string
}

export interface BucketUpcomingItem {
  id: number
  name: string
  amount: number
  frequency: string
}

export interface BucketItemSummary {
  upcoming: BucketUpcomingItem[]
}

export function getBuckets(): BudgetBucketRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, icon, sort_order, created_at
     FROM budget_buckets ORDER BY sort_order, name`
  )
  const list: BudgetBucketRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [number, string, string, number, string]
    list.push({
      id: row[0],
      name: row[1],
      icon: row[2],
      sort_order: row[3],
      created_at: row[4],
    })
  }
  stmt.free()
  return list
}

export function getBucket(id: number): BudgetBucketRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT id, name, icon, sort_order, created_at FROM budget_buckets WHERE id = ?`
  )
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [number, string, string, number, string]
  stmt.free()
  return {
    id: row[0],
    name: row[1],
    icon: row[2],
    sort_order: row[3],
    created_at: row[4],
  }
}

export function createBucket(name: string, icon: string): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  const maxRes = db.exec(
    'SELECT COALESCE(MAX(sort_order), -1) FROM budget_buckets'
  )
  const nextOrder = ((maxRes[0]?.values?.[0]?.[0] as number) ?? -1) + 1
  db.run(
    `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES (?, ?, ?, ?)`,
    [name, icon, nextOrder, now]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  const id = (result[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function updateBucket(id: number, name: string, icon: string): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE budget_buckets SET name = ?, icon = ? WHERE id = ?`, [
    name,
    icon,
    id,
  ])
  schedulePersist()
}

export function deleteBucket(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE upcoming_charges SET bucket_id = NULL WHERE bucket_id = ?`, [
    id,
  ])
  db.run(`UPDATE trackers SET bucket_id = NULL WHERE bucket_id = ?`, [id])
  db.run(`DELETE FROM budget_hypotheticals WHERE bucket_id = ?`, [id])
  db.run(`DELETE FROM budget_transaction_anchors WHERE bucket_id = ?`, [id])
  db.run(`DELETE FROM budget_buckets WHERE id = ?`, [id])
  schedulePersist()
}

export function assignUpcomingToBucket(
  upcomingId: number,
  bucketId: number | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE upcoming_charges SET bucket_id = ? WHERE id = ?`, [
    bucketId,
    upcomingId,
  ])
  schedulePersist()
}

export function getBucketItems(bucketId: number): BucketItemSummary {
  const db = getDb()
  if (!db) return { upcoming: [] }

  const upcomingStmt = db.prepare(
    `SELECT id, name, amount, frequency
     FROM upcoming_charges WHERE bucket_id = ? ORDER BY name`
  )
  upcomingStmt.bind([bucketId])
  const upcoming: BucketUpcomingItem[] = []
  while (upcomingStmt.step()) {
    const r = upcomingStmt.get() as [number, string, number, string]
    upcoming.push({ id: r[0], name: r[1], amount: r[2], frequency: r[3] })
  }
  upcomingStmt.free()

  return { upcoming }
}

/** Current bucket_id for an upcoming charge (null = unassigned). */
export function getUpcomingBucketId(upcomingId: number): number | null {
  const db = getDb()
  if (!db) return null
  const res = db.exec(`SELECT bucket_id FROM upcoming_charges WHERE id = ?`, [
    upcomingId,
  ])
  const val = res[0]?.values?.[0]?.[0]
  return val != null ? Number(val) : null
}

export interface BucketCardSummary {
  plannedCents: number
  hypotheticalCents: number
}

export function getBucketCardSummary(
  bucketId: number,
  period: BudgetDisplayPeriod
): BucketCardSummary {
  const db = getDb()
  const { upcoming } = getBucketItems(bucketId)
  const hypotheticals = getHypotheticalLines(bucketId)
  let plannedCents = 0
  let hypotheticalCents = 0

  for (const u of upcoming) {
    if (u.frequency === 'ONCE') continue
    plannedCents += toPeriodCents(u.amount, u.frequency, period)
  }
  for (const h of hypotheticals) {
    const contrib = toPeriodCents(h.amount_cents, h.frequency, period)
    hypotheticalCents += contrib
    plannedCents += contrib
  }

  if (db) {
    const stmt = db.prepare(
      `SELECT budget_amount, reset_frequency FROM trackers WHERE bucket_id = ? AND is_active = 1`
    )
    stmt.bind([bucketId])
    while (stmt.step()) {
      const row = stmt.get() as [number, string]
      plannedCents += toPeriodCents(row[0], row[1], period)
    }
    stmt.free()
  }

  return { plannedCents, hypotheticalCents }
}

/** Total outgoing cents for a bucket in the given display period. */
export function getBucketTotalCents(
  bucketId: number,
  period: BudgetDisplayPeriod
): number {
  return getBucketCardSummary(bucketId, period).plannedCents
}

export function getUnassignedUpcoming(): BucketUpcomingItem[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency
     FROM upcoming_charges WHERE bucket_id IS NULL ORDER BY name`
  )
  const list: BucketUpcomingItem[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string, number, string]
    list.push({ id: r[0], name: r[1], amount: r[2], frequency: r[3] })
  }
  stmt.free()
  return list
}

/** Income per display period derived from pay_amount_cents + payday_frequency settings. */
export function getIncomeCents(period: BudgetDisplayPeriod): number | null {
  const db = getDb()
  if (!db) return null
  const raw = getAppSetting('pay_amount_cents')
  if (raw == null || raw === '') return null
  const perPay = parseInt(raw, 10)
  if (Number.isNaN(perPay) || perPay <= 0) return null
  const paydayFreq = getAppSetting('payday_frequency') ?? 'MONTHLY'
  return toPeriodCents(perPay, paydayFreq, period)
}
