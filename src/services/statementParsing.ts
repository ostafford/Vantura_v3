/**
 * Generic credit-card statement parsing: PDF (via pdfjs-dist), CSV, and OFX.
 *
 * Design: one shared extraction engine rather than a parser per bank. PDF
 * parsing matches a generic transaction-row shape (date, [date], [card],
 * description, amount, [credit marker], [balance]) that's common across most
 * AU bank statements. A `statement_import_profiles` row stores small
 * per-bank parameters (which date column to prefer, the credit marker text,
 * balance label wording) learned from the first successful import of that
 * bank — not a bespoke parser. See getDocument usage below for the PDF path.
 */

import { getDb, schedulePersist } from '@/db'

export type StatementFormat = 'PDF' | 'CSV' | 'OFX'

export interface ParsedStatementRow {
  /** ISO date string, local-noon-anchored to avoid timezone boundary issues. */
  date: string
  description: string
  /** Negative = spend/debit, positive = payment/credit (matches Up's sign convention). */
  amountCents: number
  balanceCents: number | null
}

export interface ParsedStatement {
  rows: ParsedStatementRow[]
  detectedBankName: string | null
  openingBalanceCents: number | null
  closingBalanceCents: number | null
  /** Set when the CSV guardrail (see parseCsvStatement) determines this file
   * isn't a single credit-card statement — e.g. Vantura's own multi-account
   * export was uploaded by mistake. Undefined for PDF/OFX and for CSVs that
   * pass the check; when set, `rows` is always empty and the caller should
   * surface this message instead of attempting a preview. */
  rejectionReason?: string
}

export interface StatementImportProfileRow {
  id: number
  bank_name_pattern: string
  format: StatementFormat
  date_field_preference: 'processed' | 'transaction'
  credit_marker: string
  opening_balance_label: string
  closing_balance_label: string
  date_format: string
  created_at: string
  last_used_at: string | null
}

function parseMoneyToCents(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, '')
  return Math.round(parseFloat(cleaned) * 100)
}

function parseDateToIso(raw: string, dateFormat: string): string {
  // dateFormat is currently always 'DD/MM/YYYY' (AU convention); kept as a
  // profile field so a US-style MM/DD/YYYY profile can be added later.
  const parts = raw.split('/')
  if (parts.length !== 3) return raw
  const [a, b] = parts
  let year = parts[2]
  if (year.length === 2) year = `20${year}`
  const [day, month] = dateFormat === 'MM/DD/YYYY' ? [b, a] : [a, b]
  const mm = month.padStart(2, '0')
  const dd = day.padStart(2, '0')
  return `${year}-${mm}-${dd}T12:00:00.000Z`
}

// ─── PDF ──────────────────────────────────────────────────────────────────

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

/** Loaded on first use rather than imported statically, so parsing a CSV or
 * OFX file (and unit tests that only exercise those paths) never pulls in
 * pdfjs-dist or its worker — only an actual PDF import pays that cost. On
 * failure the cached promise is cleared so a later retry (e.g. after a flaky
 * chunk load) issues a fresh import instead of permanently replaying the
 * same rejection. */
function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      try {
        const lib = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url'))
          .default
        lib.GlobalWorkerOptions.workerSrc = workerUrl
        return lib
      } catch (err) {
        pdfjsLibPromise = null
        throw err
      }
    })()
  }
  return pdfjsLibPromise
}

/**
 * Reconstructs readable lines from a PDF's absolutely-positioned text items by
 * grouping items sharing a y-coordinate, then ordering by x. Validated against
 * a real ANZ statement — faithfully reproduces the visual row order including
 * multi-column tables.
 */
async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data }).promise
  const lines: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const byY = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y)!.push({ x: item.transform[4], str: item.str })
    }
    const sortedYs = [...byY.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const lineItems = byY.get(y)!.sort((a, b) => a.x - b.x)
      const lineText = lineItems
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (lineText) lines.push(lineText)
    }
  }
  return lines
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ROW_DATE_DESC_AMOUNT = String.raw`^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:(\d{1,2}\/\d{1,2}\/\d{2,4})\s+)?(?:(\d{3,4})\s+)?(.+?)\s+\$?([\d,]+\.\d{2})\s*`

/**
 * The credit-flag capture group must be built from the profile's actual
 * `credit_marker` text (escaped for regex use) — hardcoding it to a fixed
 * literal like "CR" would make a saved profile's credit_marker field
 * silently unable to ever change sign-detection behavior.
 */
