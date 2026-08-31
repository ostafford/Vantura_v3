import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { __test__, type UpcomingChargeRow } from './upcoming'

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

const { getUpcomingChargeById, getLinkedLiabilityRepaymentCharges } =
  await import('./upcoming')

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
    is_subscription: 0,
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
