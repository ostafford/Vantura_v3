import { useState } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import { Card, Row, Col, Form } from 'react-bootstrap'
import {
  getTrackersWithProgressForPeriod,
  type TrackerResetFrequency,
} from '@/services/trackers'
import { formatMoney } from '@/lib/format'
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

export function AnalyticsTrackers() {
  const [frequencyFilter, setFrequencyFilter] = useState<string>('')
  useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const trackers = getTrackersWithProgressForPeriod(0)
  const filtered = frequencyFilter
    ? trackers.filter((t) => t.reset_frequency === frequencyFilter)
    : trackers

  const sortedTrackers = [...filtered].sort(
    (a, b) =>
      FREQUENCY_ORDER.indexOf(a.reset_frequency as TrackerResetFrequency) -
      FREQUENCY_ORDER.indexOf(b.reset_frequency as TrackerResetFrequency)
  )

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
          <Row className="mb-3">
            <Col md={4}>
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
          </Row>
          {sortedTrackers.length === 0 ? (
            <p className="text-muted mb-0">
              {trackers.length === 0
                ? 'No trackers yet. Add one from the dashboard to get started.'
                : 'No trackers match the selected frequency.'}
            </p>
          ) : (
            <div className="d-flex flex-column gap-3">
              {sortedTrackers.map((t) => {
                const frequencyLabel =
                  RESET_FREQUENCIES.find((f) => f.value === t.reset_frequency)
                    ?.label ?? t.reset_frequency
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
                              {t.badge_color && t.badge_color.trim() ? (
                                <span
                                  className="badge badge-frequency-custom"
                                  style={{
                                    backgroundColor: t.badge_color.trim(),
                                  }}
                                >
                                  {frequencyLabel}
                                </span>
                              ) : (
                                <span className="badge badge-frequency-default">
                                  {frequencyLabel}
                                </span>
                              )}
                              <span className="small text-muted">
                                ${formatMoney(t.spent)} of $
                                {formatMoney(t.budget_amount)} spent
                              </span>
                            </div>
                          </div>
                          <i
                            className="mdi mdi-chevron-right text-muted fs-5"
                            aria-hidden
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
