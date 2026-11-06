/**
 * Characterisation test for #159 (ADR-0021): records what every reader of
 * `upcoming_charges` returns today, against one fixed set of Regulars, before
 * those readers are folded into the Regulars module.
 *
 * The recorded outputs (the inline snapshots) must not change while #159 lands.
 * Only the calls may change, as the readers are renamed or moved. A snapshot diff
 * here is a behaviour change: stop and decide it explicitly, never `-u` it away.
 *
 * #209 cut Net Worth: its projection and the liability-repayment set are no
 * longer read, and `charge_type` / `linked_manual_account_id` are gone. The
 * two former liability repayments stay seeded as ordinary Regulars; the one
 * with a reminder now shows in due-soon (decided in #209).
 *
 * #211 cut Spendable: Reserved and Essentials coverage are no longer read,
 * and `is_reserved` is gone. The Regular that had it off stays seeded as an
 * ordinary Regular; the other readers' outputs are otherwise unchanged.
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
  regularById,
} = await import('./regulars')

const TRANSACTIONAL = 'transactional-1'
const BILLS_SAVER = 'bills-saver-1'

interface Seed {
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  reminder_days_before?: number | null
  cancel_by_date?: string | null
  match_description?: string | null
  category_id?: string | null
  bucket_id?: number | null
}

/**
 * Today is Sun 2025-02-23 (local = UTC under fake timers); pay is monthly.
 * Each Regular exists to pin one case.
 */
const SEEDS: Seed[] = [
  // MONTHLY, due in 2 days, within its 5-day reminder, linked to transactional payments.
  {
    name: 'Netflix',
    amount: 1599,
    frequency: 'MONTHLY',
    next_charge_date: '2024-11-25',
    reminder_days_before: 5,
    match_description: 'NETFLIX.COM',
    category_id: 'tv-and-music',
  },
  // WEEKLY: two occurrences before payday (02-24, 03-03).
  {
    name: 'Gym',
    amount: 1500,
    frequency: 'WEEKLY',
    next_charge_date: '2025-01-06',
  },
  // FORTNIGHTLY: 02-28 before payday, 03-14 after.
  {
    name: 'Rent',
    amount: 80000,
    frequency: 'FORTNIGHTLY',
    next_charge_date: '2025-01-17',
    reminder_days_before: 7,
  },
  // QUARTERLY: next 2025-04-02 → Later.
  {
    name: 'Water',
    amount: 21000,
    frequency: 'QUARTERLY',
    next_charge_date: '2024-10-02',
    reminder_days_before: 3,
  },
  // YEARLY: next 2025-03-15 → Later, in the March month view.
  {
    name: 'Domain',
    amount: 2500,
    frequency: 'YEARLY',
    next_charge_date: '2024-03-15',
  },
  // Month-end MONTHLY anchor: 02-28, then 03-31 (the anchor's day survives, #145).
  {
    name: 'Phone',
    amount: 4500,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-31',
    reminder_days_before: 10,
  },
  // Overdue ONCE: past date, no future occurrence (#18).
  {
    name: 'Concert',
    amount: 12000,
    frequency: 'ONCE',
    next_charge_date: '2025-02-10',
    reminder_days_before: 2,
  },
  // Future ONCE, after payday → Later.
  {
    name: 'Car rego',
    amount: 85000,
    frequency: 'ONCE',
    next_charge_date: '2025-03-20',
  },
  // Cancel-by before the next occurrence (03-05): cycle exhausted, dropped.
  {
    name: 'Trial',
    amount: 999,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-05',
    cancel_by_date: '2025-03-01',
    reminder_days_before: 30,
  },
  // Cancel-by after a couple of occurrences: 03-10 and 04-10 project, 05-10 doesn't.
  {
    name: 'Streaming',
    amount: 1299,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-10',
    cancel_by_date: '2025-04-15',
  },
  // Linked to a payment from a Saver.
  {
    name: 'Electricity',
    amount: 18000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-26',
    reminder_days_before: 5,
    match_description: 'POWERCO',
  },
  // A former liability repayment (#209), linked to its payments.
  {
    name: 'Car loan',
    amount: 45000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-28',
    reminder_days_before: 5,
    match_description: 'LOANCO',
  },
  // A former liability repayment (#209) with no payment link and no reminder.
  {
    name: 'Card repayment',
    amount: 20000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-27',
  },
  // In a bucket, with a 1-day reminder (it had is_reserved off before #211).
  {
    name: 'Spotify',
    amount: 1299,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-24',
    reminder_days_before: 1,
    bucket_id: 1,
  },
]

