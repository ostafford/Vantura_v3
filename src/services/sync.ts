/**
 * Sync orchestration: initial sync and subsequent sync with Up Bank API.
 * Upserts accounts, transactions, categories; recalculates trackers.
 */

import { getDb, setAppSetting, getAppSetting, schedulePersist } from '@/db'
import {
  fetchAccounts,
  fetchAllTransactions,
  fetchCategories,
  fetchTags,
  fetchTransactionById,
  type UpAccount,
  type UpTransaction,
  type UpCategory,
  type UpTag,
} from '@/api/upBank'
import {
  isMonthlyLastWeekday,
  monthlyPaydayDate,
  previousPaydayDate,
  type PaydayFrequency,
} from '@/lib/payday'
import { writeNetWorthSnapshot } from '@/services/netWorth'
import { reconcileSaverGoalAchievement } from '@/services/accounts'
import { localDateString } from '@/lib/format'

/**
 * If stored next_payday is in the past, advance it using payday_frequency and payday_day.
 * Call on app init and at start of each sync so PAYDAY trackers and reserved amount use current value.
 */
export function advanceNextPaydayIfNeeded(): void {
  const frequency = getAppSetting('payday_frequency')
  const dayStr = getAppSetting('payday_day')
  if (!frequency) return
  let nextPayday = getAppSetting('next_payday')
  if (!nextPayday) return
  const today = localDateString()
  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1

  while (today >= nextPayday) {
    const current = new Date(nextPayday + 'T12:00:00Z')
    let next: Date
    if (frequency === 'WEEKLY') {
      next = new Date(current)
      next.setUTCDate(next.getUTCDate() + 7)
    } else if (frequency === 'FORTNIGHTLY') {
      next = new Date(current)
      next.setUTCDate(next.getUTCDate() + 14)
    } else if (frequency === 'MONTHLY') {
      if (isMonthlyLastWeekday(paydayDay)) {
        const nextMonthStart = new Date(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)
        )
        next = monthlyPaydayDate(
          paydayDay,
          nextMonthStart.getUTCFullYear(),
          nextMonthStart.getUTCMonth()
        )
      } else {
        next = new Date(current)
        next.setUTCMonth(next.getUTCMonth() + 1)
        if (paydayDay >= 1 && paydayDay <= 28) next.setUTCDate(paydayDay)
      }
    } else {
      break
    }
    nextPayday = next.toISOString().slice(0, 10)
    setAppSetting('next_payday', nextPayday)
  }
}

export type SyncProgress = {
  phase: 'accounts' | 'transactions' | 'held' | 'categories' | 'tags' | 'done'
  fetched?: number
  hasMore?: boolean
}

/** User-visible status line for Settings / toast during full or incremental sync. */
export function formatSyncProgressMessage(p: SyncProgress): string {
  if (p.phase === 'done') return 'Complete.'
  if (p.phase === 'transactions' && p.fetched != null) {
    return `Fetched ${p.fetched} transactions…`
  }
  if (p.phase === 'held') return 'Checking pending transactions…'
  return `Syncing ${p.phase}…`
}

/** True while inside withTransaction(); suppresses the per-row schedulePersist(). */
let suppressPersist = false

function run(sql: string, params: (string | number | null)[] = []): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(sql, params)
  if (!suppressPersist) schedulePersist()
}

/**
 * Run fn inside a single SQLite transaction and persist once at the end, instead of
 * once per row. Used for bulk upserts (e.g. full re-sync's transaction list) where the
 * per-call schedulePersist() and per-statement autocommit overhead add up across
 * thousands of rows. Rolls back on error so a failure partway through a full re-sync
 * doesn't leave a half-written batch.
 *
 * `suppressPersist` doubles as an in-transaction flag: if withTransaction is called
 * while one is already open (e.g. nested from within another withTransaction's fn),
 * it runs fn() inline instead of issuing a nested BEGIN, which SQLite rejects.
 */
function withTransaction(fn: () => void): void {
  if (suppressPersist) {
    fn()
    return
  }
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run('BEGIN')
  suppressPersist = true
  try {
    fn()
  } catch (e) {
    suppressPersist = false
    db.run('ROLLBACK')
    throw e
  }
  suppressPersist = false
  db.run('COMMIT')
  schedulePersist()
}

