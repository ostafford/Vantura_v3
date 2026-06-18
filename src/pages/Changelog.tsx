import { useState } from 'react'
import { Card } from 'react-bootstrap'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'

interface MilestoneItem {
  icon: string
  text: string
}

interface Milestone {
  date: string
  heading: string
  primaryMonth: string // 'YYYY-MM' — drives month navigation and delta comparison
  color: string // hex — unique per milestone for visual separation
  items: MilestoneItem[]
}

const MILESTONES: Milestone[] = [
  {
    date: 'Jun 2026',
    heading: 'Documentation & UX Polish',
    primaryMonth: '2026-06',
    color: '#ce93d8', // lavender
    items: [
      {
        icon: 'mdi-book-open-page-variant',
        text: 'Help page fully redesigned — structured sub-headings, bullet lists, and Tip callouts for every section',
      },
      {
        icon: 'mdi-help-circle-outline',
        text: 'Help popovers (ⓘ) added to Weekly Insights, Budget Plan, and Savers; existing copy updated for Trackers and Upcoming charges',
      },
      {
        icon: 'mdi-map-marker-path',
        text: 'Dashboard tour overhauled — steps now follow your section order, all descriptions use bold key terms and line breaks',
      },
      {
        icon: 'mdi-file-document-outline',
        text: 'README, CHANGELOG, SECURITY, and Arch_Docs fully audited and updated to reflect current state',
      },
    ],
  },
  {
    date: 'Jun 2026',
    heading: 'Security & Theming',
    primaryMonth: '2026-06',
    color: '#80cbc4', // mint / teal
    items: [
      {
        icon: 'mdi-fingerprint',
        text: 'Biometric unlock — Touch ID / Face ID via WebAuthn (Settings → Security); falls back to passphrase if unavailable',
      },
      {
        icon: 'mdi-timer-lock-outline',
        text: 'Configurable inactivity lock — auto-locks after 1–30 minutes of no interaction (default 3 minutes)',
      },
      {
        icon: 'mdi-palette',
        text: 'Pastel accent colour system — six swatches: Sky, Mint, Lavender, Peach, Blush, Lemon; dark text on all pastel surfaces',
      },
      {
        icon: 'mdi-weather-night',
        text: 'Light theme removed — dark-only UI for a consistent, polished look',
      },
    ],
  },
  {
    date: 'Jun 2026',
    heading: 'Budget Plan',
    primaryMonth: '2026-06',
    color: '#ffab91', // peach / warm orange
    items: [
      {
        icon: 'mdi-wallet-outline',
        text: 'Organise expenses into named buckets — Subscriptions, Household, Lifestyle, or anything you like',
      },
      {
        icon: 'mdi-flask-outline',
        text: 'Hypothetical lines — add "what if?" expenses to any bucket without affecting real data; remove them any time',
      },
      {
        icon: 'mdi-calendar-month',
        text: 'Period toggle — view all amounts scaled to weekly, fortnightly, or monthly',
      },
      {
        icon: 'mdi-cash-multiple',
        text: 'Summary footer — Income (from your pay amount), total Committed spend, and Free Spending at a glance',
      },
    ],
  },
  {
    date: 'May–Jun 2026',
    heading: 'Analytics Overhaul',
    primaryMonth: '2026-05',
    color: '#90caf9', // sky blue
    items: [
      {
        icon: 'mdi-piggy-bank',
        text: 'Savers rebuilt — collapsible balance and contribution charts, drag-to-reorder cards, On track / Behind pace status',
      },
      {
        icon: 'mdi-file-chart',
        text: 'Reports page rebuilt — category breakdown, date filters, improved chart layout',
      },
      {
        icon: 'mdi-chart-bar',
        text: 'Saver forecasting — hover "Behind pace" badge to see your recommended monthly contribution',
      },
      {
        icon: 'mdi-information-outline',
        text: 'KPI tooltips added to Savers analytics tiles',
      },
      {
        icon: 'mdi-database-refresh',
        text: 'Demo data updated — PAYDAY tracker, tags, saver goals, and badge colours',
      },
    ],
  },
  {
    date: 'Apr–May 2026',
    heading: 'Dashboard & Tracker Refinements',
    primaryMonth: '2026-05',
    color: '#ffe082', // amber / lemon
    items: [
      {
        icon: 'mdi-view-dashboard',
        text: 'Dashboard moved to 2-column grid layout — cards grow to fill content, cleaner use of space',
      },
      {
        icon: 'mdi-chart-line',
        text: 'Tracker and upcoming charges UI polished — grouping, spacing, and layout improvements',
      },
      {
        icon: 'mdi-calculator-variant',
        text: 'Spendable calculation refined — improved proration accuracy for monthly, quarterly, and yearly charges',
      },
    ],
  },
  {
    date: 'Apr 2026',
    heading: 'Maybuys',
    primaryMonth: '2026-04',
    color: '#f48fb1', // blush / pink
    items: [
      {
        icon: 'mdi-cart-heart',
        text: "Add items you're considering buying — name, price, optional URL and notes",
      },
      {
        icon: 'mdi-timer-outline',
        text: '"Days thinking" timer — nudges you toward an intentional buy or skip decision',
      },
      {
        icon: 'mdi-history',
        text: 'History tab — all decided items with a days-held count',
      },
      {
        icon: 'mdi-piggy-bank-outline',
        text: "Optional Saver link — see how much you've already set aside for an item",
      },
    ],
  },
  {
    date: 'Mar–Apr 2026',
    heading: 'Analytics & Navigation',
    primaryMonth: '2026-04',
    color: '#80deea', // cyan
    items: [
      {
        icon: 'mdi-calendar-today',
        text: 'Month at a glance — day-by-day spending chart vs. the previous month, key metrics, and narrative summary',
      },
      {
        icon: 'mdi-calendar-blank-multiple',
        text: 'Year at a glance — full-year spending summary added to Analytics',
      },
      {
        icon: 'mdi-drag',
        text: 'Dashboard section drag-and-drop reorder — arrange sections to match how you work',
      },
      {
        icon: 'mdi-navigation-variant',
        text: 'Breadcrumb navigation and analytics sub-page routing',
      },
    ],
  },
  {
    date: 'Feb 2026',
    heading: 'Polish & Tooling',
    primaryMonth: '2026-02',
    color: '#a5d6a7', // soft green
    items: [
      {
        icon: 'mdi-cellphone',
        text: 'Mobile / portrait layout — overlay sidebar drawer, vertical charts, card-based lists below 768px',
      },
      {
        icon: 'mdi-database',
        text: 'Demo mode — "Try with sample data" at onboarding; no Up Bank token required',
      },
      {
        icon: 'mdi-chart-bar',
        text: 'D3 bar charts — Weekly Insights rebuilt with D3.js for compact, precise axis labels',
      },
      {
        icon: 'mdi-palette',
        text: 'Category bar colours — click any bar in Weekly Insights to set a persistent colour for that category',
      },
      {
        icon: 'mdi-book-open-page-variant',
        text: 'Help page — first-time user guide at /help covering all core features',
      },
      {
        icon: 'mdi-map-marker-path',
        text: 'Dashboard tour — guided walkthrough of every section; re-runnable from Settings',
      },
      {
        icon: 'mdi-shield-check-outline',
        text: 'Quality gates — typecheck, lint, format-check, and npm audit run on every CI build',
      },
    ],
  },
  {
    date: 'Feb 2026',
    heading: 'Foundation',
    primaryMonth: '2026-02',
    color: '#ffcc80', // warm amber / gold
    items: [
      {
        icon: 'mdi-wizard-hat',
        text: 'Onboarding wizard — 6-step flow: passphrase, API token, payday schedule, and initial sync',
      },
      {
        icon: 'mdi-lock',
        text: 'Encryption — API token encrypted with your passphrase (PBKDF2 + AES-GCM); passphrase never stored',
      },
      {
        icon: 'mdi-sync',
        text: 'Up Bank sync — initial and incremental sync with cursor-based pagination',
      },
      {
        icon: 'mdi-view-dashboard',
        text: 'Dashboard — Available, Spendable, Trackers, Weekly Insights, Upcoming charges, and Savers',
      },
      {
        icon: 'mdi-calculator',
        text: 'Spendable balance — Available minus prorated upcoming charges due before your next payday',
      },
      {
        icon: 'mdi-credit-card-multiple',
        text: 'Transactions — full history with date, category, amount, and search filters',
      },
      {
        icon: 'mdi-cog',
        text: 'Settings — theme, re-sync, API token update, and clear all data',
      },
      {
        icon: 'mdi-github',
        text: 'GitHub Pages deployment — CI/CD via GitHub Actions on every push to main',
      },
    ],
  },
]

