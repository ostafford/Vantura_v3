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
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

const { getReservedAmount, getReservedBreakdown } = await import('./balance')

const TRANSACTIONAL = 'transactional-1'
const ESSENTIALS_SAVER = 'essentials-saver-1'
const OTHER_SAVER = 'other-saver-1'

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

  appSettings['next_payday'] = '2025-03-01'
  appSettings['payday_frequency'] = 'MONTHLY'

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES (?, 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 200000, '2025-01-01', '2025-01-01'),
            (?, 'Holiday', 'SAVER', 100000, '2025-01-01', '2025-01-01')`,
    [TRANSACTIONAL, ESSENTIALS_SAVER, OTHER_SAVER]
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function addCharge(opts: {
  name: string
  amount: number
  next_charge_date: string
  match_raw_text?: string | null
}) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, match_raw_text)
     VALUES (?, ?, 'ONCE', ?, 1, '2025-01-01', ?)`,
    [opts.name, opts.amount, opts.next_charge_date, opts.match_raw_text ?? null]
  )
}

function settleDebit(accountId: string, rawText: string, settledAt: string) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, 'Payment', -1000, ?, ?)`,
    [`tx-${rawText}-${settledAt}`, accountId, rawText, settledAt, settledAt]
  )
}

describe('Reserved formula: classic path unaffected by Essentials nomination', () => {
  it('reserves a charge in full with no nomination set', () => {
    addCharge({ name: 'Netflix', amount: 1500, next_charge_date: '2025-02-25' })
    expect(getReservedAmount()).toBe(1500)
    expect(getReservedBreakdown().map((r) => r.name)).toEqual(['Netflix'])
  })
})

describe('Reserved formula: Essentials-funded Regulars are excluded', () => {
  beforeEach(() => {
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
  })

  it('excludes a charge whose funding source is the nominated Essentials Saver', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')

    expect(getReservedAmount()).toBe(0)
    expect(getReservedBreakdown()).toEqual([])
  })

  it('still reserves a charge funded from a different account (still transactional)', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    settleDebit(TRANSACTIONAL, 'NETFLIX', '2025-01-25T09:00:00.000Z')

    expect(getReservedAmount()).toBe(1500)
  })

  it('still reserves a charge funded from an unrelated Saver', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    settleDebit(OTHER_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')

    expect(getReservedAmount()).toBe(1500)
  })

  it('still reserves a hand-typed charge with no match_raw_text (no Essentials benefit)', () => {
    addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-25' })

    expect(getReservedAmount()).toBe(2000)
  })

  it('still reserves a linked charge whose funding source has not been observed yet', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    // No matching settled debit at all — funding source unknown.

    expect(getReservedAmount()).toBe(1500)
  })

  it('resolves funding source without a settlement-window restriction (older payments count)', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    // Settled long before the current charge cycle — still the most recent
    // (only) match, and still proves the funding source.
    settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2024-06-01T09:00:00.000Z')

    expect(getReservedAmount()).toBe(0)
  })

  it('mixes excluded and non-excluded charges correctly', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_raw_text: 'NETFLIX',
    })
    settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')

    addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-26' })

    expect(getReservedAmount()).toBe(2000)
    expect(getReservedBreakdown().map((r) => r.name)).toEqual(['Gym'])
  })
})
