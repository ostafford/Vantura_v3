import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  Button,
  ProgressBar,
  Modal,
  Form,
  Badge,
  Collapse,
  Alert,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getTrackersWithProgress,
  getTrackersWithProgressForPeriod,
  getTrackerTransactionsInPeriod,
  getTrackerCategoryIds,
  createTracker,
  updateTracker,
  deleteTracker,
  type TrackerResetFrequency,
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { getPayAmountCents } from '@/services/balance'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { HelpPopover } from '@/components/HelpPopover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
import { ACCENT_PALETTES, type AccentId } from '@/lib/accentPalettes'

const BADGE_COLOR_SWATCHES = (Object.keys(ACCENT_PALETTES) as AccentId[]).map(
  (id) => ACCENT_PALETTES[id].primary
)

const RESET_FREQUENCIES: { value: TrackerResetFrequency; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'PAYDAY', label: 'Payday' },
]

const FREQUENCY_ORDER: TrackerResetFrequency[] = [
  'PAYDAY',
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
]

function getTrackerProgressStyle(progress: number): {
  variant: 'primary' | 'warning' | 'danger'
  striped: boolean
  animated: boolean
} {
  if (progress >= 100) {
    return { variant: 'danger', striped: true, animated: true }
  }
  if (progress >= 81) {
    return { variant: 'danger', striped: false, animated: false }
  }
  if (progress > 50) {
    return { variant: 'warning', striped: false, animated: false }
  }
  return { variant: 'primary', striped: false, animated: false }
}