interface UpcomingItem extends MilestoneItem {
  color: string
}

const UPCOMING: UpcomingItem[] = [
  {
    icon: 'mdi-bell-outline',
    color: '#ce93d8', // lavender
    text: 'Notifications — browser push reminders for upcoming charges due soon',
  },
  {
    icon: 'mdi-export-variant',
    color: '#90caf9', // sky
    text: 'Profile export v2 — include Budget Plan buckets in the exported profile file',
  },
  {
    icon: 'mdi-auto-fix',
    color: '#80cbc4', // mint
    text: 'Recurring transaction detection — auto-suggest upcoming charges from your transaction history',
  },
  {
    icon: 'mdi-currency-usd',
    color: '#ffe082', // amber
    text: 'Multi-currency display — show foreign amounts alongside AUD equivalents',
  },
  {
    icon: 'mdi-tag-outline',
    color: '#f48fb1', // blush
    text: 'Tags — user-defined transaction labels for finer categorisation',
  },
]

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

// Sorted list of months that have at least one milestone (ascending)
const AVAILABLE_MONTHS = [
  ...new Set(MILESTONES.map((m) => m.primaryMonth)),
].sort()

const TOTAL_FEATURES = MILESTONES.reduce((sum, m) => sum + m.items.length, 0)

const SINCE_LABEL = new Date(AVAILABLE_MONTHS[0] + '-01').toLocaleString(
  'default',
  { month: 'short', year: 'numeric' }
)

