import { useState } from 'react'
import { Card } from 'react-bootstrap'
import { MILESTONES, UPCOMING, type Milestone } from '@/data/changelog'
import { APP_VERSION } from '@/lib/appVersion'

// ── Static derived values ────────────────────────────────────────────
function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function countFeatures(month: string): number {
  return MILESTONES.filter((m) => m.primaryMonth === month).reduce(
    (sum, m) => sum + m.items.length,
    0
  )
}

const AVAILABLE_MONTHS = [
  ...new Set(MILESTONES.map((m) => m.primaryMonth)),
].sort()

const TOTAL_FEATURES = MILESTONES.reduce((sum, m) => sum + m.items.length, 0)

const SINCE_LABEL = new Date(AVAILABLE_MONTHS[0] + '-01').toLocaleString(
  'default',
  { month: 'short', year: 'numeric' }
)

const NOW_MONTH = toYearMonth(new Date())
const INITIAL_MONTH = AVAILABLE_MONTHS.includes(NOW_MONTH)
  ? NOW_MONTH
  : AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1]

// ── Exploring next groups ─────────────────────────────────────────────
const UPCOMING_GROUP_CONFIG = [
  {
    verdict: 'Extension' as const,
    label: 'Extensions',
    description: 'Building further on features already in Vantura',
    icon: 'mdi-layers-outline',
    color: '#80cbc4',
  },
  {
    verdict: 'Revival' as const,
    label: 'Revivals',
    description: 'Features that previously existed, coming back leaner',
    icon: 'mdi-restore',
    color: '#ce93d8',
  },
  {
    verdict: 'Partial' as const,
    label: 'Partially there',
    description: 'The infrastructure exists — UI is the next step',
    icon: 'mdi-dots-horizontal-circle-outline',
    color: '#ffe082',
  },
  {
    verdict: 'New' as const,
    label: 'Brand new',
    description: 'Net new features being designed from scratch',
    icon: 'mdi-star-outline',
    color: '#f48fb1',
  },
]

const GROUPED_UPCOMING = UPCOMING_GROUP_CONFIG.map((group) => ({
  ...group,
  items: UPCOMING.filter((item) => item.verdict === group.verdict),
})).filter((g) => g.items.length > 0)

