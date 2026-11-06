/**
 * #243: a finished month's plan vs actual, judged against its Month-end plan
 * (#242) over live transactions. Real sql.js DB in an AU zone; October 2026
 * is frozen on 1 November and read on 7 November. Synthetic data only.
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

const { getPlanVsActual } = await import('./planVsActual')
type Finished = Extract<
  NonNullable<ReturnType<typeof getPlanVsActual>>,
  { state: 'finished' }
>
const {
  freezeMonthEndPlans,
  getMonthEndPlan,
  markFrozenOccurrencePaid,
  unmarkFrozenOccurrencePaid,
} = await import('./monthEndPlan')
const {
  deleteRegular,
  draftFromRegular,
  markOccurrencePaid,
  readPaidMarks,
  regularById,
  saveRegular,
} = await import('./regulars')
const { assignUpcomingToBucket, deleteBucket, updateBucket } =
  await import('./budgetBuckets')

const ORIGINAL_TZ = process.env.TZ
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
     VALUES (?, 'mdi-home', ?, '2026-01-01')`,
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
     VALUES (?, ?, 'MONTHLY', 1, '2026-01-01', '2026-11-01', '2026-12-01', 1, '2026-01-01', ?)`,
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

/** Freezes October on 1 November, then reads it on 7 November. */
function freezeOctober() {
  setToday('2026-11-01')
  expect(freezeMonthEndPlans()).toEqual(['2026-10'])
  setToday('2026-11-07')
}

function october(): Finished {
  const result = getPlanVsActual('2026-10')
  if (!result || result.state !== 'finished') {
    throw new Error('expected a finished read for October')
  }
  return result
}

function item(result: Finished, name: string) {
  const found = [
    ...result.buckets.flatMap((b) => b.items),
    ...result.notInABucket.items,
  ].find((i) => i.name === name)
  if (!found) throw new Error(`no item ${name}`)
  return found
}

