/**
 * Net worth (Up-only): sum of all Up account balances over time.
 * Snapshots are recorded after each sync.
 */

import { getDb, schedulePersist } from '@/db'

export interface NetWorthSnapshot {
  snapshot_date: string
  total_balance_cents: number
}

/**
 * Record today's total balance (sum of all accounts). Call after sync.
 */
export function recordNetWorthSnapshot(totalBalanceCents: number): void {
  const db = getDb()
  if (!db) return
  const today = new Date().toISOString().slice(0, 10)
  db.run(
    `INSERT OR REPLACE INTO net_worth_snapshots (snapshot_date, total_balance_cents) VALUES (?, ?)`,
    [today, totalBalanceCents]
  )
  schedulePersist()
}

/**
 * History of net worth snapshots, oldest first. For chart.
 */
export function getNetWorthHistory(options?: {
  limit?: number
  dateFrom?: string
  dateTo?: string
}): NetWorthSnapshot[] {
  const db = getDb()
  if (!db) return []
  const limit = options?.limit ?? 365
  let sql = `SELECT snapshot_date, total_balance_cents FROM net_worth_snapshots WHERE 1=1`
  const params: (string | number)[] = []
  if (options?.dateFrom) {
    sql += ` AND snapshot_date >= ?`
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    sql += ` AND snapshot_date <= ?`
    params.push(options.dateTo)
  }
  sql += ` ORDER BY snapshot_date ASC`
  if (limit > 0) {
    sql += ` LIMIT ?`
    params.push(limit)
  }
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const list: NetWorthSnapshot[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, number]
    list.push({ snapshot_date: row[0], total_balance_cents: row[1] })
  }
  stmt.free()
  return list
}

/**
 * Record net worth per account type (e.g. TRANSACTIONAL, SAVER). Called after sync.
 */
export function recordNetWorthSnapshotByType(
  accountType: string,
  totalBalanceCents: number
): void {
  const db = getDb()
  if (!db) return
  const today = new Date().toISOString().slice(0, 10)
  db.run(
    `INSERT OR REPLACE INTO net_worth_type_snapshots (snapshot_date, account_type, total_balance_cents) VALUES (?, ?, ?)`,
    [today, accountType, totalBalanceCents]
  )
  schedulePersist()
}

/**
 * History of net worth snapshots for a specific account type, oldest first.
 */
export function getNetWorthHistoryByType(
  accountType: string,
  options?: { limit?: number; dateFrom?: string; dateTo?: string }
): NetWorthSnapshot[] {
  const db = getDb()
  if (!db) return []
  const limit = options?.limit ?? 365
  let sql = `SELECT snapshot_date, total_balance_cents FROM net_worth_type_snapshots WHERE account_type = ?`
  const params: (string | number)[] = [accountType]
  if (options?.dateFrom) {
    sql += ` AND snapshot_date >= ?`
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    sql += ` AND snapshot_date <= ?`
    params.push(options.dateTo)
  }
  sql += ` ORDER BY snapshot_date ASC`
  if (limit > 0) {
    sql += ` LIMIT ?`
    params.push(limit)
  }
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const list: NetWorthSnapshot[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, number]
    list.push({ snapshot_date: row[0], total_balance_cents: row[1] })
  }
  stmt.free()
  return list
}
