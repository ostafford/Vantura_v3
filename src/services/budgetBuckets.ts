import { getDb, getAppSetting, schedulePersist } from '@/db'
import { monthlyEquivalentMultiplier } from '@/lib/monthlyEquivalent'
import { type PayFrequency, isPayFrequency } from '@/lib/payFrequency'

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

/**
 * Persists a new bucket display order by rewriting sort_order to match array index.
 * Unlike Trackers/Dashboard/Savers, bucket order lives on the row itself
 * (sort_order), not a separate app_settings key — there's already exactly
 * one place order is stored, so reordering just rewrites it directly.
 */
export function reorderBuckets(orderedIds: number[]): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  orderedIds.forEach((id, index) => {
    db.run(`UPDATE budget_buckets SET sort_order = ? WHERE id = ?`, [index, id])
  })
  schedulePersist()
}

export function deleteBucket(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE upcoming_charges SET bucket_id = NULL WHERE bucket_id = ?`, [
    id,
  ])
  db.run(`UPDATE trackers SET bucket_id = NULL WHERE bucket_id = ?`, [id])
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

/**
 * The stored pay — amount per pay (cents) and Pay frequency — or null when
 * either is unusable: the amount unset, non-numeric or ≤ 0, or the frequency
 * unset or not a Pay frequency (`isPayFrequency`). An unset frequency is never assumed
 * to be monthly.
 */
function readPay(): { perPay: number; frequency: PayFrequency } | null {
  const raw = getAppSetting('pay_amount_cents')
  if (raw == null || raw.trim() === '' || !/^\d+$/.test(raw.trim())) return null
  const perPay = parseInt(raw, 10)
  if (perPay <= 0) return null
  const frequency = getAppSetting('payday_frequency')
  if (!isPayFrequency(frequency)) return null
  return { perPay, frequency }
}

/**
 * Monthly Income: Pay amount × pays per month (52/12 weekly, 26/12
 * fortnightly, 1 monthly — `monthlyEquivalentMultiplier`). The same every
 * month; needs no payday date. Null (not $0) when the pay amount or Pay
 * frequency is unusable (see `readPay`).
 */
export function getMonthlyIncomeCents(): number | null {
  const pay = readPay()
  if (!pay) return null
  return Math.round(pay.perPay * monthlyEquivalentMultiplier(pay.frequency))
}
