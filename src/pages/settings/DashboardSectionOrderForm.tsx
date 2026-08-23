import { useState } from 'react'
import { Button } from 'react-bootstrap'
import { toast } from '@/stores/toastStore'
import {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  DEFAULT_DASHBOARD_SECTION_ORDER,
  DASHBOARD_SECTION_LABELS,
  type DashboardSectionId,
} from '@/lib/dashboardSections'

export function DashboardSectionOrderForm() {
  const [order, setOrder] = useState<DashboardSectionId[]>(() =>
    getDashboardSectionOrder()
  )

  const moveUp = (index: number) => {
    if (index <= 0) return
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    setOrder(next)
    setDashboardSectionOrder(next)
  }
  const moveDown = (index: number) => {
    if (index >= order.length - 1) return
    const next = [...order]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    setOrder(next)
    setDashboardSectionOrder(next)
  }
  const resetToDefault = () => {
    setOrder([...DEFAULT_DASHBOARD_SECTION_ORDER])
    setDashboardSectionOrder([...DEFAULT_DASHBOARD_SECTION_ORDER])
    toast.success('Section order reset to default.')
  }

  return (
    <div>
      <ul className="list-group list-group-flush mb-3">
        {order.map((id, index) => (
          <li
            key={id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            <span>{DASHBOARD_SECTION_LABELS[id]}</span>
            <div className="d-flex gap-1">
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} up`}
              >
                <i className="mdi mdi-chevron-up" aria-hidden />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveDown(index)}
                disabled={index === order.length - 1}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} down`}
              >
                <i className="mdi mdi-chevron-down" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={resetToDefault}
          aria-label="Reset dashboard section order to default"
        >
          Reset to default order
        </Button>
        <span className="small text-muted">
          <i className="mdi mdi-check-circle-outline me-1" aria-hidden />
          Changes save automatically
        </span>
      </div>
    </div>
  )
}
