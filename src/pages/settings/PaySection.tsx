import { useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import { toast } from '@/stores/toastStore'
import {
  type PayFrequency,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
} from '@/lib/payFrequency'
import {
  INVALID_PAY_AMOUNT_MESSAGE,
  readPaySettings,
  savePay,
} from '@/services/pay'
import { syncStore } from '@/stores/syncStore'

/** Settings → Pay: the take-home pay amount and Pay frequency (#195). */
export function PaySection() {
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('MONTHLY')
  const [payAmount, setPayAmount] = useState('')
  const [payError, setPayError] = useState<string | null>(null)
  const [paySuccess, setPaySuccess] = useState(false)

  useEffect(() => {
    const { frequency, amountInput } = readPaySettings()
    if (frequency) setPayFrequency(frequency)
    setPayAmount(amountInput)
  }, [])

  function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault()
    setPayError(null)
    if (!savePay(payFrequency, payAmount)) {
      setPayError(INVALID_PAY_AMOUNT_MESSAGE)
      return
    }
    syncStore.getState().syncCompleted()
    setPaySuccess(true)
    toast.success('Pay updated.')
    setTimeout(() => setPaySuccess(false), 5000)
  }

  return (
    <>
      <p className="small text-muted mb-3">
        Used for budget planning. Update when your pay changes.
      </p>
      <Form onSubmit={handlePaySubmit}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-pay-frequency">
            Pay frequency
          </Form.Label>
          <Form.Select
            id="settings-pay-frequency"
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
          >
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {PAY_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-pay-amount">
            Take-home pay amount ($)
          </Form.Label>
          <Form.Control
            id="settings-pay-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <Form.Text className="text-muted">
            What lands in your account each pay, after tax. Your monthly Income
            is built from it.
          </Form.Text>
        </Form.Group>
        {payError && (
          <div className="text-danger small mb-2" role="alert">
            {payError}
          </div>
        )}
        {paySuccess && (
          <span className="d-block mb-2 text-success small" role="status">
            Pay settings updated.
          </span>
        )}
        <Button type="submit" className="btn-gradient-primary" size="sm">
          Save pay settings
        </Button>
      </Form>
    </>
  )
}
