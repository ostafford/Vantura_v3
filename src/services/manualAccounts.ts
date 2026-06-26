import { getDb, schedulePersist } from '@/db'

export type ManualAccountType =
  | 'CREDIT_CARD'
  | 'MORTGAGE'
  | 'PERSONAL_LOAN'
  | 'HECS_HELP'
  | 'SUPERANNUATION'
  | 'INVESTMENT'
  | 'PROPERTY'
  | 'SAVINGS'
  | 'OTHER_ASSET'
  | 'OTHER_LIABILITY'

export type ManualAccountKind = 'asset' | 'liability'

export interface ManualAccountRow {
  id: number
  name: string
  institution: string | null
  account_type: ManualAccountType
  kind: ManualAccountKind
  balance_cents: number
  credit_limit_cents: number | null
  interest_rate_bps: number | null
  rate_type: string | null
  fixed_rate_expiry_date: string | null
  notes: string | null
  sort_order: number
  last_updated_at: string
  created_at: string
}

export interface ManualAccountInput {
  name: string
  institution?: string | null
  account_type: ManualAccountType
  kind: ManualAccountKind
  balance_cents: number
  credit_limit_cents?: number | null
  interest_rate_bps?: number | null
  rate_type?: string | null
  fixed_rate_expiry_date?: string | null
  notes?: string | null
}

/** Days before a manual account is considered stale, keyed by account_type. */
export const STALE_THRESHOLD_DAYS: Record<ManualAccountType, number> = {
  CREDIT_CARD: 7,
  MORTGAGE: 30,
  PERSONAL_LOAN: 30,
  HECS_HELP: 90,
  SUPERANNUATION: 90,
  INVESTMENT: 30,
  PROPERTY: 365,
  SAVINGS: 30,
  OTHER_ASSET: 30,
  OTHER_LIABILITY: 30,
}

export const MANUAL_ACCOUNT_TYPE_LABELS: Record<ManualAccountType, string> = {
  CREDIT_CARD: 'Credit Card',
  MORTGAGE: 'Mortgage / Home Loan',
  PERSONAL_LOAN: 'Personal / Car Loan',
  HECS_HELP: 'HECS / HELP Debt',
  SUPERANNUATION: 'Superannuation',
  INVESTMENT: 'Investment Portfolio',
  PROPERTY: 'Property',
  SAVINGS: 'Savings (other bank)',
  OTHER_ASSET: 'Other Asset',
  OTHER_LIABILITY: 'Other Liability',
}

export const MANUAL_ACCOUNT_TYPE_ICONS: Record<ManualAccountType, string> = {
  CREDIT_CARD: 'mdi-credit-card-outline',
  MORTGAGE: 'mdi-home-outline',
  PERSONAL_LOAN: 'mdi-car-outline',
  HECS_HELP: 'mdi-school-outline',
  SUPERANNUATION: 'mdi-umbrella-outline',
  INVESTMENT: 'mdi-trending-up',
  PROPERTY: 'mdi-home-city-outline',
  SAVINGS: 'mdi-bank-outline',
  OTHER_ASSET: 'mdi-plus-circle-outline',
  OTHER_LIABILITY: 'mdi-minus-circle-outline',
}

export const LIABILITY_TYPES: ManualAccountType[] = [
  'CREDIT_CARD',
  'MORTGAGE',
  'PERSONAL_LOAN',
  'HECS_HELP',
  'OTHER_LIABILITY',
]

export const ASSET_TYPES: ManualAccountType[] = [
  'SUPERANNUATION',
  'INVESTMENT',
  'PROPERTY',
  'SAVINGS',
  'OTHER_ASSET',
]

function todayIso(): string {
  return new Date().toISOString()
}

