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
  type UpAccount,
  type UpTransaction,
  type UpCategory,
  type UpTag,
} from '@/api/upBank'
/** Return today as YYYY-MM-DD for date-only comparison. */
function todayDateString(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

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
  const today = todayDateString()
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
      next = new Date(current)
      next.setUTCMonth(next.getUTCMonth() + 1)
      if (paydayDay >= 1 && paydayDay <= 28) next.setUTCDate(paydayDay)
    } else {
      break
    }
    nextPayday = next.toISOString().slice(0, 10)
    setAppSetting('next_payday', nextPayday)
  }
}

export type SyncProgress = {
  phase: 'accounts' | 'transactions' | 'categories' | 'tags' | 'done'
  fetched?: number
  hasMore?: boolean
}

/** User-visible status line for Settings / toast during full or incremental sync. */
export function formatSyncProgressMessage(p: SyncProgress): string {
  if (p.phase === 'done') return 'Complete.'
  if (p.phase === 'transactions' && p.fetched != null) {
    return `Fetched ${p.fetched} transactions…`
  }
  return `Syncing ${p.phase}…`
}

function run(sql: string, params: (string | number | null)[] = []): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(sql, params)
  schedulePersist()
}

function upsertAccount(acc: UpAccount): void {
  const a = acc.attributes
  const balance = a.balance?.valueInBaseUnits ?? 0
  const now = new Date().toISOString()
  const ownership = a.ownershipType != null ? String(a.ownershipType) : null
  run(
    `INSERT OR REPLACE INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type, synced_at, is_closed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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
      db.run(
        `UPDATE maybuys SET saver_account_id = NULL WHERE saver_account_id = ?`,
        [id]
      )
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
  if (!frequency) return null
  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1
  const from = new Date(nextPayday + 'T12:00:00Z')
  if (frequency === 'WEEKLY') {
    const prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 7)
    return prev.toISOString().slice(0, 10)
  }
  if (frequency === 'FORTNIGHTLY') {
    const prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 14)
    return prev.toISOString().slice(0, 10)
  }
  if (frequency === 'MONTHLY') {
    const prev = new Date(from)
    prev.setUTCMonth(prev.getUTCMonth() - 1)
    if (paydayDay >= 1 && paydayDay <= 28) prev.setUTCDate(paydayDay)
    return prev.toISOString().slice(0, 10)
  }
  return null
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
      changed = true
      if (freq === 'PAYDAY') {
        if (!nextPayday) continue
        const nextPaydayNorm =
          nextPayday.length > 10 ? nextPayday.slice(0, 10) : nextPayday
        const lastPaydayNorm = prevPaydayDate(nextPaydayNorm) ?? nextPaydayNorm
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
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
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
  const sinceDate = getAppSetting('last_sync')
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, sinceDate, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
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
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
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
