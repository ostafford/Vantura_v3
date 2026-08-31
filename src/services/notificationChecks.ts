/**
 * Notification check suite — runs on app open (after DB is ready).
 * Each check is idempotent: uses guard keys in app_settings to avoid
 * re-firing the same alert within the same day or budget period.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'
import type { Database } from 'sql.js'
import { formatMoney, localDateString } from '@/lib/format'
import {
  getNotificationsEnabled,
  getNotifTypeEnabled,
  getLargeTxThresholdCents,
  showNotification,
  addNotificationToHistory,
  hasCheckedToday,
  markCheckedToday,
  hasFiredForValue,
  markFiredForValue,
} from '@/lib/notifications'
import { getSpendableBalance, getSpendableAlert } from '@/services/balance'
import {
  getDueSoonCharges,
  daysUntilCharge,
  firstOccurrenceOnOrAfter,
  getLinkedLiabilityRepaymentCharges,
  type UpcomingChargeRow,
} from '@/services/upcoming'
import { getTrackersWithProgress } from '@/services/trackers'
import { getAccountsByTypes } from '@/services/accounts'
import { getManualAccountById } from '@/services/manualAccounts'

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * LIKE pattern matching a bills_due notification body for this exact charge
 * name. Anchored to the " (" that always follows the name in the body
 * (`"${name} ($${amount}) — ${dayText}"`), so a charge named "Gym" can't
 * match a stored notification for "Anytime Gym Membership" — a bare
 * `%name%` substring pattern would wrongly match both.
 */
function billNotificationPattern(chargeName: string): string {
  const escaped = chargeName.replace(/%/g, '\\%').replace(/_/g, '\\_')
  return `${escaped} ($%`
}

/**
 * Start of the settlement-detection window for a charge: 5 days before its
 * projected date, as a `YYYY-MM-DD` string. The 5-day lead allows for a payment
 * that clears early. Shared by `checkBillsSettled` and `checkLiabilityRepayments`.
 */
function settlementWindowStart(projectedDate: string): string {
  const d = new Date(projectedDate.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 5)
  return d.toISOString().slice(0, 10)
}

/**
 * True when a synced transaction matching `rawText` (a `raw_text` fingerprint)
 * has settled on or after `windowStartStr` — a real, non-transfer debit. The
 * single settlement test behind both the bill-settled notification clear and the
 * liability-repayment prompt, so the two always agree on what counts as "paid".
 */
function hasMatchingSettledDebit(
  db: Database,
  rawText: string,
  windowStartStr: string
): boolean {
  const res = db.exec(
    `SELECT id FROM transactions
     WHERE raw_text = ?
       AND amount < 0
       AND transfer_account_id IS NULL
       AND substr(COALESCE(settled_at, created_at), 1, 10) >= ?
     LIMIT 1`,
    [rawText, windowStartStr]
  )
  return !!res[0]?.values?.length
}

// ─── 0. Auto-clear settled bill notifications ────────────────────────────────

/**
 * For each upcoming charge that has a linked match_raw_text, detect whether a
 * matching settled debit has appeared in the transaction log since the charge
 * window opened. If settled, delete the corresponding bills_due notification
 * from history so the banner disappears automatically.
 *
 * Runs on every app open — queries are cheap and idempotent per charge cycle.
 */
function checkBillsSettled(): void {
  if (!getNotifTypeEnabled('bills')) return

  const db = getDb()
  if (!db) return

  // getDueSoonCharges() already applies firstOccurrenceOnOrAfter, so
  // next_charge_date on each item is the real upcoming occurrence date —
  // not the potentially stale stored value in the DB.
  const dueSoon = getDueSoonCharges().filter(
    (c) => c.match_raw_text != null && c.match_raw_text !== ''
  )

  for (const charge of dueSoon) {
    const {
      id: chargeId,
      name: chargeName,
      next_charge_date: nextChargeDate,
      match_raw_text: matchRawText,
    } = charge
    if (!matchRawText) continue // guaranteed by the filter above; narrows the type

    // Per-cycle guard keyed on projected date — advances each month automatically
    const guardKey = `notif_bill_settled_${chargeId}_${nextChargeDate}`
    if (hasFiredForValue(guardKey, '1')) continue

    if (
      !hasMatchingSettledDebit(
        db,
        matchRawText,
        settlementWindowStart(nextChargeDate)
      )
    )
      continue

    // Payment found — remove matching bills_due notifications for this charge
    db.run(
      `DELETE FROM notification_history
       WHERE type = 'bills_due' AND body LIKE ? ESCAPE '\\'`,
      [billNotificationPattern(chargeName)]
    )
    schedulePersist()
    markFiredForValue(guardKey, '1')
  }
}

