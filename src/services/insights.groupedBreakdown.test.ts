/**
 * getWeeklyCategoryBreakdownGrouped is load-bearing for the categorical
 * colour system's validated adjacency guarantees (see colorSystem.ts): the
 * real parent groups that have spend must render in a fixed order (empty
 * groups are dropped — #31), and overflow past the individual-category cap
 * must fold into "Other" rather than growing the visible category count.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
}))

const { getWeeklyCategoryBreakdownGrouped } = await import('./insights')

beforeAll(async () => {
  SQL = await initSqlJs()
})

function insertCategory(id: string, name: string, parentId: string | null) {
  db.run(`INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)`, [
    id,
    name,
    parentId,
  ])
}

let txCounter = 0
function insertSpend(
  categoryId: string | null,
  amountCents: number,
  createdAt = '2026-08-03T10:00:00.000Z'
) {
  txCounter += 1
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, is_categorizable, category_id, amount, created_at)
     VALUES (?, 'acc-1', 'SETTLED', 'Test', 1, ?, ?, ?)`,
    [`tx-${txCounter}`, categoryId, -amountCents, createdAt]
  )
}

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  txCounter = 0

  // Real Up Bank taxonomy shape: 4 parents, a handful of children each.
  insertCategory('home', 'Home', null)
  insertCategory('groceries', 'Groceries', 'home')
  insertCategory('utilities', 'Utilities', 'home')
  insertCategory('transport', 'Transport', null)
  insertCategory('fuel', 'Fuel', 'transport')
  insertCategory('good-life', 'Good Life', null)
  insertCategory('restaurants', 'Restaurants & Cafes', 'good-life')
  insertCategory('hobbies', 'Hobbies', 'good-life')
  insertCategory('personal', 'Personal', null)
  insertCategory('health', 'Health & Medical', 'personal')
})

describe('getWeeklyCategoryBreakdownGrouped', () => {
  const weekRange = {
    start: new Date('2026-08-03'),
    end: new Date('2026-08-09'),
    startStr: '2026-08-03',
    startIso: '2026-08-03T00:00:00.000Z',
    endIso: '2026-08-09T23:59:59.999Z',
  }

  it('omits real parent groups with zero spend (#31), keeping the rest in the fixed validated order', () => {
    // Only Home and Good Life have spend this week — Transport and Personal
    // must NOT appear at all (no empty header). The groups that remain stay
    // a subsequence of the CVD-validated chain order, each still preceded by
    // its own header, so no cross-family bars become directly adjacent.
    insertSpend('groceries', 5000)
    insertSpend('hobbies', 3000)

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const parentNames = sections
      .filter((s) => !s.isOther && s.parentId !== null)
      .map((s) => s.parentName)

    expect(parentNames).toEqual(['Home', 'Good Life'])
  })

  it('keeps present groups in PARENT_DISPLAY_ORDER regardless of which group has more spend', () => {
    // Good Life outspends Home, but Home still sorts first — group order is
    // fixed, never by spend.
    insertSpend('groceries', 1000)
    insertSpend('hobbies', 9000)

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const parentNames = sections
      .filter((s) => !s.isOther && s.parentId !== null)
      .map((s) => s.parentName)

    expect(parentNames).toEqual(['Home', 'Good Life'])
  })

  it('sorts rows by spend within each group', () => {
    insertSpend('groceries', 3000)
    insertSpend('utilities', 9000)

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const home = sections.find((s) => s.parentName === 'Home')
    expect(home?.rows.map((r) => r.category_name)).toEqual([
      'Utilities',
      'Groceries',
    ])
  })

  it('folds overflow past the individual-category cap into a single Other row', () => {
    // 9 distinct spending categories > the 7-category individual cap.
    insertSpend('groceries', 9000)
    insertSpend('utilities', 8000)
    insertSpend('fuel', 7000)
    insertSpend('restaurants', 6000)
    insertSpend('hobbies', 5000)
    insertSpend('health', 4000)
    // A second Personal category to push past 7 distinct categories.
    insertCategory('education', 'Education', 'personal')
    insertSpend('education', 3000)
    insertCategory('gifts', 'Gifts & Charity', 'personal')
    insertSpend('gifts', 2000)
    insertCategory('clothing', 'Clothing', 'personal')
    insertSpend('clothing', 1000)

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const otherSection = sections.find((s) => s.isOther)
    expect(otherSection).toBeDefined()
    expect(otherSection?.rows).toHaveLength(1)
    expect(otherSection?.rows[0].category_name).toMatch(
      /^Other \(2 categories\)$/
    )
    // The 2 smallest (clothing 1000, gifts 2000) fold into Other; total
    // reflects their combined spend.
    expect(otherSection?.rows[0].total).toBe(3000)

    const totalIndividualRows = sections
      .filter((s) => !s.isOther)
      .reduce((sum, s) => sum + s.rows.length, 0)
    expect(totalIndividualRows).toBe(7)
  })

  it('puts uncategorised spend in its own trailing section', () => {
    insertSpend('groceries', 5000)
    insertSpend(null, 2000)

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const uncategorised = sections.find((s) => s.parentName === 'Uncategorised')
    expect(uncategorised).toBeDefined()
    expect(uncategorised?.rows[0].total).toBe(2000)
    expect(uncategorised?.rows[0].category_id).toBeNull()
  })

  it('returns an empty array when there is no spend at all', () => {
    expect(getWeeklyCategoryBreakdownGrouped(weekRange)).toEqual([])
  })

  it('excludes transfers and non-categorizable transactions, matching Money Out', () => {
    insertSpend('groceries', 5000)
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, is_categorizable, category_id, amount, created_at, transfer_account_id)
       VALUES ('tx-transfer', 'acc-1', 'SETTLED', 'Transfer', 1, 'groceries', -1000, '2026-08-03T10:00:00.000Z', 'acc-2')`
    )
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, is_categorizable, category_id, amount, created_at)
       VALUES ('tx-noncat', 'acc-1', 'SETTLED', 'Non-cat', 0, 'groceries', -1000, '2026-08-03T10:00:00.000Z')`
    )

    const sections = getWeeklyCategoryBreakdownGrouped(weekRange)
    const home = sections.find((s) => s.parentName === 'Home')
    expect(home?.rows.find((r) => r.category_id === 'groceries')?.total).toBe(
      5000
    )
  })
})