export function TrackersSection() {
  const [, setRefresh] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [frequency, setFrequency] = useState<TrackerResetFrequency>('WEEKLY')
  const [resetDay, setResetDay] = useState(1)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [badgeColor, setBadgeColor] = useState<string | null>(null)
  const [periodOffset, setPeriodOffset] = useState(0)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const trackers = getTrackersWithProgressForPeriod(periodOffset)
  const categories = getCategories()
  const payAmountCents = getPayAmountCents()
  const totalPaydayBudgetCents = getTrackersWithProgress()
    .filter((t) => t.reset_frequency === 'PAYDAY')
    .reduce((sum, t) => sum + t.budget_amount, 0)
  const paydayBudgetExceedsPay =
    payAmountCents != null &&
    payAmountCents > 0 &&
    totalPaydayBudgetCents > payAmountCents

  function openCreate() {
    setEditingId(null)
    setName('')
    setBudget('')
    setFrequency('WEEKLY')
    setResetDay(1)
    setSelectedCategoryIds([])
    setBadgeColor(null)
    setShowModal(true)
  }

  function openEdit(t: {
    id: number
    name: string
    budget_amount: number
    reset_frequency: string
    reset_day: number | null
    badge_color?: string | null
  }) {
    setEditingId(t.id)
    setName(t.name)
    setBudget(String(t.budget_amount / 100))
    setFrequency(t.reset_frequency as TrackerResetFrequency)
    setResetDay(t.reset_day ?? 1)
    setSelectedCategoryIds(getTrackerCategoryIds(t.id))
    setBadgeColor(t.badge_color ?? null)
    setShowModal(true)
  }

  function handleSave() {
    const budgetCents = Math.round(parseFloat(budget || '0') * 100)
    if (!name.trim() || budgetCents <= 0 || selectedCategoryIds.length === 0)
      return
    if (editingId != null) {
      updateTracker(
        editingId,
        name.trim(),
        budgetCents,
        frequency,
        resetDay,
        selectedCategoryIds,
        badgeColor
      )
      toast.success('Tracker saved.')
    } else {
      createTracker(
        name.trim(),
        budgetCents,
        frequency,
        resetDay,
        selectedCategoryIds,
        badgeColor
      )
      toast.success('Tracker created.')
    }
    setShowModal(false)
    setRefresh((r) => r + 1)
  }

  function handleDelete(id: number) {
    deleteTracker(id)
    setShowModal(false)
    setRefresh((r) => r + 1)
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const resetDayOptions =
    frequency === 'MONTHLY'
      ? Array.from({ length: 28 }, (_, i) => i + 1)
      : [1, 2, 3, 4, 5, 6, 7]

  const budgetCentsForModal = Math.round(parseFloat(budget || '0') * 100)
  const otherPaydayBudgetCents =
    editingId != null
      ? trackers
          .filter((t) => t.reset_frequency === 'PAYDAY' && t.id !== editingId)
          .reduce((sum, t) => sum + t.budget_amount, 0)
      : totalPaydayBudgetCents
  const newTotalPaydayCents = otherPaydayBudgetCents + budgetCentsForModal
  const modalPaydayExceedsPay =
    frequency === 'PAYDAY' &&
    payAmountCents != null &&
    payAmountCents > 0 &&
    budgetCentsForModal > 0 &&
    newTotalPaydayCents > payAmountCents

  return (
    <>
      <Card>
        <Card.Header className="d-flex flex-column gap-2 section-header">
          {isMobile ? (
            <>
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center">
                  <span className="page-title-icon bg-gradient-primary text-white mr-2">
                    <i className="mdi mdi-chart-line" aria-hidden />
                  </span>
                  <div className="d-flex flex-column">
                    <span>Trackers</span>
                    <span className="small text-muted">
                      {periodOffset === 0
                        ? '(Current period)'
                        : periodOffset === -1
                          ? '(Previous period)'
                          : `(${-periodOffset} periods ago)`}
                    </span>
                  </div>
                  <HelpPopover
                    id="trackers-help"
                    title="Trackers"
                    content="Set a budget and reset frequency (Weekly, Fortnightly, Monthly, or Payday). Assign one or more categories to each tracker. The dashboard shows progress, days left, and transactions in the current period. Each tracker uses its own reset period (Weekly, Payday, etc.); Previous/Next steps each tracker back or forward by that period."
                    ariaLabel="What are trackers?"
                  />
                </div>
                <div className="d-flex gap-1">
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-analytics-header-tooltip">
                        Analytics coming soon
                      </Tooltip>
                    }
                  >
                    <Link
                      to="/analytics"
                      className="btn btn-outline-secondary btn-sm"
                      aria-label="Analytics coming soon"
                    >
                      <i className="mdi mdi-chart-box" aria-hidden />
                    </Link>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-add-tooltip">Add tracker</Tooltip>
                    }
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={openCreate}
                      aria-label="Add tracker"
                    >
                      <i className="mdi mdi-plus" aria-hidden />
                    </Button>
                  </OverlayTrigger>
                </div>
              </div>
              <div className="d-flex justify-content-center gap-2">
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id="trackers-prev-tooltip">
                      Previous period
                    </Tooltip>
                  }
                >
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setPeriodOffset((o) => o - 1)}
                    aria-label="Previous period"
                  >
                    <i className="mdi mdi-chevron-left" aria-hidden />
                  </Button>
                </OverlayTrigger>
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id="trackers-next-tooltip">Next period</Tooltip>
                  }
                >
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setPeriodOffset((o) => o + 1)}
                    disabled={periodOffset >= 0}
                    aria-label="Next period"
                  >
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </Button>
                </OverlayTrigger>
              </div>
            </>
          ) : (
            <>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center">
                  <span className="page-title-icon bg-gradient-primary text-white mr-2">
                    <i className="mdi mdi-chart-line" aria-hidden />
                  </span>
                  <div className="d-flex flex-column">
                    <span>Trackers</span>
                    <span className="small text-muted">
                      {periodOffset === 0
                        ? '(Current period)'
                        : periodOffset === -1
                          ? '(Previous period)'
                          : `(${-periodOffset} periods ago)`}
                    </span>
                  </div>
                  <HelpPopover
                    id="trackers-help"
                    title="Trackers"
                    content="Set a budget and reset frequency (Weekly, Fortnightly, Monthly, or Payday). Assign one or more categories to each tracker. The dashboard shows progress, days left, and transactions in the current period. Each tracker uses its own reset period (Weekly, Payday, etc.); Previous/Next steps each tracker back or forward by that period."
                    ariaLabel="What are trackers?"
                  />
                </div>
                <div className="d-flex gap-1 align-items-center flex-nowrap ms-auto">
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-prev-tooltip">
                        Previous period
                      </Tooltip>
                    }
                  >
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setPeriodOffset((o) => o - 1)}
                      aria-label="Previous period"
                    >
                      <i className="mdi mdi-chevron-left" aria-hidden />
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-next-tooltip">Next period</Tooltip>
                    }
                  >
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setPeriodOffset((o) => o + 1)}
                      disabled={periodOffset >= 0}
                      aria-label="Next period"
                    >
                      <i className="mdi mdi-chevron-right" aria-hidden />
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-analytics-header-tooltip-desktop">
                        Analytics coming soon
                      </Tooltip>
                    }
                  >
                    <Link
                      to="/analytics"
                      className="btn btn-outline-secondary btn-sm me-1"
                      aria-label="Analytics coming soon"
                    >
                      <i className="mdi mdi-chart-box" aria-hidden />
                    </Link>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-add-tooltip">Add tracker</Tooltip>
                    }
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      className="ms-2"
                      onClick={openCreate}
                      aria-label="Add tracker"
                    >
                      <i className="mdi mdi-plus" aria-hidden />
                    </Button>
                  </OverlayTrigger>
                </div>
              </div>
            </>
          )}
        </Card.Header>
        <Card.Body>
          {paydayBudgetExceedsPay && (
            <Alert variant="warning" className="mb-3">
              Total PAYDAY tracker budgets ($
              {formatMoney(totalPaydayBudgetCents)}) exceed your pay amount ($
              {formatMoney(payAmountCents!)}). Consider adjusting budgets or pay
              amount in Settings.
            </Alert>
          )}
          {trackers.length === 0 ? (
            <p className="text-muted small mb-0">
              No trackers yet. Add one to get started.
            </p>
          ) : (
            <div
              style={{ maxHeight: '50vh', overflowY: 'auto' }}
              className="d-flex flex-column gap-3"
            >
              {[...trackers]
                .sort(
                  (a, b) =>
                    FREQUENCY_ORDER.indexOf(
                      a.reset_frequency as TrackerResetFrequency
                    ) -
                    FREQUENCY_ORDER.indexOf(
                      b.reset_frequency as TrackerResetFrequency
                    )
                )
                .map((t, index, sorted) => {
                  const showGroupLabel =
                    index === 0 ||
                    sorted[index - 1].reset_frequency !== t.reset_frequency
                  const groupLabel = RESET_FREQUENCIES.find(
                    (f) => f.value === t.reset_frequency
                  )?.label
                  const progressStyle = getTrackerProgressStyle(t.progress)
                  const frequencyLabel =
                    RESET_FREQUENCIES.find((f) => f.value === t.reset_frequency)
                      ?.label ?? t.reset_frequency
                  const periodRangeText =
                    t.period_start && t.period_end
                      ? `${formatShortDate(t.period_start)} – ${formatShortDate(t.period_end)}`
                      : ''
                  const daysTooltipText = periodRangeText
                    ? `${t.daysLeft} days left in this ${frequencyLabel.toLowerCase()} period (${periodRangeText})`
                    : `${t.daysLeft} days left in this ${frequencyLabel.toLowerCase()} period`
                  return (
                    <Fragment key={t.id}>
                      {showGroupLabel && (
                        <>
                          {index > 0 && (
                            <hr className="my-2 border-secondary" />
                          )}
                          {/* Section heading for this frequency group (Payday, Weekly, etc.) */}
                          <h6
                            className={`text-center fw-semibold text-muted text-uppercase small mb-2${index > 0 ? ' mt-2' : ''}`}
                            id={`tracker-group-${t.reset_frequency}`}
                          >
                            {groupLabel}
                          </h6>
                        </>
                      )}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.name}, edit tracker`}
                        onClick={() => openEdit(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(t)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <strong>{t.name}</strong>
                          <div className="d-flex gap-1 align-items-center">
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-analytics-${t.id}`}>
                                  Analytics coming soon
                                </Tooltip>
                              }
                            >
                              <Link
                                to="/analytics"
                                className="btn btn-link btn-sm p-0 text-primary"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Analytics coming soon for ${t.name}`}
                              >
                                <i className="mdi mdi-chart-line" aria-hidden />
                              </Link>
                            </OverlayTrigger>
                            {t.badge_color && t.badge_color.trim() ? (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: t.badge_color.trim(),
                                  color: 'white',
                                }}
                              >
                                {frequencyLabel}
                              </span>
                            ) : (
                              <Badge bg="secondary">{frequencyLabel}</Badge>
                            )}
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-days-tooltip-${t.id}`}>
                                  {daysTooltipText}
                                </Tooltip>
                              }
                            >
                              <Badge bg="info">{t.daysLeft} days</Badge>
                            </OverlayTrigger>
                          </div>
                        </div>
                        <h6
                          className={`text-${progressStyle.variant} mt-1 text-end`}
                        >
                          ${formatMoney(t.remaining)} left
                        </h6>
                        <ProgressBar
                          now={Math.min(100, t.progress)}
                          variant={progressStyle.variant}
                          striped={progressStyle.striped}
                          animated={progressStyle.animated}
                          label={`${Math.round(t.progress)}%`}
                        />
                        <div
                          className="d-flex justify-content-between align-items-center"
                          role="button"
                          tabIndex={0}
                          aria-label={
                            expandedId === t.id
                              ? 'Collapse transactions'
                              : 'View transactions for this period'
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedId(expandedId === t.id ? null : t.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              setExpandedId(expandedId === t.id ? null : t.id)
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                          title="View transactions"
                        >
                          <small className="text-muted">
                            ${formatMoney(t.spent)} of $
                            {formatMoney(t.budget_amount)} spent
                          </small>
                          {t.period_start && t.period_end && (
                            <span className="small text-muted text-end">
                              {formatShortDate(t.period_start)} –{' '}
                              {formatShortDate(t.period_end)}
                            </span>
                          )}
                        </div>
                        <Collapse in={expandedId === t.id}>
                          <div className="mt-2 small">
                            {getTrackerTransactionsInPeriod(t.id, periodOffset)
                              .length === 0 ? (
                              <span className="text-muted">
                                No transactions this period
                              </span>
                            ) : (
                              <ul className="list-unstyled mb-0">
                                {getTrackerTransactionsInPeriod(
                                  t.id,
                                  periodOffset
                                ).map((tx) => (
                                  <li key={tx.id}>
                                    {formatShortDate(
                                      tx.created_at ?? tx.settled_at ?? ''
                                    )}{' '}
                                    {tx.description} $
                                    {formatMoney(Math.abs(tx.amount))}
                                    {tx.status === 'HELD' && (
                                      <span className="text-muted small ms-1">
                                        (Held)
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </Collapse>
                      </div>
                    </Fragment>
                  )
                })}
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingId != null ? 'Edit tracker' : 'Add tracker'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-name">Name</Form.Label>
              <Form.Control
                id="tracker-edit-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Food & Drink"
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-budget">Budget ($)</Form.Label>
              <Form.Control
                id="tracker-edit-budget"
                name="budget"
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-frequency">
                Reset frequency
              </Form.Label>
              <Form.Select
                id="tracker-edit-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as TrackerResetFrequency)
                }
              >
                {RESET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            {frequency !== 'PAYDAY' && (
              <Form.Group className="mb-2">
                <Form.Label htmlFor="tracker-edit-reset-day">
                  Reset day
                </Form.Label>
                <Form.Select
                  id="tracker-edit-reset-day"
                  name="resetDay"
                  value={resetDay}
                  onChange={(e) => setResetDay(Number(e.target.value))}
                >
                  {resetDayOptions.map((d) => (
                    <option key={d} value={d}>
                      {frequency === 'MONTHLY'
                        ? `${d}`
                        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][
                            d - 1
                          ]}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
            <Form.Group className="mb-2">
              <Form.Label>Frequency badge colour</Form.Label>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {BADGE_COLOR_SWATCHES.map((hex) => {
                  const isSelected = badgeColor === hex
                  return (
                    <button
                      key={hex}
                      type="button"
                      className="border rounded-circle p-0 d-flex align-items-center justify-content-center"
                      style={{
                        width: 32,
                        height: 32,
                        background: hex,
                        borderWidth: isSelected ? 3 : 1,
                        borderColor: isSelected
                          ? 'var(--vantura-text)'
                          : 'var(--vantura-border)',
                      }}
                      onClick={() => setBadgeColor(hex)}
                      aria-label={`Select badge colour ${hex}`}
                      aria-pressed={isSelected}
                    >
                      {isSelected && (
                        <i
                          className="mdi mdi-check text-white"
                          style={{
                            fontSize: '1rem',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          }}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
                {badgeColor != null && (
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-muted"
                    onClick={() => setBadgeColor(null)}
                    aria-label="Use default badge colour"
                  >
                    Use default
                  </button>
                )}
              </div>
            </Form.Group>
            {modalPaydayExceedsPay && (
              <Alert variant="warning" className="mb-2">
                Total PAYDAY budgets will be ${formatMoney(newTotalPaydayCents)}{' '}
                (pay amount ${formatMoney(payAmountCents!)}).
              </Alert>
            )}
            <Form.Group className="mb-2">
              <Form.Label>Categories</Form.Label>
              <div
                className="border rounded p-2"
                style={{ maxHeight: 160, overflowY: 'auto' }}
              >
                {categories.map((c) => (
                  <Form.Check
                    key={c.id}
                    type="checkbox"
                    id={`cat-${c.id}`}
                    label={c.name}
                    checked={selectedCategoryIds.includes(c.id)}
                    onChange={() => toggleCategory(c.id)}
                  />
                ))}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          {editingId != null && (
            <Button
              variant="outline-danger"
              className="me-auto"
              onClick={() => handleDelete(editingId)}
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
    </>
  )
}
