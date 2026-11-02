import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  __test__,
  nextChargeDateFromAnchor,
  regularDraftFromTransaction,
  nextChargeDateToStoreOnCreate,
  type UpcomingChargeRow,
} from './index'

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

const {
  getUpcomingChargeById,
  getLinkedLiabilityRepaymentCharges,
  getUpcomingChargesGrouped,
  createUpcomingCharge,
  updateUpcomingCharge,
  nextChargeDateToStoreOnEdit,
} = await import('./index')
const { localDateString } = await import('@/lib/format')

function makeRow(
  overrides: Partial<UpcomingChargeRow> = {}
): UpcomingChargeRow {
  return {
    id: 1,
    name: 'Test charge',
    amount: 1000,
    frequency: 'MONTHLY',
    next_charge_date: '2026-01-15',
    category_id: null,
    is_reserved: 1,
    reminder_days_before: null,
    cancel_by_date: null,
    charge_type: 'EXPENSE',
    linked_manual_account_id: null,
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

  it('keeps steps until the occurrence is strictly past today', () => {
    // Jan 31 → Feb 28 → Mar 31 → Apr 30: the anchor's day survives February (#145)
    expect(
      nextChargeDateFromAnchor('2026-01-31', 'MONTHLY', '2026-04-10')
    ).toBe('2026-04-30')
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

describe('getUpcomingChargeById / getLinkedLiabilityRepaymentCharges', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
    for (const k of Object.keys(appSettings)) delete appSettings[k]
  })

  function insertCharge(opts: {
    name: string
    chargeType?: 'EXPENSE' | 'LIABILITY_REPAYMENT'
    linkedAccountId?: number | null
    matchDescription?: string | null
  }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, is_reserved, created_at,
          charge_type, linked_manual_account_id, match_description)
       VALUES (?, 100000, 'MONTHLY', '2026-01-15', 1, '2026-01-01T00:00:00.000Z', ?, ?, ?)`,
      [
        opts.name,
        opts.chargeType ?? 'EXPENSE',
        opts.linkedAccountId ?? null,
        opts.matchDescription ?? null,
      ]
    )
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  it('getUpcomingChargeById returns the row or null', () => {
    const id = insertCharge({ name: 'Spotify' })
    expect(getUpcomingChargeById(id)?.name).toBe('Spotify')
    expect(getUpcomingChargeById(9999)).toBeNull()
  })

  it('getLinkedLiabilityRepaymentCharges returns only fully-linked LIABILITY_REPAYMENT rows', () => {
    insertCharge({ name: 'Groceries' }) // EXPENSE
    insertCharge({
      name: 'Mortgage (no fingerprint)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: 3,
      matchDescription: null,
    })
    insertCharge({
      name: 'Mortgage (no account)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: null,
      matchDescription: 'RAW',
    })
    const fullId = insertCharge({
      name: 'Mortgage (linked)',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedAccountId: 3,
      matchDescription: 'MORTGAGE-RAW',
    })

    const linked = getLinkedLiabilityRepaymentCharges()
    expect(linked.map((c) => c.id)).toEqual([fullId])
  })
})

describe('createUpcomingCharge / updateUpcomingCharge store the payment link (docs/adr/0020)', () => {
  beforeAll(async () => {
    SQL = await initSqlJs()
  })

  beforeEach(async () => {
    const { runSchema } = await import('@/db/schema')
    db = new SQL.Database()
    runSchema(db)
  })

  function legacyRawText(id: number): unknown {
    return db.exec(`SELECT match_raw_text FROM upcoming_charges WHERE id = ?`, [
      id,
    ])[0].values[0][0]
  }

  it('stores the linked description and never writes the legacy raw_text (#116)', () => {
    // prettier-ignore
    const id = createUpcomingCharge('Oura', 1000, 'MONTHLY', '2026-03-23', null, true, null, null, 'EXPENSE', null, 'Oura')
    expect(getUpcomingChargeById(id)?.match_description).toBe('Oura')
    expect(legacyRawText(id)).toBeNull()

    // A legacy value from before v47 is left as it was, not rewritten.
    db.run(
      `UPDATE upcoming_charges SET match_raw_text = 'OURARING, OULU' WHERE id = ?`,
      [id]
    )
    // prettier-ignore
    updateUpcomingCharge(id, 'Oura', 1000, 'MONTHLY', '2026-03-23', null, true, null, null, 'EXPENSE', null, null)
    expect(getUpcomingChargeById(id)?.match_description).toBeNull()
    expect(legacyRawText(id)).toBe('OURARING, OULU')
  })
})

describe('getUpcomingChargesGrouped — overdue ONCE charges (#18)', () => {
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
         (name, amount, frequency, next_charge_date, is_reserved, created_at, cancel_by_date, charge_type)
       VALUES (?, ?, ?, ?, 1, '2020-01-01T00:00:00.000Z', ?, 'EXPENSE')`,
      [
        opts.name,
        opts.amount ?? 5000,
        opts.frequency,
        opts.nextChargeDate,
        opts.cancelByDate ?? null,
      ]
    )
  }

  it('routes a past ONCE charge to `overdue`, never to nextPay/later, and keeps it out of those totals', () => {
    appSettings['next_payday'] = daysFromToday(10)
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

    const { overdue, nextPay, later } = getUpcomingChargesGrouped()

    expect(overdue.map((c) => c.name)).toEqual(['Rego'])
    expect([...nextPay, ...later].map((c) => c.name)).toEqual(['Rent'])
  })

  it('a Jan 31 monthly charge due Mar 31 is Later when payday is Mar 30, not pulled into Next pay (#145)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 20, 12, 0, 0)) // 20 Mar 2026, local
    try {
      appSettings['next_payday'] = '2026-03-30'
      insert({
        name: 'Rent',
        frequency: 'MONTHLY',
        nextChargeDate: '2026-01-31',
      })

      const { nextPay, later } = getUpcomingChargesGrouped()
      expect(nextPay).toHaveLength(0)
      expect(later.map((c) => [c.name, c.next_charge_date])).toEqual([
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

    expect(getUpcomingChargesGrouped().overdue.map((c) => c.name)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('a future ONCE charge is scheduled, not overdue', () => {
    appSettings['next_payday'] = daysFromToday(10)
    insert({
      name: 'Insurance',
      frequency: 'ONCE',
      nextChargeDate: daysFromToday(4),
    })

    const { overdue, nextPay } = getUpcomingChargesGrouped()
    expect(overdue).toHaveLength(0)
    expect(nextPay.map((c) => c.name)).toEqual(['Insurance'])
  })

  it('a recurring charge past its cancel_by_date is dropped, not shown as overdue', () => {
    insert({
      name: 'Old subscription',
      frequency: 'MONTHLY',
      nextChargeDate: daysFromToday(-90),
      cancelByDate: daysFromToday(-30),
    })

    const { overdue, nextPay, later } = getUpcomingChargesGrouped()
    expect(overdue).toHaveLength(0)
    expect(nextPay).toHaveLength(0)
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

  describe("through the editor's save sequence", () => {
    beforeAll(async () => {
      SQL = await initSqlJs()
    })

    beforeEach(async () => {
      const { runSchema } = await import('@/db/schema')
      db = new SQL.Database()
      runSchema(db)
      for (const k of Object.keys(appSettings)) delete appSettings[k]
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 2, 20, 12, 0, 0)) // 20 Mar 2026, local
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** What UpcomingSection's handleSave does for an edit, minus the React. */
    function saveEdit(
      shownRow: UpcomingChargeRow,
      form: { name: string; date: string; frequency: string }
    ) {
      const storedDate =
        getUpcomingChargeById(shownRow.id)?.next_charge_date ?? form.date
      // prettier-ignore
      updateUpcomingCharge(shownRow.id, form.name, shownRow.amount, form.frequency,
        nextChargeDateToStoreOnEdit({
          storedDate,
          shownDate: shownRow.next_charge_date,
          shownFrequency: shownRow.frequency,
          editedDate: form.date,
          editedFrequency: form.frequency,
        }),
        null, true, null, null, 'EXPENSE', null, null)
    }

    it('renaming a projected Regular leaves its stored date alone', () => {
      // prettier-ignore
      const id = createUpcomingCharge('Rent', 200000, 'MONTHLY', '2025-12-31', null, true)
      const [row] = getUpcomingChargesGrouped().later.concat(
        getUpcomingChargesGrouped().nextPay
      )
      expect(row.next_charge_date).not.toBe('2025-12-31') // shown = projected

      saveEdit(row, {
        name: 'Rent (flat)',
        date: row.next_charge_date,
        frequency: row.frequency,
      })

      const stored = getUpcomingChargeById(id)
      expect(stored?.name).toBe('Rent (flat)')
      expect(stored?.next_charge_date).toBe('2025-12-31')
    })

    it('changing the date in the form re-anchors the Regular', () => {
      // prettier-ignore
      const id = createUpcomingCharge('Rent', 200000, 'MONTHLY', '2025-12-31', null, true)
      const [row] = getUpcomingChargesGrouped().later.concat(
        getUpcomingChargesGrouped().nextPay
      )

      saveEdit(row, {
        name: row.name,
        date: '2026-04-05',
        frequency: row.frequency,
      })

      expect(getUpcomingChargeById(id)?.next_charge_date).toBe('2026-04-05')
    })
  })
})

describe('regularDraftFromTransaction: one Regular per picked transaction (#147)', () => {
  const tx = {
    description: 'Netflix',
    amount: 2299,
    date: '2026-01-15',
    category_id: 'tv-and-music',
  }

  it('carries name, amount, category and the payment link from the transaction', () => {
    expect(regularDraftFromTransaction(tx, 'MONTHLY', '2026-03-20')).toEqual({
      name: 'Netflix',
      amountCents: 2299,
      categoryId: 'tv-and-music',
      matchDescription: 'Netflix',
      nextChargeDate: '2026-04-15',
      anchorDate: '2026-01-15',
    })
  })

  it('projects the date for the chosen frequency', () => {
    expect(
      regularDraftFromTransaction(tx, 'FORTNIGHTLY', '2026-02-01')
        .nextChargeDate
    ).toBe('2026-02-12')
  })

  it('a transaction with no category gives a Regular with no category', () => {
    expect(
      regularDraftFromTransaction(
        { ...tx, category_id: null },
        'MONTHLY',
        '2026-03-20'
      ).categoryId
    ).toBeNull()
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

  describe('through create + projection', () => {
    beforeAll(async () => {
      SQL = await initSqlJs()
    })

    beforeEach(async () => {
      const { runSchema } = await import('@/db/schema')
      db = new SQL.Database()
      runSchema(db)
      for (const k of Object.keys(appSettings)) delete appSettings[k]
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0)) // 15 Apr 2026, local
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('a monthly Regular made in April from a Jan 31 payment falls on the 31st in May', () => {
      const tx = {
        description: 'Rent',
        amount: 200000,
        date: '2026-01-31',
        category_id: null,
      }
      const draft = regularDraftFromTransaction(tx, 'MONTHLY')
      expect(draft.nextChargeDate).toBe('2026-04-30') // what the form shows
      // prettier-ignore
      const id = createUpcomingCharge(draft.name, draft.amountCents, 'MONTHLY',
        nextChargeDateToStoreOnCreate({
          anchorDate: draft.anchorDate,
          frequency: 'MONTHLY',
          shownDate: draft.nextChargeDate,
        }),
        null, true, null, null, 'EXPENSE', null, draft.matchDescription)

      expect(getUpcomingChargeById(id)?.next_charge_date).toBe('2026-01-31')
      vi.setSystemTime(new Date(2026, 4, 3, 12, 0, 0)) // 3 May
      const [row] = getUpcomingChargesGrouped().later.concat(
        getUpcomingChargesGrouped().nextPay
      )
      expect(row.next_charge_date).toBe('2026-05-31')
    })
  })
})
