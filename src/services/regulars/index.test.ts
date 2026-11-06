import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { __test__, nextChargeDateFromAnchor, type Regular } from './index'
import {
  nextChargeDateToStoreOnCreate,
  nextChargeDateToStoreOnEdit,
} from './draft'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

const { regularById, regularsByMonth } = await import('./index')
const { localDateString } = await import('@/lib/format')

function makeRow(overrides: Partial<Regular> = {}): Regular {
  return {
    id: 1,
    name: 'Test charge',
    amount: 1000,
    frequency: 'MONTHLY',
    next_charge_date: '2026-01-15',
    category_id: null,
    reminder_days_before: null,
    cancel_by_date: null,
    match_description: null,
    bucket_id: null,
    ...overrides,
  }
}

describe('upcoming recurrence projection', () => {
  it('projects recurring monthly charges into future months indefinitely', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-15',
      cancel_by_date: null,
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-15'])
    expect(april.map((c) => c.next_charge_date)).toEqual(['2026-04-15'])
  })

  it('stops projecting once cancel_by_date is exceeded', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-10',
      cancel_by_date: '2026-03-15',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-10'])
    expect(april).toEqual([])
  })

  it('keeps ONCE charges as a single occurrence', () => {
    const row = makeRow({
      frequency: 'ONCE',
      next_charge_date: '2026-03-22',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-22'])
    expect(april).toEqual([])
  })

  it('computes first occurrence on or after target for reminder/calendar projection', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-01',
      'FORTNIGHTLY',
      '2026-02-01',
      null
    )
    expect(occurrence).toBe('2026-02-12')
  })

  it('projects monthly occurrences from past base date to target window', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-15',
      'MONTHLY',
      '2026-03-01',
      null
    )
    expect(occurrence).toBe('2026-03-15')
  })
})