function seedRegular(s: Seed) {
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, category_id,
        reminder_days_before, cancel_by_date, created_at, bucket_id,
        match_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2025-01-01', ?, ?)`,
    [
      s.name,
      s.amount,
      s.frequency,
      s.next_charge_date,
      s.category_id ?? null,
      s.reminder_days_before ?? null,
      s.cancel_by_date ?? null,
      s.bucket_id ?? null,
      s.match_description ?? null,
    ]
  )
}

function settleDebit(
  accountId: string,
  description: string,
  settledAt: string,
  amountCents: number
) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, ?, ?, ?)`,
    [
      `tx-${description}-${settledAt}`,
      accountId,
      description,
      -amountCents,
      settledAt,
      settledAt,
    ]
  )
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))

  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]

  appSettings['payday_frequency'] = 'MONTHLY'

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES (?, 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 200000, '2025-01-01', '2025-01-01')`,
    [TRANSACTIONAL, BILLS_SAVER]
  )

  for (const s of SEEDS) seedRegular(s)

  settleDebit(TRANSACTIONAL, 'NETFLIX.COM', '2025-01-25T09:00:00+11:00', 1599)
  settleDebit(BILLS_SAVER, 'POWERCO', '2025-01-26T09:00:00+11:00', 18000)
  settleDebit(TRANSACTIONAL, 'LOANCO', '2025-01-28T09:00:00+11:00', 45000)
})

afterEach(() => {
  vi.useRealTimers()
})

/** Compact one-line-per-Regular view, so the snapshots stay reviewable. */
function brief(rows: Array<{ name: string; next_charge_date: string }>) {
  return rows.map((r) => `${r.next_charge_date} ${r.name}`)
}

