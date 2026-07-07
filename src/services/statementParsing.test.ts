import { describe, it, expect } from 'vitest'
import { parseCsvStatement } from './statementParsing'

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
