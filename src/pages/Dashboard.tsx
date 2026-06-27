import { useState, useCallback, useMemo, useEffect } from 'react'
import type React from 'react'
import { Row, Col, Modal, Button, Form } from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getAvailableBalance,
  getReservedAmount,
  getSpendableBalance,
  getPayAmountCents,
} from '@/services/balance'
import { formatMoney, formatShortDate } from '@/lib/format'
import { MONTH_NAMES } from '@/lib/constants'
import { getAppSetting, setAppSetting } from '@/db'
import { syncStore } from '@/stores/syncStore'
import { performSync } from '@/services/sync'
import { sessionStore } from '@/stores/sessionStore'
import { InsightsSection } from '@/components/dashboard/InsightsSection'
import { TrackersSection } from '@/components/dashboard/TrackersSection'
import { UpcomingSection } from '@/components/dashboard/UpcomingSection'
import { MonthSummarySection } from '@/components/dashboard/MonthSummarySection'
import { NetWorthCard } from '@/components/dashboard/NetWorthCard'
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
import { daysUntilCharge, getDueSoonCharges } from '@/services/upcoming'
import { runNotificationChecks } from '@/services/notificationChecks'
import { notificationStore } from '@/stores/notificationStore'
import { UpBankUnauthorizedError, SYNC_401_MESSAGE } from '@/api/upBank'
import { toast } from '@/stores/toastStore'
const SPENDABLE_ALERT_KEY = 'spendable_alert_below_cents'
const SPENDABLE_ALERT_PCT_PAY_KEY = 'spendable_alert_below_pct_pay'

const TOUR_DATA_ATTRS: Record<DashboardSectionId, string> = {
  month_summary: 'month-summary',
  insights: 'insights',
  trackers: 'trackers',
  upcoming: 'upcoming',
  net_worth: 'net-worth',
}

