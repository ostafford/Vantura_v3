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
  blankDraft,
  draftFromRegular,
  draftFromTransaction,
  draftFromSuggestion,
  validateRegularDraft,
  saveRegular,
  deleteRegular,
  regularById,
  regularsByMonth,
} = await import('./index')
type RegularDraft = import('./index').RegularDraft

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

function addBucket(name: string): number {
  db.run(
    `INSERT INTO budget_buckets (name, created_at) VALUES (?, '2026-01-01')`,
    [name]
  )
  return Number(db.exec(`SELECT last_insert_rowid()`)[0].values[0][0])
}

function bucketOf(id: number): unknown {
  return db.exec(`SELECT bucket_id FROM upcoming_charges WHERE id = ?`, [id])[0]
    .values[0][0]
}

/** The row the Dashboard list shows (projected), as the editor opens it. */
function shownRow(id: number) {
  const { thisMonth, later } = regularsByMonth()
  const row = [...thisMonth, ...later].find((r) => r.id === id)
  if (!row) throw new Error(`Regular ${id} not shown`)
  return row
}

function openForEdit(id: number): RegularDraft {
  return draftFromRegular(regularById(id)!, shownRow(id))
}

const rentTx = {
  description: 'Rent',
  amount: -200000,
  date: '2026-01-31',
  category_id: 'rent-and-mortgage',
}

describe('blankDraft → saveRegular', () => {
  it('stores a hand-typed Regular with the normalised optional fields', () => {
    const id = saveRegular({
      ...blankDraft(),
      name: '  Gym  ',
      amount: '12.5',
      nextChargeDate: '2026-04-20',
      reminderDaysBefore: '3',
    })
    expect(regularById(id)).toEqual({
      id,
      name: 'Gym',
      amount: 1250,
      frequency: 'MONTHLY',
      next_charge_date: '2026-04-20',
      category_id: null,
      is_reserved: 1,
      reminder_days_before: 3,
      cancel_by_date: null,
      charge_type: 'EXPENSE',
      linked_manual_account_id: null,
      match_description: null,
      bucket_id: null,
    })
  })

  it('opens on today, monthly, counted in Spendable', () => {
    expect(blankDraft()).toMatchObject({
      id: null,
      frequency: 'MONTHLY',
      nextChargeDate: '2026-04-15',
      isReserved: true,
      chargeType: 'EXPENSE',
      anchorDate: null,
    })
  })

  it('drops an unparseable reminder and a linked account on a plain expense', () => {
    const id = saveRegular({
      ...blankDraft(),
      name: 'Gym',
      amount: '10',
      reminderDaysBefore: 'soon',
      linkedManualAccountId: 7,
    })
    expect(regularById(id)).toMatchObject({
      reminder_days_before: null,
      linked_manual_account_id: null,
    })
  })

  it('keeps the linked account on a liability repayment', () => {
    const id = saveRegular({
      ...blankDraft(),
      name: 'Car loan',
      amount: '300',
      chargeType: 'LIABILITY_REPAYMENT',
      linkedManualAccountId: 7,
    })
    expect(regularById(id)).toMatchObject({
      charge_type: 'LIABILITY_REPAYMENT',
      linked_manual_account_id: 7,
    })
  })

  it('writes the bucket in the same save', () => {
    const bills = addBucket('Bills')
    const id = saveRegular({
      ...blankDraft(),
      name: 'Gym',
      amount: '10',
      bucketId: bills,
    })
    expect(bucketOf(id)).toBe(bills)
  })
})

