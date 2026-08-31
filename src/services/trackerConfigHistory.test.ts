/**
 * #16 — tracker config-history: a mid-period budget / category change takes
 * effect no earlier than the next day and *splits* the current period rather
 * than re-judging it whole. Each segment is judged against the config that
 * applied during it; the segment's budget is the config budget prorated by the
 * segment's share of the period's days.
 */
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

const {
  createTracker,
  updateTracker,
  computeCurrentPeriodSegments,
  getTrackerConfigHistory,
  getTrackersWithProgress,
  getTrackerTransactionsInPeriod,
} = await import('./trackers')
const { buildExportPayload, replaceTrackers } = await import('./profileExport')
const { localDateString } = await import('@/lib/format')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  db.run(
    `INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries'), ('dining', 'Dining')`
  )
})

function insertTx(
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

/** Pin a tracker to a known period and anchor its genesis config row at the start. */
function setPeriod(trackerId: number, start: string, end: string): void {
  db.run(
    `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
    [start, end, trackerId]
  )
  db.run(
    `UPDATE tracker_config_history SET effective_from = ?
     WHERE tracker_id = ? AND id = (SELECT MIN(id) FROM tracker_config_history WHERE tracker_id = ?)`,
    [start, trackerId, trackerId]
  )
}

/** Insert a config version directly (bypasses the next-day rule, for calc tests). */
function addConfigVersion(
  trackerId: number,
  effectiveFrom: string,
  budgetCents: number,
  categoryIds: string[]
): void {
  db.run(
    `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, created_at)
     VALUES (?, ?, ?, '2026-01-01')`,
    [trackerId, effectiveFrom, budgetCents]
  )
  const configId = Number(db.exec(`SELECT last_insert_rowid()`)[0].values[0][0])
  for (const catId of categoryIds) {
    db.run(
      `INSERT INTO tracker_config_history_categories (config_id, category_id) VALUES (?, ?)`,
      [configId, catId]
    )
  }
}

describe('computeCurrentPeriodSegments', () => {
  it('is a single full-budget segment when nothing changed this period', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    insertTx('t1', 'groceries', -1000, '2026-03-02')
    insertTx('t2', 'groceries', -2500, '2026-03-06')

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      start: '2026-03-01',
      end: '2026-03-08',
      budget: 30000,
      spent: 3500,
    })
  })

  it('splits at a mid-period budget change and prorates each segment by days', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08') // 7 days
    addConfigVersion(id, '2026-03-05', 40000, ['groceries']) // day 5
    insertTx('t1', 'groceries', -1000, '2026-03-02') // segment 1
    insertTx('t2', 'groceries', -2000, '2026-03-06') // segment 2

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      40000
    )
    expect(segments).toHaveLength(2)
    // $300 × 4/7, $400 × 3/7
    expect(segments[0]).toMatchObject({
      start: '2026-03-01',
      end: '2026-03-05',
      budget: Math.round((30000 * 4) / 7),
      spent: 1000,
    })
    expect(segments[1]).toMatchObject({
      start: '2026-03-05',
      end: '2026-03-08',
      budget: Math.round((40000 * 3) / 7),
      spent: 2000,
    })
  })

  it('prorated segments of an unchanged budget sum back to the full budget', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    // Only the category set changes; budget stays 30000.
    addConfigVersion(id, '2026-03-05', 30000, ['groceries', 'dining'])

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments.reduce((s, seg) => s + seg.budget, 0)).toBe(30000)
  })

  it('counts a category only while it was part of the tracker (add mid-period)', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-05', 30000, ['groceries', 'dining'])
    insertTx('g1', 'groceries', -1000, '2026-03-02') // counted (both segments have groceries)
    insertTx('d1', 'dining', -5000, '2026-03-02') // NOT counted — dining not yet tracked
    insertTx('d2', 'dining', -3000, '2026-03-06') // counted — dining added from day 5

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments.reduce((s, seg) => s + seg.spent, 0)).toBe(4000)
  })

  it('counts a category only while it was part of the tracker (remove mid-period)', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, [
      'groceries',
      'dining',
    ])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-05', 30000, ['groceries'])
    insertTx('d1', 'dining', -5000, '2026-03-02') // counted — dining still tracked
    insertTx('d2', 'dining', -3000, '2026-03-06') // NOT counted — dining removed from day 5

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments.reduce((s, seg) => s + seg.spent, 0)).toBe(5000)
  })

  it('handles N changes → N+1 segments', () => {
    const id = createTracker('Food', 10000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-03', 20000, ['groceries'])
    addConfigVersion(id, '2026-03-06', 30000, ['groceries'])

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      ['2026-03-01', '2026-03-03'],
      ['2026-03-03', '2026-03-06'],
      ['2026-03-06', '2026-03-08'],
    ])
  })

  it('prorates against the actual period length for a variable-length (PAYDAY) period', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-15') // 14 days
    addConfigVersion(id, '2026-03-08', 42000, ['groceries'])

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-15',
      42000
    )
    expect(segments[0].budget).toBe(Math.round((30000 * 7) / 14))
    expect(segments[1].budget).toBe(Math.round((42000 * 7) / 14))
  })

  it('does not split when a change is effective on or after the period end', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-08', 40000, ['groceries']) // == period end

    const segments = computeCurrentPeriodSegments(
      id,
      '2026-03-01',
      '2026-03-08',
      30000
    )
    expect(segments).toHaveLength(1)
    expect(segments[0].budget).toBe(30000)
  })
})

describe('getTrackersWithProgress rollup', () => {
  it('reports effectiveBudget, floored remaining and >100% progress when over the split budget', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-05', 40000, ['groceries'])
    insertTx('t1', 'groceries', -20000, '2026-03-02')
    insertTx('t2', 'groceries', -20000, '2026-03-06')

    const t = getTrackersWithProgress().find((x) => x.id === id)!
    const expectedBudget =
      Math.round((30000 * 4) / 7) + Math.round((40000 * 3) / 7)
    expect(t.effectiveBudget).toBe(expectedBudget)
    expect(t.spent).toBe(40000)
    expect(t.remaining).toBe(0)
    expect(t.progress).toBeGreaterThan(100)
    expect(t.wasAdjustedThisPeriod).toBe(true)
  })

  it('leaves effectiveBudget equal to budget_amount and wasAdjustedThisPeriod false with no change', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')

    const t = getTrackersWithProgress().find((x) => x.id === id)!
    expect(t.effectiveBudget).toBe(30000)
    expect(t.wasAdjustedThisPeriod).toBe(false)
  })
})

describe('getTrackerTransactionsInPeriod (current period, split)', () => {
  it('shows a mid-period-added category only from its effective date', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-05', 30000, ['groceries', 'dining'])
    insertTx('g1', 'groceries', -1000, '2026-03-02')
    insertTx('d1', 'dining', -5000, '2026-03-02') // excluded
    insertTx('d2', 'dining', -3000, '2026-03-06') // included

    const { list } = getTrackerTransactionsInPeriod(id, 0)
    const ids = list.map((r) => r.id).sort()
    expect(ids).toEqual(['d2', 'g1'])
  })
})

describe('updateTracker records config versions', () => {
  const tomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return localDateString(d)
  })()

  it('a budget change writes a version effective tomorrow, keeping the genesis row', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries'])

    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      effective_from: tomorrow,
      budget_amount: 45000,
    })
    expect(history[1].category_ids).toEqual(['groceries'])
  })

  it('a category change writes a version effective tomorrow', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 30000, 'WEEKLY', 1, ['groceries', 'dining'])

    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(2)
    expect(history[1].category_ids.sort()).toEqual(['dining', 'groceries'])
  })

  it('a pure rename writes no new version', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Groceries', 30000, 'WEEKLY', 1, ['groceries'])

    expect(getTrackerConfigHistory(id)).toHaveLength(1)
  })

  it('two edits in one day collapse to a single version (last write wins)', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 50000, 'WEEKLY', 1, ['groceries', 'dining'])

    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      effective_from: tomorrow,
      budget_amount: 50000,
    })
    expect(history[1].category_ids.sort()).toEqual(['dining', 'groceries'])
  })

  it('a frequency change resets history to a fresh genesis row', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries']) // adds a version
    expect(getTrackerConfigHistory(id)).toHaveLength(2)

    updateTracker(id, 'Food', 45000, 'MONTHLY', 1, ['groceries'])
    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(1)
    expect(history[0].budget_amount).toBe(45000)
  })
})

describe('profile export / import round-trip', () => {
  function trackerIdByName(name: string): number {
    return Number(
      db.exec(`SELECT id FROM trackers WHERE name = ?`, [name])[0].values[0][0]
    )
  }

  it('config history survives an export → import round-trip', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries', 'dining'])
    expect(getTrackerConfigHistory(id)).toHaveLength(2)

    const payload = buildExportPayload()
    expect(payload.trackerConfigHistory).toHaveLength(2)

    replaceTrackers(
      payload.trackers,
      payload.trackerCategories,
      payload.trackerConfigHistory
    )

    const newId = trackerIdByName('Food')
    const history = getTrackerConfigHistory(newId)
    expect(history).toHaveLength(2)
    expect(history[0].budget_amount).toBe(30000)
    expect(history[1].budget_amount).toBe(45000)
    expect(history[1].category_ids.sort()).toEqual(['dining', 'groceries'])
  })

  it('synthesises a genesis row when the import carries no config history (pre-v4)', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    const payload = buildExportPayload()

    replaceTrackers(payload.trackers, payload.trackerCategories, [])

    const newId = trackerIdByName('Food')
    const history = getTrackerConfigHistory(newId)
    expect(history).toHaveLength(1)
    expect(history[0].budget_amount).toBe(30000)
    expect(history[0].category_ids).toEqual(['groceries'])
    expect(id).toBeGreaterThan(0)
  })
})

describe('createTracker', () => {
  it('writes a genesis config version at the period start', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, [
      'groceries',
      'dining',
    ])
    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(1)
    expect(history[0].budget_amount).toBe(30000)
    expect(history[0].category_ids.sort()).toEqual(['dining', 'groceries'])

    const trackerRow = db.exec(
      `SELECT last_reset_date FROM trackers WHERE id = ?`,
      [id]
    )
    expect(history[0].effective_from).toBe(
      String(trackerRow[0].values[0][0]).slice(0, 10)
    )
  })
})
