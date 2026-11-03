/**
 * #188: Tracker spend is Actual spending (`actualSpending.ts`) narrowed to the
 * tracker's category set and period. Refunds net, `Round Up` rows are out,
 * Saver purchases count, transfers don't, and a net-negative period is
 * returned as-is. Exercised through the tracker service reads a caller uses.
 * Synthetic data only.
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: () => null,
  schedulePersist: () => {},
}))

const {
  createTracker,
  getTrackerSpent,
  getTrackerSpentInPeriod,
  getTrackersWithProgress,
  getTrackersWithProgressForPeriod,
  getTrackerPeriodHistory,
  getTrackerPeriodsInRange,
  getTrackerTransactionsInPeriod,
  getTrackerTransactionTimeline,
  getTrackerTransactionsForTable,
  getTrackerTransactionsCount,
  getTracker,
} = await import('./trackers')

beforeAll(async () => {
  SQL = await initSqlJs()
})

let txCounter = 0

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  db.run(
    `INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries'), ('dining', 'Dining')`
  )
  const now = '2026-01-01T00:00:00+11:00'
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type)
     VALUES ('acc-spending', 'Spending', 'TRANSACTIONAL', 0, ?, ?, 'INDIVIDUAL'),
            ('acc-saver', 'Essentials', 'SAVER', 0, ?, ?, 'INDIVIDUAL'),
            ('acc-joint', '2Up', 'TRANSACTIONAL', 0, ?, ?, 'JOINT')`,
    [now, now, now, now, now, now]
  )
})

interface TxSeed {
  amount: number
  createdAt: string
  category?: string | null
  account?: string
  status?: string
  transferAccount?: string | null
  transactionType?: string | null
}

function addTx(seed: TxSeed): string {
  txCounter += 1
  const id = `tx-${txCounter}`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       amount, created_at, settled_at, transfer_account_id, transaction_type, source)
     VALUES (?, ?, ?, 'Synthetic', ?, ?, ?, NULL, ?, ?, 'up')`,
    [
      id,
      seed.account ?? 'acc-spending',
      seed.status ?? 'SETTLED',
      seed.category === undefined ? 'groceries' : seed.category,
      seed.amount,
      seed.createdAt,
      seed.transferAccount ?? null,
      seed.transactionType ?? null,
    ]
  )
  return id
}

/** A WEEKLY groceries tracker whose current period is 2–9 Mar 2026. */
function weeklyGroceries(): number {
  const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
  db.run(
    `UPDATE trackers SET last_reset_date = '2026-03-02', next_reset_date = '2026-03-09' WHERE id = ?`,
    [id]
  )
  db.run(
    `UPDATE tracker_config_history SET effective_from = '2026-03-02' WHERE tracker_id = ?`,
    [id]
  )
  return id
}