// ─── 0b. Liability-repayment balance prompts (#19) ───────────────────────────

/**
 * For each LIABILITY_REPAYMENT charge that is BOTH linked to a manual liability
 * account AND has a settlement fingerprint, detect that cycle's payment the same
 * way `checkBillsSettled` does, then post a one-time actionable notification
 * prompting the user to reduce the linked account's balance by the *configured
 * charge amount*.
 *
 * The balance is deliberately NOT changed here — tapping the notification opens
 * the Net Worth quick-update modal (`/analytics/net-worth?repay=<id>`) prefilled
 * with the suggested new balance, so the user confirms (or edits) the figure.
 *
 * Gated on the `bills` toggle. Per-cycle guard `liab_repay_<id>_<projectedDate>`
 * fires once per cycle and advances with the projection. On the first run after
 * this feature ships, the current cycle of every existing linked charge is
 * seeded as already-handled (no retro-prompt for a payment the user has likely
 * already reconciled by hand) — tracked by the `liab_repay_backfilled` flag.
 */
function checkLiabilityRepayments(): void {
  if (!getNotifTypeEnabled('bills')) return

  const db = getDb()
  if (!db) return

  const charges = getLinkedLiabilityRepaymentCharges()
  if (charges.length === 0) return

  const today = localDateString()
  const backfilling = getAppSetting('liab_repay_backfilled') !== '1'

  for (const charge of charges) {
    if (!charge.match_raw_text || charge.linked_manual_account_id == null)
      continue

    const projected = firstOccurrenceOnOrAfter(
      charge.next_charge_date,
      charge.frequency,
      today,
      charge.cancel_by_date
    )
    if (!projected) continue

    const guardKey = `liab_repay_${charge.id}_${projected}`
    if (hasFiredForValue(guardKey, '1')) continue

    if (backfilling) {
      // Seed this cycle as handled; only the next cycle onward can prompt.
      markFiredForValue(guardKey, '1')
      continue
    }

    if (
      !hasMatchingSettledDebit(
        db,
        charge.match_raw_text,
        settlementWindowStart(projected)
      )
    )
      continue

    const account = getManualAccountById(charge.linked_manual_account_id)
    // Only prompt while the link is still valid. A stale link (account deleted,
    // or retyped to an asset) is guarded so it stops being re-checked every open.
    if (account && account.kind === 'liability') {
      const newBalanceCents = Math.max(0, account.balance_cents - charge.amount)
      const title = 'Liability payment detected'
      const body = `Payment to ${account.name} detected — tap to reduce its balance by $${formatMoney(charge.amount)} (to $${formatMoney(newBalanceCents)}).`
      addNotificationToHistory(
        'liability_repayment',
        title,
        body,
        `/analytics/net-worth?repay=${charge.id}`,
        'Update balance'
      )
      showNotification(title, body)
    }
    markFiredForValue(guardKey, '1')
  }

  if (backfilling) {
    setAppSetting('liab_repay_backfilled', '1')
    schedulePersist()
  }
}

// ─── 1. Bills due soon ───────────────────────────────────────────────────────

