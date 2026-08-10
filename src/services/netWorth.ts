import { getDb, schedulePersist, getAppSetting } from '@/db'
import { firstOccurrenceOnOrAfter } from '@/services/upcoming'

export interface NetWorthSummary {
  /** Sum of all synced Up Bank account balances (TRANSACTIONAL + SAVER + HOME_LOAN). HOME_LOAN balances are negative, so this is a net figure — use upBankAssetsCents/upBankLiabilitiesCents for an assets/liabilities breakdown. */
  upBankCents: number
  /** Synced Up Bank TRANSACTIONAL + SAVER balances only. */
  upBankAssetsCents: number
  /** Synced Up Bank HOME_LOAN debt, as a positive amount. */
  upBankLiabilitiesCents: number
  manualAssetsCents: number
  manualLiabilitiesCents: number
  totalCents: number
}

export interface NetWorthSnapshot {
  snapshot_date: string
  up_bank_cents: number
  manual_assets_cents: number
  manual_liabilities_cents: number
  total_cents: number
}

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getNetWorthSummary(): NetWorthSummary {
  const db = getDb()
  if (!db)
    return {
      upBankCents: 0,
      upBankAssetsCents: 0,
      upBankLiabilitiesCents: 0,
      manualAssetsCents: 0,
      manualLiabilitiesCents: 0,
      totalCents: 0,
    }

  const upResult = db.exec(
    `SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE is_closed = 0`
  )
  const upBankCents = (upResult[0]?.values?.[0]?.[0] as number) ?? 0

  const upAssetResult = db.exec(
    `SELECT COALESCE(SUM(balance), 0) FROM accounts
     WHERE is_closed = 0 AND account_type != 'HOME_LOAN'`
  )
  const upBankAssetsCents = (upAssetResult[0]?.values?.[0]?.[0] as number) ?? 0

  // Up Bank represents home loan debt as a negative balance; flip to a
  // positive liability amount for the assets/liabilities breakdown.
  const upBankLiabilitiesCents = upBankAssetsCents - upBankCents

  const assetResult = db.exec(
    `SELECT COALESCE(SUM(balance_cents), 0) FROM manual_accounts WHERE kind = 'asset'`
  )
  const manualAssetsCents = (assetResult[0]?.values?.[0]?.[0] as number) ?? 0

  const liabResult = db.exec(
    `SELECT COALESCE(SUM(balance_cents), 0) FROM manual_accounts WHERE kind = 'liability'`
  )
  const manualLiabilitiesCents =
    (liabResult[0]?.values?.[0]?.[0] as number) ?? 0

  const totalCents = upBankCents + manualAssetsCents - manualLiabilitiesCents

  return {
    upBankCents,
    upBankAssetsCents,
    upBankLiabilitiesCents,
    manualAssetsCents,
    manualLiabilitiesCents,
    totalCents,
  }
}

/** Net worth after subtracting EXPENSE upcoming charges due before next payday. LIABILITY_REPAYMENT charges are excluded — they are asset-liability transfers, not expenses. */
export function getProjectedNetWorth(totalCents?: number): {
  projectedCents: number
  upcomingExpenseCents: number
} {
  const total = totalCents ?? getNetWorthSummary().totalCents
  const db = getDb()
  if (!db) return { projectedCents: total, upcomingExpenseCents: 0 }

  const nextPayday = getAppSetting('next_payday')
  if (!nextPayday) return { projectedCents: total, upcomingExpenseCents: 0 }

  const today = todayDateString()

  const stmt = db.prepare(
    `SELECT next_charge_date, frequency, amount, cancel_by_date
     FROM upcoming_charges
     WHERE (charge_type IS NULL OR charge_type = 'EXPENSE')
       AND is_reserved = 1`
  )
  let upcomingExpenseCents = 0
  while (stmt.step()) {
    const [next_charge_date, frequency, amount, cancel_by_date] =
      stmt.get() as [string, string, number, string | null]
    const occurrence = firstOccurrenceOnOrAfter(
      next_charge_date,
      frequency,
      today,
      cancel_by_date
    )
    if (occurrence && occurrence >= today && occurrence < nextPayday) {
      upcomingExpenseCents += amount
    }
  }
  stmt.free()

  return {
    projectedCents: total - upcomingExpenseCents,
    upcomingExpenseCents,
  }
}

export function getNetWorthSnapshots(months = 12): NetWorthSnapshot[] {
  const db = getDb()
  if (!db) return []
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  const stmt = db.prepare(
    `SELECT snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents
     FROM net_worth_snapshots
     WHERE snapshot_date >= ?
     ORDER BY snapshot_date`
  )
  stmt.bind([cutoffStr])
  const rows: NetWorthSnapshot[] = []
  while (stmt.step()) {
    const [
      snapshot_date,
      up_bank_cents,
      manual_assets_cents,
      manual_liabilities_cents,
    ] = stmt.get() as [string, number, number, number]
    rows.push({
      snapshot_date,
      up_bank_cents,
      manual_assets_cents,
      manual_liabilities_cents,
      total_cents:
        up_bank_cents + manual_assets_cents - manual_liabilities_cents,
    })
  }
  stmt.free()
  return rows
}

/** Called at end of each successful sync, and after every manual account create/update/delete. Uses INSERT OR REPLACE so only one snapshot per day is kept. */
export function writeNetWorthSnapshot(): void {
  const db = getDb()
  if (!db) return
  const today = todayDateString()
  const summary = getNetWorthSummary()
  db.run(
    `INSERT OR REPLACE INTO net_worth_snapshots
       (snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents)
     VALUES (?, ?, ?, ?)`,
    [
      today,
      summary.upBankCents,
      summary.manualAssetsCents,
      summary.manualLiabilitiesCents,
    ]
  )
  schedulePersist()
}
