/**
 * #282 (Spec E, slice 1): Months without a plan — the finished months from
 * the month the Spending account opened up to the First plannable month,
 * their Confirmed pays and the no-plan read. Real sql.js DB in an AU zone.
 * Synthetic data only.
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

const { getMonthsWithoutAPlan } = await import('./monthsWithoutAPlan')
const { getPlanVsActual } = await import('./planVsActual')
const { confirmPayForEarlierMonths, changePayForMonth } =
  await import('./confirmedPay')
const { savePay } = await import('./pay')
const { getMonthReview } = await import('./monthReview')
const {
  buildExportPayload,
  importPayloadWithOptions,
  IMPORT_ERROR_INVALID_CONFIRMED_PAY,
} = await import('./profileExport')

const ALL_SECTIONS = {
  settings: true,
  trackers: true,
  upcomingCharges: true,
  budgetPlan: true,
}

function confirmedPayRows(): unknown[][] {
  return (
    db.exec(
      `SELECT month, pay_amount_cents, pay_frequency FROM confirmed_pays ORDER BY month`
    )[0]?.values ?? []
  )
}
type NoPlan = Extract<
  NonNullable<ReturnType<typeof getPlanVsActual>>,
  { state: 'no-plan' }
>

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

function addAccount(seed: {
  id: string
  type: 'TRANSACTIONAL' | 'SAVER'
  createdAt: string
  ownership?: 'INDIVIDUAL' | 'JOINT' | null
  closed?: boolean
}) {
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at,
       updated_at, ownership_type, is_closed)
     VALUES (?, ?, ?, 0, ?, '2026-11-01T00:00:00+11:00', ?, ?)`,
    [
      seed.id,
      `Synthetic ${seed.id}`,
      seed.type,
      seed.createdAt,
      seed.ownership === undefined ? 'INDIVIDUAL' : seed.ownership,
      seed.closed ? 1 : 0,
    ]
  )
}

let txCounter = 0

function addTx(seed: {
  amount: number
  day: string
  category?: string | null
  parent?: string | null
  account?: string
  transferAccount?: string | null
}) {
  txCounter += 1
  const createdAt = `${seed.day}T12:00:00+11:00`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       parent_category_id, amount, created_at, settled_at, source,
       transfer_account_id)
     VALUES (?, ?, 'SETTLED', 'Synthetic Shop', ?, ?, ?, ?, ?, 'up', ?)`,
    [
      `tx-${txCounter}`,
      seed.account ?? 'acc-spending',
      seed.category ?? null,
      seed.parent ?? null,
      seed.amount,
      createdAt,
      createdAt,
      seed.transferAccount ?? null,
    ]
  )
}

/** The Spending account, opened 14 March 2026; First plannable month September. */
function openSpendingAccount() {
  addAccount({
    id: 'acc-spending',
    type: 'TRANSACTIONAL',
    createdAt: '2026-03-14T10:00:00+11:00',
  })
}