function checkBillsDue(): void {
  if (!getNotifTypeEnabled('bills')) return
  if (hasCheckedToday('notif_last_bills_date')) return

  const charges = getDueSoonCharges()
  if (charges.length === 0) return

  markCheckedToday('notif_last_bills_date')

  const db = getDb()

  for (const c of charges) {
    const days = daysUntilCharge(c.next_charge_date)
    const dayText =
      days <= 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days}d`
    const title =
      days <= 0
        ? 'Bill due today'
        : days === 1
          ? 'Bill due tomorrow'
          : 'Upcoming bill reminder'
    const body = `${c.name} ($${formatMoney(c.amount)}) — ${dayText}`

    // Replace any stale countdown row for this bill (e.g. yesterday's
    // "due in 2d") so it doesn't keep piling up alongside today's.
    if (db) {
      db.run(
        `DELETE FROM notification_history
         WHERE type = 'bills_due' AND body LIKE ? ESCAPE '\\'`,
        [billNotificationPattern(c.name)]
      )
    }

    addNotificationToHistory(
      'bills_due',
      title,
      body,
      '/?scroll=upcoming',
      'View Upcoming'
    )
    showNotification(title, body)
  }
}

// ─── 2. Spendable below threshold ────────────────────────────────────────────

function checkSpendableLow(): void {
  if (!getNotifTypeEnabled('spendable_low')) return
  if (hasCheckedToday('notif_last_spendable_low_date')) return

  const spendable = getSpendableBalance()

  // Single source of truth shared with the Dashboard card's red state: a dollar
  // floor OR a %-of-pay floor, never both (schema v38). A %-of-pay alert with no
  // pay amount set resolves to null here — dormant, same as the card.
  const alert = getSpendableAlert()
  if (
    alert == null ||
    alert.thresholdCents == null ||
    alert.thresholdCents <= 0
  )
    return
  const effectiveThreshold = alert.thresholdCents

  if (spendable >= effectiveThreshold) return

  markCheckedToday('notif_last_spendable_low_date')

  const body =
    spendable < 0
      ? `Your spendable balance is −$${formatMoney(Math.abs(spendable))} — you've overspent.`
      : `Your spendable balance is $${formatMoney(spendable)}, below your $${formatMoney(effectiveThreshold)} alert.`
  addNotificationToHistory(
    'spendable_low',
    'Spendable balance low',
    body,
    '/?scroll=spendable',
    'View Spendable'
  )
  showNotification('Spendable balance low', body)
}

// ─── 3. Tracker overspent ────────────────────────────────────────────────────

function checkTrackerOverspent(): void {
  if (!getNotifTypeEnabled('tracker_overspent')) return

  const trackers = getTrackersWithProgress()
  for (const t of trackers) {
    if (t.progress <= 100) continue
    // Fire at most once per budget period per tracker
    const guardKey = `notif_to_${t.id}`
    if (hasFiredForValue(guardKey, t.next_reset_date)) continue

    markFiredForValue(guardKey, t.next_reset_date)
    const overpct = Math.round(t.progress - 100)
    const body = `You've spent $${formatMoney(t.spent)} of your $${formatMoney(t.effectiveBudget)} budget — ${overpct}% over.`
    addNotificationToHistory(
      'tracker_overspent',
      `${t.name} is over budget`,
      body,
      `/analytics/trackers/${t.id}`,
      'View Tracker'
    )
    showNotification(`${t.name} is over budget`, body)
  }
}

// ─── 4. Tracker pace warning ─────────────────────────────────────────────────

