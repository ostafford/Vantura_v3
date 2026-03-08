import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button, Modal, Form } from 'react-bootstrap'
import {
  getSaversWithProgress,
  updateSaverGoals,
  markSaverGoalComplete,
  reopenSaverGoal,
  updateSaverIcon,
} from '@/services/savers'
import { getSaverChartColors, setSaverChartColor } from '@/lib/chartColors'
import { formatMoney } from '@/lib/format'
import { ChartColorPicker } from '@/components/ChartColorPicker'
import { toast } from '@/stores/toastStore'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
import { SaversBarChart } from '@/components/charts/SaversBarChart'
import type { SaversChartRow } from '@/types/charts'

const SAVER_ICONS = [
  null,
  '\uD83D\uDCB0',
  '\uD83C\uDFE0',
  '\uD83D\uDE97',
  '\u2708\uFE0F',
  '\uD83C\uDF93',
  '\uD83C\uDFA8',
  '\uD83C\uDF89',
  '\uD83D\uDEE1\uFE0F',
  '\uD83D\uDCBB',
  '\uD83C\uDFCB\uFE0F',
  '\uD83C\uDF34',
]

export function SaversSection() {
  const [, setRefresh] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [goalAmount, setGoalAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [monthlyTransfer, setMonthlyTransfer] = useState('')
  const [barColor, setBarColor] = useState<string | null>(null)
  const [userIcon, setUserIcon] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const savers = getSaversWithProgress()
  const activeSavers = useMemo(
    () => savers.filter((s) => !s.completed_at),
    [savers]
  )
  const completedSavers = useMemo(
    () => savers.filter((s) => s.completed_at),
    [savers]
  )

  function openEdit(saver: {
    id: string
    goal_amount: number | null
    target_date: string | null
    monthly_transfer: number | null
    user_icon: string | null
  }) {
    setEditingId(saver.id)
    setGoalAmount(
      saver.goal_amount != null ? String(saver.goal_amount / 100) : ''
    )
    setTargetDate(saver.target_date ?? '')
    setMonthlyTransfer(
      saver.monthly_transfer != null ? String(saver.monthly_transfer / 100) : ''
    )
    setBarColor(getSaverChartColors()[saver.id] ?? null)
    setUserIcon(saver.user_icon ?? null)
  }

  function handleSaveGoals() {
    if (!editingId) return
    const goalCents = goalAmount
      ? Math.round(parseFloat(goalAmount) * 100)
      : null
    const monthlyCents = monthlyTransfer
      ? Math.round(parseFloat(monthlyTransfer) * 100)
      : null
    setSaverChartColor(editingId, barColor)
    updateSaverGoals(editingId, goalCents, targetDate || null, monthlyCents)
    updateSaverIcon(editingId, userIcon)
    setEditingId(null)
    setRefresh((r) => r + 1)
    toast.success('Saver goals saved.')
  }

  function handleMarkComplete(id: string, name: string) {
    markSaverGoalComplete(id)
    setRefresh((r) => r + 1)
    toast.success(`Goal "${name}" completed!`)
  }

  function handleReopen(id: string) {
    reopenSaverGoal(id)
    setRefresh((r) => r + 1)
  }

  const totalBalance = savers.reduce((sum, s) => sum + s.current_balance, 0)

  const saverColors = getSaverChartColors()

  const chartData: SaversChartRow[] = activeSavers.map((s) => {
    const currentDollars = Number.isFinite(s.current_balance / 100)
      ? s.current_balance / 100
      : 0
    const goalDollars =
      s.goal_amount != null &&
      s.goal_amount > 0 &&
      Number.isFinite(s.goal_amount / 100)
        ? s.goal_amount / 100
        : currentDollars
    const remaining = Math.max(
      0,
      Number.isFinite(goalDollars - currentDollars)
        ? goalDollars - currentDollars
        : 0
    )
    return {
      id: s.id,
      name: s.name,
      current: currentDollars,
      remaining: s.goal_amount != null && s.goal_amount > 0 ? remaining : 0,
      goal: goalDollars,
      saver: s,
      currentFill: saverColors[s.id] ?? 'var(--vantura-primary)',
    }
  })

  const maxDomain = Math.max(
    1,
    ...chartData.map((d) => d.current + d.remaining).filter(Number.isFinite)
  )

  return (
    <>
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center section-header">
          <div className="d-flex align-items-center">
            <span className="page-title-icon bg-gradient-primary text-white mr-2">
              <i className="mdi mdi-piggy-bank" aria-hidden />
            </span>
            <span>Savers</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Link
              to="/analytics/savers"
              className="btn btn-outline-secondary btn-sm"
              aria-label="View savers analytics"
            >
              <i className="mdi mdi-chart-box" aria-hidden />
            </Link>
            <span className="text-success fw-normal">
              ${formatMoney(totalBalance)}{' '}
              <span className="text-muted">total</span>
            </span>
          </div>
        </Card.Header>
        <Card.Body>
          {savers.length === 0 ? (
            <p className="text-muted small mb-0">
              No saver accounts yet. They&apos;ll appear after you sync with Up
              Bank.
            </p>
          ) : (
            <>
              <div
                className="visually-hidden"
                role="region"
                aria-label="Savers progress (table)"
              >
                <table className="table table-sm mb-0">
                  <caption className="visually-hidden">
                    Savers: saved amount and goal
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Saver</th>
                      <th scope="col" className="text-end">
                        Saved
                      </th>
                      <th scope="col" className="text-end">
                        Goal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.saver.user_icon && (
                            <span className="me-1">{d.saver.user_icon}</span>
                          )}
                          {d.name}
                        </td>
                        <td className="text-end">
                          ${formatMoney(d.saver.current_balance)}
                        </td>
                        <td className="text-end">
                          {d.saver.goal_amount != null
                            ? `$${formatMoney(d.saver.goal_amount)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activeSavers.length > 0 && (
                <div
                  style={{
                    width: '100%',
                    height: isMobile
                      ? Math.max(280, chartData.length * 56)
                      : Math.max(260, chartData.length * 52),
                  }}
                >
                  <SaversBarChart
                    chartData={chartData}
                    maxDomain={maxDomain}
                    isMobile={isMobile}
                    onBarClick={(row) => openEdit(row.saver)}
                    aria-label="Savers progress (bar chart)"
                  />
                </div>
              )}
              {activeSavers.some(
                (s) =>
                  s.goal_amount != null &&
                  s.goal_amount > 0 &&
                  s.current_balance >= s.goal_amount
              ) && (
                <div className="mt-2">
                  {activeSavers
                    .filter(
                      (s) =>
                        s.goal_amount != null &&
                        s.goal_amount > 0 &&
                        s.current_balance >= s.goal_amount
                    )
                    .map((s) => (
                      <div
                        key={s.id}
                        className="d-flex justify-content-between align-items-center py-1"
                      >
                        <span className="small text-success fw-medium">
                          {s.user_icon && (
                            <span className="me-1">{s.user_icon}</span>
                          )}
                          {s.name} reached its goal!
                        </span>
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleMarkComplete(s.id, s.name)}
                          aria-label={`Mark ${s.name} complete`}
                        >
                          <i className="mdi mdi-check me-1" aria-hidden />
                          Complete
                        </Button>
                      </div>
                    ))}
                </div>
              )}
              {completedSavers.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    className="btn btn-link p-0 small text-muted text-decoration-none"
                    onClick={() => setShowCompleted((v) => !v)}
                  >
                    {showCompleted ? 'Hide' : 'Show'} completed (
                    {completedSavers.length})
                  </button>
                  {showCompleted &&
                    completedSavers.map((s) => (
                      <div
                        key={s.id}
                        className="d-flex justify-content-between align-items-center mt-2 opacity-75"
                      >
                        <span className="small text-decoration-line-through">
                          {s.user_icon && (
                            <span className="me-1">{s.user_icon}</span>
                          )}
                          {s.name}
                        </span>
                        <div className="d-flex align-items-center gap-2">
                          <span className="small text-muted">
                            ${formatMoney(s.current_balance)}
                          </span>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => handleReopen(s.id)}
                            aria-label={`Reopen ${s.name}`}
                          >
                            <i className="mdi mdi-undo" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>

      <Modal
        show={editingId != null}
        onHide={() => setEditingId(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Edit saver goals</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="saver-edit-goal-amount">
                Goal amount ($)
              </Form.Label>
              <Form.Control
                id="saver-edit-goal-amount"
                name="goalAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="saver-edit-target-date">
                Target date
              </Form.Label>
              <Form.Control
                id="saver-edit-target-date"
                name="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="saver-edit-monthly-transfer">
                Monthly transfer ($)
              </Form.Label>
              <Form.Control
                id="saver-edit-monthly-transfer"
                name="monthlyTransfer"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={monthlyTransfer}
                onChange={(e) => setMonthlyTransfer(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Icon</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {SAVER_ICONS.map((ic, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    style={{
                      minWidth: 36,
                      borderColor:
                        userIcon === ic ? 'var(--vantura-primary)' : undefined,
                      borderWidth: userIcon === ic ? 2 : undefined,
                    }}
                    onClick={() => setUserIcon(ic)}
                    aria-pressed={userIcon === ic}
                    aria-label={ic ?? 'No icon'}
                  >
                    {ic ?? '—'}
                  </button>
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label id="saver-edit-bar-color-label">Bar color</Form.Label>
              <Form.Text className="d-block text-muted small mb-1">
                This bar colour applies to this saver.
              </Form.Text>
              <ChartColorPicker
                aria-label="Saver bar color"
                value={barColor}
                onChange={setBarColor}
                allowReset
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveGoals}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
