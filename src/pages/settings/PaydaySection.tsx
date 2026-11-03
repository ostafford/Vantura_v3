import { useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import { type PaydayFrequency, getPaydayDayOptions } from '@/lib/payday'
import { syncStore } from '@/stores/syncStore'

export function PaydaySection() {
  const [paydayFrequency, setPaydayFrequency] =
    useState<PaydayFrequency>('MONTHLY')
  const [paydayDay, setPaydayDay] = useState(1)
  const [nextPayday, setNextPayday] = useState('')
  const [paydayPayAmount, setPaydayPayAmount] = useState('')
  const [paydayError, setPaydayError] = useState<string | null>(null)
  const [paydaySuccess, setPaydaySuccess] = useState(false)

  useEffect(() => {
    const freq = getAppSetting('payday_frequency') as PaydayFrequency | null
    const dayStr = getAppSetting('payday_day')
    const next = getAppSetting('next_payday')
    const payAmt = getAppSetting('pay_amount_cents')
    if (freq === 'WEEKLY' || freq === 'FORTNIGHTLY' || freq === 'MONTHLY') {
      setPaydayFrequency(freq)
    }
    if (dayStr) {
      const d = parseInt(dayStr, 10)
      if (!Number.isNaN(d)) setPaydayDay(d)
    }
    const nowDate = new Date()
    const todayLocal = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`
    setNextPayday(next ?? todayLocal)
    if (payAmt != null && payAmt !== '') {
      const cents = parseInt(payAmt, 10)
      if (!Number.isNaN(cents) && cents >= 0) {
        setPaydayPayAmount((cents / 100).toFixed(2))
      }
    } else {
      setPaydayPayAmount('')
    }
  }, [])

  const paydayDayOptions = getPaydayDayOptions(paydayFrequency)
  const paydayDayValid = paydayDayOptions.some((opt) => opt.value === paydayDay)
  const effectivePaydayDay = paydayDayValid
    ? paydayDay
    : (paydayDayOptions[0]?.value ?? 1)

  function handlePaydaySubmit(e: React.FormEvent) {
    e.preventDefault()
    setPaydayError(null)
    if (!nextPayday.trim()) {
      setPaydayError('Please select your next payday.')
      return
    }
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (nextPayday.trim() < todayStr) {
      setPaydayError(
        'Next payday cannot be in the past. Please select a future date.'
      )
      return
    }
    setAppSetting('payday_frequency', paydayFrequency)
    setAppSetting('payday_day', String(effectivePaydayDay))
    setAppSetting('next_payday', nextPayday.trim())
    const payAmtTrimmed = paydayPayAmount.trim()
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
    setPaydaySuccess(true)
    toast.success('Payday schedule updated.')
    setTimeout(() => setPaydaySuccess(false), 5000)
  }

  return (
    <>
      <p className="small text-muted mb-3">
        Used for your spendable balance and budget planning. Update when your
        pay cycle changes.
      </p>
      <Form onSubmit={handlePaydaySubmit}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-payday-frequency">Frequency</Form.Label>
          <Form.Select
            id="settings-payday-frequency"
            value={paydayFrequency}
            onChange={(e) =>
              setPaydayFrequency(e.target.value as PaydayFrequency)
            }
          >
            <option value="WEEKLY">Weekly</option>
            <option value="FORTNIGHTLY">Fortnightly</option>
            <option value="MONTHLY">Monthly</option>
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-payday-day">Day</Form.Label>
          <Form.Select
            id="settings-payday-day"
            value={effectivePaydayDay}
            onChange={(e) => setPaydayDay(Number(e.target.value))}
          >
            {paydayDayOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-payday-pay-amount">
            Take-home pay amount ($)
          </Form.Label>
          <Form.Control
            id="settings-payday-pay-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={paydayPayAmount}
            onChange={(e) => setPaydayPayAmount(e.target.value)}
          />
          <Form.Text className="text-muted">
            What lands in your account each pay, after tax. Your monthly Income
            is built from it, and it&apos;s used for Spendable context and
            alerts.
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-next-payday">Next payday</Form.Label>
          <Form.Control
            id="settings-next-payday"
            type="date"
            value={nextPayday}
            onChange={(e) => setNextPayday(e.target.value)}
          />
        </Form.Group>
        {paydayError && (
          <div className="text-danger small mb-2" role="alert">
            {paydayError}
          </div>
        )}
        {paydaySuccess && (
          <span className="d-block mb-2 text-success small" role="status">
            Payday settings updated.
          </span>
        )}
        <Button type="submit" className="btn-gradient-primary" size="sm">
          Save payday settings
        </Button>
      </Form>
    </>
  )
}