function checkTrackerPace(): void {
  if (!getNotifTypeEnabled('tracker_pace')) return

  const trackers = getTrackersWithProgress()
  const today = localDateString()

  for (const t of trackers) {
    if (t.progress >= 100) continue // overspent check handles this
    if (t.effectiveBudget <= 0) continue

    // Calculate time elapsed in current period
    const periodStart = t.last_reset_date
    const periodEnd = t.next_reset_date
    const totalMs =
      new Date(periodEnd + 'T12:00:00Z').getTime() -
      new Date(periodStart + 'T12:00:00Z').getTime()
    const elapsedMs =
      new Date(today + 'T12:00:00Z').getTime() -
      new Date(periodStart + 'T12:00:00Z').getTime()

    if (totalMs <= 0) continue
    const timeElapsedPct = Math.max(0, Math.min(1, elapsedMs / totalMs))
    const timeRemainingPct = 1 - timeElapsedPct

    // Only warn if >20% of period is left (not near the end) and spending is >10% ahead of pace
    if (timeRemainingPct < 0.2) continue
    if (timeElapsedPct <= 0) continue
    const pacePct = t.progress / (timeElapsedPct * 100)
    if (pacePct < 1.1) continue

    const guardKey = `notif_tp_${t.id}`
    if (hasFiredForValue(guardKey, t.next_reset_date)) continue

    markFiredForValue(guardKey, t.next_reset_date)
    const daysLeft = t.daysLeft
    const projectedTotal =
      t.effectiveBudget > 0 ? Math.round(t.spent / timeElapsedPct) : t.spent
    const body = `At current pace you'll spend ~$${formatMoney(projectedTotal)} — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in the period.`
    addNotificationToHistory(
      'tracker_pace',
      `${t.name} is tracking over budget`,
      body,
      `/analytics/trackers/${t.id}`,
      'View Tracker'
    )
    showNotification(`${t.name} is tracking over budget`, body)
  }
}

// ─── 5. Payday landed ────────────────────────────────────────────────────────

/**
 * Runs a payday-candidate query (TRANSACTIONAL-account credits matching
 * whereSql) and returns the newest result whose settlement date is strictly
 * after lastFiredDate — i.e. the first one not already notified about.
 * whereSql is ANDed onto the shared account-type/table setup; params bind
 * in the order they appear in whereSql's placeholders.
 */
function findFirstUnseenCredit(
  db: Database,
  whereSql: string,
  params: (string | number)[],
  lastFiredDate: string | null
): { amount: number; date: string; description: string } | null {
  const stmt = db.prepare(
    `SELECT t.amount, COALESCE(t.settled_at, t.created_at) as tx_date, t.description
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.account_type = 'TRANSACTIONAL'
       ${whereSql}
     ORDER BY COALESCE(t.settled_at, t.created_at) DESC
     LIMIT 5`
  )
  stmt.bind(params)
  let result: { amount: number; date: string; description: string } | null =
    null
  while (stmt.step()) {
    const r = stmt.get() as [number, string, string]
    const txDateStr = r[1].slice(0, 10)
    if (lastFiredDate && txDateStr <= lastFiredDate) continue
    result = { amount: r[0], date: txDateStr, description: r[2] }
    break
  }
  stmt.free()
  return result
}

function checkPaydayLanded(): void {
  if (!getNotifTypeEnabled('payday')) return

  const db = getDb()
  if (!db) return

  const lastFiredDate = getAppSetting('notif_last_payday_date')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 2)
  const cutoffIso = cutoff.toISOString()

  const paydayRawText = getAppSetting('payday_raw_text')

  let detected: { amount: number; date: string; description: string } | null

  if (paydayRawText) {
    // Precise match: the user identified their salary source in Settings.
    // Match on raw_text (the bank's internal reference) which is stable across pays.
    detected = findFirstUnseenCredit(
      db,
      'AND t.raw_text = ? AND t.amount > 0 AND COALESCE(t.settled_at, t.created_at) >= ?',
      [paydayRawText, cutoffIso],
      lastFiredDate
    )
  } else {
    // Fallback: no salary source identified yet — use amount heuristic.
    // Requires pay_amount_cents to be set.
    const payAmtRaw = getAppSetting('pay_amount_cents')
    if (!payAmtRaw) return
    const payAmt = parseInt(payAmtRaw, 10)
    if (Number.isNaN(payAmt) || payAmt <= 0) return

    const minAmt = Math.round(payAmt * 0.8)
    detected = findFirstUnseenCredit(
      db,
      'AND t.amount >= ? AND t.transfer_account_id IS NULL AND COALESCE(t.settled_at, t.created_at) >= ?',
      [minAmt, cutoffIso],
      lastFiredDate
    )
  }

  if (!detected) return

  setAppSetting('notif_last_payday_date', detected.date)
  const spendable = getSpendableBalance()
  const body = `$${formatMoney(detected.amount)} received. Spendable is now $${formatMoney(spendable)}.`
  addNotificationToHistory(
    'payday',
    'Payday landed',
    body,
    '/',
    'View Dashboard'
  )
  showNotification('Payday landed', body)
}