function noPlan(month: string): NoPlan {
  const result = getPlanVsActual(month)
  if (!result || result.state !== 'no-plan') {
    throw new Error(`expected a no-plan read for ${month}`)
  }
  return result
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

describe('the range of Months without a plan', () => {
  it('runs from the Spending account’s opening month to the month before the First plannable month', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })

    expect(getMonthsWithoutAPlan()).toEqual({
      openingDate: '2026-03-14',
      firstMonth: '2026-03',
      lastMonth: '2026-08',
    })
  })

  it('declines when there is no individual transactional account', () => {
    addAccount({
      id: 'acc-saver',
      type: 'SAVER',
      createdAt: '2025-01-05T10:00:00+11:00',
    })
    expect(getMonthsWithoutAPlan()).toBeNull()
  })

  it('declines when there are two individual transactional accounts', () => {
    addAccount({
      id: 'acc-a',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })
    addAccount({
      id: 'acc-b',
      type: 'TRANSACTIONAL',
      createdAt: '2026-05-02T10:00:00+10:00',
    })
    expect(getMonthsWithoutAPlan()).toBeNull()
  })

  it('declines when the transactional account’s ownership type is missing', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
      ownership: null,
    })
    expect(getMonthsWithoutAPlan()).toBeNull()
  })

  it('skips a closed transactional account', () => {
    addAccount({
      id: 'acc-old',
      type: 'TRANSACTIONAL',
      createdAt: '2024-02-01T10:00:00+11:00',
      closed: true,
    })
    expect(getMonthsWithoutAPlan()).toBeNull()

    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })
    expect(getMonthsWithoutAPlan()?.firstMonth).toBe('2026-03')
  })

  it('ignores a joint transactional account', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })
    addAccount({
      id: 'acc-joint',
      type: 'TRANSACTIONAL',
      createdAt: '2025-06-01T10:00:00+10:00',
      ownership: 'JOINT',
    })
    expect(getMonthsWithoutAPlan()?.firstMonth).toBe('2026-03')
  })

  it('never starts from a Saver, even an older one', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })
    addAccount({
      id: 'acc-saver',
      type: 'SAVER',
      createdAt: '2024-07-01T10:00:00+10:00',
    })
    expect(getMonthsWithoutAPlan()?.firstMonth).toBe('2026-03')
  })

  it('is empty when the First plannable month is unset', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-03-14T10:00:00+11:00',
    })
    db.run(`DELETE FROM app_settings WHERE key = 'first_plannable_month'`)
    expect(getMonthsWithoutAPlan()).toBeNull()
  })

  it('is empty when the First plannable month is the opening month or earlier', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-09-03T10:00:00+10:00',
    })
    expect(getMonthsWithoutAPlan()).toBeNull()
    set('first_plannable_month', '2026-08')
    expect(getMonthsWithoutAPlan()).toBeNull()
  })

  it('is one month when the account opened the month before the First plannable month', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-08-31T10:00:00+10:00',
    })
    expect(getMonthsWithoutAPlan()).toEqual({
      openingDate: '2026-08-31',
      firstMonth: '2026-08',
      lastMonth: '2026-08',
    })
  })

  it('takes the opening month in local time when created_at is near midnight', () => {
    // 28 Feb 13:30 UTC is 1 March 00:30 in Sydney (AEDT, +11).
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2026-02-28T13:30:00Z',
    })
    expect(getMonthsWithoutAPlan()).toEqual({
      openingDate: '2026-03-01',
      firstMonth: '2026-03',
      lastMonth: '2026-08',
    })
  })

  it('has no cap: an account opened years earlier reaches back to its opening month', () => {
    addAccount({
      id: 'acc-spending',
      type: 'TRANSACTIONAL',
      createdAt: '2019-12-31T23:30:00+11:00',
    })
    expect(getMonthsWithoutAPlan()?.firstMonth).toBe('2019-12')
  })
})

describe('the no-plan read', () => {
  it('shows Actual spending and Spending by category, adding up exactly, with no Saved until pay is confirmed', () => {
    openSpendingAccount()
    addTx({
      amount: -4500,
      day: '2026-05-03',
      category: 'groceries',
      parent: 'good-life',
    })
    addTx({
      amount: -1250,
      day: '2026-05-10',
      category: 'takeaway',
      parent: 'good-life',
    })
    addTx({
      amount: -8000,
      day: '2026-05-20',
      category: 'fuel',
      parent: 'transport',
    })
    addTx({ amount: -300, day: '2026-05-21' })
    addTx({
      amount: 500,
      day: '2026-05-22',
      category: 'groceries',
      parent: 'good-life',
    })
    // Outside the month.
    addTx({
      amount: -9999,
      day: '2026-04-30',
      category: 'fuel',
      parent: 'transport',
    })

    const may = noPlan('2026-05')

    expect(may.figures).toEqual({ incomeCents: null, actualCents: 13550 })
    expect(may.spendingByCategory).toEqual({
      totalCents: 13550,
      parents: [
        {
          parentCategoryId: 'good-life',
          totalCents: 5250,
          subcategories: [
            { categoryId: 'groceries', totalCents: 4000 },
            { categoryId: 'takeaway', totalCents: 1250 },
          ],
        },
        {
          parentCategoryId: 'transport',
          totalCents: 8000,
          subcategories: [{ categoryId: 'fuel', totalCents: 8000 }],
        },
      ],
      uncategorisedCents: 300,
    })
    expect(may.savedCents).toBeNull()
    expect(may.noSavedReason).toBe('pay-not-confirmed')
    expect(may.confirmedPay).toBeNull()
  })
})

