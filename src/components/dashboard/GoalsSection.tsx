import { useState, useMemo } from 'react'
import {
  Card,
  Button,
  Modal,
  Form,
  ProgressBar,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  markGoalComplete,
  reopenGoal,
  type GoalWithProgress,
} from '@/services/goals'
import { formatMoney } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { HelpPopover } from '@/components/HelpPopover'

const GOAL_ICONS = [
  { value: null, label: 'None' },
  { value: '\uD83C\uDFE0', label: 'House' },
  { value: '\uD83D\uDE97', label: 'Car' },
  { value: '\u2708\uFE0F', label: 'Travel' },
  { value: '\uD83C\uDF93', label: 'Education' },
  { value: '\uD83D\uDCB0', label: 'Savings' },
  { value: '\uD83C\uDFA8', label: 'Hobby' },
  { value: '\uD83C\uDF89', label: 'Event' },
  { value: '\uD83D\uDEE1\uFE0F', label: 'Emergency' },
  { value: '\uD83D\uDCBB', label: 'Tech' },
  { value: '\uD83C\uDFCB\uFE0F', label: 'Fitness' },
]

export function GoalsSection() {
  const [, setRefresh] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null)
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [monthlyContribution, setMonthlyContribution] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const goals = getGoals()
  const active = useMemo(() => goals.filter((g) => !g.completed_at), [goals])
  const completed = useMemo(() => goals.filter((g) => g.completed_at), [goals])

  function openCreate() {
    setEditingGoal(null)
    setName('')
    setTargetAmount('')
    setCurrentAmount('')
    setMonthlyContribution('')
    setTargetDate('')
    setIcon(null)
    setShowModal(true)
  }

  function openEdit(g: GoalWithProgress) {
    setEditingGoal(g)
    setName(g.name)
    setTargetAmount(String(g.target_amount / 100))
    setCurrentAmount(String(g.current_amount / 100))
    setMonthlyContribution(
      g.monthly_contribution != null ? String(g.monthly_contribution / 100) : ''
    )
    setTargetDate(g.target_date ?? '')
    setIcon(g.icon)
    setShowModal(true)
  }

  function handleSave() {
    const targetCents = Math.round(parseFloat(targetAmount || '0') * 100)
    if (!name.trim() || targetCents <= 0) return
    const currentCents = Math.round(parseFloat(currentAmount || '0') * 100)
    const monthlyCents = monthlyContribution
      ? Math.round(parseFloat(monthlyContribution) * 100)
      : null
    const dateVal = targetDate.trim() || null
    if (editingGoal) {
      updateGoal(
        editingGoal.id,
        name.trim(),
        targetCents,
        currentCents,
        monthlyCents,
        dateVal,
        icon
      )
      toast.success('Goal updated.')
    } else {
      createGoal(name.trim(), targetCents, monthlyCents, dateVal, icon)
      toast.success('Goal created.')
    }
    setShowModal(false)
    setRefresh((r) => r + 1)
  }

  function handleDelete() {
    if (editingGoal) {
      deleteGoal(editingGoal.id)
      setShowModal(false)
      setRefresh((r) => r + 1)
      toast.success('Goal deleted.')
    }
  }

  function handleMarkComplete(g: GoalWithProgress) {
    markGoalComplete(g.id)
    setRefresh((r) => r + 1)
    toast.success(`Goal "${g.name}" completed!`)
  }

  function handleReopen(g: GoalWithProgress) {
    reopenGoal(g.id)
    setRefresh((r) => r + 1)
  }

  return (
    <>
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center section-header">
          <div className="d-flex align-items-center gap-2">
            <span className="page-title-icon bg-gradient-primary text-white mr-2">
              <i className="mdi mdi-flag-checkered" aria-hidden />
            </span>
            <span>Goals</span>
            <HelpPopover
              id="goals-help"
              title="Goals"
              content="Create standalone financial goals with a target amount and optional monthly contribution. Track progress manually and mark goals complete when achieved."
              ariaLabel="What are goals?"
            />
          </div>
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id="goal-add-tooltip">Add goal</Tooltip>}
          >
            <Button
              variant="primary"
              size="sm"
              onClick={openCreate}
              aria-label="Add goal"
            >
              <i className="mdi mdi-plus" aria-hidden />
            </Button>
          </OverlayTrigger>
        </Card.Header>
        <Card.Body>
          {active.length === 0 && completed.length === 0 ? (
            <p className="text-muted small mb-0">
              No goals yet. Create a goal to track saving toward something
              specific.
            </p>
          ) : (
            <>
              {active.map((g) => (
                <div key={g.id} className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <div className="d-flex align-items-center gap-2">
                      {g.icon && <span>{g.icon}</span>}
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none fw-medium"
                        onClick={() => openEdit(g)}
                        style={{ color: 'inherit' }}
                      >
                        {g.name}
                      </button>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="small text-muted">
                        ${formatMoney(g.current_amount)} / $
                        {formatMoney(g.target_amount)}
                      </span>
                      {g.progress >= 100 && (
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleMarkComplete(g)}
                          aria-label={`Mark ${g.name} complete`}
                        >
                          <i className="mdi mdi-check" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                  <ProgressBar
                    now={Math.min(100, g.progress)}
                    variant={g.progress >= 100 ? 'success' : 'primary'}
                    style={{ height: 8 }}
                    aria-label={`${g.name} progress: ${Math.round(g.progress)}%`}
                  />
                  {g.monthly_contribution != null && (
                    <div className="small text-muted mt-1">
                      ${formatMoney(g.monthly_contribution)}/month
                      {g.target_date && ` · Target: ${g.target_date}`}
                    </div>
                  )}
                </div>
              ))}
              {completed.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-link p-0 small text-muted text-decoration-none"
                    onClick={() => setShowCompleted((v) => !v)}
                  >
                    {showCompleted ? 'Hide' : 'Show'} completed (
                    {completed.length})
                  </button>
                  {showCompleted &&
                    completed.map((g) => (
                      <div
                        key={g.id}
                        className="d-flex justify-content-between align-items-center mt-2 opacity-75"
                      >
                        <div className="d-flex align-items-center gap-2">
                          {g.icon && <span>{g.icon}</span>}
                          <span className="text-decoration-line-through small">
                            {g.name}
                          </span>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <span className="small text-muted">
                            ${formatMoney(g.target_amount)}
                          </span>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => handleReopen(g)}
                            aria-label={`Reopen ${g.name}`}
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

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingGoal ? 'Edit goal' : 'New goal'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="goal-name">Name</Form.Label>
              <Form.Control
                id="goal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Holiday fund"
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="goal-target-amount">
                Target amount ($)
              </Form.Label>
              <Form.Control
                id="goal-target-amount"
                type="number"
                step="0.01"
                min="0"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </Form.Group>
            {editingGoal && (
              <Form.Group className="mb-2">
                <Form.Label htmlFor="goal-current-amount">
                  Current amount ($)
                </Form.Label>
                <Form.Control
                  id="goal-current-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                />
              </Form.Group>
            )}
            <Form.Group className="mb-2">
              <Form.Label htmlFor="goal-monthly">
                Monthly contribution ($)
              </Form.Label>
              <Form.Control
                id="goal-monthly"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="goal-target-date">Target date</Form.Label>
              <Form.Control
                id="goal-target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Icon</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {GOAL_ICONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    style={{
                      minWidth: 40,
                      borderColor:
                        icon === opt.value
                          ? 'var(--vantura-primary)'
                          : undefined,
                      borderWidth: icon === opt.value ? 2 : undefined,
                    }}
                    onClick={() => setIcon(opt.value)}
                    aria-pressed={icon === opt.value}
                    aria-label={opt.label}
                  >
                    {opt.value ?? 'None'}
                  </button>
                ))}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          {editingGoal && (
            <Button
              variant="outline-danger"
              className="me-auto"
              onClick={handleDelete}
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
