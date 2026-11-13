import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import {
  getMonthByMonth,
  type MonthByMonthYear,
  type MonthResult,
} from '@/services/monthByMonth'
import { monthLabel } from './planFormat'
import {
  chartScale,
  columnName,
  monthFigure,
  shortMonth,
  yearAverage,
  yearCoverage,
  yearLabelAt,
  yearTitle,
  yearTotal,
} from './monthByMonthFormat'
import { useBudgetPlanRead } from './usePlanVsActual'

const monthHref = (month: string) => `/analytics/budget?month=${month}`

function Chart({
  months,
  selected,
  onColumnTap,
}: {
  months: MonthResult[]
  selected: readonly string[]
  onColumnTap: (month: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  // Open at the newest month, before first paint, with no animation.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])
  const scale = chartScale(months)

  return (
    <div
      ref={scroller}
      className="mbm-chart"
      data-testid="month-by-month-chart"
      style={{ '--mbm-baseline': `${scale.baseline * 100}%` } as CSSProperties}
    >
      <ol
        className="mbm-chart__months"
        aria-label="Saved or Overspent by month"
      >
        {months.map((m, i) => {
          const { tone } = monthFigure(m)
          const isSelected = selected.includes(m.month)
          const yearLabel = yearLabelAt(months, i)
          return (
            <li
              key={m.month}
              className={`mbm-chart__month${yearLabel ? ' is-year-start' : ''}`}
            >
              <button
                type="button"
                className={`mbm-col${isSelected ? ' is-selected' : ''}${
                  selected.length > 0 && !isSelected ? ' is-dimmed' : ''
                }`}
                data-tone={tone}
                aria-label={columnName(m)}
                aria-pressed={isSelected}
                onClick={() => onColumnTap(m.month)}
              >
                <span className="mbm-col__plot" aria-hidden>
                  {m.savedCents !== null && m.savedCents !== 0 && (
                    <span
                      className="mbm-col__bar"
                      style={{ height: `${scale.height(m.savedCents) * 100}%` }}
                    />
                  )}
                </span>
                <span className="mbm-col__label" aria-hidden>
                  {shortMonth(m.month)}
                </span>
              </button>
              <span className="mbm-chart__year" aria-hidden>
                {yearLabel ?? ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function SelectionLine({ month }: { month: MonthResult | null }) {
  const figure = month === null ? null : monthFigure(month)
  return (
    <p
      className="mbm-selection small"
      data-testid="month-by-month-selection"
      aria-live="polite"
    >
      {month === null || figure === null ? (
        <span className="plan-muted">Tap a month to see it</span>
      ) : (
        <>
          {monthLabel(month.month)} ·{' '}
          <span className={`mbm-fig mbm-fig--${figure.tone}`}>
            {figure.text}
          </span>{' '}
          ·{' '}
          <Link to={monthHref(month.month)} className="plan-link">
            Open
          </Link>
        </>
      )}
    </p>
  )
}

function YearRow({ year }: { year: MonthByMonthYear }) {
  const [open, setOpen] = useState(false)
  const total = yearTotal(year)
  const average = yearAverage(year)
  return (
    <li className="mbm-year" data-testid="month-by-month-year">
      <button
        type="button"
        className="mbm-year__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mbm-year__head">
          <span className="mbm-year__title fw-semibold">
            <i
              className={`mdi mdi-chevron-right plan-breakdown__chevron${open ? ' is-open' : ''}`}
              aria-hidden
            />
            {yearTitle(year)}
          </span>
          {total && (
            <span className={`mbm-fig mbm-fig--${total.tone}`}>
              {total.text}
            </span>
          )}
        </span>
        <span className="mbm-year__sub plan-muted small">
          {average && (
            <span className={`mbm-fig mbm-fig--${average.tone}`}>
              {average.text}
            </span>
          )}
          <span>{yearCoverage(year)}</span>
        </span>
      </button>
      {open && (
        <ul className="mbm-year__months">
          {year.months.map((m) => {
            const { text, tone } = monthFigure(m)
            return (
              <li key={m.month}>
                <Link
                  to={monthHref(m.month)}
                  className="mbm-row text-decoration-none"
                  data-testid="month-by-month-row"
                >
                  <span className="mbm-row__name">
                    {monthLabel(m.month)}
                    {m.noPlan && <span className="mbm-tag">No plan</span>}
                  </span>
                  <span className={`mbm-fig mbm-fig--${tone}`}>{text}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

/**
 * The Month by month card (#282, slice 3; #277, #278): every finished month's
 * Saved or Overspent as one scrolling column chart, then a row per calendar
 * year with its total and Average Saved, folding open to its months. The last
 * card on the Budget Plan, on every month it shows; hidden with no finished
 * month. Re-read after a sync, at local midnight and after the page's writes.
 *
 * Colour: Saved is green and Overspent red, on the columns and on the card's
 * figures. A deliberate exception, for this card only, to the Budget Plan's
 * "colour is for over only" rule (#174): here the sign is the point.
 *
 * Selection lives in one array so "Compare two months" can hold two later.
 * The first tap on a column selects it; tapping it again, or "Open", opens
 * the month.
 */
export function MonthByMonthCard({ version }: { version: number }) {
  const monthByMonth = useBudgetPlanRead(getMonthByMonth, version)
  const navigate = useNavigate()
  const [picked, setPicked] = useState<readonly string[]>([])
  if (monthByMonth === null) return null

  // A picked month that's no longer on the card (a re-read moved the range)
  // drops out, so nothing stays dimmed with no month selected.
  const selected = picked.filter((month) =>
    monthByMonth.months.some((m) => m.month === month)
  )
  const selectedMonth =
    monthByMonth.months.find((m) => m.month === selected[0]) ?? null

  function onColumnTap(month: string) {
    if (selected.includes(month)) navigate(monthHref(month))
    else setPicked([month])
  }

  return (
    <Card className="mbm" data-testid="month-by-month">
      <Card.Body className="py-3">
        <h3 className="h6 fw-semibold mb-0">Month by month</h3>
        <div className="plan-muted small mb-2">
          What each finished month saved or overspent.
        </div>
        <Chart
          months={monthByMonth.months}
          selected={selected}
          onColumnTap={onColumnTap}
        />
        <SelectionLine month={selectedMonth} />
        <ul className="mbm-years">
          {monthByMonth.years.map((y) => (
            <YearRow key={y.year} year={y} />
          ))}
        </ul>
        <div className="plan-muted small mt-2">
          Figures update as transactions sync.
        </div>
      </Card.Body>
    </Card>
  )
}
