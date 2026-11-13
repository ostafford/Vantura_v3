import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getMonthByMonth,
  type MonthByMonth,
  type MonthByMonthMonth,
  type MonthByMonthYear,
} from '@/services/monthByMonth'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'
import { monthLabel } from './planFormat'
import {
  columnName,
  monthFigure,
  shortMonth,
  toneOf,
  yearAverage,
  yearCoverage,
  yearTitle,
  yearTotal,
} from './monthByMonthFormat'

/**
 * The Month by month read, re-read after a sync, at local midnight and
 * whenever `version` changes (the page bumps it after its own writes).
 */
function useMonthByMonth(version: number): MonthByMonth | null {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  return useMemo(
    () => getMonthByMonth(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, lastSyncCompletedAt, version]
  )
}

const monthHref = (month: string) => `/analytics/budget?month=${month}`

/** Brings the page back to the top, where the opened month's summary is. */
function scrollToTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

/**
 * The column chart's shared scale: one cents-to-height ratio for Saved
 * (above the baseline) and Overspent (below it). The baseline sits where the
 * largest Saved and largest Overspent just fit, so the largest absolute
 * figure fills its side.
 */
function chartScale(months: MonthByMonthMonth[]) {
  let up = 0
  let down = 0
  for (const m of months) {
    if (m.savedCents === null) continue
    if (m.savedCents > 0) up = Math.max(up, m.savedCents)
    else down = Math.max(down, -m.savedCents)
  }
  const span = up + down
  return {
    /** The baseline's distance from the top, as a fraction of the plot. */
    baseline: span === 0 ? 1 : up / span,
    /** A figure's height, as a fraction of the plot. */
    height: (cents: number) => (span === 0 ? 0 : Math.abs(cents) / span),
  }
}

function Chart({
  months,
  selected,
  onTap,
}: {
  months: MonthByMonthMonth[]
  selected: readonly string[]
  onTap: (month: string) => void
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
          const yearStart = i === 0 || m.month.endsWith('-01')
          const barHeight =
            m.savedCents === null ? 0 : scale.height(m.savedCents)
          return (
            <li
              key={m.month}
              className={`mbm-chart__month${yearStart ? ' is-year-start' : ''}`}
            >
              <button
                type="button"
                className={`mbm-col${isSelected ? ' is-selected' : ''}${
                  selected.length > 0 && !isSelected ? ' is-dimmed' : ''
                }`}
                data-tone={tone}
                aria-label={columnName(m)}
                aria-pressed={isSelected}
                onClick={() => onTap(m.month)}
              >
                <span className="mbm-col__plot" aria-hidden>
                  {tone !== 'none' && m.savedCents !== 0 && (
                    <span
                      className="mbm-col__bar"
                      style={{ height: `${barHeight * 100}%` }}
                    />
                  )}
                </span>
                <span className="mbm-col__label" aria-hidden>
                  {shortMonth(m.month)}
                </span>
              </button>
              <span className="mbm-chart__year" aria-hidden>
                {yearStart ? m.month.slice(0, 4) : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function SelectionLine({
  month,
  onOpen,
}: {
  month: MonthByMonthMonth | null
  onOpen: () => void
}) {
  return (
    <p
      className="mbm-selection small mb-0"
      data-testid="month-by-month-selection"
      aria-live="polite"
    >
      {month === null ? (
        <span className="plan-muted">Tap a month to see it</span>
      ) : (
        <>
          {monthLabel(month.month)} ·{' '}
          <span className={`mbm-fig mbm-fig--${monthFigure(month).tone}`}>
            {monthFigure(month).text}
          </span>{' '}
          ·{' '}
          <Link
            to={monthHref(month.month)}
            className="plan-link"
            onClick={onOpen}
          >
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
            <span className={`mbm-fig mbm-fig--${toneOf(year.totalCents)}`}>
              {total}
            </span>
          )}
        </span>
        <span className="mbm-year__sub plan-muted small">
          {average && (
            <span
              className={`mbm-fig mbm-fig--${toneOf(year.averageSavedCents)}`}
            >
              {average}
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
                  onClick={scrollToTop}
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
 * month.
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
  const read = useMonthByMonth(version)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<readonly string[]>([])
  if (read === null) return null

  const selectedMonth = read.months.find((m) => m.month === selected[0]) ?? null

  function tap(month: string) {
    if (selected.includes(month)) {
      navigate(monthHref(month))
      scrollToTop()
    } else {
      setSelected([month])
    }
  }

  return (
    <Card className="mbm" data-testid="month-by-month">
      <Card.Body className="py-3">
        <h3 className="h6 fw-semibold mb-0">Month by month</h3>
        <div className="plan-muted small mb-2">
          What each finished month saved or overspent.
        </div>
        <Chart months={read.months} selected={selected} onTap={tap} />
        <SelectionLine month={selectedMonth} onOpen={scrollToTop} />
        <ul className="mbm-years">
          {read.years.map((y) => (
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
