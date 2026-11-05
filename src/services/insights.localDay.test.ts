/**
 * #149: Up stores `created_at` with its local offset (`2026-11-08T20:00:00+11:00`).
 * Comparing that as text against UTC ISO bounds (`2026-11-08T12:59:59.999Z`)
 * shifted every Insights / Transactions window ~11h early. Windows are local
 * calendar days, so these run in an AU zone against a real sql.js DB.
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

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: () => null,
}))

const { getMonthlyInsights, getInsightsForDateRange, getYearMonthlyTotals } =
  await import('./insights')
const { getFilteredTransactions } = await import('./transactions')

const ORIGINAL_TZ = process.env.TZ
let txCounter = 0

function insertTx(createdAt: string, amountCents: number) {
  txCounter += 1
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, is_categorizable, amount, created_at)
     VALUES (?, 'acc-1', 'SETTLED', 'Test', 1, ?, ?)`,
    [`tx-${txCounter}`, amountCents, createdAt]
  )
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney' // UTC+11 in November (daylight saving)
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wed 4 Nov 2026, midday Sydney
  vi.setSystemTime(new Date('2026-11-04T01:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  // Money out counts only Spending/Saver accounts (Actual spending, #187)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type)
     VALUES ('acc-1', 'Spending', 'TRANSACTIONAL', 0, '2026-01-01', '2026-01-01', 'INDIVIDUAL')`
  )
  txCounter = 0
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

/** Spend either side of the local days Mon 2 – Sun 8 Nov 2026. */
function seedWeekEdges() {
  insertTx('2026-11-01T20:00:00+11:00', -1000) // previous Sunday evening
  insertTx('2026-11-02T05:00:00+11:00', -2000) // this Monday, early
  insertTx('2026-11-08T20:00:00+11:00', -4000) // this Sunday evening
  insertTx('2026-11-09T05:00:00+11:00', -8000) // next Monday, early
}

describe('Insights windows are local calendar days (#149)', () => {
  it('date range: counts Mon 05:00 and Sun 20:00 local, not the previous Sunday evening', () => {
    seedWeekEdges()
    expect(getInsightsForDateRange('2026-11-02', '2026-11-08').moneyOut).toBe(
      6000
    )
  })

  it('monthly: 1 Nov 05:00 and 30 Nov 22:00 local are November; 31 Oct and 1 Dec are not', () => {
    insertTx('2026-10-31T20:00:00+11:00', -1000)
    insertTx('2026-11-01T05:00:00+11:00', -2000)
    insertTx('2026-11-30T22:00:00+11:00', -4000)
    insertTx('2026-12-01T05:00:00+11:00', -8000)
    expect(getMonthlyInsights(2026, 11).moneyOut).toBe(6000)
  })

  it('year totals: an early-morning transaction on the 1st lands in its local month', () => {
    insertTx('2026-01-01T05:00:00+11:00', -1000) // 31 Dec 2025 in UTC
    insertTx('2026-11-01T05:00:00+11:00', -2000) // 31 Oct in UTC
    const totals = getYearMonthlyTotals(2026)
    expect(totals[0].moneyOut).toBe(1000) // January
    expect(totals[9].moneyOut).toBe(0) // October
    expect(totals[10].moneyOut).toBe(2000) // November
  })

  it('Transactions date filter uses the same local-day bounds', () => {
    seedWeekEdges()
    const amounts = getFilteredTransactions({
      dateFrom: '2026-11-02',
      dateTo: '2026-11-08',
    })
      .map((t) => t.amount)
      .sort((a, b) => a - b)
    expect(amounts).toEqual([-4000, -2000])
  })
})