describe('Confirmed pay', () => {
  it('a bulk confirm gives every earlier month a Saved: Income − Actual spending', () => {
    openSpendingAccount()
    addTx({
      amount: -150000,
      day: '2026-05-03',
      category: 'rent',
      parent: 'home',
    })
    addTx({
      amount: -310000,
      day: '2026-06-03',
      category: 'rent',
      parent: 'home',
    })

    expect(confirmPayForEarlierMonths('3000', 'MONTHLY')).toBe(true)

    const may = noPlan('2026-05')
    expect(may.confirmedPay).toEqual({ perPay: 300000, frequency: 'MONTHLY' })
    expect(may.figures).toEqual({ incomeCents: 300000, actualCents: 150000 })
    expect(may.savedCents).toBe(150000)
    expect(may.noSavedReason).toBeNull()
    // Overspent is a negative Saved.
    expect(noPlan('2026-06').savedCents).toBe(-10000)
    expect(noPlan('2026-08').savedCents).toBe(300000)
  })

  it('a single-month change touches that month only, and a later bulk confirm never overwrites it', () => {
    openSpendingAccount()
    expect(confirmPayForEarlierMonths('3000', 'MONTHLY')).toBe(true)

    expect(changePayForMonth('2026-05', '1200.50', 'FORTNIGHTLY')).toBe(true)
    expect(noPlan('2026-05').confirmedPay).toEqual({
      perPay: 120050,
      frequency: 'FORTNIGHTLY',
    })
    expect(noPlan('2026-04').confirmedPay?.perPay).toBe(300000)
    expect(noPlan('2026-06').confirmedPay?.perPay).toBe(300000)

    expect(confirmPayForEarlierMonths('5000', 'WEEKLY')).toBe(true)
    expect(noPlan('2026-05').confirmedPay?.perPay).toBe(120050)
    expect(noPlan('2026-06').confirmedPay).toEqual({
      perPay: 300000,
      frequency: 'MONTHLY',
    })
  })

  it('a bulk confirm fills only the months without a row', () => {
    openSpendingAccount()
    expect(changePayForMonth('2026-07', '2800', 'MONTHLY')).toBe(true)
    expect(noPlan('2026-06').confirmedPay).toBeNull()

    expect(confirmPayForEarlierMonths('3000', 'MONTHLY')).toBe(true)
    expect(noPlan('2026-06').confirmedPay?.perPay).toBe(300000)
    expect(noPlan('2026-07').confirmedPay?.perPay).toBe(280000)
  })

  it('turns a weekly, fortnightly or monthly pay into Income by the Income rule', () => {
    openSpendingAccount()
    // 1000.00 × 52/12 = 4333.333… → 4333.33
    changePayForMonth('2026-04', '1000', 'WEEKLY')
    // 1000.00 × 26/12 = 2166.666… → 2166.67
    changePayForMonth('2026-05', '1000', 'FORTNIGHTLY')
    changePayForMonth('2026-06', '1000', 'MONTHLY')

    expect(noPlan('2026-04').figures.incomeCents).toBe(433333)
    expect(noPlan('2026-05').figures.incomeCents).toBe(216667)
    expect(noPlan('2026-06').figures.incomeCents).toBe(100000)
  })

  it('refuses an amount of zero or less, a non-numeric or blank amount, and an unknown or unset frequency, writing nothing', () => {
    openSpendingAccount()
    const refused: [string, unknown][] = [
      ['0', 'MONTHLY'],
      ['0.00', 'MONTHLY'],
      ['-5', 'MONTHLY'],
      ['', 'MONTHLY'],
      ['3,000', 'MONTHLY'],
      ['$3000', 'MONTHLY'],
      ['abc', 'MONTHLY'],
      ['3000', 'YEARLY'],
      ['3000', null],
    ]
    for (const [amount, frequency] of refused) {
      expect(
        confirmPayForEarlierMonths(amount, frequency as 'MONTHLY' | null)
      ).toBe(false)
      expect(
        changePayForMonth('2026-05', amount, frequency as 'MONTHLY' | null)
      ).toBe(false)
    }
    expect(db.exec(`SELECT COUNT(*) FROM confirmed_pays`)[0].values).toEqual([
      [0],
    ])
  })

  it('refuses a single-month change outside the range', () => {
    openSpendingAccount()
    expect(changePayForMonth('2026-02', '3000', 'MONTHLY')).toBe(false)
    expect(changePayForMonth('2026-09', '3000', 'MONTHLY')).toBe(false)
    expect(changePayForMonth('2026-13', '3000', 'MONTHLY')).toBe(false)
    expect(db.exec(`SELECT COUNT(*) FROM confirmed_pays`)[0].values).toEqual([
      [0],
    ])
  })

  it('writes nothing when there are no Months without a plan', () => {
    expect(confirmPayForEarlierMonths('3000', 'MONTHLY')).toBe(false)
    expect(db.exec(`SELECT COUNT(*) FROM confirmed_pays`)[0].values).toEqual([
      [0],
    ])
  })

  it('Settings → Pay never writes or changes a Confirmed pay', () => {
    openSpendingAccount()
    expect(savePay('MONTHLY', '4000')).toBe(true)
    expect(noPlan('2026-05').confirmedPay).toBeNull()
    expect(noPlan('2026-05').noSavedReason).toBe('pay-not-confirmed')

    changePayForMonth('2026-05', '3000', 'MONTHLY')
    expect(savePay('WEEKLY', '9000')).toBe(true)
    expect(noPlan('2026-05').confirmedPay).toEqual({
      perPay: 300000,
      frequency: 'MONTHLY',
    })
  })

  it('reads a malformed row as no Confirmed pay', () => {
    openSpendingAccount()
    const rows: [string, unknown, string][] = [
      ['2026-04', 0, 'MONTHLY'],
      ['2026-05', -100, 'MONTHLY'],
      ['2026-06', 1234.5, 'MONTHLY'],
      ['2026-07', 300000, 'YEARLY'],
      ['2026-08', 'lots', 'MONTHLY'],
    ]
    for (const [month, cents, frequency] of rows) {
      db.run(
        `INSERT INTO confirmed_pays (month, pay_amount_cents, pay_frequency)
         VALUES (?, ?, ?)`,
        [month, cents as number, frequency]
      )
    }
    for (const [month] of rows) {
      const read = noPlan(month)
      expect(read.confirmedPay).toBeNull()
      expect(read.figures.incomeCents).toBeNull()
      expect(read.noSavedReason).toBe('pay-not-confirmed')
    }
  })
})

