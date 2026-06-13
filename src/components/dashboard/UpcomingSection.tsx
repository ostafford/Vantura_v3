import { useState, useMemo } from 'react'
import {
  Card,
  Button,
  Modal,
  Form,
  OverlayTrigger,
  Tooltip,
  ButtonGroup,
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
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import {
  getBuckets,
  getUpcomingBucketId,
  assignUpcomingToBucket,
} from '@/services/budgetBuckets'
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
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <i className="mdi mdi-chevron-left" aria-hidden />
        </Button>
        <span className="fw-medium">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <i className="mdi mdi-chevron-right" aria-hidden />
        </Button>
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
  const [isSubscription, setIsSubscription] = useState(false)
  const [cancelByDate, setCancelByDate] = useState('')
  const [upcomingBucketId, setUpcomingBucketId] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allBuckets = useMemo(() => getBuckets(), [refresh])
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
    setIsSubscription(false)
    setCancelByDate('')
    setUpcomingBucketId(null)
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
    setIsSubscription(c.is_subscription === 1)
    setCancelByDate(c.cancel_by_date ?? '')
    setUpcomingBucketId(getUpcomingBucketId(c.id))
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
        isSubscription,
        cancelBy
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
        isSubscription,
        cancelBy
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
          {c.name}
          {c.is_subscription === 1 && (
            <span className="badge badge-subscription ms-1">Sub</span>
          )}
          {dueLabel && (
            <span className="badge badge-reminder ms-1">{dueLabel}</span>
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
            <span
              className="page-title-icon bg-gradient-primary text-white mr-2"
              {...dragHandleProps}
            >
              <i className="mdi mdi-calendar-clock" aria-hidden />
            </span>
            <span>Upcoming transactions</span>
            <ButtonGroup size="sm" className="ms-2">
              <Button
                variant={viewMode === 'list' ? 'primary' : 'outline-secondary'}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                List
              </Button>
              <Button
                variant={
                  viewMode === 'calendar' ? 'primary' : 'outline-secondary'
                }
                onClick={() => setViewMode('calendar')}
                aria-pressed={viewMode === 'calendar'}
              >
                Calendar
              </Button>
            </ButtonGroup>
            <HelpPopover
              id="upcoming-help"
              title="Upcoming charges"
              content="Add bills and subscriptions you know are coming. Each charge has a name, amount, frequency, and next due date. Charges marked Include in Spendable reduce your Spendable balance until that date. Grouped by next pay vs later."
              ariaLabel="What are upcoming charges?"
            />
          </div>
          <OverlayTrigger
            placement="top"
            overlay={
              <Tooltip id="upcoming-add-tooltip">Add upcoming charge</Tooltip>
            }
          >
            <Button
              variant="primary"
              size="sm"
              onClick={openCreate}
              aria-label="Add upcoming charge"
            >
              <i className="mdi mdi-plus" aria-hidden />
            </Button>
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
              {nextPay.length > 0 && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>Next pay</strong>
                    <span className="text-danger fw-normal small">
                      ${formatMoney(nextPayTotal)} total
                    </span>
                  </div>
                  {nextPay.map((c) => {
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
                                {c.is_subscription === 1 && (
                                  <span className="badge badge-subscription ms-1">
                                    Sub
                                  </span>
                                )}
                                {dueLabel && (
                                  <span className="badge badge-reminder ms-1">
                                    {dueLabel}
                                  </span>
                                )}
                              </div>
                              <div className="small text-muted">
                                {formatShortDate(c.next_charge_date)} ·{' '}
                                {c.frequency.charAt(0) +
                                  c.frequency.slice(1).toLowerCase()}
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
              {later.length > 0 && (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>Later</strong>
                    <span className="text-muted small">
                      ${formatMoney(laterTotal)}
                    </span>
                  </div>
                  {later.map((c) => {
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
                                {c.is_subscription === 1 && (
                                  <span className="badge badge-subscription ms-1">
                                    Sub
                                  </span>
                                )}
                                {dueLabel && (
                                  <span className="badge badge-reminder ms-1">
                                    {dueLabel}
                                  </span>
                                )}
                              </div>
                              <div className="small text-muted">
                                {formatShortDate(c.next_charge_date)} ·{' '}
                                {c.frequency.charAt(0) +
                                  c.frequency.slice(1).toLowerCase()}
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
                {nextPay.length > 0 && (
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
                    {nextPay.map(renderDataRow)}
                  </>
                )}
                {later.length > 0 && (
                  <>
                    <tr className="upcoming-section-header">
                      <td colSpan={4}>
                        <div className="d-flex justify-content-between align-items-center">
                          <strong>Later</strong>
                          <span>${formatMoney(laterTotal)}</span>
                        </div>
                      </td>
                    </tr>
                    {later.map(renderDataRow)}
                  </>
                )}
              </tbody>
            </table>
          )}
          <div className="mt-2 small text-danger">
            ${formatMoney(reserved)} reserved for upcoming
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
          <Form>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="upcoming-charge-name">Name</Form.Label>
              <Form.Control
                id="upcoming-charge-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
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
            <Form.Group className="mb-2">
              <Form.Label htmlFor="upcoming-charge-frequency">
                Frequency
              </Form.Label>
              <Form.Select
                id="upcoming-charge-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2">
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
            <Form.Group className="mb-2">
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
            <Form.Group className="mb-2">
              <Form.Check
                type="checkbox"
                id="upcoming-charge-is-reserved"
                name="isReserved"
                label="Include in Spendable (reserve this amount)"
                checked={isReserved}
                onChange={(e) => setIsReserved(e.target.checked)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
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
                onChange={(e) => setReminderDaysBefore(e.target.value)}
              />
              <Form.Text className="text-muted">
                Optional. Show &quot;Due in N days&quot; when within this many
                days.
              </Form.Text>
            </Form.Group>
            {allBuckets.length > 0 && (
              <Form.Group className="mb-2">
                <Form.Label htmlFor="upcoming-charge-bucket">
                  Budget bucket
                </Form.Label>
                <Form.Select
                  id="upcoming-charge-bucket"
                  value={
                    upcomingBucketId != null ? String(upcomingBucketId) : ''
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
            )}
            <Form.Group className="mb-2">
              <Form.Check
                type="checkbox"
                id="upcoming-charge-is-subscription"
                label="Subscription (e.g. streaming)"
                checked={isSubscription}
                onChange={(e) => setIsSubscription(e.target.checked)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="upcoming-charge-cancel-by">
                Cancel by date (optional)
              </Form.Label>
              <Form.Control
                id="upcoming-charge-cancel-by"
                type="date"
                value={cancelByDate}
                onChange={(e) => setCancelByDate(e.target.value)}
              />
              <Form.Text className="text-muted">
                For subscriptions you plan to cancel.
              </Form.Text>
            </Form.Group>
          </Form>
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
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
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
