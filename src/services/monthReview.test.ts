/**
 * #244: the Month review — which month it shows, when it hides, its three
 * variants, and the last reviewed month's export round-trip. Real sql.js DB in
 * an AU zone; "today" is 7 November 2026. Synthetic data only.
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

function readSetting(key: string): string | null {
  const rows = db.exec(`SELECT value FROM app_settings WHERE key = ?`, [key])
  return rows[0] ? String(rows[0].values[0][0]) : null
}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => readSetting(key),
  setAppSetting: (key: string, value: string) =>
    db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [
      key,
      value,
    ]),
  schedulePersist: () => {},
}))

const {
  getMonthReview,
  markMonthReviewed,
  getLastReviewedMonth,
  LAST_REVIEWED_MONTH_KEY,
} = await import('./monthReview')
const { freezeMonthEndPlans } = await import('./monthEndPlan')
const { getPlanVsActual } = await import('./planVsActual')
const {
  buildExportPayload,
  importPayloadWithOptions,
  IMPORT_ERROR_INVALID_LAST_REVIEWED_MONTH,
} = await import('./profileExport')

const ORIGINAL_TZ = process.env.TZ
const ALL_SECTIONS = {
  settings: true,
  trackers: true,
  upcomingCharges: true,
  budgetPlan: true,
}
let txCounter = 0

function set(key: string, value: string) {
  db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [
    key,
    value,
  ])
}

function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00+11:00`))
}

function spend(cents: number, day: string) {
  txCounter += 1
  const at = `${day}T12:00:00+11:00`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       amount, created_at, settled_at, source)
     VALUES (?, 'acc-spending', 'SETTLED', 'Synthetic Shop', NULL, ?, ?, ?, 'up')`,
    [`tx-${txCounter}`, -cents, at, at]
  )
}

/** Freezes every finished month from September on 1 November; reads on the 7th. */
function freezeThroughOctober() {
  setToday('2026-11-01')
  freezeMonthEndPlans()
  setToday('2026-11-07')
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-11-07')
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  set('onboarding_complete', '1')
  set('first_plannable_month', '2026-09')
  set('pay_amount_cents', '500000')
  set('payday_frequency', 'MONTHLY')
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
       ownership_type, counts_on_hand)
     VALUES ('acc-spending', 'Spending', 'TRANSACTIONAL', 100000, '2026-01-01', '2026-01-01',
       'INDIVIDUAL', 0)`
  )
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('which month it shows', () => {
  it('shows nothing while the First plannable month is this month', () => {
    // October is then a Month without a plan, which never gets one.
    set('first_plannable_month', '2026-11')
    expect(getPlanVsActual('2026-10')?.state).toBe('no-plan')
    expect(getMonthReview()).toBeNull()
  })

  it('shows nothing without a First plannable month', () => {
    db.run(`DELETE FROM app_settings WHERE key = 'first_plannable_month'`)
    expect(getMonthReview()).toBeNull()
  })

  it('offers the latest finished month when its plan can’t be read (#288)', () => {
    spend(100000, '2026-09-10')
    freezeThroughOctober()
    db.run(`UPDATE month_end_plans SET plan_json = '{' WHERE month = '2026-10'`)
    // September's plan reads fine, but October is the latest finished month.
    expect(getMonthReview()).toEqual({ month: '2026-10', kind: 'unreadable' })
  })

  it('marking an unreadable month reviewed covers every earlier one (#288)', () => {
    freezeThroughOctober()
    db.run(`UPDATE month_end_plans SET plan_json = '{' WHERE month = '2026-10'`)
    markMonthReviewed('2026-10')
    expect(getMonthReview()).toBeNull()
  })

  it('offers the latest finished month when it has no Month-end plan row', () => {
    // Freeze hasn't run: October has no row, so its plan can't be read.
    expect(getMonthReview()).toEqual({ month: '2026-10', kind: 'unreadable' })
  })

  it('shows the latest unreviewed finished month only', () => {
    spend(100000, '2026-09-10')
    spend(120000, '2026-10-10')
    freezeThroughOctober()
    expect(getMonthReview()).toEqual({
      month: '2026-10',
      kind: 'saved',
      cents: 380000,
    })
  })

  it('reads the month as of the today it was given, not the clock', () => {
    spend(120000, '2026-10-10')
    freezeThroughOctober()
    // The clock says October is still running; the caller says it's 7 November.
    setToday('2026-10-20')
    expect(getMonthReview('2026-11-07')).toEqual({
      month: '2026-10',
      kind: 'saved',
      cents: 380000,
    })
  })

  it('agrees with the Budget Plan’s Saved for that month', () => {
    spend(123456, '2026-10-10')
    freezeThroughOctober()
    const read = getPlanVsActual('2026-10')
    if (read?.state !== 'finished') throw new Error('expected finished')
    expect(getMonthReview()).toMatchObject({ cents: read.savedCents })
  })

  it('is hidden once marked reviewed', () => {
    freezeThroughOctober()
    markMonthReviewed('2026-10')
    expect(getMonthReview()).toBeNull()
    expect(readSetting(LAST_REVIEWED_MONTH_KEY)).toBe('2026-10')
  })

  it('marking the latest month clears every earlier one', () => {
    freezeThroughOctober()
    markMonthReviewed('2026-10')
    // A plan for September is still there, but it's earlier: no card.
    expect(getPlanVsActual('2026-09')?.state).toBe('finished')
    expect(getMonthReview()).toBeNull()
  })

  it('comes back for the next month that finishes', () => {
    freezeThroughOctober()
    markMonthReviewed('2026-10')
    setToday('2026-12-01')
    freezeMonthEndPlans()
    expect(getMonthReview()).toMatchObject({ month: '2026-11' })
  })

  it('never moves the last reviewed month backwards', () => {
    freezeThroughOctober()
    markMonthReviewed('2026-10')
    markMonthReviewed('2026-09')
    expect(getLastReviewedMonth()).toBe('2026-10')
  })

  it('treats a malformed last reviewed month as unset', () => {
    freezeThroughOctober()
    set(LAST_REVIEWED_MONTH_KEY, 'October')
    expect(getMonthReview()).toMatchObject({ month: '2026-10' })
  })
})

describe('the three variants', () => {
  it('saved, when spending was at or under Income', () => {
    spend(500000, '2026-10-10')
    freezeThroughOctober()
    expect(getMonthReview()).toEqual({
      month: '2026-10',
      kind: 'saved',
      cents: 0,
    })
  })

  it('overspent, as a positive figure, when spending passed Income', () => {
    spend(512345, '2026-10-10')
    freezeThroughOctober()
    expect(getMonthReview()).toEqual({
      month: '2026-10',
      kind: 'overspent',
      cents: 12345,
    })
  })

  it('no figure when the month’s plan had no pay', () => {
    set('pay_amount_cents', '')
    spend(10000, '2026-10-10')
    freezeThroughOctober()
    // Setting pay now doesn't give October a figure.
    set('pay_amount_cents', '500000')
    expect(getMonthReview()).toEqual({ month: '2026-10', kind: 'no-pay' })
  })
})

describe('profile export', () => {
  it('round-trips the last reviewed month', () => {
    freezeThroughOctober()
    markMonthReviewed('2026-09')
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    expect(payload.lastReviewedMonth).toBe('2026-09')

    set(LAST_REVIEWED_MONTH_KEY, '2026-10')
    importPayloadWithOptions(payload, ALL_SECTIONS)
    expect(getLastReviewedMonth()).toBe('2026-09')
    expect(getMonthReview()).toMatchObject({ month: '2026-10' })
  })

  it('an export without one clears it', () => {
    freezeThroughOctober()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    delete payload.lastReviewedMonth
    markMonthReviewed('2026-10')
    importPayloadWithOptions(payload, ALL_SECTIONS)
    expect(readSetting(LAST_REVIEWED_MONTH_KEY)).toBeNull()
  })

  it.each([
    ['not a month', 'October'],
    ['an unfinished month', '2026-11'],
  ])('refuses the import for %s', (_name, value) => {
    freezeThroughOctober()
    markMonthReviewed('2026-09')
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    payload.lastReviewedMonth = value
    expect(() => importPayloadWithOptions(payload, ALL_SECTIONS)).toThrow(
      IMPORT_ERROR_INVALID_LAST_REVIEWED_MONTH
    )
    expect(getLastReviewedMonth()).toBe('2026-09')
  })
})
