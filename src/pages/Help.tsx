import { Form } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useSplitNavSection } from '@/hooks/useSplitNavSection'
import { MILESTONES } from '@/data/changelog'

const MILESTONE_COUNT = MILESTONES.length
const TOTAL_FEATURE_COUNT = MILESTONES.reduce(
  (sum, m) => sum + m.items.length,
  0
)
const EARLIEST_MONTH = [...new Set(MILESTONES.map((m) => m.primaryMonth))]
  .sort()
  .at(0)
const SINCE_LABEL = EARLIEST_MONTH
  ? new Date(EARLIEST_MONTH + '-01').toLocaleString('default', {
      month: 'short',
      year: 'numeric',
    })
  : ''

const HELP_ACTIVE_SECTION_KEY = 'vantura_help_active_section'

const HELP_SECTION_KEYS = [
  'what-is-vantura',
  'navigation',
  'getting-started',
  'dashboard',
  'trackers',
  'upcoming-charges',
  'analytics',
  'budget-plan',
  'savers',
  'transactions',
  'settings',
  'security-privacy',
] as const

const HELP_SECTION_LABELS: Record<string, string> = {
  'what-is-vantura': 'What is Vantura?',
  navigation: 'Navigation',
  'getting-started': 'Getting started',
  dashboard: 'Dashboard',
  trackers: 'Trackers',
  'upcoming-charges': 'Regulars',
  analytics: 'Analytics',
  'budget-plan': 'Budget Plan',
  savers: 'Savers',
  transactions: 'Transactions',
  settings: 'Settings',
  'security-privacy': 'Security and privacy',
}

