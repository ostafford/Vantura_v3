/**
 * Demo mode: seed the database with realistic sample data so the app can be
 * trialled without an Up Bank API token. Used by onboarding "Try with sample data".
 */

import { getDb, setAppSetting, schedulePersist } from '@/db'

const DEMO_ACCOUNT_ID = 'demo-account-main'
const DEMO_SAVER_ID = 'demo-saver-1'
const DEMO_SAVER_2_ID = 'demo-saver-2'
const NOW = new Date().toISOString()

/** Timezone-safe YYYY-MM-DD for the 1st of the current month (UTC). */
function firstOfCurrentMonthUTC(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  return `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Timezone-safe YYYY-MM-DD for the 1st of the next month (UTC). */
function firstOfNextMonthUTC(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const next = new Date(Date.UTC(y, m + 1, 1))
  return next.toISOString().slice(0, 10)
}

/** Deterministic pseudo-random for reproducible demo data (seeded by index). */
function seededAmount(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9999) * 10000
  const t = x - Math.floor(x)
  return Math.floor(min + t * (max - min + 1))
}

/** Last reset date for WEEKLY tracker (reset_day 1 = Monday). */
function weeklyLastReset(resetDay: number, fromDate: string): string {
  const from = new Date(fromDate + 'T12:00:00Z')
  const targetUTCDay = resetDay === 7 ? 0 : resetDay
  const currentUTCDay = from.getUTCDay()
  const daysBack = (currentUTCDay - targetUTCDay + 7) % 7
  const last = new Date(from)
  last.setUTCDate(last.getUTCDate() - daysBack)
  return last.toISOString().slice(0, 10)
}

/** Next reset date for WEEKLY tracker. */
function weeklyNextReset(_resetDay: number, lastReset: string): string {
  const from = new Date(lastReset + 'T12:00:00Z')
  const next = new Date(from)
  next.setUTCDate(next.getUTCDate() + 7)
  return next.toISOString().slice(0, 10)
}

/** Last reset for FORTNIGHTLY (reset_day 1 = Monday, 14-day periods). */
function fortnightlyLastReset(resetDay: number, fromDate: string): string {
  const from = new Date(fromDate + 'T12:00:00Z')
  const targetUTCDay = resetDay === 7 ? 0 : resetDay
  const currentUTCDay = from.getUTCDay()
  const daysBack = (currentUTCDay - targetUTCDay + 7) % 7
  const lastWeekday = new Date(from)
  lastWeekday.setUTCDate(lastWeekday.getUTCDate() - daysBack)
  const candidate = lastWeekday.toISOString().slice(0, 10)
  const daysSince =
    (new Date(fromDate + 'T12:00:00Z').getTime() -
      new Date(candidate + 'T12:00:00Z').getTime()) /
    (24 * 60 * 60 * 1000)
  const periodsSince = Math.floor(daysSince / 14)
  const last = new Date(candidate + 'T12:00:00Z')
  last.setUTCDate(last.getUTCDate() + 14 * periodsSince)
  return last.toISOString().slice(0, 10)
}

/** Next reset for FORTNIGHTLY. */
function fortnightlyNextReset(lastReset: string): string {
  const from = new Date(lastReset + 'T12:00:00Z')
  const next = new Date(from)
  next.setUTCDate(next.getUTCDate() + 14)
  return next.toISOString().slice(0, 10)
}

function run(sql: string, params: (string | number | null)[] = []): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(sql, params)
  schedulePersist()
}

function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysAheadStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function seedDemoData(): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  const nextPay = new Date()
  nextPay.setDate(nextPay.getDate() + 14)
  const nextPayday = nextPay.toISOString().slice(0, 10)

  setAppSetting('payday_frequency', 'MONTHLY')
  setAppSetting('payday_day', '15')
  setAppSetting('next_payday', nextPayday)
  setAppSetting('pay_amount_cents', '450000')
  setAppSetting('spendable_alert_below_cents', '50000')
  setAppSetting('last_sync', NOW)
  setAppSetting('onboarding_complete', '1')
  setAppSetting('demo_mode', '1')
  setAppSetting(
    'categorization_rules',
    JSON.stringify([
      { id: 'rule-1', pattern: 'woolworths', categoryId: 'demo-cat-groceries' },
      { id: 'rule-2', pattern: 'uber eats', categoryId: 'demo-cat-dining' },
      { id: 'rule-3', pattern: 'netflix', categoryId: 'demo-cat-subs' },
    ])
  )

  // Accounts: one transactional, two savers
  run(
    `INSERT OR REPLACE INTO accounts (id, display_name, account_type, balance, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEMO_ACCOUNT_ID, 'Everyday', 'TRANSACTIONAL', 452300, NOW, NOW, NOW]
  )
  run(
    `INSERT OR REPLACE INTO accounts (id, display_name, account_type, balance, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEMO_SAVER_ID, 'Rainy Day', 'SAVER', 125000, NOW, NOW, NOW]
  )
  run(
    `INSERT OR REPLACE INTO accounts (id, display_name, account_type, balance, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEMO_SAVER_2_ID, 'Holiday Fund', 'SAVER', 200000, NOW, NOW, NOW]
  )

  // Categories: parent + children (expanded)
  const catGroceries = 'demo-cat-groceries'
  const catDining = 'demo-cat-dining'
  const catTransport = 'demo-cat-transport'
  const catSubscriptions = 'demo-cat-subs'
  const catShopping = 'demo-cat-shopping'
  const catParentSpending = 'demo-cat-spending'
  const catCoffee = 'demo-cat-coffee'
  const catEntertainment = 'demo-cat-entertainment'
  const catHealth = 'demo-cat-health'
  const catUtilities = 'demo-cat-utilities'

  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catParentSpending, 'Spending', null]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catGroceries, 'Groceries', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catDining, 'Dining Out', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catTransport, 'Transport', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catSubscriptions, 'Subscriptions', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catShopping, 'Shopping', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catCoffee, 'Coffee', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catEntertainment, 'Entertainment', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catHealth, 'Health & Fitness', catParentSpending]
  )
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [catUtilities, 'Utilities', catParentSpending]
  )

  // Spending transactions: last ~180 days, varied merchants and amounts (cents, negative = outflow)
  const spendingDescriptions: [string, string][] = [
    ['Woolworths', catGroceries],
    ['Coles', catGroceries],
    ['ALDI', catGroceries],
    ['IGA', catGroceries],
    ['Local Cafe', catDining],
    ['Uber Eats', catDining],
    ["Domino's", catDining],
    ["McDonald's", catDining],
    ['PTV Myki', catTransport],
    ['Shell', catTransport],
    ['Caltex', catTransport],
    ['Uber', catTransport],
    ['Netflix', catSubscriptions],
    ['Spotify', catSubscriptions],
    ['Stan', catSubscriptions],
    ['Kmart', catShopping],
    ['Amazon', catShopping],
    ['JB Hi-Fi', catShopping],
    ['Bunnings', catShopping],
    ['Chemist Warehouse', catShopping],
    ['Officeworks', catShopping],
    ['David Jones', catShopping],
    ['Starbucks', catCoffee],
    ['Seven Seeds', catCoffee],
    ['Hoyts Cinema', catEntertainment],
    ['Steam Games', catEntertainment],
    ['Village Cinemas', catEntertainment],
    ['Anytime Fitness', catHealth],
    ['Pharmacy 4 Less', catHealth],
    ['AGL Energy', catUtilities],
    ['Telstra', catUtilities],
  ]
  const spendingAmounts = [
    800, 4500, 12000, 3500, 850, 2800, 2400, 1850, 650, 7200, 5800, 2500, 1999,
    1299, 1500, 3500, 8900, 12000, 4500, 2800, 1500, 8900, 550, 700, 1800, 2200,
    2500, 4500, 3200, 12000, 9500,
  ]

  for (let d = 0; d < 180; d++) {
    const date = new Date()
    date.setDate(date.getDate() - d)
    const dateStr = date.toISOString().slice(0, 10)
    const iso = dateStr + 'T12:00:00.000Z'
    const descIdx = d % spendingDescriptions.length
    const [desc, catId] = spendingDescriptions[descIdx]
    const baseCents = spendingAmounts[descIdx % spendingAmounts.length]
    const variance = seededAmount(d, -30, 30)
    const amount = -Math.max(100, baseCents + variance * 50)
    const isHeld = d < 3
    const isPayment = d === 5 || d === 12
    run(
      `INSERT OR REPLACE INTO transactions (
        id, account_id, status, raw_text, description, message, is_categorizable,
        category_id, parent_category_id, amount, currency, settled_at, created_at,
        is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `demo-tx-${d}`,
        DEMO_ACCOUNT_ID,
        isHeld ? 'HELD' : 'SETTLED',
        null,
        desc,
        null,
        1,
        catId,
        catParentSpending,
        amount,
        'AUD',
        dateStr,
        iso,
        0,
        null,
        null,
        isPayment ? 'MANUAL' : null,
        NOW,
      ]
    )
  }

  // Income transactions: 2-3 per week for last 26 weeks
  const incomeItems: [string, number][] = [
    ['Salary credit', 350000],
    ['Transfer from Mum', 50000],
    ['Refund - Amazon', 4500],
    ['Interest', 1200],
    ['Side hustle', 18000],
    ['Tax refund', 120000],
    ['Reimbursement', 8500],
    ['Freelance', 22000],
  ]
  let incomeIdx = 0
  for (let w = 0; w < 26; w++) {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - w * 7 - 3)
    for (let i = 0; i < 2 + (w % 2); i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i * 2)
      const dateStr = date.toISOString().slice(0, 10)
      const iso = dateStr + 'T09:00:00.000Z'
      const [desc, amount] = incomeItems[incomeIdx % incomeItems.length]
      incomeIdx++
      run(
        `INSERT OR REPLACE INTO transactions (
          id, account_id, status, raw_text, description, message, is_categorizable,
          category_id, parent_category_id, amount, currency, settled_at, created_at,
          is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `demo-income-${w}-${i}`,
          DEMO_ACCOUNT_ID,
          'SETTLED',
          null,
          desc,
          null,
          1,
          null,
          null,
          amount,
          'AUD',
          dateStr,
          iso,
          0,
          null,
          null,
          null,
          NOW,
        ]
      )
    }
  }

  // Saver transfer transactions to Rainy Day: 2-4 per week for 26 weeks
  let transferIdx = 0
  for (let w = 0; w < 26; w++) {
    const count = 2 + (w % 3)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - w * 7 - 1)
    for (let i = 0; i < count; i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i * 2)
      const dateStr = date.toISOString().slice(0, 10)
      const iso = dateStr + 'T14:00:00.000Z'
      const amount = -(5000 + (transferIdx % 5) * 2500)
      transferIdx++
      run(
        `INSERT OR REPLACE INTO transactions (
          id, account_id, status, raw_text, description, message, is_categorizable,
          category_id, parent_category_id, amount, currency, settled_at, created_at,
          is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `demo-transfer-${w}-${i}`,
          DEMO_ACCOUNT_ID,
          'SETTLED',
          null,
          'Transfer to Rainy Day',
          null,
          1,
          null,
          null,
          amount,
          'AUD',
          dateStr,
          iso,
          0,
          null,
          DEMO_SAVER_ID,
          'MANUAL',
          NOW,
        ]
      )
    }
  }

  // Saver transfer transactions to Holiday Fund: ~1 per week for 26 weeks
  for (let w = 0; w < 26; w++) {
    const date = new Date()
    date.setDate(date.getDate() - w * 7 - 4)
    const dateStr = date.toISOString().slice(0, 10)
    const iso = dateStr + 'T15:00:00.000Z'
    const amount = -(3000 + (w % 4) * 2000)
    run(
      `INSERT OR REPLACE INTO transactions (
        id, account_id, status, raw_text, description, message, is_categorizable,
        category_id, parent_category_id, amount, currency, settled_at, created_at,
        is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `demo-transfer-hol-${w}`,
        DEMO_ACCOUNT_ID,
        'SETTLED',
        null,
        'Transfer to Holiday Fund',
        null,
        1,
        null,
        null,
        amount,
        'AUD',
        dateStr,
        iso,
        0,
        null,
        DEMO_SAVER_2_ID,
        'MANUAL',
        NOW,
      ]
    )
  }

  // Round-up transactions: 7 parents from last 2 weeks
  const roundUpParents = [0, 2, 4, 6, 8, 10, 12]
  const roundUpCents = [23, 47, 12, 88, 56, 31, 94]
  roundUpParents.forEach((parentD, ruIdx) => {
    const date = new Date()
    date.setDate(date.getDate() - parentD)
    const dateStr = date.toISOString().slice(0, 10)
    const iso = dateStr + 'T12:01:00.000Z'
    run(
      `INSERT OR REPLACE INTO transactions (
        id, account_id, status, raw_text, description, message, is_categorizable,
        category_id, parent_category_id, amount, currency, settled_at, created_at,
        is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `demo-roundup-${parentD}`,
        DEMO_ACCOUNT_ID,
        'SETTLED',
        null,
        'Round Up',
        null,
        1,
        null,
        null,
        roundUpCents[ruIdx],
        'AUD',
        dateStr,
        iso,
        1,
        `demo-tx-${parentD}`,
        DEMO_SAVER_ID,
        null,
        NOW,
      ]
    )
  })

  // Savers with goals and user icons
  run(
    `INSERT INTO savers (id, name, icon, current_balance, goal_amount, target_date, monthly_transfer, auto_transfer_day, is_goal_based, user_icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       current_balance = excluded.current_balance,
       goal_amount = excluded.goal_amount,
       target_date = excluded.target_date,
       user_icon = excluded.user_icon,
       updated_at = excluded.updated_at`,
    [
      DEMO_SAVER_ID,
      'Rainy Day',
      null,
      125000,
      500000,
      new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      20000,
      null,
      1,
      '\u2602\uFE0F',
      NOW,
      NOW,
    ]
  )
  run(
    `INSERT INTO savers (id, name, icon, current_balance, goal_amount, target_date, monthly_transfer, auto_transfer_day, is_goal_based, user_icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       current_balance = excluded.current_balance,
       goal_amount = excluded.goal_amount,
       target_date = excluded.target_date,
       user_icon = excluded.user_icon,
       updated_at = excluded.updated_at`,
    [
      DEMO_SAVER_2_ID,
      'Holiday Fund',
      null,
      200000,
      800000,
      new Date(Date.now() + 270 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      15000,
      null,
      1,
      '\uD83C\uDF34',
      NOW,
      NOW,
    ]
  )

  // Trackers: MONTHLY, WEEKLY, FORTNIGHTLY for variety
  const todayStr = new Date().toISOString().slice(0, 10)
  const lastResetStr = firstOfCurrentMonthUTC()
  const nextResetStr = firstOfNextMonthUTC()
  const weeklyLast = weeklyLastReset(1, todayStr)
  const weeklyNext = weeklyNextReset(1, weeklyLast)
  const fortLast = fortnightlyLastReset(1, todayStr)
  const fortNext = fortnightlyNextReset(fortLast)

  run(
    `DELETE FROM trackers WHERE name IN ('Groceries', 'Dining & Takeaway', 'Coffee', 'Entertainment')`
  )

  run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      'Groceries',
      80000,
      'MONTHLY',
      1,
      lastResetStr,
      lastResetStr,
      nextResetStr,
      NOW,
    ]
  )
  const tracker1Result = db.exec('SELECT last_insert_rowid()')
  const tracker1Id = (tracker1Result[0]?.values?.[0]?.[0] as number) ?? 1
  run(
    `INSERT OR IGNORE INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
    [tracker1Id, catGroceries]
  )

  run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      'Dining & Takeaway',
      30000,
      'MONTHLY',
      1,
      lastResetStr,
      lastResetStr,
      nextResetStr,
      NOW,
    ]
  )
  const tracker2Result = db.exec('SELECT last_insert_rowid()')
  const tracker2Id = (tracker2Result[0]?.values?.[0]?.[0] as number) ?? 2
  run(
    `INSERT OR IGNORE INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
    [tracker2Id, catDining]
  )

  run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ['Coffee', 8000, 'WEEKLY', 1, weeklyLast, weeklyLast, weeklyNext, NOW]
  )
  const tracker3Result = db.exec('SELECT last_insert_rowid()')
  const tracker3Id = (tracker3Result[0]?.values?.[0]?.[0] as number) ?? 3
  run(
    `INSERT OR IGNORE INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
    [tracker3Id, catCoffee]
  )

  run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      'Entertainment',
      20000,
      'FORTNIGHTLY',
      1,
      fortLast,
      fortLast,
      fortNext,
      NOW,
    ]
  )
  const tracker4Result = db.exec('SELECT last_insert_rowid()')
  const tracker4Id = (tracker4Result[0]?.values?.[0]?.[0] as number) ?? 4
  run(
    `INSERT OR IGNORE INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
    [tracker4Id, catEntertainment]
  )

  // Upcoming charges with bill reminders
  run(
    `DELETE FROM upcoming_charges WHERE name IN ('Netflix', 'Rent', 'Gym', 'Insurance', 'Domain')`
  )

  const nextCharge1 = new Date()
  nextCharge1.setDate(nextCharge1.getDate() + 5)
  const rentNextChargeDate = firstOfNextMonthUTC()
  const gymNext = new Date()
  gymNext.setDate(gymNext.getDate() + 2)
  const insuranceNext = new Date()
  insuranceNext.setMonth(insuranceNext.getMonth() + 2)
  insuranceNext.setDate(15)
  const insuranceCancelBy = new Date(insuranceNext)
  insuranceCancelBy.setDate(insuranceCancelBy.getDate() - 14)
  const domainNext = new Date()
  domainNext.setFullYear(domainNext.getFullYear() + 1)
  domainNext.setMonth(2)
  domainNext.setDate(1)

  run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Netflix',
      1999,
      'MONTHLY',
      nextCharge1.toISOString().slice(0, 10),
      catSubscriptions,
      1,
      3,
      1,
      null,
      NOW,
    ]
  )
  run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Rent', 180000, 'MONTHLY', rentNextChargeDate, null, 1, 5, 0, null, NOW]
  )
  run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Gym',
      2500,
      'WEEKLY',
      gymNext.toISOString().slice(0, 10),
      catHealth,
      1,
      1,
      0,
      null,
      NOW,
    ]
  )
  run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Insurance',
      45000,
      'QUARTERLY',
      insuranceNext.toISOString().slice(0, 10),
      null,
      1,
      7,
      0,
      insuranceCancelBy.toISOString().slice(0, 10),
      NOW,
    ]
  )
  run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Domain',
      1500,
      'YEARLY',
      domainNext.toISOString().slice(0, 10),
      null,
      0,
      null,
      0,
      null,
      NOW,
    ]
  )

  // Goals at different progress stages
  const goalCreatedAt1 = new Date(
    Date.now() - 150 * 24 * 60 * 60 * 1000
  ).toISOString()
  const goalCreatedAt2 = new Date(
    Date.now() - 120 * 24 * 60 * 60 * 1000
  ).toISOString()
  const goalCreatedAt3 = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString()
  const goalCreatedAt4 = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString()

  run(
    `INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, target_date, icon, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Emergency Fund',
      1000000,
      420000,
      30000,
      daysAheadStr(365),
      '\uD83D\uDEE1\uFE0F',
      null,
      goalCreatedAt1,
      NOW,
    ]
  )
  const goal1Result = db.exec('SELECT last_insert_rowid()')
  const goal1Id = (goal1Result[0]?.values?.[0]?.[0] as number) ?? 1

  run(
    `INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, target_date, icon, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'New Laptop',
      250000,
      215000,
      20000,
      daysAheadStr(60),
      '\uD83D\uDCBB',
      null,
      goalCreatedAt2,
      NOW,
    ]
  )
  const goal2Result = db.exec('SELECT last_insert_rowid()')
  const goal2Id = (goal2Result[0]?.values?.[0]?.[0] as number) ?? 2

  run(
    `INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, target_date, icon, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Car Deposit',
      2500000,
      375000,
      50000,
      daysAheadStr(1095),
      '\uD83D\uDE97',
      null,
      goalCreatedAt3,
      NOW,
    ]
  )
  const goal3Result = db.exec('SELECT last_insert_rowid()')
  const goal3Id = (goal3Result[0]?.values?.[0]?.[0] as number) ?? 3

  run(
    `INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, target_date, icon, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Weekend Getaway',
      80000,
      80000,
      null,
      daysAgoStr(30),
      '\u2708\uFE0F',
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      goalCreatedAt4,
      NOW,
    ]
  )
  const goal4Result = db.exec('SELECT last_insert_rowid()')
  const goal4Id = (goal4Result[0]?.values?.[0]?.[0] as number) ?? 4

  // Goal snapshots: progressive growth every ~5 days
  const goalConfigs: [number, number, number, number][] = [
    [goal1Id, 150, 420000, 1000000],
    [goal2Id, 120, 215000, 250000],
    [goal3Id, 90, 375000, 2500000],
    [goal4Id, 60, 80000, 80000],
  ]
  for (const [goalId, totalDays, finalAmount, targetAmount] of goalConfigs) {
    for (let step = 0; step <= totalDays; step += 5) {
      const dayOffset = totalDays - step
      const progress = step / totalDays
      const baseAmount = Math.round(finalAmount * progress)
      const variance = seededAmount(goalId * 1000 + step, -500, 500)
      const amount = Math.max(0, Math.min(finalAmount, baseAmount + variance))
      run(
        `INSERT OR REPLACE INTO goal_snapshots (goal_id, snapshot_date, current_amount, target_amount)
         VALUES (?, ?, ?, ?)`,
        [goalId, daysAgoStr(dayOffset), amount, targetAmount]
      )
    }
  }

  // Net worth snapshots: 180 days of daily history
  const nwStart = 600000
  const nwEnd = 777300
  const nwRange = nwEnd - nwStart
  for (let d = 180; d >= 0; d--) {
    const progress = (180 - d) / 180
    const base = Math.round(nwStart + nwRange * progress)
    const variance = seededAmount(d * 7 + 3, -20000, 20000)
    const total = Math.max(nwStart, base + variance)
    run(
      `INSERT OR REPLACE INTO net_worth_snapshots (snapshot_date, total_balance_cents)
       VALUES (?, ?)`,
      [daysAgoStr(d), total]
    )
  }

  // Net worth type snapshots: TRANSACTIONAL + SAVER per day
  const saverNwStart = 200000
  const saverNwEnd = 325000
  const saverNwRange = saverNwEnd - saverNwStart
  for (let d = 180; d >= 0; d--) {
    const progress = (180 - d) / 180
    const saverBase = Math.round(saverNwStart + saverNwRange * progress)
    const saverVariance = seededAmount(d * 11 + 1, -5000, 5000)
    const saverTotal = Math.max(saverNwStart, saverBase + saverVariance)

    const nwBase = Math.round(nwStart + nwRange * progress)
    const nwVariance = seededAmount(d * 7 + 3, -20000, 20000)
    const totalNw = Math.max(nwStart, nwBase + nwVariance)
    const transactionalTotal = totalNw - saverTotal

    const snapDate = daysAgoStr(d)
    run(
      `INSERT OR REPLACE INTO net_worth_type_snapshots (snapshot_date, account_type, total_balance_cents)
       VALUES (?, ?, ?)`,
      [snapDate, 'TRANSACTIONAL', Math.max(0, transactionalTotal)]
    )
    run(
      `INSERT OR REPLACE INTO net_worth_type_snapshots (snapshot_date, account_type, total_balance_cents)
       VALUES (?, ?, ?)`,
      [snapDate, 'SAVER', saverTotal]
    )
  }

  // Saver balance snapshots: 180 days for both savers
  const rainyStart = 20000
  const rainyEnd = 125000
  const rainyRange = rainyEnd - rainyStart
  const holidayStart = 50000
  const holidayEnd = 200000
  const holidayRange = holidayEnd - holidayStart
  for (let d = 180; d >= 0; d--) {
    const progress = (180 - d) / 180
    const snapDate = daysAgoStr(d)

    const rainyBase = Math.round(rainyStart + rainyRange * progress)
    const rainyVariance = seededAmount(d * 13 + 5, -2000, 2000)
    const rainyBalance = Math.max(rainyStart, rainyBase + rainyVariance)
    run(
      `INSERT OR REPLACE INTO saver_balance_snapshots (saver_id, snapshot_date, balance_cents)
       VALUES (?, ?, ?)`,
      [DEMO_SAVER_ID, snapDate, rainyBalance]
    )

    const holidayBase = Math.round(holidayStart + holidayRange * progress)
    const holidayVariance = seededAmount(d * 17 + 7, -3000, 3000)
    const holidayBalance = Math.max(holidayStart, holidayBase + holidayVariance)
    run(
      `INSERT OR REPLACE INTO saver_balance_snapshots (saver_id, snapshot_date, balance_cents)
       VALUES (?, ?, ?)`,
      [DEMO_SAVER_2_ID, snapDate, holidayBalance]
    )
  }

  // Transaction user data: example notes and category overrides
  run(
    `INSERT OR REPLACE INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES (?, ?, ?)`,
    ['demo-tx-5', 'Birthday dinner with Sarah', null]
  )
  run(
    `INSERT OR REPLACE INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES (?, ?, ?)`,
    ['demo-tx-10', 'Work reimbursable', null]
  )
  run(
    `INSERT OR REPLACE INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES (?, ?, ?)`,
    ['demo-tx-15', null, catGroceries]
  )
  run(
    `INSERT OR REPLACE INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES (?, ?, ?)`,
    ['demo-income-0-0', 'Monthly salary - March', null]
  )
}
