import { describe, it, expect, vi } from 'vitest'
import {
  parseCsvStatement,
  tryKnownCsvProfiles,
  computeCsvMatchSignature,
  type CsvParseOptions,
} from './statementParsing'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  schedulePersist: vi.fn(),
}))

// ── parseCsvStatement — normal statement shapes ─────────────────────────────

describe('parseCsvStatement', () => {
  it('parses a signed single-Amount column, preserving sign', () => {
    const csv = `Date,Description,Amount,Balance
01/06/2026,Woolworths,-45.20,954.80
03/06/2026,Payment Received,200.00,1154.80`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({
      amountCents: -4520,
      balanceCents: 95480,
    })
    expect(parsed.rows[1]).toMatchObject({
      amountCents: 20000,
      balanceCents: 115480,
    })
  })

  it('parses a split Debit/Credit column layout with correct signs', () => {
    const csv = `Date,Description,Debit,Credit,Balance
01/06/2026,Woolworths,45.20,,954.80
03/06/2026,Payment Received,,200.00,1154.80`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].amountCents).toBe(-4520)
    expect(parsed.rows[1].amountCents).toBe(20000)
  })

  it('strips a leading BOM from the header row', () => {
    const csv = '\uFEFFDate,Description,Amount\n01/06/2026,Coffee,-4.50'
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(1)
  })

  it('returns no rows for a layout missing required columns', () => {
    const csv = `Foo,Bar\n1,2`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(0)
  })
})

// ── parseCsvStatement — guardrail ───────────────────────────────────────────

describe('parseCsvStatement guardrail', () => {
  it('rejects a file with both Category and Tags columns (Vantura export fingerprint)', () => {
    const csv = `Date,Description,Amount,Category,Account,Tags,Notes
01/06/2026,Round Up,1.00,,Spending,,
02/06/2026,Woolworths,-45.20,,Spending,,`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.rejectionReason).toMatch(/vantura transaction export/i)
  })

  it('rejects a file whose Account column carries more than one distinct value', () => {
    const csv = `Date,Description,Amount,Account
01/06/2026,Transfer to Spending,-400.00,Everyday
01/06/2026,Transfer from Everyday,400.00,Savings`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.rejectionReason).toMatch(/multiple accounts/i)
    expect(parsed.rejectionReason).toContain('Everyday')
    expect(parsed.rejectionReason).toContain('Savings')
  })

  it('does not reject a real statement whose Account column has a single repeated value', () => {
    const csv = `Date,Description,Amount,Account
01/06/2026,Woolworths,-45.20,Chase Sapphire
02/06/2026,Coles,-30.00,Chase Sapphire`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
  })

  it('does not reject when the Account column only differs by casing', () => {
    const csv = `Date,Description,Amount,Account
01/06/2026,Woolworths,-45.20,Chase Sapphire
02/06/2026,Coles,-30.00,chase sapphire`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
  })

  it('does not reject a normal bank CSV with no Category/Tags/Account columns', () => {
    const csv = `Date,Description,Amount,Balance
01/06/2026,Woolworths,-45.20,954.80`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(1)
  })

  it('does not reject a statement whose "Account Type" column has multiple distinct values', () => {
    // "Account Type" (Purchase/Cash Advance/Interest) is a per-transaction
    // property, not "which account" — must not match the Account column
    // regex as a prefix, or this single-card statement would be wrongly
    // rejected as multi-account.
    const csv = `Date,Description,Amount,Account Type
01/06/2026,Woolworths,-45.20,Purchase
02/06/2026,Interest Charged,-2.10,Interest`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
  })

  it('does not reject a statement whose "Account Number" column has multiple distinct values', () => {
    const csv = `Date,Description,Amount,Account Number
01/06/2026,Woolworths,-45.20,****1234
02/06/2026,Coles,-12.00,****5678`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
  })

  it('still rejects a statement whose "Account Name" column has multiple distinct values', () => {
    const csv = `Date,Description,Amount,Account Name
01/06/2026,Transfer to Spending,-400.00,Everyday
01/06/2026,Transfer from Everyday,400.00,Savings`
    const parsed = parseCsvStatement(csv)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.rejectionReason).toMatch(/multiple accounts/i)
  })
})

// ── parseCsvStatement — explicit column-map profile (manual mapping) ───────