describe('validateRegularDraft: the editor rules, unchanged (#160)', () => {
  const valid = (): RegularDraft => ({
    ...blankDraft(),
    name: 'Gym',
    amount: '10',
    nextChargeDate: '2026-04-20',
  })

  it('accepts a complete draft', () => {
    expect(validateRegularDraft(valid())).toEqual({})
  })

  it('needs a name that is not just spaces', () => {
    expect(validateRegularDraft({ ...valid(), name: '   ' })).toHaveProperty(
      'name'
    )
  })

  it('needs an amount that rounds above 0 cents', () => {
    for (const amount of ['', '0', '0.004', '-5', 'abc']) {
      expect(validateRegularDraft({ ...valid(), amount })).toHaveProperty(
        'amount'
      )
    }
    expect(validateRegularDraft({ ...valid(), amount: '0.005' })).toEqual({})
  })

  it('needs a next charge date', () => {
    expect(
      validateRegularDraft({ ...valid(), nextChargeDate: '' })
    ).toHaveProperty('nextChargeDate')
  })

  it('refuses a cancel-by date before the next charge date in the form', () => {
    expect(
      validateRegularDraft({ ...valid(), cancelByDate: '2026-04-19' })
    ).toHaveProperty('cancelByDate')
    expect(
      validateRegularDraft({ ...valid(), cancelByDate: '2026-04-20' })
    ).toEqual({})
  })

  it('checks cancel-by against the shown date when editing, not the stored one', () => {
    // Stored 31 Jan, shown 30 Apr: a 20 Apr cancel-by is before the next charge.
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    const draft = openForEdit(id)
    expect(draft.nextChargeDate).toBe('2026-04-30')
    expect(
      validateRegularDraft({ ...draft, cancelByDate: '2026-04-20' })
    ).toHaveProperty('cancelByDate')
  })

  it('saveRegular refuses an invalid draft and writes nothing', () => {
    expect(() => saveRegular({ ...valid(), name: '' })).toThrow(/invalid/i)
    expect(
      db.exec(`SELECT COUNT(*) FROM upcoming_charges`)[0].values[0][0]
    ).toBe(0)
  })
})

describe('draftFromTransaction → saveRegular (#147, #153)', () => {
  it('carries name, amount, category and the payment link from the payment', () => {
    expect(draftFromTransaction(rentTx, 'MONTHLY')).toMatchObject({
      id: null,
      name: 'Rent',
      amount: '2000.00',
      categoryId: 'rent-and-mortgage',
      matchDescription: 'Rent',
      nextChargeDate: '2026-04-30', // what the form shows
      anchorDate: '2026-01-31',
      isReserved: true,
      chargeType: 'EXPENSE',
    })
  })

  it('projects the shown date for the chosen frequency', () => {
    expect(
      draftFromTransaction(
        { ...rentTx, date: '2026-01-15' },
        'FORTNIGHTLY',
        '2026-02-01'
      ).nextChargeDate
    ).toBe('2026-02-12')
  })

  it('a payment with no category gives a Regular with no category', () => {
    const id = saveRegular(
      draftFromTransaction({ ...rentTx, category_id: null }, 'MONTHLY')
    )
    expect(regularById(id)?.category_id).toBeNull()
  })

  it('stores the payment link, so Budget Plan and Dashboard make the same Regular (#147)', () => {
    const bills = addBucket('Bills')
    const fromDashboard = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    const fromBudgetPlan = saveRegular({
      ...draftFromTransaction(rentTx, 'MONTHLY'),
      bucketId: bills,
    })
    const withoutId = (id: number) => ({
      ...regularById(id)!,
      id: 0,
      bucket_id: null,
    })
    const dashboard = withoutId(fromDashboard)
    expect(withoutId(fromBudgetPlan)).toEqual(dashboard)
    expect(dashboard.match_description).toBe('Rent')
    expect(bucketOf(fromBudgetPlan)).toBe(bills)
  })

  it('stores the payment date, so a Jan 31 monthly falls on the 31st in May (#153)', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    expect(regularById(id)?.next_charge_date).toBe('2026-01-31')
    vi.setSystemTime(new Date(2026, 4, 3, 12, 0, 0)) // 3 May
    expect(shownRow(id).next_charge_date).toBe('2026-05-31')
  })

  it("stores the user's date when they edited the shown one (#153)", () => {
    const id = saveRegular({
      ...draftFromTransaction(rentTx, 'MONTHLY'),
      nextChargeDate: '2026-05-02',
    })
    expect(regularById(id)?.next_charge_date).toBe('2026-05-02')
  })

  it('stores the shown date for ONCE, so a past payment never shows as Overdue', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'ONCE'))
    expect(regularById(id)?.next_charge_date).toBe('2026-04-15')
  })

  it('refuses a payment with a blank description: no Regular without a name', () => {
    const draft = draftFromTransaction(
      { ...rentTx, description: '' },
      'MONTHLY'
    )
    expect(validateRegularDraft(draft)).toHaveProperty('name')
    expect(() => saveRegular(draft)).toThrow()
  })
})