describe('month-end anchors keep their day after a short month (#145)', () => {
  function occurrences(
    anchor: string,
    frequency: string,
    start: string,
    end: string
  ): string[] {
    return __test__
      .getProjectedOccurrencesInRange(
        makeRow({ next_charge_date: anchor, frequency }),
        start,
        end
      )
      .map((c) => c.next_charge_date)
  }

  it('a Jan 31 monthly charge returns to the 31st after February', () => {
    expect(
      occurrences('2026-01-31', 'MONTHLY', '2026-02-01', '2026-05-31')
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('a Jan 30 monthly charge returns to the 30th after February', () => {
    expect(
      occurrences('2026-01-30', 'MONTHLY', '2026-02-01', '2026-03-31')
    ).toEqual(['2026-02-28', '2026-03-30'])
  })

  it('clamps to Feb 29 in a leap year, then returns to the 31st', () => {
    expect(
      occurrences('2024-01-31', 'MONTHLY', '2024-02-01', '2024-03-31')
    ).toEqual(['2024-02-29', '2024-03-31'])
  })

  it('quarterly keeps the anchor day across February', () => {
    expect(
      occurrences('2025-11-30', 'QUARTERLY', '2026-01-01', '2026-06-30')
    ).toEqual(['2026-02-28', '2026-05-30'])
  })

  it('yearly Feb 29 lands on Feb 28 in common years and Feb 29 in leap years', () => {
    expect(
      occurrences('2024-02-29', 'YEARLY', '2025-01-01', '2028-12-31')
    ).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })

  it('firstOccurrenceOnOrAfter projects from the anchor, not the clamped occurrence', () => {
    expect(
      __test__.firstOccurrenceOnOrAfter(
        '2026-01-31',
        'MONTHLY',
        '2026-03-01',
        null
      )
    ).toBe('2026-03-31')
  })

  it('cancel_by_date still stops a month-end charge', () => {
    expect(
      occurrences('2026-01-31', 'MONTHLY', '2026-02-01', '2026-05-31').length
    ).toBe(4)
    expect(
      __test__
        .getProjectedOccurrencesInRange(
          makeRow({
            next_charge_date: '2026-01-31',
            frequency: 'MONTHLY',
            cancel_by_date: '2026-04-15',
          }),
          '2026-02-01',
          '2026-05-31'
        )
        .map((c) => c.next_charge_date)
    ).toEqual(['2026-02-28', '2026-03-31'])
  })
})

describe('nextChargeDateFromAnchor (#47)', () => {
  it('clamps a Jan 31 monthly anchor to end of February, not March 3', () => {
    expect(
      nextChargeDateFromAnchor('2026-01-31', 'MONTHLY', '2026-02-15')
    ).toBe('2026-02-28')
  })

  it('clamps to Feb 29 in a leap year', () => {
    expect(
      nextChargeDateFromAnchor('2024-01-31', 'MONTHLY', '2024-02-10')
    ).toBe('2024-02-29')
  })

  it('steps monthly across a year boundary', () => {
    expect(
      nextChargeDateFromAnchor('2025-12-31', 'MONTHLY', '2026-01-15')
    ).toBe('2026-01-31')
  })

  it('steps yearly with leap-day clamping', () => {
    expect(nextChargeDateFromAnchor('2024-02-29', 'YEARLY', '2024-06-01')).toBe(
      '2025-02-28'
    )
  })

  it('steps weekly and fortnightly past today', () => {
    expect(nextChargeDateFromAnchor('2026-02-02', 'WEEKLY', '2026-02-15')).toBe(
      '2026-02-16'
    )
    expect(
      nextChargeDateFromAnchor('2026-01-01', 'FORTNIGHTLY', '2026-02-01')
    ).toBe('2026-02-12')
  })

  it('keeps stepping until the occurrence is on or after today', () => {
    // Jan 31 → Feb 28 → Mar 31 → Apr 30: the anchor's day survives February (#145)
    expect(
      nextChargeDateFromAnchor('2026-01-31', 'MONTHLY', '2026-04-10')
    ).toBe('2026-04-30')
  })

  it('returns today when an occurrence falls on today, as the list does (#163)', () => {
    expect(
      nextChargeDateFromAnchor('2026-10-02', 'MONTHLY', '2026-11-02')
    ).toBe('2026-11-02')
    expect(
      nextChargeDateFromAnchor('2026-11-02', 'MONTHLY', '2026-11-02')
    ).toBe('2026-11-02')
  })

  it('returns an already-future anchor unchanged', () => {
    expect(
      nextChargeDateFromAnchor('2026-12-25', 'MONTHLY', '2026-03-10')
    ).toBe('2026-12-25')
  })

  it('normalizes a datetime anchor to its date part', () => {
    expect(
      nextChargeDateFromAnchor('2026-01-31T09:00:00Z', 'MONTHLY', '2026-02-15')
    ).toBe('2026-02-28')
  })

  it('falls back to today for ONCE and for an unrecognised frequency', () => {
    expect(nextChargeDateFromAnchor('2020-01-01', 'ONCE', '2026-03-10')).toBe(
      '2026-03-10'
    )
    expect(nextChargeDateFromAnchor('2020-01-01', 'BOGUS', '2026-03-10')).toBe(
      '2026-03-10'
    )
  })

  it('defaults the "today" argument to the local date', () => {
    expect(nextChargeDateFromAnchor('2020-01-01', 'ONCE')).toBe(
      localDateString()
    )
  })

  it('falls back to today when the anchor is too far past to resolve in 1000 steps', () => {
    // ~21 years of weekly steps exceeds the guard; return today, not a past date.
    expect(nextChargeDateFromAnchor('2005-01-01', 'WEEKLY', '2026-03-10')).toBe(
      '2026-03-10'
    )
  })
})

describe('regularById', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    for (const k of Object.keys(appSettings)) delete appSettings[k]
  })

  function insertCharge(opts: { name: string }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, created_at)
       VALUES (?, 100000, 'MONTHLY', '2026-01-15', '2026-01-01T00:00:00.000Z')`,
      [opts.name]
    )
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  it('regularById returns the row or null', () => {
    const id = insertCharge({ name: 'Spotify' })
    expect(regularById(id)?.name).toBe('Spotify')
    expect(regularById(9999)).toBeNull()
  })
})

describe('regularsByMonth — overdue ONCE charges (#18)', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    for (const k of Object.keys(appSettings)) delete appSettings[k]
  })

  function daysFromToday(delta: number): string {
    const d = new Date(localDateString() + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  function insert(opts: {
    name: string
    frequency: string
    nextChargeDate: string
    cancelByDate?: string | null
    amount?: number
  }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, created_at, cancel_by_date)
       VALUES (?, ?, ?, ?, '2020-01-01T00:00:00.000Z', ?)`,
      [
        opts.name,
        opts.amount ?? 5000,
        opts.frequency,
        opts.nextChargeDate,
        opts.cancelByDate ?? null,
      ]
    )
  }

  it('routes a past ONCE charge to `overdue`, never to thisMonth/later, and keeps it out of those totals', () => {
    insert({
      name: 'Rego',
      frequency: 'ONCE',
      nextChargeDate: daysFromToday(-9),
    })
    insert({
      name: 'Rent',
      frequency: 'MONTHLY',
      nextChargeDate: daysFromToday(3),
      amount: 200000,
    })

    const { overdue, thisMonth, later } = regularsByMonth()

    expect(overdue.map((c) => c.name)).toEqual(['Rego'])
    expect([...thisMonth, ...later].map((c) => c.name)).toEqual(['Rent'])
  })

  it('a Jan 31 monthly charge projects to Mar 31, the last day of March, and is This month (#145)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 20, 12, 0, 0)) // 20 Mar 2026, local
    try {
      insert({
        name: 'Rent',
        frequency: 'MONTHLY',
        nextChargeDate: '2026-01-31',
      })

      const { thisMonth, later } = regularsByMonth()
      expect(later).toHaveLength(0)
      expect(thisMonth.map((c) => [c.name, c.next_charge_date])).toEqual([
        ['Rent', '2026-03-31'],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('sorts overdue oldest-first', () => {
    insert({ name: 'B', frequency: 'ONCE', nextChargeDate: daysFromToday(-2) })
    insert({ name: 'A', frequency: 'ONCE', nextChargeDate: daysFromToday(-30) })
    insert({ name: 'C', frequency: 'ONCE', nextChargeDate: daysFromToday(-1) })

    expect(regularsByMonth().overdue.map((c) => c.name)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('a future ONCE charge is scheduled, not overdue', () => {
    insert({
      name: 'Insurance',
      frequency: 'ONCE',
      nextChargeDate: daysFromToday(4),
    })

    const { overdue, thisMonth, later } = regularsByMonth()
    expect(overdue).toHaveLength(0)
    expect([...thisMonth, ...later].map((c) => c.name)).toEqual(['Insurance'])
  })

  it('a recurring charge past its cancel_by_date is dropped, not shown as overdue', () => {
    insert({
      name: 'Old subscription',
      frequency: 'MONTHLY',
      nextChargeDate: daysFromToday(-90),
      cancelByDate: daysFromToday(-30),
    })

    const { overdue, thisMonth, later } = regularsByMonth()
    expect(overdue).toHaveLength(0)
    expect(thisMonth).toHaveLength(0)
    expect(later).toHaveLength(0)
  })
})

describe('editing a Regular keeps its stored date (#146)', () => {
  const shown = {
    storedDate: '2026-01-31',
    shownDate: '2026-03-31',
    shownFrequency: 'MONTHLY',
  }

  it('keeps the stored date when neither date nor frequency changed', () => {
    expect(
      nextChargeDateToStoreOnEdit({
        ...shown,
        editedDate: '2026-03-31',
        editedFrequency: 'MONTHLY',
      })
    ).toBe('2026-01-31')
  })

  it('stores the edited date when the user changed the date', () => {
    expect(
      nextChargeDateToStoreOnEdit({
        ...shown,
        editedDate: '2026-04-02',
        editedFrequency: 'MONTHLY',
      })
    ).toBe('2026-04-02')
  })

  it('stores the date in the form when the user changed only the frequency', () => {
    expect(
      nextChargeDateToStoreOnEdit({
        ...shown,
        editedDate: '2026-03-31',
        editedFrequency: 'FORTNIGHTLY',
      })
    ).toBe('2026-03-31')
  })

  it('compares dates by day, ignoring a time suffix', () => {
    expect(
      nextChargeDateToStoreOnEdit({
        ...shown,
        shownDate: '2026-03-31T00:00:00Z',
        editedDate: '2026-03-31',
        editedFrequency: 'MONTHLY',
      })
    ).toBe('2026-01-31')
  })
})

describe('creating a Regular from a payment stores the payment date (#153)', () => {
  const create = { anchorDate: '2026-01-31', today: '2026-04-15' }

  it('stores the payment date when the shown date is the one derived from it', () => {
    expect(
      nextChargeDateToStoreOnCreate({
        ...create,
        frequency: 'MONTHLY',
        shownDate: '2026-04-30',
      })
    ).toBe('2026-01-31')
  })

  it("stores the user's date when they edited the date field", () => {
    expect(
      nextChargeDateToStoreOnCreate({
        ...create,
        frequency: 'MONTHLY',
        shownDate: '2026-05-02',
      })
    ).toBe('2026-05-02')
  })

  it('stores the shown date for ONCE, so a past payment never shows as Overdue', () => {
    expect(
      nextChargeDateToStoreOnCreate({
        ...create,
        frequency: 'ONCE',
        shownDate: '2026-04-15',
      })
    ).toBe('2026-04-15')
  })

  it('stores the shown date when there is no payment to anchor to', () => {
    expect(
      nextChargeDateToStoreOnCreate({
        anchorDate: null,
        frequency: 'MONTHLY',
        shownDate: '2026-04-30',
        today: '2026-04-15',
      })
    ).toBe('2026-04-30')
  })
})
