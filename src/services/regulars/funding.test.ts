import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: () => null,
  setAppSetting: () => {},
  schedulePersist: () => {},
}))

const { regularsWithFundingSource } = await import('@/services/regulars')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES ('everyday', 'Everyday', 'TRANSACTIONAL', 0, '2025-01-01', '2025-01-01'),
            ('bills', 'Bills', 'SAVER', 0, '2025-01-01', '2025-01-01')`
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function addRegular(
  name: string,
  frequency: string,
  date: string,
  matchDescription: string | null
) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, match_description)
     VALUES (?, 1000, ?, ?, '2025-01-01', ?)`,
    [name, frequency, date, matchDescription]
  )
}

function settle(accountId: string, description: string, settledAt: string) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, -1000, ?, ?)`,
    [`${accountId}-${settledAt}`, accountId, description, settledAt, settledAt]
  )
}

describe('regularsWithFundingSource', () => {
  it('resolves each Regular to the account of its most recent linked payment', () => {
    addRegular('Power', 'MONTHLY', '2025-01-26', 'POWERCO')
    settle('everyday', 'POWERCO', '2024-12-26T09:00:00+11:00')
    settle('bills', 'POWERCO', '2025-01-26T09:00:00+11:00')

    const [power] = regularsWithFundingSource()
    expect(power.fundingAccountId).toBe('bills')
  })

  it('is unknown (null) with no payment link or no linked payment', () => {
    addRegular('Hand-typed', 'MONTHLY', '2025-01-26', null)
    addRegular('Linked, unpaid', 'MONTHLY', '2025-01-26', 'NOBODY')

    expect(regularsWithFundingSource().map((r) => r.fundingAccountId)).toEqual([
      null,
      null,
    ])
  })

  it('carries the stored Regular and its projected next occurrence, in id order', () => {
    addRegular('Phone', 'MONTHLY', '2025-01-31', null)
    addRegular('Concert', 'ONCE', '2025-02-10', null)

    expect(
      regularsWithFundingSource().map((r) => [
        r.regular.name,
        r.regular.next_charge_date,
        r.nextOccurrence,
      ])
    ).toEqual([
      ['Phone', '2025-01-31', '2025-02-28'],
      ['Concert', '2025-02-10', null],
    ])
  })
})
