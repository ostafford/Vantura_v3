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

const { createTracker, updateTracker } = await import('./trackers')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]

  db.run(
    `INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries'), ('takeaway', 'Takeaway')`
  )
})

describe('category-exclusivity guard', () => {
  it('creating a tracker with a category already used by another active tracker throws', () => {
    createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    expect(() =>
      createTracker('Duplicate', 10000, 'WEEKLY', 1, ['groceries'])
    ).toThrow('CATEGORY_ALREADY_ASSIGNED:groceries')
  })

  it('creating a tracker with an unclaimed category succeeds', () => {
    createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    expect(() =>
      createTracker('Snacks', 10000, 'WEEKLY', 1, ['takeaway'])
    ).not.toThrow()
  })

  it('editing a tracker to add a category claimed by another tracker throws', () => {
    createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    const snacksId = createTracker('Snacks', 10000, 'WEEKLY', 1, ['takeaway'])
    expect(() =>
      updateTracker(snacksId, 'Snacks', 10000, 'WEEKLY', 1, [
        'takeaway',
        'groceries',
      ])
    ).toThrow('CATEGORY_ALREADY_ASSIGNED:groceries')
  })

  it('editing a tracker with only its own already-assigned category does not throw', () => {
    const foodId = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    expect(() =>
      updateTracker(foodId, 'Food & Drink', 35000, 'WEEKLY', 1, ['groceries'])
    ).not.toThrow()
  })

  it('a category freed by deactivating a tracker becomes available again', () => {
    const foodId = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    db.run(`UPDATE trackers SET is_active = 0 WHERE id = ?`, [foodId])
    expect(() =>
      createTracker('New Food', 10000, 'WEEKLY', 1, ['groceries'])
    ).not.toThrow()
  })
})
