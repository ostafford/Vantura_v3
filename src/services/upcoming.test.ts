import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  __test__,
  nextChargeDateFromAnchor,
  type UpcomingChargeRow,
} from './upcoming'

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

const {
  getUpcomingChargeById,
  getLinkedLiabilityRepaymentCharges,
  getUpcomingChargesGrouped,
} = await import('./upcoming')
const { localDateString } = await import('@/lib/format')

function makeRow(
  overrides: Partial<UpcomingChargeRow> = {}
): UpcomingChargeRow {
  return {
    id: 1,
    name: 'Test charge',
    amount: 1000,
    frequency: 'MONTHLY',
    next_charge_date: '2026-01-15',
    category_id: null,
    is_reserved: 1,
    reminder_days_before: null,
    cancel_by_date: null,
    charge_type: 'EXPENSE',
    linked_manual_account_id: null,
    ...overrides,
  }
}

describe('upcoming recurrence projection', () => {
  it('projects recurring monthly charges into future months indefinitely', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-15',
      cancel_by_date: null,
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-15'])
    expect(april.map((c) => c.next_charge_date)).toEqual(['2026-04-15'])
  })

  it('stops projecting once cancel_by_date is exceeded', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-10',
      cancel_by_date: '2026-03-15',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-10'])
    expect(april).toEqual([])
  })

  it('keeps ONCE charges as a single occurrence', () => {
    const row = makeRow({
      frequency: 'ONCE',
      next_charge_date: '2026-03-22',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-22'])
    expect(april).toEqual([])
  })

  it('computes first occurrence on or after target for reminder/calendar projection', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-01',
      'FORTNIGHTLY',
      '2026-02-01',
      null
    )
    expect(occurrence).toBe('2026-02-12')
  })

  it('projects monthly occurrences from past base date to target window', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-15',
      'MONTHLY',
      '2026-03-01',
      null
    )
    expect(occurrence).toBe('2026-03-15')
  })
})

describe('nextChargeDateFromAnchor (#47)', () => {
  it('clamps a Jan 31 monthly anchor to end of February, not March 3', () => {
    expect(
      nextChargeDateFromAnchor('2026-01-31', 'MONTHLY', '2026-02-15')
    ).toBe('2026-02-28')
  })

  it('clamps to Feb 29 in a leap year', () => {
    expect(
      nextChargeDateFromAnchor('2024-01-31', 'MONTHLY', '2024-02-10')
    ).toBe('2024-02-29')
  })

  it('steps monthly across a year boundary', () => {
    expect(
      nextChargeDateFromAnchor('2025-12-31', 'MONTHLY', '2026-01-15')
    ).toBe('2026-01-31')
  })

  it('steps yearly with leap-day clamping', () => {
    expect(nextChargeDateFromAnchor('2024-02-29', 'YEARLY', '2024-06-01')).toBe(
      '2025-02-28'
    )
  })

  it('steps weekly and fortnightly past today', () => {
    expect(nextChargeDateFromAnchor('2026-02-02', 'WEEKLY', '2026-02-15')).toBe(
      '2026-02-16'
    )
    expect(
      nextChargeDateFromAnchor('2026-01-01', 'FORTNIGHTLY', '2026-02-01')
    ).toBe('2026-02-12')
  })

  it('keeps steps until the occurrence is strictly past today', () => {
    // Jan 31 → Feb 28 → Mar 28 → Apr 28 (clamp-drift, matching stepOccurrence)
    expect(
      nextChargeDateFromAnchor('2026-01-31', 'MONTHLY', '2026-04-10')
    ).toBe('2026-04-28')
  })

  it('returns an already-future anchor unchanged', () => {
    expect(
      nextChargeDateFromAnchor('2026-12-25', 'MONTHLY', '2026-03-10')
    ).toBe('2026-12-25')
  })

  it('normalizes a datetime anchor to its date part', () => {
    expect(
      nextChargeDateFromAnchor('2026-01-31T09:00:00Z', 'MONTHLY', '2026-02-15')
    ).toBe('2026-02-28')
  })

  it('falls back to today for ONCE and for an unrecognised frequency', () => {
    expect(nextChargeDateFromAnchor('2020-01-01', 'ONCE', '2026-03-10')).toBe(
      '2026-03-10'
    )
    expect(nextChargeDateFromAnchor('2020-01-01', 'BOGUS', '2026-03-10')).toBe(
      '2026-03-10'
    )
  })

  it('defaults the "today" argument to the local date', () => {
    expect(nextChargeDateFromAnchor('2020-01-01', 'ONCE')).toBe(
      localDateString()
    )
  })

  it('falls back to today when the anchor is too far past to resolve in 1000 steps', () => {
    // ~21 years of weekly steps exceeds the guard; return today, not a past date.
    expect(nextChargeDateFromAnchor('2005-01-01', 'WEEKLY', '2026-03-10')).toBe(
      '2026-03-10'
    )
  })
})

