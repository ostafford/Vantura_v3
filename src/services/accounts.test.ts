import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  getCurrentSaverGoal,
  getSaverGoalHistory,
  setSaverGoal,
  startNewSaverGoal,
  removeSaverGoal,
  reconcileSaverGoalAchievement,
  getSaverInterestBetween,
  getAccountById,
  getSaverMonthlyFlow,
  getOnHandCents,
  getOnHandSavers,
  setSaverCountsOnHand,
} from './accounts'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  schedulePersist: vi.fn(),
}))

/**
 * #29 — real-DB coverage for the saver goal-history + interest service. Goals
 * live in saver_goal_history (source of truth); accounts.target_amount_cents is
 * a denormalised mirror of the open row's amount.
 */
describe('saver goal history + interest', () => {
  let SQL: SqlJsStatic
  let db: Database

  const SAVER = 'saver-1'

  beforeEach(async () => {
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    db.run(
      `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
       VALUES (?, 'Annual bills', 'SAVER', ?, '2026-01-01', '2026-01-01')`,
      [SAVER, 100_000]
    )

    const mod = await import('@/db')
    vi.mocked(mod.getDb).mockReturnValue(db as never)
    vi.mocked(mod.schedulePersist).mockImplementation(() => {})
  })

  function setBalance(cents: number) {
    db.run(`UPDATE accounts SET balance = ? WHERE id = ?`, [cents, SAVER])
  }

  function addInterest(dateIso: string, cents: number) {
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount, transaction_type, created_at)
       VALUES (?, ?, 'SETTLED', 'Interest', ?, 'Interest', ?)`,
      [`int-${dateIso}-${cents}`, SAVER, cents, dateIso]
    )
  }

  // ── setSaverGoal ──────────────────────────────────────────────────────

  it('creates an open goal row and mirrors target_amount_cents', () => {
    setSaverGoal(SAVER, 500_000, '2026-12-01')
    const goal = getCurrentSaverGoal(SAVER)
    expect(goal).toMatchObject({
      goal_amount_cents: 500_000,
      goal_date: '2026-12-01',
      achieved_at: null,
      archived_at: null,
    })
    expect(getAccountById(SAVER)?.target_amount_cents).toBe(500_000)
    expect(getSaverGoalHistory(SAVER)).toHaveLength(1)
  })

  it('edits an unachieved open goal in place (no new cycle)', () => {
    setSaverGoal(SAVER, 500_000, '2026-12-01')
    setSaverGoal(SAVER, 600_000, '2027-01-01')
    expect(getSaverGoalHistory(SAVER)).toHaveLength(1)
    expect(getCurrentSaverGoal(SAVER)).toMatchObject({
      goal_amount_cents: 600_000,
      goal_date: '2027-01-01',
    })
    expect(getAccountById(SAVER)?.target_amount_cents).toBe(600_000)
  })

  it('archives an achieved goal and starts a new cycle when set again', () => {
    setSaverGoal(SAVER, 90_000, null) // balance 100_000 already meets it
    reconcileSaverGoalAchievement()
    expect(getCurrentSaverGoal(SAVER)?.achieved_at).not.toBeNull()

    setSaverGoal(SAVER, 150_000, null)
    const history = getSaverGoalHistory(SAVER)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      goal_amount_cents: 150_000,
      archived_at: null,
    }) // newest first
    expect(history[1]).toMatchObject({ goal_amount_cents: 90_000 })
    expect(history[1].archived_at).not.toBeNull()
    expect(getCurrentSaverGoal(SAVER)?.goal_amount_cents).toBe(150_000)
  })

  it('a null / non-positive amount removes the goal but keeps history', () => {
    setSaverGoal(SAVER, 500_000, null)
    setSaverGoal(SAVER, null, null)
    expect(getCurrentSaverGoal(SAVER)).toBeNull()
    expect(getAccountById(SAVER)?.target_amount_cents).toBeNull()
    const history = getSaverGoalHistory(SAVER)
    expect(history).toHaveLength(1)
    expect(history[0].archived_at).not.toBeNull()
  })

  it('removeSaverGoal archives the open row and clears the mirror', () => {
    setSaverGoal(SAVER, 500_000, '2026-12-01')
    removeSaverGoal(SAVER)
    expect(getCurrentSaverGoal(SAVER)).toBeNull()
    expect(getAccountById(SAVER)?.target_amount_cents).toBeNull()
    expect(getSaverGoalHistory(SAVER)[0].archived_at).not.toBeNull()
    // Removing again when there is no open goal is a harmless no-op.
    expect(() => removeSaverGoal(SAVER)).not.toThrow()
  })

  // ── startNewSaverGoal ────────────────────────────────────────────────

  it('startNewSaverGoal always archives the open row and opens a fresh one', () => {
    setSaverGoal(SAVER, 500_000, null) // not achieved
    startNewSaverGoal(SAVER, 800_000, '2027-06-01')
    const history = getSaverGoalHistory(SAVER)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      goal_amount_cents: 800_000,
      archived_at: null,
    })
    expect(history[1].archived_at).not.toBeNull()
    expect(getAccountById(SAVER)?.target_amount_cents).toBe(800_000)
  })

  // ── reconcileSaverGoalAchievement ───────────────────────────────────

  it('stamps achieved_at once and never clears it on a later drawdown', () => {
    setSaverGoal(SAVER, 100_000, null) // balance exactly meets it
    reconcileSaverGoalAchievement()
    const firstStamp = getCurrentSaverGoal(SAVER)?.achieved_at
    expect(firstStamp).not.toBeNull()

    // Running again does not move the timestamp.
    reconcileSaverGoalAchievement()
    expect(getCurrentSaverGoal(SAVER)?.achieved_at).toBe(firstStamp)

    // A drawdown below the goal leaves achieved_at intact (sticky).
    setBalance(10_000)
    reconcileSaverGoalAchievement()
    expect(getCurrentSaverGoal(SAVER)?.achieved_at).toBe(firstStamp)
  })

  it('does not stamp a goal the balance has not reached', () => {
    setSaverGoal(SAVER, 500_000, null)
    reconcileSaverGoalAchievement()
    expect(getCurrentSaverGoal(SAVER)?.achieved_at).toBeNull()
  })

  // ── getSaverInterestBetween ────────────────────────────────────────

  it('sums only positive Interest-typed credits, honouring the window', () => {
    addInterest('2026-01-15T00:00:00.000Z', 320)
    addInterest('2026-02-15T00:00:00.000Z', 410)
    addInterest('2026-03-15T00:00:00.000Z', 500)
    // A transfer credit and a negative row must be ignored.
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount, transfer_account_id, created_at)
       VALUES ('xfer', ?, 'SETTLED', 'From Spending', 5000, 'spend-1', '2026-02-01T00:00:00.000Z')`,
      [SAVER]
    )
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount, transaction_type, created_at)
       VALUES ('int-neg', ?, 'SETTLED', 'Interest', -100, 'Interest', '2026-02-20T00:00:00.000Z')`,
      [SAVER]
    )

    expect(getSaverInterestBetween(SAVER, null, null)).toBe(1230)
    expect(
      getSaverInterestBetween(SAVER, '2026-02-01T00:00:00.000Z', null)
    ).toBe(910)
    expect(
      getSaverInterestBetween(
        SAVER,
        '2026-02-01T00:00:00.000Z',
        '2026-03-01T00:00:00.000Z'
      )
    ).toBe(410)
    expect(getSaverInterestBetween('other-saver', null, null)).toBe(0)
  })
})

describe('saver monthly flow counts every Round Up row (#202)', () => {
  let SQL: SqlJsStatic
  let db: Database
  const SAVER = 'saver-1'

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 12))
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    db.run(
      `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
       VALUES (?, 'Annual bills', 'SAVER', 0, '2026-01-01', '2026-01-01'),
              ('spending', 'Spending', 'TRANSACTIONAL', 0, '2026-01-01', '2026-01-01')`,
      [SAVER]
    )
    const mod = await import('@/db')
    vi.mocked(mod.getDb).mockReturnValue(db as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes a Round Up credit with no transfer account in the month it landed', () => {
    db.run(
      `INSERT INTO transactions (id, account_id, status, description, amount, transfer_account_id, transaction_type, created_at)
       VALUES ('t-transfer', ?, 'SETTLED', 'Transfer in', 50000, 'spending', NULL, '2026-10-15T12:00:00+11:00'),
              ('t-roundup', ?, 'SETTLED', 'Round Up', 120, NULL, 'Round Up', '2026-10-15T13:00:00+11:00')`,
      [SAVER, SAVER]
    )
    const october = getSaverMonthlyFlow(SAVER, 1)
    expect(october).toEqual([
      { monthLabel: "Oct '26", flowCents: -50120, txCount: 2 },
    ])
  })
})

/**
 * #213 — On hand = open, non-joint Spending account(s) + every open, non-joint
 * Saver switched on. Joint (2Up) and closed accounts never count and are never
 * eligible for the switch.
 */
describe('On hand (#213)', () => {
  let SQL: SqlJsStatic
  let db: Database

  beforeEach(async () => {
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    const mod = await import('@/db')
    vi.mocked(mod.getDb).mockReturnValue(db as never)
    vi.mocked(mod.schedulePersist).mockImplementation(() => {})
  })

  function insert(
    id: string,
    type: string,
    balance: number,
    opts: { on?: boolean; ownership?: string | null; closed?: boolean } = {}
  ) {
    db.run(
      `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
         ownership_type, is_closed, counts_on_hand)
       VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01', ?, ?, ?)`,
      [
        id,
        id,
        type,
        balance,
        opts.ownership === undefined ? 'INDIVIDUAL' : opts.ownership,
        opts.closed ? 1 : 0,
        opts.on ? 1 : 0,
      ]
    )
  }

  it('is the Spending account plus every Saver switched on', () => {
    insert('spend', 'TRANSACTIONAL', 120_00)
    insert('bills', 'SAVER', 500_00, { on: true })
    insert('holiday', 'SAVER', 3_000_00, { on: true })
    insert('emergency', 'SAVER', 10_000_00)

    expect(getOnHandCents()).toBe(120_00 + 500_00 + 3_000_00)
  })

  it('excludes switched-off, joint and closed accounts, whatever their switch', () => {
    insert('spend', 'TRANSACTIONAL', 100_00)
    insert('off', 'SAVER', 1_00)
    insert('2up-spend', 'TRANSACTIONAL', 2_00, { ownership: 'JOINT' })
    insert('2up-saver', 'SAVER', 4_00, { ownership: 'JOINT', on: true })
    insert('old-spend', 'TRANSACTIONAL', 8_00, { closed: true })
    insert('old-saver', 'SAVER', 16_00, { closed: true, on: true })

    expect(getOnHandCents()).toBe(100_00)
  })

  it('counts an account with no stored ownership as non-joint', () => {
    insert('spend', 'TRANSACTIONAL', 100_00, { ownership: null })
    insert('bills', 'SAVER', 50_00, { ownership: null, on: true })

    expect(getOnHandCents()).toBe(150_00)
  })

  it('carries a negative balance through, unclamped', () => {
    insert('spend', 'TRANSACTIONAL', -30_00)
    insert('bills', 'SAVER', 10_00, { on: true })

    expect(getOnHandCents()).toBe(-20_00)
  })

  it('is 0 with no accounts', () => {
    expect(getOnHandCents()).toBe(0)
  })

  it('lists only eligible Savers, by name, with their switch', () => {
    insert('spend', 'TRANSACTIONAL', 1_00)
    insert('s-b', 'SAVER', 2_00, { on: true })
    insert('s-a', 'SAVER', 3_00)
    insert('s-joint', 'SAVER', 4_00, { ownership: 'JOINT' })
    insert('s-closed', 'SAVER', 5_00, { closed: true })

    expect(getOnHandSavers()).toEqual([
      { id: 's-a', display_name: 's-a', balance: 3_00, countsOnHand: false },
      { id: 's-b', display_name: 's-b', balance: 2_00, countsOnHand: true },
    ])
  })

  it('switches a Saver on and off, and On hand follows', () => {
    insert('spend', 'TRANSACTIONAL', 100_00)
    insert('bills', 'SAVER', 50_00)

    expect(setSaverCountsOnHand('bills', true)).toBe(true)
    expect(getOnHandCents()).toBe(150_00)
    expect(setSaverCountsOnHand('bills', false)).toBe(true)
    expect(getOnHandCents()).toBe(100_00)
  })

  it('refuses to switch on an ineligible account, writing nothing', () => {
    insert('spend', 'TRANSACTIONAL', 100_00)
    insert('2up', 'SAVER', 4_00, { ownership: 'JOINT' })
    insert('old', 'SAVER', 8_00, { closed: true })

    for (const id of ['spend', '2up', 'old', 'missing']) {
      expect(setSaverCountsOnHand(id, true), id).toBe(false)
    }
    expect(
      db.exec(`SELECT COUNT(*) FROM accounts WHERE counts_on_hand = 1`)[0]
        .values[0][0]
    ).toBe(0)
  })
})
