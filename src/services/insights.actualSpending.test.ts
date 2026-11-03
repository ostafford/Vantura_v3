/**
 * #187: Money out is total Actual spending — the one shared definition in
 * `actualSpending.ts`. Exercised through the insights reads a caller uses,
 * against a real sql.js DB in an AU zone. Synthetic data only.
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

const {
  getInsightsForDateRange,
  getMonthlyInsights,
  getMonthComparison,
  getMonthDayByDaySeries,
  getYearMonthlyTotals,
} = await import('./insights')

const ORIGINAL_TZ = process.env.TZ
let txCounter = 0

interface TxSeed {
  amount: number
  account?: string
  createdAt?: string
  settledAt?: string | null
  status?: 'HELD' | 'SETTLED'
  category?: string | null
  transferAccount?: string | null
  transactionType?: string | null
  source?: string
  isCategorizable?: 0 | 1
}

function addTx(seed: TxSeed) {
  txCounter += 1
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, is_categorizable,
       category_id, amount, created_at, settled_at, transfer_account_id,
       transaction_type, source)
     VALUES (?, ?, ?, 'Synthetic', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `tx-${txCounter}`,
      seed.account ?? 'acc-spending',
      seed.status ?? 'SETTLED',
      seed.isCategorizable ?? 1,
      seed.category ?? null,
      seed.amount,
      seed.createdAt ?? '2026-10-15T12:00:00+11:00',
      seed.settledAt === undefined
        ? '2026-10-15T12:00:00+11:00'
        : seed.settledAt,
      seed.transferAccount ?? null,
      seed.transactionType ?? null,
      seed.source ?? 'up',
    ]
  )
}

function addAccount(
  id: string,
  type: string,
  ownership: string | null = 'INDIVIDUAL'
) {
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type)
     VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01', ?)`,
    [id, id, type, ownership]
  )
}

const moneyOutForOctober = () =>
  getInsightsForDateRange('2026-10-01', '2026-10-31').moneyOut

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-04T01:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  addAccount('acc-spending', 'TRANSACTIONAL')
  addAccount('acc-saver', 'SAVER')
  addAccount('acc-joint', 'TRANSACTIONAL', 'JOINT')
  db.run(`INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries')`)
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('Money out is Actual spending (#187)', () => {
  it('counts an uncategorised, uncategorisable debit', () => {
    addTx({ amount: -2500, isCategorizable: 0 })
    expect(moneyOutForOctober()).toBe(2500)
  })

  it('counts a purchase made from a Saver', () => {
    addTx({ amount: -4000, account: 'acc-saver', category: 'groceries' })
    expect(moneyOutForOctober()).toBe(4000)
  })

  it('leaves out an own-account transfer', () => {
    addTx({ amount: -1000 })
    addTx({ amount: -50000, transferAccount: 'acc-saver' })
    addTx({
      amount: 50000,
      account: 'acc-saver',
      transferAccount: 'acc-spending',
    })
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('leaves out a Round Up row with or without a transfer account', () => {
    addTx({ amount: -1000 })
    addTx({
      amount: -40,
      transactionType: 'Round Up',
      transferAccount: 'acc-saver',
    })
    addTx({ amount: -60, transactionType: 'Round Up' })
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('leaves out an uncategorised positive (pay, interest, money from people)', () => {
    addTx({ amount: -1000 })
    addTx({ amount: 300000 })
    addTx({ amount: 125, account: 'acc-saver' })
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('subtracts a categorised refund', () => {
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 1200, category: 'groceries' })
    expect(moneyOutForOctober()).toBe(3800)
  })

  it('leaves out a joint account', () => {
    addTx({ amount: -1000 })
    addTx({ amount: -7000, account: 'acc-joint', category: 'groceries' })
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('leaves out a non-Up source', () => {
    addTx({ amount: -1000 })
    addTx({ amount: -9000, source: 'manual' })
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('counts HELD and SETTLED alike', () => {
    addTx({ amount: -1000, status: 'SETTLED' })
    addTx({ amount: -2000, status: 'HELD', settledAt: null })
    expect(moneyOutForOctober()).toBe(3000)
  })

  it('a reversed HELD transaction no longer counts once sync removes it', () => {
    addTx({ amount: -1000 })
    addTx({ amount: -2000, status: 'HELD', settledAt: null })
    db.run(`DELETE FROM transactions WHERE id = 'tx-2'`)
    expect(moneyOutForOctober()).toBe(1000)
  })

  it('uses amounts as stored: no round-up or cashback adjustment', () => {
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount,
         created_at, round_up_amount, cashback_amount, source)
       VALUES ('tx-ru', 'acc-spending', 'SETTLED', 'Synthetic', -1960,
         '2026-10-15T12:00:00+11:00', -40, 100, 'up')`
    )
    expect(moneyOutForOctober()).toBe(1960)
  })

  it('counts debits as charges; a refund is not a charge', () => {
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: -1000 })
    addTx({ amount: 1200, category: 'groceries' })
    expect(getInsightsForDateRange('2026-10-01', '2026-10-31').charges).toBe(2)
  })
})

describe('Actual spending lands on the local day of its Display date (#187)', () => {
  it('a purchase on the 31st that settles on the 2nd counts in the earlier month', () => {
    addTx({
      amount: -3000,
      createdAt: '2026-10-31T18:00:00+11:00',
      settledAt: '2026-11-02T09:00:00+11:00',
    })
    expect(getMonthlyInsights(2026, 10).moneyOut).toBe(3000)
    expect(getMonthlyInsights(2026, 11).moneyOut).toBe(0)
  })

  it('a timestamp near midnight with a local offset lands on its local day', () => {
    // 23:45 local on 31 Oct is 12:45Z on 31 Oct; 00:15 local on 1 Nov is 13:15Z on 31 Oct
    addTx({ amount: -1000, createdAt: '2026-10-31T23:45:00+11:00' })
    addTx({ amount: -2000, createdAt: '2026-11-01T00:15:00+11:00' })
    expect(getMonthlyInsights(2026, 10).moneyOut).toBe(1000)
    expect(getMonthlyInsights(2026, 11).moneyOut).toBe(2000)
  })

  it('a refund counts in the month it lands, not the purchase month', () => {
    addTx({
      amount: -5000,
      category: 'groceries',
      createdAt: '2026-09-20T12:00:00+10:00',
    })
    addTx({
      amount: 5000,
      category: 'groceries',
      createdAt: '2026-10-03T12:00:00+11:00',
    })
    expect(getMonthlyInsights(2026, 9).moneyOut).toBe(5000)
    expect(getMonthlyInsights(2026, 10).moneyOut).toBe(-5000)
  })
})

describe('Money out is signed and never clamped (#187)', () => {
  it('is negative when refunds exceed purchases in the window', () => {
    addTx({ amount: -1000, category: 'groceries' })
    addTx({ amount: 4000, category: 'groceries' })
    expect(moneyOutForOctober()).toBe(-3000)
  })
})

describe('Every Money out read agrees on the same month (#187)', () => {
  function seedMixedOctober() {
    addTx({ amount: -5000, category: 'groceries' }) // categorised debit
    addTx({ amount: -1500, isCategorizable: 0 }) // uncategorisable debit
    addTx({ amount: 800, category: 'groceries' }) // refund
    addTx({ amount: -2000, account: 'acc-saver' }) // Saver purchase
    addTx({ amount: -40, transactionType: 'Round Up' }) // excluded
    addTx({ amount: -9000, transferAccount: 'acc-saver' }) // excluded
    addTx({ amount: 250000 }) // pay, excluded
    addTx({ amount: -3000, account: 'acc-joint' }) // excluded
  }

  it('weekly, monthly, range, year and day-by-day reads give one total', async () => {
    const { getWeeklyInsights, getYearMonthlyTotals, getMonthDayByDaySeries } =
      await import('./insights')
    seedMixedOctober()
    const expected = 7700 // 5000 + 1500 - 800 + 2000
    expect(moneyOutForOctober()).toBe(expected)
    expect(getMonthlyInsights(2026, 10).moneyOut).toBe(expected)
    expect(getYearMonthlyTotals(2026)[9].moneyOut).toBe(expected)
    // Mon 12 – Sun 18 Oct 2026 holds the 15th
    const start = new Date(2026, 9, 12)
    const end = new Date(2026, 9, 18, 23, 59, 59, 999)
    expect(
      getWeeklyInsights({
        start,
        end,
        startStr: '2026-10-12',
        endStr: '2026-10-18',
      }).moneyOut
    ).toBe(expected)
    const { series } = getMonthDayByDaySeries('2026-10-01', '2026-10-31')
    expect(series.points.find((p) => p.day === 31)?.currentSpending).toBe(
      expected
    )
  })
})

describe('Actual spending narrows by category set and window (#187)', () => {
  it('counts only the given categories inside the given local-day window', async () => {
    const { getActualSpending } = await import('./actualSpending')
    db.run(`INSERT INTO categories (id, name) VALUES ('takeaway', 'Takeaway')`)
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 1000, category: 'groceries' })
    addTx({ amount: -700, category: 'takeaway' })
    addTx({ amount: -300 }) // uncategorised
    addTx({
      amount: -9900,
      category: 'groceries',
      createdAt: '2026-11-01T00:15:00+11:00',
    })
    expect(
      getActualSpending({
        from: '2026-10-01',
        to: '2026-10-31',
        categoryIds: ['groceries'],
      })
    ).toEqual({ spentCents: 4000, debitCount: 1 })
    expect(
      getActualSpending({
        from: '2026-10-01',
        to: '2026-10-31',
        categoryIds: [],
      }).spentCents
    ).toBe(0)
  })
})

describe('Actual spending takes a one-sided window (#186)', () => {
  it('narrows by `from` only or `to` only, each bound inclusive', async () => {
    const { getActualSpending } = await import('./actualSpending')
    addTx({ amount: -100, createdAt: '2026-10-14T23:55:00+11:00' })
    addTx({ amount: -200, createdAt: '2026-10-15T00:05:00+11:00' })
    addTx({ amount: -400, createdAt: '2026-10-16T12:00:00+11:00' })

    expect(getActualSpending({ from: '2026-10-15' }).spentCents).toBe(600)
    expect(getActualSpending({ to: '2026-10-15' }).spentCents).toBe(300)
    expect(getActualSpending({}).spentCents).toBe(700)
  })
})

describe('Category breakdowns are Actual spending (#186)', () => {
  // Mon 12 – Sun 18 Oct 2026 holds the 15th.
  const week = {
    start: new Date(2026, 9, 12),
    end: new Date(2026, 9, 18, 23, 59, 59, 999),
    startStr: '2026-10-12',
    endStr: '2026-10-18',
  }

  function seedMixedWeek() {
    db.run(`INSERT INTO categories (id, name) VALUES ('takeaway', 'Takeaway')`)
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 800, category: 'groceries' }) // refund nets
    addTx({ amount: -1500, isCategorizable: 0 }) // uncategorised debit counts
    addTx({ amount: -2000, account: 'acc-saver', category: 'takeaway' })
    addTx({ amount: 3000, category: 'takeaway' }) // takeaway nets negative
    addTx({ amount: -40, transactionType: 'Round Up' }) // excluded
    addTx({ amount: -9000, transferAccount: 'acc-saver' }) // excluded
    addTx({ amount: 250000 }) // pay, excluded
    addTx({ amount: -3000, account: 'acc-joint', category: 'groceries' }) // excluded
  }

  const totals = (rows: { category_id: string | null; total: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.category_id ?? 'none', r.total]))

  it('the date-range breakdown nets refunds, keeps negatives and sums to Money out', async () => {
    const { getCategoryBreakdownForDateRange } = await import('./insights')
    seedMixedWeek()
    const rows = getCategoryBreakdownForDateRange('2026-10-01', '2026-10-31')
    expect(totals(rows)).toEqual({
      groceries: 4200,
      none: 1500,
      takeaway: -1000,
    })
    expect(rows.map((r) => r.category_id)).toEqual([
      'groceries',
      null,
      'takeaway',
    ])
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(moneyOutForOctober())
  })

  it('the weekly grouped breakdown sums to the week’s Money out', async () => {
    const { getWeeklyCategoryBreakdownGrouped, getWeeklyInsights } =
      await import('./insights')
    seedMixedWeek()
    const rows = getWeeklyCategoryBreakdownGrouped(week).flatMap((s) => s.rows)
    expect(totals(rows)).toEqual({
      groceries: 4200,
      none: 1500,
      takeaway: -1000,
    })
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(
      getWeeklyInsights(week).moneyOut
    )
  })

  it('a category’s weekly history is its net Actual spending', async () => {
    const { getCategoryBreakdownHistory } = await import('./insights')
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0))
    seedMixedWeek()
    const history = getCategoryBreakdownHistory('takeaway', 2)
    expect(history.map((h) => [h.weekStart, h.total])).toEqual([
      ['2026-10-05', 0],
      ['2026-10-12', -1000],
    ])
  })
})

describe('Money in leaves out refunds, so Net counts a refund once (#200)', () => {
  it('a $30 refund changes Net by $30, not $60', () => {
    // September: pay and a $50 shop. October: the same, plus a $30 refund.
    addTx({
      amount: 300000,
      createdAt: '2026-09-15T12:00:00+10:00',
      settledAt: null,
    })
    addTx({
      amount: -5000,
      category: 'groceries',
      createdAt: '2026-09-16T12:00:00+10:00',
      settledAt: null,
    })
    addTx({ amount: 300000 })
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 3000, category: 'groceries' })

    const comparison = getMonthComparison('2026-10-01', '2026-10-31')

    expect(comparison.netDelta.delta).toBe(3000)
  })

  it('Money in for a window leaves out a categorised refund but keeps pay, interest and money from people', () => {
    addTx({ amount: 300000 }) // pay
    addTx({ amount: 125, account: 'acc-saver' }) // interest
    addTx({ amount: 2000 }) // money from a person
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 3000, category: 'groceries' }) // refund

    const october = getInsightsForDateRange('2026-10-01', '2026-10-31')

    expect(october.moneyIn).toBe(302125)
  })

  it("the month chart's Money in leaves out a refund on its day", () => {
    addTx({ amount: 300000, createdAt: '2026-10-15T12:00:00+11:00' })
    addTx({
      amount: -5000,
      category: 'groceries',
      createdAt: '2026-10-20T12:00:00+11:00',
    })
    addTx({
      amount: 3000,
      category: 'groceries',
      createdAt: '2026-10-20T13:00:00+11:00',
    })

    const { points } = getMonthDayByDaySeries('2026-10-01', '2026-10-31').series
    const day20 = points.find((p) => p.day === 20)

    expect(day20?.currentIncome).toBe(300000)
    expect(day20?.currentNet).toBe(298000)
  })

  it("the year's monthly totals leave out a refund from its month's Money in", () => {
    addTx({ amount: 300000 })
    addTx({ amount: -5000, category: 'groceries' })
    addTx({ amount: 3000, category: 'groceries' })

    const october = getYearMonthlyTotals(2026).find((m) => m.month === 10)

    expect(october?.moneyIn).toBe(300000)
  })

  it('the narratives call it Money in, never Income', () => {
    addTx({
      amount: 300000,
      createdAt: '2026-09-15T12:00:00+10:00',
      settledAt: null,
    })
    addTx({ amount: 310000 })

    const labels = getMonthComparison(
      '2026-10-01',
      '2026-10-31'
    ).narratives.map((n) => n.label)

    expect(labels.some((l) => l.startsWith('Money in is up $100'))).toBe(true)
    expect(labels.some((l) => l.includes('Income'))).toBe(false)
  })
})

describe('Savers movement counts every Round Up row on a Saver (#202)', () => {
  it('counts a Round Up credit with no transfer account in both saverChanges and saverRoundUps, so self-contributed leaves it out exactly', () => {
    // $500 moved in by the user, plus a $1.20 Round Up row Up sent with no
    // transfer account. Credits into a Saver read negative (saving).
    addTx({
      amount: 50000,
      account: 'acc-saver',
      transferAccount: 'acc-spending',
    })
    addTx({ amount: 120, account: 'acc-saver', transactionType: 'Round Up' })

    const { saverChanges, saverRoundUps } = getMonthlyInsights(2026, 10)
    expect(saverChanges).toBe(-50120)
    expect(saverRoundUps).toBe(-120)
    expect(saverChanges - saverRoundUps).toBe(-50000)
  })
})
