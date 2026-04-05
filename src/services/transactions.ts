/**
 * Transaction list: filtered query, grouping by date, round-up resolution.
 * Phase 4: Transactions & Filtering.
 */

import { getDb } from '@/db'

export interface TransactionRow {
  id: string
  account_id: string
  description: string
  raw_text: string | null
  amount: number
  settled_at: string | null
  created_at: string | null
  status: string
  category_id: string | null
  category_name: string | null
  is_round_up: number
  round_up_parent_id: string | null
  transfer_account_id: string | null
  transfer_account_display_name: string | null
}

/** Display date: created (first encountered) with fallback to settled for consistency with Up app. */
export function getTransactionDisplayDate(row: TransactionRow): string | null {
  return row.created_at ?? row.settled_at
}

export type TransactionSort = 'date' | 'amount' | 'merchant'

export interface TransactionFilters {
  dateFrom?: string
  dateTo?: string
  /** When length > 0, filter to these category IDs (IN clause). Empty or absent = All categories. */
  categoryIds?: string[]
  amountMin?: number
  amountMax?: number
  search?: string
  /**
   * When true: transfers to/from SAVER accounts, activity on saver accounts, or round-up lines.
   */
  saverActivity?: boolean
  /** Either leg matches this Up account id (spending account or saver counterparty). */
  linkedAccountId?: string
}

const DEFAULT_SORT: TransactionSort = 'date'

function buildWhereClause(filters: TransactionFilters): {
  sql: string
  params: (string | number)[]
} {
  const conditions: string[] = ['(t.round_up_parent_id IS NULL)']
  const params: (string | number)[] = []

  if (filters.dateFrom) {
    conditions.push('COALESCE(t.created_at, t.settled_at) >= ?')
    params.push(filters.dateFrom)
  }
  if (filters.dateTo) {
    conditions.push('COALESCE(t.created_at, t.settled_at) <= ?')
    params.push(filters.dateTo + 'T23:59:59.999Z')
  }
  if (filters.categoryIds?.length) {
    const placeholders = filters.categoryIds.map(() => '?').join(',')
    conditions.push(`t.category_id IN (${placeholders})`)
    params.push(...filters.categoryIds)
  }
  if (filters.amountMin != null) {
    conditions.push('ABS(t.amount) >= ?')
    params.push(filters.amountMin)
  }
  if (filters.amountMax != null) {
    conditions.push('ABS(t.amount) <= ?')
    params.push(filters.amountMax)
  }
  if (filters.search?.trim()) {
    conditions.push('(t.description LIKE ? OR t.raw_text LIKE ?)')
    const term = '%' + filters.search.trim() + '%'
    params.push(term, term)
  }
  if (filters.saverActivity) {
    conditions.push(`(
      t.transfer_account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
      OR t.account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
      OR t.is_round_up = 1
    )`)
  }
  const linked = filters.linkedAccountId?.trim()
  if (linked) {
    conditions.push('(t.account_id = ? OR t.transfer_account_id = ?)')
    params.push(linked, linked)
  }

  return {
    sql: conditions.join(' AND '),
    params,
  }
}

function orderByClause(sort: TransactionSort): string {
  const dateOrder = 'COALESCE(t.created_at, t.settled_at) DESC'
  switch (sort) {
    case 'amount':
      return `ORDER BY t.amount ASC, ${dateOrder}, t.id`
    case 'merchant':
      return `ORDER BY t.description ASC, ${dateOrder}, t.id`
    case 'date':
    default:
      return `ORDER BY ${dateOrder}, t.id`
  }
}

interface StatementLike {
  step(): boolean
  get(): unknown
}

function rowFromStmt(stmt: StatementLike): TransactionRow | null {
  if (!stmt.step()) return null
  const row = stmt.get() as [
    string,
    string,
    string,
    string | null,
    number,
    string | null,
    string | null,
    string,
    string | null,
    string | null,
    number,
    string | null,
    string | null,
    string | null,
  ]
  return {
    id: row[0],
    account_id: row[1],
    description: row[2],
    raw_text: row[3],
    amount: row[4],
    settled_at: row[5],
    created_at: row[6],
    status: row[7],
    category_id: row[8],
    category_name: row[9],
    is_round_up: row[10],
    round_up_parent_id: row[11],
    transfer_account_id: row[12],
    transfer_account_display_name: row[13],
  }
}

