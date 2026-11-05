/**
 * The Regulars module's read queries, tested through `@/services/regulars`
 * against a real sql.js DB (docs/adr/0021). Covers the rules each query owns;
 * the fixed-fixture outputs are pinned in regulars.characterisation.test.ts.
 */
import {
  describe,
  it,
  expect,
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
  regularsByMonth,
  regularOccurrencesInMonth,
  dueSoonRegulars,
  reservedBeforePayday,
  totalReserved,
} = await import('@/services/regulars')

const SAVER = 'bills-saver'

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  // Today: Sun 2025-02-23. Next payday: Fri 2025-03-07.
  vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  appSettings['next_payday'] = '2025-03-07'
  appSettings['payday_frequency'] = 'MONTHLY'
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES ('everyday', 'Everyday', 'TRANSACTIONAL', 0, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 0, '2025-01-01', '2025-01-01')`,
    [SAVER]
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function add(r: {
  name: string
  frequency: string
  date: string
  amount?: number
  is_reserved?: 0 | 1
  reminder?: number | null
  cancel_by?: string | null
  match_description?: string | null
}) {
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, is_reserved, reminder_days_before,
        cancel_by_date, match_description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2025-01-01')`,
    [
      r.name,
      r.amount ?? 1000,
      r.frequency,
      r.date,
      r.is_reserved ?? 1,
      r.reminder ?? null,
      r.cancel_by ?? null,
      r.match_description ?? null,
    ]
  )
}