describe('when a Month without a plan declines Saved', () => {
  it('the opening month shows its spending but no Saved: a Part month', () => {
    openSpendingAccount()
    addTx({
      amount: -2000,
      day: '2026-03-20',
      category: 'fuel',
      parent: 'transport',
    })
    confirmPayForEarlierMonths('3000', 'MONTHLY')

    const march = noPlan('2026-03')
    expect(march.openingDate).toBe('2026-03-14')
    expect(march.firstPlannableMonth).toBe('2026-09')
    expect(march.figures).toEqual({ incomeCents: 300000, actualCents: 2000 })
    expect(march.spendingByCategory.totalCents).toBe(2000)
    expect(march.savedCents).toBeNull()
    expect(march.noSavedReason).toBe('part-month')
    // The month after is a full month.
    expect(noPlan('2026-04').noSavedReason).toBeNull()
  })

  it('a transfer to an account Vantura doesn’t hold declines Saved: a Closed Saver', () => {
    openSpendingAccount()
    addAccount({
      id: 'acc-saver',
      type: 'SAVER',
      createdAt: '2026-03-20T10:00:00+11:00',
    })
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    addTx({
      amount: -5000,
      day: '2026-05-04',
      category: 'fuel',
      parent: 'transport',
    })
    // To a Saver Vantura holds: fine.
    addTx({ amount: -20000, day: '2026-05-05', transferAccount: 'acc-saver' })
    addTx({
      amount: 20000,
      day: '2026-05-05',
      account: 'acc-saver',
      transferAccount: 'acc-spending',
    })
    expect(noPlan('2026-05').noSavedReason).toBeNull()

    // From a Saver that has since closed, back into the Spending account.
    addTx({ amount: 15000, day: '2026-06-30', transferAccount: 'acc-closed' })
    const june = noPlan('2026-06')
    expect(june.savedCents).toBeNull()
    expect(june.noSavedReason).toBe('closed-saver')
    expect(june.figures.incomeCents).toBe(300000)
    // Only the month it touched.
    expect(noPlan('2026-05').noSavedReason).toBeNull()
    expect(noPlan('2026-07').noSavedReason).toBeNull()
  })

  it('a transfer on a held Saver to an account Vantura doesn’t hold also declines', () => {
    openSpendingAccount()
    addAccount({
      id: 'acc-saver',
      type: 'SAVER',
      createdAt: '2026-03-20T10:00:00+11:00',
    })
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    addTx({
      amount: -1000,
      day: '2026-07-01',
      account: 'acc-saver',
      transferAccount: 'acc-closed',
    })
    expect(noPlan('2026-07').noSavedReason).toBe('closed-saver')
  })

  it('takes Part month, then Closed Saver, then Pay not confirmed when several apply', () => {
    openSpendingAccount()
    addTx({ amount: -1000, day: '2026-03-15', transferAccount: 'acc-closed' })
    addTx({ amount: -1000, day: '2026-04-15', transferAccount: 'acc-closed' })

    expect(noPlan('2026-03').noSavedReason).toBe('part-month')
    expect(noPlan('2026-04').noSavedReason).toBe('closed-saver')
    expect(noPlan('2026-05').noSavedReason).toBe('pay-not-confirmed')
  })
})

