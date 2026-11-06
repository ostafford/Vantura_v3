import { useState, useMemo } from 'react'
import { useStore } from 'zustand'
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
  regularsByMonth,
  regularById,
  deleteRegular,
  markOccurrencePaid,
  unmarkOccurrencePaid,
  daysUntilCharge,
  blankDraft,
  draftFromRegular,
  draftFromSuggestion,
  essentialsLinkHints,
  type Regular,
} from '@/services/regulars'
import { useRegularDraft } from '@/components/regulars/useRegularDraft'
import { getReservedAmount } from '@/services/balance'
import { getCategories } from '@/services/categories'
import {
  searchRecentDebits,
  type RecentDebitRow,
} from '@/services/transactions'
import { RecurringChargeSuggestions } from './RecurringChargeSuggestions'
import type { RecurringChargeSuggestion } from '@/services/recurringChargeDetection'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'
import { getBuckets } from '@/services/budgetBuckets'
import { isEssentialsUser } from '@/services/essentials'
import { HelpPopover } from '@/components/HelpPopover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
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

export interface UpcomingSectionProps {
  onUpcomingChange?: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}

export function UpcomingSection({
  onUpcomingChange,
  dragHandleProps,
}: UpcomingSectionProps) {
  const [refresh, setRefresh] = useState(0)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const today = useStore(todayStore, (s) => s.today)
  const [showModal, setShowModal] = useState(false)
  const [editingCharge, setEditingCharge] = useState<Regular | null>(null)
  const {
    draft,
    reset,
    update,
    setFrequency,
    applyTransaction,
    detachPayment,
    save,
  } = useRegularDraft(blankDraft)
  const {
    name,
    amount,
    frequency,
    nextChargeDate,
    categoryId,
    isReserved,
    reminderDaysBefore,
    cancelByDate,
    matchDescription,
    bucketId: upcomingBucketId,
  } = draft
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [createStep, setCreateStep] = useState<'search' | 'form'>('search')
  const [txSearch, setTxSearch] = useState('')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [importedFromTx, setImportedFromTx] = useState<RecentDebitRow | null>(
    null
  )
  const [showSettlementPicker, setShowSettlementPicker] = useState(false)
  const [settlementSearch, setSettlementSearch] = useState('')

  const { overdue, thisMonth, later } = useMemo(
    () => regularsByMonth(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt, today]
  )
  const reserved = useMemo(
    () => getReservedAmount(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt, today]
  )
  const categories = useMemo(
    () => getCategories(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allBuckets = useMemo(() => getBuckets(), [refresh, lastSyncCompletedAt])
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const essentialsUser = useMemo(
    () => isEssentialsUser(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )

  /**
   * Essentials-era nudge (#97, docs/adr/0019 "Known limitations"): funding
   * source needs a linked payment (docs/adr/0020), so a Regular without one
   * gets no Essentials benefit — it's always reserved. Surfaced only for an
   * active Essentials nomination; classic users get nothing here since
   * linking has no effect on their Reserved figure. See essentialsLinkHints.
   */
  const linkHints = useMemo(
    () => (essentialsUser ? essentialsLinkHints() : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [essentialsUser, refresh, lastSyncCompletedAt, today]
  )

  function essentialsLinkLabel(c: Regular): string | null {
    const hint = linkHints.get(c.id)
    if (hint === 'unlinked') return 'link a payment to use Essentials'
    if (hint === 'no_payment') return 'no matching payment found'
    return null
  }

  function openCreate() {
    setEditingCharge(null)
    reset(blankDraft())
    setCreateStep('search')
    setTxSearch('')
    setMoreOptionsOpen(false)
    setImportedFromTx(null)
    setShowSettlementPicker(false)
    setSettlementSearch('')
    setShowModal(true)
  }

  // `c` is the row as shown: its date is the projected next occurrence. The
  // draft keeps it as the shown date, and saving keeps the stored anchor
  // unless the user changes the date or frequency (#146, docs/adr/0004).
  function openEdit(c: Regular) {
    const stored = regularById(c.id)
    if (!stored) return
    const d = draftFromRegular(stored, c)
    setEditingCharge(c)
    reset(d)
    setImportedFromTx(null)
    setShowSettlementPicker(false)
    setSettlementSearch('')
    setMoreOptionsOpen(
      !!(
        d.categoryId ||
        d.reminderDaysBefore !== '' ||
        d.cancelByDate ||
        d.bucketId != null
      )
    )
    setShowModal(true)
  }

  function handleSave() {
    const result = save()
    if (!result.ok) {
      const { errors } = result
      toast.error(
        errors.name || errors.amount || errors.nextChargeDate
          ? 'Please fill in name, amount, and next charge date.'
          : (errors.cancelByDate ?? 'This Regular can’t be saved.')
      )
      return
    }
    toast.success(editingCharge ? 'Regular updated.' : 'Regular added.')
    setShowModal(false)
    setRefresh((r) => r + 1)
    onUpcomingChange?.()
  }

  function handleDelete() {
    if (!editingCharge) return
    deleteRegular(editingCharge.id)
    setShowDeleteConfirm(false)
    setShowModal(false)
    setRefresh((r) => r + 1)
    onUpcomingChange?.()
  }

  function changed() {
    setRefresh((r) => r + 1)
    onUpcomingChange?.()
  }

  // Overdue "Paid" (#217) records a paid mark on that occurrence and never
  // deletes the Regular, ONCE included (#183 decision 6). Undo removes the mark.
  function markOverduePaid(c: Regular) {
    const date = c.next_charge_date
    if (!markOccurrencePaid(c.id, date)) {
      toast.error(`Couldn’t mark "${c.name}" paid.`)
      changed()
      return
    }
    changed()
    toast.success(`"${c.name}" marked paid`, {
      action: {
        label: 'Undo',
        onClick: () => {
          unmarkOccurrencePaid(c.id, date)
          changed()
        },
      },
    })
  }

  // "Remove" (not paid) on an overdue ONCE still hard-deletes (#18). It isn't
  // offered on a recurring Regular, where it would delete every future
  // occurrence; deleting one stays in its edit form, which confirms.
  function removeOverdueOnce(c: Regular) {
    deleteRegular(c.id)
    changed()
    toast.success(`"${c.name}" removed.`)
  }

  // Prefill the form from a picked past transaction (#22). Picking one also
  // links the Regular to its payments (docs/adr/0020) — reveal "More options"
  // so the resulting auto-clear link is visible rather than silently applied.
  function applySearchTx(tx: RecentDebitRow) {
    applyTransaction(tx)
    setImportedFromTx(tx)
    setMoreOptionsOpen(true)
    setCreateStep('form')
    setTxSearch('')
  }

  // #20 — "Edit & add" from a recurring-charge suggestion: prefill the create
  // form (skipping the search step) with the detected values.
  function prefillFromSuggestion(s: RecurringChargeSuggestion) {
    setEditingCharge(null)
    reset(draftFromSuggestion(s))
    setImportedFromTx(null)
    setShowSettlementPicker(false)
    setSettlementSearch('')
    setMoreOptionsOpen(true)
    setCreateStep('form')
    setShowModal(true)
  }

  const thisMonthTotal = thisMonth.reduce((s, c) => s + c.amount, 0)
  const laterTotal = later.reduce((s, c) => s + c.amount, 0)
  const hasScheduled = thisMonth.length > 0 || later.length > 0
  const hasAny = overdue.length > 0 || hasScheduled
  const totalCount = thisMonth.length + later.length
  const isCapped = !showAll && totalCount > DEFAULT_VISIBLE_COUNT
  // This month's charges are more time-sensitive, so they claim the visible
  // slots first; Later fills whatever's left of the default count.
  const visibleThisMonth = isCapped
    ? thisMonth.slice(0, DEFAULT_VISIBLE_COUNT)
    : thisMonth
  const visibleLater = isCapped
    ? later.slice(
        0,
        Math.max(0, DEFAULT_VISIBLE_COUNT - visibleThisMonth.length)
      )
    : later
  const hiddenCount = totalCount - visibleThisMonth.length - visibleLater.length

  function reminderLabel(c: Regular): string | null {
    if (c.reminder_days_before == null || c.reminder_days_before < 0)
      return null
    const days = daysUntilCharge(c.next_charge_date)
    if (days < 0) return 'Overdue'
    if (days === 0) return 'Due today'
    if (days <= c.reminder_days_before)
      return `Due in ${days} day${days === 1 ? '' : 's'}`
    return null
  }

  function renderDataRow(c: Regular) {
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
          {(categoryName || c.is_reserved === 0 || essentialsLinkLabel(c)) && (
            <div className="small text-muted">
              {[
                categoryName,
                c.is_reserved === 0 ? 'excluded from Spendable' : null,
                essentialsLinkLabel(c),
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

  function renderOverdueGroup() {
    return (
      <div className="border-start border-4 border-warning ps-2 mb-3">
        <div className="d-flex align-items-center gap-2">
          <i
            className="mdi mdi-alert-circle-outline text-warning"
            aria-hidden
          />
          <strong>Overdue — was this paid?</strong>
        </div>
        <p className="small text-muted mb-2">
          Regulars due earlier this month with no payment seen, and one-offs
          whose date has passed. Resolve each so it stops showing here and stops
          counting toward your totals.
        </p>
        {overdue.map((c) => {
          const categoryName = c.category_id
            ? categoryNameById.get(c.category_id)
            : null
          return (
            <Card key={c.id} className="mb-2 upcoming-card">
              <Card.Body className="py-2 px-3">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-medium">{c.name}</div>
                    <div className="small text-muted">
                      {`Was due ${formatShortDate(c.next_charge_date)}`}
                      {categoryName ? ` · ${categoryName}` : ''}
                    </div>
                  </div>
                  <div className="text-end">${formatMoney(c.amount)}</div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => markOverduePaid(c)}
                  >
                    <i className="mdi mdi-check me-1" aria-hidden />
                    Paid
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => openEdit(c)}
                  >
                    {c.frequency === 'ONCE' ? 'Reschedule' : 'Edit'}
                  </Button>
                  {c.frequency === 'ONCE' && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => removeOverdueOnce(c)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card.Body>
            </Card>
          )
        })}
      </div>
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
            <span>Regulars</span>
            <HelpPopover
              id="upcoming-help"
              title="Regulars"
              content="Add bills and subscriptions you know are coming — rent, Netflix, insurance, etc. Set a name, amount, frequency (weekly, fortnightly, monthly, quarterly, yearly, or once), and next due date. The date auto-advances each cycle. Grouped into This month (due by the end of this calendar month) and Later, each showing the face-value total of what's listed. Regulars marked Include in Spendable reduce your Spendable balance until they're due — the 'reserved for Regulars' total below is just that subset: weekly/fortnightly ones count each occurrence before your next payday, monthly-or-rarer ones count once in full, so it won't match the group totals above."
              ariaLabel="What are Regulars?"
            />
          </div>
          <div className="d-flex align-items-center gap-1">
            <OverlayTrigger
              placement="top"
              overlay={
                <Tooltip id="upcoming-detect-tooltip">
                  Find recurring charges in your transactions
                </Tooltip>
              }
            >
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowSuggestions(true)}
                aria-label="Find recurring charges"
              >
                <i className="mdi mdi-radar" aria-hidden />
              </button>
            </OverlayTrigger>
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip id="upcoming-add-tooltip">Add Regular</Tooltip>}
            >
              <button
                type="button"
                className="btn-icon btn-icon-primary"
                onClick={openCreate}
                aria-label="Add Regular"
              >
                <i className="mdi mdi-plus" aria-hidden />
              </button>
            </OverlayTrigger>
          </div>
        </Card.Header>
        <Card.Body>
          {!hasAny ? (
            <p className="text-muted small mb-0">
              No Regulars yet. Add one to track.
            </p>
          ) : (
            <>
              {overdue.length > 0 && renderOverdueGroup()}
              {hasScheduled &&
                (isMobile ? (
                  <div className="upcoming-list-vertical">
                    {visibleThisMonth.length > 0 && (
                      <div className="mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <strong>This month</strong>
                          <span className="text-danger fw-normal small">
                            ${formatMoney(thisMonthTotal)} total
                          </span>
                        </div>
                        {visibleThisMonth.map((c) => {
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
                                        essentialsLinkLabel(c),
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
                                        essentialsLinkLabel(c),
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
                      {visibleThisMonth.length > 0 && (
                        <>
                          <tr className="upcoming-section-header">
                            <td colSpan={4}>
                              <div className="d-flex justify-content-between align-items-center page-title">
                                <strong>This month</strong>
                                <span className="text-danger fw-normal">
                                  ${formatMoney(thisMonthTotal)}{' '}
                                  <span className="text-muted">total</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                          {visibleThisMonth.map(renderDataRow)}
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
                ))}
            </>
          )}
          {totalCount > DEFAULT_VISIBLE_COUNT && (
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
            ${formatMoney(reserved)} reserved for Regulars
          </div>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingCharge ? 'Edit Regular' : 'Add Regular'}
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
                  <p className="small text-muted mb-2">
                    Pick the transaction this bill matches — Vantura fills in
                    the details and clears its reminder automatically each time
                    that payment lands in a sync. Or add it manually below.
                  </p>
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
                          onClick={() => applySearchTx(tx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applySearchTx(tx)
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
                      detachPayment()
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
                            detachPayment()
                            update({ name: '', amount: '' })
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
                            detachPayment()
                            update({ name: '', amount: '' })
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
                  onChange={(e) => update({ name: e.target.value })}
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
                      onChange={(e) => update({ amount: e.target.value })}
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
                      onChange={(e) => setFrequency(e.target.value)}
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
                  onChange={(e) => update({ nextChargeDate: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id="upcoming-charge-is-reserved"
                  name="isReserved"
                  label="Include in Spendable (reserve this amount)"
                  checked={isReserved}
                  onChange={(e) => update({ isReserved: e.target.checked })}
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
                          onChange={(e) =>
                            update({ categoryId: e.target.value })
                          }
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
                              update({
                                bucketId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
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
                            update({ reminderDaysBefore: e.target.value })
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
                          onChange={(e) =>
                            update({ cancelByDate: e.target.value })
                          }
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Text className="text-muted d-block mb-2">
                    Reminder shows &quot;Due in N days&quot; on the Dashboard
                    when within the set days. Stop date removes the charge after
                    that date.
                  </Form.Text>

                  {/* ── Auto-clear when paid ────────────────────────────────── */}
                  <Form.Group className="mb-2">
                    <Form.Label className="small">
                      Auto-clear when paid
                    </Form.Label>
                    {matchDescription ? (
                      <div
                        className="d-flex align-items-center gap-2 px-2 py-2 rounded"
                        style={{
                          background: 'var(--bs-tertiary-bg)',
                          border: '1px solid var(--bs-border-color)',
                        }}
                      >
                        <i
                          className="mdi mdi-check-circle flex-shrink-0"
                          style={{ color: 'var(--vantura-success-text)' }}
                          aria-hidden
                        />
                        <span
                          className="small flex-grow-1 text-truncate"
                          title={matchDescription}
                        >
                          Clears when “{matchDescription}” lands
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted flex-shrink-0"
                          onClick={() => {
                            update({ matchDescription: '' })
                            setShowSettlementPicker(false)
                          }}
                          aria-label="Remove the linked transaction"
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
                          Link the matching transaction
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
                                )
                                if (trackable.length === 0) {
                                  return (
                                    <p className="text-muted small text-center py-2 mb-0 px-2">
                                      No matching transactions found.
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
                                      update({
                                        matchDescription: tx.description,
                                      })
                                      setShowSettlementPicker(false)
                                      setSettlementSearch('')
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        update({
                                          matchDescription: tx.description,
                                        })
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
                      Link the real payment this bill matches. Its reminder then
                      clears itself when that payment next appears in a sync,
                      instead of you dismissing it by hand.
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
          <Modal.Title>Delete Regular</Modal.Title>
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

      <RecurringChargeSuggestions
        show={showSuggestions}
        onClose={() => setShowSuggestions(false)}
        onChange={() => {
          setRefresh((r) => r + 1)
          onUpcomingChange?.()
        }}
        onEditAndAdd={prefillFromSuggestion}
      />
    </>
  )
}
