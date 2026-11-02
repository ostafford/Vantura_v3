import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: () => null,
  schedulePersist: () => {},
}))

const { regularDraftReducer } = await import('./useRegularDraft')
const { blankDraft, draftFromTransaction } = await import('@/services/regulars')

const rentTx = {
  description: 'Rent',
  amount: -200000,
  date: '2026-01-31',
  category_id: 'rent-and-mortgage',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0)) // 15 Apr 2026, local
})

afterEach(() => {
  vi.useRealTimers()
})

describe('regularDraftReducer', () => {
  it('re-derives the shown date from the payment when the frequency changes', () => {
    const draft = draftFromTransaction(rentTx, 'MONTHLY')
    const next = regularDraftReducer(draft, {
      type: 'setFrequency',
      frequency: 'QUARTERLY',
    })
    expect(next).toMatchObject({
      frequency: 'QUARTERLY',
      nextChargeDate: '2026-04-30',
    })
    expect(
      regularDraftReducer(draft, { type: 'setFrequency', frequency: 'YEARLY' })
        .nextChargeDate
    ).toBe('2027-01-31')
  })

  it('keeps a hand-typed date when the frequency changes', () => {
    const draft = { ...blankDraft(), nextChargeDate: '2026-05-01' }
    expect(
      regularDraftReducer(draft, { type: 'setFrequency', frequency: 'WEEKLY' })
        .nextChargeDate
    ).toBe('2026-05-01')
  })

  it('fills in from a picked payment for the current frequency, keeping other fields', () => {
    const draft = {
      ...blankDraft(),
      frequency: 'QUARTERLY',
      reminderDaysBefore: '3',
      bucketId: 4,
    }
    expect(
      regularDraftReducer(draft, { type: 'applyTransaction', tx: rentTx })
    ).toMatchObject({
      name: 'Rent',
      amount: '2000.00',
      frequency: 'QUARTERLY',
      nextChargeDate: '2026-04-30',
      categoryId: 'rent-and-mortgage',
      matchDescription: 'Rent',
      anchorDate: '2026-01-31',
      reminderDaysBefore: '3',
      bucketId: 4,
    })
  })

  it('detaching the payment keeps the form as shown and stops re-deriving the date', () => {
    const detached = regularDraftReducer(
      draftFromTransaction(rentTx, 'MONTHLY'),
      { type: 'detachPayment' }
    )
    expect(detached).toMatchObject({
      name: 'Rent',
      nextChargeDate: '2026-04-30',
      anchorDate: null,
    })
    expect(
      regularDraftReducer(detached, {
        type: 'setFrequency',
        frequency: 'YEARLY',
      }).nextChargeDate
    ).toBe('2026-04-30')
  })
})