/**
 * Filtered list of top-level transactions (excludes round-ups that have a parent, so they show under parent in UI).
 * Phase 5: optional limit/offset for pagination.
 */
export function getFilteredTransactions(
  filters: TransactionFilters,
  sort: TransactionSort = DEFAULT_SORT,
  options?: { limit?: number; offset?: number }
): TransactionRow[] {
  const db = getDb()
  if (!db) return []

  const { sql: whereSql, params } = buildWhereClause(filters)
  const limit = options?.limit ?? 0
  const offset = options?.offset ?? 0
  const limitClause = limit > 0 ? ` LIMIT ${limit} OFFSET ${offset}` : ''
  const sql = `SELECT t.id, t.account_id, t.description, t.raw_text, t.amount, t.settled_at,
    t.created_at, t.status,
    t.category_id, c.name AS category_name, t.is_round_up, t.round_up_parent_id,
    t.transfer_account_id, a.display_name AS transfer_account_display_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.transfer_account_id = a.id
    WHERE ${whereSql}
    ${orderByClause(sort)}${limitClause}`
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const list: TransactionRow[] = []
  let r: TransactionRow | null
  while ((r = rowFromStmt(stmt)) !== null) list.push(r)
  stmt.free()
  return list
}

const DEFAULT_PAGE_SIZE = 50

/**
 * Total count of top-level transactions matching filters (for pagination).
 */
export function getFilteredTransactionsCount(
  filters: TransactionFilters
): number {
  const db = getDb()
  if (!db) return 0
  const { sql: whereSql, params } = buildWhereClause(filters)
  const sql = `SELECT COUNT(*) FROM transactions t WHERE ${whereSql}`
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const hasRow = stmt.step()
  const count = hasRow ? Number((stmt.get() as [number])[0]) : 0
  stmt.free()
  return count
}

/**
 * Grouped by date (date string YYYY-MM-DD -> list of top-level transactions for that date).
 * Uses same filters and sort; groups by display date (created_at with fallback to settled_at).
 * Phase 5: optional limit/offset for pagination (applied to filtered list before grouping).
 */
export function getTransactionsGroupedByDate(
  filters: TransactionFilters,
  sort: TransactionSort = DEFAULT_SORT,
  options?: { limit?: number; offset?: number }
): Record<string, TransactionRow[]> {
  const list = getFilteredTransactions(filters, sort, options)
  const grouped: Record<string, TransactionRow[]> = {}
  for (const row of list) {
    const displayDate = getTransactionDisplayDate(row)
    const dateStr = displayDate ? displayDate.slice(0, 10) : 'Unknown'
    if (!grouped[dateStr]) grouped[dateStr] = []
    grouped[dateStr].push(row)
  }
  return grouped
}

export { DEFAULT_PAGE_SIZE }

export interface RoundUpRow {
  id: string
  amount: number
  transfer_account_id: string | null
  transfer_account_display_name: string | null
}

/**
 * Round-up rows that belong to the given parent transaction ids.
 * Used to render "Round-up +$X → Account" under each parent.
 */
export function getRoundUpsByParentIds(
  parentIds: string[]
): Map<string, RoundUpRow[]> {
  const db = getDb()
  const map = new Map<string, RoundUpRow[]>()
  if (!db || parentIds.length === 0) return map

  const placeholders = parentIds.map(() => '?').join(',')
  const sql = `SELECT t.id, t.amount, t.round_up_parent_id, t.transfer_account_id, a.display_name
    FROM transactions t
    LEFT JOIN accounts a ON t.transfer_account_id = a.id
    WHERE t.round_up_parent_id IN (${placeholders})`
  const stmt = db.prepare(sql)
  stmt.bind(parentIds as unknown as (string | number)[])
  while (stmt.step()) {
    const row = stmt.get() as [
      string,
      number,
      string,
      string | null,
      string | null,
    ]
    const parentId = row[2]
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId)!.push({
      id: row[0],
      amount: row[1],
      transfer_account_id: row[3],
      transfer_account_display_name: row[4],
    })
  }
  stmt.free()
  return map
}
