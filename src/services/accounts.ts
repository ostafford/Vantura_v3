/**
 * Local account rows synced from Up Bank (see sync upsertAccount).
 */

import { getDb, schedulePersist, getAppSetting, setAppSetting } from '@/db'

export interface AccountRow {
  id: string
  display_name: string
  account_type: string
  balance: number
  ownership_type: string | null
  is_closed: number
  target_amount_cents: number | null
}

/**
 * Returns accounts matching the given types. Excludes closed accounts by default.
 * Pass includeClosed=true only for historical lookups (e.g. transaction filters).
 */
export function getAccountsByTypes(
  types: string[],
  includeClosed = false
): AccountRow[] {
  const db = getDb()
  if (!db || types.length === 0) return []
  const placeholders = types.map(() => '?').join(',')
  const closedFilter = includeClosed ? '' : ' AND is_closed = 0'
  const stmt = db.prepare(
    `SELECT id, display_name, account_type, balance, ownership_type, is_closed,
            target_amount_cents
     FROM accounts WHERE account_type IN (${placeholders})${closedFilter}
     ORDER BY display_name COLLATE NOCASE`
  )
  stmt.bind(types)
  const out: AccountRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string,
      number,
      string | null,
      number,
      number | null,
    ]
    out.push({
      id: r[0],
      display_name: r[1],
      account_type: r[2],
      balance: r[3],
      ownership_type: r[4],
      is_closed: r[5],
      target_amount_cents: r[6] ?? null,
    })
  }
  stmt.free()
  return out
}

export function sumAccountBalancesCents(rows: AccountRow[]): number {
  return rows.reduce((s, r) => s + r.balance, 0)
}

export function getAccountById(id: string): AccountRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT id, display_name, account_type, balance, ownership_type, is_closed,
            target_amount_cents
     FROM accounts WHERE id = ?`
  )
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const r = stmt.get() as [
    string,
    string,
    string,
    number,
    string | null,
    number,
    number | null,
  ]
  stmt.free()
  return {
    id: r[0],
    display_name: r[1],
    account_type: r[2],
    balance: r[3],
    ownership_type: r[4],
    is_closed: r[5],
    target_amount_cents: r[6] ?? null,
  }
}

export interface SaverBalanceSnapshot {
  saver_id: string
  snapshot_date: string
  balance_cents: number
}

/** Returns balance snapshots for the given saver account, oldest to newest. */
export function getSaverBalanceHistory(
  saverId: string
): SaverBalanceSnapshot[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT saver_id, snapshot_date, balance_cents
     FROM saver_balance_snapshots
     WHERE saver_id = ?
     ORDER BY snapshot_date ASC`
  )
  stmt.bind([saverId])
  const out: SaverBalanceSnapshot[] = []
  while (stmt.step()) {
    const r = stmt.get() as [string, string, number]
    out.push({ saver_id: r[0], snapshot_date: r[1], balance_cents: r[2] })
  }
  stmt.free()
  return out
}

export interface SaverRoundUpDiagnostic {
  saverCreditTxCount: number
  isRoundUpOnSaverCount: number
  roundUpParentOnSaverCount: number
  roundUpParentOnSpendCount: number
  existsMatchCents: number
  isRoundUpOnSpendCount: number
  roundUpAmountCents: number
  recentSaverCredits: Array<{
    description: string
    is_round_up: number
    round_up_parent_id: string | null
    transaction_type: string | null
    amount: number
  }>
}