// ─── 6. Large unexpected transaction ─────────────────────────────────────────

function checkLargeTransaction(): void {
  if (!getNotifTypeEnabled('large_tx')) return

  const db = getDb()
  if (!db) return

  const thresholdCents = getLargeTxThresholdCents()
  const lastCheckIso = getAppSetting('notif_large_tx_last_check_iso')
  // Transaction ids already notified at exactly lastCheckIso — settlement
  // timestamps can collide (same second/millisecond) between two distinct
  // transactions, so the date checkpoint alone can't disambiguate "already
  // seen" from "new" when they share a timestamp.
  const lastCheckIds = (getAppSetting('notif_large_tx_last_check_ids') ?? '')
    .split(',')
    .filter(Boolean)

  const params: (string | number)[] = [thresholdCents]
  let dateSql = ''
  if (lastCheckIso) {
    if (lastCheckIds.length > 0) {
      const placeholders = lastCheckIds.map(() => '?').join(',')
      dateSql = `AND (COALESCE(t.settled_at, t.created_at) > ?
        OR (COALESCE(t.settled_at, t.created_at) = ? AND t.id NOT IN (${placeholders})))`
      params.push(lastCheckIso, lastCheckIso, ...lastCheckIds)
    } else {
      dateSql = `AND COALESCE(t.settled_at, t.created_at) > ?`
      params.push(lastCheckIso)
    }
  } else {
    // First run: look back 24h only
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    dateSql = `AND COALESCE(t.settled_at, t.created_at) > ?`
    params.push(yesterday.toISOString())
  }

  const stmt = db.prepare(
    `SELECT t.id, t.description, t.amount, COALESCE(t.settled_at, t.created_at) as tx_date
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.account_type = 'TRANSACTIONAL'
       AND t.amount <= ?
       AND t.transfer_account_id IS NULL
       AND t.is_round_up = 0
       ${dateSql}
     ORDER BY COALESCE(t.settled_at, t.created_at) DESC`
  )
  // thresholdCents is positive; we want amount <= -thresholdCents
  params[0] = -thresholdCents
  stmt.bind(params)

  const found: {
    id: string
    description: string
    amount: number
    date: string
  }[] = []
  while (stmt.step()) {
    const r = stmt.get() as [string, string, number, string]
    found.push({ id: r[0], description: r[1], amount: r[2], date: r[3] })
  }
  stmt.free()

  if (found.length === 0) return

  // Advance the checkpoint to the latest transaction date actually seen, not to
  // "now" — transactions can settle well after they occurred, so anchoring to
  // wall-clock time would permanently skip any large transaction that syncs in
  // after this point (its settled_at is always in the past relative to "now").
  let maxDate = found[0].date
  for (const t of found) if (t.date > maxDate) maxDate = t.date
  // Accumulate ids at maxDate rather than overwrite: if maxDate hasn't moved
  // (all new matches share the previous timestamp), previously-seen ids at
  // that same instant must stay excluded too.
  const idsAtMaxDate = new Set(maxDate === lastCheckIso ? lastCheckIds : [])
  for (const t of found) if (t.date === maxDate) idsAtMaxDate.add(t.id)
  setAppSetting('notif_large_tx_last_check_iso', maxDate)
  setAppSetting(
    'notif_large_tx_last_check_ids',
    Array.from(idsAtMaxDate).join(',')
  )

  if (found.length === 1) {
    const tx = found[0]
    const body = `$${formatMoney(Math.abs(tx.amount))} at ${tx.description}`
    addNotificationToHistory(
      'large_tx',
      'Large transaction',
      body,
      '/transactions',
      'View Transactions'
    )
    showNotification('Large transaction', body)
  } else {
    const total = found.reduce((s, t) => s + Math.abs(t.amount), 0)
    const body = `${found.length} transactions totalling $${formatMoney(total)}`
    addNotificationToHistory(
      'large_tx',
      'Large transactions',
      body,
      '/transactions',
      'View Transactions'
    )
    showNotification('Large transactions', body)
  }
}

