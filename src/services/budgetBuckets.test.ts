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

const { getBucketCardSummary, getBuckets, reorderBuckets } =
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

function insertHypothetical(
  name: string,
  amountCents: number,
  frequency: string,
  bucketId = 1
) {
  db.run(
    `INSERT INTO budget_hypotheticals (bucket_id, name, amount_cents, frequency, is_hypothetical, created_at) VALUES (?, ?, ?, ?, 1, '2026-01-01')`,
    [bucketId, name, amountCents, frequency]
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

describe('getBucketCardSummary', () => {
  it('sums MONTHLY upcoming charges into plannedCents', () => {
    insertUpcoming('Rent', 200000, 'MONTHLY')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(200000)
    expect(summary.hypotheticalCents).toBe(0)
  })

  it('excludes ONCE-frequency upcoming charges from the planned total', () => {
    insertUpcoming('One-off gift', 5000, 'ONCE')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(0)
  })

  it('includes hypothetical lines in both hypotheticalCents and plannedCents', () => {
    insertHypothetical('Maybe gym', 8000, 'MONTHLY')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.hypotheticalCents).toBe(8000)
    expect(summary.plannedCents).toBe(8000)
  })

  it('includes active trackers assigned to the bucket using their own reset_frequency', () => {
    insertTracker(30000, 'MONTHLY')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(30000)
  })

  it('excludes inactive trackers', () => {
    insertTracker(30000, 'MONTHLY', 1, 0)
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(0)
  })

  it('excludes trackers assigned to a different bucket', () => {
    insertTracker(30000, 'MONTHLY', 2)
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(0)
  })

  // Regression: a past bug hardcoded PAYDAY trackers to a MONTHLY period equivalent
  // regardless of the user's actual payday_frequency setting, which under- or
  // over-counted the bucket total for anyone paid WEEKLY/FORTNIGHTLY.
  it('substitutes the real payday_frequency setting for PAYDAY trackers instead of assuming MONTHLY', () => {
    appSettings.payday_frequency = 'FORTNIGHTLY'
    insertTracker(26000, 'PAYDAY')
    const summaryMonthly = getBucketCardSummary(1, 'MONTHLY')
    // $260 every fortnight ≈ $260 × 26/12 per month ≈ $563.33 → rounds to 56333 cents,
    // not the 26000 cents a MONTHLY-equivalent misread would produce.
    expect(summaryMonthly.plannedCents).toBe(Math.round((26000 * 26) / 12))
    expect(summaryMonthly.plannedCents).not.toBe(26000)
  })

  it('falls back to MONTHLY for PAYDAY trackers when payday_frequency is not configured', () => {
    insertTracker(30000, 'PAYDAY')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(30000)
  })

  it('combines upcoming charges, hypotheticals, and trackers in a single total', () => {
    insertUpcoming('Rent', 200000, 'MONTHLY')
    insertHypothetical('Maybe gym', 8000, 'MONTHLY')
    insertTracker(30000, 'MONTHLY')
    const summary = getBucketCardSummary(1, 'MONTHLY')
    expect(summary.plannedCents).toBe(200000 + 8000 + 30000)
    expect(summary.hypotheticalCents).toBe(8000)
  })
})

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
