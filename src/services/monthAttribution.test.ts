/**
 * #191: the month attribution read — where every Actual spending transaction
 * in a calendar month counts (a Regular's Linked payment, else the Tracker
 * that owns its category, else Unplanned), with planned vs actual per line.
 * Exercised through `getMonthAttribution` against a real sql.js DB in an AU
 * zone. Every fixture asserts the reconciliation invariant and that the total
 * equals Money out for the month. Synthetic data only.
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
  setAppSetting: () => {},
  schedulePersist: () => {},
}))

const { getMonthAttribution } = await import('./monthAttribution')
const { getMonthlyInsights } = await import('./insights')

type MonthAttribution = ReturnType<typeof getMonthAttribution>

const ORIGINAL_TZ = process.env.TZ
let txCounter = 0

interface TxSeed {
  amount: number
  day?: string
  description?: string
  category?: string | null
  account?: string
  status?: 'HELD' | 'SETTLED'
  transferAccount?: string | null
  transactionType?: string | null
  createdAt?: string
  settledAt?: string | null
}

/** Parent of each synthetic subcategory, as Up reports it. */
const PARENT_OF: Record<string, string> = {
  groceries: 'food',
  takeaway: 'food',
  utilities: 'home',
  internet: 'home',
  fuel: 'transport',
}

function addTx(seed: TxSeed): string {
  txCounter += 1
  const id = `tx-${txCounter}`
  const day = seed.day ?? '2026-10-15'
  const createdAt = seed.createdAt ?? `${day}T12:00:00+11:00`
  const category = seed.category ?? null
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id,
       parent_category_id, amount, created_at, settled_at, transfer_account_id,
       transaction_type, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'up')`,
    [
      id,
      seed.account ?? 'acc-spending',
      seed.status ?? 'SETTLED',
      seed.description ?? 'Synthetic Shop',
      category,
      category ? (PARENT_OF[category] ?? null) : null,
      seed.amount,
      createdAt,
      seed.settledAt === undefined ? createdAt : seed.settledAt,
      seed.transferAccount ?? null,
      seed.transactionType ?? null,
    ]
  )
  return id
}

function addAccount(id: string, type: string, ownership = 'INDIVIDUAL') {
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type)
     VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01', ?)`,
    [id, id, type, ownership]
  )
}

interface RegularSeed {
  amount: number
  matchDescription?: string | null
  frequency?: string
  date?: string
  bucketId?: number | null
  cancelBy?: string | null
}

