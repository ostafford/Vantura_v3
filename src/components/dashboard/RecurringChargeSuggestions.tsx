import { useEffect, useState } from 'react'
import { Modal, Button, Collapse } from 'react-bootstrap'
import {
  detectRecurringCharges,
  dismissChargeSuggestion,
  undismissChargeSuggestion,
  getDismissedSuggestionKeys,
  type RecurringChargeSuggestion,
} from '@/services/recurringChargeDetection'
import { createUpcomingCharge } from '@/services/upcoming'
import { getCategories } from '@/services/categories'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'

const FREQ_LABEL: Record<RecurringChargeSuggestion['frequency'], string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
}

interface Props {
  show: boolean
  onClose: () => void
  /** Called after a suggestion is added or dismissed, so the parent can refresh. */
  onChange: () => void
  /** Open the parent's create form pre-filled from this suggestion. */
  onEditAndAdd: (s: RecurringChargeSuggestion) => void
}

export function RecurringChargeSuggestions({
  show,
  onClose,
  onChange,
  onEditAndAdd,
}: Props) {
  const [suggestions, setSuggestions] = useState<RecurringChargeSuggestion[]>(
    []
  )
  const [dismissed, setDismissed] = useState<string[]>([])
  const [showDismissed, setShowDismissed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!show) return
    setSuggestions(detectRecurringCharges())
    setDismissed([...getDismissedSuggestionKeys()])
  }, [show, tick])

  const categories = getCategories()
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? null) : null

  function handleAdd(s: RecurringChargeSuggestion) {
    createUpcomingCharge(
      s.name,
      s.amountCents,
      s.frequency,
      s.nextChargeDate,
      s.categoryId,
      true, // is_reserved — a detected bill counts toward Spendable by default
      null,
      null,
      'EXPENSE',
      null,
      s.matchRawText
    )
    toast.success(`"${s.name}" added to upcoming charges.`)
    setTick((t) => t + 1)
    onChange()
  }

  function handleDismiss(s: RecurringChargeSuggestion) {
    dismissChargeSuggestion(s.key)
    setTick((t) => t + 1)
    onChange()
  }

  function handleRestore(key: string) {
    undismissChargeSuggestion(key)
    setTick((t) => t + 1)
    onChange()
  }

  return (
    <Modal
      show={show}
      onHide={onClose}
      centered
      aria-labelledby="recurring-suggestions-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="recurring-suggestions-title">
          Recurring charges found
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted mb-3">
          Patterns spotted in your recent transactions — a steady amount at a
          steady interval. Adding one creates an upcoming charge (and, where it
          can, links it so it auto-clears when paid). Nothing is added until you
          say so.
        </p>

        {suggestions.length === 0 ? (
          <p className="text-muted mb-0">
            No new recurring charges detected in your transaction history.
          </p>
        ) : (
          <ul className="list-unstyled mb-0">
            {suggestions.map((s) => (
              <li
                key={s.key}
                className="border rounded p-3 mb-2"
                style={{ borderColor: 'var(--vantura-border)' }}
              >
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div className="min-width-0">
                    <div className="fw-medium text-break">{s.name}</div>
                    <div className="small text-muted">
                      {FREQ_LABEL[s.frequency]} · seen {s.occurrences}× since{' '}
                      {formatShortDate(s.sampleDates[0])}
                      {categoryName(s.categoryId)
                        ? ` · ${categoryName(s.categoryId)}`
                        : ''}
                    </div>
                    <div className="small text-muted">
                      Next: {formatShortDate(s.nextChargeDate)} · dates:{' '}
                      {s.sampleDates
                        .slice(-4)
                        .map((d) => formatShortDate(d))
                        .join(', ')}
                      {s.sampleDates.length > 4 ? ' …' : ''}
                    </div>
                  </div>
                  <div className="fw-semibold text-nowrap">
                    ${formatMoney(s.amountCents)}
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleAdd(s)}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => {
                      onEditAndAdd(s)
                      onClose()
                    }}
                  >
                    Edit &amp; add
                  </Button>
                  <Button
                    size="sm"
                    variant="link"
                    className="text-muted px-1"
                    onClick={() => handleDismiss(s)}
                  >
                    Not recurring
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {dismissed.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-muted"
              onClick={() => setShowDismissed((v) => !v)}
              aria-expanded={showDismissed}
            >
              {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
            </button>
            <Collapse in={showDismissed}>
              <ul className="list-unstyled small mt-2 mb-0">
                {dismissed.map((key) => (
                  <li
                    key={key}
                    className="d-flex justify-content-between align-items-center gap-2 py-1"
                  >
                    <span className="text-muted text-truncate">{key}</span>
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0"
                      onClick={() => handleRestore(key)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </Collapse>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