function buildRowRegexes(creditMarker: string): {
  withBalance: RegExp
  noBalance: RegExp
} {
  const marker = escapeRegExp(creditMarker)
  return {
    withBalance: new RegExp(
      ROW_DATE_DESC_AMOUNT + `(${marker})?\\s+\\$?([\\d,]+\\.\\d{2})\\s*$`
    ),
    noBalance: new RegExp(ROW_DATE_DESC_AMOUNT + `(${marker})?\\s*$`),
  }
}

/** Short, mostly-uppercase, digit-free line near the top of the statement — the bank/product name. */
function detectBankName(lines: string[]): string | null {
  for (const line of lines.slice(0, 8)) {
    const trimmed = line.trim()
    if (trimmed.length < 3 || trimmed.length > 40) continue
    if (/\d/.test(trimmed)) continue
    const letters = trimmed.replace(/[^A-Za-z]/g, '')
    if (letters.length === 0) continue
    const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length
    if (upperRatio > 0.9) return trimmed
  }
  return null
}

const MONEY_RE = /\$?([\d,]+\.\d{2})/

/**
 * Finds a balance label and its dollar value. Some statement layouts put them
 * on the same line ("Opening Balance $10,206.98"); others (e.g. ANZ's boxed
 * summary) render the label and value as separate lines — so if the label's
 * own line has no amount, check the next couple of lines too.
 */
function extractBalanceLabel(lines: string[], label: string): number | null {
  const labelRe = new RegExp(escapeRegExp(label), 'i')
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const m = lines[j].match(MONEY_RE)
      if (m) return parseMoneyToCents(m[1])
    }
  }
  return null
}

export async function parsePdfStatement(
  file: File,
  profile?: StatementImportProfileRow | null
): Promise<ParsedStatement> {
  const lines = await extractPdfLines(file)
  const dateFormat = profile?.date_format ?? 'DD/MM/YYYY'
  const datePreference = profile?.date_field_preference ?? 'transaction'
  const creditMarker = profile?.credit_marker ?? 'CR'
  const openingLabel = profile?.opening_balance_label ?? 'Opening Balance'
  const closingLabel = profile?.closing_balance_label ?? 'Closing Balance'
  const { withBalance, noBalance } = buildRowRegexes(creditMarker)

  const rows: ParsedStatementRow[] = []
  for (const line of lines) {
    const m = line.match(withBalance) ?? line.match(noBalance)
    if (!m) continue
    const [, date1, date2, , desc, amountRaw, creditFlag, balanceRaw] = m
    const dateRaw = datePreference === 'transaction' ? (date2 ?? date1) : date1
    const isCredit = creditFlag === creditMarker
    const amountCents = parseMoneyToCents(amountRaw)
    rows.push({
      date: parseDateToIso(dateRaw, dateFormat),
      description: desc.trim(),
      amountCents: isCredit ? amountCents : -amountCents,
      balanceCents: balanceRaw != null ? parseMoneyToCents(balanceRaw) : null,
    })
  }

  return {
    rows,
    detectedBankName: detectBankName(lines),
    openingBalanceCents: extractBalanceLabel(lines, openingLabel),
    closingBalanceCents: extractBalanceLabel(lines, closingLabel),
  }
}

// ─── CSV ──────────────────────────────────────────────────────────────────

const DATE_HEADER_RE = /^date/i
const DESCRIPTION_HEADER_RE = /^(description|details|merchant|narrative)/i
// A single signed "Amount"/"Value" column already carries the correct sign.
// "Debit" is intentionally NOT included here — split Debit/Credit layouts
// (common in bank CSV exports) use separate unsigned columns instead, and
// need their own sign applied (see DEBIT_HEADER_RE/CREDIT_HEADER_RE below).
const AMOUNT_HEADER_RE = /^(amount|value)/i
const DEBIT_HEADER_RE = /^debit/i
const CREDIT_HEADER_RE = /^credit/i
const BALANCE_HEADER_RE = /^balance/i
const CATEGORY_HEADER_RE = /^category/i
const TAGS_HEADER_RE = /^tags/i
// Exact match only ("Account" / "Account Name") — deliberately NOT a prefix
// match. Some real bank exports have an "Account Number" or "Account Type"
// column (e.g. Purchase/Cash Advance/Interest per row); those are a
// different account-holding-account or transaction property, not "which
// account" this row belongs to, and would false-positive the multi-account
// guardrail below if matched as a prefix.
const ACCOUNT_HEADER_RE = /^account(\s*name)?$/i

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim().replace(/^"|"$/g, ''))
}

