/**
 * #20 — detect recurring debit patterns in sync history and offer them as
 * upcoming-charge *suggestions*. On demand, suggest-only — never auto-created
 * (ADR-0016). Mirrors `paydayDetection.ts` (group by fingerprint → median
 * interval → classify frequency), tightened for the noisier debit side.
 */
import { getDb, schedulePersist } from '@/db'
import { localDateString } from '@/lib/format'
import { nextChargeDateFromAnchor } from './upcoming'

export interface RecurringChargeSuggestion {
  /** Stable grouping key — `raw_text` when present, else `description`. Dismissals key on this. */
  key: string
  name: string
  amountCents: number
  frequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  /** Next projected occurrence on or after today (`YYYY-MM-DD`). */
  nextChargeDate: string
  categoryId: string | null
  /** The group's `raw_text` if non-empty — carried onto the created charge for settlement auto-clear. */
  matchRawText: string | null
  occurrences: number
  /** Matched dates ascending, shown to the user as evidence. */
  sampleDates: string[]
}

type Freq = RecurringChargeSuggestion['frequency']

/** [minDays, maxDays] the median interval must land in for each frequency. */
const FREQ_BANDS: Record<Freq, readonly [number, number]> = {
  WEEKLY: [6, 8],
  FORTNIGHTLY: [13, 15],
  MONTHLY: [25, 35],
  QUARTERLY: [85, 95],
  YEARLY: [350, 380],
}

const MIN_OCCURRENCES = 3
const AMOUNT_TOLERANCE = 0.2 // ±20% of the median
const MIN_GAPS_IN_BAND = 0.7 // ≥70% of consecutive gaps must fit the band
const STILL_LIVE_INTERVAL_MULTIPLE = 1.5 // last occurrence within 1.5× the interval
const LOOKBACK_DAYS = 1200 // ~3.3 years — enough for 3 YEARLY occurrences

function medianOf(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() -
      new Date(a + 'T12:00:00Z').getTime()) /
      86400000
  )
}

function classifyFrequency(medianInterval: number): Freq | null {
  for (const [freq, [lo, hi]] of Object.entries(FREQ_BANDS) as [
    Freq,
    readonly [number, number],
  ][]) {
    if (medianInterval >= lo && medianInterval <= hi) return freq
  }
  return null
}

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

interface DebitRow {
  key: string
  raw_text: string | null
  description: string
  amount: number // positive cents
  date: string // YYYY-MM-DD
  category_id: string | null
}

/**
 * Recurring-charge suggestions from ~3 years of settled Up debits. Excludes
 * anything already covered by an existing upcoming charge (by `match_raw_text`
 * or a normalised name match) or previously dismissed.
 */
