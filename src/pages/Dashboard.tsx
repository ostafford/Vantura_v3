import { useState, useCallback } from 'react'
import { Row, Col, Modal, Button, Form } from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getAvailableBalance,
  getReservedAmount,
  getSpendableBalance,
  getPayAmountCents,
} from '@/services/balance'
import { formatMoney, formatShortDate } from '@/lib/format'
import { getAppSetting, setAppSetting } from '@/db'
import { syncStore } from '@/stores/syncStore'
import { SaversSection } from '@/components/dashboard/SaversSection'
import { InsightsSection } from '@/components/dashboard/InsightsSection'
import { TrackersSection } from '@/components/dashboard/TrackersSection'
import { UpcomingSection } from '@/components/dashboard/UpcomingSection'
import { StatCard } from '@/components/StatCard'
import {
  shouldShowDashboardTour,
  startDashboardTour,
} from '@/lib/dashboardTour'
import { useEffect } from 'react'

const SPENDABLE_ALERT_KEY = 'spendable_alert_below_cents'
const SPENDABLE_ALERT_PCT_PAY_KEY = 'spendable_alert_below_pct_pay'

export function Dashboard() {
  useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [, setDataVersion] = useState(0)
  const [showThresholdModal, setShowThresholdModal] = useState(false)
  const [thresholdDollars, setThresholdDollars] = useState('')
  const [thresholdPctPay, setThresholdPctPay] = useState('')

  const spendableCents = getSpendableBalance()
  const payAmountCents = getPayAmountCents()
  const thresholdCentsRaw = getAppSetting(SPENDABLE_ALERT_KEY)
  const thresholdCents =
    thresholdCentsRaw != null && thresholdCentsRaw !== ''
      ? parseInt(thresholdCentsRaw, 10)
      : null
  const pctPayRaw = getAppSetting(SPENDABLE_ALERT_PCT_PAY_KEY)
  const pctPay =
    pctPayRaw != null && pctPayRaw !== '' ? parseInt(pctPayRaw, 10) : 0
  const pctThresholdCents =
    payAmountCents != null && pctPay > 0 && pctPay <= 100
      ? Math.round((payAmountCents * pctPay) / 100)
      : null
  const effectiveThresholdCents =
    thresholdCents != null && thresholdCents > 0
      ? pctThresholdCents != null
        ? Math.max(thresholdCents, pctThresholdCents)
        : thresholdCents
      : pctThresholdCents
  const isSpendableLow =
    effectiveThresholdCents != null &&
    effectiveThresholdCents > 0 &&
    spendableCents < effectiveThresholdCents
  const spendableGradient = isSpendableLow ? 'danger' : 'success'

  const nextPayday = getAppSetting('next_payday')
  const reservedCents = getReservedAmount()
  const spendableSubtitle =
    nextPayday && nextPayday.trim() !== ''
      ? `$${formatMoney(reservedCents)} reserved until ${formatShortDate(nextPayday)}`
      : `$${formatMoney(reservedCents)} reserved for upcoming`

  const spendableTooltip =
    (isSpendableLow
      ? 'Spendable is below your alert threshold.'
      : 'Spendable = Available minus reserved for upcoming charges. Only charges due before your next payday are reserved; prorated for monthly/quarterly/yearly. Click to set alert threshold.') +
    (payAmountCents != null
      ? ` After payday (before new spending): about $${formatMoney(spendableCents)} + $${formatMoney(payAmountCents)} = $${formatMoney(spendableCents + payAmountCents)}.`
      : '')

  const openThresholdModal = useCallback(() => {
    const raw = getAppSetting(SPENDABLE_ALERT_KEY)
    const cents = raw != null && raw !== '' ? parseInt(raw, 10) : 0
    setThresholdDollars(cents > 0 ? (cents / 100).toFixed(2) : '')
    const pctRaw = getAppSetting(SPENDABLE_ALERT_PCT_PAY_KEY)
    setThresholdPctPay(pctRaw != null && pctRaw !== '' ? pctRaw : '')
    setShowThresholdModal(true)
  }, [])

  const saveThreshold = useCallback(() => {
    const trimmed = thresholdDollars.trim()
    if (trimmed === '') {
      setAppSetting(SPENDABLE_ALERT_KEY, '0')
    } else {
      const cents = Math.round(parseFloat(trimmed) * 100)
      setAppSetting(
        SPENDABLE_ALERT_KEY,
        String(isNaN(cents) ? 0 : Math.max(0, cents))
      )
    }
    const pctTrimmed = thresholdPctPay.trim()
    if (pctTrimmed === '') {
      setAppSetting(SPENDABLE_ALERT_PCT_PAY_KEY, '0')
    } else {
      const pct = parseInt(pctTrimmed, 10)
      setAppSetting(
        SPENDABLE_ALERT_PCT_PAY_KEY,
        String(Number.isNaN(pct) || pct < 0 || pct > 100 ? 0 : pct)
      )
    }
    setShowThresholdModal(false)
    setDataVersion((v) => v + 1)
  }, [thresholdDollars, thresholdPctPay])

  useEffect(() => {
    if (shouldShowDashboardTour()) {
      const t = setTimeout(() => startDashboardTour(), 400)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className="mdi mdi-home" aria-hidden />
          </span>
          Dashboard
        </h3>
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb">
            <li className="breadcrumb-item active" aria-current="page">
              Dashboard
            </li>
          </ol>
        </nav>
      </div>
      <Row className="grid-margin" data-tour="balance-cards">
        <Col md={4} className="stretch-card grid-margin">
          <StatCard
            title="Available"
            value={getAvailableBalance()}
            gradient="success"
            imgAlt="circle"
          />
        </Col>
        <Col md={4} className="stretch-card grid-margin">
          <div
            role="button"
            tabIndex={0}
            onClick={openThresholdModal}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openThresholdModal()
              }
            }}
            style={{ cursor: 'pointer' }}
            aria-label="Spendable balance; click to set low balance alert"
          >
            <StatCard
              title="Spendable"
              value={spendableCents}
              subtitle={spendableSubtitle}
              gradient={spendableGradient}
              imgAlt="circle"
              tooltip={spendableTooltip}
            />
          </div>
        </Col>
        <Col md={4} className="stretch-card grid-margin">
          <StatCard
            title="Reserved"
            value={getReservedAmount()}
            gradient="danger"
            imgAlt="circle"
          />
        </Col>
      </Row>

      <Modal
        show={showThresholdModal}
        onHide={() => setShowThresholdModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Spendable alert threshold</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Alert when Spendable is below ($)</Form.Label>
            <Form.Control
              type="number"
              min="0"
              step="0.01"
              placeholder="Leave empty to disable"
              value={thresholdDollars}
              onChange={(e) => setThresholdDollars(e.target.value)}
              aria-label="Alert when Spendable is below (dollars)"
            />
            <Form.Text className="text-muted">
              When Spendable drops below this amount, the card turns red. Leave
              empty or 0 to disable.
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label>Or below (% of pay amount)</Form.Label>
            <Form.Control
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="e.g. 50"
              value={thresholdPctPay}
              onChange={(e) => setThresholdPctPay(e.target.value)}
              aria-label="Alert when Spendable is below this percent of pay amount"
            />
            <Form.Text className="text-muted">
              Requires Pay amount set in Settings. Card turns red when Spendable
              is below this % of your pay. Leave empty or 0 to disable.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowThresholdModal(false)}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={saveThreshold}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
      <Row className="grid-margin">
        <Col md={7} className="grid-margin stretch-card" data-tour="savers">
          <SaversSection />
        </Col>
        <Col md={5} className="grid-margin stretch-card" data-tour="trackers">
          <TrackersSection />
        </Col>
      </Row>
      <Row className="grid-margin">
        <Col xs={12} className="grid-margin" data-tour="insights">
          <InsightsSection />
        </Col>
      </Row>
      <Row className="grid-margin">
        <Col xs={12} className="grid-margin" data-tour="upcoming">
          <UpcomingSection
            onUpcomingChange={() => setDataVersion((v) => v + 1)}
          />
        </Col>
      </Row>
    </div>
  )
}
