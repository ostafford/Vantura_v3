/**
 * #16 — tracker config-history: a mid-period budget / category change takes
 * effect no earlier than the next day and *splits* the current period rather
 * than re-judging it whole. Each segment is judged against the config that
 * applied during it; the segment's budget is the config budget prorated by the
 * segment's share of the period's days.
 *
 * `splitPeriodIntoSegments` (the pure core) is tested array-in/array-out; the
 * DB wrapper, the write path and profile round-trip need a real sql.js DB.
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { TrackerConfigVersion } from './trackers'

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
  splitPeriodIntoSegments,
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

// ─── pure core: splitPeriodIntoSegments ──────────────────────────────────────

type Cfg = Pick<TrackerConfigVersion, 'budget_amount' | 'category_ids'>

function version(
  id: number,
  effectiveFrom: string,
  budget: number,
  cats: string[]
): TrackerConfigVersion {
  return {
    id,
    effective_from: effectiveFrom,
    budget_amount: budget,
    category_ids: cats,
  }
}

/** A spend-lookup over an in-memory transaction list: sum where category ∈ set and start ≤ date < end. */
function fakeSpend(txns: { cat: string; cents: number; date: string }[]) {
  return (cats: string[], start: string, end: string): number =>
    txns
      .filter((t) => cats.includes(t.cat) && t.date >= start && t.date < end)
      .reduce((s, t) => s + t.cents, 0)
}

describe('splitPeriodIntoSegments (pure core)', () => {
  const genesis = version(1, '2026-03-01', 30000, ['groceries'])
  const fallback: Cfg = { budget_amount: 30000, category_ids: ['groceries'] }

  it('is one full-budget segment when nothing changed', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [genesis],
      fallback,
      fakeSpend([
        { cat: 'groceries', cents: 1000, date: '2026-03-02' },
        { cat: 'groceries', cents: 2500, date: '2026-03-06' },
      ])
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({
      start: '2026-03-01',
      end: '2026-03-08',
      budget: 30000,
      spent: 3500,
    })
  })

  it('splits at a mid-period budget change and prorates each segment by days', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08', // 7 days
      [genesis, version(2, '2026-03-05', 40000, ['groceries'])],
      fallback,
      fakeSpend([
        { cat: 'groceries', cents: 1000, date: '2026-03-02' },
        { cat: 'groceries', cents: 2000, date: '2026-03-06' },
      ])
    )
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({
      start: '2026-03-01',
      end: '2026-03-05',
      budget: Math.round((30000 * 4) / 7),
      spent: 1000,
    })
    expect(segs[1]).toMatchObject({
      start: '2026-03-05',
      end: '2026-03-08',
      budget: Math.round((40000 * 3) / 7),
      spent: 2000,
    })
  })

  it('prorated segments of an unchanged budget sum back to the full budget', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [genesis, version(2, '2026-03-05', 30000, ['groceries', 'dining'])],
      fallback,
      fakeSpend([])
    )
    expect(segs.reduce((s, seg) => s + seg.budget, 0)).toBe(30000)
  })

  it('counts a category only while it was part of the tracker (add mid-period)', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [genesis, version(2, '2026-03-05', 30000, ['groceries', 'dining'])],
      fallback,
      fakeSpend([
        { cat: 'groceries', cents: 1000, date: '2026-03-02' },
        { cat: 'dining', cents: 5000, date: '2026-03-02' }, // pre-boundary, dining not yet tracked
        { cat: 'dining', cents: 3000, date: '2026-03-06' }, // post-boundary, counted
      ])
    )
    expect(segs.reduce((s, seg) => s + seg.spent, 0)).toBe(4000)
  })

  it('counts a category only while it was part of the tracker (remove mid-period)', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [
        version(1, '2026-03-01', 30000, ['groceries', 'dining']),
        version(2, '2026-03-05', 30000, ['groceries']),
      ],
      { budget_amount: 30000, category_ids: ['groceries'] },
      fakeSpend([
        { cat: 'dining', cents: 5000, date: '2026-03-02' }, // still tracked
        { cat: 'dining', cents: 3000, date: '2026-03-06' }, // removed from day 5
      ])
    )
    expect(segs.reduce((s, seg) => s + seg.spent, 0)).toBe(5000)
  })

  it('handles N changes → N+1 segments', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [
        genesis,
        version(2, '2026-03-03', 20000, ['groceries']),
        version(3, '2026-03-06', 25000, ['groceries']),
      ],
      fallback,
      fakeSpend([])
    )
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      ['2026-03-01', '2026-03-03'],
      ['2026-03-03', '2026-03-06'],
      ['2026-03-06', '2026-03-08'],
    ])
  })

  it('prorates against the actual period length for a variable-length (PAYDAY) period', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-15', // 14 days
      [genesis, version(2, '2026-03-08', 42000, ['groceries'])],
      fallback,
      fakeSpend([])
    )
    expect(segs[0].budget).toBe(Math.round((30000 * 7) / 14))
    expect(segs[1].budget).toBe(Math.round((42000 * 7) / 14))
  })

  it('does not split when a change is effective on or after the period end', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [genesis, version(2, '2026-03-08', 40000, ['groceries'])],
      fallback,
      fakeSpend([])
    )
    expect(segs).toHaveLength(1)
    expect(segs[0].budget).toBe(30000)
  })

  it('does not split when a change is effective exactly on the period start; that config wins the whole period', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [genesis, version(2, '2026-03-01', 45000, ['groceries'])],
      fallback,
      fakeSpend([])
    )
    expect(segs).toHaveLength(1)
    expect(segs[0].budget).toBe(45000)
  })

  it('dedups two changes landing on the same day', () => {
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [
        genesis,
        version(2, '2026-03-04', 20000, ['groceries']),
        version(3, '2026-03-04', 25000, ['groceries']),
      ],
      fallback,
      fakeSpend([])
    )
    expect(segs).toHaveLength(2)
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      ['2026-03-01', '2026-03-04'],
      ['2026-03-04', '2026-03-08'],
    ])
  })

  it('uses the fallback for any day no history row covers', () => {
    // History is entirely empty → the whole period is the fallback config.
    const empty = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [],
      { budget_amount: 12345, category_ids: ['groceries'] },
      fakeSpend([{ cat: 'groceries', cents: 900, date: '2026-03-03' }])
    )
    expect(empty).toEqual([
      {
        start: '2026-03-01',
        end: '2026-03-08',
        budget: 12345,
        spent: 900,
        category_ids: ['groceries'],
      },
    ])

    // History exists but starts AFTER the period start → the first segment
    // falls back; the second uses the in-period version.
    const partial = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08',
      [version(9, '2026-03-05', 70000, ['groceries', 'dining'])],
      { budget_amount: 30000, category_ids: ['groceries'] },
      fakeSpend([])
    )
    expect(partial.map((s) => s.budget)).toEqual([
      Math.round((30000 * 4) / 7),
      Math.round((70000 * 3) / 7),
    ])
  })

  it('ADVERSARIAL: front-loaded spend against a mid-period raise — the early segment blows its prorated budget even though total spend is far under the new head budget', () => {
    const headBudget = 70000
    const genesisBudget = 10000
    const segs = splitPeriodIntoSegments(
      '2026-03-01',
      '2026-03-08', // 7 days
      [
        version(1, '2026-03-01', genesisBudget, ['groceries']),
        version(2, '2026-03-04', headBudget, ['groceries']), // day 4 raise
      ],
      { budget_amount: headBudget, category_ids: ['groceries'] },
      fakeSpend([{ cat: 'groceries', cents: 5000, date: '2026-03-02' }]) // all in segment 1
    )
    const effectiveBudget = segs.reduce((s, seg) => s + seg.budget, 0)
    // A naive whole-period-at-new-budget calc would read 5000 / 70000 = under.
    expect(5000).toBeLessThan(headBudget)
    // The split exposes it: segment 1 spent 5000 against round(10000·3/7)=4286.
    expect(segs[0].spent).toBeGreaterThan(segs[0].budget)
    // And the effective budget sits strictly between the old and new head.
    expect(effectiveBudget).toBeGreaterThan(genesisBudget)
    expect(effectiveBudget).toBeLessThan(headBudget)
  })
})

