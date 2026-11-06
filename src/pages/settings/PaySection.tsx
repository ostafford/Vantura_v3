import { useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import {
  type PayFrequency,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  isPayFrequency,
} from '@/lib/payFrequency'
import { syncStore } from '@/stores/syncStore'

/** Settings → Pay: the take-home pay amount and Pay frequency (#195). */
export function PaySection() {
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('MONTHLY')
  const [payAmount, setPayAmount] = useState('')
  const [paySuccess, setPaySuccess] = useState(false)

  useEffect(() => {
    const freq = getAppSetting('payday_frequency')
    const payAmt = getAppSetting('pay_amount_cents')
    if (isPayFrequency(freq)) setPayFrequency(freq)
    if (payAmt != null && payAmt !== '') {
      const cents = parseInt(payAmt, 10)
      if (!Number.isNaN(cents) && cents >= 0) {
        setPayAmount((cents / 100).toFixed(2))
      }
    } else {
      setPayAmount('')
    }
  }, [])

  function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault()
    setAppSetting('payday_frequency', payFrequency)
    const payAmtTrimmed = payAmount.trim()
    if (payAmtTrimmed === '') {
      setAppSetting('pay_amount_cents', '')
    } else {
      const cents = Math.round(parseFloat(payAmtTrimmed) * 100)
      setAppSetting(
        'pay_amount_cents',
        Number.isNaN(cents) || cents < 0 ? '' : String(cents)
      )
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
