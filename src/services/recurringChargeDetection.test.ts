import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  detectRecurringCharges,
  dismissChargeSuggestion,
  undismissChargeSuggestion,
  getDismissedSuggestionKeys,
} from './recurringChargeDetection'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  schedulePersist: vi.fn(),
}))

const TODAY = '2026-06-15'

describe('detectRecurringCharges (#20)', () => {
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  let seq = 0
  function addDebit(
    rawText: string | null,
    description: string,
    amountCents: number,
    dateStr: string,
    opts: { category?: string; transfer?: boolean; roundUpParent?: string } = {}
  ) {
    db.run(
      `INSERT INTO transactions
         (id, account_id, status, raw_text, description, amount, category_id,
          transfer_account_id, round_up_parent_id, settled_at, created_at, source)
       VALUES (?, 'acc', 'SETTLED', ?, ?, ?, ?, ?, ?, ?, ?, 'up')`,
      [
        `tx-${seq++}`,
        rawText,
        description,
        -Math.abs(amountCents),
        opts.category ?? null,
        opts.transfer ? 'other-acc' : null,
        opts.roundUpParent ?? null,
        `${dateStr}T02:00:00.000Z`,
        `${dateStr}T02:00:00.000Z`,
      ]
    )
  }

  /** n occurrences, `intervalDays` apart, most recent `lastDaysAgo` before TODAY. */
  function monthlyRun(
    rawText: string | null,
    name: string,
    amountCents: number | number[],
    n: number,
    intervalDays = 30,
    lastDaysAgo = 5,
    category?: string
  ) {
    for (let i = 0; i < n; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - lastDaysAgo - (n - 1 - i) * intervalDays)
      const amt = Array.isArray(amountCents)
        ? amountCents[i % amountCents.length]
        : amountCents
      addDebit(rawText, name, amt, d.toISOString().slice(0, 10), { category })
    }
  }

  it('detects a clean monthly subscription and carries the raw_text', () => {
    monthlyRun('DD NETFLIX.COM', 'Netflix', 1899, 6)
    const [s, ...rest] = detectRecurringCharges()
    expect(rest).toHaveLength(0)
    expect(s).toMatchObject({
      key: 'DD NETFLIX.COM',
      name: 'Netflix',
      amountCents: 1899,
      frequency: 'MONTHLY',
      matchRawText: 'DD NETFLIX.COM',
      occurrences: 6,
    })
    expect(s.nextChargeDate > TODAY).toBe(true)
    expect(s.sampleDates).toHaveLength(6)
  })

  it('classifies a ~7-day pattern as WEEKLY', () => {
    monthlyRun('COFFEE SUB', 'Daily Grind', 500, 5, 7, 2)
    expect(detectRecurringCharges()[0]?.frequency).toBe('WEEKLY')
  })

  it('classifies a ~365-day pattern as YEARLY (needs the multi-year lookback)', () => {
    monthlyRun('DOMAIN RENEWAL', 'Domain', 2400, 3, 365, 20)
    expect(detectRecurringCharges()[0]?.frequency).toBe('YEARLY')
  })

  it('ignores a group with fewer than 3 occurrences', () => {
    monthlyRun('DD SPOTIFY', 'Spotify', 1299, 2)
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('ignores a group whose amounts vary by more than ±20%', () => {
    monthlyRun('POWER CO', 'Power', [10000, 10000, 10000, 20000], 4)
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('ignores a group whose intervals are too scattered', () => {
    // gaps: 30, 3, 55, 30 → median 30 (MONTHLY) but only 2/4 in the 25–35 band
    const days = [0, 30, 33, 88, 118]
    days.forEach((offset) => {
      const d = new Date(`${TODAY}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - (118 - offset) - 4)
      addDebit('ERRATIC', 'Erratic', 4000, d.toISOString().slice(0, 10))
    })
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('ignores a pattern that has gone stale (last seen too long ago)', () => {
    monthlyRun('OLD SUB', 'Old Sub', 999, 5, 30, 70) // last debit 70d ago, ~30d cadence
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('skips a group already covered by an existing upcoming charge (match_raw_text)', () => {
    monthlyRun('DD NETFLIX.COM', 'Netflix', 1899, 6)
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, match_raw_text)
       VALUES ('Netflix', 1899, 'MONTHLY', '2026-07-01', '2026-01-01', 'DD NETFLIX.COM')`
    )
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('skips a group whose name already matches an existing charge', () => {
    monthlyRun(null, 'Gym Membership', 5500, 4)
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
       VALUES ('  gym   MEMBERSHIP ', 5500, 'MONTHLY', '2026-07-01', '2026-01-01')`
    )
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('groups by description when raw_text is missing, and leaves matchRawText null', () => {
    monthlyRun(null, 'Local Newspaper', 4200, 4)
    const s = detectRecurringCharges()[0]
    expect(s.key).toBe('Local Newspaper')
    expect(s.matchRawText).toBeNull()
  })

  it('excludes transfers and round-ups from detection', () => {
    for (let i = 0; i < 6; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 5 - (5 - i) * 30)
      addDebit('TFR OUT', 'To Savings', 20000, d.toISOString().slice(0, 10), {
        transfer: true,
      })
    }
    expect(detectRecurringCharges()).toHaveLength(0)
  })

  it('respects dismissals and can restore them', () => {
    monthlyRun('DD NETFLIX.COM', 'Netflix', 1899, 6)
    dismissChargeSuggestion('DD NETFLIX.COM')
    expect(getDismissedSuggestionKeys().has('DD NETFLIX.COM')).toBe(true)
    expect(detectRecurringCharges()).toHaveLength(0)

    undismissChargeSuggestion('DD NETFLIX.COM')
    expect(detectRecurringCharges()).toHaveLength(1)
  })
})