// ─── 7. Saver goal milestones ─────────────────────────────────────────────────

function checkSaverMilestones(): void {
  if (!getNotifTypeEnabled('saver_milestone')) return

  const savers = getAccountsByTypes(['SAVER'])
  for (const saver of savers) {
    if (!saver.target_amount_cents || saver.target_amount_cents <= 0) continue
    const pct = (saver.balance / saver.target_amount_cents) * 100

    for (const milestone of [100, 75, 50] as const) {
      if (pct < milestone) continue
      const guardKey = `notif_sm_${saver.id}_${milestone}`
      // Store the target at time of firing so we re-fire if the goal changes
      if (hasFiredForValue(guardKey, String(saver.target_amount_cents)))
        continue

      // Mark this and every lower milestone as covered too, so a balance
      // that jumps straight past 50%/75% to 100% only ever produces a
      // single "highest milestone reached" notification, not one per tier.
      for (const m of [50, 75, 100] as const) {
        if (m <= milestone) {
          markFiredForValue(
            `notif_sm_${saver.id}_${m}`,
            String(saver.target_amount_cents)
          )
        }
      }
      const milestoneLabel =
        milestone === 100 ? 'Goal reached' : `${milestone}% milestone`
      const body =
        milestone === 100
          ? `${saver.display_name} has reached its $${formatMoney(saver.target_amount_cents)} goal!`
          : `${saver.display_name} is ${milestone}% of the way to $${formatMoney(saver.target_amount_cents)}.`
      addNotificationToHistory(
        'saver_milestone',
        `${saver.display_name}: ${milestoneLabel}`,
        body,
        `/analytics/savers/${saver.id}`,
        'View Saver'
      )
      showNotification(`${saver.display_name}: ${milestoneLabel}`, body)
      break // only fire the highest new milestone per run
    }
  }
}

// ─── 8. Sync stale ───────────────────────────────────────────────────────────

function checkSyncStale(): void {
  if (!getNotifTypeEnabled('sync_stale')) return
  if (hasCheckedToday('notif_last_sync_stale_date')) return

  const lastSyncIso = getAppSetting('last_sync')
  if (!lastSyncIso) return

  const lastSync = new Date(lastSyncIso)
  const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
  if (hoursSince < 24) return

  markCheckedToday('notif_last_sync_stale_date')
  const hoursRounded = Math.round(hoursSince)
  const body = `Last synced ${hoursRounded} hours ago. Open Vantura and tap Sync to refresh your data.`
  addNotificationToHistory(
    'sync_stale',
    'Data may be out of date',
    body,
    null,
    null
  )
  showNotification('Data may be out of date', body)
}

// ─── 9. Possible payday suggestion ───────────────────────────────────────────

/**
 * When no payday source has been identified, look for a recurring large credit
 * that just appeared after a sync and suggest the user set it as their pay source.
 *
 * Guard: fires once per unique payee (stored as notif_possible_payday_suggested_for).
 * Won't re-suggest the same merchant unless the user clears their payday settings.
 */
