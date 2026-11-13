/**
 * The pay fields on a Month without a plan (#282): the pay prompt's bulk
 * confirm and "Change pay for this month". An amount field (`type="text"
 * inputMode="decimal"`, read by `parseAmountInput` in the service, ADR 0026)
 * and a Pay frequency choice. The save itself is the caller's
 * (`confirmPayForEarlierMonths` or `changePayForMonth`). The form checks the
 * pay first with the same rule (`payFormError`), so a refused save it can't
 * explain says so plainly instead of blaming the amount.
 */

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Form } from 'react-bootstrap'
import {
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  isPayFrequency,
  type PayFrequency,
} from '@/lib/payFrequency'
import type { PayFormValues } from '@/services/pay'
import {
  INVALID_CONFIRMED_PAY_MESSAGE,
  NO_PAY_FREQUENCY_MESSAGE,
  PAY_NOT_SAVED_MESSAGE,
  payFormError,
} from './payForm'

interface NoPlanPayFormProps {
  initial: PayFormValues
  submitLabel: string
  /** Saves; false when the service refused the pay (nothing written). */
  onSave: (amountInput: string, frequency: PayFrequency) => boolean
  onCancel?: () => void
  /** Moves focus to the amount on mount (an opened "Change pay"). */
  autoFocus?: boolean
  testId: string
  children?: ReactNode
}

export function NoPlanPayForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
  autoFocus = false,
  testId,
  children,
}: NoPlanPayFormProps) {
  const id = useId()
  const [amount, setAmount] = useState(initial.amountInput)
  const [frequency, setFrequency] = useState<PayFrequency | ''>(
    initial.frequency ?? ''
  )
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const invalid = payFormError(amount, frequency)
    if (invalid !== null || frequency === '') {
      setError(invalid)
      return
    }
    if (!onSave(amount, frequency)) setError(PAY_NOT_SAVED_MESSAGE)
  }

  return (
    <Form
      className="plan-pay-form mb-3"
      data-testid={testId}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) {
          e.stopPropagation()
          onCancel()
        }
      }}
      noValidate
    >
      {children}
      <div className="plan-pay-form__fields">
        <Form.Group controlId={`${id}-amount`}>
          <Form.Label className="small mb-1">
            Take-home pay amount ($)
          </Form.Label>
          <Form.Control
            size="sm"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            autoFocus={autoFocus}
            aria-invalid={error === INVALID_CONFIRMED_PAY_MESSAGE || undefined}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
          />
        </Form.Group>
        <Form.Group controlId={`${id}-frequency`}>
          <Form.Label className="small mb-1">Pay frequency</Form.Label>
          <Form.Select
            size="sm"
            value={frequency}
            aria-invalid={error === NO_PAY_FREQUENCY_MESSAGE || undefined}
            onChange={(e) => {
              const value = e.target.value
              setFrequency(isPayFrequency(value) ? value : '')
              setError(null)
            }}
          >
            {frequency === '' && <option value="">Choose…</option>}
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {PAY_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </div>
      {error && (
        <div className="plan-pay-form__error small mt-2" role="alert">
          {error}
        </div>
      )}
      <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
        <Button type="submit" size="sm" className="btn-gradient-primary">
          {submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </Form>
  )
}
