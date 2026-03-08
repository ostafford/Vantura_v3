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
import { MonthSummarySection } from '@/components/dashboard/MonthSummarySection'
import { GoalsSection } from '@/components/dashboard/GoalsSection'
import { StatCard } from '@/components/StatCard'
import {
  shouldShowDashboardTour,
  startDashboardTour,
} from '@/lib/dashboardTour'
import {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  type DashboardSectionId,
} from '@/lib/dashboardSections'
import { getDueSoonCharges } from '@/services/upcoming'
import {
  getNotificationsEnabled,
  hasNotifiedToday,
  markNotifiedToday,
  showNotification,
} from '@/lib/notifications'
import { useEffect } from 'react'

const SPENDABLE_ALERT_KEY = 'spendable_alert_below_cents'
const SPENDABLE_ALERT_PCT_PAY_KEY = 'spendable_alert_below_pct_pay'

export function Dashboard() {
  useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [dataVersion, setDataVersion] = useState(0)
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionId[]>(() =>
    getDashboardSectionOrder()
  )
  const [dragOverId, setDragOverId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!getNotificationsEnabled() || hasNotifiedToday()) return
    const dueSoon = getDueSoonCharges()
    if (dueSoon.length > 0) {
      const names = dueSoon
        .map((c) => `${c.name} ($${formatMoney(c.amount)})`)
        .join(', ')
      showNotification('Bills due soon', names)
      markNotifiedToday()
    }
  }, [])

  useEffect(() => {
    setSectionOrder(getDashboardSectionOrder())
  }, [dataVersion])

  const handleSectionDragStart = useCallback(
    (e: React.DragEvent, id: DashboardSectionId) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )
  const handleSectionDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverId(id)
    },
    []
  )
  const handleSectionDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])
  const handleSectionDrop = useCallback(
    (e: React.DragEvent, targetId: DashboardSectionId) => {
      e.preventDefault()
      setDragOverId(null)
      const sourceId = e.dataTransfer.getData(
        'text/plain'
      ) as DashboardSectionId
      if (!sourceId || sourceId === targetId) return
      const order = getDashboardSectionOrder()
      const from = order.indexOf(sourceId)
      const to = order.indexOf(targetId)
      if (from === -1 || to === -1) return
      const next = [...order]
      next.splice(from, 1)
      next.splice(to, 0, sourceId)
      setDashboardSectionOrder(next)
      setSectionOrder(next)
    },
    []
  )
  const handleSectionDragEnd = useCallback(() => {
    setDragOverId(null)
  }, [])

  const renderSection = useCallback(
    (id: DashboardSectionId) => {
      const isDragOver = dragOverId === id
      const sectionProps = {
        'data-section-id': id,
        draggable: true,
        onDragStart: (e: React.DragEvent) => handleSectionDragStart(e, id),
        onDragOver: (e: React.DragEvent) => handleSectionDragOver(e, id),
        onDragLeave: handleSectionDragLeave,
        onDrop: (e: React.DragEvent) => handleSectionDrop(e, id),
        onDragEnd: handleSectionDragEnd,
        className: 'dashboard-section-draggable',
        style: {
          outline: isDragOver ? '2px dashed var(--vantura-primary)' : undefined,
          borderRadius: 4,
        } as React.CSSProperties,
      }
      const dragHandle = (
        <span
          className="dashboard-drag-handle text-muted"
          aria-label="Drag to reorder section"
        >
          <i className="mdi mdi-drag-vertical" aria-hidden />
        </span>
      )
      switch (id) {
        case 'month_summary':
          return (
            <div key={id} {...sectionProps}>
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <MonthSummarySection />
                </div>
              </div>
            </div>
          )
        case 'savers':
          return (
            <div key={id} {...sectionProps} data-tour="savers">
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <SaversSection />
                </div>
              </div>
            </div>
          )
        case 'goals':
          return (
            <div key={id} {...sectionProps}>
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <GoalsSection />
                </div>
              </div>
            </div>
          )
        case 'insights':
          return (
            <div key={id} {...sectionProps} data-tour="insights">
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <InsightsSection />
                </div>
              </div>
            </div>
          )
        case 'trackers':
          return (
            <div key={id} {...sectionProps} data-tour="trackers">
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <TrackersSection />
                </div>
              </div>
            </div>
          )
        case 'upcoming':
          return (
            <div key={id} {...sectionProps} data-tour="upcoming">
              <div className="d-flex gap-2 align-items-start">
                {dragHandle}
                <div className="flex-grow-1 min-w-0">
                  <UpcomingSection
                    onUpcomingChange={() => setDataVersion((v) => v + 1)}
                  />
                </div>
              </div>
            </div>
          )
        default:
          return null
      }
    },
    [
      dragOverId,
      handleSectionDragStart,
      handleSectionDragOver,
      handleSectionDragLeave,
      handleSectionDrop,
      handleSectionDragEnd,
    ]
  )

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
      {sectionOrder.map((id) => (
        <Row key={id} className="grid-margin">
          <Col xs={12} className="grid-margin stretch-card">
            {renderSection(id)}
          </Col>
        </Row>
      ))}
    </div>
  )
}
