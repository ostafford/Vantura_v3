import { useCallback, useReducer } from 'react'
import {
  draftFromTransaction,
  nextChargeDateFromAnchor,
  saveRegular,
  validateRegularDraft,
  type DraftSourceTransaction,
  type RegularDraft,
  type RegularDraftErrors,
} from '@/services/regulars'

/** Every field a view can set directly; frequency has its own action. */
export type RegularDraftPatch = Partial<
  Omit<RegularDraft, 'id' | 'frequency' | 'anchorDate' | 'shown'>
>

export type RegularDraftAction =
  | { type: 'reset'; draft: RegularDraft }
  | { type: 'update'; patch: RegularDraftPatch }
  | { type: 'setFrequency'; frequency: string }
  | { type: 'applyTransaction'; tx: DraftSourceTransaction }
  | { type: 'detachPayment' }

export function regularDraftReducer(
  draft: RegularDraft,
  action: RegularDraftAction
): RegularDraft {
  switch (action.type) {
    case 'reset':
      return action.draft
    case 'update':
      return { ...draft, ...action.patch }
    case 'setFrequency':
      // Made from a payment: the shown date follows the frequency (#153).
      return {
        ...draft,
        frequency: action.frequency,
        nextChargeDate: draft.anchorDate
          ? nextChargeDateFromAnchor(draft.anchorDate, action.frequency)
          : draft.nextChargeDate,
      }
    case 'applyTransaction': {
      // Fill in from a picked payment, keeping everything else in the form.
      const fromTx = draftFromTransaction(action.tx, draft.frequency)
      return {
        ...draft,
        name: fromTx.name,
        amount: fromTx.amount,
        categoryId: fromTx.categoryId,
        nextChargeDate: fromTx.nextChargeDate,
        matchDescription: fromTx.matchDescription,
        anchorDate: fromTx.anchorDate,
      }
    }
    case 'detachPayment':
      // No longer made from a payment: the date stays as the user sees it.
      return { ...draft, anchorDate: null }
  }
}

export type SaveRegularDraftResult =
  | { ok: true; id: number }
  | { ok: false; errors: RegularDraftErrors }

/**
 * Form state for a Regular editor (#160): the fields of a `RegularDraft`, the
 * shown date following the frequency for a Regular made from a payment, and a
 * `save()` that validates before storing. Views render `draft` and report
 * `errors` from a refused save however suits them.
 */
export function useRegularDraft(initial: RegularDraft | (() => RegularDraft)) {
  const [draft, dispatch] = useReducer(regularDraftReducer, undefined, () =>
    typeof initial === 'function' ? initial() : initial
  )

  const reset = useCallback(
    (next: RegularDraft) => dispatch({ type: 'reset', draft: next }),
    []
  )
  const update = useCallback(
    (patch: RegularDraftPatch) => dispatch({ type: 'update', patch }),
    []
  )
  const setFrequency = useCallback(
    (frequency: string) => dispatch({ type: 'setFrequency', frequency }),
    []
  )
  const applyTransaction = useCallback(
    (tx: DraftSourceTransaction) => dispatch({ type: 'applyTransaction', tx }),
    []
  )
  const detachPayment = useCallback(
    () => dispatch({ type: 'detachPayment' }),
    []
  )

  const save = useCallback((): SaveRegularDraftResult => {
    const errors = validateRegularDraft(draft)
    if (Object.keys(errors).length > 0) return { ok: false, errors }
    return { ok: true, id: saveRegular(draft) }
  }, [draft])

  return {
    draft,
    reset,
    update,
    setFrequency,
    applyTransaction,
    detachPayment,
    save,
  }
}
