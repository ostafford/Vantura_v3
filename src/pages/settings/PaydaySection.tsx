import { useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import { type PaydayFrequency, getPaydayDayOptions } from '@/lib/payday'
import {
  detectPaySchedule,
  searchCreditTransactions,
  type PaydayDetectionResult,
  type PayeeSummary,
} from '@/services/paydayDetection'
import { syncStore } from '@/stores/syncStore'

export function PaydaySection() {
  const [paydayFrequency, setPaydayFrequency] =
    useState<PaydayFrequency>('MONTHLY')
  const [paydayDay, setPaydayDay] = useState(1)
  const [nextPayday, setNextPayday] = useState('')
  const [paydayPayAmount, setPaydayPayAmount] = useState('')
  const [paydayError, setPaydayError] = useState<string | null>(null)
  const [paydaySuccess, setPaydaySuccess] = useState(false)
  const [txSearch, setTxSearch] = useState('')
  const [txResults, setTxResults] = useState<PayeeSummary[]>([])
  const [txDetectionResult, setTxDetectionResult] =
    useState<PaydayDetectionResult | null>(null)
  const [selectedPayRawText, setSelectedPayRawText] = useState<string | null>(
    () => getAppSetting('payday_raw_text')
  )
  const [selectedPayDescription, setSelectedPayDescription] = useState<
    string | null
  >(() => getAppSetting('payday_description') || null)

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
    if (selectedPayRawText) {
      setAppSetting('payday_raw_text', selectedPayRawText)
      setAppSetting(
        'payday_description',
        selectedPayDescription ?? selectedPayRawText
      )
      // Clear the suggestion guard so it won't re-fire now that payday is configured
      setAppSetting('notif_possible_payday_suggested_for', '')
    }
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
    setTxSearch('')
    setTxResults([])
    syncStore.getState().syncCompleted()
    setPaydaySuccess(true)
    toast.success('Payday schedule updated.')
    setTimeout(() => setPaydaySuccess(false), 5000)
  }

  return (
    <>
      <p className="small text-muted mb-3">
        Used for your spendable balance, PAYDAY trackers, and budget planning.
        Update when your pay cycle changes.
      </p>
      <Form onSubmit={handlePaydaySubmit}>
        <div
          className="mb-3 p-2 rounded"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <Form.Label
            htmlFor="settings-tx-search"
            className="small fw-semibold mb-1 d-block"
          >
            Detect from transactions
          </Form.Label>
          <Form.Text
            className="text-muted d-block mb-2"
            style={{ fontSize: '0.74rem' }}
          >
            Search for your pay transaction — Vantura will detect your schedule
            from its history and fill the fields below.
          </Form.Text>
          {(selectedPayDescription || selectedPayRawText) && (
            <div
              className="d-flex align-items-center gap-2 mb-2 px-2 py-1 rounded"
              style={{
                background: 'rgba(var(--vantura-success-rgb, 56,142,60), 0.12)',
                border:
                  '1px solid rgba(var(--vantura-success-rgb, 56,142,60), 0.28)',
                fontSize: '0.78rem',
              }}
            >
              <i
                className="mdi mdi-check-circle flex-shrink-0"
                style={{
                  color: 'var(--vantura-success)',
                  fontSize: '1rem',
                }}
                aria-hidden
              />
              <span className="text-body-secondary" style={{ lineHeight: 1.3 }}>
                <span
                  className="fw-semibold"
                  style={{ color: 'var(--vantura-success)' }}
                >
                  Linked:
                </span>{' '}
                {selectedPayDescription ?? selectedPayRawText}
              </span>
              <button
                type="button"
                className="btn-close btn-close-white ms-auto flex-shrink-0"
                style={{ fontSize: '0.55rem', opacity: 0.5 }}
                aria-label="Remove linked pay source"
                onClick={() => {
                  setSelectedPayRawText(null)
                  setSelectedPayDescription(null)
                  setTxDetectionResult(null)
                  setAppSetting('payday_raw_text', '')
                  setAppSetting('payday_description', '')
                  // Reset suggestion guard so Vantura can re-suggest
                  // a payday source now that none is linked
                  setAppSetting('notif_possible_payday_suggested_for', '')
                }}
              />
            </div>
          )}
          <Form.Control
            id="settings-tx-search"
            type="search"
            size="sm"
            placeholder="Search by employer or payee name…"
            value={txSearch}
            autoComplete="off"
            onChange={(e) => {
              const q = e.target.value
              setTxSearch(q)
              setTxResults(
                q.trim().length >= 2 ? searchCreditTransactions(q.trim()) : []
              )
            }}
          />
          {txResults.length > 0 && (
            <div
              className="list-group list-group-flush mt-1"
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {txResults.map((payee) => (
                <button
                  key={payee.raw_text ?? payee.description}
                  type="button"
                  className="list-group-item list-group-item-action py-2 px-2 small"
                  onClick={() => {
                    const key = payee.raw_text ?? payee.description
                    const result = detectPaySchedule(key)
                    setTxDetectionResult(result)
                    setSelectedPayRawText(key)
                    setSelectedPayDescription(payee.description)
                    if (result) {
                      setPaydayFrequency(result.frequency)
                      setPaydayDay(result.paydayDay)
                      setNextPayday(result.nextPayday)
                    }
                    setTxSearch('')
                    setTxResults([])
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <span
                      className="fw-semibold text-truncate"
                      style={{ maxWidth: '70%' }}
                    >
                      {payee.description}
                    </span>
                    <span className="text-muted ms-2 flex-shrink-0">
                      {payee.occurrences}{' '}
                      {payee.occurrences === 1 ? 'pay' : 'pays'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {txDetectionResult && (
            <p className="text-success small mt-2 mb-0">
              <i className="mdi mdi-check-circle-outline me-1" aria-hidden />
              Detected from {txDetectionResult.sampleDates.length} transaction
              {txDetectionResult.sampleDates.length !== 1 ? 's' : ''} — fields
              updated below.
            </p>
          )}
        </div>
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
            Pay amount ($)
          </Form.Label>
          <Form.Control
            id="settings-payday-pay-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={paydayPayAmount}
            onChange={(e) => setPaydayPayAmount(e.target.value)}
            aria-label="Pay amount per pay period (optional)"
          />
          <Form.Text className="text-muted">
            Optional. Used for Spendable context, alerts, and PAYDAY tracker
            warnings.
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
