import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const {
  addManualAccount,
  updateManualAccount,
  updateManualAccountBalance,
  deleteManualAccount,
} = await import('./manualAccounts')
const { getNetWorthSnapshots } = await import('./netWorth')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

function baseInput(
  overrides: Partial<Parameters<typeof addManualAccount>[0]> = {}
) {
  return {
    name: 'My Mortgage',
    account_type: 'MORTGAGE' as const,
    kind: 'liability' as const,
    balance_cents: 50_000_00,
    ...overrides,
  }
}

describe('manualAccounts snapshot-on-mutation', () => {
  it('writes a net worth snapshot when an account is added', () => {
    expect(getNetWorthSnapshots().length).toBe(0)
    addManualAccount(baseInput())
    const snapshots = getNetWorthSnapshots()
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].manual_liabilities_cents).toBe(50_000_00)
  })

  it('writes a net worth snapshot when an account is updated', () => {
    const id = addManualAccount(baseInput())
    updateManualAccount(id, baseInput({ balance_cents: 40_000_00 }))
    const snapshots = getNetWorthSnapshots()
    // same calendar day -> INSERT OR REPLACE keeps it to one row, reflecting the latest value
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].manual_liabilities_cents).toBe(40_000_00)
  })

  it('writes a net worth snapshot when only the balance is updated', () => {
    const id = addManualAccount(baseInput())
    updateManualAccountBalance(id, 35_000_00)
    const snapshots = getNetWorthSnapshots()
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].manual_liabilities_cents).toBe(35_000_00)
  })

  it('writes a net worth snapshot when an account is deleted', () => {
    const id = addManualAccount(baseInput())
    deleteManualAccount(id)
    const snapshots = getNetWorthSnapshots()
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].manual_liabilities_cents).toBe(0)
  })
})
