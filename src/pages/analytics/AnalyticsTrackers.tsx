import { useState, useMemo } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import { Card, Col, Form, ProgressBar } from 'react-bootstrap'
import {
  getTrackersWithProgressForPeriod,
  getTrackerSpentInPeriod,
  type TrackerResetFrequency,
} from '@/services/trackers'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { formatMoney, formatShortDate } from '@/lib/format'
import { syncStore } from '@/stores/syncStore'

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

const DISPLAY_PERIODS: { value: BudgetDisplayPeriod; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

function getCalendarPeriodBounds(period: BudgetDisplayPeriod): {
  from: string
  to: string
  label: string
} {
  const today = new Date()
  if (period === 'WEEKLY') {
    const day = today.getUTCDay()
    const daysFromMonday = (day + 6) % 7
    const monday = new Date(today)
    monday.setUTCDate(today.getUTCDate() - daysFromMonday)
    const nextMonday = new Date(monday)
    nextMonday.setUTCDate(monday.getUTCDate() + 7)
    return {
      from: monday.toISOString().slice(0, 10),
      to: nextMonday.toISOString().slice(0, 10),
      label: `${formatShortDate(monday.toISOString().slice(0, 10))} – ${formatShortDate(new Date(nextMonday.getTime() - 86400000).toISOString().slice(0, 10))}`,
    }
  }
  if (period === 'YEARLY') {
    const year = today.getUTCFullYear()
    return {
      from: `${year}-01-01`,
      to: `${year + 1}-01-01`,
      label: String(year),
    }
  }
  // MONTHLY: calendar month
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 1))
  const toDisplay = new Date(to.getTime() - 86400000)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: `${formatShortDate(from.toISOString().slice(0, 10))} – ${formatShortDate(toDisplay.toISOString().slice(0, 10))}`,
  }
}

// period_end from tracker is exclusive — subtract one day for display.
function displayPeriodEnd(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getTrackerProgressStyle(progress: number): {
  variant: 'success' | 'warning' | 'danger'
  striped: boolean
  animated: boolean
} {
  if (progress >= 100)
    return { variant: 'danger', striped: true, animated: true }
  if (progress >= 81)
    return { variant: 'danger', striped: false, animated: false }
  if (progress > 50)
    return { variant: 'warning', striped: false, animated: false }
  return { variant: 'success', striped: false, animated: false }
}

export function AnalyticsTrackers() {
  const [frequencyFilter, setFrequencyFilter] = useState<string>('')
  const [displayPeriod, setDisplayPeriod] =
    useState<BudgetDisplayPeriod>('MONTHLY')
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const trackers = useMemo(
    () => getTrackersWithProgressForPeriod(0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )

  const sortedTrackers = useMemo(() => {
    const filtered = frequencyFilter
      ? trackers.filter((t) => t.reset_frequency === frequencyFilter)
      : trackers
    return [...filtered].sort(
      (a, b) =>
        FREQUENCY_ORDER.indexOf(a.reset_frequency as TrackerResetFrequency) -
        FREQUENCY_ORDER.indexOf(b.reset_frequency as TrackerResetFrequency)
    )
  }, [trackers, frequencyFilter])

  const effectiveDataByTrackerId = useMemo(() => {
    const map: Record<
      number,
      {
        spent: number
        budget: number
        progress: number
        dateRangeLabel: string
      }
    > = {}
    for (const t of trackers) {
      const nativeMatch =
        (displayPeriod === 'WEEKLY' && t.reset_frequency === 'WEEKLY') ||
        (displayPeriod === 'MONTHLY' && t.reset_frequency === 'MONTHLY')
      let spent: number
      let budget: number
      let dateRangeLabel: string
      if (nativeMatch) {
        spent = t.spent
        // Effective budget accounts for a mid-period config change (#16).
        budget = t.effectiveBudget
        dateRangeLabel =
          t.period_start && t.period_end
            ? `${formatShortDate(t.period_start)} – ${formatShortDate(displayPeriodEnd(t.period_end))}`
            : ''
      } else {
        const bounds = getCalendarPeriodBounds(displayPeriod)
        spent = getTrackerSpentInPeriod(t.id, bounds.from, bounds.to)
        budget = toPeriodCents(
          t.budget_amount,
          t.reset_frequency,
          displayPeriod
        )
        dateRangeLabel = bounds.label
      }
      const progress = budget > 0 ? (spent / budget) * 100 : 0
      map[t.id] = { spent, budget, progress, dateRangeLabel }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers, displayPeriod, lastSyncCompletedAt])

  return (
    <>
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Trackers Overview</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Select a tracker to view detailed analytics and spending trends over
            time.
          </Card.Text>
        </Card.Header>
        <Card.Body>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <Col md={4} className="p-0">
              <Form.Select
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
                aria-label="Filter by frequency"
              >
                <option value="">All frequencies</option>
                {RESET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <div
              className="period-toggle"
              role="group"
              aria-label="Select display period"
            >
              {DISPLAY_PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`segment-btn${displayPeriod === p.value ? ' active' : ''}`}
                  onClick={() => setDisplayPeriod(p.value)}
                  aria-pressed={displayPeriod === p.value}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {sortedTrackers.length === 0 ? (
            <p className="text-muted small mb-0">
              {trackers.length === 0
                ? 'No trackers yet. Add one from the dashboard to get started.'
                : 'No trackers match the selected frequency.'}
            </p>
          ) : (
            <div className="d-flex flex-column gap-3">
              {sortedTrackers.map((t) => {
                const effectiveData = effectiveDataByTrackerId[t.id] ?? {
                  spent: t.spent,
                  budget: t.effectiveBudget,
                  progress: t.progress,
                  dateRangeLabel: '',
                }
                return (
                  <Link
                    key={t.id}
                    to={`/analytics/trackers/${t.id}`}
                    className="text-decoration-none text-reset"
                  >
                    <Card
                      style={{
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                        transition: 'box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow =
                          '0 3px 10px rgba(0,0,0,0.11)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow =
                          '0 1px 4px rgba(0,0,0,0.07)'
                      }}
                    >
                      <Card.Body className="py-3">
                        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                          <div>
                            <strong>{t.name}</strong>
                            <div className="d-flex gap-1 mt-1 flex-wrap align-items-center">
                              <span className="small text-muted">
                                ${formatMoney(effectiveData.spent)} of $
                                {formatMoney(effectiveData.budget)} spent
                              </span>
                              {effectiveData.dateRangeLabel && (
                                <span className="small text-muted">
                                  · {effectiveData.dateRangeLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          <i
                            className="mdi mdi-chevron-right text-muted fs-5"
                            aria-hidden
                          />
                        </div>
                        <div className="mt-2">
                          <ProgressBar
                            now={Math.min(100, effectiveData.progress)}
                            {...getTrackerProgressStyle(effectiveData.progress)}
                            style={{ height: 8 }}
                          />
                        </div>
                      </Card.Body>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
