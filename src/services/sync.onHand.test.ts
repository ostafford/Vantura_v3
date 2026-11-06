import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { UpAccount } from '@/api/upBank'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}
let upAccounts: UpAccount[] = []

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

vi.mock('@/api/upBank', () => ({
  fetchAccounts: vi.fn(async () => upAccounts),
  fetchAllTransactions: vi.fn(async () => []),
  fetchCategories: vi.fn(async () => []),
  fetchTags: vi.fn(async () => []),
  fetchTransactionById: vi.fn(async () => null),
}))

const { performSync, performFullSync } = await import('./sync')
const { setSaverCountsOnHand } = await import('./accounts')

function upAccount(
  id: string,
  accountType: 'SAVER' | 'TRANSACTIONAL',
  balanceCents: number
): UpAccount {
  return {
    type: 'accounts',
    id,
    attributes: {
      displayName: id,
      accountType,
      ownershipType: 'INDIVIDUAL',
      balance: {
        currencyCode: 'AUD',
        value: (balanceCents / 100).toFixed(2),
        valueInBaseUnits: balanceCents,
      },
      createdAt: '2026-01-01T00:00:00+10:00',
    },
  } as UpAccount
}

function countsOnHand(id: string): number | null {
  const r = db.exec(`SELECT counts_on_hand FROM accounts WHERE id = ?`, [id])
  return r.length ? Number(r[0].values[0][0]) : null
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  upAccounts = []
})

/**
 * #213 — account sync never overwrites the On hand switch, and a Saver first
 * inserted by sync starts off (#173: Headroom never jumps on its own).
 */
describe.each([
  ['performSync', performSync],
  ['performFullSync', performFullSync],
])('%s and the On hand switch (#213)', (_name, sync) => {
  it('a newly seen Saver starts off', async () => {
    upAccounts = [
      upAccount('spend', 'TRANSACTIONAL', 50_000),
      upAccount('sav-new', 'SAVER', 20_000),
    ]

    await sync('token', () => {})

    expect(countsOnHand('sav-new')).toBe(0)
  })

  it('a re-sync keeps a Saver switched on, and one switched off, while updating the balance', async () => {
    upAccounts = [
      upAccount('sav-on', 'SAVER', 20_000),
      upAccount('sav-off', 'SAVER', 30_000),
    ]
    await sync('token', () => {})
    expect(setSaverCountsOnHand('sav-on', true)).toBe(true)

    upAccounts = [
      upAccount('sav-on', 'SAVER', 25_000),
      upAccount('sav-off', 'SAVER', 35_000),
    ]
    await sync('token', () => {})

    expect(countsOnHand('sav-on')).toBe(1)
    expect(countsOnHand('sav-off')).toBe(0)
    expect(
      db.exec(`SELECT balance FROM accounts WHERE id = 'sav-on'`)[0]
        .values[0][0]
    ).toBe(25_000)
  })
})
