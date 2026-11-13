/**
 * #282 (Spec E, slice 3): the Month by month card's read — every finished
 * month's Saved / Overspent or the reason it has none, and each calendar
 * year's total and Average Saved. Real sql.js DB in an AU zone. Synthetic
 * data only.
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

const { getMonthByMonth } = await import('./monthByMonth')
const { confirmPayForEarlierMonths, changePayForMonth } =
  await import('./confirmedPay')

const ORIGINAL_TZ = process.env.TZ

function set(key: string, value: string) {
  db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [
    key,
    value,
  ])
}

function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00+11:00`))
}

/** The Spending account, opened on `day` (local, AU). */
function openSpendingAccount(day = '2026-03-14') {
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at,
       updated_at, ownership_type, is_closed)
     VALUES ('acc-spending', 'Synthetic Spending', 'TRANSACTIONAL', 0, ?,
       '2026-11-01T00:00:00+11:00', 'INDIVIDUAL', 0)`,
    [`${day}T10:00:00+11:00`]
  )
}

let txCounter = 0

/** A settled debit of `cents` on the Spending account on `day`. */
function spend(cents: number, day: string) {
  txCounter += 1
  const createdAt = `${day}T12:00:00+11:00`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       parent_category_id, amount, created_at, settled_at, source)
     VALUES (?, 'acc-spending', 'SETTLED', 'Synthetic Shop', 'groceries',
       'good-life', ?, ?, ?, 'up')`,
    [`tx-${txCounter}`, -cents, createdAt, createdAt]
  )
}

/** A Month-end plan for `month` with no buckets and a monthly pay (or none). */
function addPlan(month: string, monthlyPayCents: number | null) {
  db.run(
    `INSERT INTO month_end_plans (month, plan_json, frozen_at)
     VALUES (?, ?, '2026-11-01T00:00:00Z')`,
    [
      month,
      JSON.stringify({
        version: 1,
        buckets: [],
        regulars: [],
        trackers: [],
        pay:
          monthlyPayCents === null
            ? null
            : { perPay: monthlyPayCents, frequency: 'MONTHLY' },
        paidMarks: [],
      }),
    ]
  )
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-11-12')
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  set('onboarding_complete', '1')
  set('first_plannable_month', '2026-09')
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('the months on the card', () => {
  it('lists every finished month, Months without a plan and plan months together, leaving out the current month', () => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    spend(100000, '2026-05-10')
    addPlan('2026-09', 400000)
    spend(150000, '2026-09-10')
    // October has no Month-end plan; November is the current month.
    spend(5000, '2026-11-02')

    const card = getMonthByMonth()

    expect(card?.months).toEqual([
      {
        month: '2026-03',
        noPlan: true,
        savedCents: null,
        reason: 'part-month',
      },
      { month: '2026-04', noPlan: true, savedCents: 300000, reason: null },
      { month: '2026-05', noPlan: true, savedCents: 200000, reason: null },
      { month: '2026-06', noPlan: true, savedCents: 300000, reason: null },
      { month: '2026-07', noPlan: true, savedCents: 300000, reason: null },
      { month: '2026-08', noPlan: true, savedCents: 300000, reason: null },
      { month: '2026-09', noPlan: false, savedCents: 250000, reason: null },
      {
        month: '2026-10',
        noPlan: false,
        savedCents: null,
        reason: 'plan-unreadable',
      },
    ])
  })
})

describe('a month with no figure', () => {
  it('gives the reason: Pay not confirmed, Closed Saver, No pay set', () => {
    openSpendingAccount()
    changePayForMonth('2026-05', '3000', 'MONTHLY')
    // June transfers to a Saver Vantura doesn't hold.
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount,
         created_at, settled_at, source, transfer_account_id)
       VALUES ('tx-gone', 'acc-spending', 'SETTLED', 'Transfer', -5000,
         '2026-06-03T12:00:00+10:00', '2026-06-03T12:00:00+10:00', 'up',
         'acc-closed-saver')`
    )
    changePayForMonth('2026-06', '3000', 'MONTHLY')
    addPlan('2026-09', null)
    addPlan('2026-10', 400000)

    const reasons = Object.fromEntries(
      (getMonthByMonth()?.months ?? []).map((m) => [m.month, m.reason])
    )

    expect(reasons).toEqual({
      '2026-03': 'part-month',
      '2026-04': 'pay-not-confirmed',
      '2026-05': null,
      '2026-06': 'closed-saver',
      '2026-07': 'pay-not-confirmed',
      '2026-08': 'pay-not-confirmed',
      '2026-09': 'no-pay-set',
      '2026-10': null,
    })
  })
})

describe('when the card is hidden', () => {
  it('has no months when the First plannable month is this month and there are no Months without a plan', () => {
    set('first_plannable_month', '2026-11')
    expect(getMonthByMonth()).toBeNull()
  })

  it('has no months when there is no First plannable month', () => {
    db.run(`DELETE FROM app_settings WHERE key = 'first_plannable_month'`)
    openSpendingAccount()
    expect(getMonthByMonth()).toBeNull()
  })

  it('starts at the First plannable month when there are no Months without a plan', () => {
    // No Spending account, so no range.
    addPlan('2026-09', 400000)
    addPlan('2026-10', 400000)
    expect(getMonthByMonth()?.months.map((m) => m.month)).toEqual([
      '2026-09',
      '2026-10',
    ])
  })
})

describe('the year rows', () => {
  // Today 12 March 2027. Months without a plan September–December 2026
  // (September the Part month), plan months January–February 2027.
  beforeEach(() => {
    setToday('2027-03-12')
    set('first_plannable_month', '2027-01')
    openSpendingAccount('2026-09-14')
  })

  it('total the counted months, say what they cover and average to the cent, halves away from zero', () => {
    changePayForMonth('2026-10', '3000', 'MONTHLY')
    spend(299999, '2026-10-05') // Saved 1¢
    changePayForMonth('2026-11', '3000', 'MONTHLY')
    spend(299998, '2026-11-05') // Saved 2¢
    // December has no Confirmed pay.
    addPlan('2027-01', 400000)
    spend(400003, '2027-01-05') // Overspent 3¢
    addPlan('2027-02', 400000)
    spend(400000, '2027-02-05') // Saved 0¢

    const card = getMonthByMonth()

    expect(card?.years.map((y) => ({ ...y, months: undefined }))).toEqual([
      {
        year: '2027',
        soFar: true,
        months: undefined,
        countedMonths: 2,
        notCountedMonths: 0,
        totalCents: -3,
        // −1.5¢ → −2¢
        averageSavedCents: -2,
      },
      {
        year: '2026',
        soFar: false,
        months: undefined,
        countedMonths: 2,
        notCountedMonths: 2,
        totalCents: 3,
        // 1.5¢ → 2¢
        averageSavedCents: 2,
      },
    ])
  })

  it('lists each year’s months newest first', () => {
    addPlan('2027-01', 400000)
    addPlan('2027-02', 400000)

    expect(
      getMonthByMonth()?.years.map((y) => y.months.map((m) => m.month))
    ).toEqual([
      ['2027-02', '2027-01'],
      ['2026-12', '2026-11', '2026-10', '2026-09'],
    ])
  })

  it('a year with no counted months has no total or average', () => {
    addPlan('2027-01', 400000)
    addPlan('2027-02', 400000)

    const year2026 = getMonthByMonth()?.years[1]

    expect(year2026).toMatchObject({
      year: '2026',
      countedMonths: 0,
      notCountedMonths: 4,
      totalCents: null,
      averageSavedCents: null,
    })
  })
})