export function parseCsvStatement(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return {
      rows: [],
      detectedBankName: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
    }
  }
  const header = splitCsvLine(lines[0])
  const dateIdx = header.findIndex((h) => DATE_HEADER_RE.test(h))
  const descIdx = header.findIndex((h) => DESCRIPTION_HEADER_RE.test(h))
  const amountIdx = header.findIndex((h) => AMOUNT_HEADER_RE.test(h))
  const debitIdx = header.findIndex((h) => DEBIT_HEADER_RE.test(h))
  const creditIdx = header.findIndex((h) => CREDIT_HEADER_RE.test(h))
  const balanceIdx = header.findIndex((h) => BALANCE_HEADER_RE.test(h))
  const accountIdx = header.findIndex((h) => ACCOUNT_HEADER_RE.test(h))

  // Guardrail: Vantura's own transaction export always carries both a
  // Category and a Tags column together — no AU bank CSV export does. This
  // catches the file-mix-up case (re-uploading Vantura's own export instead
  // of a bank statement) before a single row is parsed.
  const looksLikeOwnExport =
    header.some((h) => CATEGORY_HEADER_RE.test(h)) &&
    header.some((h) => TAGS_HEADER_RE.test(h))
  if (looksLikeOwnExport) {
    return {
      rows: [],
      detectedBankName: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
      rejectionReason:
        'This looks like a Vantura transaction export, not a bank statement — upload the CSV your bank provides for this card instead.',
    }
  }

  const rows: ParsedStatementRow[] = []
  const hasAmountColumn = amountIdx !== -1
  const hasSplitColumns = debitIdx !== -1 || creditIdx !== -1
  if (
    dateIdx === -1 ||
    descIdx === -1 ||
    (!hasAmountColumn && !hasSplitColumns)
  ) {
    return {
      rows,
      detectedBankName: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
    }
  }

  // Keyed by lowercase so "Chase Sapphire" and "chase sapphire" (a casing
  // quirk, not a different account) don't falsely count as two accounts;
  // the displayed message uses whichever casing appeared first.
  const accountValues = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const dateRaw = cols[dateIdx]
    if (!dateRaw) continue

    if (accountIdx !== -1) {
      const accountRaw = cols[accountIdx]?.trim()
      if (accountRaw && !accountValues.has(accountRaw.toLowerCase())) {
        accountValues.set(accountRaw.toLowerCase(), accountRaw)
      }
    }

    let amountCents: number | null = null
    if (hasAmountColumn) {
      const amountRaw = cols[amountIdx]?.replace(/[$,]/g, '')
      const amount = amountRaw ? parseFloat(amountRaw) : NaN
      if (!Number.isNaN(amount)) amountCents = Math.round(amount * 100)
    }
    // Split Debit/Credit layout: unsigned columns, at most one populated per
    // row. Debit = spend (negative); Credit = payment/refund (positive).
    if (amountCents === null && hasSplitColumns) {
      const debitRaw = debitIdx !== -1 ? cols[debitIdx]?.trim() : ''
      const creditRaw = creditIdx !== -1 ? cols[creditIdx]?.trim() : ''
      if (debitRaw) {
        amountCents = -parseMoneyToCents(debitRaw)
      } else if (creditRaw) {
        amountCents = parseMoneyToCents(creditRaw)
      }
    }
    if (amountCents === null) continue

    rows.push({
      date: parseDateToIso(dateRaw, 'DD/MM/YYYY'),
      description: (cols[descIdx] ?? '').trim(),
      amountCents,
      balanceCents:
        balanceIdx !== -1 && cols[balanceIdx]
          ? parseMoneyToCents(cols[balanceIdx])
          : null,
    })
  }

  // Guardrail: a genuine single-card statement has no reason to carry more
  // than one account name. Two-plus distinct values means this file mixes
  // transactions from multiple accounts (e.g. a full multi-account export).
  if (accountValues.size > 1) {
    return {
      rows: [],
      detectedBankName: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
      rejectionReason: `This file contains transactions from multiple accounts (${[...accountValues.values()].join(', ')}) — a credit card statement should only contain one account's transactions.`,
    }
  }

  return {
    rows,
    detectedBankName: null,
    openingBalanceCents: rows[0]?.balanceCents ?? null,
    closingBalanceCents: rows[rows.length - 1]?.balanceCents ?? null,
  }
}

