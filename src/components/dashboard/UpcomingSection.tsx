import { useState, useMemo } from 'react'
import {
  Card,
  Button,
  Modal,
  Form,
  Row,
  Col,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getUpcomingChargesGrouped,
  createUpcomingCharge,
  updateUpcomingCharge,
  deleteUpcomingCharge,
  getUpcomingChargesForMonth,
  daysUntilCharge,
  type UpcomingChargeRow,
} from '@/services/upcoming'
import { getReservedAmount } from '@/services/balance'
import { getCategories } from '@/services/categories'
import {
  searchRecentDebits,
  type AnchorDebitRow,
} from '@/services/budgetTransactionAnchors'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import {
  getBuckets,
  getUpcomingBucketId,
  assignUpcomingToBucket,
} from '@/services/budgetBuckets'
import {
  getManualAccounts,
  type ManualAccountRow,
} from '@/services/manualAccounts'
import { HelpPopover } from '@/components/HelpPopover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY, MONTH_NAMES } from '@/lib/constants'
import type React from 'react'

const FREQUENCIES = [
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'ONCE',
]

/** Default number of rows shown before the "Show all" toggle appears. */
const DEFAULT_VISIBLE_COUNT = 5

/** Given an anchor date (from a past transaction) and a frequency, returns the
 *  next future occurrence as a YYYY-MM-DD string. */
