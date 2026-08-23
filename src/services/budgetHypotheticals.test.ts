import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  schedulePersist: () => {},
}))

const {
  getBudgetLines,
  getVariableLines,
  getHypotheticalLines,
  createBudgetLine,
} = await import('./budgetHypotheticals')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)

  db.run(
    `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Bills', 'icon', 0, '2026-01-01')`
  )
})

describe('budgetHypotheticals collapsed queries', () => {
  it('getBudgetLines returns all lines for a bucket, variable-first then by name', () => {
    createBudgetLine(1, 'Zebra', 1000, 'MONTHLY', false)
    createBudgetLine(1, 'Rent', 200000, 'MONTHLY', true)
    createBudgetLine(1, 'Apple', 500, 'MONTHLY', false)

    const lines = getBudgetLines(1)
    expect(lines.map((l) => l.name)).toEqual(['Apple', 'Zebra', 'Rent'])
    expect(lines.map((l) => l.is_hypothetical)).toEqual([false, false, true])
  })

  it('getVariableLines returns only is_hypothetical = 0 lines, ordered by name', () => {
    createBudgetLine(1, 'Zebra', 1000, 'MONTHLY', false)
    createBudgetLine(1, 'Rent', 200000, 'MONTHLY', true)
    createBudgetLine(1, 'Apple', 500, 'MONTHLY', false)

    const lines = getVariableLines(1)
    expect(lines.map((l) => l.name)).toEqual(['Apple', 'Zebra'])
    expect(lines.every((l) => !l.is_hypothetical)).toBe(true)
  })

  it('getHypotheticalLines returns only is_hypothetical = 1 lines, ordered by name', () => {
    createBudgetLine(1, 'Zebra', 1000, 'MONTHLY', true)
    createBudgetLine(1, 'Rent', 200000, 'MONTHLY', false)
    createBudgetLine(1, 'Apple', 500, 'MONTHLY', true)

    const lines = getHypotheticalLines(1)
    expect(lines.map((l) => l.name)).toEqual(['Apple', 'Zebra'])
    expect(lines.every((l) => l.is_hypothetical)).toBe(true)
  })

  it('getVariableLines and getHypotheticalLines partition getBudgetLines with no overlap', () => {
    createBudgetLine(1, 'A', 100, 'MONTHLY', false)
    createBudgetLine(1, 'B', 200, 'MONTHLY', true)
    createBudgetLine(1, 'C', 300, 'MONTHLY', false)
    createBudgetLine(1, 'D', 400, 'MONTHLY', true)

    const all = getBudgetLines(1)
    const variable = getVariableLines(1)
    const hypothetical = getHypotheticalLines(1)

    expect(variable.length + hypothetical.length).toBe(all.length)
    expect(new Set([...variable, ...hypothetical].map((l) => l.id))).toEqual(
      new Set(all.map((l) => l.id))
    )
  })

  it('scopes to the requested bucket only', () => {
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Other', 'icon', 1, '2026-01-01')`
    )
    createBudgetLine(1, 'Bucket1Line', 100, 'MONTHLY', false)
    createBudgetLine(2, 'Bucket2Line', 200, 'MONTHLY', true)

    expect(getBudgetLines(1).map((l) => l.name)).toEqual(['Bucket1Line'])
    expect(getVariableLines(2)).toEqual([])
    expect(getHypotheticalLines(2).map((l) => l.name)).toEqual(['Bucket2Line'])
  })

  it('returns empty arrays when the db is unavailable', async () => {
    vi.resetModules()
    vi.doMock('@/db', () => ({
      getDb: () => null,
      schedulePersist: () => {},
    }))
    const mod = await import('./budgetHypotheticals')
    expect(mod.getBudgetLines(1)).toEqual([])
    expect(mod.getVariableLines(1)).toEqual([])
    expect(mod.getHypotheticalLines(1)).toEqual([])
    vi.doUnmock('@/db')
  })
})