describe('parseCsvStatement with an explicit column map', () => {
  it('parses a headerless CSV using an explicit column map', () => {
    const csv = `01/06/2026,Woolworths,-45.20\n03/06/2026,Payment Received,200.00`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: null,
      },
      csv_has_header: false,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].amountCents).toBe(-4520)
    expect(parsed.rows[1].amountCents).toBe(20000)
  })

  it('skips the header row when csv_has_header is true', () => {
    const csv = `Txn Date,Details,Amt\n01/06/2026,Woolworths,-45.20`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: null,
      },
      csv_has_header: true,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].description).toBe('Woolworths')
  })

  it('applies a debit/credit column map with correct signs', () => {
    const csv = `01/06/2026,Woolworths,45.20,\n03/06/2026,Payment Received,,200.00`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: null,
        debitCol: 2,
        creditCol: 3,
        balanceCol: null,
        accountCol: null,
      },
      csv_has_header: false,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].amountCents).toBe(-4520)
    expect(parsed.rows[1].amountCents).toBe(20000)
  })
})

// ── parseCsvStatement — column-map guardrails ───────────────────────────────

describe('parseCsvStatement with an explicit column map — guardrails', () => {
  it('rejects a headered layout that looks like a Vantura export', () => {
    const csv = `Date,Description,Amount,Category,Account,Tags,Notes\n01/06/2026,Round Up,1.00,,Spending,,`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: null,
      },
      csv_has_header: true,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.rejectionReason).toMatch(/vantura transaction export/i)
  })

  it('rejects a mapping whose Account column carries more than one distinct value', () => {
    const csv = `01/06/2026,Transfer to Spending,-400.00,Everyday\n01/06/2026,Transfer from Everyday,400.00,Savings`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: 3,
      },
      csv_has_header: false,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.rejectionReason).toMatch(/multiple accounts/i)
  })

  it('does not reject a mapping whose Account column has a single repeated value', () => {
    const csv = `01/06/2026,Woolworths,-45.20,Chase Sapphire\n02/06/2026,Coles,-30.00,Chase Sapphire`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: 3,
      },
      csv_has_header: false,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(2)
  })

  it('does not run the own-export check on a headerless layout', () => {
    // No header row exists to inspect, so "Category"/"Tags" text appearing
    // as ordinary data values must not trigger the own-export guardrail.
    const csv = `01/06/2026,Category,-45.20`
    const options: CsvParseOptions = {
      csv_column_map: {
        dateCol: 0,
        descriptionCol: 1,
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        balanceCol: null,
        accountCol: null,
      },
      csv_has_header: false,
      date_format: 'DD/MM/YYYY',
    }
    const parsed = parseCsvStatement(csv, options)
    expect(parsed.rejectionReason).toBeUndefined()
    expect(parsed.rows).toHaveLength(1)
  })
})

// ── parseCsvStatement — dateFormatAmbiguous ─────────────────────────────────

describe('parseCsvStatement dateFormatAmbiguous', () => {
  it('is true when every date could be DD/MM or MM/DD', () => {
    const csv = `Date,Description,Amount\n01/06/2026,Woolworths,-45.20\n03/06/2026,Coffee,-4.50`
    const parsed = parseCsvStatement(csv)
    expect(parsed.dateFormatAmbiguous).toBe(true)
  })

  it('is false once any row has a day component greater than 12', () => {
    const csv = `Date,Description,Amount\n25/06/2026,Woolworths,-45.20\n03/06/2026,Coffee,-4.50`
    const parsed = parseCsvStatement(csv)
    expect(parsed.dateFormatAmbiguous).toBe(false)
  })

  it('is false once a date_format override has been explicitly given', () => {
    const csv = `Date,Description,Amount\n01/06/2026,Woolworths,-45.20`
    const parsed = parseCsvStatement(csv, {
      csv_column_map: null,
      csv_has_header: null,
      date_format: 'MM/DD/YYYY',
    })
    expect(parsed.dateFormatAmbiguous).toBe(false)
  })
})

// ── computeCsvMatchSignature ─────────────────────────────────────────────────