describe('the create form shows the date the list will show (#163)', () => {
  // Today is 15 Apr 2026 (see beforeEach).
  for (const [label, date] of [
    ['a payment made today', '2026-04-15'],
    ['a payment whose next cycle falls today', '2026-03-15'],
  ] as const) {
    it(`${label}: due today in the form and in the list`, () => {
      const draft = draftFromTransaction({ ...rentTx, date }, 'MONTHLY')
      expect(draft.nextChargeDate).toBe('2026-04-15')
      const id = saveRegular(draft)
      expect(regularById(id)?.next_charge_date).toBe(date) // anchor kept (#153)
      expect(shownRow(id).next_charge_date).toBe(draft.nextChargeDate)
    })
  }
})

describe('draftFromSuggestion → saveRegular', () => {
  const suggestion = {
    name: 'Netflix',
    amountCents: 2299,
    frequency: 'MONTHLY' as const,
    nextChargeDate: '2026-04-30',
    anchorDate: '2026-03-31',
    categoryId: 'tv-and-music',
    matchDescription: 'NETFLIX.COM',
  }

  it('stores the latest payment date as the anchor, with the payment link', () => {
    const id = saveRegular(draftFromSuggestion(suggestion))
    expect(regularById(id)).toMatchObject({
      name: 'Netflix',
      amount: 2299,
      frequency: 'MONTHLY',
      next_charge_date: '2026-03-31',
      category_id: 'tv-and-music',
      is_reserved: 1,
      charge_type: 'EXPENSE',
      match_description: 'NETFLIX.COM',
    })
  })

  it('refuses a suggestion with a blank name', () => {
    expect(
      validateRegularDraft(draftFromSuggestion({ ...suggestion, name: ' ' }))
    ).toHaveProperty('name')
  })
})

describe('draftFromRegular → saveRegular (#145/#146)', () => {
  it('opens on the shown (projected) date with the stored fields and bucket', () => {
    const bills = addBucket('Bills')
    const id = saveRegular({
      ...draftFromTransaction(rentTx, 'MONTHLY'),
      reminderDaysBefore: '2',
      bucketId: bills,
    })
    expect(openForEdit(id)).toMatchObject({
      id,
      name: 'Rent',
      amount: '2000',
      nextChargeDate: '2026-04-30',
      reminderDaysBefore: '2',
      matchDescription: 'Rent',
      bucketId: bills,
      anchorDate: null,
      shown: { nextChargeDate: '2026-04-30', frequency: 'MONTHLY' },
    })
  })

  it('renaming a projected Regular leaves its stored date alone (#145)', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    saveRegular({ ...openForEdit(id), name: 'Rent (flat)' })
    expect(regularById(id)).toMatchObject({
      name: 'Rent (flat)',
      next_charge_date: '2026-01-31',
    })
  })

  it('changing the date in the form re-anchors the Regular', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    saveRegular({ ...openForEdit(id), nextChargeDate: '2026-05-05' })
    expect(regularById(id)?.next_charge_date).toBe('2026-05-05')
  })

  it('changing the frequency re-anchors on the date in the form', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    saveRegular({ ...openForEdit(id), frequency: 'QUARTERLY' })
    expect(regularById(id)).toMatchObject({
      frequency: 'QUARTERLY',
      next_charge_date: '2026-04-30',
    })
  })

  it('moves the Regular to another bucket, or out of one, in the same save', () => {
    const bills = addBucket('Bills')
    const home = addBucket('Home')
    const id = saveRegular({
      ...draftFromTransaction(rentTx, 'MONTHLY'),
      bucketId: bills,
    })
    saveRegular({ ...openForEdit(id), bucketId: home })
    expect(bucketOf(id)).toBe(home)
    saveRegular({ ...openForEdit(id), bucketId: null })
    expect(bucketOf(id)).toBeNull()
  })

  it('clears the payment link when the user unlinks it', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    saveRegular({ ...openForEdit(id), matchDescription: '' })
    expect(regularById(id)?.match_description).toBeNull()
  })

  it('never writes the legacy match_raw_text (#116)', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    db.run(
      `UPDATE upcoming_charges SET match_raw_text = 'RENT, SYDNEY' WHERE id = ?`,
      [id]
    )
    saveRegular({ ...openForEdit(id), name: 'Rent (flat)' })
    expect(
      db.exec(`SELECT match_raw_text FROM upcoming_charges WHERE id = ?`, [
        id,
      ])[0].values[0][0]
    ).toBe('RENT, SYDNEY')
  })
})

describe('deleteRegular', () => {
  it('removes the Regular', () => {
    const id = saveRegular(draftFromTransaction(rentTx, 'MONTHLY'))
    deleteRegular(id)
    expect(regularById(id)).toBeNull()
  })
})