export function Dashboard() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const isSyncing = useStore(syncStore, (s) => s.syncing)
  const [dataVersion, setDataVersion] = useState(0)
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionId[]>(() =>
    getDashboardSectionOrder()
  )
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [bannerDismissedToday, setBannerDismissedToday] = useState(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return getAppSetting('dismissed_due_soon_date') === today
  })
  const [showThresholdModal, setShowThresholdModal] = useState(false)
  const [thresholdDollars, setThresholdDollars] = useState('')
  const [thresholdPctPay, setThresholdPctPay] = useState('')

  const {
    availableCents,
    spendableCents,
    payAmountCents,
    thresholdCentsRaw,
    pctPayRaw,
    nextPayday,
    reservedCents,
    lastSyncAgeMs,
  } = useMemo(
    () => ({
      availableCents: getAvailableBalance(),
      spendableCents: getSpendableBalance(),
      payAmountCents: getPayAmountCents(),
      thresholdCentsRaw: getAppSetting(SPENDABLE_ALERT_KEY),
      pctPayRaw: getAppSetting(SPENDABLE_ALERT_PCT_PAY_KEY),
      nextPayday: getAppSetting('next_payday'),
      reservedCents: getReservedAmount(),
      lastSyncAgeMs: (() => {
        const ls = getAppSetting('last_sync')
        return ls ? Date.now() - new Date(ls).getTime() : null
      })(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, dataVersion]
  )

  const thresholdCents =
    thresholdCentsRaw != null && thresholdCentsRaw !== ''
      ? parseInt(thresholdCentsRaw, 10)
      : null
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
  const spendableGradient =
    spendableCents < 0 || isSpendableLow ? 'danger' : 'success'
  const spendableDisplayValue =
    spendableCents < 0
      ? `−$${formatMoney(Math.abs(spendableCents))}`
      : undefined
  const isStale = lastSyncAgeMs != null && lastSyncAgeMs > 60 * 60 * 1000
  const staleHours =
    isStale && lastSyncAgeMs != null
      ? Math.floor(lastSyncAgeMs / (60 * 60 * 1000))
      : 0

  const spendableSubtitle =
    nextPayday && nextPayday.trim() !== ''
      ? `$${formatMoney(reservedCents)} reserved until ${formatShortDate(nextPayday)}`
      : `$${formatMoney(reservedCents)} reserved for upcoming`
  const availableProjectedSubtitle =
    payAmountCents != null
      ? `Projected post-payday: $${formatMoney(availableCents + payAmountCents)}`
      : 'Balance as reported by Up Bank'

  const spendableTooltip = (() => {
    const fmtSigned = (c: number) =>
      c < 0 ? `−$${formatMoney(Math.abs(c))}` : `$${formatMoney(c)}`
    const projected =
      payAmountCents != null ? spendableCents + payAmountCents : null

    return (
      <div style={{ fontSize: '0.82rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.45rem' }}>
          {spendableCents < 0
            ? 'Spendable is negative'
            : isSpendableLow
              ? 'Below your alert threshold'
              : 'How Spendable is calculated'}
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
        >
          <div>
            • <strong>Available</strong> — your Up Bank balance
          </div>
          <div>
            • minus <strong>Reserved</strong> — upcoming charges set aside
            before payday
          </div>
          {spendableCents < 0 && (
            <div
              style={{ marginTop: '0.3rem', color: 'var(--vantura-danger)' }}
            >
              Reserved charges exceed your available balance.
            </div>
          )}
          {isSpendableLow && spendableCents >= 0 && (
            <div
              style={{ marginTop: '0.3rem', color: 'var(--vantura-warning)' }}
            >
              Check your upcoming charges or tap to adjust the threshold.
            </div>
          )}
          {projected != null && (
            <div
              style={{
                marginTop: '0.3rem',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                paddingTop: '0.3rem',
              }}
            >
              After payday: {fmtSigned(spendableCents)} + $
              {formatMoney(payAmountCents!)} ={' '}
              <strong>{fmtSigned(projected)}</strong>
            </div>
          )}
        </div>
        <div
          style={{ marginTop: '0.45rem', opacity: 0.55, fontSize: '0.78rem' }}
        >
          Tap this card to set a low-balance alert.
        </div>
      </div>
    )
  })()

  const now = new Date()
  const headerDate = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  const dueSoon = useMemo(
    () => getDueSoonCharges(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, dataVersion]
  )
  const handleDismissBanner = useCallback(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setAppSetting('dismissed_due_soon_date', today)
    setBannerDismissedToday(true)
  }, [])

  const dueSoonAlert = useMemo(() => {
    if (bannerDismissedToday || dueSoon.length === 0) return null
    return (
      <div
        className="alert alert-warning d-flex align-items-center gap-2 py-2 mb-4"
        role="alert"
      >
        <i className="mdi mdi-bell-ring flex-shrink-0" aria-hidden />
        <span className="flex-grow-1">
          <strong>Due soon: </strong>
          {dueSoon.map((c, i) => {
            const days = daysUntilCharge(c.next_charge_date)
            const dayText = days === 0 ? 'today' : `in ${days}d`
            return (
              <span key={c.id}>
                {i > 0 && <span className="text-muted mx-2">·</span>}
                {c.name} (${formatMoney(c.amount)}) — {dayText}
              </span>
            )
          })}
        </span>
        <button
          type="button"
          className="btn-close btn-close-white ms-2 flex-shrink-0"
          style={{ fontSize: '0.65rem' }}
          onClick={handleDismissBanner}
          aria-label="Dismiss for today"
          title="Dismiss for today"
        />
      </div>
    )
  }, [dueSoon, bannerDismissedToday, handleDismissBanner])

  const handleManualSync = useCallback(async () => {
    const token = sessionStore.getState().getToken()
    if (!token || syncStore.getState().syncing) return
    if (getAppSetting('demo_mode') === '1') {
      toast.info('Demo mode – no sync.')
      return
    }
    syncStore.getState().setSyncing(true)
    try {
      await performSync(token, () => {})
      syncStore.getState().syncCompleted()
      toast.success('Sync complete. Data updated.')
    } catch (err) {
      const message =
        err instanceof UpBankUnauthorizedError
          ? SYNC_401_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Sync failed. Please try again.'
      toast.error(message)
    } finally {
      syncStore.getState().setSyncing(false)
    }
  }, [])

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
      const t = setTimeout(() => startDashboardTour(sectionOrder), 400)
      return () => clearTimeout(t)
    }
  }, [sectionOrder])

  useEffect(() => {
    const token = sessionStore.getState().getToken()
    if (!token || getAppSetting('demo_mode') === '1') return
    const lastSync = getAppSetting('last_sync')
    if (lastSync) {
      const ageMs = Date.now() - new Date(lastSync).getTime()
      if (ageMs < 30 * 60 * 1000) return
    }
    syncStore.getState().setSyncing(true)
    performSync(token, () => {})
      .then(() => {
        syncStore.getState().syncCompleted()
      })
      .catch(() => {})
      .finally(() => {
        syncStore.getState().setSyncing(false)
      })
  }, [])

  useEffect(() => {
    runNotificationChecks()
    notificationStore.getState().refreshUnreadCount()
  }, [])

  useEffect(() => {
    setSectionOrder(getDashboardSectionOrder())
  }, [dataVersion])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const scroll = params.get('scroll')
    if (!scroll) return
    const url = new URL(window.location.href)
    url.searchParams.delete('scroll')
    window.history.replaceState(null, '', url.toString())
    const idMap: Record<string, string> = {
      upcoming: 'dashboard-section-upcoming',
      spendable: 'dashboard-spendable-card',
    }
    const elId = idMap[scroll]
    if (!elId) return
    const t = setTimeout(() => {
      const el = document.getElementById(elId)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('dashboard-scroll-highlight')
      setTimeout(() => el.classList.remove('dashboard-scroll-highlight'), 2000)
    }, 150)
    return () => clearTimeout(t)
  }, [])

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

  const getSectionComponent = useCallback(
    (
      id: DashboardSectionId,
      dragHandleProps: React.HTMLAttributes<HTMLSpanElement>
    ) => {
      switch (id) {
        case 'month_summary':
          return <MonthSummarySection dragHandleProps={dragHandleProps} />
        case 'insights':
          return <InsightsSection dragHandleProps={dragHandleProps} />
        case 'trackers':
          return <TrackersSection dragHandleProps={dragHandleProps} />
        case 'upcoming':
          return (
            <UpcomingSection
              dragHandleProps={dragHandleProps}
              onUpcomingChange={() => setDataVersion((v) => v + 1)}
            />
          )
        case 'net_worth':
          return <NetWorthCard dragHandleProps={dragHandleProps} />
        default:
          return null
      }
    },
    []
  )

  function renderSectionCell(id: DashboardSectionId) {
    const isDragOver = dragOverId === id
    const tourAttr = TOUR_DATA_ATTRS[id]
    const dragHandleProps: React.HTMLAttributes<HTMLSpanElement> = {
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLSpanElement>) =>
        handleSectionDragStart(e, id),
      title: 'Drag to reorder section',
      'aria-label': 'Drag to reorder section',
      style: { cursor: 'grab' },
    }
    return (
      <div
        key={id}
        id={`dashboard-section-${id}`}
        className="dashboard-grid-cell"
        data-section-id={id}
        {...(tourAttr ? { 'data-tour': tourAttr } : {})}
        onDragOver={(e: React.DragEvent) => handleSectionDragOver(e, id)}
        onDragLeave={handleSectionDragLeave}
        onDrop={(e: React.DragEvent) => handleSectionDrop(e, id)}
        onDragEnd={handleSectionDragEnd}
        style={{
          outline: isDragOver ? '2px dashed var(--vantura-primary)' : undefined,
          borderRadius: 6,
        }}
      >
        <div className="dashboard-grid-card-wrapper">
          {getSectionComponent(id, dragHandleProps)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title dashboard-title">Dashboard</h3>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted" style={{ fontSize: '0.875rem' }}>
            {headerDate}
          </span>
          {isStale && (
            <span
              className="badge bg-warning text-dark"
              title={`Data is ${staleHours}h old — sync to refresh`}
            >
              {staleHours}h old
            </span>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={handleManualSync}
            disabled={isSyncing}
            aria-busy={isSyncing}
            aria-label="Sync now"
            title={
              lastSyncAgeMs != null
                ? `Last synced ${Math.round(lastSyncAgeMs / 60000)} min ago`
                : 'Sync now'
            }
          >
            {isSyncing ? (
              <span
                className="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              />
            ) : (
              <i className="mdi mdi-sync" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <Row className="g-3 mb-4" data-tour="balance-cards">
        <Col md={6} className="stretch-card">
          <StatCard
            title="Available"
            value={availableCents}
            subtitle={availableProjectedSubtitle}
            gradient="success"
            tooltip={
              <div style={{ fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.45rem' }}>
                  Your Up Bank balance
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div>• Sum of all transactional account balances</div>
                  <div>• Excludes saver accounts</div>
                  <div>• Pending/held transactions already reflected</div>
                </div>
                {payAmountCents != null && (
                  <div
                    style={{
                      marginTop: '0.45rem',
                      borderTop: '1px solid rgba(255,255,255,0.12)',
                      paddingTop: '0.3rem',
                    }}
                  >
                    Post-payday: ${formatMoney(availableCents)} + $
                    {formatMoney(payAmountCents)} ={' '}
                    <strong>
                      ${formatMoney(availableCents + payAmountCents)}
                    </strong>
                  </div>
                )}
              </div>
            }
          />
        </Col>
        <Col id="dashboard-spendable-card" md={6} className="stretch-card">
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
              displayValue={spendableDisplayValue}
              subtitle={spendableSubtitle}
              gradient={spendableGradient}
              tooltip={spendableTooltip}
            />
          </div>
        </Col>
      </Row>
      {dueSoonAlert}

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

      <div className="dashboard-grid">
        {sectionOrder.map((id) => renderSectionCell(id))}
      </div>
    </div>
  )
}
