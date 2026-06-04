/**
 * Database schema (Phase 1: schema version 1).
 * Creation order respects FK dependencies.
 */

import type { Database } from 'sql.js'

const SCHEMA_VERSION = 21

function tableExists(database: Database, name: string): boolean {
  const stmt = database.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
  )
  stmt.bind([name])
  const exists = stmt.step()
  stmt.free()
  return exists
}

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    balance INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ownership_type TEXT,
    synced_at TEXT,
    is_closed INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    status TEXT NOT NULL,
    raw_text TEXT,
    description TEXT NOT NULL,
    message TEXT,
    is_categorizable INTEGER DEFAULT 1,
    category_id TEXT,
    parent_category_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'AUD',
    foreign_amount INTEGER,
    foreign_currency TEXT,
    settled_at TEXT,
    created_at TEXT NOT NULL,
    is_round_up INTEGER DEFAULT 0,
    round_up_parent_id TEXT,
    round_up_amount INTEGER,
    round_up_boost_portion INTEGER,
    transfer_account_id TEXT,
    transfer_type TEXT,
    note TEXT,
    cashback_description TEXT,
    cashback_amount INTEGER,
    card_purchase_method TEXT,
    card_number_suffix TEXT,
    performing_customer TEXT,
    transaction_type TEXT,
    deep_link_url TEXT,
    synced_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (round_up_parent_id) REFERENCES transactions(id),
    FOREIGN KEY (transfer_account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (parent_category_id) REFERENCES categories(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_settled_at ON transactions(settled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_round_up_parent_id ON transactions(round_up_parent_id)`,
  `CREATE TABLE IF NOT EXISTS trackers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    budget_amount INTEGER NOT NULL,
    reset_frequency TEXT NOT NULL,
    reset_day INTEGER,
    start_date TEXT NOT NULL,
    last_reset_date TEXT NOT NULL,
    next_reset_date TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    badge_color TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tracker_categories (
    tracker_id INTEGER NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (tracker_id, category_id),
    FOREIGN KEY (tracker_id) REFERENCES trackers(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS upcoming_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    next_charge_date TEXT NOT NULL,
    category_id TEXT,
    is_reserved INTEGER DEFAULT 1,
    reminder_days_before INTEGER,
    is_subscription INTEGER DEFAULT 0,
    cancel_by_date TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_user_data (
    transaction_id TEXT PRIMARY KEY,
    user_notes TEXT,
    user_category_override TEXT,
    is_income INTEGER DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  )`,
  `CREATE TABLE IF NOT EXISTS future_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'MONTHLY',
    target_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS maybuys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    url TEXT,
    notes TEXT,
    saver_account_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    decided_at TEXT,
    FOREIGN KEY (saver_account_id) REFERENCES accounts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (transaction_id, tag_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transaction_tags_transaction_id ON transaction_tags(transaction_id)`,
  `CREATE TABLE IF NOT EXISTS saver_balance_snapshots (
    saver_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    balance_cents INTEGER NOT NULL,
    PRIMARY KEY (saver_id, snapshot_date)
  )`,
]

export function runSchema(database: Database): void {
  for (const sql of DDL_STATEMENTS) {
    database.run(sql)
  }
  database.run(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
    [String(SCHEMA_VERSION)]
  )
}

/**
 * Run migrations for existing databases (called when loading from IndexedDB).
 * Idempotent: checks schema_version and only runs pending migrations.
 */
export function runMigrations(database: Database): void {
  const stmt = database.prepare(
    `SELECT value FROM app_settings WHERE key = 'schema_version'`
  )
  stmt.step()
  const row = stmt.get()
  stmt.free()
  const version = row ? parseInt(String(row[0]), 10) : 0
  if (version >= SCHEMA_VERSION) return

  if (version < 2) {
    database.run(`ALTER TABLE trackers ADD COLUMN badge_color TEXT`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['2']
    )
  }
  if (version < 3) {
    database.run(
      `ALTER TABLE upcoming_charges ADD COLUMN reminder_days_before INTEGER`
    )
    database.run(
      `ALTER TABLE upcoming_charges ADD COLUMN is_subscription INTEGER DEFAULT 0`
    )
    database.run(`ALTER TABLE upcoming_charges ADD COLUMN cancel_by_date TEXT`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['3']
    )
  }
  if (version < 4) {
    database.run(
      `CREATE TABLE IF NOT EXISTS net_worth_snapshots (
        snapshot_date TEXT PRIMARY KEY,
        total_balance_cents INTEGER NOT NULL
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['4']
    )
  }
  if (version < 5) {
    database.run(
      `CREATE TABLE IF NOT EXISTS transaction_user_data (
        transaction_id TEXT PRIMARY KEY,
        user_notes TEXT,
        user_category_override TEXT,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['5']
    )
  }
  if (version < 6) {
    if (tableExists(database, 'savers')) {
      database.run(`ALTER TABLE savers ADD COLUMN completed_at TEXT`)
      database.run(`ALTER TABLE savers ADD COLUMN user_icon TEXT`)
    }
    database.run(
      `CREATE TABLE IF NOT EXISTS net_worth_type_snapshots (
        snapshot_date TEXT NOT NULL,
        account_type TEXT NOT NULL,
        total_balance_cents INTEGER NOT NULL,
        PRIMARY KEY (snapshot_date, account_type)
      )`
    )
    database.run(
      `CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_amount INTEGER NOT NULL,
        current_amount INTEGER NOT NULL DEFAULT 0,
        monthly_contribution INTEGER,
        target_date TEXT,
        icon TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['6']
    )
  }
  if (version < 7) {
    database.run(
      `CREATE TABLE IF NOT EXISTS saver_balance_snapshots (
        saver_id TEXT NOT NULL,
        snapshot_date TEXT NOT NULL,
        balance_cents INTEGER NOT NULL,
        PRIMARY KEY (saver_id, snapshot_date)
      )`
    )
    database.run(
      `CREATE TABLE IF NOT EXISTS goal_snapshots (
        goal_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        current_amount INTEGER NOT NULL,
        target_amount INTEGER NOT NULL,
        PRIMARY KEY (goal_id, snapshot_date)
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['7']
    )
  }
  if (version < 8) {
    const cols = database.exec(`PRAGMA table_info(upcoming_charges)`)
    const existing = new Set((cols[0]?.values ?? []).map((r) => String(r[1])))
    if (!existing.has('reminder_days_before')) {
      database.run(
        `ALTER TABLE upcoming_charges ADD COLUMN reminder_days_before INTEGER`
      )
    }
    if (!existing.has('is_subscription')) {
      database.run(
        `ALTER TABLE upcoming_charges ADD COLUMN is_subscription INTEGER DEFAULT 0`
      )
    }
    if (!existing.has('cancel_by_date')) {
      database.run(
        `ALTER TABLE upcoming_charges ADD COLUMN cancel_by_date TEXT`
      )
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['8']
    )
  }
  if (version < 9) {
    const goalCols = database.exec(`PRAGMA table_info(goals)`)
    const goalExisting = new Set(
      (goalCols[0]?.values ?? []).map((r) => String(r[1]))
    )
    if (!goalExisting.has('priority_rank')) {
      database.run(`ALTER TABLE goals ADD COLUMN priority_rank INTEGER`)
    }
    if (!goalExisting.has('allocation_percent')) {
      database.run(`ALTER TABLE goals ADD COLUMN allocation_percent INTEGER`)
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['9']
    )
  }
  if (version < 10) {
    const cols = database.exec(`PRAGMA table_info(transaction_user_data)`)
    const existing = new Set((cols[0]?.values ?? []).map((r) => String(r[1])))
    if (!existing.has('is_income')) {
      database.run(
        `ALTER TABLE transaction_user_data ADD COLUMN is_income INTEGER DEFAULT 0`
      )
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['10']
    )
  }
  if (version < 11) {
    database.run(
      `CREATE TABLE IF NOT EXISTS future_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'MONTHLY',
        target_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['11']
    )
  }
  if (version < 12) {
    database.run(`DROP TABLE IF EXISTS goal_snapshots`)
    database.run(`DROP TABLE IF EXISTS goals`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['12']
    )
  }
  if (version < 13) {
    database.run(`DROP TABLE IF EXISTS saver_balance_snapshots`)
    database.run(`DROP TABLE IF EXISTS savers`)
    database.run(
      `DELETE FROM net_worth_type_snapshots WHERE account_type = 'SAVER'`
    )
    database.run(`DELETE FROM app_settings WHERE key = 'saver_chart_colors'`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['13']
    )
  }
  if (version < 14) {
    database.run(`DROP TABLE IF EXISTS net_worth_snapshots`)
    database.run(`DROP TABLE IF EXISTS net_worth_type_snapshots`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['14']
    )
  }
  if (version < 15) {
    const txCols = database.exec(`PRAGMA table_info(transactions)`)
    const txExisting = new Set(
      (txCols[0]?.values ?? []).map((r) => String(r[1]))
    )
    if (!txExisting.has('round_up_amount')) {
      database.run(
        `ALTER TABLE transactions ADD COLUMN round_up_amount INTEGER`
      )
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['15']
    )
  }
  if (version < 16) {
    database.run(
      `CREATE TABLE IF NOT EXISTS maybuys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        url TEXT,
        notes TEXT,
        saver_account_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        decided_at TEXT,
        FOREIGN KEY (saver_account_id) REFERENCES accounts(id)
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['16']
    )
  }
  if (version < 17) {
    const accCols = database.exec(`PRAGMA table_info(accounts)`)
    const accExisting = new Set(
      (accCols[0]?.values ?? []).map((r) => String(r[1]))
    )
    if (!accExisting.has('is_closed')) {
      database.run(
        `ALTER TABLE accounts ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0`
      )
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['17']
    )
  }
  if (version < 18) {
    database.run(`DELETE FROM app_settings WHERE key = 'categorization_rules'`)
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['18']
    )
  }
  if (version < 19) {
    const txCols = database.exec(`PRAGMA table_info(transactions)`)
    const txExisting = new Set(
      (txCols[0]?.values ?? []).map((r) => String(r[1]))
    )
    const newCols: [string, string][] = [
      ['round_up_boost_portion', 'INTEGER'],
      ['note', 'TEXT'],
      ['cashback_description', 'TEXT'],
      ['cashback_amount', 'INTEGER'],
      ['card_purchase_method', 'TEXT'],
      ['card_number_suffix', 'TEXT'],
      ['performing_customer', 'TEXT'],
      ['transaction_type', 'TEXT'],
      ['deep_link_url', 'TEXT'],
    ]
    for (const [col, type] of newCols) {
      if (!txExisting.has(col)) {
        database.run(`ALTER TABLE transactions ADD COLUMN ${col} ${type}`)
      }
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['19']
    )
  }
  if (version < 20) {
    database.run(`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY)`)
    database.run(`
      CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (transaction_id, tag_id),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id)
      )
    `)
    database.run(
      `CREATE INDEX IF NOT EXISTS idx_transaction_tags_transaction_id ON transaction_tags(transaction_id)`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['20']
    )
  }
  if (version < 21) {
    database.run(
      `CREATE TABLE IF NOT EXISTS saver_balance_snapshots (
        saver_id TEXT NOT NULL,
        snapshot_date TEXT NOT NULL,
        balance_cents INTEGER NOT NULL,
        PRIMARY KEY (saver_id, snapshot_date)
      )`
    )
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)`,
      ['21']
    )
  }
}

export { SCHEMA_VERSION }