describe('which months read as a Month without a plan', () => {
  it('never pretends a plan existed: no buckets, Committed, Unallocated, Spent on plan or Unplanned', () => {
    openSpendingAccount()
    addTx({
      amount: -1000,
      day: '2026-05-03',
      category: 'fuel',
      parent: 'transport',
    })
    const may = noPlan('2026-05')
    expect(Object.keys(may).sort()).toEqual([
      'confirmedPay',
      'daysInMonth',
      'figures',
      'firstPlannableMonth',
      'month',
      'noSavedReason',
      'openingDate',
      'savedCents',
      'spendingByCategory',
      'state',
      'today',
    ])
    expect(Object.keys(may.figures).sort()).toEqual([
      'actualCents',
      'incomeCents',
    ])
    expect(JSON.stringify(may)).not.toMatch(/unplanned/i)
  })

  it('a plan month whose Month-end plan can’t be read still declines, never falling back', () => {
    openSpendingAccount()
    db.run(
      `INSERT INTO month_end_plans (month, plan_json, frozen_at)
       VALUES ('2026-09', 'not json', '2026-10-01T00:00:00Z')`
    )
    expect(getPlanVsActual('2026-09')).toBeNull()
    // October has no plan row at all.
    expect(getPlanVsActual('2026-10')).toBeNull()
  })

  it('a month before the opening month has no read', () => {
    openSpendingAccount()
    expect(getPlanVsActual('2026-02')).toBeNull()
  })

  it('without a range, a month before the First plannable month has no read', () => {
    expect(getPlanVsActual('2026-05')).toBeNull()
  })
})

describe('the Month review', () => {
  it('never offers a Month without a plan, even with a Saved', () => {
    openSpendingAccount()
    set('first_plannable_month', '2026-11')
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    expect(noPlan('2026-10').savedCents).toBe(300000)

    expect(getMonthReview('2026-11-12')).toBeNull()
  })

  it('never offers a Month without a plan, even when a stray plan row names it', () => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    db.run(
      `INSERT INTO month_end_plans (month, plan_json, frozen_at)
       VALUES ('2026-08', ?, '2026-09-01T00:00:00Z')`,
      [
        JSON.stringify({
          version: 1,
          buckets: [],
          regulars: [],
          trackers: [],
          pay: null,
          paidMarks: [],
        }),
      ]
    )
    expect(getMonthReview('2026-09-12')).toBeNull()
  })
})