export function getSaverRoundUpDiagnostic(
  startIso: string,
  endIso: string
): SaverRoundUpDiagnostic | null {
  const db = getDb()
  if (!db) return null
  const n = (sql: string, p: (string | number | null)[]) => {
    const s = db.prepare(sql)
    s.bind(p)
    s.step()
    const r = s.get()
    s.free()
    return r ? Number(r[0]) : 0
  }
  const saverCreditTxCount = n(
    `SELECT COUNT(*) FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE account_type='SAVER') AND transfer_account_id IS NOT NULL AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const isRoundUpOnSaverCount = n(
    `SELECT COUNT(*) FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE account_type='SAVER') AND is_round_up=1 AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const roundUpParentOnSaverCount = n(
    `SELECT COUNT(*) FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE account_type='SAVER') AND round_up_parent_id IS NOT NULL AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const roundUpParentOnSpendCount = n(
    `SELECT COUNT(*) FROM transactions WHERE account_id NOT IN (SELECT id FROM accounts WHERE account_type='SAVER') AND round_up_parent_id IS NOT NULL AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const existsMatchCents = n(
    `SELECT COALESCE(-SUM(st.amount),0) FROM transactions st WHERE st.account_id IN (SELECT id FROM accounts WHERE account_type='SAVER') AND EXISTS(SELECT 1 FROM transactions sp WHERE sp.round_up_parent_id=st.id) AND COALESCE(st.created_at,st.settled_at)>=? AND COALESCE(st.created_at,st.settled_at)<=?`,
    [startIso, endIso]
  )
  const isRoundUpOnSpendCount = n(
    `SELECT COUNT(*) FROM transactions WHERE is_round_up=1 AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const roundUpAmountCents = n(
    `SELECT COALESCE(SUM(ABS(round_up_amount)),0) FROM transactions WHERE round_up_amount IS NOT NULL AND COALESCE(created_at,settled_at)>=? AND COALESCE(created_at,settled_at)<=?`,
    [startIso, endIso]
  )
  const sampleStmt = db.prepare(
    `SELECT description, is_round_up, round_up_parent_id, transaction_type, amount FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE account_type='SAVER') AND transfer_account_id IS NOT NULL ORDER BY COALESCE(created_at,settled_at) DESC LIMIT 8`
  )
  const recentSaverCredits: SaverRoundUpDiagnostic['recentSaverCredits'] = []
  while (sampleStmt.step()) {
    const r = sampleStmt.get() as [
      string,
      number,
      string | null,
      string | null,
      number,
    ]
    recentSaverCredits.push({
      description: r[0],
      is_round_up: r[1],
      round_up_parent_id: r[2],
      transaction_type: r[3],
      amount: r[4],
    })
  }
  sampleStmt.free()
  return {
    saverCreditTxCount,
    isRoundUpOnSaverCount,
    roundUpParentOnSaverCount,
    roundUpParentOnSpendCount,
    existsMatchCents,
    isRoundUpOnSpendCount,
    roundUpAmountCents,
    recentSaverCredits,
  }
}

export function updateSaverGoal(
  saverId: string,
  targetAmountCents: number | null
): void {
  const db = getDb()
  if (!db) return
  db.run(`UPDATE accounts SET target_amount_cents = ? WHERE id = ?`, [
    targetAmountCents,
    saverId,
  ])
  schedulePersist()
}

export function getSaverGoalDate(saverId: string): string | null {
  const raw = getAppSetting(`saver_goal_date_${saverId}`)
  return raw && raw.length > 0 ? raw : null
}

export function updateSaverGoalDate(
  saverId: string,
  date: string | null
): void {
  setAppSetting(`saver_goal_date_${saverId}`, date ?? '')
}

export interface SaverMonthlyFlowPoint {
  monthLabel: string
  /** Negative = savings (money into saver), positive = withdrawal. Same sign as saverChanges. */
  flowCents: number
  /** Number of saver transactions in this month — for data verification. */
  txCount: number
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Per-saver monthly net flow for the last `monthsBack` calendar months (oldest first).
 * Months with no activity have flowCents = 0 so gaps are visible in the chart.
 */
export function getSaverMonthlyFlow(
  saverId: string,
  monthsBack: number
): SaverMonthlyFlowPoint[] {
  const db = getDb()
  if (!db) return []

  const now = new Date()
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - monthsBack + 1,
    1,
    0,
    0,
    0,
    0
  )
  const cutoffIso = cutoff.toISOString()

  const stmt = db.prepare(
    `SELECT strftime('%Y-%m', COALESCE(created_at, settled_at)) AS ym,
            -SUM(amount) AS flow_cents,
            COUNT(*) AS tx_count
     FROM transactions
     WHERE account_id = ?
       AND (transfer_account_id IS NOT NULL OR round_up_parent_id IS NOT NULL)
       AND COALESCE(created_at, settled_at) >= ?
     GROUP BY ym
     ORDER BY ym`
  )
  stmt.bind([saverId, cutoffIso])
  const byMonth = new Map<string, { flowCents: number; txCount: number }>()
  while (stmt.step()) {
    const r = stmt.get() as [string, number, number]
    byMonth.set(r[0], { flowCents: Number(r[1]), txCount: Number(r[2]) })
  }
  stmt.free()

  const result: SaverMonthlyFlowPoint[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const yearShort = String(d.getFullYear()).slice(2)
    const found = byMonth.get(ym)
    result.push({
      monthLabel: `${MONTH_ABBR[d.getMonth()]} '${yearShort}`,
      flowCents: found?.flowCents ?? 0,
      txCount: found?.txCount ?? 0,
    })
  }
  return result
}