export function detectRecurringCharges(): RecurringChargeSuggestion[] {
  const db = getDb()
  if (!db) return []

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const today = localDateString()

  const stmt = db.prepare(
    `SELECT
       COALESCE(NULLIF(raw_text, ''), description) AS grp,
       raw_text,
       description,
       ABS(amount) AS amt,
       substr(COALESCE(settled_at, created_at), 1, 10) AS dt,
       category_id
     FROM transactions
     WHERE amount < 0
       AND transfer_account_id IS NULL
       AND round_up_parent_id IS NULL
       AND source = 'up'
       AND substr(COALESCE(settled_at, created_at), 1, 10) >= ?
     ORDER BY grp ASC, dt ASC`
  )
  stmt.bind([cutoff])
  const groups = new Map<string, DebitRow[]>()
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string | null,
      string,
      number,
      string,
      string | null,
    ]
    if (!r[0] || !r[4]) continue
    const row: DebitRow = {
      key: r[0],
      raw_text: r[1] && r[1] !== '' ? r[1] : null,
      description: r[2],
      amount: r[3],
      date: r[4],
      category_id: r[5] ?? null,
    }
    const arr = groups.get(row.key)
    if (arr) arr.push(row)
    else groups.set(row.key, [row])
  }
  stmt.free()

  const dismissed = getDismissedSuggestionKeys()
  const { rawTexts: existingRawTexts, names: existingNames } =
    readExistingChargeFingerprints(db)

  const suggestions: RecurringChargeSuggestion[] = []
  for (const [key, rows] of groups) {
    if (dismissed.has(key)) continue

    const rawText = rows.find((r) => r.raw_text)?.raw_text ?? null
    if (rawText && existingRawTexts.has(rawText)) continue
    if (existingNames.has(normaliseName(rows[0].description))) continue

    // One occurrence per day (a repeated same-day debit is one bill).
    const dates = [...new Set(rows.map((r) => r.date))].sort()
    if (dates.length < MIN_OCCURRENCES) continue

    // Amount consistency — every occurrence within ±20% of the median.
    const amounts = rows.map((r) => r.amount)
    const medAmount = medianOf(amounts)
    if (medAmount <= 0) continue
    if (
      amounts.some(
        (a) => Math.abs(a - medAmount) > AMOUNT_TOLERANCE * medAmount
      )
    ) {
      continue
    }

    // Interval → frequency.
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
    const medInterval = medianOf(gaps)
    const frequency = classifyFrequency(medInterval)
    if (!frequency) continue
    const [lo, hi] = FREQ_BANDS[frequency]
    const inBand = gaps.filter((g) => g >= lo && g <= hi).length
    if (inBand / gaps.length < MIN_GAPS_IN_BAND) continue

    // Still live — the most recent occurrence isn't stale.
    if (
      daysBetween(dates[dates.length - 1], today) >
      medInterval * STILL_LIVE_INTERVAL_MULTIPLE
    ) {
      continue
    }

    // Most common category in the group.
    const catCounts = new Map<string, number>()
    for (const r of rows) {
      if (r.category_id)
        catCounts.set(r.category_id, (catCounts.get(r.category_id) ?? 0) + 1)
    }
    const categoryId =
      [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    suggestions.push({
      key,
      name: rows[rows.length - 1].description,
      amountCents: Math.round(medAmount),
      frequency,
      nextChargeDate: nextChargeDateFromAnchor(
        dates[dates.length - 1],
        frequency,
        today
      ),
      categoryId,
      matchRawText: rawText,
      occurrences: dates.length,
      sampleDates: dates,
    })
  }

  return suggestions.sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      (b.sampleDates[b.sampleDates.length - 1] <
      a.sampleDates[a.sampleDates.length - 1]
        ? -1
        : 1)
  )
}

function readExistingChargeFingerprints(
  db: NonNullable<ReturnType<typeof getDb>>
): { rawTexts: Set<string>; names: Set<string> } {
  const rawTexts = new Set<string>()
  const names = new Set<string>()
  const res = db.exec(`SELECT name, match_raw_text FROM upcoming_charges`)
  for (const row of res[0]?.values ?? []) {
    names.add(normaliseName(String(row[0])))
    if (row[1]) rawTexts.add(String(row[1]))
  }
  return { rawTexts, names }
}

/** Grouping keys the user marked "not recurring". */
export function getDismissedSuggestionKeys(): Set<string> {
  const db = getDb()
  const out = new Set<string>()
  if (!db) return out
  const res = db.exec(`SELECT suggestion_key FROM dismissed_charge_suggestions`)
  for (const row of res[0]?.values ?? []) out.add(String(row[0]))
  return out
}

export function dismissChargeSuggestion(key: string): void {
  const db = getDb()
  if (!db || !key) return
  db.run(
    `INSERT OR IGNORE INTO dismissed_charge_suggestions (suggestion_key, dismissed_at)
     VALUES (?, ?)`,
    [key, new Date().toISOString()]
  )
  schedulePersist()
}

export function undismissChargeSuggestion(key: string): void {
  const db = getDb()
  if (!db) return
  db.run(`DELETE FROM dismissed_charge_suggestions WHERE suggestion_key = ?`, [
    key,
  ])
  schedulePersist()
}
