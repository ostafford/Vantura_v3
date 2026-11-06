import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const { deleteBucket, getBuckets, getMonthlyIncomeCents, reorderBuckets } =
  await import('./budgetBuckets')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]

  db.run(
    `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Bills', 'icon', 0, '2026-01-01')`
  )
})

function insertUpcoming(
  name: string,
  amount: number,
  frequency: string,
  bucketId = 1
) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, bucket_id) VALUES (?, ?, ?, '2026-01-15', '2026-01-01', ?)`,
    [name, amount, frequency, bucketId]
  )
}

function insertTracker(
  budgetAmount: number,
  resetFrequency: string,
  bucketId: number | null = 1,
  isActive = 1
) {
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at, bucket_id) VALUES ('T', ?, ?, 1, '2026-01-01', '2026-01-01', '2026-02-01', ?, '2026-01-01', ?)`,
    [budgetAmount, resetFrequency, isActive, bucketId]
  )
}

describe('reorderBuckets', () => {
  beforeEach(() => {
    // bucket 1 ('Bills') already exists from the top-level beforeEach
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Household', 'icon', 1, '2026-01-01')`
    )
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Lifestyle', 'icon', 2, '2026-01-01')`
    )
  })

  it('rewrites sort_order to match the given array order', () => {
    expect(getBuckets().map((b) => b.name)).toEqual([
      'Bills',
      'Household',
      'Lifestyle',
    ])
    reorderBuckets([3, 1, 2]) // Lifestyle, Bills, Household
    expect(getBuckets().map((b) => b.name)).toEqual([
      'Lifestyle',
      'Bills',
      'Household',
    ])
  })

  it('assigns sequential sort_order values starting at 0', () => {
    reorderBuckets([2, 3, 1])
    const buckets = getBuckets()
    expect(buckets.find((b) => b.id === 2)?.sort_order).toBe(0)
    expect(buckets.find((b) => b.id === 3)?.sort_order).toBe(1)
    expect(buckets.find((b) => b.id === 1)?.sort_order).toBe(2)
  })
})

describe('getMonthlyIncomeCents', () => {
  it.each([
    ['WEEKLY', '120000', 520000],
    ['FORTNIGHTLY', '240000', 520000],
    ['MONTHLY', '500000', 500000],
    ['WEEKLY', '100001', 433338],
  ])('%s pay of %s cents is %i cents a month', (freq, pay, expected) => {
    appSettings.payday_frequency = freq
    appSettings.pay_amount_cents = pay
    expect(getMonthlyIncomeCents()).toBe(expected)
  })

  it.each([[undefined], [''], ['abc'], ['0'], ['-5000']])(
    'returns null when pay amount is %s',
    (pay) => {
      appSettings.payday_frequency = 'WEEKLY'
      if (pay !== undefined) appSettings.pay_amount_cents = pay
      expect(getMonthlyIncomeCents()).toBeNull()
    }
  )

  it.each([[undefined], [''], ['QUARTERLY'], ['PAYDAY']])(
    'returns null (no Income) when Pay frequency is %s — never assumes monthly',
    (freq) => {
      appSettings.pay_amount_cents = '500000'
      if (freq !== undefined) appSettings.payday_frequency = freq
      expect(getMonthlyIncomeCents()).toBeNull()
    }
  )
})

describe('deleteBucket', () => {
  it('deletes the bucket and unassigns its Regulars and Trackers, keeping them', () => {
    insertUpcoming('Rent', 150000, 'MONTHLY')
    insertTracker(50000, 'MONTHLY')
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Fun', 'icon', 1, '2026-01-01')`
    )
    insertUpcoming('Cinema', 2000, 'MONTHLY', 2)

    deleteBucket(1)

    expect(db.exec(`SELECT id, name FROM budget_buckets`)[0].values).toEqual([
      [2, 'Fun'],
    ])
    expect(
      db.exec(`SELECT name, bucket_id FROM upcoming_charges ORDER BY name`)[0]
        .values
    ).toEqual([
      ['Cinema', 2],
      ['Rent', null],
    ])
    expect(db.exec(`SELECT bucket_id FROM trackers`)[0].values).toEqual([
      [null],
    ])
  })
})