describe('computeCsvMatchSignature', () => {
  it('is header-text based when hasHeader is true', () => {
    const csv = `Date,Description,Amount\n01/06/2026,Woolworths,-45.20`
    expect(computeCsvMatchSignature(csv, true)).toBe(
      'header:date|description|amount'
    )
  })

  it('is column-count based when hasHeader is false', () => {
    const csv = `01/06/2026,Woolworths,-45.20`
    expect(computeCsvMatchSignature(csv, false)).toBe('cols:3')
  })

  it('differs for files with a different header even at the same column count', () => {
    const a = computeCsvMatchSignature(`Date,Description,Amount\nx`, true)
    const b = computeCsvMatchSignature(`Txn Date,Details,Amt\nx`, true)
    expect(a).not.toBe(b)
  })

  it('returns null for an empty file', () => {
    expect(computeCsvMatchSignature('', true)).toBeNull()
  })
})

// ── tryKnownCsvProfiles ──────────────────────────────────────────────────────

describe('tryKnownCsvProfiles', () => {
  function mockSavedProfiles(rows: unknown[][]) {
    return {
      prepare: () => {
        let idx = -1
        return {
          bind: () => {},
          step: () => {
            idx++
            return idx < rows.length
          },
          get: () => rows[idx],
          free: () => {},
        }
      },
    }
  }

  const savedColumnMap = {
    dateCol: 0,
    descriptionCol: 1,
    amountCol: 2,
    debitCol: null,
    creditCol: null,
    balanceCol: null,
    accountCol: null,
  }
  // Headerless, 3-column layout — signature is column-count based (see
  // computeCsvMatchSignature), matching `csv_has_header: 0` below.
  const savedProfileRow = [
    1,
    'CommBank',
    'CSV',
    'transaction',
    'CR',
    'Opening Balance',
    'Closing Balance',
    'DD/MM/YYYY',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    JSON.stringify(savedColumnMap),
    0,
    'cols:3',
  ]

  it('matches a file that parses successfully with a saved profile', async () => {
    const { getDb } = await import('@/db')
    vi.mocked(getDb).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSavedProfiles([savedProfileRow]) as any
    )

    const csv = `01/06/2026,Woolworths,-45.20`
    const result = tryKnownCsvProfiles(csv)
    expect(result).not.toBeNull()
    expect(result?.profile.bank_name_pattern).toBe('CommBank')
    expect(result?.parsed.rows).toHaveLength(1)
    expect(result?.parsed.rows[0].amountCents).toBe(-4520)
  })

  it('returns null when the file has a different column count than the saved signature', async () => {
    const { getDb } = await import('@/db')
    vi.mocked(getDb).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSavedProfiles([savedProfileRow]) as any
    )

    // Only two columns — signature is "cols:2", not "cols:3", so the saved
    // profile is skipped before it's even attempted (never mind that its
    // amountCol index 2 wouldn't resolve either).
    const csv = `01/06/2026,Woolworths`
    const result = tryKnownCsvProfiles(csv)
    expect(result).toBeNull()
  })

  it('returns null when a signature-matching profile explains only a minority of rows', async () => {
    const { getDb } = await import('@/db')
    vi.mocked(getDb).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSavedProfiles([savedProfileRow]) as any
    )

    // Same column count (signature matches "cols:3"), but most rows are
    // missing a date in column 0 — only 1 of 5 data rows would parse, well
    // under the 90% row-yield threshold, so this must not be accepted as a
    // genuine match even though the signature lined up.
    const csv = [
      '01/06/2026,Woolworths,-45.20',
      ',not a date,-1.00',
      ',not a date,-1.00',
      ',not a date,-1.00',
      ',not a date,-1.00',
    ].join('\n')
    const result = tryKnownCsvProfiles(csv)
    expect(result).toBeNull()
  })

  it('does not match a profile with no saved signature (pre-fix legacy row)', async () => {
    const { getDb } = await import('@/db')
    const legacyRow = [...savedProfileRow]
    legacyRow[12] = null
    vi.mocked(getDb).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSavedProfiles([legacyRow]) as any
    )
    const result = tryKnownCsvProfiles('01/06/2026,Woolworths,-45.20')
    expect(result).toBeNull()
  })

  it('returns null when there is no database', async () => {
    const { getDb } = await import('@/db')
    vi.mocked(getDb).mockReturnValue(null)
    expect(tryKnownCsvProfiles('01/06/2026,Woolworths,-45.20')).toBeNull()
  })
})
