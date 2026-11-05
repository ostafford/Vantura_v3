/**
 * #215: the Still to go out, Headroom and Free spending so far reads,
 * exercised through `getHeadroom` against a real sql.js DB in an AU zone,
 * "today" fixed at 2026-10-20. Synthetic data only.
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
let appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: () => {},
  schedulePersist: () => {},
}))

const { getHeadroom } = await import('./headroom')
const { getMonthAttribution } = await import('./monthAttribution')
const { markOccurrencePaid } = await import('./regulars')

const ORIGINAL_TZ = process.env.TZ
let txCounter = 0

function addAccount(
  id: string,
  type: string,
  balance: number,
  opts: { ownership?: string; onHand?: boolean } = {}
) {
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
       ownership_type, counts_on_hand)
     VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01', ?, ?)`,
    [id, id, type, balance, opts.ownership ?? 'INDIVIDUAL', opts.onHand ? 1 : 0]
  )
}

function addTx(seed: {
  amount: number
  day: string
  description?: string
  category?: string | null
}) {
  txCounter += 1
  const createdAt = `${seed.day}T12:00:00+11:00`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       amount, created_at, settled_at, source)
     VALUES (?, 'acc-spending', 'SETTLED', ?, ?, ?, ?, ?, 'up')`,
    [
      `tx-${txCounter}`,
      seed.description ?? 'Synthetic Shop',
      seed.category ?? null,
      seed.amount,
      createdAt,
      createdAt,
    ]
  )
}

function addRegular(seed: {
  name: string
  amount: number
  date: string
  frequency?: string
  matchDescription?: string | null
}): number {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at,
       match_description)
     VALUES (?, ?, ?, ?, '2026-01-01', ?)`,
    [
      seed.name,
      seed.amount,
      seed.frequency ?? 'MONTHLY',
      seed.date,
      seed.matchDescription ?? null,
    ]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

function addTracker(seed: {
  name: string
  budget: number
  categories: string[]
  active?: boolean
  frequency?: string
}): number {
  const frequency = seed.frequency ?? 'MONTHLY'
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date,
       last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, 1, '2026-01-01', '2026-10-01', '2026-11-01', ?, '2026-01-01')`,
    [seed.name, seed.budget, frequency, seed.active === false ? 0 : 1]
  )
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  db.run(
    `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, reset_frequency, created_at)
     VALUES (?, '2026-01-01', ?, ?, '2026-01-01')`,
    [id, seed.budget, frequency]
  )
  const configId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  for (const cat of seed.categories) {
    db.run(
      `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [id, cat]
    )
    db.run(
      `INSERT INTO tracker_config_history_categories (config_id, category_id) VALUES (?, ?)`,
      [configId, cat]
    )
  }
  return id
}

function setPay(cents: number, frequency = 'MONTHLY') {
  appSettings.pay_amount_cents = String(cents)
  appSettings.payday_frequency = frequency
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T01:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  appSettings = {}
  addAccount('acc-spending', 'TRANSACTIONAL', 100000)
  for (const cat of ['groceries', 'takeaway', 'fuel']) {
    db.run(`INSERT INTO categories (id, name, parent_id) VALUES (?, ?, NULL)`, [
      cat,
      cat,
    ])
  }
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('Regulars not paid yet', () => {
  it('lists this month’s unpaid occurrences with an overdue flag for dates before today', () => {
    const rent = addRegular({
      name: 'Rent',
      amount: 150000,
      date: '2026-10-05',
    })
    const phone = addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-20',
    })
    const gym = addRegular({ name: 'Gym', amount: 2000, date: '2026-10-28' })
    addRegular({ name: 'Next month', amount: 9999, date: '2026-11-03' })

    const result = getHeadroom()

    expect(result.month).toBe('2026-10')
    expect(result.today).toBe('2026-10-20')
    expect(result.regularsNotPaidYet).toEqual([
      {
        regularId: rent,
        name: 'Rent',
        date: '2026-10-05',
        amountCents: 150000,
        overdue: true,
      },
      {
        regularId: phone,
        name: 'Phone',
        date: '2026-10-20',
        amountCents: 5000,
        overdue: false,
      },
      {
        regularId: gym,
        name: 'Gym',
        date: '2026-10-28',
        amountCents: 2000,
        overdue: false,
      },
    ])
    expect(result.regularsNotPaidYetCents).toBe(157000)
  })

  it('lists every unpaid occurrence of a weekly Regular in the month', () => {
    addRegular({
      name: 'Cleaner',
      amount: 1000,
      date: '2026-10-06',
      frequency: 'WEEKLY',
    })

    const result = getHeadroom()

    expect(result.regularsNotPaidYet.map((r) => [r.date, r.overdue])).toEqual([
      ['2026-10-06', true],
      ['2026-10-13', true],
      ['2026-10-20', false],
      ['2026-10-27', false],
    ])
    expect(result.regularsNotPaidYetCents).toBe(4000)
  })

  it('drops an occurrence paid by a Linked payment', () => {
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
    })
    addTx({
      amount: -12000,
      day: '2026-10-09',
      description: 'Synthetic Power Co',
    })

    expect(getHeadroom().regularsNotPaidYet).toEqual([])
  })

  it('drops an occurrence marked paid', () => {
    const rent = addRegular({
      name: 'Rent',
      amount: 150000,
      date: '2026-10-05',
    })
    expect(markOccurrencePaid(rent, '2026-10-05')).toBe(true)

    const result = getHeadroom()
    expect(result.regularsNotPaidYet).toEqual([])
    expect(result.regularsNotPaidYetCents).toBe(0)
  })
})

describe('Left in trackers', () => {
  it('floors each Tracker at $0 on its own, so an overspent Tracker doesn’t reduce another', () => {
    const food = addTracker({
      name: 'Food',
      budget: 50000,
      categories: ['groceries'],
    })
    const fun = addTracker({
      name: 'Fun',
      budget: 10000,
      categories: ['takeaway'],
    })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -15000, day: '2026-10-11', category: 'takeaway' })

    const result = getHeadroom()

    expect(result.trackersLeft).toEqual([
      {
        trackerId: food,
        name: 'Food',
        plannedCents: 50000,
        actualCents: 20000,
        leftCents: 30000,
      },
      {
        trackerId: fun,
        name: 'Fun',
        plannedCents: 10000,
        actualCents: 15000,
        leftCents: 0,
      },
    ])
    expect(result.trackersLeftCents).toBe(30000)
  })

  it('excludes an inactive Tracker', () => {
    addTracker({
      name: 'Old',
      budget: 40000,
      categories: ['fuel'],
      active: false,
    })

    const result = getHeadroom()
    expect(result.trackersLeft).toEqual([])
    expect(result.trackersLeftCents).toBe(0)
  })

  it('takes planned and actual from the attribution read for the same month', () => {
    addTracker({
      name: 'Food',
      budget: 10000,
      categories: ['groceries'],
      frequency: 'WEEKLY',
    })
    addTracker({ name: 'Fuel', budget: 30000, categories: ['fuel'] })
    addTx({ amount: -4000, day: '2026-10-03', category: 'groceries' })
    addTx({ amount: 500, day: '2026-10-04', category: 'groceries' })
    addTx({ amount: -9000, day: '2026-10-12', category: 'fuel' })

    const attribution = getMonthAttribution('2026-10')
    const result = getHeadroom()

    expect(
      result.trackersLeft.map((t) => [
        t.trackerId,
        t.plannedCents,
        t.actualCents,
      ])
    ).toEqual(
      attribution.trackers.map((t) => [
        t.trackerId,
        t.plannedCents,
        t.actualCents,
      ])
    )
  })

  it('declines Still to go out and Headroom when a Tracker can’t be priced', () => {
    const id = addTracker({
      name: 'Food',
      budget: 10000,
      categories: ['groceries'],
    })
    // A legacy cadence the attribution read can't price.
    db.run(
      `UPDATE tracker_config_history SET reset_frequency = 'PAYDAY' WHERE tracker_id = ?`,
      [id]
    )
    addRegular({ name: 'Rent', amount: 150000, date: '2026-10-05' })

    const result = getHeadroom()
    expect(result.trackersLeft[0].plannedCents).toBeNull()
    expect(result.trackersLeft[0].leftCents).toBeNull()
    expect(result.trackersLeftCents).toBeNull()
    expect(result.stillToGoOutCents).toBeNull()
    expect(result.headroomCents).toBeNull()
  })
})

describe('Still to go out and Headroom', () => {
  it('sums Regulars not paid yet and Left in trackers, leaving Unplanned out', () => {
    addAccount('acc-saver-on', 'SAVER', 50000, { onHand: true })
    addAccount('acc-saver-off', 'SAVER', 900000)
    addRegular({ name: 'Rent', amount: 60000, date: '2026-10-25' })
    addTracker({ name: 'Food', budget: 50000, categories: ['groceries'] })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })

    const result = getHeadroom()

    expect(result.onHandCents).toBe(150000)
    expect(result.stillToGoOutCents).toBe(60000 + 30000)
    expect(result.headroomCents).toBe(150000 - 90000)
  })

  it('is negative and unclamped when Still to go out exceeds On hand', () => {
    addRegular({ name: 'Rent', amount: 150000, date: '2026-10-05' })
    addTracker({ name: 'Food', budget: 20000, categories: ['groceries'] })

    const result = getHeadroom()

    expect(result.stillToGoOutCents).toBe(170000)
    expect(result.headroomCents).toBe(-70000)
  })
})

describe('Free spending so far', () => {
  it('is monthly Income minus total Actual spending to date', () => {
    setPay(200000, 'FORTNIGHTLY')
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
    })
    addTracker({ name: 'Food', budget: 50000, categories: ['groceries'] })
    addTx({
      amount: -12000,
      day: '2026-10-09',
      description: 'Synthetic Power Co',
    })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })

    const income = Math.round((200000 * 26) / 12)
    expect(getHeadroom().freeSpendingSoFarCents).toBe(income - 39000)
  })

  it('can be negative', () => {
    setPay(10000)
    addTx({ amount: -25000, day: '2026-10-11', category: 'fuel' })

    expect(getHeadroom().freeSpendingSoFarCents).toBe(-15000)
  })

  it('is not set (null) when Income isn’t set', () => {
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })

    expect(getHeadroom().freeSpendingSoFarCents).toBeNull()
  })
})
