/**
 * #240: the plan vs actual read for the current month, exercised through
 * `getPlanVsActual` against a real sql.js DB in an AU zone, "today" fixed at
 * 2026-10-20 unless a test moves it. Synthetic data only.
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

const { getPlanVsActual } = await import('./planVsActual')
const { getMonthAttribution } = await import('./monthAttribution')
const { getHeadroom } = await import('./headroom')
const { markOccurrencePaid } = await import('./regulars')

const ORIGINAL_TZ = process.env.TZ
let txCounter = 0

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

function addBucket(name: string, sortOrder: number): number {
  db.run(
    `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
     VALUES (?, 'mdi-wallet', ?, '2026-01-01')`,
    [name, sortOrder]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

function addRegular(seed: {
  name: string
  amount: number
  date: string
  frequency?: string
  matchDescription?: string | null
  bucketId?: number | null
}): number {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at,
       match_description, bucket_id)
     VALUES (?, ?, ?, ?, '2026-01-01', ?, ?)`,
    [
      seed.name,
      seed.amount,
      seed.frequency ?? 'MONTHLY',
      seed.date,
      seed.matchDescription ?? null,
      seed.bucketId ?? null,
    ]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

function addTracker(seed: {
  name: string
  budget: number
  categories: string[]
  bucketId?: number | null
}): number {
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date,
       last_reset_date, next_reset_date, is_active, created_at, bucket_id)
     VALUES (?, ?, 'MONTHLY', 1, '2026-01-01', '2026-10-01', '2026-11-01', 1, '2026-01-01', ?)`,
    [seed.name, seed.budget, seed.bucketId ?? null]
  )
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  db.run(
    `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, reset_frequency, created_at)
     VALUES (?, '2026-01-01', ?, 'MONTHLY', '2026-01-01')`,
    [id, seed.budget]
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

function setPay(cents: number) {
  appSettings.pay_amount_cents = String(cents)
  appSettings.payday_frequency = 'MONTHLY'
}

function setToday(day: string) {
  // Midday in Sydney, so the local date is `day`.
  vi.setSystemTime(new Date(`${day}T12:00:00+11:00`))
}

function read(month = '2026-10') {
  const result = getPlanVsActual(month)
  if (!result) throw new Error(`expected a read for ${month}`)
  return result
}

function item(
  result: ReturnType<typeof read>,
  name: string
): ReturnType<typeof read>['notInABucket']['items'][number] {
  const all = [
    ...result.buckets.flatMap((b) => b.items),
    ...result.notInABucket.items,
  ]
  const found = all.find((i) => i.name === name)
  if (!found) throw new Error(`no item ${name}`)
  return found
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-10-20')
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0
  appSettings = {}
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
       ownership_type, counts_on_hand)
     VALUES ('acc-spending', 'Spending', 'TRANSACTIONAL', 100000, '2026-01-01', '2026-01-01',
       'INDIVIDUAL', 0)`
  )
  db.run(
    `INSERT INTO categories (id, name, parent_id) VALUES ('good-life', 'Good Life', NULL)`
  )
  for (const cat of ['groceries', 'fuel']) {
    db.run(`INSERT INTO categories (id, name, parent_id) VALUES (?, ?, NULL)`, [
      cat,
      cat,
    ])
  }
  for (const cat of ['takeaway', 'pubs']) {
    db.run(
      `INSERT INTO categories (id, name, parent_id) VALUES (?, ?, 'good-life')`,
      [cat, cat]
    )
  }
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('the month', () => {
  it('is in progress for the current month, with day N of M', () => {
    const result = read()
    expect(result.month).toBe('2026-10')
    expect(result.state).toBe('in-progress')
    expect(result.today).toBe('2026-10-20')
    expect(result.dayOfMonth).toBe(20)
    expect(result.daysInMonth).toBe(31)
  })

  it('declines any month that isn’t the current one', () => {
    expect(getPlanVsActual('2026-09')).toBeNull()
    expect(getPlanVsActual('2026-11')).toBeNull()
  })
})

describe('bar segments and figures', () => {
  it('splits total Actual spending into Spent on plan and Spent unplanned', () => {
    const bills = addBucket('Bills', 0)
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
      bucketId: bills,
    })
    addTracker({ name: 'Food', budget: 50000, categories: ['groceries'] })
    addTx({
      amount: -12500,
      day: '2026-10-09',
      description: 'Synthetic Power Co',
    })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })
    addTx({ amount: -1500, day: '2026-10-12', category: null })

    const result = read()

    expect(result.bar.spentOnPlanCents).toBe(12500 + 20000)
    expect(result.bar.spentUnplannedCents).toBe(7000 + 1500)
    expect(result.bar.spentOnPlanCents + result.bar.spentUnplannedCents).toBe(
      result.figures.actualCents
    )
    expect(result.figures.actualCents).toBe(
      getMonthAttribution('2026-10').totalActualSpendingCents
    )
  })

  it('counts Not in a bucket as Spent on plan, planning $0 toward Committed', () => {
    setPay(500000)
    const food = addBucket('Food', 0)
    addTracker({
      name: 'Groceries',
      budget: 60000,
      categories: ['groceries'],
      bucketId: food,
    })
    addTracker({ name: 'Fuel', budget: 20000, categories: ['fuel'] })
    addTx({ amount: -10000, day: '2026-10-03', category: 'groceries' })
    addTx({ amount: -4000, day: '2026-10-04', category: 'fuel' })

    const result = read()

    expect(result.notInABucket.items.map((i) => i.name)).toEqual(['Fuel'])
    expect(result.notInABucket.plannedCents).toBe(20000)
    expect(result.notInABucket.actualCents).toBe(4000)
    expect(result.bar.spentOnPlanCents).toBe(14000)
    expect(result.bar.spentUnplannedCents).toBe(0)
    expect(result.figures.committedCents).toBe(60000)
    expect(result.figures.unallocatedCents).toBe(500000 - 60000)
  })

  it('raises Committed for a quarterly Regular only in its month', () => {
    const bills = addBucket('Bills', 0)
    addRegular({
      name: 'Water',
      amount: 30000,
      date: '2026-10-15',
      frequency: 'QUARTERLY',
      bucketId: bills,
    })

    expect(read().figures.committedCents).toBe(30000)

    setToday('2026-11-10')
    const november = read('2026-11')
    expect(november.figures.committedCents).toBe(0)
    expect(item(november, 'Water')).toMatchObject({
      plannedCents: 0,
      state: { kind: 'not-due' },
    })

    setToday('2027-01-10')
    expect(read('2027-01').figures.committedCents).toBe(30000)
  })

  it('forecasts If the rest goes to plan as Income − Actual − Still to go out', () => {
    setPay(400000)
    addRegular({ name: 'Rent', amount: 150000, date: '2026-10-25' })
    addTracker({ name: 'Food', budget: 50000, categories: ['groceries'] })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })

    const result = read()

    expect(result.bar.stillToGoOutCents).toBe(getHeadroom().stillToGoOutCents)
    expect(result.bar.stillToGoOutCents).toBe(150000 + 30000)
    expect(result.bar.ifTheRestGoesToPlanCents).toBe(400000 - 27000 - 180000)
  })

  it('can forecast a negative If the rest goes to plan', () => {
    setPay(100000)
    addRegular({ name: 'Rent', amount: 150000, date: '2026-10-25' })

    expect(read().bar.ifTheRestGoesToPlanCents).toBe(-50000)
  })

  it('declines If the rest goes to plan when Still to go out declines', () => {
    setPay(400000)
    const id = addTracker({
      name: 'Food',
      budget: 50000,
      categories: ['groceries'],
    })
    // A legacy cadence the attribution read can't price.
    db.run(
      `UPDATE tracker_config_history SET reset_frequency = 'PAYDAY' WHERE tracker_id = ?`,
      [id]
    )

    const result = read()

    expect(result.bar.stillToGoOutCents).toBeNull()
    expect(result.bar.ifTheRestGoesToPlanCents).toBeNull()
  })

  it('shows Free spending so far as Income − total Actual spending', () => {
    setPay(300000)
    addTx({ amount: -25000, day: '2026-10-11', category: 'fuel' })

    const result = read()
    expect(result.freeSpendingSoFarCents).toBe(275000)
    expect(result.freeSpendingSoFarCents).toBe(
      getHeadroom().freeSpendingSoFarCents
    )
  })

  it('leaves every Income-based figure null when no pay amount is set', () => {
    const bills = addBucket('Bills', 0)
    addRegular({
      name: 'Rent',
      amount: 150000,
      date: '2026-10-25',
      bucketId: bills,
    })
    addTx({ amount: -7000, day: '2026-10-11', category: 'fuel' })

    const result = read()

    expect(result.freeSpendingSoFarCents).toBeNull()
    expect(result.figures.incomeCents).toBeNull()
    expect(result.figures.unallocatedCents).toBeNull()
    expect(result.bar.ifTheRestGoesToPlanCents).toBeNull()
    expect(result.figures.committedCents).toBe(150000)
    expect(result.figures.actualCents).toBe(7000)
    expect(result.bar.stillToGoOutCents).toBe(150000)
  })
})

describe('buckets and items', () => {
  it('lists every bucket in Budget Plan order, empty ones included', () => {
    const later = addBucket('Later', 1)
    const first = addBucket('First', 0)
    addTracker({
      name: 'Food',
      budget: 50000,
      categories: ['groceries'],
      bucketId: later,
    })

    expect(read().buckets.map((b) => [b.bucketId, b.items.length])).toEqual([
      [first, 0],
      [later, 1],
    ])
  })

  it('treats a bucket id that names no bucket as not in a bucket', () => {
    addTracker({
      name: 'Food',
      budget: 50000,
      categories: ['groceries'],
      bucketId: 999,
    })

    const result = read()
    expect(result.buckets).toEqual([])
    expect(result.notInABucket.items.map((i) => i.name)).toEqual(['Food'])
    expect(result.figures.committedCents).toBe(0)
  })

  it('totals each bucket’s planned and actual over its items', () => {
    const home = addBucket('Home', 0)
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
      bucketId: home,
    })
    addRegular({
      name: 'Rent',
      amount: 150000,
      date: '2026-10-25',
      bucketId: home,
    })
    addTracker({
      name: 'Groceries',
      budget: 50000,
      categories: ['groceries'],
      bucketId: home,
    })
    addTx({
      amount: -11000,
      day: '2026-10-09',
      description: 'Synthetic Power Co',
    })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })

    const [bucket] = read().buckets
    expect(bucket.items.map((i) => i.name)).toEqual([
      'Groceries',
      'Power',
      'Rent',
    ])
    expect(bucket.plannedCents).toBe(12000 + 150000 + 50000)
    expect(bucket.actualCents).toBe(11000 + 20000)
  })

  it('takes each item’s planned and actual from the attribution read', () => {
    const home = addBucket('Home', 0)
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
      bucketId: home,
    })
    addRegular({
      name: 'Cleaner',
      amount: 3000,
      date: '2026-10-06',
      frequency: 'WEEKLY',
    })
    addTracker({
      name: 'Groceries',
      budget: 50000,
      categories: ['groceries'],
      bucketId: home,
    })
    addTracker({ name: 'Fuel', budget: 20000, categories: ['fuel'] })
    addTx({
      amount: -12000,
      day: '2026-10-09',
      description: 'Synthetic Power Co',
    })
    addTx({ amount: -20000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: 500, day: '2026-10-11', category: 'groceries' })
    addTx({ amount: -9000, day: '2026-10-12', category: 'fuel' })

    const result = read()
    const attribution = getMonthAttribution('2026-10')
    const items = [
      ...result.buckets.flatMap((b) => b.items),
      ...result.notInABucket.items,
    ]

    for (const line of attribution.regulars) {
      const found = items.find(
        (i) => i.type === 'regular' && i.regularId === line.regularId
      )
      expect(found).toMatchObject({
        plannedCents: line.plannedCents,
        actualCents: line.actualCents,
      })
    }
    for (const line of attribution.trackers) {
      const found = items.find(
        (i) => i.type === 'tracker' && i.trackerId === line.trackerId
      )
      expect(found).toMatchObject({
        plannedCents: line.plannedCents,
        actualCents: line.actualCents,
      })
    }
    expect(items).toHaveLength(
      attribution.regulars.length + attribution.trackers.length
    )
  })

  it('passes Unplanned through, refunds making it negative', () => {
    addTx({ amount: -3000, day: '2026-10-05', category: 'takeaway' })
    addTx({ amount: 8000, day: '2026-10-06', category: 'pubs' })

    const result = read()

    expect(result.unplanned).toEqual(getMonthAttribution('2026-10').unplanned)
    expect(result.bar.spentUnplannedCents).toBe(-5000)
    expect(result.unplanned.parents).toEqual([
      {
        parentCategoryId: 'good-life',
        totalCents: -5000,
        subcategories: [
          { categoryId: 'pubs', totalCents: -8000 },
          { categoryId: 'takeaway', totalCents: 3000 },
        ],
      },
    ])
    expect(result.figures.actualCents).toBe(-5000)
  })
})

describe('Tracker state and pace', () => {
  it('shows $x left at or under planned, and $x over above it', () => {
    addTracker({ name: 'Food', budget: 50000, categories: ['groceries'] })
    addTracker({ name: 'Fuel', budget: 20000, categories: ['fuel'] })
    addTx({ amount: -30000, day: '2026-10-10', category: 'groceries' })
    addTx({ amount: -26000, day: '2026-10-11', category: 'fuel' })

    const result = read()
    expect(item(result, 'Food').state).toEqual({ kind: 'left', cents: 20000 })
    expect(item(result, 'Fuel').state).toEqual({ kind: 'over', cents: 6000 })
  })

  it('paces planned × elapsed days ÷ days in month, 1st through today', () => {
    addTracker({ name: 'Food', budget: 31000, categories: ['groceries'] })

    setToday('2026-10-01')
    expect(item(read(), 'Food')).toMatchObject({ paceCents: 1000 })

    setToday('2026-10-16')
    expect(item(read(), 'Food')).toMatchObject({ paceCents: 16000 })

    setToday('2026-10-31')
    expect(item(read(), 'Food')).toMatchObject({ paceCents: 31000 })
  })

  it('rounds pace to the nearest cent', () => {
    addTracker({ name: 'Food', budget: 10000, categories: ['groceries'] })
    setToday('2026-10-01')
    // 10000 × 1 ÷ 31 = 322.58…
    expect(item(read(), 'Food')).toMatchObject({ paceCents: 323 })
  })

  it('shows a Tracker with no planned figure with its actual, no pace and nothing toward Committed', () => {
    const food = addBucket('Food', 0)
    const id = addTracker({
      name: 'Groceries',
      budget: 50000,
      categories: ['groceries'],
      bucketId: food,
    })
    db.run(
      `UPDATE tracker_config_history SET reset_frequency = 'PAYDAY' WHERE tracker_id = ?`,
      [id]
    )
    addTx({ amount: -12000, day: '2026-10-10', category: 'groceries' })

    const result = read()

    expect(item(result, 'Groceries')).toEqual({
      type: 'tracker',
      trackerId: id,
      name: 'Groceries',
      plannedCents: null,
      actualCents: 12000,
      paceCents: null,
      state: { kind: 'no-planned-figure' },
    })
    expect(result.figures.committedCents).toBe(0)
    expect(result.bar.spentOnPlanCents).toBe(12000)
  })
})

describe('Regular state', () => {
  it('shows not paid yet for an unpaid occurrence today or later', () => {
    addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-20',
      matchDescription: 'Synthetic Phone Co',
    })
    expect(item(read(), 'Phone').state).toEqual({ kind: 'not-paid-yet' })
  })

  it('shows overdue for an unpaid occurrence before today', () => {
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
    })
    expect(item(read(), 'Power').state).toEqual({ kind: 'overdue' })
  })

  it('keeps the chip until every occurrence in the month is paid', () => {
    addRegular({
      name: 'Cleaner',
      amount: 3000,
      date: '2026-10-06',
      frequency: 'WEEKLY',
      matchDescription: 'Synthetic Cleaner',
    })
    for (const day of ['2026-10-06', '2026-10-13']) {
      addTx({ amount: -3000, day, description: 'Synthetic Cleaner' })
    }

    // 20 and 27 October are still to come.
    expect(item(read(), 'Cleaner')).toMatchObject({
      plannedCents: 12000,
      actualCents: 6000,
      state: { kind: 'not-paid-yet' },
    })
  })

  it('shows under or over once paid, by actual − planned', () => {
    addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
    })
    addRegular({
      name: 'Water',
      amount: 10000,
      date: '2026-10-09',
      matchDescription: 'Synthetic Water Co',
    })
    addRegular({
      name: 'Gas',
      amount: 8000,
      date: '2026-10-10',
      matchDescription: 'Synthetic Gas Co',
    })
    addTx({
      amount: -11000,
      day: '2026-10-08',
      description: 'Synthetic Power Co',
    })
    addTx({
      amount: -11500,
      day: '2026-10-09',
      description: 'Synthetic Water Co',
    })
    addTx({ amount: -8000, day: '2026-10-10', description: 'Synthetic Gas Co' })

    const result = read()
    expect(item(result, 'Power').state).toEqual({ kind: 'under', cents: 1000 })
    expect(item(result, 'Water').state).toEqual({ kind: 'over', cents: 1500 })
    expect(item(result, 'Gas').state).toEqual({ kind: 'under', cents: 0 })
  })

  it('lists the unpaid occurrence dates, oldest first, for Mark paid', () => {
    const cleaner = addRegular({
      name: 'Cleaner',
      amount: 3000,
      date: '2026-10-06',
      frequency: 'WEEKLY',
    })
    expect(markOccurrencePaid(cleaner, '2026-10-13')).toBe(true)

    expect(item(read(), 'Cleaner')).toMatchObject({
      unpaidDates: ['2026-10-06', '2026-10-20', '2026-10-27'],
    })
  })

  it('shows under once marked paid with no Linked payment', () => {
    const power = addRegular({
      name: 'Power',
      amount: 12000,
      date: '2026-10-08',
      matchDescription: 'Synthetic Power Co',
    })
    expect(markOccurrencePaid(power, '2026-10-08')).toBe(true)

    expect(item(read(), 'Power')).toMatchObject({
      actualCents: 0,
      state: { kind: 'under', cents: 12000 },
    })
  })

  describe('with no actual figure (no match description)', () => {
    it('shows no actual figure · Mark paid for an occurrence today or later', () => {
      addRegular({ name: 'Rent', amount: 150000, date: '2026-10-25' })
      expect(item(read(), 'Rent')).toMatchObject({
        plannedCents: 150000,
        actualCents: null,
        state: { kind: 'no-actual-figure' },
      })
    })

    it('shows overdue first when the occurrence is before today', () => {
      addRegular({ name: 'Rent', amount: 150000, date: '2026-10-05' })
      expect(item(read(), 'Rent').state).toEqual({ kind: 'overdue' })
    })

    it('shows paid, with no amount, once marked', () => {
      const rent = addRegular({
        name: 'Rent',
        amount: 150000,
        date: '2026-10-05',
      })
      expect(markOccurrencePaid(rent, '2026-10-05')).toBe(true)
      expect(item(read(), 'Rent').state).toEqual({ kind: 'paid' })
    })

    it('adds nothing to Spent on plan', () => {
      addRegular({ name: 'Rent', amount: 150000, date: '2026-10-05' })
      addTx({ amount: -150000, day: '2026-10-05', description: 'Rent' })

      const result = read()
      expect(result.bar.spentOnPlanCents).toBe(0)
      expect(result.bar.spentUnplannedCents).toBe(150000)
    })
  })

  describe('with no occurrence in the month', () => {
    it('is listed as not due with planned $0', () => {
      addRegular({
        name: 'Rego',
        amount: 80000,
        date: '2027-03-01',
        frequency: 'YEARLY',
      })
      expect(item(read(), 'Rego')).toMatchObject({
        plannedCents: 0,
        state: { kind: 'not-due' },
      })
    })

    it('shows over by its actual when a Linked payment still lands in the month', () => {
      // A quarterly Regular dated 28 September, paid late on 2 October: the
      // payment counts in October, which has no occurrence.
      addRegular({
        name: 'Insurance',
        amount: 40000,
        date: '2026-09-28',
        frequency: 'QUARTERLY',
        matchDescription: 'Synthetic Insurer',
      })
      addTx({
        amount: -40000,
        day: '2026-10-02',
        description: 'Synthetic Insurer',
      })

      expect(item(read(), 'Insurance')).toMatchObject({
        plannedCents: 0,
        actualCents: 40000,
        state: { kind: 'over', cents: 40000 },
      })
    })
  })
})