describe('profile export and import', () => {
  it('carries every Confirmed pay to a new device', () => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    changePayForMonth('2026-05', '1200.50', 'FORTNIGHTLY')
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    expect(payload.version).toBe(19)
    expect(payload.confirmedPays).toEqual([
      { month: '2026-03', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
      { month: '2026-04', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
      {
        month: '2026-05',
        pay_amount_cents: 120050,
        pay_frequency: 'FORTNIGHTLY',
      },
      { month: '2026-06', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
      { month: '2026-07', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
      { month: '2026-08', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
    ])

    // A new device: no Confirmed pays yet.
    db.run(`DELETE FROM confirmed_pays`)
    importPayloadWithOptions(payload, ALL_SECTIONS)

    expect(noPlan('2026-05').confirmedPay).toEqual({
      perPay: 120050,
      frequency: 'FORTNIGHTLY',
    })
    expect(noPlan('2026-08').savedCents).toBe(300000)
    expect(confirmedPayRows()).toHaveLength(6)
  })

  it('an older export imports with none, so those months read Pay not confirmed', () => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    delete payload.confirmedPays
    payload.version = 18

    importPayloadWithOptions(payload, ALL_SECTIONS)

    expect(confirmedPayRows()).toEqual([])
    expect(noPlan('2026-05').noSavedReason).toBe('pay-not-confirmed')
  })

  it('leaves this device’s Confirmed pays alone when the Budget Plan isn’t imported', () => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    const rows = confirmedPayRows()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    payload.confirmedPays = []
    importPayloadWithOptions(payload, { ...ALL_SECTIONS, budgetPlan: false })
    expect(confirmedPayRows()).toEqual(rows)
  })

  it('never exports a malformed row', () => {
    openSpendingAccount()
    changePayForMonth('2026-05', '3000', 'MONTHLY')
    db.run(
      `INSERT INTO confirmed_pays (month, pay_amount_cents, pay_frequency)
       VALUES ('2026-06', 0, 'MONTHLY'), ('2026-07', 300000, 'YEARLY')`
    )
    expect(buildExportPayload().confirmedPays).toEqual([
      { month: '2026-05', pay_amount_cents: 300000, pay_frequency: 'MONTHLY' },
    ])
  })

  type Row = {
    month: unknown
    pay_amount_cents: unknown
    pay_frequency: unknown
  }
  type Corruptible = { confirmedPays: Row[]; firstPlannableMonth: unknown }

  it.each([
    [
      'a malformed month',
      (p: Corruptible) => (p.confirmedPays[0].month = '2026-5'),
    ],
    ['month 13', (p: Corruptible) => (p.confirmedPays[0].month = '2026-13')],
    [
      'a repeated month',
      (p: Corruptible) => p.confirmedPays.push({ ...p.confirmedPays[0] }),
    ],
    [
      'a month on the First plannable month',
      (p: Corruptible) => (p.confirmedPays[0].month = '2026-09'),
    ],
    [
      'pays without a First plannable month',
      (p: Corruptible) => (p.firstPlannableMonth = null),
    ],
    [
      'a zero amount',
      (p: Corruptible) => (p.confirmedPays[0].pay_amount_cents = 0),
    ],
    [
      'a negative amount',
      (p: Corruptible) => (p.confirmedPays[0].pay_amount_cents = -100),
    ],
    [
      'a fractional amount',
      (p: Corruptible) => (p.confirmedPays[0].pay_amount_cents = 100.5),
    ],
    [
      'a text amount',
      (p: Corruptible) => (p.confirmedPays[0].pay_amount_cents = '300000'),
    ],
    [
      'an unknown frequency',
      (p: Corruptible) => (p.confirmedPays[0].pay_frequency = 'YEARLY'),
    ],
    [
      'no frequency',
      (p: Corruptible) => (p.confirmedPays[0].pay_frequency = null),
    ],
    [
      'a non-array section',
      (p: Corruptible) => (p.confirmedPays = {} as Row[]),
    ],
  ])('refuses the whole import for %s', (_name, corrupt) => {
    openSpendingAccount()
    confirmPayForEarlierMonths('3000', 'MONTHLY')
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    // This device has something different, to show nothing is replaced.
    changePayForMonth('2026-05', '1000', 'WEEKLY')
    const rows = confirmedPayRows()
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
       VALUES ('Synthetic bucket', 'mdi-home', 0, '2026-01-01')`
    )
    corrupt(payload)

    expect(() => importPayloadWithOptions(payload, ALL_SECTIONS)).toThrow(
      IMPORT_ERROR_INVALID_CONFIRMED_PAY
    )
    expect(confirmedPayRows()).toEqual(rows)
    // The rest of the import rolled back too.
    expect(db.exec(`SELECT name FROM budget_buckets`)[0].values).toEqual([
      ['Synthetic bucket'],
    ])
  })
})
