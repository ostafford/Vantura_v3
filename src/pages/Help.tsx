import { Link } from 'react-router-dom'
import { Form } from 'react-bootstrap'
import { useSplitNavSection } from '@/hooks/useSplitNavSection'

const HELP_ACTIVE_SECTION_KEY = 'vantura_help_active_section'

const HELP_SECTION_KEYS = [
  'what-is-vantura',
  'navigation',
  'getting-started',
  'dashboard',
  'spendable-balance',
  'trackers',
  'upcoming-charges',
  'analytics',
  'transactions',
  'settings',
  'security-privacy',
] as const

const HELP_SECTION_LABELS: Record<string, string> = {
  'what-is-vantura': 'What is Vantura?',
  navigation: 'Navigation',
  'getting-started': 'Getting started',
  dashboard: 'Dashboard',
  'spendable-balance': 'Spendable balance',
  trackers: 'Trackers',
  'upcoming-charges': 'Upcoming charges',
  analytics: 'Analytics',
  transactions: 'Transactions',
  settings: 'Settings',
  'security-privacy': 'Security and privacy',
}

export function Help() {
  const { activeSection, selectSection, sectionKeys } = useSplitNavSection({
    storageKey: HELP_ACTIVE_SECTION_KEY,
    defaultSection: 'what-is-vantura',
    sectionKeys: HELP_SECTION_KEYS,
  })

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className="mdi mdi-book-open-page-variant" aria-hidden />
          </span>
          User guide
        </h3>
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/">Dashboard</Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              User guide
            </li>
          </ol>
        </nav>
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

              {activeSection === 'what-is-vantura' && (
                <>
                  <p className="mb-2">
                    Vantura is a desktop-first financial insights app that syncs
                    with your Up Bank account. Your data is stored locally in
                    your browser and never leaves your device. When you sync,
                    transactions are downloaded to this device only—no cloud
                    storage; we don&apos;t have servers that store your data.
                  </p>
                </>
              )}

              {activeSection === 'navigation' && (
                <>
                  <p className="mb-2">
                    The sidebar gives you access to: <strong>Dashboard</strong>{' '}
                    (balance cards, This month, Weekly insights, Trackers,
                    Upcoming charges), <strong>Analytics</strong> (reports,
                    trackers, insights, monthly review),{' '}
                    <strong>Transactions</strong> (filter and search),{' '}
                    <strong>Settings</strong>, and <strong>Help</strong> (this
                    user guide).
                  </p>
                  <p className="mb-0">
                    You can collapse the sidebar by clicking the brand area at
                    the top. At the bottom of the sidebar, <strong>Lock</strong>{' '}
                    secures the app and the theme control switches between light
                    and dark mode.
                  </p>
                </>
              )}

              {activeSection === 'getting-started' && (
                <>
                  <p className="mb-2">
                    During setup you create a passphrase (used to unlock the app
                    each time), add your Up Bank Personal Access Token, and set
                    your payday schedule. The token is validated and encrypted
                    with your passphrase-derived key before being stored. You
                    can optionally set your pay amount in Settings (Payday) for
                    Spendable context and low-balance alerts.
                  </p>
                  <p className="mb-2">
                    To get a Personal Access Token: in the Up Bank app go to
                    Profile → Data sharing → Personal access tokens, create a
                    new token, and paste it into Vantura during onboarding or in
                    Settings when updating.
                  </p>
                  <p className="mb-2">
                    On the Dashboard, the (i) icon next to some section titles
                    (Trackers, Upcoming charges) opens a short explanation for
                    that section.
                  </p>
                  <p className="mb-0">
                    <a
                      href="https://developer.up.com.au/#personal-access-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Learn more about Up Bank Personal Access Tokens
                    </a>
                  </p>
                </>
              )}

              {activeSection === 'dashboard' && (
                <p className="mb-0">
                  The Dashboard shows balance cards (Available and Spendable),
                  then sections you can reorder: <strong>This month</strong>{' '}
                  (month-on-month comparison and narrative insights), Weekly
                  insights, Trackers, and Upcoming charges. You can change the
                  order in Settings (Dashboard sections) or by dragging section
                  headers on the Dashboard.
                </p>
              )}

              {activeSection === 'spendable-balance' && (
                <>
                  <p className="mb-2">
                    <strong>Spendable</strong> is your Available balance minus
                    money reserved for upcoming charges before your next payday.
                    Only charges due before the next payday are reserved;
                    recurring charges (monthly, quarterly, yearly) are prorated
                    so you see a fair &quot;safe to spend&quot; amount.
                  </p>
                  <p className="mb-2">
                    You can set an optional low-balance alert: click the
                    Spendable card on the Dashboard to set a dollar amount or a
                    percentage of your pay. When Spendable drops below that
                    threshold, the card turns red.
                  </p>
                </>
              )}

              {activeSection === 'trackers' && (
                <>
                  <p className="mb-2">
                    Trackers let you set a budget and track spending by category
                    over a period. You choose a reset frequency: Weekly,
                    Fortnightly, Monthly, or Payday. You can assign one or more
                    categories to each tracker.
                  </p>
                  <p className="mb-2">
                    The dashboard shows progress (how much of the budget is
                    used), days left in the period, and transactions in the
                    current period. PAYDAY trackers reset on your next payday
                    and can warn you when you&apos;re over budget before payday.
                  </p>
                </>
              )}

              {activeSection === 'upcoming-charges' && (
                <>
                  <p className="mb-2">
                    Upcoming charges are manual entries for bills and
                    subscriptions you know are coming (e.g. rent, Netflix). You
                    enter name, amount, frequency (weekly, fortnightly, monthly,
                    etc.), and next charge date. Each charge can be marked
                    &quot;Include in Spendable&quot; (default: yes), meaning it
                    reduces your Spendable until that date.
                  </p>
                  <p className="mb-2">
                    Charges are grouped by &quot;Next pay&quot; (before your
                    next payday) and &quot;Later&quot; so you can see
                    what&apos;s due soon versus later.
                  </p>
                </>
              )}

              {activeSection === 'analytics' && (
                <p className="mb-2">
                  The Analytics section (sidebar) is your entry point for deeper
                  views. <strong>Reports</strong> show spending by category over
                  a date range and an optional income-to-spending flow (Sankey).{' '}
                  <strong>Trackers</strong> analytics show trends, budget vs
                  spend, and history. <strong>Weekly insights</strong> compare
                  money in vs out by week and category spending.{' '}
                  <strong>Monthly review</strong> gives money in/out, top
                  categories, and tracker spend for any month.
                </p>
              )}

              {activeSection === 'transactions' && (
                <p className="mb-2">
                  The Transactions page lists all synced transactions. You can
                  filter by date range, category, amount range, and search text.
                  Sort by date, amount, or merchant. Transactions are grouped by
                  date. Round-ups are linked to their parent transaction when
                  applicable.
                </p>
              )}

              {activeSection === 'settings' && (
                <>
                  <p className="mb-2">
                    In Settings you can re-sync with Up Bank (to pull the latest
                    transactions and category changes), update your Personal
                    Access Token (e.g. if it expired), change your payday
                    schedule and pay amount, and clear all data (which deletes
                    the database and returns you to onboarding).
                  </p>
                  <p className="mb-2">
                    <strong>Appearance:</strong> You can change the accent color
                    in Settings (Appearance) and switch between light and dark
                    theme via the theme control in the sidebar footer.
                  </p>
                  <p className="mb-2">
                    <strong>Dashboard tour:</strong> A guided tour runs
                    automatically the first time you visit the Dashboard. It
                    walks through balance cards, Trackers, Weekly insights,
                    Upcoming charges, Navigation, and Lock. You can run it again
                    from Settings → Help (&quot;Show dashboard tour
                    again&quot;).
                  </p>
                  <p className="mb-2">
                    <strong>Dashboard sections:</strong> You can change the
                    order of dashboard sections in Settings (Dashboard sections)
                    or by dragging section headers on the Dashboard.
                  </p>
                  <p className="mb-2">
                    <strong>Categorization rules:</strong> In Settings you can
                    add rules that map transaction description patterns (e.g. a
                    merchant name) to categories. Those categories are then
                    suggested on the Transactions page when the pattern matches.
                    Rules only—no AI.
                  </p>
                  <p className="mb-2">
                    <strong>Export and import profile:</strong> You can export
                    your settings to an encrypted file (passphrase-protected)
                    and import on another device to restore your setup. Export
                    includes appearance, payday, trackers, and upcoming
                    charges—not transactions or API tokens.
                  </p>
                  <p className="mb-2">
                    <strong>Notifications:</strong> If your browser supports it,
                    you can enable bill reminders in Settings (Notifications) to
                    get a notification when upcoming charges are due soon
                    (within their reminder window).
                  </p>
                </>
              )}

              {activeSection === 'security-privacy' && (
                <>
                  <p className="mb-2">
                    Data is stored locally in your browser (IndexedDB). Your Up
                    Bank API token is encrypted with a key derived from your
                    passphrase (PBKDF2 + AES-GCM); the passphrase is never
                    stored. No secrets are sent to our servers because we
                    don&apos;t have any—everything runs in your browser.
                  </p>
                  <p className="mb-0">
                    Use <strong>Lock</strong> (sidebar, bottom) to secure the
                    app and clear the session when you step away. Your data
                    stays on device but the app will require your passphrase to
                    unlock when you return.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
