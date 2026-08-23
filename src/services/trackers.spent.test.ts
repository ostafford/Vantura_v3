import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: () => null,
  schedulePersist: () => {},
}))

const { createTracker, getTrackerSpent, getTrackerSpentInPeriod } =
  await import('./trackers')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  db.run(`INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries')`)
})

function insertTransaction(
  id: string,
  categoryId: string,
  amountCents: number,
  createdAt: string
): void {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, category_id, amount, created_at)
     VALUES (?, 'acc1', 'SETTLED', 'Test txn', ?, ?, ?)`,
    [id, categoryId, amountCents, createdAt]
  )
}

describe('getTrackerSpent delegates to getTrackerSpentInPeriod', () => {
  it('agrees with getTrackerSpentInPeriod for normalized (10-char) period bounds', () => {
    const trackerId = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    db.run(
      `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
      ['2026-03-01', '2026-04-01', trackerId]
    )
    insertTransaction('t1', 'groceries', -1500, '2026-03-15')
    insertTransaction('t2', 'groceries', -2000, '2026-03-20')

    expect(getTrackerSpent(trackerId)).toBe(3500)
    expect(getTrackerSpent(trackerId)).toBe(
      getTrackerSpentInPeriod(trackerId, '2026-03-01', '2026-04-01')
    )
  })

  it('agrees with getTrackerSpentInPeriod when last_reset_date/next_reset_date exceed 10 characters', () => {
    const trackerId = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    db.run(
      `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
      ['2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', trackerId]
    )
    // Inside the period.
    insertTransaction('t1', 'groceries', -1500, '2026-03-15')
    // Exactly on the (exclusive) next_reset_date boundary — must be excluded from
    // this period. A non-normalized comparison against the raw datetime string
    // would wrongly include it, since '2026-04-01' < '2026-04-01T00:00:00.000Z'
    // as a plain string comparison.
    insertTransaction('t2', 'groceries', -2000, '2026-04-01')
    // Before the (inclusive) last_reset_date boundary — excluded.
    insertTransaction('t3', 'groceries', -500, '2026-02-28')

    const spent = getTrackerSpent(trackerId)
    const spentInPeriod = getTrackerSpentInPeriod(
      trackerId,
      '2026-03-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z'
    )

    expect(spent).toBe(1500)
    expect(spent).toBe(spentInPeriod)
  })
})