// ── Component ────────────────────────────────────────────────────────
export function Changelog() {
  const [selectedMonth, setSelectedMonth] = useState(INITIAL_MONTH)
  const [expandedUpcoming, setExpandedUpcoming] = useState<string | null>(null)
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    new Set()
  )

  const toggleMilestone = (heading: string) => {
    setExpandedMilestones((prev) => {
      const next = new Set(prev)
      if (next.has(heading)) next.delete(heading)
      else next.add(heading)
      return next
    })
  }
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(GROUPED_UPCOMING.map((g) => g.verdict))
  )

  const toggleGroup = (verdict: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(verdict)) next.delete(verdict)
      else next.add(verdict)
      return next
    })
  }

  const idx = AVAILABLE_MONTHS.indexOf(selectedMonth)
  const canGoBack = idx > 0
  const canGoForward = idx < AVAILABLE_MONTHS.length - 1

  const goBack = () => {
    if (canGoBack) setSelectedMonth(AVAILABLE_MONTHS[idx - 1])
  }
  const goForward = () => {
    if (canGoForward) setSelectedMonth(AVAILABLE_MONTHS[idx + 1])
  }

  const selectedDate = new Date(selectedMonth + '-01')
  const isLatestMonth =
    selectedMonth === AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1]
  const selectedMonthLabel = selectedDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  const selectedMonthShort = selectedDate.toLocaleString('default', {
    month: 'long',
  })

  const prevCalDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() - 1,
    1
  )
  const prevMonthKey = toYearMonth(prevCalDate)
  const prevMonthName = prevCalDate.toLocaleString('default', { month: 'long' })

  const selectedCount = countFeatures(selectedMonth)
  const prevCount = countFeatures(prevMonthKey)
  const delta = selectedCount - prevCount
  const showDelta = prevCount > 0

  const statLabel =
    selectedMonth === NOW_MONTH ? 'this month' : `in ${selectedMonthShort}`

  const filteredMilestones = MILESTONES.filter(
    (m) => m.primaryMonth === selectedMonth
  )

  return (
    <div>
      <div className="sticky-toolbar">
        <div className="page-header" style={{ margin: 0 }}>
          <h3 className="page-title">
            <span className="page-title-icon">
              <i className="mdi mdi-rocket-launch-outline" aria-hidden />
            </span>
            What&apos;s new
          </h3>
        </div>
      </div>

      {/* ── Stat bar ────────────────────────────────────────────────── */}
      <div className="changelog-stat-bar mb-4">
        <div className="changelog-stat-item">
          <span className="changelog-stat-value">{selectedCount}</span>
          <span className="changelog-stat-label">features {statLabel}</span>
          {showDelta && (
            <span
              className={`changelog-stat-delta ${delta >= 0 ? 'changelog-stat-delta--up' : 'changelog-stat-delta--down'}`}
            >
              <i
                className={`mdi ${delta >= 0 ? 'mdi-trending-up' : 'mdi-trending-down'}`}
                aria-hidden
              />
              {delta >= 0 ? '+' : ''}
              {delta} vs {prevMonthName}
            </span>
          )}
        </div>

        <div className="changelog-stat-divider" aria-hidden />

        <div className="changelog-stat-item">
          <span className="changelog-stat-value">{TOTAL_FEATURES}</span>
          <span className="changelog-stat-label">features shipped</span>
        </div>

        <div className="changelog-stat-divider" aria-hidden />

        <div className="changelog-stat-item">
          <span className="changelog-stat-value">{SINCE_LABEL}</span>
          <span className="changelog-stat-label">shipping since</span>
        </div>

        <div className="changelog-stat-divider" aria-hidden />

        <div className="changelog-stat-item">
          <span className="changelog-stat-value">v{APP_VERSION}</span>
          <span className="changelog-stat-label">installed</span>
        </div>
      </div>

      {/* ── Under consideration ─────────────────────────────────────── */}
      <div className="changelog-upcoming-section mb-4">
        <div className="d-flex align-items-center gap-2 mb-2">
          <i
            className="mdi mdi-lightbulb-outline"
            style={{ color: '#ce93d8', fontSize: '1.1rem' }}
            aria-hidden
          />
          <h5 className="fw-semibold mb-0" style={{ color: '#ce93d8' }}>
            What we&apos;re exploring next
          </h5>
        </div>
        <p className="text-muted small mb-3">
          Ideas being considered for future updates — nothing here is committed
          or guaranteed.
        </p>
        <div className="changelog-upcoming-groups">
          {GROUPED_UPCOMING.map((group) => {
            const isCollapsed = collapsedGroups.has(group.verdict)
            return (
              <div key={group.verdict} className="changelog-upcoming-group">
                <div
                  className="changelog-upcoming-group-header"
                  onClick={() => toggleGroup(group.verdict)}
                  role="button"
                  aria-expanded={!isCollapsed}
                >
                  <i
                    className={`mdi ${group.icon} changelog-upcoming-group-icon`}
                    style={{ color: group.color }}
                    aria-hidden
                  />
                  <div className="changelog-upcoming-group-meta">
                    <div className="d-flex align-items-center gap-2">
                      <span className="changelog-upcoming-group-label">
                        {group.label}
                      </span>
                      <span
                        className={`changelog-upcoming-verdict changelog-upcoming-verdict--${group.verdict.toLowerCase()}`}
                      >
                        {group.items.length}
                      </span>
                    </div>
                    <p className="changelog-upcoming-group-description mb-0">
                      {group.description}
                    </p>
                  </div>
                  <i
                    className={`mdi mdi-chevron-down changelog-upcoming-group-chevron${isCollapsed ? ' changelog-upcoming-group-chevron--closed' : ''}`}
                    aria-hidden
                  />
                </div>
                {!isCollapsed && (
                  <div className="changelog-upcoming-grid">
                    {group.items.map((item) => {
                      const isOpen = expandedUpcoming === item.name
                      return (
                        <div
                          key={item.name}
                          className="changelog-upcoming-item"
                          onClick={() =>
                            setExpandedUpcoming(isOpen ? null : item.name)
                          }
                          role="button"
                          aria-expanded={isOpen}
                        >
                          <i
                            className={`mdi ${item.icon} changelog-upcoming-icon`}
                            style={{ color: item.color }}
                            aria-hidden
                          />
                          <div className="changelog-upcoming-body">
                            <div className="changelog-upcoming-header">
                              <span className="changelog-upcoming-name">
                                {item.name}
                              </span>
                              <i
                                className={`mdi mdi-chevron-down changelog-upcoming-chevron${isOpen ? ' changelog-upcoming-chevron--open' : ''}`}
                                aria-hidden
                              />
                            </div>
                            <p className="changelog-upcoming-tagline mb-0">
                              {item.tagline}
                            </p>
                            {isOpen && (
                              <p className="changelog-upcoming-detail mb-0">
                                {item.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Release history + month nav ─────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="fw-semibold mb-0">Release history</h5>
        <div
          className="changelog-month-nav"
          role="group"
          aria-label="Browse release months"
        >
          <button
            type="button"
            className="changelog-nav-btn"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label="Previous month"
          >
            <i className="mdi mdi-chevron-left" aria-hidden />
          </button>
          <span className="changelog-month-label">{selectedMonthLabel}</span>
          <button
            type="button"
            className="changelog-nav-btn"
            onClick={goForward}
            disabled={!canGoForward}
            aria-label="Next month"
          >
            <i className="mdi mdi-chevron-right" aria-hidden />
          </button>
          {!isLatestMonth && (
            <button
              type="button"
              className="changelog-nav-latest"
              onClick={() =>
                setSelectedMonth(AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1])
              }
              aria-label="Jump to latest releases"
            >
              Latest
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────── */}
      <div className="changelog-timeline">
        {filteredMilestones.map((milestone: Milestone, i: number) => {
          const isExpanded = expandedMilestones.has(milestone.heading)
          return (
            <div
              key={milestone.heading}
              className="changelog-milestone"
              style={
                { '--milestone-color': milestone.color } as React.CSSProperties
              }
            >
              <div className="changelog-milestone-date">
                <div className="d-flex flex-column align-items-center gap-1">
                  <span
                    className="changelog-date-pill"
                    style={{
                      background: milestone.color,
                      color: 'var(--vantura-text-on-pastel)',
                    }}
                  >
                    {milestone.date}
                  </span>
                  <span className="changelog-feature-count">
                    {milestone.items.length}{' '}
                    {milestone.items.length === 1 ? 'feature' : 'features'}
                  </span>
                </div>
              </div>
              <Card
                className="changelog-milestone-card"
                style={
                  {
                    '--milestone-color-bg': `${milestone.color}14`,
                  } as React.CSSProperties
                }
              >
                <Card.Body>
                  <div
                    className={`d-flex align-items-center gap-2 changelog-milestone-toggle${isExpanded ? ' mb-3' : ''}`}
                    onClick={() => toggleMilestone(milestone.heading)}
                    role="button"
                    aria-expanded={isExpanded}
                  >
                    <i
                      className={`mdi ${milestone.icon} changelog-milestone-heading-icon`}
                      style={{ color: milestone.color }}
                      aria-hidden
                    />
                    <h6
                      className="fw-semibold mb-0 flex-grow-1"
                      style={{ color: milestone.color }}
                    >
                      {milestone.heading}
                    </h6>
                    {isLatestMonth && i === 0 && (
                      <span
                        className="changelog-latest-badge"
                        style={{
                          background: milestone.color,
                          color: 'var(--vantura-text-on-pastel)',
                        }}
                      >
                        Latest
                      </span>
                    )}
                    <i
                      className={`mdi mdi-chevron-down changelog-milestone-chevron${isExpanded ? '' : ' changelog-milestone-chevron--closed'}`}
                      aria-hidden
                    />
                  </div>
                  {isExpanded && (
                    <ul className="changelog-item-list">
                      {milestone.items.map((item, j) => (
                        <li key={j} className="changelog-item">
                          <i
                            className={`mdi ${item.icon} changelog-item-icon`}
                            style={{ color: milestone.color }}
                            aria-hidden
                          />
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card.Body>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
