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
  match_description?: string | null
}) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, match_description)
     VALUES (?, ?, 'ONCE', ?, 1, '2025-01-01', ?)`,
    [
      opts.name,
      opts.amount,
      opts.next_charge_date,
      opts.match_description ?? null,
    ]
  )
}

function settleDebit(
  accountId: string,
  description: string,
  settledAt: string,
  amountCents: number
) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, ?, ?, ?)`,
    [
      `tx-${description}-${settledAt}`,
      accountId,
      description,
      -amountCents,
      settledAt,
      settledAt,
    ]
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
      match_description: 'Netflix',
    })
    settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)

    expect(getReservedAmount()).toBe(0)
    expect(getReservedBreakdown()).toEqual([])
  })

  it('still reserves a charge funded from a different account (still transactional)', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    settleDebit(TRANSACTIONAL, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)

    expect(getReservedAmount()).toBe(1500)
  })

  it('still reserves a charge funded from an unrelated Saver', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    settleDebit(OTHER_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)

    expect(getReservedAmount()).toBe(1500)
  })

  it('still reserves a hand-typed charge with no match_description (no Essentials benefit)', () => {
    addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-25' })

    expect(getReservedAmount()).toBe(2000)
  })

  it('still reserves a linked charge whose funding source has not been observed yet', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    // No matching settled debit at all — funding source unknown.

    expect(getReservedAmount()).toBe(1500)
  })

  it('resolves funding source without a settlement-window restriction (older payments count)', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    // Settled long before the current charge cycle — still the most recent
    // (only) match, and still proves the funding source.
    settleDebit(ESSENTIALS_SAVER, 'Netflix', '2024-06-01T09:00:00.000Z', 1500)

    expect(getReservedAmount()).toBe(0)
  })

  it('mixes excluded and non-excluded charges correctly', () => {
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)

    addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-26' })

    expect(getReservedAmount()).toBe(2000)
    expect(getReservedBreakdown().map((r) => r.name)).toEqual(['Gym'])
  })
})

describe('Reserved formula: Regulars stay linked when the descriptor changes (docs/adr/0020)', () => {
  it('excludes a repointed Regular whose raw_text changed but whose description did not', () => {
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    // Linked while billed via PayPal; now charged directly to the Essentials
    // card, so raw_text no longer matches the stored legacy fingerprint.
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, match_raw_text, match_description)
       VALUES ('Oura', 1000, 'ONCE', '2025-02-25', 1, '2025-01-01', 'PAYPAL *OURARING2, 4029357733', 'Oura')`
    )
    db.run(
      `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at)
       VALUES ('tx-oura', ?, 'SETTLED', 'OURARING, OULU', 'Oura', -999, '2025-01-23T09:00:00Z', '2025-01-23T09:00:00Z')`,
      [ESSENTIALS_SAVER]
    )
    expect(getReservedAmount()).toBe(0)
    expect(getReservedBreakdown()).toEqual([])
  })
})