describe('Regulars readers — characterisation (#159)', () => {
  it('Overdue / This month / Later grouping', () => {
    const g = regularsByMonth()
    expect({
      overdue: brief(g.overdue),
      thisMonth: brief(g.thisMonth),
      later: brief(g.later),
    }).toMatchInlineSnapshot(`
      {
        "later": [
          "2025-03-15 Domain",
          "2025-03-20 Car rego",
          "2025-04-02 Water",
        ],
        "overdue": [
          "2025-02-03 Gym",
          "2025-02-05 Trial",
          "2025-02-10 Streaming",
          "2025-02-10 Concert",
          "2025-02-14 Rent",
        ],
        "thisMonth": [
          "2025-02-24 Spotify",
          "2025-02-25 Netflix",
          "2025-02-26 Electricity",
          "2025-02-27 Card repayment",
          "2025-02-28 Car loan",
          "2025-02-28 Phone",
        ],
      }
    `)
  })

  it('grouping returns full rows (projected date, all fields)', () => {
    expect(regularsByMonth().thisMonth).toMatchInlineSnapshot(`
      [
        {
          "amount": 1299,
          "bucket_id": 1,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 14,
          "match_description": null,
          "name": "Spotify",
          "next_charge_date": "2025-02-24",
          "reminder_days_before": 1,
        },
        {
          "amount": 1599,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": "tv-and-music",
          "frequency": "MONTHLY",
          "id": 1,
          "match_description": "NETFLIX.COM",
          "name": "Netflix",
          "next_charge_date": "2025-02-25",
          "reminder_days_before": 5,
        },
        {
          "amount": 18000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 11,
          "match_description": "POWERCO",
          "name": "Electricity",
          "next_charge_date": "2025-02-26",
          "reminder_days_before": 5,
        },
        {
          "amount": 20000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 13,
          "match_description": null,
          "name": "Card repayment",
          "next_charge_date": "2025-02-27",
          "reminder_days_before": null,
        },
        {
          "amount": 45000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 12,
          "match_description": "LOANCO",
          "name": "Car loan",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 5,
        },
        {
          "amount": 4500,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 6,
          "match_description": null,
          "name": "Phone",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 10,
        },
      ]
    `)
  })

  it('calendar month view — February, March, April, May 2025', () => {
    expect({
      feb: brief(regularOccurrencesInMonth(2025, 2)),
      mar: brief(regularOccurrencesInMonth(2025, 3)),
      apr: brief(regularOccurrencesInMonth(2025, 4)),
      may: brief(regularOccurrencesInMonth(2025, 5)),
    }).toMatchInlineSnapshot(`
      {
        "apr": [
          "2025-04-02 Water",
          "2025-04-07 Gym",
          "2025-04-10 Streaming",
          "2025-04-11 Rent",
          "2025-04-14 Gym",
          "2025-04-21 Gym",
          "2025-04-24 Spotify",
          "2025-04-25 Netflix",
          "2025-04-25 Rent",
          "2025-04-26 Electricity",
          "2025-04-27 Card repayment",
          "2025-04-28 Gym",
          "2025-04-28 Car loan",
          "2025-04-30 Phone",
        ],
        "feb": [
          "2025-02-03 Gym",
          "2025-02-05 Trial",
          "2025-02-10 Gym",
          "2025-02-10 Concert",
          "2025-02-10 Streaming",
          "2025-02-14 Rent",
          "2025-02-17 Gym",
          "2025-02-24 Gym",
          "2025-02-24 Spotify",
          "2025-02-25 Netflix",
          "2025-02-26 Electricity",
          "2025-02-27 Card repayment",
          "2025-02-28 Rent",
          "2025-02-28 Phone",
          "2025-02-28 Car loan",
        ],
        "mar": [
          "2025-03-03 Gym",
          "2025-03-10 Gym",
          "2025-03-10 Streaming",
          "2025-03-14 Rent",
          "2025-03-15 Domain",
          "2025-03-17 Gym",
          "2025-03-20 Car rego",
          "2025-03-24 Gym",
          "2025-03-24 Spotify",
          "2025-03-25 Netflix",
          "2025-03-26 Electricity",
          "2025-03-27 Card repayment",
          "2025-03-28 Rent",
          "2025-03-28 Car loan",
          "2025-03-31 Gym",
          "2025-03-31 Phone",
        ],
        "may": [
          "2025-05-05 Gym",
          "2025-05-09 Rent",
          "2025-05-12 Gym",
          "2025-05-19 Gym",
          "2025-05-23 Rent",
          "2025-05-24 Spotify",
          "2025-05-25 Netflix",
          "2025-05-26 Gym",
          "2025-05-26 Electricity",
          "2025-05-27 Card repayment",
          "2025-05-28 Car loan",
          "2025-05-31 Phone",
        ],
      }
    `)
  })

  it('due-soon Regulars', () => {
    expect(dueSoonRegulars()).toMatchInlineSnapshot(`
      [
        {
          "amount": 1299,
          "bucket_id": 1,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 14,
          "match_description": null,
          "name": "Spotify",
          "next_charge_date": "2025-02-24",
          "reminder_days_before": 1,
        },
        {
          "amount": 1599,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": "tv-and-music",
          "frequency": "MONTHLY",
          "id": 1,
          "match_description": "NETFLIX.COM",
          "name": "Netflix",
          "next_charge_date": "2025-02-25",
          "reminder_days_before": 5,
        },
        {
          "amount": 18000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 11,
          "match_description": "POWERCO",
          "name": "Electricity",
          "next_charge_date": "2025-02-26",
          "reminder_days_before": 5,
        },
        {
          "amount": 80000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "FORTNIGHTLY",
          "id": 3,
          "match_description": null,
          "name": "Rent",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 7,
        },
        {
          "amount": 45000,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 12,
          "match_description": "LOANCO",
          "name": "Car loan",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 5,
        },
        {
          "amount": 4500,
          "bucket_id": null,
          "cancel_by_date": null,
          "category_id": null,
          "frequency": "MONTHLY",
          "id": 6,
          "match_description": null,
          "name": "Phone",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 10,
        },
      ]
    `)
  })

  it('by id returns the stored, unprojected date', () => {
    const phone = regularsByMonth().thisMonth.find((r) => r.name === 'Phone')!
    expect(regularById(phone.id)).toMatchInlineSnapshot(`
      {
        "amount": 4500,
        "bucket_id": null,
        "cancel_by_date": null,
        "category_id": null,
        "frequency": "MONTHLY",
        "id": 6,
        "match_description": null,
        "name": "Phone",
        "next_charge_date": "2025-01-31",
        "reminder_days_before": 10,
      }
    `)
    expect(regularById(9999)).toMatchInlineSnapshot(`null`)
  })
})