function upsertAccount(acc: UpAccount): void {
  const a = acc.attributes
  const balance = a.balance?.valueInBaseUnits ?? 0
  const now = new Date().toISOString()
  const ownership = a.ownershipType != null ? String(a.ownershipType) : null
  run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type, synced_at, is_closed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       account_type = excluded.account_type,
       balance      = excluded.balance,
       updated_at   = excluded.updated_at,
       ownership_type = excluded.ownership_type,
       synced_at    = excluded.synced_at,
       is_closed    = 0`,
    [
      acc.id,
      a.displayName ?? '',
      a.accountType ?? 'TRANSACTIONAL',
      balance,
      a.createdAt ?? now,
      now,
      ownership,
      now,
    ]
  )
}

/**
 * Mark any accounts in the local DB that were NOT returned by the API as closed.
 * Re-opens accounts that reappear (is_closed = 0 is set in upsertAccount).
 * Called after all accounts from a sync pass have been upserted.
 */
function reconcileClosedAccounts(fetchedIds: Set<string>): void {
  const db = getDb()
  if (!db) return
  const stmt = db.prepare(`SELECT id FROM accounts`)
  const storedIds: string[] = []
  while (stmt.step()) {
    storedIds.push(stmt.get()[0] as string)
  }
  stmt.free()
  for (const id of storedIds) {
    if (!fetchedIds.has(id)) {
      db.run(`UPDATE accounts SET is_closed = 1 WHERE id = ?`, [id])
    }
  }
  schedulePersist()
}

function upsertTransaction(tx: UpTransaction): void {
  const a = tx.attributes
  const rel = tx.relationships
  const accountId = rel?.account?.data?.id ?? ''
  const categoryId = rel?.category?.data?.id ?? null
  const parentCategoryId = rel?.parentCategory?.data?.id ?? null
  const amount = a.amount?.valueInBaseUnits ?? 0
  const transferAccountId =
    amount < 0 && a.roundUp != null
      ? null
      : (rel?.transferAccount?.data?.id ?? null)
  const isRoundUp = a.roundUp != null ? 1 : 0
  const roundUpParentId = rel?.roundUp?.data?.id ?? null
  const roundUpAmount =
    a.roundUp?.amount?.valueInBaseUnits != null
      ? a.roundUp.amount.valueInBaseUnits
      : null
  const roundUpBoostPortion =
    a.roundUp?.boostPortion?.valueInBaseUnits != null
      ? a.roundUp.boostPortion.valueInBaseUnits
      : null
  run(
    `INSERT OR REPLACE INTO transactions (
      id, account_id, status, raw_text, description, message, is_categorizable,
      category_id, parent_category_id, amount, currency, foreign_amount, foreign_currency,
      settled_at, created_at,
      is_round_up, round_up_parent_id, round_up_amount, round_up_boost_portion,
      transfer_account_id, transfer_type,
      note, cashback_description, cashback_amount,
      card_purchase_method, card_number_suffix,
      performing_customer, transaction_type, deep_link_url,
      synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      accountId,
      a.status ?? 'SETTLED',
      a.rawText ?? null,
      a.description ?? '',
      a.message ?? null,
      a.isCategorizable !== false ? 1 : 0,
      categoryId,
      parentCategoryId,
      amount,
      a.amount?.currencyCode ?? 'AUD',
      a.foreignAmount?.valueInBaseUnits ?? null,
      a.foreignAmount?.currencyCode ?? null,
      a.settledAt ?? null,
      a.createdAt ?? new Date().toISOString(),
      isRoundUp,
      roundUpParentId,
      roundUpAmount,
      roundUpBoostPortion,
      transferAccountId,
      null,
      a.note?.text ?? null,
      a.cashback?.description ?? null,
      a.cashback?.amount?.valueInBaseUnits ?? null,
      a.cardPurchaseMethod?.method ?? null,
      a.cardPurchaseMethod?.cardNumberSuffix ?? null,
      a.performingCustomer?.displayName ?? null,
      a.transactionType ?? null,
      a.deepLinkURL ?? null,
      new Date().toISOString(),
    ]
  )
  const tagIds = (rel?.tags?.data ?? []).map((t) => t.id)
  upsertTransactionTags(tx.id, tagIds)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** ids of locally stored transactions still marked HELD (i.e. not yet settled). */
function getLocallyHeldTransactionIds(): string[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(`SELECT id FROM transactions WHERE status = 'HELD'`)
  const ids: string[] = []
  while (stmt.step()) ids.push(stmt.get()[0] as string)
  stmt.free()
  return ids
}

