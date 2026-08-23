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

// Full edge-case coverage of the underlying math (including the MONTHLY "last
// weekday" day-31 regression this used to guard directly) lives in
// payday.test.ts against previousPaydayDate() directly. This only proves
// prevPaydayDate reads app_settings (parsing payday_day, defaulting to 1
// when unset) and delegates correctly.
describe('prevPaydayDate', () => {
  it('reads app_settings and delegates to payday.ts for the math', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '100'
    expect(prevPaydayDate('2026-03-31')).toBe('2026-02-27')
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