/** The figures a later live edit must not change. */
function figures(result: Finished) {
  return {
    savedCents: result.savedCents,
    bar: result.bar,
    figures: result.figures,
    buckets: result.buckets.map((b) => ({
      id: b.bucketId,
      name: b.name,
      planned: b.plannedCents,
      actual: b.actualCents,
      items: b.items.map((i) => [i.name, i.plannedCents, i.actualCents]),
    })),
    notInABucket: result.notInABucket.items.map((i) => i.name),
    unplanned: result.unplanned.totalCents,
  }
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
  set('onboarding_complete', '1')
  set('first_plannable_month', '2026-10')
  set('pay_amount_cents', '500000')
  set('payday_frequency', 'MONTHLY')
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
       ownership_type, counts_on_hand)
     VALUES ('acc-spending', 'Spending', 'TRANSACTIONAL', 100000, '2026-01-01', '2026-01-01',
       'INDIVIDUAL', 0)`
  )
  for (const cat of ['groceries', 'fuel', 'takeaway']) {
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

describe('which months have a read', () => {
  it('a finished month with a Month-end plan is finished, judged on its plan', () => {
    freezeOctober()
    const result = october()
    expect(result.month).toBe('2026-10')
    expect(result.daysInMonth).toBe(31)
    expect(result.today).toBe('2026-11-07')
    expect(getPlanVsActual('2026-11')?.state).toBe('in-progress')
  })

  it('declines a finished month with no Month-end plan, a future month and a malformed one', () => {
    setToday('2026-11-07')
    expect(getPlanVsActual('2026-10')).toBeNull()
    expect(getPlanVsActual('2026-12')).toBeNull()
    expect(getPlanVsActual('2026-1')).toBeNull()
  })
})

describe('Saved and Overspent', () => {
  it('Saved = Income − total Actual spending', () => {
    addTracker({ name: 'Groceries', budget: 60000, categories: ['groceries'] })
    addTx({ amount: -45000, day: '2026-10-08', category: 'groceries' })
    addTx({ amount: -5000, day: '2026-10-12', category: 'fuel' })
    freezeOctober()

    const result = october()
    expect(result.figures.actualCents).toBe(50000)
    expect(result.savedCents).toBe(450000)
    expect(result.bar).toEqual({
      spentOnPlanCents: 45000,
      spentUnplannedCents: 5000,
      savedCents: 450000,
    })
  })

  it('is negative (Overspent) when spending passes Income', () => {
    addTx({ amount: -520000, day: '2026-10-08', category: 'fuel' })
    freezeOctober()
    expect(october().savedCents).toBe(-20000)
  })

  it('uses the pay frozen with the plan, not the pay set since', () => {
    addTx({ amount: -100000, day: '2026-10-08' })
    freezeOctober()
    set('pay_amount_cents', '900000')
    const result = october()
    expect(result.figures.incomeCents).toBe(500000)
    expect(result.savedCents).toBe(400000)
  })

  it('is null, with Income and Unallocated, when the plan had no pay', () => {
    set('pay_amount_cents', '')
    addTx({ amount: -100000, day: '2026-10-08' })
    freezeOctober()
    set('pay_amount_cents', '500000')
    const result = october()
    expect(result.savedCents).toBeNull()
    expect(result.bar.savedCents).toBeNull()
    expect(result.figures.incomeCents).toBeNull()
    expect(result.figures.unallocatedCents).toBeNull()
    expect(result.figures.actualCents).toBe(100000)
  })
})

describe('a finished month’s rows', () => {
  it('a Tracker is under or over, never left, with no pace', () => {
    addTracker({ name: 'Groceries', budget: 60000, categories: ['groceries'] })
    addTracker({ name: 'Fuel', budget: 10000, categories: ['fuel'] })
    addTx({ amount: -45000, day: '2026-10-08', category: 'groceries' })
    addTx({ amount: -12000, day: '2026-10-09', category: 'fuel' })
    freezeOctober()

    const result = october()
    expect(item(result, 'Groceries')).toMatchObject({
      paceCents: null,
      state: { kind: 'under', cents: 15000 },
    })
    expect(item(result, 'Fuel')).toMatchObject({
      paceCents: null,
      state: { kind: 'over', cents: 2000 },
    })
  })

  it('an unpaid Regular is no payment found, at its oldest unpaid occurrence', () => {
    addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-09-07',
      frequency: 'FORTNIGHTLY',
      matchDescription: 'Synthetic Realty',
    })
    addTx({
      amount: -200000,
      day: '2026-10-05',
      description: 'Synthetic Realty',
    })
    freezeOctober()
    expect(item(october(), 'Rent')).toMatchObject({
      plannedCents: 400000,
      actualCents: 200000,
      state: { kind: 'no-payment-found' },
      unpaidDates: ['2026-10-19'],
    })
  })

  it('a paid Regular is under or over by its actual', () => {
    addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-12',
      matchDescription: 'Synthetic Mobile',
    })
    addTx({ amount: -5500, day: '2026-10-12', description: 'Synthetic Mobile' })
    freezeOctober()
    expect(item(october(), 'Phone').state).toEqual({ kind: 'over', cents: 500 })
  })
})

describe('the plan stays frozen', () => {
  it('a Regular edited, deleted or moved between buckets leaves the past month’s figures unchanged', () => {
    const bills = addBucket('Bills', 0)
    const home = addBucket('Home', 1)
    const rent = addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-10-05',
      matchDescription: 'Synthetic Realty',
      bucketId: bills,
    })
    const phone = addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-12',
      matchDescription: 'Synthetic Mobile',
      bucketId: bills,
    })
    addRegular({
      name: 'Gym',
      amount: 3000,
      date: '2026-10-20',
      bucketId: home,
    })
    addTx({
      amount: -200000,
      day: '2026-10-05',
      description: 'Synthetic Realty',
    })
    addTx({ amount: -5000, day: '2026-10-12', description: 'Synthetic Mobile' })
    freezeOctober()
    const before = figures(october())

    const stored = regularById(rent)!
    saveRegular({
      ...draftFromRegular(stored, stored),
      name: 'Rent (new place)',
      amount: '2600.00',
      matchDescription: 'Other Realty',
      bucketId: home,
    })
    assignUpcomingToBucket(phone, home)
    deleteRegular(phone)
    updateBucket(bills, 'Renamed', 'mdi-star')
    deleteBucket(home)
    addRegular({
      name: 'New',
      amount: 9900,
      date: '2026-10-03',
      bucketId: bills,
    })

    expect(figures(october())).toEqual(before)
    expect(october().buckets.map((b) => b.name)).toEqual(['Bills', 'Home'])
  })

  it('matches Linked payments with the frozen description and band', () => {
    const rent = addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-10-05',
      matchDescription: 'Synthetic Realty',
    })
    addTx({
      amount: -230000,
      day: '2026-10-05',
      description: 'Synthetic Realty',
    })
    freezeOctober()
    // Raising the amount would put the payment outside the live band's floor;
    // the frozen band (±20% of $2,000) still links it.
    db.run(
      `UPDATE upcoming_charges SET amount = 400000, match_description = 'X' WHERE id = ?`,
      [rent]
    )
    expect(item(october(), 'Rent')).toMatchObject({
      actualCents: 230000,
      state: { kind: 'over', cents: 30000 },
    })
  })

  it('attributes with the frozen Tracker category sets and bucket membership', () => {
    const food = addBucket('Food', 0)
    const tracker = addTracker({
      name: 'Groceries',
      budget: 60000,
      categories: ['groceries'],
      bucketId: food,
    })
    addTx({ amount: -10000, day: '2026-10-08', category: 'groceries' })
    addTx({ amount: -2000, day: '2026-10-09', category: 'takeaway' })
    freezeOctober()
    // Later: the Tracker claims takeaway from October on, and leaves the bucket.
    db.run(
      `UPDATE tracker_config_history SET effective_from = '2026-01-01' WHERE tracker_id = ?`,
      [tracker]
    )
    db.run(
      `INSERT INTO tracker_config_history_categories (config_id, category_id)
       SELECT id, 'takeaway' FROM tracker_config_history WHERE tracker_id = ?`,
      [tracker]
    )
    db.run(`UPDATE trackers SET bucket_id = NULL WHERE id = ?`, [tracker])

    const result = october()
    expect(result.buckets[0].items.map((i) => i.name)).toEqual(['Groceries'])
    expect(item(result, 'Groceries').actualCents).toBe(10000)
    expect(result.unplanned.totalCents).toBe(2000)
  })
})

describe('actuals stay live', () => {
  it('a late transaction changes that month’s actuals and Saved', () => {
    addTracker({ name: 'Groceries', budget: 60000, categories: ['groceries'] })
    addTx({ amount: -10000, day: '2026-10-08', category: 'groceries' })
    freezeOctober()
    expect(october().savedCents).toBe(490000)

    // Synced on 7 November, dated 30 October.
    addTx({ amount: -7000, day: '2026-10-30', category: 'groceries' })
    addTx({ amount: -3000, day: '2026-10-31', category: 'fuel' })
    const result = october()
    expect(item(result, 'Groceries').actualCents).toBe(17000)
    expect(result.bar.spentUnplannedCents).toBe(3000)
    expect(result.figures.actualCents).toBe(20000)
    expect(result.savedCents).toBe(480000)
  })

  it('a late Linked payment pays the occurrence', () => {
    addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-12',
      matchDescription: 'Synthetic Mobile',
    })
    freezeOctober()
    expect(item(october(), 'Phone').state.kind).toBe('no-payment-found')
    addTx({ amount: -5000, day: '2026-10-13', description: 'Synthetic Mobile' })
    expect(item(october(), 'Phone').state).toEqual({ kind: 'under', cents: 0 })
  })
})

describe('Mark paid on a finished month', () => {
  function seed() {
    const phone = addRegular({
      name: 'Phone',
      amount: 5000,
      date: '2026-10-12',
      matchDescription: 'Synthetic Mobile',
    })
    addTx({ amount: -1000, day: '2026-10-03', category: 'fuel' })
    freezeOctober()
    return phone
  }

  it('writes to that month’s plan, not the live table, and changes neither Actual spending nor Saved', () => {
    const phone = seed()
    const before = october()
    expect(item(before, 'Phone').state.kind).toBe('no-payment-found')

    expect(markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')).toBe(true)

    const after = october()
    // Paid by the mark, with no Linked payment: the live month's rule, so
    // actual $0 against $50 planned.
    expect(item(after, 'Phone').state).toEqual({ kind: 'under', cents: 5000 })
    expect(readPaidMarks()).toEqual([])
    expect(getMonthEndPlan('2026-10')!.paidMarks).toEqual([
      {
        regularId: phone,
        occurrenceDate: '2026-10-12',
        markedAt: new Date().toISOString(),
      },
    ])
    expect(after.figures.actualCents).toBe(before.figures.actualCents)
    expect(after.savedCents).toBe(before.savedCents)
    expect(after.bar).toEqual(before.bar)
  })

  it('survives deleting the Regular, and works on a deleted one', () => {
    const phone = seed()
    markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')
    deleteRegular(phone)
    expect(getMonthEndPlan('2026-10')!.paidMarks).toHaveLength(1)
    expect(item(october(), 'Phone').state.kind).not.toBe('no-payment-found')

    unmarkFrozenOccurrencePaid('2026-10', phone, '2026-10-12')
    expect(item(october(), 'Phone').state.kind).toBe('no-payment-found')
    expect(markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')).toBe(true)
    expect(item(october(), 'Phone').state.kind).not.toBe('no-payment-found')
  })

  it('unmark restores the status and leaves the figures as they were', () => {
    const phone = seed()
    const before = october()
    markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')
    unmarkFrozenOccurrencePaid('2026-10', phone, '2026-10-12')
    expect(october()).toEqual(before)
    expect(getMonthEndPlan('2026-10')!.paidMarks).toEqual([])
  })

  it('refuses a date that isn’t one of its frozen occurrences, or a month with no plan', () => {
    const phone = seed()
    expect(markFrozenOccurrencePaid('2026-10', phone, '2026-10-13')).toBe(false)
    expect(markFrozenOccurrencePaid('2026-09', phone, '2026-09-12')).toBe(false)
    expect(markFrozenOccurrencePaid('2026-10', 999, '2026-10-12')).toBe(false)
    expect(getMonthEndPlan('2026-10')!.paidMarks).toEqual([])
  })

  it('keeps the first mark’s time when marked twice', () => {
    const phone = seed()
    markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')
    const first = getMonthEndPlan('2026-10')!.paidMarks[0].markedAt
    setToday('2026-11-08')
    expect(markFrozenOccurrencePaid('2026-10', phone, '2026-10-12')).toBe(true)
    expect(getMonthEndPlan('2026-10')!.paidMarks[0].markedAt).toBe(first)
  })

  it('a live mark made after the freeze doesn’t reach the past month', () => {
    const phone = seed()
    setToday('2026-11-07')
    // A live mark on an October date (Upcoming would only offer this month's,
    // but the live table must not leak into the frozen read either way).
    markOccurrencePaid(phone, '2026-10-12')
    expect(item(october(), 'Phone').state.kind).toBe('no-payment-found')
  })
})
