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
          Getting started
        </Card.Header>
        <Card.Body>
          <p className="mb-2">
            During setup you create a passphrase (used to unlock the app each
            time), add your Up Bank Personal Access Token, and set your payday
            schedule. The token is validated and encrypted with your
            passphrase-derived key before being stored.
          </p>
          <p className="mb-2">
            To get a Personal Access Token: in the Up Bank app go to Profile →
            Data sharing → Personal access tokens, create a new token, and paste
            it into Vantura during onboarding or in Settings when updating.
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
            You can also run the dashboard tour again from Settings to be
            reminded how the main areas work.
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
        </Card.Body>
      </Card>
    </div>
  )
}