function addRegular(seed: RegularSeed): number {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at,
       match_description, bucket_id, cancel_by_date)
     VALUES ('Synthetic Regular', ?, ?, ?, '2026-01-01', ?, ?, ?)`,
    [
      seed.amount,
      seed.frequency ?? 'MONTHLY',
      seed.date ?? '2026-10-10',
      seed.matchDescription ?? null,
      seed.bucketId ?? null,
      seed.cancelBy ?? null,
    ]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

interface ConfigSeed {
  from: string
  budget: number
  categories: string[]
  frequency?: string | null
}

interface TrackerSeed {
  frequency?: string
  bucketId?: number | null
  active?: boolean
  history: ConfigSeed[]
}

function addTracker(seed: TrackerSeed): number {
  const head = seed.history[seed.history.length - 1]
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date,
       last_reset_date, next_reset_date, is_active, created_at, bucket_id)
     VALUES ('Synthetic Tracker', ?, ?, 1, '2026-01-01', '2026-10-01', '2026-11-01', ?, '2026-01-01', ?)`,
    [
      head.budget,
      seed.frequency ?? 'MONTHLY',
      seed.active === false ? 0 : 1,
      seed.bucketId ?? null,
    ]
  )
  const trackerId = Number(
    db.exec('SELECT last_insert_rowid()')[0].values[0][0]
  )
  for (const cat of head.categories) {
    db.run(
      `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [trackerId, cat]
    )
  }
  for (const v of seed.history) {
    db.run(
      `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, reset_frequency, created_at)
       VALUES (?, ?, ?, ?, '2026-01-01')`,
      [trackerId, v.from, v.budget, v.frequency ?? null]
    )
    const configId = Number(
      db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    )
    for (const cat of v.categories) {
      db.run(
        `INSERT INTO tracker_config_history_categories (config_id, category_id) VALUES (?, ?)`,
        [configId, cat]
      )
    }
  }
  return trackerId
}

function addBucket(): number {
  db.run(
    `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Bills', 'x', 0, '2026-01-01')`
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

/**
 * The read for `month`, after asserting the invariants every fixture must
 * hold: Regular actuals + Tracker actuals + Unplanned = total Actual spending,
 * and the total equals Money out for the same month.
 */
function read(month: string): MonthAttribution {
  const result = getMonthAttribution(month)
  const regularActual = result.regulars.reduce(
    (sum, r) => sum + (r.actualCents ?? 0),
    0
  )
  const trackerActual = result.trackers.reduce(
    (sum, t) => sum + t.actualCents,
    0
  )
  expect(regularActual + trackerActual + result.unplanned.totalCents).toBe(
    result.totalActualSpendingCents
  )
  const [year, m] = month.split('-').map(Number)
  expect(result.totalActualSpendingCents).toBe(
    getMonthlyInsights(year, m).moneyOut
  )
  return result
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
  addAccount('acc-spending', 'TRANSACTIONAL')
  addAccount('acc-saver', 'SAVER')
  addAccount('acc-joint', 'TRANSACTIONAL', 'JOINT')
  for (const parent of ['food', 'home', 'transport']) {
    db.run(`INSERT INTO categories (id, name, parent_id) VALUES (?, ?, NULL)`, [
      parent,
      parent,
    ])
  }
  for (const [child, parent] of Object.entries(PARENT_OF)) {
    db.run(`INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)`, [
      child,
      child,
      parent,
    ])
  }
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('Unplanned and the total', () => {
  it('puts spending with no Regular or Tracker on Unplanned, by parent, subcategory and Uncategorised', () => {
    addTx({ amount: -3000, category: 'groceries' })
    addTx({ amount: -1200, category: 'takeaway' })
    addTx({ amount: -800, category: 'groceries' })
    addTx({ amount: -5000, category: 'utilities' })
    addTx({ amount: -700, category: null })

    const result = read('2026-10')

    expect(result.totalActualSpendingCents).toBe(10700)
    expect(result.unplanned.totalCents).toBe(10700)
    expect(result.unplanned.uncategorisedCents).toBe(700)
    expect(result.unplanned.parents).toEqual([
      {
        parentCategoryId: 'food',
        totalCents: 5000,
        subcategories: [
          { categoryId: 'groceries', totalCents: 3800 },
          { categoryId: 'takeaway', totalCents: 1200 },
        ],
      },
      {
        parentCategoryId: 'home',
        totalCents: 5000,
        subcategories: [{ categoryId: 'utilities', totalCents: 5000 }],
      },
    ])
  })
})

describe('Unplanned rows can go negative', () => {
  it('nets a refund in its category, showing a negative row and parent as-is', () => {
    addTx({ amount: -1000, category: 'groceries' })
    addTx({ amount: 2500, category: 'groceries' })
    addTx({ amount: -400, category: 'takeaway' })

    const result = read('2026-10')

    expect(result.totalActualSpendingCents).toBe(-1100)
    expect(result.unplanned.parents).toEqual([
      {
        parentCategoryId: 'food',
        totalCents: -1100,
        subcategories: [
          { categoryId: 'groceries', totalCents: -1500 },
          { categoryId: 'takeaway', totalCents: 400 },
        ],
      },
    ])
  })
})

describe('which transactions count (Actual spending, #171 / #177)', () => {
  it('counts only Actual spending in the month', () => {
    addTx({ amount: -1000, category: 'groceries' }) // counts
    addTx({ amount: -2000, account: 'acc-saver', category: 'utilities' }) // Saver purchase counts
    addTx({ amount: -300, status: 'HELD', category: 'fuel' }) // HELD counts
    addTx({ amount: -50000, transferAccount: 'acc-saver' }) // own transfer
    addTx({ amount: -90, transactionType: 'Round Up' }) // Round Up, no transfer
    addTx({
      amount: -90,
      transactionType: 'Round Up',
      transferAccount: 'acc-saver',
    })
    addTx({ amount: 400000, category: null }) // pay: uncategorised positive
    addTx({ amount: -6000, account: 'acc-joint', category: 'groceries' }) // joint
    addTx({ amount: -500, category: null }) // uncategorised debit counts

    const result = read('2026-10')

    expect(result.totalActualSpendingCents).toBe(3800)
    expect(result.unplanned.uncategorisedCents).toBe(500)
  })

  it('places a transaction in the month of its local Display date', () => {
    // 31 Oct purchase that settles 2 Nov: October.
    addTx({
      amount: -1500,
      category: 'groceries',
      createdAt: '2026-10-31T21:00:00+11:00',
      settledAt: '2026-11-02T09:00:00+11:00',
    })
    // Just after local midnight on 1 Nov (still 31 Oct in UTC): November.
    addTx({
      amount: -700,
      category: 'groceries',
      createdAt: '2026-11-01T00:30:00+11:00',
    })

    expect(read('2026-10').totalActualSpendingCents).toBe(1500)
    expect(read('2026-11').totalActualSpendingCents).toBe(700)
  })
})

describe('Regular lines', () => {
  it('counts a Linked payment toward its Regular, not Unplanned', () => {
    const bucketId = addBucket()
    const regularId = addRegular({
      amount: 8000,
      matchDescription: 'Synthetic Power Co',
      date: '2026-10-10',
      bucketId,
    })
    const paymentId = addTx({
      amount: -8200,
      description: 'Synthetic Power Co',
      category: 'utilities',
      day: '2026-10-11',
    })
    addTx({ amount: -1000, category: 'groceries' })

    const result = read('2026-10')

    expect(result.regulars).toEqual([
      {
        regularId,
        bucketId,
        plannedCents: 8000,
        actualCents: 8200,
        notPaid: false,
        payments: [
          expect.objectContaining({
            transactionId: paymentId,
            amount: -8200,
            displayDate: '2026-10-11',
          }),
        ],
      },
    ])
    expect(result.unplanned.totalCents).toBe(1000)
    expect(result.unplanned.parents.map((p) => p.parentCategoryId)).toEqual([
      'food',
    ])
  })

  it("sends a refund on a Regular's description by category, never to the Regular", () => {
    const regularId = addRegular({
      amount: 8000,
      matchDescription: 'Synthetic Power Co',
    })
    addTx({
      amount: 8000,
      description: 'Synthetic Power Co',
      category: 'utilities',
    })

    const result = read('2026-10')

    const line = result.regulars.find((r) => r.regularId === regularId)!
    expect(line.actualCents).toBe(0)
    expect(line.payments).toEqual([])
    expect(result.unplanned.parents).toEqual([
      {
        parentCategoryId: 'home',
        totalCents: -8000,
        subcategories: [{ categoryId: 'utilities', totalCents: -8000 }],
      },
    ])
  })

  it('lets a payment inside two Regulars’ bands link to neither and fall through', () => {
    const a = addRegular({ amount: 5000, matchDescription: 'Synthetic Gym' })
    const b = addRegular({ amount: 5500, matchDescription: 'Synthetic Gym' })
    addTx({ amount: -5200, description: 'Synthetic Gym', category: 'fuel' })

    const result = read('2026-10')

    for (const id of [a, b]) {
      const line = result.regulars.find((r) => r.regularId === id)!
      expect(line.actualCents).toBe(0)
      expect(line.notPaid).toBe(true)
    }
    expect(result.unplanned.totalCents).toBe(5200)
  })

  it('gives a Regular with no match_description no actual figure; its money lands elsewhere', () => {
    const regularId = addRegular({ amount: 3000, matchDescription: null })
    addTx({
      amount: -3000,
      description: 'Synthetic Stream',
      category: 'internet',
    })

    const result = read('2026-10')

    expect(result.regulars).toEqual([
      {
        regularId,
        bucketId: null,
        plannedCents: 3000,
        actualCents: null,
        notPaid: null,
        payments: [],
      },
    ])
    expect(result.unplanned.totalCents).toBe(3000)
  })

  it('shows both payments when a Regular is paid twice in the month', () => {
    const regularId = addRegular({
      amount: 2000,
      matchDescription: 'Synthetic Phone',
    })
    addTx({ amount: -2000, description: 'Synthetic Phone', day: '2026-10-10' })
    addTx({
      amount: -2000,
      description: 'Synthetic Phone',
      day: '2026-10-12',
      status: 'HELD',
    })

    const line = read('2026-10').regulars.find(
      (r) => r.regularId === regularId
    )!

    expect(line.plannedCents).toBe(2000)
    expect(line.actualCents).toBe(4000)
    expect(line.payments.map((p) => p.displayDate)).toEqual([
      '2026-10-10',
      '2026-10-12',
    ])
    expect(line.notPaid).toBe(false)
  })

  it('shows $0 and not paid for a linked Regular with an occurrence and no payment', () => {
    const regularId = addRegular({
      amount: 2000,
      matchDescription: 'Synthetic Phone',
      date: '2026-10-25',
    })

    const line = read('2026-10').regulars.find(
      (r) => r.regularId === regularId
    )!

    expect(line.plannedCents).toBe(2000)
    expect(line.actualCents).toBe(0)
    expect(line.notPaid).toBe(true)
  })

  it('does not flag a linked Regular with no occurrence and no payment in the month', () => {
    const regularId = addRegular({
      amount: 12000,
      matchDescription: 'Synthetic Insurance',
      frequency: 'YEARLY',
      date: '2026-03-05',
    })

    const line = read('2026-10').regulars.find(
      (r) => r.regularId === regularId
    )!

    expect(line.plannedCents).toBe(0)
    expect(line.actualCents).toBe(0)
    expect(line.notPaid).toBe(false)
  })

  it('flags an overdue ONCE as not paid, in its own month and in the current month', () => {
    // Today is 20 Oct; this one-off was due 20 Sep and is still unresolved.
    const regularId = addRegular({
      amount: 15000,
      matchDescription: 'Synthetic Repair',
      frequency: 'ONCE',
      date: '2026-09-20',
    })

    const sep = read('2026-09').regulars.find((r) => r.regularId === regularId)!
    const oct = read('2026-10').regulars.find((r) => r.regularId === regularId)!

    expect(sep.plannedCents).toBe(15000)
    expect(sep.notPaid).toBe(true)
    expect(oct.plannedCents).toBe(0)
    expect(oct.notPaid).toBe(true)
    // Not before it was due, and not in months that haven't started.
    for (const month of ['2026-08', '2026-11']) {
      const line = read(month).regulars.find((r) => r.regularId === regularId)!
      expect(line.notPaid).toBe(false)
    }
  })

  it('does not flag a ONCE paid in its own month as not paid in later months', () => {
    // Due and paid in Aug; the stored date has passed, so it would otherwise
    // read as overdue in Sep and Oct.
    const regularId = addRegular({
      amount: 15000,
      matchDescription: 'Synthetic Repair',
      frequency: 'ONCE',
      date: '2026-08-20',
    })
    addTx({
      amount: -15000,
      description: 'Synthetic Repair',
      category: 'utilities',
      day: '2026-08-21',
    })

    const aug = read('2026-08').regulars.find((r) => r.regularId === regularId)!
    expect(aug.actualCents).toBe(15000)
    expect(aug.notPaid).toBe(false)
    for (const month of ['2026-09', '2026-10']) {
      const line = read(month).regulars.find((r) => r.regularId === regularId)!
      expect(line.actualCents).toBe(0)
      expect(line.notPaid).toBe(false)
    }
  })

  it('stops flagging an overdue ONCE from the month it is finally paid', () => {
    // Due 20 Aug, unpaid in Aug, paid late on 5 Sep.
    const regularId = addRegular({
      amount: 15000,
      matchDescription: 'Synthetic Repair',
      frequency: 'ONCE',
      date: '2026-08-20',
    })
    addTx({
      amount: -15000,
      description: 'Synthetic Repair',
      category: 'utilities',
      day: '2026-09-05',
    })

    const notPaid = (month: string) =>
      read(month).regulars.find((r) => r.regularId === regularId)!.notPaid

    expect(notPaid('2026-08')).toBe(true)
    expect(notPaid('2026-09')).toBe(false)
    expect(notPaid('2026-10')).toBe(false)
  })

  it('plans forward only from the stored date in its creation month', () => {
    // Weekly from Wed 14 Oct: 14, 21, 28 Oct — never 7 Oct or earlier.
    const regularId = addRegular({
      amount: 1000,
      frequency: 'WEEKLY',
      date: '2026-10-14',
      matchDescription: 'Synthetic Lessons',
    })
    // A payment before the stored date still counts as actual.
    addTx({
      amount: -1000,
      description: 'Synthetic Lessons',
      day: '2026-10-07',
    })

    const line = read('2026-10').regulars.find(
      (r) => r.regularId === regularId
    )!

    expect(line.plannedCents).toBe(3000)
    expect(line.actualCents).toBe(1000)
    expect(read('2026-09').regulars[0].plannedCents).toBe(0)
  })

  it('plans a ONCE Regular in full in its own month and $0 elsewhere', () => {
    const regularId = addRegular({
      amount: 25000,
      frequency: 'ONCE',
      date: '2026-11-18',
    })

    const planned = (month: string) =>
      read(month).regulars.find((r) => r.regularId === regularId)!.plannedCents

    expect(planned('2026-10')).toBe(0)
    expect(planned('2026-11')).toBe(25000)
    expect(planned('2026-12')).toBe(0)
  })

  it('drops a deleted Regular out of the whole month; its payment falls through', () => {
    const regularId = addRegular({
      amount: 8000,
      matchDescription: 'Synthetic Power Co',
    })
    addTx({
      amount: -8000,
      description: 'Synthetic Power Co',
      category: 'utilities',
    })
    db.run(`DELETE FROM upcoming_charges WHERE id = ?`, [regularId])

    const result = read('2026-10')

    expect(result.regulars).toEqual([])
    expect(result.unplanned.totalCents).toBe(8000)
  })
})

describe('attribution order', () => {
  it('goes Regular, then the Tracker that owns the category, then Unplanned', () => {
    const bucketId = addBucket()
    const regularId = addRegular({
      amount: 9000,
      matchDescription: 'Synthetic Grocer Delivery',
    })
    const trackerId = addTracker({
      bucketId,
      history: [
        { from: '2026-01-01', budget: 60000, categories: ['groceries'] },
      ],
    })
    // A Linked payment in a category the Tracker owns: the Regular takes it.
    addTx({
      amount: -9000,
      description: 'Synthetic Grocer Delivery',
      category: 'groceries',
    })
    // Ordinary spending in the Tracker's category: the Tracker takes it.
    addTx({ amount: -4500, category: 'groceries' })
    // A refund in the Tracker's category nets against it.
    addTx({ amount: 500, category: 'groceries' })
    // Nothing owns fuel: Unplanned.
    addTx({ amount: -3000, category: 'fuel' })

    const result = read('2026-10')

    expect(
      result.regulars.find((r) => r.regularId === regularId)!.actualCents
    ).toBe(9000)
    expect(result.trackers).toEqual([
      { trackerId, bucketId, plannedCents: 60000, actualCents: 4000 },
    ])
    expect(result.unplanned.totalCents).toBe(3000)
    expect(result.totalActualSpendingCents).toBe(16000)
  })
})

describe('Tracker lines', () => {
  it('weights planned by the days each config version was in effect', () => {
    // October has 31 days: $310 for 1–10 Oct, then $620 for 11–31 Oct.
    const trackerId = addTracker({
      history: [
        { from: '2026-09-01', budget: 31000, categories: ['groceries'] },
        {
          from: '2026-10-11',
          budget: 62000,
          categories: ['groceries', 'takeaway'],
        },
      ],
    })

    const line = read('2026-10').trackers.find(
      (t) => t.trackerId === trackerId
    )!

    // (31000 × 10 + 62000 × 21) / 31
    expect(line.plannedCents).toBe(52000)
    // September: the first version alone, the whole month.
    expect(read('2026-09').trackers[0].plannedCents).toBe(31000)
  })

  it('counts spending against the category set in effect on its Display date', () => {
    const trackerId = addTracker({
      history: [
        { from: '2026-09-01', budget: 31000, categories: ['groceries'] },
        {
          from: '2026-10-11',
          budget: 31000,
          categories: ['groceries', 'takeaway'],
        },
      ],
    })
    addTx({ amount: -1000, category: 'groceries', day: '2026-10-05' })
    addTx({ amount: -700, category: 'takeaway', day: '2026-10-05' }) // not yet tracked
    addTx({ amount: -300, category: 'takeaway', day: '2026-10-15' })

    const result = read('2026-10')

    expect(
      result.trackers.find((t) => t.trackerId === trackerId)!.actualCents
    ).toBe(1300)
    expect(result.unplanned.parents).toEqual([
      {
        parentCategoryId: 'food',
        totalCents: 700,
        subcategories: [{ categoryId: 'takeaway', totalCents: 700 }],
      },
    ])
  })

  it('plans the monthly equivalent of a weekly budget', () => {
    addTracker({
      frequency: 'WEEKLY',
      history: [{ from: '2026-09-07', budget: 10000, categories: ['fuel'] }],
    })

    // $100 × 52 / 12 = $433.33
    expect(read('2026-10').trackers[0].plannedCents).toBe(43333)
  })

  it('prices a version in the cadence it was written in', () => {
    // A weekly→monthly change on 16 Oct: the earlier version is tagged WEEKLY.
    addTracker({
      frequency: 'MONTHLY',
      history: [
        {
          from: '2026-09-07',
          budget: 10000,
          categories: ['fuel'],
          frequency: 'WEEKLY',
        },
        { from: '2026-10-17', budget: 50000, categories: ['fuel'] },
      ],
    })

    // (43333 × 16 + 50000 × 15) / 31 = 46558.97
    expect(read('2026-10').trackers[0].plannedCents).toBe(46559)
  })

  it('plans and takes nothing on days before its first config version', () => {
    const trackerId = addTracker({
      history: [
        { from: '2026-10-11', budget: 31000, categories: ['groceries'] },
      ],
    })
    addTx({ amount: -1000, category: 'groceries', day: '2026-10-05' })
    addTx({ amount: -400, category: 'groceries', day: '2026-10-11' })

    const result = read('2026-10')

    expect(result.trackers).toEqual([
      { trackerId, bucketId: null, plannedCents: 21000, actualCents: 400 },
    ])
    expect(result.unplanned.totalCents).toBe(1000)
  })

  it('drops a deactivated Tracker out of the whole month', () => {
    addTracker({
      active: false,
      history: [
        { from: '2026-09-01', budget: 31000, categories: ['groceries'] },
      ],
    })
    addTx({ amount: -1000, category: 'groceries' })

    const result = read('2026-10')

    expect(result.trackers).toEqual([])
    expect(result.unplanned.totalCents).toBe(1000)
  })

  it('keeps a Tracker that is in no bucket, with its own planned and actual', () => {
    const trackerId = addTracker({
      bucketId: null,
      history: [{ from: '2026-09-01', budget: 20000, categories: ['fuel'] }],
    })
    addTx({ amount: -6000, category: 'fuel' })

    expect(read('2026-10').trackers).toEqual([
      { trackerId, bucketId: null, plannedCents: 20000, actualCents: 6000 },
    ])
  })

  it('declines to plan a Tracker whose cadence it doesn’t know, but still counts its actual', () => {
    // Unknown cadences can't be priced; planning $0 would be a guess.
    const unknownTracker = addTracker({
      frequency: 'BIMONTHLY',
      history: [{ from: '2026-09-01', budget: 20000, categories: ['fuel'] }],
    })
    const unknownVersion = addTracker({
      history: [
        { from: '2026-09-01', budget: 31000, categories: ['groceries'] },
        {
          from: '2026-10-20',
          budget: 31000,
          categories: ['groceries'],
          frequency: 'BIMONTHLY',
        },
      ],
    })
    addTx({ amount: -6000, category: 'fuel' })
    addTx({ amount: -1000, category: 'groceries' })

    const lines = read('2026-10').trackers
    expect(lines).toEqual([
      {
        trackerId: unknownTracker,
        bucketId: null,
        plannedCents: null,
        actualCents: 6000,
      },
      {
        trackerId: unknownVersion,
        bucketId: null,
        plannedCents: null,
        actualCents: 1000,
      },
    ])
    // A month the unknown version isn't in effect is priced as usual.
    expect(
      read('2026-09').trackers.find((t) => t.trackerId === unknownVersion)
        ?.plannedCents
    ).toBe(31000)
  })

  it('sends spending claimed by two Trackers’ configs on the same day to Unplanned', () => {
    // ADR 0003 forbids sharing a category, but a back-dated genesis row can
    // overlap another Tracker's last days with it. Neither takes it.
    addTracker({
      history: [
        { from: '2026-09-01', budget: 31000, categories: ['groceries'] },
      ],
    })
    addTracker({
      history: [
        { from: '2026-10-01', budget: 31000, categories: ['groceries'] },
      ],
    })
    addTx({ amount: -1000, category: 'groceries' })

    const result = read('2026-10')

    expect(result.trackers.map((t) => t.actualCents)).toEqual([0, 0])
    expect(result.unplanned.totalCents).toBe(1000)
  })
})