function calcNextChargeDate(anchorDateStr: string, frequency: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (frequency === 'ONCE') {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  }

  const [y, m, d] = anchorDateStr.slice(0, 10).split('-').map(Number)
  const next = new Date(y, m - 1, d)

  while (next <= today) {
    switch (frequency) {
      case 'WEEKLY':
        next.setDate(next.getDate() + 7)
        break
      case 'FORTNIGHTLY':
        next.setDate(next.getDate() + 14)
        break
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1)
        break
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3)
        break
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + 1)
        break
      default:
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    }
  }

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function UpcomingCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  daysByDate,
  onChargeClick,
}: {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  daysByDate: Record<string, UpcomingChargeRow[]>
  onChargeClick: (c: UpcomingChargeRow) => void
}) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  // Mon=0 … Sun=6 so the grid starts on Monday (AU convention)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
  const leadingBlanks = startWeekday
  const todayLocal = (() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })()
  const dayNumbers: (number | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) dayNumbers.push(null)
  for (let d = 1; d <= daysInMonth; d++) dayNumbers.push(d)
  while (dayNumbers.length < totalCells) dayNumbers.push(null)

  return (
    <div className="upcoming-calendar">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <button
          type="button"
          className="btn-icon"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <i className="mdi mdi-chevron-left" aria-hidden />
        </button>
        <span className="fw-medium">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          type="button"
          className="btn-icon"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <i className="mdi mdi-chevron-right" aria-hidden />
        </button>
      </div>
      <div className="d-flex flex-wrap small mb-1 text-muted">
        <span className="upcoming-calendar-dow">Mon</span>
        <span className="upcoming-calendar-dow">Tue</span>
        <span className="upcoming-calendar-dow">Wed</span>
        <span className="upcoming-calendar-dow">Thu</span>
        <span className="upcoming-calendar-dow">Fri</span>
        <span className="upcoming-calendar-dow">Sat</span>
        <span className="upcoming-calendar-dow">Sun</span>
      </div>
      <div className="upcoming-calendar-grid">
        {dayNumbers.map((d, i) => {
          if (d === null) {
            return (
              <div
                key={`empty-${i}`}
                className="upcoming-calendar-cell upcoming-calendar-cell-empty"
              />
            )
          }
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const charges = daysByDate[dateStr] ?? []
          const isToday = dateStr === todayLocal
          return (
            <div
              key={dateStr}
              className={`upcoming-calendar-cell${isToday ? ' upcoming-calendar-cell-today' : ''}`}
            >
              <span className="upcoming-calendar-day-num">{d}</span>
              {charges.length > 0 && (
                <div className="upcoming-calendar-cell-charges">
                  {charges.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn btn-link btn-sm p-0 text-start d-flex flex-column"
                      style={{ fontSize: '0.7rem', maxWidth: '100%' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onChargeClick(c)
                      }}
                      aria-label={`${c.name} $${formatMoney(c.amount)}`}
                    >
                      <span
                        className="text-truncate"
                        style={{ maxWidth: '100%' }}
                      >
                        {c.name}
                      </span>
                      <span className="text-muted">
                        ${formatMoney(c.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface UpcomingSectionProps {
  onUpcomingChange?: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}

export function UpcomingSection({
  onUpcomingChange,
  dragHandleProps,
}: UpcomingSectionProps) {
  const [refresh, setRefresh] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingCharge, setEditingCharge] = useState<UpcomingChargeRow | null>(
    null
  )
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('MONTHLY')
  const [nextChargeDate, setNextChargeDate] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [isReserved, setIsReserved] = useState(true)
  const [reminderDaysBefore, setReminderDaysBefore] = useState<string>('')
  const [cancelByDate, setCancelByDate] = useState('')
  const [upcomingBucketId, setUpcomingBucketId] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [chargeType, setChargeType] = useState<
    'EXPENSE' | 'LIABILITY_REPAYMENT'
  >('EXPENSE')
  const [linkedManualAccountId, setLinkedManualAccountId] = useState<
    number | null
  >(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [showAll, setShowAll] = useState(false)
  const [createStep, setCreateStep] = useState<'search' | 'form'>('search')
  const [txSearch, setTxSearch] = useState('')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [importedFromTx, setImportedFromTx] = useState<AnchorDebitRow | null>(
    null
  )
  const [matchRawText, setMatchRawText] = useState<string | null>(null)
  const [matchDescription, setMatchDescription] = useState<string>('')
  const [showSettlementPicker, setShowSettlementPicker] = useState(false)
  const [settlementSearch, setSettlementSearch] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  const { nextPay, later, nextPayday } = useMemo(
    () => getUpcomingChargesGrouped(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh]
  )
  const calendarCharges = useMemo(
    () => getUpcomingChargesForMonth(calendarMonth.year, calendarMonth.month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendarMonth.year, calendarMonth.month, refresh]
  )
  const calendarDaysByDate = useMemo(() => {
    const map: Record<string, UpcomingChargeRow[]> = {}
    for (const c of calendarCharges) {
      const d = c.next_charge_date.slice(0, 10)
      if (!map[d]) map[d] = []
      map[d].push(c)
    }
    return map
  }, [calendarCharges])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reserved = useMemo(() => getReservedAmount(), [refresh])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const categories = useMemo(() => getCategories(), [refresh])
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allBuckets = useMemo(() => getBuckets(), [refresh])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allManualAccounts = useMemo(() => getManualAccounts(), [refresh])
  const manualLiabilities = allManualAccounts.filter(
    (a: ManualAccountRow) => a.kind === 'liability'
  )
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  function openCreate() {
    setEditingCharge(null)
    setName('')
    setAmount('')
    setFrequency('MONTHLY')
    const d = new Date()
    setNextChargeDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
    setCategoryId('')
    setIsReserved(true)
    setReminderDaysBefore('')
    setCancelByDate('')
    setUpcomingBucketId(null)
    setCreateStep('search')
    setTxSearch('')
    setMoreOptionsOpen(false)
    setImportedFromTx(null)
    setMatchRawText(null)
    setMatchDescription('')
    setShowSettlementPicker(false)
    setSettlementSearch('')
    setChargeType('EXPENSE')
    setLinkedManualAccountId(null)
    setShowModal(true)
  }

  function openEdit(c: UpcomingChargeRow) {
    setEditingCharge(c)
    setName(c.name)
    setAmount(String(c.amount / 100))
    setFrequency(c.frequency)
    setNextChargeDate(c.next_charge_date)
    setCategoryId(c.category_id ?? '')
    setIsReserved(c.is_reserved === 1)
    setReminderDaysBefore(
      c.reminder_days_before != null ? String(c.reminder_days_before) : ''
    )
    setCancelByDate(c.cancel_by_date ?? '')
    const bucketId = getUpcomingBucketId(c.id)
    setUpcomingBucketId(bucketId)
    setImportedFromTx(null)
    setMatchRawText(c.match_raw_text ?? null)
    setMatchDescription('')
    setShowSettlementPicker(false)
    setSettlementSearch('')
    setChargeType(c.charge_type ?? 'EXPENSE')
    setLinkedManualAccountId(c.linked_manual_account_id ?? null)
    setMoreOptionsOpen(
      !!(
        c.category_id ||
        c.reminder_days_before != null ||
        c.cancel_by_date ||
        bucketId != null ||
        c.charge_type === 'LIABILITY_REPAYMENT'
      )
    )
    setShowModal(true)
  }

  function handleSave() {
    const amountCents = Math.round(parseFloat(amount || '0') * 100)
    if (!name.trim() || amountCents <= 0 || !nextChargeDate) {
      toast.error('Please fill in name, amount, and next charge date.')
      return
    }
    const reminder =
      reminderDaysBefore.trim() === '' ? null : parseInt(reminderDaysBefore, 10)
    const reminderDays =
      reminder != null && !Number.isNaN(reminder) ? reminder : null
    const cancelBy = cancelByDate.trim() ? cancelByDate.slice(0, 10) : null
    if (cancelBy && cancelBy < nextChargeDate.slice(0, 10)) {
      toast.error(
        'Cancel by date is before the next charge date — this charge would never appear.'
      )
      return
    }
    if (editingCharge) {
      updateUpcomingCharge(
        editingCharge.id,
        name.trim(),
        amountCents,
        frequency,
        nextChargeDate,
        categoryId || null,
        isReserved,
        reminderDays,
        false,
        cancelBy,
        chargeType,
        chargeType === 'LIABILITY_REPAYMENT' ? linkedManualAccountId : null,
        matchRawText
      )
      assignUpcomingToBucket(editingCharge.id, upcomingBucketId)
      toast.success('Upcoming charge updated.')
    } else {
      const newId = createUpcomingCharge(
        name.trim(),
        amountCents,
        frequency,
        nextChargeDate,
        categoryId || null,
        isReserved,
        reminderDays,
        false,
        cancelBy,
        chargeType,
        chargeType === 'LIABILITY_REPAYMENT' ? linkedManualAccountId : null,
        matchRawText
      )
      assignUpcomingToBucket(newId, upcomingBucketId)
      toast.success('Upcoming charge added.')
    }
    setShowModal(false)
    setRefresh((r) => r + 1)
    onUpcomingChange?.()
  }

  function handleDelete() {
    if (!editingCharge) return
    deleteUpcomingCharge(editingCharge.id)
    setShowDeleteConfirm(false)
    setShowModal(false)
    setRefresh((r) => r + 1)
    onUpcomingChange?.()
  }

  const nextPayTotal = nextPay.reduce((s, c) => s + c.amount, 0)
  const laterTotal = later.reduce((s, c) => s + c.amount, 0)
  const hasAny = nextPay.length > 0 || later.length > 0
  const totalCount = nextPay.length + later.length
  const isCapped = !showAll && totalCount > DEFAULT_VISIBLE_COUNT
  // Next pay charges are more time-sensitive, so they claim the visible
  // slots first; Later fills whatever's left of the default count.
  const visibleNextPay = isCapped
    ? nextPay.slice(0, DEFAULT_VISIBLE_COUNT)
    : nextPay
  const visibleLater = isCapped
    ? later.slice(0, Math.max(0, DEFAULT_VISIBLE_COUNT - visibleNextPay.length))
    : later
  const hiddenCount = totalCount - visibleNextPay.length - visibleLater.length

  function reminderLabel(c: UpcomingChargeRow): string | null {
    if (c.reminder_days_before == null || c.reminder_days_before < 0)
      return null
    const days = daysUntilCharge(c.next_charge_date)
    if (days < 0) return 'Overdue'
    if (days === 0) return 'Due today'
    if (days <= c.reminder_days_before)
      return `Due in ${days} day${days === 1 ? '' : 's'}`
    return null
  }

  function renderDataRow(c: UpcomingChargeRow) {
    const dueLabel = reminderLabel(c)
    const categoryName = c.category_id
      ? categoryNameById.get(c.category_id)
      : null
    return (
      <tr
        key={c.id}
        role="button"
        tabIndex={0}
        onClick={() => openEdit(c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openEdit(c)
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <td>{formatShortDate(c.next_charge_date)}</td>
        <td>
          <div>
            {c.name}
            {dueLabel && (
              <span className="badge badge-reminder ms-1">{dueLabel}</span>
            )}
          </div>
          {(categoryName || c.is_reserved === 0) && (
            <div className="small text-muted">
              {[
                categoryName,
                c.is_reserved === 0 ? 'excluded from Spendable' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </td>
        <td>{c.frequency.charAt(0) + c.frequency.slice(1).toLowerCase()}</td>
        <td className="text-end">${formatMoney(c.amount)}</td>
      </tr>
    )
  }

  return (
    <>
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center section-header">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="page-title-icon" {...dragHandleProps}>
              <i className="mdi mdi-calendar-clock" aria-hidden />
            </span>
            <span>Upcoming transactions</span>
            <div
              className="period-toggle ms-2"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                className={`segment-btn${viewMode === 'list' ? ' active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                List
              </button>
              <button
                type="button"
                className={`segment-btn${viewMode === 'calendar' ? ' active' : ''}`}
                onClick={() => setViewMode('calendar')}
                aria-pressed={viewMode === 'calendar'}
              >
                Calendar
              </button>
            </div>
            <HelpPopover
              id="upcoming-help"
              title="Upcoming charges"
              content="Add bills and subscriptions you know are coming — rent, Netflix, insurance, etc. Set a name, amount, frequency (weekly, fortnightly, monthly, quarterly, yearly, or once), and next due date. The date auto-advances each cycle. Grouped into Next pay (before your next payday) and Later, each showing the face-value total of what's listed. Charges marked Include in Spendable reduce your Spendable balance until they're due — the 'reserved for upcoming charges' total below is just that subset, prorated to your pay cycle, so it won't match the group totals above."
              ariaLabel="What are upcoming charges?"
            />
          </div>
          <OverlayTrigger
            placement="top"
            overlay={
              <Tooltip id="upcoming-add-tooltip">Add upcoming charge</Tooltip>
            }
          >
            <button
              type="button"
              className="btn-icon btn-icon-primary"
              onClick={openCreate}
              aria-label="Add upcoming charge"
            >
              <i className="mdi mdi-plus" aria-hidden />
            </button>
          </OverlayTrigger>
        </Card.Header>
        <Card.Body>
          {nextPayday && viewMode === 'list' && (
            <p className="small text-muted mb-2">
              Next pay day — {formatShortDate(nextPayday)}
            </p>
          )}
          {viewMode === 'calendar' ? (
            <UpcomingCalendar
              year={calendarMonth.year}
              month={calendarMonth.month}
              onPrevMonth={() =>
                setCalendarMonth((prev) => {
                  if (prev.month <= 1) return { year: prev.year - 1, month: 12 }
                  return { year: prev.year, month: prev.month - 1 }
                })
              }
              onNextMonth={() =>
                setCalendarMonth((prev) => {
                  if (prev.month >= 12) return { year: prev.year + 1, month: 1 }
                  return { year: prev.year, month: prev.month + 1 }
                })
              }
              daysByDate={calendarDaysByDate}
              onChargeClick={openEdit}
            />
          ) : !hasAny ? (
            <p className="text-muted small mb-0">
              No upcoming charges. Add a regular charge to track.
            </p>
          ) : isMobile ? (
            <div className="upcoming-list-vertical">
              {visibleNextPay.length > 0 && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>Next pay</strong>
                    <span className="text-danger fw-normal small">
                      ${formatMoney(nextPayTotal)} total
                    </span>
                  </div>
                  {visibleNextPay.map((c) => {
                    const dueLabel = reminderLabel(c)
                    return (
                      <Card
                        key={c.id}
                        className="mb-2 upcoming-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(c)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <Card.Body className="py-2 px-3">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div>
                              <div className="fw-medium">
                                {c.name}
                                {dueLabel && (
                                  <span className="badge badge-reminder ms-1">
                                    {dueLabel}
                                  </span>
                                )}
                              </div>
                              <div className="small text-muted">
                                {[
                                  `${formatShortDate(c.next_charge_date)} · ${
                                    c.frequency.charAt(0) +
                                    c.frequency.slice(1).toLowerCase()
                                  }`,
                                  c.category_id
                                    ? categoryNameById.get(c.category_id)
                                    : null,
                                  c.is_reserved === 0
                                    ? 'excluded from Spendable'
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                            <div className="text-end">
                              ${formatMoney(c.amount)}
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    )
                  })}
                </div>
              )}
              {visibleLater.length > 0 && (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>Later</strong>
                    <span className="text-muted small">
                      ${formatMoney(laterTotal)}
                    </span>
                  </div>
                  {visibleLater.map((c) => {
                    const dueLabel = reminderLabel(c)
                    return (
                      <Card
                        key={c.id}
                        className="mb-2 upcoming-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(c)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <Card.Body className="py-2 px-3">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <div>
                              <div className="fw-medium">
                                {c.name}
                                {dueLabel && (
                                  <span className="badge badge-reminder ms-1">
                                    {dueLabel}
                                  </span>
                                )}
                              </div>
                              <div className="small text-muted">
                                {[
                                  `${formatShortDate(c.next_charge_date)} · ${
                                    c.frequency.charAt(0) +
                                    c.frequency.slice(1).toLowerCase()
                                  }`,
                                  c.category_id
                                    ? categoryNameById.get(c.category_id)
                                    : null,
                                  c.is_reserved === 0
                                    ? 'excluded from Spendable'
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                            <div className="text-end">
                              ${formatMoney(c.amount)}
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <table className="table table-striped mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Frequency</th>
                  <th className="text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleNextPay.length > 0 && (
                  <>
                    <tr className="upcoming-section-header">
                      <td colSpan={4}>
                        <div className="d-flex justify-content-between align-items-center page-title">
                          <strong>Next pay</strong>
                          <span className="text-danger fw-normal">
                            ${formatMoney(nextPayTotal)}{' '}
                            <span className="text-muted">total</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {visibleNextPay.map(renderDataRow)}
                  </>
                )}
                {visibleLater.length > 0 && (
                  <>
                    <tr className="upcoming-section-header">
                      <td colSpan={4}>
                        <div className="d-flex justify-content-between align-items-center">
                          <strong>Later</strong>
                          <span>${formatMoney(laterTotal)}</span>
                        </div>
                      </td>
                    </tr>
                    {visibleLater.map(renderDataRow)}
                  </>
                )}
              </tbody>
            </table>
          )}
          {viewMode === 'list' && totalCount > DEFAULT_VISIBLE_COUNT && (
            <button
              type="button"
              className="btn btn-link btn-sm p-0 mt-2"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? 'Show less'
                : `Show all ${totalCount} (${hiddenCount} more)`}
            </button>
          )}
          <div className="mt-2 small text-danger">
            ${formatMoney(reserved)} reserved for upcoming charges
          </div>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingCharge ? 'Edit upcoming charge' : 'Add upcoming charge'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* ── Search step (new charges only) ───────────────────────────────── */}
          {!editingCharge &&
            createStep === 'search' &&
            (() => {
              const txResults = searchRecentDebits(txSearch, 40)
              return (
                <div>
                  <Form.Control
                    type="text"
                    placeholder="Search your transactions…"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    autoFocus
                    className="mb-2"
                  />
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {txResults.length === 0 ? (
                      <p className="text-muted small text-center py-2 mb-0">
                        No transactions found.
                      </p>
                    ) : (
                      txResults.map((tx) => (
                        <div
                          key={tx.id}
                          role="button"
                          tabIndex={0}
                          className="d-flex justify-content-between align-items-center py-2 px-2 rounded"
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--bs-border-color)',
                          }}
                          onClick={() => {
                            setName(tx.description)
                            setAmount((tx.amount / 100).toFixed(2))
                            setCategoryId(tx.category_id ?? '')
                            if (tx.category_id) setMoreOptionsOpen(true)
                            setNextChargeDate(
                              calcNextChargeDate(tx.date, frequency)
                            )
                            setImportedFromTx(tx)
                            if (tx.raw_text) {
                              setMatchRawText(tx.raw_text)
                              setMatchDescription(tx.description)
                            }
                            setCreateStep('form')
                            setTxSearch('')
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setName(tx.description)
                              setAmount((tx.amount / 100).toFixed(2))
                              setCategoryId(tx.category_id ?? '')
                              if (tx.category_id) setMoreOptionsOpen(true)
                              setNextChargeDate(
                                calcNextChargeDate(tx.date, frequency)
                              )
                              setImportedFromTx(tx)
                              if (tx.raw_text) {
                                setMatchRawText(tx.raw_text)
                                setMatchDescription(tx.description)
                              }
                              setCreateStep('form')
                              setTxSearch('')
                            }
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              'var(--bs-tertiary-bg)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = ''
                          }}
                        >
                          <div className="min-w-0 me-2">
                            <div
                              className="fw-medium text-truncate"
                              style={{ maxWidth: 300 }}
                            >
                              {tx.description}
                            </div>
                            <div className="text-muted small">
                              {formatShortDate(tx.date)}
                            </div>
                          </div>
                          <div className="fw-semibold flex-shrink-0">
                            ${formatMoney(tx.amount)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <hr className="my-3" />
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 text-muted"
                    onClick={() => {
                      setImportedFromTx(null)
                      setCreateStep('form')
                    }}
                  >
                    Add manually instead
                  </Button>
                </div>
              )
            })()}

          {/* ── Form step (after search pick, manual entry, or editing) ───────── */}
          {(editingCharge || createStep === 'form') && (
            <Form>
              {/* Imported badge / back link — create only */}
              {!editingCharge && (
                <div className="mb-3">
                  {importedFromTx ? (
                    <div
                      className="d-flex align-items-center justify-content-between px-2 py-2 rounded"
                      style={{
                        background: 'var(--bs-tertiary-bg)',
                        border: '1px solid var(--bs-border-color)',
                      }}
                    >
                      <span className="small text-muted">
                        <i className="mdi mdi-link-variant me-1" aria-hidden />
                        Imported: <strong>{importedFromTx.description}</strong>
                      </span>
                      <div className="d-flex align-items-center gap-2 ms-2">
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted small"
                          onClick={() => {
                            setImportedFromTx(null)
                            setName('')
                            setAmount('')
                            setCreateStep('search')
                          }}
                        >
                          Change
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted"
                          onClick={() => {
                            setImportedFromTx(null)
                            setName('')
                            setAmount('')
                          }}
                          aria-label="Clear import"
                        >
                          <i className="mdi mdi-close" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-muted"
                      onClick={() => setCreateStep('search')}
                    >
                      <i className="mdi mdi-chevron-left me-1" aria-hidden />
                      Back to search
                    </Button>
                  )}
                </div>
              )}

              {/* ── Core fields ────────────────────────────────────────────────── */}
              <Form.Group className="mb-3">
                <Form.Label htmlFor="upcoming-charge-name">Name</Form.Label>
                <Form.Control
                  id="upcoming-charge-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Form.Group>

              <Row className="g-3 mb-3">
                <Col xs={12} sm={6}>
                  <Form.Group>
                    <Form.Label htmlFor="upcoming-charge-amount">
                      Amount ($)
                    </Form.Label>
                    <Form.Control
                      id="upcoming-charge-amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} sm={6}>
                  <Form.Group>
                    <Form.Label htmlFor="upcoming-charge-frequency">
                      Frequency
                    </Form.Label>
                    <Form.Select
                      id="upcoming-charge-frequency"
                      name="frequency"
                      value={frequency}
                      onChange={(e) => {
                        const f = e.target.value
                        setFrequency(f)
                        if (importedFromTx) {
                          setNextChargeDate(
                            calcNextChargeDate(importedFromTx.date, f)
                          )
                        }
                      }}
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {f.charAt(0) + f.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label htmlFor="upcoming-charge-next-date">
                  Next charge date
                </Form.Label>
                <Form.Control
                  id="upcoming-charge-next-date"
                  name="nextChargeDate"
                  type="date"
                  value={nextChargeDate}
                  onChange={(e) => setNextChargeDate(e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id="upcoming-charge-is-reserved"
                  name="isReserved"
                  label="Include in Spendable (reserve this amount)"
                  checked={isReserved}
                  onChange={(e) => setIsReserved(e.target.checked)}
                />
              </Form.Group>

              {/* ── More options toggle ─────────────────────────────────────────── */}
              <Button
                variant="link"
                size="sm"
                className="p-0 text-muted mb-3"
                onClick={() => setMoreOptionsOpen((o) => !o)}
                aria-expanded={moreOptionsOpen}
              >
                <i
                  className={`mdi mdi-chevron-${moreOptionsOpen ? 'up' : 'down'} me-1`}
                  aria-hidden
                />
                {moreOptionsOpen ? 'Fewer options' : 'More options'}
              </Button>

              {moreOptionsOpen && (
                <>
                  <Row className="g-3 mb-3">
                    <Col xs={12} sm={allBuckets.length > 0 ? 6 : 12}>
                      <Form.Group>
                        <Form.Label htmlFor="upcoming-charge-category">
                          Category
                        </Form.Label>
                        <Form.Select
                          id="upcoming-charge-category"
                          name="categoryId"
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                        >
                          <option value="">None</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    {allBuckets.length > 0 && (
                      <Col xs={12} sm={6}>
                        <Form.Group>
                          <Form.Label htmlFor="upcoming-charge-bucket">
                            Budget bucket
                          </Form.Label>
                          <Form.Select
                            id="upcoming-charge-bucket"
                            value={
                              upcomingBucketId != null
                                ? String(upcomingBucketId)
                                : ''
                            }
                            onChange={(e) =>
                              setUpcomingBucketId(
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                          >
                            <option value="">None (unassigned)</option>
                            {allBuckets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    )}
                  </Row>

                  <Row className="g-3 mb-2">
                    <Col xs={12} sm={6}>
                      <Form.Group>
                        <Form.Label htmlFor="upcoming-charge-reminder">
                          Remind me (days before)
                        </Form.Label>
                        <Form.Control
                          id="upcoming-charge-reminder"
                          type="number"
                          min={0}
                          max={90}
                          placeholder="e.g. 3"
                          value={reminderDaysBefore}
                          onChange={(e) =>
                            setReminderDaysBefore(e.target.value)
                          }
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={12} sm={6}>
                      <Form.Group>
                        <Form.Label htmlFor="upcoming-charge-cancel-by">
                          Stop date
                        </Form.Label>
                        <Form.Control
                          id="upcoming-charge-cancel-by"
                          type="date"
                          value={cancelByDate}
                          onChange={(e) => setCancelByDate(e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Text className="text-muted d-block mb-2">
                    Reminder shows &quot;Due in N days&quot; when within the set
                    days. Stop date removes the charge after that date.
                  </Form.Text>

                  <Form.Group className="mb-2">
                    <Form.Label className="small">Charge type</Form.Label>
                    <Form.Select
                      size="sm"
                      value={chargeType}
                      onChange={(e) => {
                        setChargeType(
                          e.target.value as 'EXPENSE' | 'LIABILITY_REPAYMENT'
                        )
                        if (e.target.value !== 'LIABILITY_REPAYMENT')
                          setLinkedManualAccountId(null)
                      }}
                    >
                      <option value="EXPENSE">
                        Expense (reduces net worth)
                      </option>
                      <option value="LIABILITY_REPAYMENT">
                        Liability repayment (e.g. credit card payment)
                      </option>
                    </Form.Select>
                    <Form.Text className="text-muted">
                      Liability repayments are excluded from projected net worth
                      — paying a debt doesn&apos;t change your total wealth.
                    </Form.Text>
                  </Form.Group>

                  {chargeType === 'LIABILITY_REPAYMENT' &&
                    manualLiabilities.length > 0 && (
                      <Form.Group className="mb-2">
                        <Form.Label className="small">
                          Link to account
                        </Form.Label>
                        <Form.Select
                          size="sm"
                          value={
                            linkedManualAccountId != null
                              ? String(linkedManualAccountId)
                              : ''
                          }
                          onChange={(e) =>
                            setLinkedManualAccountId(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                        >
                          <option value="">None</option>
                          {manualLiabilities.map((a: ManualAccountRow) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                              {a.institution ? ` (${a.institution})` : ''}
                            </option>
                          ))}
                        </Form.Select>
                        <Form.Text className="text-muted">
                          Once this is linked and a settlement transaction is
                          set below, Vantura prompts you to reduce this
                          account&apos;s balance each time a payment is
                          detected.
                        </Form.Text>
                      </Form.Group>
                    )}

                  {/* ── Settlement tracking ─────────────────────────────────── */}
                  <Form.Group className="mb-2">
                    <Form.Label className="small">
                      Settlement tracking
                    </Form.Label>
                    {matchRawText ? (
                      <div
                        className="d-flex align-items-center gap-2 px-2 py-2 rounded"
                        style={{
                          background: 'var(--bs-tertiary-bg)',
                          border: '1px solid var(--bs-border-color)',
                        }}
                      >
                        <i
                          className="mdi mdi-link-variant flex-shrink-0"
                          style={{ color: 'var(--vantura-success)' }}
                          aria-hidden
                        />
                        <span
                          className="small flex-grow-1 text-truncate"
                          title={matchRawText}
                        >
                          {matchDescription || matchRawText}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted flex-shrink-0"
                          onClick={() => {
                            setMatchRawText(null)
                            setMatchDescription('')
                            setShowSettlementPicker(false)
                          }}
                          aria-label="Remove settlement link"
                        >
                          <i className="mdi mdi-close" aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => setShowSettlementPicker((v) => !v)}
                        >
                          <i
                            className="mdi mdi-link-variant me-1"
                            aria-hidden
                          />
                          Link a transaction
                        </Button>
                        {showSettlementPicker && (
                          <div className="mt-2">
                            <Form.Control
                              size="sm"
                              type="text"
                              placeholder="Search transactions…"
                              value={settlementSearch}
                              onChange={(e) =>
                                setSettlementSearch(e.target.value)
                              }
                              autoFocus
                              className="mb-1"
                            />
                            <div
                              style={{
                                maxHeight: 180,
                                overflowY: 'auto',
                                border: '1px solid var(--bs-border-color)',
                                borderRadius: 6,
                              }}
                            >
                              {(() => {
                                const trackable = searchRecentDebits(
                                  settlementSearch,
                                  20
                                ).filter((tx) => tx.raw_text != null)
                                if (trackable.length === 0) {
                                  return (
                                    <p className="text-muted small text-center py-2 mb-0 px-2">
                                      No trackable transactions found. Only
                                      transactions with a bank fingerprint can
                                      be linked.
                                    </p>
                                  )
                                }
                                return trackable.map((tx) => (
                                  <div
                                    key={tx.id}
                                    role="button"
                                    tabIndex={0}
                                    className="d-flex justify-content-between align-items-center px-2 py-1"
                                    style={{
                                      cursor: 'pointer',
                                      borderBottom:
                                        '1px solid var(--bs-border-color)',
                                      fontSize: '0.8rem',
                                    }}
                                    onClick={() => {
                                      setMatchRawText(tx.raw_text!)
                                      setMatchDescription(tx.description)
                                      setShowSettlementPicker(false)
                                      setSettlementSearch('')
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        setMatchRawText(tx.raw_text!)
                                        setMatchDescription(tx.description)
                                        setShowSettlementPicker(false)
                                        setSettlementSearch('')
                                      }
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background =
                                        'var(--bs-tertiary-bg)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = ''
                                    }}
                                  >
                                    <span className="text-truncate me-2">
                                      {tx.description}
                                    </span>
                                    <span className="text-muted flex-shrink-0">
                                      ${formatMoney(tx.amount)}
                                    </span>
                                  </div>
                                ))
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <Form.Text className="text-muted d-block mt-1">
                      When linked, your bill notification stays pinned until
                      this transaction settles.
                    </Form.Text>
                  </Form.Group>
                </>
              )}
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          {editingCharge && (
            <Button
              variant="outline-danger"
              className="me-auto"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          {(editingCharge || createStep === 'form') && (
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <Modal
        show={showDeleteConfirm}
        onHide={() => setShowDeleteConfirm(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete upcoming charge</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            Delete <strong>{editingCharge?.name}</strong>? This cannot be
            undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowDeleteConfirm(false)}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