const HELD_LOOKUP_BATCH_SIZE = 5

/**
 * Re-fetch locally-HELD transactions individually to pick up settlement (status/
 * settledAt) or category changes that an incremental sync's filter[since] — which
 * matches on createdAt, not last-modified — would otherwise miss. HELD transactions
 * are normally a handful, so this stays fast enough for the regular "Sync" button and
 * doesn't require a full history re-sync just to notice a hold has settled.
 *
 * `justFetchedIds` are ids already upserted by this run's incremental transaction
 * fetch — skipped here since their data is already current, whether they're still
 * HELD or have since settled. Lookups run in small paced batches (not one big burst)
 * to stay within Up's rate limit, and a single failed lookup is skipped rather than
 * aborting the whole sync (via Promise.allSettled, not Promise.all).
 */
async function resolveHeldTransactions(
  apiToken: string,
  justFetchedIds: ReadonlySet<string>
): Promise<void> {
  const heldIds = getLocallyHeldTransactionIds().filter(
    (id) => !justFetchedIds.has(id)
  )
  if (heldIds.length === 0) return

  const resolved: UpTransaction[] = []
  for (let i = 0; i < heldIds.length; i += HELD_LOOKUP_BATCH_SIZE) {
    const batch = heldIds.slice(i, i + HELD_LOOKUP_BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((id) => fetchTransactionById(apiToken, id))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) resolved.push(r.value)
    }
    if (i + HELD_LOOKUP_BATCH_SIZE < heldIds.length) await sleep(1000)
  }
  if (resolved.length === 0) return
  withTransaction(() => {
    for (const tx of resolved) upsertTransaction(tx)
  })
}

function upsertTag(tag: UpTag): void {
  run(`INSERT OR IGNORE INTO tags (id) VALUES (?)`, [tag.id])
}