function parseRow(row: unknown[]): ManualAccountRow {
  return {
    id: row[0] as number,
    name: row[1] as string,
    institution: (row[2] as string | null) ?? null,
    account_type: row[3] as ManualAccountType,
    kind: row[4] as ManualAccountKind,
    balance_cents: row[5] as number,
    credit_limit_cents: (row[6] as number | null) ?? null,
    interest_rate_bps: (row[7] as number | null) ?? null,
    rate_type: (row[8] as string | null) ?? null,
    fixed_rate_expiry_date: (row[9] as string | null) ?? null,
    notes: (row[10] as string | null) ?? null,
    sort_order: row[11] as number,
    last_updated_at: row[12] as string,
    created_at: row[13] as string,
  }
}

const SELECT_COLS = `
  id, name, institution, account_type, kind, balance_cents,
  credit_limit_cents, interest_rate_bps, rate_type, fixed_rate_expiry_date,
  notes, sort_order, last_updated_at, created_at
`

export function getManualAccounts(): ManualAccountRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT ${SELECT_COLS} FROM manual_accounts ORDER BY sort_order, id`
  )
  const rows: ManualAccountRow[] = []
  while (stmt.step()) rows.push(parseRow(stmt.get()))
  stmt.free()
  return rows
}

export function getManualAccountById(id: number): ManualAccountRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT ${SELECT_COLS} FROM manual_accounts WHERE id = ?`
  )
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = parseRow(stmt.get())
  stmt.free()
  return row
}

export function addManualAccount(input: ManualAccountInput): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = todayIso()
  const result = db.exec(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM manual_accounts`
  )
  const nextOrder = (result[0]?.values?.[0]?.[0] as number) ?? 0
  db.run(
    `INSERT INTO manual_accounts
       (name, institution, account_type, kind, balance_cents, credit_limit_cents,
        interest_rate_bps, rate_type, fixed_rate_expiry_date, notes, sort_order,
        last_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.institution ?? null,
      input.account_type,
      input.kind,
      input.balance_cents,
      input.credit_limit_cents ?? null,
      input.interest_rate_bps ?? null,
      input.rate_type ?? null,
      input.fixed_rate_expiry_date ?? null,
      input.notes ?? null,
      nextOrder,
      now,
      now,
    ]
  )
  const id =
    (db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function updateManualAccount(
  id: number,
  input: ManualAccountInput
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE manual_accounts SET
       name = ?, institution = ?, account_type = ?, kind = ?, balance_cents = ?,
       credit_limit_cents = ?, interest_rate_bps = ?, rate_type = ?,
       fixed_rate_expiry_date = ?, notes = ?, last_updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.institution ?? null,
      input.account_type,
      input.kind,
      input.balance_cents,
      input.credit_limit_cents ?? null,
      input.interest_rate_bps ?? null,
      input.rate_type ?? null,
      input.fixed_rate_expiry_date ?? null,
      input.notes ?? null,
      todayIso(),
      id,
    ]
  )
  schedulePersist()
}

export function updateManualAccountBalance(
  id: number,
  balanceCents: number
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE manual_accounts SET balance_cents = ?, last_updated_at = ? WHERE id = ?`,
    [balanceCents, todayIso(), id]
  )
  schedulePersist()
}

export function deleteManualAccount(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  // Clear any upcoming charge links before deletion (foreign keys not enforced in sql.js)
  db.run(
    `UPDATE upcoming_charges SET charge_type = 'EXPENSE', linked_manual_account_id = NULL WHERE linked_manual_account_id = ?`,
    [id]
  )
  db.run(`DELETE FROM manual_accounts WHERE id = ?`, [id])
  schedulePersist()
}

export function reorderManualAccounts(orderedIds: number[]): void {
  const db = getDb()
  if (!db) return
  for (let i = 0; i < orderedIds.length; i++) {
    db.run(`UPDATE manual_accounts SET sort_order = ? WHERE id = ?`, [
      i,
      orderedIds[i],
    ])
  }
  schedulePersist()
}

export function getStaleDays(account: ManualAccountRow): number {
  const updated = new Date(account.last_updated_at).getTime()
  return Math.floor((Date.now() - updated) / (24 * 60 * 60 * 1000))
}

export function isStale(account: ManualAccountRow): boolean {
  return getStaleDays(account) > STALE_THRESHOLD_DAYS[account.account_type]
}