// ─── DB wrapper + write path (need a real DB) ────────────────────────────────

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

describe('computeCurrentPeriodSegments (DB wrapper)', () => {
  it('wires history, per-segment spend and the fallback together end-to-end', () => {
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    setPeriod(id, '2026-03-01', '2026-03-08')
    addConfigVersion(id, '2026-03-05', 40000, ['groceries', 'dining'])
    insertTx('g1', 'groceries', -1000, '2026-03-02')
    insertTx('d1', 'dining', -5000, '2026-03-02') // pre-boundary, dining untracked → excluded
    insertTx('d2', 'dining', -3000, '2026-03-06') // post-boundary → counted

    const segs = computeCurrentPeriodSegments({
      id,
      last_reset_date: '2026-03-01',
      next_reset_date: '2026-03-08',
      budget_amount: 40000,
    })
    expect(segs).toHaveLength(2)
    expect(segs.reduce((s, seg) => s + seg.spent, 0)).toBe(4000)
    expect(segs[0].budget).toBe(Math.round((30000 * 4) / 7))
    expect(segs[1].budget).toBe(Math.round((40000 * 3) / 7))
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
    expect(list.map((r) => r.id).sort()).toEqual(['d2', 'g1'])
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
    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries'])
    expect(getTrackerConfigHistory(id)).toHaveLength(2)

    updateTracker(id, 'Food', 45000, 'MONTHLY', 1, ['groceries'])
    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(1)
    expect(history[0].budget_amount).toBe(45000)
  })

  it('synthesises the OLD-config baseline when a tracker has no covering row', () => {
    // Simulate legacy/demo data: a tracker whose only history row is after its
    // period start. An edit must add the pre-change baseline, not just the
    // next-day version, so the pre-boundary segment keeps the old budget.
    const id = createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    db.run(`DELETE FROM tracker_config_history WHERE tracker_id = ?`, [id])
    db.run(
      `UPDATE trackers SET last_reset_date = '2026-03-01', next_reset_date = '2026-03-08' WHERE id = ?`,
      [id]
    )

    updateTracker(id, 'Food', 45000, 'WEEKLY', 1, ['groceries'])

    const history = getTrackerConfigHistory(id)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      effective_from: '2026-03-01',
      budget_amount: 30000,
    })
    expect(history[1].budget_amount).toBe(45000)
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
    createTracker('Food', 30000, 'WEEKLY', 1, ['groceries'])
    const payload = buildExportPayload()

    replaceTrackers(payload.trackers, payload.trackerCategories, [])

    const newId = trackerIdByName('Food')
    const history = getTrackerConfigHistory(newId)
    expect(history).toHaveLength(1)
    expect(history[0].budget_amount).toBe(30000)
    expect(history[0].category_ids).toEqual(['groceries'])
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