function upsertTransactionTags(transactionId: string, tagIds: string[]): void {
  run(`DELETE FROM transaction_tags WHERE transaction_id = ?`, [transactionId])
  for (const tagId of tagIds) {
    run(
      `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
      [transactionId, tagId]
    )
  }
}

function snapshotSaverBalances(accounts: UpAccount[]): void {
  const today = localDateString()
  for (const acc of accounts) {
    if (acc.attributes.accountType !== 'SAVER') continue
    const balance = acc.attributes.balance?.valueInBaseUnits ?? 0
    run(
      `INSERT OR REPLACE INTO saver_balance_snapshots (saver_id, snapshot_date, balance_cents) VALUES (?, ?, ?)`,
      [acc.id, today, balance]
    )
  }
}

function upsertCategory(cat: UpCategory): void {
  const parentData = cat.relationships?.parent?.data
  const parentId =
    parentData && typeof parentData === 'object' && 'id' in parentData
      ? (parentData as { id: string }).id
      : null
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [cat.id, cat.attributes?.name ?? cat.id, parentId]
  )
}

/** The payday before nextPayday, computed from payday settings. */
function prevPaydayDate(nextPayday: string): string | null {
  const frequency = getAppSetting('payday_frequency')
  const dayStr = getAppSetting('payday_day')
  if (
    frequency !== 'WEEKLY' &&
    frequency !== 'FORTNIGHTLY' &&
    frequency !== 'MONTHLY'
  )
    return null
  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1
  return previousPaydayDate(nextPayday, frequency as PaydayFrequency, paydayDay)
}

/**
 * Advance tracker reset dates where current time >= next_reset_date.
 * Loops until all trackers are current (handles multiple missed periods).
 * For PAYDAY frequency uses app_settings next_payday; skips if not configured.
 */
export function recalculateTrackers(): void {
  const db = getDb()
  if (!db) return

  let anyChanged = false
  let changed = true
  while (changed) {
    changed = false
    const now = new Date().toISOString()
    const nextPayday = getAppSetting('next_payday')
    const stmt = db.prepare(
      `SELECT id, reset_frequency, next_reset_date FROM trackers WHERE is_active = 1`
    )
    while (stmt.step()) {
      const row = stmt.get()
      const id = row[0]
      const freq = row[1]
      const nextReset = row[2] as string
      if (!nextReset || now < nextReset) continue
      if (freq === 'PAYDAY') {
        if (!nextPayday) continue
        const nextPaydayNorm =
          nextPayday.length > 10 ? nextPayday.slice(0, 10) : nextPayday
        // If next_payday itself is stuck in the past (e.g. a caller ran
        // recalculateTrackers() without first calling
        // advanceNextPaydayIfNeeded(), or payday settings were cleared),
        // this would recompute the exact same target every outer pass —
        // guard on an actual change so the loop can't spin forever on a
        // no-op "update".
        const lastPaydayNorm = prevPaydayDate(nextPaydayNorm) ?? nextPaydayNorm
        const nextResetNorm =
          nextReset.length >= 10 ? nextReset.slice(0, 10) : nextReset
        if (nextPaydayNorm === nextResetNorm) continue
        changed = true
        db.run(
          `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
          [lastPaydayNorm, nextPaydayNorm, id]
        )
      } else {
        const prev = new Date(nextReset + 'T12:00:00Z')
        let next: Date
        if (freq === 'WEEKLY')
          next = new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000)
        else if (freq === 'FORTNIGHTLY')
          next = new Date(prev.getTime() + 14 * 24 * 60 * 60 * 1000)
        else if (freq === 'MONTHLY') {
          next = new Date(prev)
          next.setUTCMonth(next.getUTCMonth() + 1)
        } else {
          continue
        }
        changed = true
        const lastNorm =
          nextReset.length >= 10 ? nextReset.slice(0, 10) : nextReset
        const nextNorm = next.toISOString().slice(0, 10)
        db.run(
          `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
          [lastNorm, nextNorm, id]
        )
      }
    }
    stmt.free()
    if (changed) anyChanged = true
  }
  if (anyChanged) schedulePersist()
}

/**
 * Perform initial sync: accounts, transactions, categories; set last_sync and onboarding_complete.
 * Caller must have already stored encrypted token and salt (onboarding step 3).
 */
export async function performInitialSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  reconcileClosedAccounts(new Set(accounts.map((a) => a.id)))
  snapshotSaverBalances(accounts)
  reconcileSaverGoalAchievement()
  writeNetWorthSnapshot()
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    withTransaction(() => {
      for (const tx of txs) upsertTransaction(tx)
    })
  })
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  progressCallback({ phase: 'tags' })
  const tags = await fetchTags(apiToken)
  for (const t of tags) upsertTag(t)
  setAppSetting('last_sync', new Date().toISOString())
  setAppSetting('onboarding_complete', '1')
  progressCallback({ phase: 'done' })
}

/**
 * Subsequent sync: fetch accounts, transactions since last_sync, recalculate trackers.
 */
export async function performSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  advanceNextPaydayIfNeeded()
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  reconcileClosedAccounts(new Set(accounts.map((a) => a.id)))
  snapshotSaverBalances(accounts)
  reconcileSaverGoalAchievement()
  writeNetWorthSnapshot()
  const sinceDate = getAppSetting('last_sync')
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  const txs = await fetchAllTransactions(apiToken, sinceDate, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  })
  withTransaction(() => {
    for (const tx of txs) upsertTransaction(tx)
  })
  progressCallback({ phase: 'held' })
  await resolveHeldTransactions(apiToken, new Set(txs.map((tx) => tx.id)))
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  progressCallback({ phase: 'tags' })
  const tags = await fetchTags(apiToken)
  for (const t of tags) upsertTag(t)
  setAppSetting('last_sync', new Date().toISOString())
  recalculateTrackers()
  progressCallback({ phase: 'done' })
}

/**
 * Full re-sync: same as performSync but fetches ALL transactions (no filter[since]).
 * Use when category changes or other edits made in Up Bank app need to be reflected.
 * Slower than incremental sync; intended for occasional use via Settings Re-sync.
 */
export async function performFullSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  advanceNextPaydayIfNeeded()
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  reconcileClosedAccounts(new Set(accounts.map((a) => a.id)))
  snapshotSaverBalances(accounts)
  reconcileSaverGoalAchievement()
  writeNetWorthSnapshot()
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    withTransaction(() => {
      for (const tx of txs) upsertTransaction(tx)
    })
  })
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  progressCallback({ phase: 'tags' })
  const tags = await fetchTags(apiToken)
  for (const t of tags) upsertTag(t)
  setAppSetting('last_sync', new Date().toISOString())
  recalculateTrackers()
  progressCallback({ phase: 'done' })
}

export const __test__ = {
  prevPaydayDate,
}
