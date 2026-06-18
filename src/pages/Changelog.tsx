import { Card } from 'react-bootstrap'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'

interface MilestoneItem {
  icon: string
  text: string
}

interface Milestone {
  date: string
  heading: string
  items: MilestoneItem[]
}

const MILESTONES: Milestone[] = [
  {
    date: 'Jun 2026',
    heading: 'Documentation & UX Polish',
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

const UPCOMING: MilestoneItem[] = [
  {
    icon: 'mdi-bell-outline',
    text: 'Notifications — browser push reminders for upcoming charges due soon',
  },
  {
    icon: 'mdi-export-variant',
    text: 'Profile export v2 — include Budget Plan buckets in the exported profile file',
  },
  {
    icon: 'mdi-auto-fix',
    text: 'Recurring transaction detection — auto-suggest upcoming charges from your transaction history',
  },
  {
    icon: 'mdi-currency-usd',
    text: 'Multi-currency display — show foreign amounts alongside AUD equivalents',
  },
  {
    icon: 'mdi-tag-outline',
    text: 'Tags — user-defined transaction labels for finer categorisation',
  },
]

export function Changelog() {
  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className="mdi mdi-rocket-launch-outline" aria-hidden />
          </span>
          What&apos;s new
        </h3>
        <PageBreadcrumb
          items={[{ label: 'Dashboard', to: '/' }, { label: "What's new" }]}
        />
      </div>

      <p className="text-muted mb-4">
        A timeline of every feature shipped in Vantura — most recent first.
      </p>

      {/* ── Timeline ──────────────────────────────────────────────── */}
      <div className="changelog-timeline">
        {MILESTONES.map((milestone, i) => (
          <div key={i} className="changelog-milestone">
            <div className="changelog-milestone-date">
              <span
                className="changelog-date-pill"
                style={{ background: 'var(--vantura-primary)', color: '#fff' }}
              >
                {milestone.date}
              </span>
            </div>
            <Card className="changelog-milestone-card">
              <Card.Body>
                <h6
                  className="fw-semibold mb-3"
                  style={{ color: 'var(--vantura-primary)' }}
                >
                  {milestone.heading}
                </h6>
                <ul className="changelog-item-list">
                  {milestone.items.map((item, j) => (
                    <li key={j} className="changelog-item">
                      <i
                        className={`mdi ${item.icon} changelog-item-icon`}
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

      {/* ── Under consideration ───────────────────────────────────── */}
      <div className="mt-4">
        <h5 className="fw-semibold mb-1">Under consideration</h5>
        <p className="text-muted small mb-3">
          Ideas being explored — nothing here is committed or guaranteed.
        </p>
        <Card>
          <Card.Body>
            <ul className="changelog-item-list">
              {UPCOMING.map((item, i) => (
                <li key={i} className="changelog-item">
                  <i
                    className={`mdi ${item.icon} changelog-item-icon`}
                    style={{ color: 'var(--bs-secondary-color)' }}
                    aria-hidden
                  />
                  <span className="text-muted">{item.text}</span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}