describe('tracker spend is Actual spending', () => {
  it('a refund in the tracker’s categories reduces its spend', () => {
    const id = weeklyGroceries()
    addTx({ amount: -5000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({ amount: 1200, createdAt: '2026-03-04T10:00:00+11:00' })

    expect(getTrackerSpent(id)).toBe(3800)
    expect(getTrackerSpentInPeriod(id, '2026-03-02', '2026-03-09')).toBe(3800)
  })

  it('excludes Round Up rows, with or without a transfer account', () => {
    const id = weeklyGroceries()
    addTx({ amount: -2000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({
      amount: -40,
      createdAt: '2026-03-03T10:00:00+11:00',
      transactionType: 'Round Up',
      transferAccount: 'acc-saver',
    })
    addTx({
      amount: -60,
      createdAt: '2026-03-03T10:00:00+11:00',
      transactionType: 'Round Up',
    })

    expect(getTrackerSpent(id)).toBe(2000)
  })

  it('counts a Saver purchase, but not an own-account transfer', () => {
    const id = weeklyGroceries()
    addTx({
      amount: -3000,
      createdAt: '2026-03-03T10:00:00+11:00',
      account: 'acc-saver',
    })
    addTx({
      amount: -10000,
      createdAt: '2026-03-03T10:00:00+11:00',
      transferAccount: 'acc-saver',
    })

    expect(getTrackerSpent(id)).toBe(3000)
  })

  it('leaves out joint-account spending and non-HELD/SETTLED rows', () => {
    const id = weeklyGroceries()
    addTx({ amount: -1000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({
      amount: -700,
      createdAt: '2026-03-03T10:00:00+11:00',
      status: 'HELD',
    })
    addTx({
      amount: -9000,
      createdAt: '2026-03-03T10:00:00+11:00',
      account: 'acc-joint',
    })
    addTx({
      amount: -9000,
      createdAt: '2026-03-03T10:00:00+11:00',
      status: 'DECLINED',
    })

    expect(getTrackerSpent(id)).toBe(1700)
  })

  it('returns net-negative spend as-is when refunds exceed purchases', () => {
    const id = weeklyGroceries()
    addTx({ amount: -1000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({ amount: 2500, createdAt: '2026-03-05T10:00:00+11:00' })

    expect(getTrackerSpent(id)).toBe(-1500)
    const t = getTrackersWithProgress().find((x) => x.id === id)!
    expect(t.spent).toBe(-1500)
    expect(
      getTrackersWithProgressForPeriod(0).find((x) => x.id === id)!.spent
    ).toBe(-1500)
  })

  it('keeps the period window on local days: last day in, reset day out', () => {
    const id = weeklyGroceries()
    addTx({ amount: -100, createdAt: '2026-03-02T00:05:00+11:00' }) // first day
    addTx({ amount: -200, createdAt: '2026-03-08T23:55:00+11:00' }) // last day
    addTx({ amount: -400, createdAt: '2026-03-09T00:05:00+11:00' }) // next period
    addTx({ amount: -800, createdAt: '2026-03-01T23:55:00+11:00' }) // prior

    expect(getTrackerSpent(id)).toBe(300)
    expect(getTrackerSpentInPeriod(id, '2026-03-02', '2026-03-09')).toBe(300)
  })
})

describe('mid-period category change', () => {
  it('uses the category set in effect on each transaction’s date, refunds included', () => {
    const id = weeklyGroceries()
    // dining joins from 5 Mar
    db.run(
      `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, created_at)
       VALUES (?, '2026-03-05', 30000, '2026-03-04')`,
      [id]
    )
    const versionId = Number(
      db.exec(`SELECT last_insert_rowid()`)[0].values[0][0]
    )
    db.run(
      `INSERT INTO tracker_config_history_categories (config_id, category_id)
       VALUES (?, 'groceries'), (?, 'dining')`,
      [versionId, versionId]
    )
    addTx({ amount: -1000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({
      amount: -5000,
      createdAt: '2026-03-03T10:00:00+11:00',
      category: 'dining',
    }) // before dining joined — out
    addTx({
      amount: -3000,
      createdAt: '2026-03-06T10:00:00+11:00',
      category: 'dining',
    })
    addTx({
      amount: 500,
      createdAt: '2026-03-07T10:00:00+11:00',
      category: 'dining',
    })

    expect(getTrackerSpent(id)).toBe(3500)
    const { list } = getTrackerTransactionsInPeriod(id, 0)
    expect(list).toHaveLength(3)
    expect(list.reduce((s, r) => s - r.amount, 0)).toBe(3500)
  })
})

describe('tracker transaction lists include refunds', () => {
  it('the current-period list adds up to the tracker’s spend', () => {
    const id = weeklyGroceries()
    addTx({ amount: -5000, createdAt: '2026-03-03T10:00:00+11:00' })
    const refund = addTx({
      amount: 1200,
      createdAt: '2026-03-04T10:00:00+11:00',
    })
    addTx({
      amount: -60,
      createdAt: '2026-03-03T10:00:00+11:00',
      transactionType: 'Round Up',
    })

    const { list } = getTrackerTransactionsInPeriod(id, 0)
    expect(list.map((r) => r.id)).toContain(refund)
    expect(list.reduce((s, r) => s - r.amount, 0)).toBe(getTrackerSpent(id))
  })

  it('a past-period list adds up to that period’s spend', () => {
    const id = weeklyGroceries()
    addTx({ amount: -4000, createdAt: '2026-02-24T10:00:00+11:00' })
    addTx({ amount: 1000, createdAt: '2026-02-26T10:00:00+11:00' })

    const { list } = getTrackerTransactionsInPeriod(id, -1)
    const prev = getTrackerPeriodHistory(id, 2).find(
      (p) => p.periodOffset === -1
    )!
    expect(prev.spent).toBe(3000)
    expect(list.reduce((s, r) => s - r.amount, 0)).toBe(prev.spent)
  })

  it('the analytics timeline and table show each row as stored, net refunds and count them', () => {
    const id = weeklyGroceries()
    addTx({ amount: -4000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({ amount: 1000, createdAt: '2026-03-04T10:00:00+11:00' })
    addTx({
      amount: -9000,
      createdAt: '2026-03-04T10:00:00+11:00',
      transferAccount: 'acc-saver',
    })

    const timeline = getTrackerTransactionTimeline(id, {
      dateFrom: '2026-03-02',
      dateTo: '2026-03-09',
    })
    // Row amounts carry the stored sign, like the Transactions page: a
    // purchase is negative, a refund positive.
    expect(timeline.map((r) => r.amount)).toEqual([-4000, 1000])
    expect(timeline[timeline.length - 1].cumulativeSpent).toBe(3000)

    const table = getTrackerTransactionsForTable(id, {
      dateFrom: '2026-03-02',
      dateTo: '2026-03-08',
    })
    expect(table.map((r) => r.amount)).toEqual([1000, -4000])
    expect(
      getTrackerTransactionsCount(id, {
        dateFrom: '2026-03-02',
        dateTo: '2026-03-08',
      })
    ).toBe(2)
  })
})

describe('period ranges', () => {
  it('per-period slices net refunds', () => {
    const id = weeklyGroceries()
    addTx({ amount: -4000, createdAt: '2026-03-03T10:00:00+11:00' })
    addTx({ amount: 1500, createdAt: '2026-03-04T10:00:00+11:00' })

    const slices = getTrackerPeriodsInRange(
      getTracker(id)!,
      '2026-03-01',
      '2026-04-01'
    )
    const current = slices.find((s) => s.periodStart === '2026-03-02')!
    expect(current.spent).toBe(2500)
  })
})