describe('getUpcomingChargeById / getLinkedLiabilityRepaymentCharges', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    for (const k of Object.keys(appSettings)) delete appSettings[k]
  })

  function insertCharge(opts: {
    name: string
    chargeType?: 'EXPENSE' | 'LIABILITY_REPAYMENT'
    linkedAccountId?: number | null
    matchRawText?: string | null
  }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, is_reserved, created_at,
          charge_type, linked_manual_account_id, match_raw_text)
       VALUES (?, 100000, 'MONTHLY', '2026-01-15', 1, '2026-01-01T00:00:00.000Z', ?, ?, ?)`,
      [
        opts.name,
        opts.chargeType ?? 'EXPENSE',
        opts.linkedAccountId ?? null,
        opts.matchRawText ?? null,
      ]
    )
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  it('getUpcomingChargeById returns the row or null', () => {
    const id = insertCharge({ name: 'Spotify' })
    expect(getUpcomingChargeById(id)?.name).toBe('Spotify')
    expect(getUpcomingChargeById(9999)).toBeNull()
  })

  it('getLinkedLiabilityRepaymentCharges returns only fully-linked LIABILITY_REPAYMENT rows', () => {
    insertCharge({ name: 'Groceries' }) // EXPENSE
    insertCharge({
      name: 'Mortgage (no fingerprint)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: 3,
      matchRawText: null,
    })
    insertCharge({
      name: 'Mortgage (no account)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: null,
      matchRawText: 'RAW',
    })
    const fullId = insertCharge({
      name: 'Mortgage (linked)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: 3,
      matchRawText: 'MORTGAGE-RAW',
    })

    const linked = getLinkedLiabilityRepaymentCharges()
    expect(linked.map((c) => c.id)).toEqual([fullId])
  })
})

describe('getUpcomingChargesGrouped — overdue ONCE charges (#18)', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    for (const k of Object.keys(appSettings)) delete appSettings[k]
  })

  function daysFromToday(delta: number): string {
    const d = new Date(localDateString() + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  function insert(opts: {
    name: string
    frequency: string
    nextChargeDate: string
    cancelByDate?: string | null
    amount?: number
  }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, is_reserved, created_at, cancel_by_date, charge_type)
       VALUES (?, ?, ?, ?, 1, '2020-01-01T00:00:00.000Z', ?, 'EXPENSE')`,
      [
        opts.name,
        opts.amount ?? 5000,
        opts.frequency,
        opts.nextChargeDate,
        opts.cancelByDate ?? null,
      ]
    )
  }

  it('routes a past ONCE charge to `overdue`, never to nextPay/later, and keeps it out of those totals', () => {
    appSettings['next_payday'] = daysFromToday(10)
    insert({
      name: 'Rego',
      frequency: 'ONCE',
      nextChargeDate: daysFromToday(-9),
    })
    insert({
      name: 'Rent',
      frequency: 'MONTHLY',
      nextChargeDate: daysFromToday(3),
      amount: 200000,
    })

    const { overdue, nextPay, later } = getUpcomingChargesGrouped()

    expect(overdue.map((c) => c.name)).toEqual(['Rego'])
    expect([...nextPay, ...later].map((c) => c.name)).toEqual(['Rent'])
  })

  it('sorts overdue oldest-first', () => {
    insert({ name: 'B', frequency: 'ONCE', nextChargeDate: daysFromToday(-2) })
    insert({ name: 'A', frequency: 'ONCE', nextChargeDate: daysFromToday(-30) })
    insert({ name: 'C', frequency: 'ONCE', nextChargeDate: daysFromToday(-1) })

    expect(getUpcomingChargesGrouped().overdue.map((c) => c.name)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('a future ONCE charge is scheduled, not overdue', () => {
    appSettings['next_payday'] = daysFromToday(10)
    insert({
      name: 'Insurance',
      frequency: 'ONCE',
      nextChargeDate: daysFromToday(4),
    })

    const { overdue, nextPay } = getUpcomingChargesGrouped()
    expect(overdue).toHaveLength(0)
    expect(nextPay.map((c) => c.name)).toEqual(['Insurance'])
  })

  it('a recurring charge past its cancel_by_date is dropped, not shown as overdue', () => {
    insert({
      name: 'Old subscription',
      frequency: 'MONTHLY',
      nextChargeDate: daysFromToday(-90),
      cancelByDate: daysFromToday(-30),
    })

    const { overdue, nextPay, later } = getUpcomingChargesGrouped()
    expect(overdue).toHaveLength(0)
    expect(nextPay).toHaveLength(0)
    expect(later).toHaveLength(0)
  })
})
