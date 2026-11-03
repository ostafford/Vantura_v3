import {
  describe,
  expect,
  it,
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

const { recalculateTrackers } = await import('./sync')

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

// recalculateTrackers previously set `changed = true` as soon as a tracker's
// next_reset_date was found to be in the past, before confirming it could
// actually advance — so a tracker that can never advance (an unrecognized
// reset_frequency, such as a leftover PAYDAY row) caused the
// outer while(changed) loop to find the same stale row forever. These tests
// assert the function actually returns (a hang would fail via vitest's
// default test timeout, not spin forever).
describe('recalculateTrackers — termination', () => {
  it('returns without hanging for an unrecognized reset_frequency', () => {
    insertTracker({ reset_frequency: 'BOGUS', next_reset_date: '2026-01-01' })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec('SELECT next_reset_date FROM trackers')
    expect(rows[0].values[0][0]).toBe('2026-01-01')
  })

  it('no longer resolves a PAYDAY tracker from payday settings (#192)', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '1'
    appSettings.next_payday = '2026-04-01'
    insertTracker({
      reset_frequency: 'PAYDAY',
      last_reset_date: '2025-12-01',
      next_reset_date: '2026-01-01',
    })
    expect(() => recalculateTrackers()).not.toThrow()
    const rows = db.exec(
      'SELECT last_reset_date, next_reset_date FROM trackers'
    )
    expect(rows[0].values[0]).toEqual(['2025-12-01', '2026-01-01'])
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

// #148: the reset check compared a UTC ISO timestamp against the local
// date-only next_reset_date, so a reset due today only fired at 00:00 UTC
// (10–11am on an Australian offset). Every Up Bank customer is on an AU
// offset, so these pin a non-UTC zone regardless of where the suite runs.
describe('recalculateTrackers — resets at local midnight (#148)', () => {
  const ORIGINAL_TZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Australia/Sydney' // UTC+11 in November (daylight saving)
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })

  function resetDates(): [string, string] {
    const row = db.exec(
      'SELECT last_reset_date, next_reset_date FROM trackers'
    )[0].values[0]
    return [row[0] as string, row[1] as string]
  }

  it('advances a tracker due today at 8:30am local, while UTC is still on yesterday', () => {
    // 2026-11-02T21:30Z == 2026-11-03 08:30 in Sydney
    vi.setSystemTime(new Date('2026-11-02T21:30:00Z'))
    insertTracker({
      reset_frequency: 'WEEKLY',
      last_reset_date: '2026-10-27',
      next_reset_date: '2026-11-03',
    })
    recalculateTrackers()
    expect(resetDates()).toEqual(['2026-11-03', '2026-11-10'])
  })

  it('does not advance at 11pm local the night before', () => {
    // 2026-11-02T12:00Z == 2026-11-02 23:00 in Sydney
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
    insertTracker({
      reset_frequency: 'WEEKLY',
      last_reset_date: '2026-10-27',
      next_reset_date: '2026-11-03',
    })
    recalculateTrackers()
    expect(resetDates()).toEqual(['2026-10-27', '2026-11-03'])
  })
})