/** A settled debit from the Saver, making a linked Regular Essentials-funded. */
function paidFromSaver(description: string, amount: number) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, ?, '2025-01-26T09:00:00+11:00', '2025-01-26T09:00:00+11:00')`,
    [`tx-${description}`, SAVER, description, -amount]
  )
}

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name)
const dated = (rows: Array<{ name: string; next_charge_date: string }>) =>
  rows.map((r) => `${r.next_charge_date} ${r.name}`)

describe('regularsByMonth', () => {
  it('This month runs to the last day of the calendar month; the 1st of next month is Later', () => {
    add({ name: 'Last day', frequency: 'ONCE', date: '2025-02-28' })
    add({ name: 'First of next', frequency: 'ONCE', date: '2025-03-01' })
    const g = regularsByMonth()
    expect(names(g.thisMonth)).toEqual(['Last day'])
    expect(names(g.later)).toEqual(['First of next'])
  })

  it('a Regular due today is This month', () => {
    add({ name: 'Today', frequency: 'ONCE', date: '2025-02-23' })
    expect(names(regularsByMonth().thisMonth)).toEqual(['Today'])
  })

  it('groups by the next occurrence on or after today, not the stored date', () => {
    // Stored 10 Jan, monthly: next occurrence 10 Mar (10 Feb has passed) → Later.
    add({ name: 'Gym', frequency: 'MONTHLY', date: '2025-01-10' })
    // Stored 25 Jan, monthly: next occurrence 25 Feb → This month.
    add({ name: 'Phone', frequency: 'MONTHLY', date: '2025-01-25' })
    const g = regularsByMonth()
    expect(dated(g.thisMonth)).toEqual(['2025-02-25 Phone'])
    expect(dated(g.later)).toEqual(['2025-03-10 Gym'])
  })

  it('does not read the next-payday setting', () => {
    appSettings['next_payday'] = '2025-02-25'
    add({ name: 'After payday', frequency: 'ONCE', date: '2025-02-27' })
    add({ name: 'Next month', frequency: 'ONCE', date: '2025-03-03' })
    const g = regularsByMonth()
    expect(names(g.thisMonth)).toEqual(['After payday'])
    expect(names(g.later)).toEqual(['Next month'])
    expect(g).not.toHaveProperty('nextPayday')
  })

  it('a past ONCE is Overdue, in neither This month nor Later', () => {
    add({ name: 'Rego', frequency: 'ONCE', date: '2025-02-20' })
    const g = regularsByMonth()
    expect(names(g.overdue)).toEqual(['Rego'])
    expect(g.thisMonth).toHaveLength(0)
    expect(g.later).toHaveLength(0)
  })

  it('returns projected dates, never the stored anchor', () => {
    add({ name: 'Phone', frequency: 'MONTHLY', date: '2025-01-31' })
    expect(dated(regularsByMonth().thisMonth)).toEqual(['2025-02-28 Phone'])
  })
})

describe('regularOccurrencesInMonth', () => {
  it('projects a month-end anchor to each month’s own last day (#145)', () => {
    add({ name: 'Phone', frequency: 'MONTHLY', date: '2025-01-31' })
    expect(dated(regularOccurrencesInMonth(2025, 2))).toEqual([
      '2025-02-28 Phone',
    ])
    expect(dated(regularOccurrencesInMonth(2025, 3))).toEqual([
      '2025-03-31 Phone',
    ])
    expect(dated(regularOccurrencesInMonth(2025, 4))).toEqual([
      '2025-04-30 Phone',
    ])
  })

  it('lists every weekly occurrence in the month', () => {
    add({ name: 'Gym', frequency: 'WEEKLY', date: '2025-01-06' })
    expect(dated(regularOccurrencesInMonth(2025, 3))).toEqual([
      '2025-03-03 Gym',
      '2025-03-10 Gym',
      '2025-03-17 Gym',
      '2025-03-24 Gym',
      '2025-03-31 Gym',
    ])
  })

  it('keeps an occurrence on the cancel-by date and stops after it', () => {
    add({
      name: 'Trial',
      frequency: 'MONTHLY',
      date: '2025-01-10',
      cancel_by: '2025-03-10',
    })
    expect(dated(regularOccurrencesInMonth(2025, 3))).toEqual([
      '2025-03-10 Trial',
    ])
    expect(regularOccurrencesInMonth(2025, 4)).toEqual([])
  })

  it('shows a ONCE Regular only in its own month, past months included', () => {
    add({ name: 'Concert', frequency: 'ONCE', date: '2025-02-10' })
    expect(dated(regularOccurrencesInMonth(2025, 2))).toEqual([
      '2025-02-10 Concert',
    ])
    expect(regularOccurrencesInMonth(2025, 3)).toEqual([])
  })

  it('orders same-day occurrences by id', () => {
    add({
      name: 'Second-stored-date',
      frequency: 'MONTHLY',
      date: '2025-01-28',
    })
    add({ name: 'First-stored-date', frequency: 'MONTHLY', date: '2024-12-28' })
    expect(names(regularOccurrencesInMonth(2025, 3))).toEqual([
      'Second-stored-date',
      'First-stored-date',
    ])
  })
})

describe('dueSoonRegulars', () => {
  it('includes a Regular exactly at its reminder window, not one day beyond', () => {
    add({
      name: 'At window',
      frequency: 'ONCE',
      date: '2025-02-26',
      reminder: 3,
    })
    add({
      name: 'Past window',
      frequency: 'ONCE',
      date: '2025-02-27',
      reminder: 3,
    })
    expect(names(dueSoonRegulars())).toEqual(['At window'])
  })

  it('includes a Regular due today', () => {
    add({ name: 'Today', frequency: 'ONCE', date: '2025-02-23', reminder: 0 })
    expect(names(dueSoonRegulars())).toEqual(['Today'])
  })

  it('leaves out Regulars with no reminder and overdue ONCEs', () => {
    add({ name: 'No reminder', frequency: 'ONCE', date: '2025-02-24' })
    add({ name: 'Overdue', frequency: 'ONCE', date: '2025-02-20', reminder: 5 })
    expect(dueSoonRegulars()).toEqual([])
  })

  it('returns projected dates, soonest first', () => {
    add({
      name: 'Rent',
      frequency: 'FORTNIGHTLY',
      date: '2025-01-17',
      reminder: 7,
    })
    add({
      name: 'Netflix',
      frequency: 'MONTHLY',
      date: '2024-11-25',
      reminder: 5,
    })
    expect(dated(dueSoonRegulars())).toEqual([
      '2025-02-25 Netflix',
      '2025-02-28 Rent',
    ])
  })
})

describe('reservedBeforePayday', () => {
  it('reserves a Regular due the day before payday, not one due on payday', () => {
    add({ name: 'Day before', frequency: 'ONCE', date: '2025-03-06' })
    add({ name: 'On payday', frequency: 'ONCE', date: '2025-03-07' })
    expect(
      names(reservedBeforePayday({ excludeEssentialsFunded: true }))
    ).toEqual(['Day before'])
  })

  it('counts each weekly occurrence before payday; totalReserved sums them', () => {
    add({ name: 'Gym', frequency: 'WEEKLY', date: '2025-01-06', amount: 1500 })
    const items = reservedBeforePayday({ excludeEssentialsFunded: true })
    expect(
      items.map((i) => [i.name, i.occurrenceCount, i.reservedAmount])
    ).toEqual([['Gym', 2, 3000]])
    expect(totalReserved(items)).toBe(3000)
  })

  it('leaves out Regulars that are not reserved', () => {
    add({
      name: 'Not reserved',
      frequency: 'ONCE',
      date: '2025-02-25',
      is_reserved: 0,
    })
    expect(reservedBeforePayday({ excludeEssentialsFunded: false })).toEqual([])
  })

  it('is empty with no payday or no pay frequency configured', () => {
    add({ name: 'Netflix', frequency: 'ONCE', date: '2025-02-25' })
    delete appSettings['payday_frequency']
    expect(reservedBeforePayday({ excludeEssentialsFunded: false })).toEqual([])
    appSettings['payday_frequency'] = 'MONTHLY'
    delete appSettings['next_payday']
    expect(reservedBeforePayday({ excludeEssentialsFunded: false })).toEqual([])
  })

  it('carries the stored Regular alongside the projected date', () => {
    add({ name: 'Phone', frequency: 'MONTHLY', date: '2025-01-31' })
    const [item] = reservedBeforePayday({ excludeEssentialsFunded: true })
    expect(item.projectedDate).toBe('2025-02-28')
    expect(item.regular.next_charge_date).toBe('2025-01-31')
  })

  describe('Essentials-funded Regulars (docs/adr/0019)', () => {
    beforeEach(() => {
      add({
        name: 'Power',
        frequency: 'MONTHLY',
        date: '2025-01-26',
        amount: 18000,
        match_description: 'POWERCO',
      })
      add({ name: 'Netflix', frequency: 'ONCE', date: '2025-02-25' })
      paidFromSaver('POWERCO', 18000)
    })

    it('are excluded for an Essentials user when asked, included otherwise', () => {
      appSettings['essentials_saver_account_id'] = SAVER
      expect(
        names(reservedBeforePayday({ excludeEssentialsFunded: true }))
      ).toEqual(['Netflix'])
      expect(
        names(reservedBeforePayday({ excludeEssentialsFunded: false }))
      ).toEqual(['Power', 'Netflix'])
    })

    it('are never excluded for a classic user (no Saver nominated)', () => {
      expect(
        names(reservedBeforePayday({ excludeEssentialsFunded: true }))
      ).toEqual(['Power', 'Netflix'])
    })
  })
})
