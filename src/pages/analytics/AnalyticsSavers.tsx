import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Row, Col, Form } from 'react-bootstrap'
import {
  getSaversWithProgress,
  getSaverBalanceHistory,
} from '@/services/savers'
import { getSaverChartColors } from '@/lib/chartColors'
import {
  SaversHistoryChart,
  DEFAULT_LINE_COLORS,
  type SaverSeries,
} from '@/components/charts/SaversHistoryChart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'

const TIME_RANGES = [
  { value: '3M', label: 'Last 3 months', daysBack: 90 },
  { value: '6M', label: 'Last 6 months', daysBack: 180 },
  { value: '1Y', label: 'Last year', daysBack: 365 },
  { value: 'all', label: 'All time', daysBack: 0 },
] as const

function getDateFrom(daysBack: number): string | undefined {
  if (daysBack <= 0) return undefined
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

export function AnalyticsSavers() {
  const [timeRange, setTimeRange] = useState<string>('6M')
  const [selectedSaverIds, setSelectedSaverIds] = useState<Set<string>>(
    () => new Set()
  )
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const savers = getSaversWithProgress()
  const saverColors = getSaverChartColors()

  const dateFrom = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === timeRange)
    return range ? getDateFrom(range.daysBack) : undefined
  }, [timeRange])

  const series: SaverSeries[] = useMemo(() => {
    const idsToShow =
      selectedSaverIds.size > 0
        ? selectedSaverIds
        : new Set(savers.map((s) => s.id))
    return savers
      .filter((s) => idsToShow.has(s.id))
      .map((s, i) => {
        const data = getSaverBalanceHistory(s.id, {
          dateFrom,
          limit: 1000,
        })
        const color =
          saverColors[s.id] ??
          DEFAULT_LINE_COLORS[i % DEFAULT_LINE_COLORS.length]
        return {
          saverId: s.id,
          saverName: s.name,
          data,
          color,
        }
      })
      .filter((s) => s.data.length > 0)
  }, [savers, selectedSaverIds, dateFrom, saverColors])

  const maxDomain = useMemo(() => {
    if (series.length === 0) return undefined
    return Math.max(...series.flatMap((s) => s.data.map((d) => d.balance)), 100)
  }, [series])

  const toggleSaver = (id: string) => {
    setSelectedSaverIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      if (next.size === 0) {
        return new Set(savers.map((s) => s.id))
      }
      return next
    })
  }

  return (
    <>
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Savers Balance Over Time</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Contribution and balance timeline for each saver. Toggle savers
            below to compare.
          </Card.Text>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3">
            <Col md={4}>
              <Form.Select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                aria-label="Time range"
              >
                {TIME_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>
          {savers.length > 0 && (
            <div className="mb-3">
              <Form.Label className="small text-muted">
                Savers to show
              </Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {savers.map((s) => {
                  const isSelected =
                    selectedSaverIds.size === 0 || selectedSaverIds.has(s.id)
                  return (
                    <Form.Check
                      key={s.id}
                      type="checkbox"
                      id={`saver-${s.id}`}
                      label={s.name}
                      checked={isSelected}
                      onChange={() => toggleSaver(s.id)}
                    />
                  )
                })}
              </div>
            </div>
          )}
          {series.length === 0 ? (
            <p className="text-muted mb-0">
              {savers.length === 0
                ? 'No savers yet. Add accounts from the bank connection to see saver analytics.'
                : 'No transaction history in the selected range. Try a longer time range.'}
            </p>
          ) : (
            <div
              style={{
                width: '100%',
                height: isMobile ? 220 : 280,
              }}
            >
              <SaversHistoryChart
                series={series}
                maxDomain={maxDomain}
                aria-label="Saver balance over time"
              />
            </div>
          )}
        </Card.Body>
      </Card>
      {savers.length > 0 && (
        <Card className="mt-3">
          <Card.Header>
            <Card.Title className="mb-0">Individual Savers</Card.Title>
            <Card.Text as="div" className="small text-muted mt-1">
              View detailed growth and contribution history for each saver.
            </Card.Text>
          </Card.Header>
          <Card.Body>
            <div className="d-flex flex-wrap gap-2">
              {savers.map((s) => (
                <Link
                  key={s.id}
                  to={`/analytics/savers/${s.id}`}
                  className="btn btn-outline-secondary btn-sm"
                >
                  {(s.user_icon ?? s.icon) ? (
                    <span className="me-1">{s.user_icon ?? s.icon}</span>
                  ) : null}
                  {s.name}
                  <i className="mdi mdi-chevron-right ms-1" aria-hidden />
                </Link>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </>
  )
}
