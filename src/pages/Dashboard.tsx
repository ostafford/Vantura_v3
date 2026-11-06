import { useState, useCallback, useMemo, useEffect } from 'react'
import type React from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import { useStore } from 'zustand'
import { formatMoney } from '@/lib/format'
import { MONTH_NAMES } from '@/lib/constants'
import { getAppSetting, setAppSetting } from '@/db'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'
import { runSync } from '@/services/syncRunner'
import { sessionStore } from '@/stores/sessionStore'
import { TrackersSection } from '@/components/dashboard/TrackersSection'
import { UpcomingSection } from '@/components/dashboard/UpcomingSection'
import { MonthSummarySection } from '@/components/dashboard/MonthSummarySection'
import { HeadroomSection } from '@/components/dashboard/HeadroomSection'
import { MonthReviewCard } from '@/components/dashboard/MonthReviewCard'
import {
  shouldShowDashboardTour,
  startDashboardTour,
} from '@/lib/dashboardTour'
import {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  getDashboardSectionSizes,
  setDashboardSectionSizes,
  getDashboardSectionVisibility,
  setDashboardSectionVisibility,
  DEFAULT_SECTION_SIZES,
  DEFAULT_SECTION_VISIBILITY,
  DASHBOARD_SECTION_LABELS,
  type DashboardSectionId,
  type DashboardSectionSize,
} from '@/lib/dashboardSections'
import { daysUntilCharge, dueSoonRegulars } from '@/services/regulars'
import { UpBankUnauthorizedError, SYNC_401_MESSAGE } from '@/api/upBank'
import { toast } from '@/stores/toastStore'

const TOUR_DATA_ATTRS: Record<DashboardSectionId, string> = {
  month_summary: 'month-summary',
  trackers: 'trackers',
  upcoming: 'upcoming',
}

