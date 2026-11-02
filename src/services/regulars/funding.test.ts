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

const { regularsWithFundingSource, essentialsLinkHints } =
  await import('@/services/regulars')

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

describe('essentialsLinkHints (#97, decision 5)', () => {
  // Today is 23 Feb 2025 (see beforeEach).
  function addHinted(opts: {
    matchDescription: string | null
    amount?: number
    frequency?: string
    date?: string
    cancelBy?: string | null
    reserved?: 0 | 1
  }): number {
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, cancel_by_date, is_reserved, created_at, match_description)
       VALUES ('Regular', ?, ?, ?, ?, ?, '2025-01-01', ?)`,
      [
        opts.amount ?? 1000,
        opts.frequency ?? 'MONTHLY',
        opts.date ?? '2025-03-10',
        opts.cancelBy ?? null,
        opts.reserved ?? 1,
        opts.matchDescription,
      ]
    )
    return Number(db.exec(`SELECT last_insert_rowid()`)[0].values[0][0])
  }

  function pay(description: string, amount: number, accountId = 'everyday') {
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
       VALUES (?, ?, 'SETTLED', ?, ?, '2025-02-10T09:00:00.000Z', '2025-02-10T09:00:00.000Z')`,
      [`${description}-${amount}-${accountId}`, accountId, description, amount]
    )
  }

  it('asks to link a payment when the Regular has no link', () => {
    const id = addHinted({ matchDescription: null })
    expect(essentialsLinkHints().get(id)).toBe('unlinked')
  })

  it('says no matching payment yet when linked but nothing matches', () => {
    const id = addHinted({ matchDescription: 'Gym' })
    expect(essentialsLinkHints().get(id)).toBe('no_payment')
  })

  it('says no matching payment when the only payment is outside the ±20% band', () => {
    const id = addHinted({ matchDescription: 'Gym', amount: 6000 })
    pay('Gym', -9000)
    expect(essentialsLinkHints().get(id)).toBe('no_payment')
  })

  it('says no matching payment when the payment also matches another Regular', () => {
    addHinted({ matchDescription: 'Apple', amount: 999 })
    const id = addHinted({ matchDescription: 'Apple', amount: 999 })
    pay('Apple', -999, 'bills')
    expect(essentialsLinkHints().get(id)).toBe('no_payment')
  })

  it('has no hint once a payment is linked, whichever account paid it', () => {
    const id = addHinted({ matchDescription: 'Netflix', amount: 1500 })
    pay('Netflix', -1500)
    expect(essentialsLinkHints().has(id)).toBe(false)
  })

  it('has no hint for a Regular excluded from Spendable', () => {
    const id = addHinted({ matchDescription: null, reserved: 0 })
    expect(essentialsLinkHints().has(id)).toBe(false)
  })

  it('has no hint for a Regular that will never fall due again', () => {
    const pastOnce = addHinted({
      matchDescription: null,
      frequency: 'ONCE',
      date: '2025-02-01',
    })
    const cancelled = addHinted({
      matchDescription: null,
      date: '2025-01-10',
      cancelBy: '2025-02-15',
    })
    const hints = essentialsLinkHints()
    expect(hints.has(pastOnce)).toBe(false)
    expect(hints.has(cancelled)).toBe(false)
  })
})