// ─── OFX ──────────────────────────────────────────────────────────────────

function ofxTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^\r\n<]*)`, 'i'))
  return m ? m[1].trim() : null
}

function parseOfxDate(raw: string): string {
  // OFX DTPOSTED is YYYYMMDD[HHMMSS][.xxx][tz]
  const y = raw.slice(0, 4)
  const m = raw.slice(4, 6)
  const d = raw.slice(6, 8)
  return `${y}-${m}-${d}T12:00:00.000Z`
}

export function parseOfxStatement(text: string): ParsedStatement {
  const rows: ParsedStatementRow[] = []
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  for (const block of blocks) {
    const dtposted = ofxTag(block, 'DTPOSTED')
    const trnamt = ofxTag(block, 'TRNAMT')
    const name = ofxTag(block, 'NAME') ?? ofxTag(block, 'MEMO') ?? ''
    if (!dtposted || !trnamt) continue
    const amount = parseFloat(trnamt)
    if (Number.isNaN(amount)) continue
    rows.push({
      date: parseOfxDate(dtposted),
      description: name.trim(),
      amountCents: Math.round(amount * 100),
      balanceCents: null,
    })
  }

  const ledgerMatch = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^\r\n<]*)/i)
  const closingBalanceCents = ledgerMatch
    ? Math.round(parseFloat(ledgerMatch[1]) * 100)
    : null

  return {
    rows,
    detectedBankName: null,
    openingBalanceCents: null,
    closingBalanceCents,
  }
}

// ─── Profiles ─────────────────────────────────────────────────────────────

function parseProfileRow(row: unknown[]): StatementImportProfileRow {
  return {
    id: row[0] as number,
    bank_name_pattern: row[1] as string,
    format: row[2] as StatementFormat,
    date_field_preference: row[3] as 'processed' | 'transaction',
    credit_marker: row[4] as string,
    opening_balance_label: row[5] as string,
    closing_balance_label: row[6] as string,
    date_format: row[7] as string,
    created_at: row[8] as string,
    last_used_at: (row[9] as string | null) ?? null,
  }
}

const PROFILE_COLS = `
  id, bank_name_pattern, format, date_field_preference, credit_marker,
  opening_balance_label, closing_balance_label, date_format, created_at, last_used_at
`

/**
 * Matches by substring in JS rather than a SQL LIKE clause, for two reasons:
 * (1) bank_name_pattern is stored free text and could contain literal LIKE
 * metacharacters (%, _) that would otherwise be misinterpreted as wildcards;
 * (2) ties are broken by pattern specificity (longest match wins) rather than
 * recency of use, so a more-specific saved profile (e.g. "ANZ Low Rate") isn't
 * shadowed by a shorter, more generic one (e.g. "ANZ") that merely happens to
 * have been used more recently.
 */
export function findProfileForBank(
  bankName: string,
  format: StatementFormat
): StatementImportProfileRow | null {
  const db = getDb()
  if (!db || !bankName.trim()) return null
  const stmt = db.prepare(
    `SELECT ${PROFILE_COLS} FROM statement_import_profiles WHERE format = ?`
  )
  stmt.bind([format])
  const candidates: StatementImportProfileRow[] = []
  while (stmt.step()) {
    candidates.push(parseProfileRow(stmt.get()))
  }
  stmt.free()

  const lowerBankName = bankName.toLowerCase()
  const matches = candidates.filter((c) =>
    lowerBankName.includes(c.bank_name_pattern.toLowerCase())
  )
  if (matches.length === 0) return null

  matches.sort((a, b) => {
    const specificity = b.bank_name_pattern.length - a.bank_name_pattern.length
    if (specificity !== 0) return specificity
    return (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')
  })
  return matches[0]
}

export function saveStatementImportProfile(
  input: Omit<StatementImportProfileRow, 'id' | 'created_at' | 'last_used_at'>
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO statement_import_profiles
       (bank_name_pattern, format, date_field_preference, credit_marker,
        opening_balance_label, closing_balance_label, date_format, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.bank_name_pattern,
      input.format,
      input.date_field_preference,
      input.credit_marker,
      input.opening_balance_label,
      input.closing_balance_label,
      input.date_format,
      now,
      now,
    ]
  )
  const id =
    (db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function touchStatementImportProfile(id: number): void {
  const db = getDb()
  if (!db) return
  db.run(`UPDATE statement_import_profiles SET last_used_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ])
  schedulePersist()
}