function SectionHeading({
  icon,
  children,
  first = false,
}: {
  icon: string
  children: React.ReactNode
  first?: boolean
}) {
  return (
    <h6
      className={`d-flex align-items-center gap-2 text-muted mb-1 fw-semibold ${first ? '' : 'mt-3'}`}
      style={{
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      <i
        className={`mdi ${icon}`}
        style={{ color: 'var(--vantura-primary-text)', fontSize: '1rem' }}
        aria-hidden
      />
      {children}
    </h6>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="d-flex align-items-start gap-2 p-2 rounded mt-2 mb-0 small"
      style={{ background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.05))' }}
    >
      <i
        className="mdi mdi-lightbulb-outline flex-shrink-0"
        style={{ color: 'var(--vantura-primary-text)', marginTop: 1 }}
        aria-hidden
      />
      <span>{children}</span>
    </div>
  )
}

import type React from 'react'

export function Help() {
  const { activeSection, selectSection, sectionKeys } = useSplitNavSection({
    storageKey: HELP_ACTIVE_SECTION_KEY,
    defaultSection: 'what-is-vantura',
    sectionKeys: HELP_SECTION_KEYS,
  })

  return (
    <div>
      <div className="sticky-toolbar">
        <div className="page-header" style={{ margin: 0 }}>
          <h3 className="page-title">
            <span className="page-title-icon">
              <i className="mdi mdi-book-open-page-variant" aria-hidden />
            </span>
            User guide
          </h3>
        </div>
      </div>

      <div className="settings-layout">
        <div className="row g-0 settings-layout-row">
          <aside className="col-md-4 col-lg-3 border-end settings-nav-column d-none d-md-block">
            <nav
              className="list-group list-group-flush settings-nav"
              aria-label="User guide sections"
            >
              {sectionKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`list-group-item list-group-item-action border-0 rounded-0 ${
                    activeSection === key ? 'active' : ''
                  }`}
                  onClick={() => selectSection(key)}
                  aria-current={activeSection === key ? 'page' : undefined}
                >
                  {HELP_SECTION_LABELS[key] ?? key}
                </button>
              ))}
            </nav>
          </aside>
          <div className="col-12 d-md-none mb-3 px-3">
            <Form.Label
              htmlFor="help-section-mobile"
              className="small text-muted"
            >
              Section
            </Form.Label>
            <Form.Select
              id="help-section-mobile"
              value={activeSection}
              onChange={(e) => selectSection(e.target.value)}
              aria-label="User guide section"
            >
              {sectionKeys.map((key) => (
                <option key={key} value={key}>
                  {HELP_SECTION_LABELS[key] ?? key}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-12 col-md-8 col-lg-9 settings-panel-column">
            <div className="settings-panel">
              <h2 className="h5 mb-3 fw-medium">
                {HELP_SECTION_LABELS[activeSection] ?? activeSection}
              </h2>

              {/* ── What is Vantura? ─────────────────────────────────── */}
              {activeSection === 'what-is-vantura' && (
                <>
                  <SectionHeading icon="mdi-bank" first>
                    What it does
                  </SectionHeading>
                  <p className="mb-2">
                    Vantura is a financial insights app for Up Bank customers in
                    Australia. It syncs with your Up Bank account and gives you
                    budgeting tools, spending analytics, and a real-time view of
                    your safe-to-spend balance.
                  </p>

                  <SectionHeading icon="mdi-harddisk">
                    Your data stays on your device
                  </SectionHeading>
                  <p className="mb-3">
                    When you sync, transactions are downloaded to this device
                    only — no cloud storage and no servers that hold your data.
                    Everything runs in your browser.
                  </p>

                  <Link
                    to="/changelog"
                    className="d-flex align-items-center gap-3 p-3 rounded text-decoration-none"
                    style={{
                      background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.05))',
                      border: '1px solid var(--bs-border-color)',
                    }}
                  >
                    <i
                      className="mdi mdi-rocket-launch-outline flex-shrink-0"
                      style={{
                        color: 'var(--vantura-primary-text)',
                        fontSize: '1.5rem',
                      }}
                      aria-hidden
                    />
                    <div>
                      <div
                        className="fw-semibold small"
                        style={{ color: 'var(--vantura-primary-text)' }}
                      >
                        See what&apos;s been built
                      </div>
                      <div className="text-muted small">
                        {MILESTONE_COUNT} milestones · {TOTAL_FEATURE_COUNT}{' '}
                        features shipped since {SINCE_LABEL}
                      </div>
                    </div>
                    <i
                      className="mdi mdi-chevron-right ms-auto"
                      style={{ color: 'var(--vantura-primary-text)' }}
                      aria-hidden
                    />
                  </Link>
                </>
              )}

              {/* ── Navigation ──────────────────────────────────────── */}
              {activeSection === 'navigation' && (
                <>
                  <SectionHeading icon="mdi-menu" first>
                    Sidebar links
                  </SectionHeading>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Dashboard</strong> — balance cards, Month at a
                      glance, Trackers, Regulars
                    </li>
                    <li className="mb-1">
                      <strong>Analytics</strong> — Trackers, Savers, Budget Plan
                    </li>
                    <li className="mb-1">
                      <strong>Transactions</strong> — filter, search, and browse
                      all synced transactions
                    </li>
                    <li>
                      <strong>Settings</strong> — sync, pay, appearance,
                      security, and more. The <strong>About</strong> section
                      inside Settings links to this user guide and the
                      changelog.
                    </li>
                  </ul>

                  <SectionHeading icon="mdi-lock">Lock</SectionHeading>
                  <p className="mb-2">
                    At the bottom of the sidebar. Secures the app and clears the
                    session immediately — use it before stepping away from your
                    device.
                  </p>

                  <SectionHeading icon="mdi-arrow-collapse-left">
                    Collapse
                  </SectionHeading>
                  <p className="mb-0">
                    Click the brand area at the top of the sidebar to collapse
                    or expand it.
                  </p>
                </>
              )}

              {/* ── Getting started ──────────────────────────────────── */}
              {activeSection === 'getting-started' && (
                <>
                  <SectionHeading icon="mdi-numeric-1-circle-outline" first>
                    Create a passphrase
                  </SectionHeading>
                  <p className="mb-2">
                    Your passphrase encrypts your API token and is required to
                    unlock the app. It is never stored — keep it somewhere safe.
                  </p>

                  <SectionHeading icon="mdi-numeric-2-circle-outline">
                    Add your Up Bank token
                  </SectionHeading>
                  <p className="mb-2">
                    In the Up app:{' '}
                    <strong>
                      Profile → Data sharing → Personal access tokens
                    </strong>
                    . Create a new token and paste it into Vantura. It is
                    validated and encrypted before being stored.
                  </p>
                  <p className="mb-2">
                    <a
                      href="https://developer.up.com.au/#personal-access-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Learn more about Up Bank Personal Access Tokens
                    </a>
                  </p>

                  <SectionHeading icon="mdi-numeric-3-circle-outline">
                    Set your pay
                  </SectionHeading>
                  <p className="mb-0">
                    Choose your pay frequency (weekly, fortnightly, or monthly)
                    and, optionally, your take-home pay amount.
                  </p>
                  <Tip>
                    Your pay amount enables Unallocated in Budget Plan and Free
                    spending so far on the Dashboard. You can set or change it
                    any time in Settings → Pay.
                  </Tip>
                </>
              )}

              {/* ── Dashboard ────────────────────────────────────────── */}
              {activeSection === 'dashboard' && (
                <>
                  <SectionHeading icon="mdi-currency-usd" first>
                    Headroom
                  </SectionHeading>
                  <p className="mb-2">
                    <strong>Headroom</strong> sits at the top of the Dashboard:
                    what you have <strong>On hand</strong> minus what&apos;s{' '}
                    <strong>Still to go out</strong> this month. On hand is your
                    Spending account plus any Savers you switch on. Still to go
                    out is every Regular not paid yet this month plus
                    what&apos;s left in each tracker. Headroom can go below
                    zero.
                  </p>

                  <SectionHeading icon="mdi-view-grid-outline">
                    Reorderable sections
                  </SectionHeading>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Month at a glance</strong> — day-by-day spending
                      for the current calendar month vs the previous month, with
                      the month&apos;s money in and money out
                    </li>
                    <li className="mb-1">
                      <strong>Trackers</strong> — budget progress and days
                      remaining per tracker
                    </li>
                    <li>
                      <strong>Regulars</strong> — bills and subscriptions
                      grouped by Overdue, This month and Later
                    </li>
                  </ul>
                  <Tip>
                    Drag the icon on the left of any section header to reorder,
                    or use Settings → Dashboard sections.
                  </Tip>
                </>
              )}

              {/* ── Trackers ─────────────────────────────────────────── */}
              {activeSection === 'trackers' && (
                <>
                  <SectionHeading icon="mdi-information-outline" first>
                    What they do
                  </SectionHeading>
                  <p className="mb-2">
                    Set a budget and reset period for each tracker, then assign
                    one or more Up Bank spending categories to it. The Dashboard
                    shows budget progress, days left in the current period, and
                    recent transactions.
                  </p>
                  <p className="mb-2">
                    Create a tracker using the{' '}
                    <strong>
                      <i className="mdi mdi-plus" aria-hidden /> button
                    </strong>{' '}
                    in the Trackers section header on the Dashboard.
                  </p>

                  <SectionHeading icon="mdi-refresh">
                    Reset frequencies
                  </SectionHeading>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Weekly</strong> — resets each week
                    </li>
                    <li className="mb-1">
                      <strong>Fortnightly</strong> — resets every two weeks
                    </li>
                    <li>
                      <strong>Monthly</strong> — resets on the 1st of each month
                    </li>
                  </ul>

                  <SectionHeading icon="mdi-swap-horizontal">
                    Period toggle
                  </SectionHeading>
                  <p className="mb-0">
                    Use the <strong>Weekly / Monthly / Yearly</strong> toggle to
                    rescale all tracker amounts to any view period — for
                    example, a $200/month tracker in weekly view displays
                    ~$46/week.
                  </p>
                  <Tip>
                    For trend charts and full transaction history per tracker,
                    go to <strong>Analytics → Trackers</strong>.
                  </Tip>
                </>
              )}

              {/* ── Upcoming charges ─────────────────────────────────── */}
              {activeSection === 'upcoming-charges' && (
                <>
                  <SectionHeading icon="mdi-information-outline" first>
                    What they are
                  </SectionHeading>
                  <p className="mb-2">
                    Manual entries for bills and subscriptions you know are
                    coming — rent, Netflix, insurance, gym memberships, etc. The
                    due date automatically advances to the next occurrence after
                    each cycle.
                  </p>

                  <SectionHeading icon="mdi-calendar-clock">
                    Frequencies
                  </SectionHeading>
                  <p className="mb-2">
                    Weekly · Fortnightly · Monthly · Quarterly · Yearly · Once
                  </p>

                  <SectionHeading icon="mdi-format-list-group">
                    Grouping
                  </SectionHeading>
                  <ul className="mb-0 ps-3">
                    <li className="mb-1">
                      <strong>Overdue</strong> — one-off charges whose date has
                      passed
                    </li>
                    <li className="mb-1">
                      <strong>This month</strong> — charges next due by the end
                      of this calendar month
                    </li>
                    <li>
                      <strong>Later</strong> — charges next due after this month
                    </li>
                  </ul>
                </>
              )}

              {/* ── Analytics ────────────────────────────────────────── */}
              {activeSection === 'analytics' && (
                <>
                  <p className="mb-3 text-muted small">
                    Analytics (sidebar) gives you deeper views of your finances.
                  </p>

                  <SectionHeading icon="mdi-chart-line" first>
                    Trackers
                  </SectionHeading>
                  <p className="mb-2">
                    Spending trends per tracker, budget vs actual spend across
                    periods, and full transaction history for each tracker.
                  </p>

                  <SectionHeading icon="mdi-piggy-bank">Savers</SectionHeading>
                  <p className="mb-2">
                    Saver account balances, savings goals with on-track /
                    behind-pace projections, and monthly contribution charts.
                    See <strong>Help → Savers</strong> for full details.
                  </p>

                  <SectionHeading icon="mdi-wallet-outline">
                    Budget Plan
                  </SectionHeading>
                  <p className="mb-0">
                    This month&apos;s plan vs actual, with your expenses grouped
                    into buckets. See <strong>Help → Budget Plan</strong> for
                    full details.
                  </p>
                </>
              )}

              {/* ── Budget Plan ──────────────────────────────────────── */}
              {activeSection === 'budget-plan' && (
                <>
                  <SectionHeading icon="mdi-information-outline" first>
                    What it is
                  </SectionHeading>
                  <p className="mb-2">
                    Budget Plan (Analytics → Budget Plan) helps you see your
                    complete financial picture by grouping expenses into named{' '}
                    <strong>buckets</strong> — for example Subscriptions,
                    Household, or Lifestyle.
                  </p>

                  <SectionHeading icon="mdi-folder-multiple-outline">
                    What goes in a bucket
                  </SectionHeading>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Regulars</strong> you&apos;ve already set up —
                      assign them to a bucket so they count toward that
                      bucket&apos;s total
                    </li>
                    <li>
                      <strong>Trackers</strong> — assign them to a bucket so
                      their budget counts toward that bucket&apos;s total
                    </li>
                  </ul>

                  <SectionHeading icon="mdi-calendar-month-outline">
                    This month, plan vs actual
                  </SectionHeading>
                  <p className="mb-1">
                    The page always shows the current calendar month. Every
                    figure is this month&apos;s: a quarterly bill counts in the
                    month it&apos;s due.
                  </p>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Free spending so far</strong> — your monthly
                      Income minus everything that&apos;s gone out this month
                    </li>
                    <li className="mb-1">
                      <strong>The bar</strong> splits your Income into Spent on
                      plan, Spent unplanned, Still to go out, and what&apos;s
                      left if the rest goes to plan. Tap Spent unplanned to see
                      where it went
                    </li>
                    <li className="mb-1">
                      <strong>Committed</strong> — what your buckets plan this
                      month
                    </li>
                    <li className="mb-1">
                      <strong>Unallocated</strong> — Income minus Committed: the
                      Income no bucket plans for
                    </li>
                    <li>
                      <strong>Bucket cards</strong> show what&apos;s gone out
                      against what&apos;s planned for each Regular and Tracker.
                      A Tracker&apos;s tick marks where spending would be today
                      if spread evenly. Only over shows in colour
                    </li>
                  </ul>
                  <Tip>
                    Regulars and Trackers not in a bucket still count as Spent
                    on plan, on the dashed Not in a bucket card, but plan
                    nothing toward Committed. Set your pay amount in{' '}
                    <strong>Settings → Pay</strong> to see Income and the bar.
                  </Tip>
                </>
              )}

              {/* ── Savers ───────────────────────────────────────────── */}
              {activeSection === 'savers' && (
                <>
                  <SectionHeading icon="mdi-information-outline" first>
                    Overview
                  </SectionHeading>
                  <p className="mb-2">
                    Savers (Analytics → Savers) syncs with your Up Bank saver
                    accounts. The monthly overview at the top shows:
                  </p>
                  <ul className="mb-2 ps-3">
                    <li className="mb-1">
                      <strong>Self-contributed</strong> — manual transfers to
                      your savers this month
                    </li>
                    <li className="mb-1">
                      <strong>Round-ups</strong> — Loose Change accumulation
                      this month
                    </li>
                    <li className="mb-1">
                      <strong>Total saver balance</strong> — combined balance
                      across all savers
                    </li>
                    <li>
                      A <strong>health badge</strong>: On track, No
                      contributions, or Net withdrawal
                    </li>
                  </ul>

                  <SectionHeading icon="mdi-flag-checkered">
                    Setting a goal
                  </SectionHeading>
                  <p className="mb-2">
                    Tap <strong>+ Set goal</strong> on any saver card to set a
                    target dollar amount and an optional target date. Vantura
                    shows a progress bar and projects whether you&apos;re{' '}
                    <strong>On track</strong> or <strong>Behind pace</strong>{' '}
                    based on last month&apos;s contribution rate.
                  </p>
                  <Tip>
                    Hover the &quot;Behind pace&quot; badge to see exactly how
                    much more per month you&apos;d need to save to hit your goal
                    on time.
                  </Tip>

                  <SectionHeading icon="mdi-chart-bar">Charts</SectionHeading>
                  <p className="mb-2">
                    Expand any saver card (tap <strong>Show charts</strong>) to
                    see a monthly contributions chart for the last 12 months and
                    a balance trend chart.
                  </p>

                  <SectionHeading icon="mdi-drag">Reordering</SectionHeading>
                  <p className="mb-0">
                    Drag saver cards by their name to reorder them — the order
                    is saved automatically.
                  </p>
                </>
              )}

              {/* ── Transactions ─────────────────────────────────────── */}
              {activeSection === 'transactions' && (
                <>
                  <SectionHeading icon="mdi-format-list-text" first>
                    What it shows
                  </SectionHeading>
                  <p className="mb-2">
                    All synced transactions, grouped by date. Round-ups (Loose
                    Change) are linked to their parent transaction.
                  </p>

                  <SectionHeading icon="mdi-filter-outline">
                    Filters and sorting
                  </SectionHeading>
                  <ul className="mb-0 ps-3">
                    <li className="mb-1">Date range</li>
                    <li className="mb-1">Category</li>
                    <li className="mb-1">Amount range</li>
                    <li className="mb-1">
                      Search text — merchant name or description
                    </li>
                    <li>
                      Sort by: <strong>date</strong>, <strong>amount</strong>,
                      or <strong>merchant</strong>
                    </li>
                  </ul>
                </>
              )}

              {/* ── Settings ─────────────────────────────────────────── */}
              {activeSection === 'settings' && (
                <>
                  <SectionHeading icon="mdi-sync" first>
                    Sync and token
                  </SectionHeading>
                  <p className="mb-2">
                    Re-sync to pull the latest transactions and category changes
                    from Up Bank. Update your Personal Access Token here if it
                    expires or you need to replace it.
                  </p>

                  <SectionHeading icon="mdi-cash">Pay</SectionHeading>
                  <p className="mb-2">
                    Your pay frequency and <strong>pay amount</strong> set your
                    monthly Income, which gives Unallocated in Budget Plan and
                    Free spending so far on the Dashboard.
                  </p>

                  <SectionHeading icon="mdi-palette-outline">
                    Appearance
                  </SectionHeading>
                  <p className="mb-2">
                    Choose Light, Dark, or System theme. Colours for trackers,
                    buckets, and spending categories are assigned automatically
                    and aren&apos;t user-configurable.
                  </p>

                  <SectionHeading icon="mdi-view-dashboard-outline">
                    Dashboard sections
                  </SectionHeading>
                  <p className="mb-2">
                    Change the order of dashboard sections here, or drag section
                    headers directly on the Dashboard.
                  </p>

                  <SectionHeading icon="mdi-export">
                    Export and import
                  </SectionHeading>
                  <p className="mb-2">
                    Export your settings to an encrypted, passphrase-protected
                    file and import it on another device. Includes appearance,
                    pay, lock timeout, trackers, Regulars, and Budget Plan
                    buckets.{' '}
                    <em>
                      Transactions, account data, and API tokens are never
                      exported.
                    </em>
                  </p>

                  <SectionHeading icon="mdi-shield-lock-outline">
                    Security
                  </SectionHeading>
                  <p className="mb-0">
                    Set the inactivity lock timeout (1–30 minutes, default 3
                    minutes). If your device supports it, enable biometric
                    unlock (Touch ID / Face ID) so you can unlock without typing
                    your passphrase each time.
                  </p>
                </>
              )}

              {/* ── Security and privacy ─────────────────────────────── */}
              {activeSection === 'security-privacy' && (
                <>
                  <SectionHeading icon="mdi-harddisk" first>
                    Data storage
                  </SectionHeading>
                  <p className="mb-2">
                    Your data is stored locally in your browser (IndexedDB) and
                    never leaves your device. Nothing is sent to any server —
                    everything runs entirely in your browser.
                  </p>

                  <SectionHeading icon="mdi-key-outline">
                    Encryption
                  </SectionHeading>
                  <p className="mb-2">
                    Your Up Bank API token is encrypted with a key derived from
                    your passphrase. The passphrase itself is never stored —
                    only you can decrypt your data. Keep your passphrase safe;
                    there is no recovery option if it is lost.
                  </p>

                  <SectionHeading icon="mdi-lock">
                    Locking the app
                  </SectionHeading>
                  <p className="mb-2">
                    Use <strong>Lock</strong> (bottom of the sidebar) to secure
                    the app and clear the session when stepping away. Your data
                    stays on device, but authentication is required to unlock.
                  </p>

                  <SectionHeading icon="mdi-timer-outline">
                    Auto-lock
                  </SectionHeading>
                  <p className="mb-2">
                    The app locks automatically after a configurable period of
                    inactivity. Set the timeout in{' '}
                    <strong>Settings → Security</strong> (default: 3 minutes,
                    options from 1 to 30 minutes).
                  </p>

                  <SectionHeading icon="mdi-fingerprint">
                    Biometric unlock
                  </SectionHeading>
                  <p className="mb-0">
                    If your device supports it, enable Touch ID or Face ID in{' '}
                    <strong>Settings → Security</strong>. Once enabled, you can
                    unlock with your biometric instead of typing your
                    passphrase. Your passphrase remains the primary credential —
                    biometrics is a convenience layer on top.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-top d-flex align-items-center gap-2 small text-muted">
        <i
          className="mdi mdi-rocket-launch-outline"
          style={{ color: 'var(--vantura-primary-text)' }}
          aria-hidden
        />
        <span>
          Curious what&apos;s been built?{' '}
          <Link
            to="/changelog"
            style={{ color: 'var(--vantura-primary-text)' }}
          >
            See what&apos;s new in Vantura
          </Link>
        </span>
      </div>
    </div>
  )
}