const NOW_MONTH = toYearMonth(new Date())
// Start on the latest available month (most recent releases)
const INITIAL_MONTH = AVAILABLE_MONTHS.includes(NOW_MONTH)
  ? NOW_MONTH
  : AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1]

interface ChangelogProps {
  isPublic?: boolean
}

// ── Component ────────────────────────────────────────────────────────
export function Changelog({ isPublic = false }: ChangelogProps) {
  const [selectedMonth, setSelectedMonth] = useState(INITIAL_MONTH)

  const idx = AVAILABLE_MONTHS.indexOf(selectedMonth)
  const canGoBack = idx > 0
  const canGoForward = idx < AVAILABLE_MONTHS.length - 1

  const goBack = () => {
    if (canGoBack) setSelectedMonth(AVAILABLE_MONTHS[idx - 1])
  }
  const goForward = () => {
    if (canGoForward) setSelectedMonth(AVAILABLE_MONTHS[idx + 1])
  }

  // Stat bar calculations for selected month
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
  const showDelta = prevCount > 0 // only show delta when previous month has data

  const statLabel =
    selectedMonth === NOW_MONTH ? 'this month' : `in ${selectedMonthShort}`

  // Timeline filtered to selected month
  const filteredMilestones = MILESTONES.filter(
    (m) => m.primaryMonth === selectedMonth
  )

  return (
    <div>
      <div className="sticky-toolbar">
        <div className="page-header" style={{ margin: 0 }}>
          <h3 className="page-title">
            <span className="page-title-icon bg-gradient-primary text-white mr-2">
              <i className="mdi mdi-rocket-launch-outline" aria-hidden />
            </span>
            What&apos;s new
          </h3>
          {!isPublic && (
            <PageBreadcrumb
              items={[{ label: 'Dashboard', to: '/' }, { label: "What's new" }]}
            />
          )}
        </div>
      </div>

      {/* ── Stat bar ────────────────────────────────────────────────── */}
      <div className="changelog-stat-bar mb-4">
        {/* Stat 1 — Selected month vs previous */}
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

        {/* Stat 2 — Total all-time */}
        <div className="changelog-stat-item">
          <span className="changelog-stat-value">{TOTAL_FEATURES}</span>
          <span className="changelog-stat-label">features shipped</span>
        </div>

        <div className="changelog-stat-divider" aria-hidden />

        {/* Stat 3 — Shipping since */}
        <div className="changelog-stat-item">
          <span className="changelog-stat-value">{SINCE_LABEL}</span>
          <span className="changelog-stat-label">shipping since</span>
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
        <div className="changelog-upcoming-grid">
          {UPCOMING.map((item, i) => (
            <div key={i} className="changelog-upcoming-item">
              <i
                className={`mdi ${item.icon} changelog-upcoming-icon`}
                style={{ color: item.color }}
                aria-hidden
              />
              <span>{item.text}</span>
            </div>
          ))}
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
        {filteredMilestones.map((milestone, i) => (
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
                  style={{ background: milestone.color, color: '#1a1a2e' }}
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
                <div className="d-flex align-items-center gap-2 mb-3">
                  <h6
                    className="fw-semibold mb-0"
                    style={{ color: milestone.color }}
                  >
                    {milestone.heading}
                  </h6>
                  {isLatestMonth && i === 0 && (
                    <span
                      className="changelog-latest-badge"
                      style={{ background: milestone.color, color: '#1a1a2e' }}
                    >
                      Latest
                    </span>
                  )}
                </div>
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
              </Card.Body>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
