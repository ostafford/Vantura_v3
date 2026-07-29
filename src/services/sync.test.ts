import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
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

const { __test__, recalculateTrackers } = await import('./sync')
const { prevPaydayDate } = __test__

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

function insertTracker(overrides: {
  reset_frequency: string
  next_reset_date: string
  last_reset_date?: string
  is_active?: number
}) {
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES ('T', 10000, ?, 1, '2026-01-01', ?, ?, ?, '2026-01-01')`,
    [
      overrides.reset_frequency,
      overrides.last_reset_date ?? '2026-01-01',
      overrides.next_reset_date,
      overrides.is_active ?? 1,
    ]
  )
}

// prevPaydayDate's MONTHLY "last weekday of month" branch (payday_day 100-105)
// previously mutated a Date that still carried the original day-of-month
// before deriving the target month, so short months (e.g. February) rolled
// the date back into the SAME month as the input for any day-of-month in
// 29-31 — producing a zero-length PAYDAY tracker period. These cases are the
// actual regression trigger; day-of-month <=28 never exhibited the bug and
// so is an insufficient regression guard on its own (see the day-15 cases
// below, kept as sanity checks of the non-buggy path).
describe('prevPaydayDate — MONTHLY "last weekday" rules with day-of-month 29-31 inputs', () => {
  beforeEach(() => {
    appSettings.payday_frequency = 'MONTHLY'
  })

  it('day-of-month 31, "last business day" rule (100): March 31 -> last business day of February', () => {
    appSettings.payday_day = '100'
    // Feb 2026 has 28 days; Feb 28 2026 is a Saturday, so the last business
    // day is Feb 27. The pre-fix code returned '2026-03-27' (stayed in March).
    expect(prevPaydayDate('2026-03-31')).toBe('2026-02-27')
  })

  it('day-of-month 31, "last Friday" rule (105): May 31 -> last Friday of April', () => {
    appSettings.payday_day = '105'
    expect(prevPaydayDate('2026-05-31')).toBe('2026-04-24')
  })

  it('day-of-month 30, "last business day" rule (100): still resolves to the prior month', () => {
    appSettings.payday_day = '100'
    expect(prevPaydayDate('2026-03-30')).toBe('2026-02-27')
  })

  it('day-of-month 15 (non-overflowing), "last business day" rule (100): sanity check', () => {
    appSettings.payday_day = '100'
    expect(prevPaydayDate('2026-03-15')).toBe('2026-02-27')
  })

  it('January input correctly wraps to the previous December', () => {
    appSettings.payday_day = '100'
    // Dec 31 2025 is a Wednesday (a business day), so it's its own last
    // business day. Dec 2025 has 31 days, so day-of-month 31 doesn't
    // overflow here — this exercises the year-wraparound arithmetic
    // (Jan -> Dec, year-1) rather than the short-month bug.
    expect(prevPaydayDate('2026-01-31')).toBe('2025-12-31')
  })
})

// recalculateTrackers previously set `changed = true` as soon as a tracker's
// next_reset_date was found to be in the past, before confirming it could
// actually advance — so a tracker that can never advance (PAYDAY with no
// next_payday configured, or an unrecognized reset_frequency) caused the
// outer while(changed) loop to find the same stale row forever. These tests
// assert the function actually returns (a hang would fail via vitest's
// default test timeout, not spin forever).
describe('recalculateTrackers — termination', () => {
  it('returns without hanging when a PAYDAY tracker has no next_payday configured', () => {
    insertTracker({ reset_frequency: 'PAYDAY', next_reset_date: '2026-01-01' })
    // next_payday intentionally left unset.
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec('SELECT next_reset_date FROM trackers')
    expect(rows[0].values[0][0]).toBe('2026-01-01') // left untouched, not advanced
  })

  it('returns without hanging for an unrecognized reset_frequency', () => {
    insertTracker({ reset_frequency: 'BOGUS', next_reset_date: '2026-01-01' })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec('SELECT next_reset_date FROM trackers')
    expect(rows[0].values[0][0]).toBe('2026-01-01')
  })

  it('advances a stuck PAYDAY tracker once next_payday is configured, and terminates', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '1'
    appSettings.next_payday = '2026-04-01'
    insertTracker({ reset_frequency: 'PAYDAY', next_reset_date: '2026-01-01' })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec(
      'SELECT last_reset_date, next_reset_date FROM trackers'
    )
    expect(rows[0].values[0]).toEqual(['2026-03-01', '2026-04-01'])
  })

  it('advances a MONTHLY tracker across multiple missed cycles and terminates', () => {
    insertTracker({ reset_frequency: 'MONTHLY', next_reset_date: '2026-01-01' })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec('SELECT next_reset_date FROM trackers')
    // Should have advanced past "now" (test runs well after 2026-01-01),
    // landing on the 1st of some later month rather than looping forever.
    expect(rows[0].values[0][0]).not.toBe('2026-01-01')
  })

  it('a non-advancing row does not block an advancing row in the same table', () => {
    insertTracker({ reset_frequency: 'PAYDAY', next_reset_date: '2026-01-01' })
    insertTracker({ reset_frequency: 'MONTHLY', next_reset_date: '2026-01-01' })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec(
      'SELECT reset_frequency, next_reset_date FROM trackers ORDER BY id'
    )
    expect(rows[0].values[0]).toEqual(['PAYDAY', '2026-01-01']) // untouched
    expect(rows[0].values[1][1]).not.toBe('2026-01-01') // advanced
  })
})