export function Dashboard() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const isSyncing = useStore(syncStore, (s) => s.syncing)
  const [dataVersion, setDataVersion] = useState(0)
  const bumpDataVersion = useCallback(() => setDataVersion((v) => v + 1), [])
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionId[]>(() =>
    getDashboardSectionOrder()
  )
  const [sectionSizes, setSectionSizes] = useState<
    Record<DashboardSectionId, DashboardSectionSize>
  >(() => getDashboardSectionSizes())
  const [sectionVisibility, setSectionVisibility] = useState<
    Record<DashboardSectionId, boolean>
  >(() => getDashboardSectionVisibility())
  const [showCustomiseModal, setShowCustomiseModal] = useState(false)
  const [draftSizes, setDraftSizes] = useState<
    Record<DashboardSectionId, DashboardSectionSize>
  >(DEFAULT_SECTION_SIZES)
  const [draftVisibility, setDraftVisibility] = useState<
    Record<DashboardSectionId, boolean>
  >(DEFAULT_SECTION_VISIBILITY)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const today = useStore(todayStore, (s) => s.today)
  // A dismissal lasts for the day it was made in, so the banner returns the
  // next day even with the page left open (#164).
  const [bannerDismissedOn, setBannerDismissedOn] = useState(() =>
    getAppSetting('dismissed_due_soon_date')
  )
  const bannerDismissedToday = bannerDismissedOn === today
  const lastSyncAgeMs = useMemo(
    () => {
      const ls = getAppSetting('last_sync')
      return ls ? Date.now() - new Date(ls).getTime() : null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, dataVersion, today]
  )

  const isStale = lastSyncAgeMs != null && lastSyncAgeMs > 60 * 60 * 1000
  const staleHours =
    isStale && lastSyncAgeMs != null
      ? Math.floor(lastSyncAgeMs / (60 * 60 * 1000))
      : 0

  const now = new Date()
  const headerDate = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  const dueSoon = useMemo(
    () => dueSoonRegulars(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, dataVersion, today]
  )
  const handleDismissBanner = useCallback(() => {
    setAppSetting('dismissed_due_soon_date', today)
    setBannerDismissedOn(today)
  }, [today])

  const scrollToUpcoming = useCallback(() => {
    const el = document.getElementById('dashboard-section-upcoming')
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    el.classList.add('dashboard-scroll-highlight')
    setTimeout(() => el.classList.remove('dashboard-scroll-highlight'), 2000)
  }, [])

  const dueSoonAlert = useMemo(() => {
    if (bannerDismissedToday || dueSoon.length === 0) return null
    return (
      <div
        className="alert alert-warning d-flex align-items-start gap-2 py-2 mb-4"
        role="alert"
      >
        <i
          className="mdi mdi-bell-ring flex-shrink-0"
          aria-hidden
          style={{ lineHeight: 1.5 }}
        />
        <div className="flex-grow-1">
          <div>
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
          </div>
          <div className="small mt-1">
            Reminders you set · each clears itself when the payment lands
            <button
              type="button"
              className="btn btn-link btn-sm p-0 ms-2 align-baseline"
              onClick={scrollToUpcoming}
            >
              Manage in Upcoming →
            </button>
          </div>
        </div>
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
  }, [dueSoon, bannerDismissedToday, handleDismissBanner, scrollToUpcoming])

  const openCustomiseModal = useCallback(() => {
    setDraftSizes(getDashboardSectionSizes())
    setDraftVisibility(getDashboardSectionVisibility())
    setShowCustomiseModal(true)
  }, [])

  const saveCustomise = useCallback(() => {
    setDashboardSectionSizes(draftSizes)
    setDashboardSectionVisibility(draftVisibility)
    setSectionSizes(draftSizes)
    setSectionVisibility(draftVisibility)
    setShowCustomiseModal(false)
  }, [draftSizes, draftVisibility])

  const handleManualSync = useCallback(async () => {
    const token = sessionStore.getState().getToken()
    if (!token || syncStore.getState().syncing) return
    if (getAppSetting('demo_mode') === '1') {
      toast.info('Demo mode – no sync.')
      return
    }
    try {
      if ((await runSync(token)) === 'ran') {
        toast.success('Sync complete. Data updated.')
      }
    } catch (err) {
      const message =
        err instanceof UpBankUnauthorizedError
          ? SYNC_401_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Sync failed. Please try again.'
      toast.error(message)
    }
  }, [])

  useEffect(() => {
    if (shouldShowDashboardTour()) {
      const visibleSections = sectionOrder.filter(
        (id) => sectionVisibility[id] !== false
      )
      const t = setTimeout(() => startDashboardTour(visibleSections), 400)
      return () => clearTimeout(t)
    }
  }, [sectionOrder, sectionVisibility])

  useEffect(() => {
    setSectionOrder(getDashboardSectionOrder())
    setSectionSizes(getDashboardSectionSizes())
    setSectionVisibility(getDashboardSectionVisibility())
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

  const getSectionComponent = useCallback(
    (
      id: DashboardSectionId,
      dragHandleProps: React.HTMLAttributes<HTMLSpanElement>
    ) => {
      switch (id) {
        case 'month_summary':
          return <MonthSummarySection dragHandleProps={dragHandleProps} />
        case 'trackers':
          return <TrackersSection dragHandleProps={dragHandleProps} />
        case 'upcoming':
          return (
            <UpcomingSection
              dragHandleProps={dragHandleProps}
              onUpcomingChange={() => setDataVersion((v) => v + 1)}
            />
          )
        default:
          return null
      }
    },
    []
  )

  function renderSectionCell(id: DashboardSectionId) {
    const isDragOver = dragOverId === id
    const tourAttr = TOUR_DATA_ATTRS[id]
    const size = sectionSizes[id] ?? 'small'
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
        data-size={size}
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
            onClick={openCustomiseModal}
            aria-label="Customise dashboard"
            title="Customise dashboard"
          >
            <i className="mdi mdi-tune-variant" aria-hidden />
          </button>
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
      <MonthReviewCard />
      <HeadroomSection
        refreshKey={`${lastSyncCompletedAt}|${dataVersion}|${today}`}
        onChange={bumpDataVersion}
      />
      {dueSoonAlert}

      <Modal
        show={showCustomiseModal}
        onHide={() => setShowCustomiseModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Customise Dashboard</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {sectionOrder.map((id) => (
            <div
              key={id}
              className="d-flex align-items-center justify-content-between py-2"
              style={{ borderBottom: '1px solid var(--vantura-border)' }}
            >
              <Form.Check
                type="switch"
                id={`customise-toggle-${id}`}
                checked={draftVisibility[id] ?? true}
                onChange={(e) =>
                  setDraftVisibility((prev) => ({
                    ...prev,
                    [id]: e.target.checked,
                  }))
                }
                label={DASHBOARD_SECTION_LABELS[id]}
              />
              <div className="btn-group btn-group-sm ms-3">
                {(['small', 'medium', 'large'] as DashboardSectionSize[]).map(
                  (size) => (
                    <button
                      key={size}
                      type="button"
                      className={`btn btn-sm ${
                        draftSizes[id] === size
                          ? 'btn-outline-primary'
                          : 'btn-outline-secondary'
                      }`}
                      disabled={!(draftVisibility[id] ?? true)}
                      onClick={() =>
                        setDraftSizes((prev) => ({ ...prev, [id]: size }))
                      }
                    >
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          <p className="text-muted small mt-3 mb-0">
            <i className="mdi mdi-drag me-1" aria-hidden />
            Drag cards on the dashboard to reorder them.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCustomiseModal(false)}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={saveCustomise}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      <div className="dashboard-grid">
        {sectionOrder
          .filter((id) => sectionVisibility[id] !== false)
          .map((id) => renderSectionCell(id))}
      </div>
    </div>
  )
}
