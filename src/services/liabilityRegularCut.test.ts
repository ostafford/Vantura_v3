/**
 * #209: Net Worth is cut, and with it the liability-repayment Regular type.
 * A former liability repayment is kept as an ordinary Regular. After the v55
 * migration it must count everywhere exactly like a plain Regular with the
 * same amount, frequency and date: in the Budget Plan's Committed, in
 * Still to go out's Regulars not paid yet, in the month's occurrences and in
 * due-soon.
 */
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

const { runSchema, runMigrations } = await import('@/db/schema')
const { getBucketTotalCents } = await import('./budgetBuckets')
const {
  regularOccurrencesInMonth,
  regularOccurrencesPaidInMonth,
  dueSoonRegulars,
} = await import('./regulars')

const LOAN = 'Synthetic car loan'
const TWIN = 'Synthetic twin'

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  appSettings['payday_frequency'] = 'MONTHLY'

  // A v54 database: today's schema plus the two columns v55 drops and the
  // one v59 drops.
  db = new SQL.Database()
  runSchema(db)
  db.run(
    `ALTER TABLE upcoming_charges ADD COLUMN is_reserved INTEGER DEFAULT 1`
  )
  db.run(
    `ALTER TABLE upcoming_charges ADD COLUMN charge_type TEXT NOT NULL DEFAULT 'EXPENSE'`
  )
  db.run(
    `ALTER TABLE upcoming_charges ADD COLUMN linked_manual_account_id INTEGER`
  )
  db.run(
    `INSERT INTO budget_buckets (id, name, icon, sort_order, created_at)
     VALUES (7, 'Debts', 'mdi-cash', 0, '2026-01-01'),
            (8, 'Twins', 'mdi-cash', 1, '2026-01-01')`
  )
  // The same Regular twice: once as a linked liability repayment, once plain.
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, is_reserved,
        reminder_days_before, created_at, bucket_id, match_description,
        charge_type, linked_manual_account_id)
     VALUES (?, 45000, 'FORTNIGHTLY', '2026-10-09', 1, 3, '2026-01-01', 7,
             'LOANCO', 'LIABILITY_REPAYMENT', 3),
            (?, 45000, 'FORTNIGHTLY', '2026-10-09', 1, 3, '2026-01-01', 8,
             'LOANCO', 'EXPENSE', NULL)`,
    [LOAN, TWIN]
  )
  db.run(`UPDATE app_settings SET value = '54' WHERE key = 'schema_version'`)

  runMigrations(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a former liability repayment after the v55 migration (#209)', () => {
  it('counts in Committed like its plain twin', () => {
    for (const period of ['WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      const loan = getBucketTotalCents(7, period)
      expect(loan, period).toBeGreaterThan(0)
      expect(loan, period).toBe(getBucketTotalCents(8, period))
    }
  })

  it("lists the month's occurrences like its plain twin", () => {
    const dates = (name: string) =>
      regularOccurrencesInMonth(2026, 11)
        .filter((r) => r.name === name)
        .map((r) => r.next_charge_date)
    expect(dates(LOAN)).toEqual(['2026-11-06', '2026-11-20'])
    expect(dates(LOAN)).toEqual(dates(TWIN))
  })

  it("is not paid yet this month like its plain twin (Still to go out's Regulars)", () => {
    const unpaid = (name: string) =>
      regularOccurrencesPaidInMonth('2026-11')
        .filter((o) => o.regular.name === name && !o.paid)
        .map((o) => [o.date, o.regular.amount])
    expect(unpaid(LOAN)).toEqual([
      ['2026-11-06', 45000],
      ['2026-11-20', 45000],
    ])
    expect(unpaid(LOAN)).toEqual(unpaid(TWIN))
  })

  it('shows in due-soon like its plain twin', () => {
    const due = dueSoonRegulars().map((r) => [r.name, r.next_charge_date])
    expect(due).toEqual([
      [LOAN, '2026-11-06'],
      [TWIN, '2026-11-06'],
    ])
  })
})
