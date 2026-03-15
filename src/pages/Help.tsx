import { Link } from 'react-router-dom'
import { Card } from 'react-bootstrap'

export function Help() {
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

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          What is Vantura?
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Vantura is a desktop-first financial insights app that syncs with
            your Up Bank account. Your data is stored locally in your browser
            and never leaves your device. When you sync, transactions are
            downloaded to this device only—no cloud storage; we don&apos;t have
            servers that store your data.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Navigation
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            The sidebar gives you access to: <strong>Dashboard</strong> (balance
            cards, This month, Savers, Goals, Weekly insights, Trackers,
            Upcoming charges), <strong>Analytics</strong> (net worth, reports,
            trackers, savers, goals, insights, monthly review),{' '}
            <strong>Transactions</strong> (filter and search),{' '}
            <strong>Settings</strong>, and <strong>Help</strong> (this user
            guide).
          </p>
          <p className="mb-0">
            You can collapse the sidebar by clicking the brand area at the top.
            At the bottom of the sidebar, <strong>Lock</strong> secures the app
            and the theme control switches between light and dark mode.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Getting started
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            During setup you create a passphrase (used to unlock the app each
            time), add your Up Bank Personal Access Token, and set your payday
            schedule. The token is validated and encrypted with your
            passphrase-derived key before being stored. You can optionally set
            your pay amount in Settings (Payday) for Spendable context and
            low-balance alerts.
          </p>
          <p className="mb-2">
            To get a Personal Access Token: in the Up Bank app go to Profile →
            Data sharing → Personal access tokens, create a new token, and paste
            it into Vantura during onboarding or in Settings when updating.
          </p>
          <p className="mb-2">
            On the Dashboard, the (i) icon next to some section titles
            (Trackers, Goals, Upcoming charges) opens a short explanation for
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
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Dashboard
        </Card.Header>
        <Card.Body>
          <p className="mb-0">
            The Dashboard shows balance cards (Available and Spendable), then
            sections you can reorder: <strong>This month</strong>{' '}
            (month-on-month comparison and narrative insights), Savers, Goals,
            Weekly insights, Trackers, and Upcoming charges. You can change the
            order in Settings (Dashboard sections) or by dragging section
            headers on the Dashboard.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Spendable balance
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            <strong>Spendable</strong> is your Available balance minus money
            reserved for upcoming charges before your next payday. Only charges
            due before the next payday are reserved; recurring charges (monthly,
            quarterly, yearly) are prorated so you see a fair &quot;safe to
            spend&quot; amount.
          </p>
          <p className="mb-2">
            You can set an optional low-balance alert: click the Spendable card
            on the Dashboard to set a dollar amount or a percentage of your pay.
            When Spendable drops below that threshold, the card turns red.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Trackers
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Trackers let you set a budget and track spending by category over a
            period. You choose a reset frequency: Weekly, Fortnightly, Monthly,
            or Payday. You can assign one or more categories to each tracker.
          </p>
          <p className="mb-2">
            The dashboard shows progress (how much of the budget is used), days
            left in the period, and transactions in the current period. PAYDAY
            trackers reset on your next payday and can warn you when you&apos;re
            over budget before payday.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Savers
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Savers reflect your Up Bank saver accounts. You can set a goal
            amount and optional target date. The dashboard shows current
            balance, goal progress, and monthly transfer if set. Goal-based
            savers help you see how much you need to put away to hit your target
            by the date.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Goals
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Goals are standalone financial goals (separate from Up Bank savers).
            You set a target amount and optional monthly contribution and target
            date, then track your current amount. Progress is shown on the
            Dashboard; you can mark goals complete when achieved. Under
            Analytics → Goals you can view progress and growth over time.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Upcoming charges
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Upcoming charges are manual entries for bills and subscriptions you
            know are coming (e.g. rent, Netflix). You enter name, amount,
            frequency (weekly, fortnightly, monthly, etc.), and next charge
            date. Each charge can be marked &quot;Include in Spendable&quot;
            (default: yes), meaning it reduces your Spendable until that date.
          </p>
          <p className="mb-2">
            Charges are grouped by &quot;Next pay&quot; (before your next
            payday) and &quot;Later&quot; so you can see what&apos;s due soon
            versus later.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Analytics
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            The Analytics section (sidebar) is your entry point for deeper
            views. <strong>Net worth</strong> charts your total Up account
            balance over time (recorded on each sync). <strong>Reports</strong>{' '}
            show spending by category over a date range and an optional
            income-to-spending flow (Sankey). <strong>Trackers</strong> and{' '}
            <strong>Savers</strong> analytics show trends, budget vs spend, and
            balance over time. <strong>Goals</strong> analytics show progress
            and growth. <strong>Weekly insights</strong> compare money in vs out
            by week and category spending. <strong>Monthly review</strong> gives
            money in/out, top categories, and tracker spend for any month.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Transactions
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            The Transactions page lists all synced transactions. You can filter
            by date range, category, amount range, and search text. Sort by
            date, amount, or merchant. Transactions are grouped by date.
            Round-ups are linked to their parent transaction when applicable.
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Settings
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            In Settings you can re-sync with Up Bank (to pull the latest
            transactions and category changes), update your Personal Access
            Token (e.g. if it expired), change your payday schedule and pay
            amount, and clear all data (which deletes the database and returns
            you to onboarding).
          </p>
          <p className="mb-2">
            <strong>Appearance:</strong> You can change the accent color in
            Settings (Appearance) and switch between light and dark theme via
            the theme control in the sidebar footer.
          </p>
          <p className="mb-2">
            <strong>Dashboard tour:</strong> A guided tour runs automatically
            the first time you visit the Dashboard. It walks through balance
            cards, Savers, Trackers, Weekly insights, Upcoming charges,
            Navigation, and Lock. You can run it again from Settings → Help
            (&quot;Show dashboard tour again&quot;).
          </p>
          <p className="mb-2">
            <strong>Dashboard sections:</strong> You can change the order of
            dashboard sections in Settings (Dashboard sections) or by dragging
            section headers on the Dashboard.
          </p>
          <p className="mb-2">
            <strong>Categorization rules:</strong> In Settings you can add rules
            that map transaction description patterns (e.g. a merchant name) to
            categories. Those categories are then suggested on the Transactions
            page when the pattern matches. Rules only—no AI.
          </p>
          <p className="mb-2">
            <strong>Export and import profile:</strong> You can export your
            settings to an encrypted file (passphrase-protected) and import on
            another device to restore your setup. Export includes appearance,
            payday, trackers, upcoming charges, and goals—not transactions or
            API tokens.
          </p>
          <p className="mb-2">
            <strong>Notifications:</strong> If your browser supports it, you can
            enable bill reminders in Settings (Notifications) to get a
            notification when upcoming charges are due soon (within their
            reminder window).
          </p>
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Security and privacy
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            Data is stored locally in your browser (IndexedDB). Your Up Bank API
            token is encrypted with a key derived from your passphrase (PBKDF2 +
            AES-GCM); the passphrase is never stored. No secrets are sent to our
            servers because we don&apos;t have any—everything runs in your
            browser.
          </p>
          <p className="mb-0">
            Use <strong>Lock</strong> (sidebar, bottom) to secure the app and
            clear the session when you step away. Your data stays on device but
            the app will require your passphrase to unlock when you return.
          </p>
        </Card.Body>
      </Card>
    </div>
  )
}
