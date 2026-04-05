/**
 * Local account rows synced from Up Bank (see sync upsertAccount).
 */

import { getDb } from '@/db'

export interface AccountRow {
  id: string
  display_name: string
  account_type: string
  balance: number
  ownership_type: string | null
}

export function getAccountsByTypes(types: string[]): AccountRow[] {
  const db = getDb()
  if (!db || types.length === 0) return []
  const placeholders = types.map(() => '?').join(',')
  const stmt = db.prepare(
    `SELECT id, display_name, account_type, balance, ownership_type
     FROM accounts WHERE account_type IN (${placeholders})
     ORDER BY display_name COLLATE NOCASE`
  )
  stmt.bind(types)
  const out: AccountRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [string, string, string, number, string | null]
    out.push({
      id: r[0],
      display_name: r[1],
      account_type: r[2],
      balance: r[3],
      ownership_type: r[4],
    })
  }
  stmt.free()
  return out
}

export function sumAccountBalancesCents(rows: AccountRow[]): number {
  return rows.reduce((s, r) => s + r.balance, 0)
}
