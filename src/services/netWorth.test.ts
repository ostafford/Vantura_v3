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
import { calculateReservedAmount } from './balance'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const { getProjectedNetWorth, computeProjectedNetWorth } =
  await import('./netWorth')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  appSettings.next_payday = '2025-03-14'
  appSettings.payday_frequency = 'FORTNIGHTLY'

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES ('acc1', 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01')`
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function insertCharge(opts: {
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  charge_type?: 'EXPENSE' | 'LIABILITY_REPAYMENT'
  is_reserved?: number
}) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, charge_type, is_reserved)
     VALUES (?, ?, ?, ?, '2025-01-01', ?, ?)`,
    [
      opts.name,
      opts.amount,
      opts.frequency,
      opts.next_charge_date,
      opts.charge_type ?? 'EXPENSE',
      opts.is_reserved ?? 1,
    ]
  )
}

describe('computeProjectedNetWorth', () => {
  it('subtracts nothing when there are no charges', () => {
    expect(
      computeProjectedNetWorth([], '2025-03-01', 'MONTHLY', 500000)
    ).toEqual({
      projectedCents: 500000,
      upcomingExpenseCents: 0,
    })
  })

  it('sums every WEEKLY occurrence before payday, not just the first', () => {
    const charges = [
      {
        next_charge_date: '2025-02-25',
        frequency: 'WEEKLY',
        amount: 4000,
        is_reserved: 1,
      },
    ]
    // 2025-02-25 -> 03-04 -> 03-11: three occurrences strictly before 2025-03-14.
    const result = computeProjectedNetWorth(
      charges,
      '2025-03-14',
      'FORTNIGHTLY',
      500000
    )
    expect(result.upcomingExpenseCents).toBe(12000)
    expect(result.projectedCents).toBe(488000)
  })

  it('agrees exactly with calculateReservedAmount for the same charge set', () => {
    const charges = [
      {
        next_charge_date: '2025-02-25',
        frequency: 'WEEKLY',
        amount: 4000,
        is_reserved: 1,
      },
      {
        next_charge_date: '2025-02-26',
        frequency: 'MONTHLY',
        amount: 15000,
        is_reserved: 1,
      },
    ]
    const { upcomingExpenseCents } = computeProjectedNetWorth(
      charges,
      '2025-03-14',
      'FORTNIGHTLY',
      500000
    )
    expect(upcomingExpenseCents).toBe(
      calculateReservedAmount(charges, '2025-03-14', 'FORTNIGHTLY')
    )
  })
})

describe('getProjectedNetWorth', () => {
  it('sums every WEEKLY occurrence before payday when read from the DB', () => {
    insertCharge({
      name: 'Groceries',
      amount: 4000,
      frequency: 'WEEKLY',
      next_charge_date: '2025-02-25',
    })
    const result = getProjectedNetWorth()
    expect(result.upcomingExpenseCents).toBe(12000)
    expect(result.projectedCents).toBe(488000)
  })

  it('excludes LIABILITY_REPAYMENT charges even when reserved', () => {
    insertCharge({
      name: 'Car loan',
      amount: 20000,
      frequency: 'MONTHLY',
      next_charge_date: '2025-02-25',
      charge_type: 'LIABILITY_REPAYMENT',
    })
    const result = getProjectedNetWorth()
    expect(result.upcomingExpenseCents).toBe(0)
    expect(result.projectedCents).toBe(500000)
  })

  it('excludes charges not marked reserved', () => {
    insertCharge({
      name: 'Someday subscription',
      amount: 999,
      frequency: 'ONCE',
      next_charge_date: '2025-02-25',
      is_reserved: 0,
    })
    expect(getProjectedNetWorth().upcomingExpenseCents).toBe(0)
  })

  it('returns 0 upcoming expense when payday is not configured', () => {
    delete appSettings.next_payday
    insertCharge({
      name: 'Groceries',
      amount: 4000,
      frequency: 'WEEKLY',
      next_charge_date: '2025-02-25',
    })
    expect(getProjectedNetWorth()).toEqual({
      projectedCents: 500000,
      upcomingExpenseCents: 0,
    })
  })
})