function checkPossiblePayday(): void {
  if (!getNotifTypeEnabled('possible_payday')) return
  // Only runs when the user hasn't identified their salary source yet
  if (getAppSetting('payday_raw_text')) return

  const db = getDb()
  if (!db) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 2)
  const cutoffIso = cutoff.toISOString()

  // Find the largest qualifying credit in the last 2 days that has appeared
  // at least twice historically (confirming it's a recurring payment, not a one-off).
  // Threshold: $500 AUD minimum — below that it's unlikely to be a salary payment.
  const MIN_CENTS = 50000
  const stmt = db.prepare(
    `SELECT
       t.description,
       COALESCE(t.raw_text, t.description) AS match_key,
       t.amount
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.account_type = 'TRANSACTIONAL'
       AND t.amount >= ?
       AND t.transfer_account_id IS NULL
       AND t.is_round_up = 0
       AND COALESCE(t.settled_at, t.created_at) >= ?
       AND (
         SELECT COUNT(*)
         FROM transactions t2
         WHERE COALESCE(t2.raw_text, t2.description) = COALESCE(t.raw_text, t.description)
           AND t2.amount > 0
           AND t2.transfer_account_id IS NULL
       ) >= 2
     ORDER BY t.amount DESC
     LIMIT 1`
  )
  stmt.bind([MIN_CENTS, cutoffIso])

  let candidate: {
    description: string
    matchKey: string
    amount: number
  } | null = null
  if (stmt.step()) {
    const r = stmt.get() as [string, string, number]
    candidate = { description: r[0], matchKey: r[1], amount: r[2] }
  }
  stmt.free()

  if (!candidate) return

  // Don't re-suggest the same payee we've already flagged
  if (
    hasFiredForValue('notif_possible_payday_suggested_for', candidate.matchKey)
  )
    return

  markFiredForValue('notif_possible_payday_suggested_for', candidate.matchKey)

  const body = `$${formatMoney(candidate.amount)} received from "${candidate.description}" — this looks like a recurring payment. Set it as your pay source so Vantura can track your spending cycle.`
  addNotificationToHistory(
    'possible_payday',
    'Possible payday detected',
    body,
    '/settings#payday',
    'Set up payday'
  )
  showNotification('Possible payday detected', body)
}

// ─── On-demand: ensure bills_due sidebar entries exist ───────────────────────

/**
 * Guarantee a bills_due notification exists in history for each supplied charge.
 * Called when the user dismisses the dashboard banner so the charges remain
 * visible in the sidebar even though the banner is hidden for the day.
 *
 * Deduplicates: replaces any existing bills_due entry for the same charge
 * (whether created today by checkBillsDue or on a prior day) so only one
 * countdown row per bill ever exists in history.
 */
export function ensureBillsDueNotifications(
  charges: UpcomingChargeRow[]
): void {
  const db = getDb()
  if (!db) return
  if (charges.length === 0) return

  for (const c of charges) {
    const pattern = billNotificationPattern(c.name)
    const existing = db.exec(
      `SELECT 1 FROM notification_history
       WHERE type = 'bills_due'
         AND body LIKE ? ESCAPE '\\'
         AND substr(created_at, 1, 10) = ?
       LIMIT 1`,
      [pattern, localDateString()]
    )
    if (existing[0]?.values?.length) continue

    db.run(
      `DELETE FROM notification_history
       WHERE type = 'bills_due' AND body LIKE ? ESCAPE '\\'`,
      [pattern]
    )

    const days = daysUntilCharge(c.next_charge_date)
    const dayText =
      days <= 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days}d`
    const title =
      days <= 0
        ? 'Bill due today'
        : days === 1
          ? 'Bill due tomorrow'
          : 'Upcoming bill reminder'
    const body = `${c.name} ($${formatMoney(c.amount)}) — ${dayText}`
    addNotificationToHistory(
      'bills_due',
      title,
      body,
      '/?scroll=upcoming',
      'View Upcoming'
    )
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all enabled notification checks. Call once on app open after data loads.
 * Safe to call multiple times — each check is individually guarded.
 */
export function runNotificationChecks(): void {
  if (!getNotificationsEnabled()) return

  checkBillsSettled()
  checkLiabilityRepayments()
  checkBillsDue()
  checkSpendableLow()
  checkTrackerOverspent()
  checkTrackerPace()
  checkPaydayLanded()
  checkPossiblePayday()
  checkLargeTransaction()
  checkSaverMilestones()
  checkSyncStale()
}

export const __test__ = {
  checkPaydayLanded,
  findFirstUnseenCredit,
  checkLiabilityRepayments,
}
