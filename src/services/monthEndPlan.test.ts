/**
 * #242: the Month-end plan — the freeze, its idempotence and limits, what's
 * frozen, and the profile export round-trip. Exercised through the public
 * reads against a real sql.js DB in an AU zone. Synthetic data only.
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
  freezeMonthEndPlans,
  getMonthEndPlan,
  getFirstPlannableMonth,
  ensureFirstPlannableMonth,
  FIRST_PLANNABLE_MONTH_KEY,
} = await import('./monthEndPlan')
const { getMonthAttribution } = await import('./monthAttribution')
const { markOccurrencePaid, saveRegular, draftFromRegular, deleteRegular } =
  await import('./regulars')
const { regularById } = await import('./regulars')
const { assignUpcomingToBucket, updateBucket } = await import('./budgetBuckets')
const { runDateDependentWrites } = await import('./dateDependentWrites')
const { watchForDayChange, todayStore } = await import('@/stores/todayStore')
const {
  buildExportPayload,
  exportProfile,
  importPayloadWithOptions,
  EXPORT_ERROR_UNREADABLE_MONTH_END_PLAN,
  IMPORT_ERROR_INVALID_MONTH_END_PLAN,
} = await import('./profileExport')

const ORIGINAL_TZ = process.env.TZ
const ALL_SECTIONS = {
  settings: true,
  trackers: true,
  upcomingCharges: true,
  budgetPlan: true,
}

function set(key: string, value: string) {
  db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [
    key,
    value,
  ])
}

function setToday(day: string, time = '12:00:00') {
  vi.setSystemTime(new Date(`${day}T${time}+11:00`))
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

function addConfig(
  trackerId: number,
  effectiveFrom: string,
  budget: number,
  categories: string[]
) {
  db.run(
    `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, reset_frequency, created_at)
     VALUES (?, ?, ?, 'MONTHLY', '2026-01-01')`,
    [trackerId, effectiveFrom, budget]
  )
  const configId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  for (const cat of categories) {
    db.run(
      `INSERT INTO tracker_config_history_categories (config_id, category_id) VALUES (?, ?)`,
      [configId, cat]
    )
  }
}

function addTracker(seed: {
  name: string
  budget: number
  categories: string[]
  bucketId?: number | null
  active?: boolean
}): number {
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date,
       last_reset_date, next_reset_date, is_active, created_at, bucket_id)
     VALUES (?, ?, 'MONTHLY', 1, '2026-01-01', '2026-11-01', '2026-12-01', ?, '2026-01-01', ?)`,
    [
      seed.name,
      seed.budget,
      seed.active === false ? 0 : 1,
      seed.bucketId ?? null,
    ]
  )
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  for (const cat of seed.categories) {
    db.run(
      `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [id, cat]
    )
  }
  addConfig(id, '2026-01-01', seed.budget, seed.categories)
  return id
}

function planRows(): Array<[string, string]> {
  return (
    db.exec(`SELECT month, plan_json FROM month_end_plans ORDER BY month`)[0]
      ?.values ?? []
  ).map((r) => [String(r[0]), String(r[1])])
}

function plan(month: string) {
  const p = getMonthEndPlan(month)
  if (!p) throw new Error(`expected a Month-end plan for ${month}`)
  return p
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  process.env.TZ = 'Australia/Sydney'
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-11-01')
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  set('onboarding_complete', '1')
  set('pay_amount_cents', '450000')
  set('payday_frequency', 'MONTHLY')
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

describe('the first plannable month', () => {
  it('is set to this month on the first run after onboarding, which freezes nothing', () => {
    setToday('2026-10-20')
    expect(freezeMonthEndPlans()).toEqual([])
    expect(getFirstPlannableMonth()).toBe('2026-10')
    expect(planRows()).toEqual([])
  })

  it('is stored once: a later run never moves it', () => {
    setToday('2026-10-20')
    freezeMonthEndPlans()
    setToday('2026-12-03')
    ensureFirstPlannableMonth()
    freezeMonthEndPlans()
    expect(getFirstPlannableMonth()).toBe('2026-10')
  })

  it('is not set, and nothing is frozen, before onboarding completes', () => {
    db.run(`DELETE FROM app_settings WHERE key = 'onboarding_complete'`)
    expect(freezeMonthEndPlans()).toEqual([])
    expect(readSetting(FIRST_PLANNABLE_MONTH_KEY)).toBeNull()
  })

  it('declines when the stored value is malformed, leaving it alone', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-13')
    expect(freezeMonthEndPlans()).toEqual([])
    expect(readSetting(FIRST_PLANNABLE_MONTH_KEY)).toBe('2026-13')
    expect(planRows()).toEqual([])
  })
})

describe('the freeze', () => {
  it('freezes last month on the first boot after month end', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-10')
    expect(freezeMonthEndPlans()).toEqual(['2026-10'])
    expect(planRows().map(([m]) => m)).toEqual(['2026-10'])
    const p = plan('2026-10')
    expect(p.month).toBe('2026-10')
    expect(p.version).toBe(1)
    expect(p.frozenAt).toBe(new Date().toISOString())
  })

  it('freezes every missed month after a gap, each with its own occurrences', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-07')
    addRegular({
      name: 'Water',
      amount: 30000,
      date: '2026-08-15',
      frequency: 'QUARTERLY',
    })

    expect(freezeMonthEndPlans()).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    const occurrences = (month: string) =>
      plan(month).regulars.find((r) => r.name === 'Water')?.occurrences
    expect(occurrences('2026-07')).toEqual([])
    expect(occurrences('2026-08')).toEqual(['2026-08-15'])
    expect(occurrences('2026-09')).toEqual([])
    expect(occurrences('2026-10')).toEqual([])
  })

  it('never freezes a month before the first plannable month, or this month', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-09')
    freezeMonthEndPlans()
    expect(planRows().map(([m]) => m)).toEqual(['2026-09', '2026-10'])
    expect(getMonthEndPlan('2026-08')).toBeNull()
    expect(getMonthEndPlan('2026-11')).toBeNull()
  })

  it('is idempotent: a month with a plan is never re-frozen', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-10')
    const id = addRegular({ name: 'Rent', amount: 200000, date: '2026-10-05' })
    freezeMonthEndPlans()
    const before = planRows()

    db.run(`UPDATE upcoming_charges SET amount = 250000 WHERE id = ?`, [id])
    setToday('2026-11-02')
    expect(freezeMonthEndPlans()).toEqual([])
    expect(planRows()).toEqual(before)
  })

  it('skips a stored row it can’t read, rather than re-freezing it', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-10')
    db.run(
      `INSERT INTO month_end_plans (month, plan_json, frozen_at)
       VALUES ('2026-10', '{"version":99}', '2026-11-01T00:00:00Z')`
    )
    expect(freezeMonthEndPlans()).toEqual([])
    expect(getMonthEndPlan('2026-10')).toBeNull()
  })

  it('freezes nothing when the first plannable month is after this month', () => {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-12')
    expect(freezeMonthEndPlans()).toEqual([])
    expect(planRows()).toEqual([])
  })
})

describe('what is frozen', () => {
  beforeEach(() => set(FIRST_PLANNABLE_MONTH_KEY, '2026-10'))

  it('every bucket, in Budget Plan order', () => {
    const bills = addBucket('Bills', 1)
    const fun = addBucket('Fun', 0)
    freezeMonthEndPlans()
    expect(plan('2026-10').buckets).toEqual([
      { id: fun, name: 'Fun', icon: 'mdi-home', sortOrder: 0 },
      { id: bills, name: 'Bills', icon: 'mdi-home', sortOrder: 1 },
    ])
  })

  it('every Regular, with what its read and its paid rule need', () => {
    const bills = addBucket('Bills', 0)
    const rent = addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-09-07',
      frequency: 'FORTNIGHTLY',
      matchDescription: 'Synthetic Realty',
      bucketId: bills,
    })
    const gym = addRegular({ name: 'Gym', amount: 5000, date: '2026-12-01' })
    freezeMonthEndPlans()

    expect(plan('2026-10').regulars).toEqual([
      {
        id: rent,
        name: 'Rent',
        bucketId: bills,
        amount: 200000,
        frequency: 'FORTNIGHTLY',
        anchorDate: '2026-09-07',
        cancelByDate: null,
        matchDescription: 'Synthetic Realty',
        occurrences: ['2026-10-05', '2026-10-19'],
      },
      // No occurrence in the month, but still frozen: a Linked payment can
      // land in a month with none.
      {
        id: gym,
        name: 'Gym',
        bucketId: null,
        amount: 5000,
        frequency: 'MONTHLY',
        anchorDate: '2026-12-01',
        cancelByDate: null,
        matchDescription: null,
        occurrences: [],
      },
    ])
  })

  it('every active Tracker, with the attribution read’s planned figure and its category set per day', () => {
    const food = addBucket('Food', 0)
    const groceries = addTracker({
      name: 'Groceries',
      budget: 60000,
      categories: ['groceries'],
      bucketId: food,
    })
    // Config history: takeaway joins on the 16th at a higher budget.
    addConfig(groceries, '2026-10-16', 90000, ['takeaway', 'groceries'])
    addTracker({
      name: 'Old',
      budget: 1000,
      categories: ['fuel'],
      active: false,
    })
    freezeMonthEndPlans()

    const [tracker, ...rest] = plan('2026-10').trackers
    expect(rest).toEqual([])
    expect(tracker.id).toBe(groceries)
    expect(tracker.name).toBe('Groceries')
    expect(tracker.bucketId).toBe(food)
    const attribution = getMonthAttribution('2026-10').trackers[0]
    expect(tracker.plannedCents).toBe(attribution.plannedCents)
    expect(tracker.plannedCents).toBe(
      Math.round((60000 * 15 + 90000 * 16) / 31)
    )
    expect(Object.keys(tracker.categoryIdsByDay)).toHaveLength(31)
    expect(tracker.categoryIdsByDay['2026-10-15']).toEqual(['groceries'])
    expect(tracker.categoryIdsByDay['2026-10-16']).toEqual([
      'groceries',
      'takeaway',
    ])
    expect(tracker.categoryIdsByDay['2026-10-31']).toEqual([
      'groceries',
      'takeaway',
    ])
  })

  it('a day before a Tracker’s first config claims nothing', () => {
    const id = addTracker({ name: 'Fuel', budget: 0, categories: [] })
    db.run(`DELETE FROM tracker_config_history WHERE tracker_id = ?`, [id])
    addConfig(id, '2026-10-10', 31000, ['fuel'])
    freezeMonthEndPlans()
    const tracker = plan('2026-10').trackers[0]
    expect(tracker.categoryIdsByDay['2026-10-09']).toEqual([])
    expect(tracker.categoryIdsByDay['2026-10-10']).toEqual(['fuel'])
  })

  it('the pay amount and Pay frequency, or null when no usable pay is set', () => {
    set('payday_frequency', 'FORTNIGHTLY')
    set('pay_amount_cents', '210000')
    freezeMonthEndPlans()
    expect(plan('2026-10').pay).toEqual({
      perPay: 210000,
      frequency: 'FORTNIGHTLY',
    })

    db.run(`DELETE FROM month_end_plans`)
    set('pay_amount_cents', '')
    freezeMonthEndPlans()
    expect(plan('2026-10').pay).toBeNull()
  })

  it('copies the live marks on the month’s occurrences, and only those', () => {
    const rent = addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-09-07',
      frequency: 'FORTNIGHTLY',
    })
    // Marked while October ran (Date is faked; marks stamp "now").
    setToday('2026-10-20')
    expect(markOccurrencePaid(rent, '2026-10-05')).toBe(true)
    expect(markOccurrencePaid(rent, '2026-09-21')).toBe(true)
    // A stale mark (not one of its occurrences) is ignored by the paid read.
    db.run(
      `INSERT INTO regular_paid_marks (regular_id, occurrence_date, marked_at)
       VALUES (?, '2026-10-06', '2026-10-06T00:00:00Z')`,
      [rent]
    )
    setToday('2026-11-01')
    freezeMonthEndPlans()

    expect(plan('2026-10').paidMarks).toEqual([
      {
        regularId: rent,
        occurrenceDate: '2026-10-05',
        markedAt: new Date('2026-10-20T12:00:00+11:00').toISOString(),
      },
    ])
  })
})

describe('after the freeze', () => {
  beforeEach(() => set(FIRST_PLANNABLE_MONTH_KEY, '2026-10'))

  it('a Regular edited, moved between buckets or deleted leaves the frozen plan unchanged', () => {
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
      amount: 4000,
      date: '2026-10-12',
      bucketId: bills,
    })
    setToday('2026-10-20')
    markOccurrencePaid(phone, '2026-10-12')
    setToday('2026-11-01')
    freezeMonthEndPlans()
    const frozen = plan('2026-10')

    const stored = regularById(rent)!
    saveRegular({
      ...draftFromRegular(stored, stored),
      name: 'Rent (new place)',
      amount: '2600.00',
      matchDescription: 'Other Realty',
    })
    assignUpcomingToBucket(rent, home)
    updateBucket(bills, 'Renamed', 'mdi-star')
    deleteRegular(phone)

    expect(regularById(rent)?.amount).toBe(260000)
    expect(getMonthEndPlan('2026-10')).toEqual(frozen)
    expect(frozen.regulars.map((r) => r.name)).toEqual(['Rent', 'Phone'])
    expect(frozen.paidMarks.map((m) => m.regularId)).toEqual([phone])
  })
})

describe('when it runs', () => {
  beforeEach(() => set(FIRST_PLANNABLE_MONTH_KEY, '2026-10'))

  it('the day-change watcher freezes at the month rollover', () => {
    vi.useRealTimers()
    vi.useFakeTimers()
    setToday('2026-10-31', '23:59:00')
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-10')
    todayStore.setState({ today: '2026-10-31' })
    const target = new EventTarget()
    const stop = watchForDayChange(runDateDependentWrites, target)
    expect(planRows()).toEqual([])

    vi.advanceTimersByTime(61_000)
    expect(todayStore.getState().today).toBe('2026-11-01')
    expect(planRows().map(([m]) => m)).toEqual(['2026-10'])
    stop()
  })
})

describe('profile export', () => {
  function seedFrozenOctober() {
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-09')
    const bills = addBucket('Bills', 0)
    const rent = addRegular({
      name: 'Rent',
      amount: 200000,
      date: '2026-10-05',
      bucketId: bills,
    })
    setToday('2026-10-20')
    markOccurrencePaid(rent, '2026-10-05')
    setToday('2026-11-01')
    addTracker({ name: 'Groceries', budget: 60000, categories: ['groceries'] })
    freezeMonthEndPlans()
  }

  it('refuses to export when a stored plan can’t be read, so the month isn’t re-frozen elsewhere', async () => {
    seedFrozenOctober()
    db.run(
      `UPDATE month_end_plans SET plan_json = '{"version":99}' WHERE month = '2026-09'`
    )
    expect(EXPORT_ERROR_UNREADABLE_MONTH_END_PLAN).toBe(
      'A past month’s plan on this device can’t be read, so this profile can’t be exported. Nothing was exported.'
    )
    await expect(exportProfile('synthetic-passphrase')).rejects.toThrow(
      new Error(EXPORT_ERROR_UNREADABLE_MONTH_END_PLAN)
    )
  })

  it('round-trips every plan and the first plannable month', () => {
    seedFrozenOctober()
    const before = [getMonthEndPlan('2026-09'), getMonthEndPlan('2026-10')]
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    expect(payload.firstPlannableMonth).toBe('2026-09')
    expect(
      payload.monthEndPlans.map((r: { month: string }) => r.month)
    ).toEqual(['2026-09', '2026-10'])

    // A different device: no plans, another first month.
    db.run(`DELETE FROM month_end_plans`)
    set(FIRST_PLANNABLE_MONTH_KEY, '2026-11')
    importPayloadWithOptions(payload, ALL_SECTIONS)

    expect(getFirstPlannableMonth()).toBe('2026-09')
    expect([getMonthEndPlan('2026-09'), getMonthEndPlan('2026-10')]).toEqual(
      before
    )
    // Plans keep the ids they were frozen with; live rows get new ones.
    expect(getMonthEndPlan('2026-10')!.paidMarks).toHaveLength(1)
  })

  it('an older export imports with none, and import freezes nothing itself', () => {
    seedFrozenOctober()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    delete payload.monthEndPlans
    delete payload.firstPlannableMonth
    payload.version = 16

    importPayloadWithOptions(payload, ALL_SECTIONS)

    expect(planRows()).toEqual([])
    expect(getFirstPlannableMonth()).toBeNull()
    // The next boot starts again from this month, freezing nothing.
    expect(freezeMonthEndPlans()).toEqual([])
    expect(getFirstPlannableMonth()).toBe('2026-11')
  })

  it('leaves this device’s plans alone when the Budget Plan isn’t imported', () => {
    seedFrozenOctober()
    const rows = planRows()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    payload.monthEndPlans = []
    payload.firstPlannableMonth = '2026-11'
    importPayloadWithOptions(payload, { ...ALL_SECTIONS, budgetPlan: false })
    expect(planRows()).toEqual(rows)
    expect(getFirstPlannableMonth()).toBe('2026-09')
  })

  it('refuses a plan for a month that hasn’t finished on this device', () => {
    seedFrozenOctober()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    // This device's clock is still in October, so October isn't finished.
    setToday('2026-10-31')
    expect(() => importPayloadWithOptions(payload, ALL_SECTIONS)).toThrow(
      IMPORT_ERROR_INVALID_MONTH_END_PLAN
    )
    expect(planRows().map(([m]) => m)).toEqual(['2026-09', '2026-10'])
  })

  it.each([
    ['a malformed plan', (p: Payload) => (p.monthEndPlans[0].plan.version = 2)],
    [
      'a mark on no frozen occurrence',
      (p: Payload) =>
        (p.monthEndPlans[1].plan.paidMarks[0].occurrenceDate = '2026-10-06'),
    ],
    [
      'a repeated month',
      (p: Payload) => p.monthEndPlans.push(p.monthEndPlans[0]),
    ],
    [
      'a plan before the first plannable month',
      (p: Payload) => (p.firstPlannableMonth = '2026-10'),
    ],
    [
      'plans without a first plannable month',
      (p: Payload) => (p.firstPlannableMonth = null),
    ],
  ])('refuses the whole import for %s', (_name, corrupt) => {
    seedFrozenOctober()
    const rows = planRows()
    const payload = JSON.parse(JSON.stringify(buildExportPayload()))
    corrupt(payload)
    expect(() => importPayloadWithOptions(payload, ALL_SECTIONS)).toThrow(
      IMPORT_ERROR_INVALID_MONTH_END_PLAN
    )
    expect(planRows()).toEqual(rows)
    expect(getFirstPlannableMonth()).toBe('2026-09')
  })
})

type Payload = {
  firstPlannableMonth: string | null
  monthEndPlans: Array<{
    month: string
    plan: {
      version: number
      paidMarks: Array<{ occurrenceDate: string }>
    }
  }>
}

describe('demo mode', () => {
  it('seeds a Month-end plan for last month, from the sample plan', async () => {
    db.run(`DELETE FROM app_settings WHERE key = 'onboarding_complete'`)
    setToday('2026-11-07')
    const { seedDemoData } = await import('@/db/seedDemoData')
    seedDemoData()

    expect(getFirstPlannableMonth()).toBe('2026-10')
    expect(planRows().map(([m]) => m)).toEqual(['2026-10'])
    const october = plan('2026-10')
    expect(october.trackers.length).toBeGreaterThan(0)
    expect(october.regulars.length).toBeGreaterThan(0)
    expect(october.pay).toEqual({ perPay: 450000, frequency: 'MONTHLY' })
  })
})
