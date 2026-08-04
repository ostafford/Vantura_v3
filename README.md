# Vantura

A local-first financial insights app for Up Bank customers. All data stays on your device — nothing is sent to any server.

**Live app:** [https://myvantura.xyz/](https://myvantura.xyz/)

---

## Features

- **Dashboard** — Balance cards (Available, Spendable), four reorderable sections: Month at a glance, Weekly insights, Trackers, and Upcoming charges.
- **Spendable balance** — Safe-to-spend amount: your available balance minus upcoming charges prorated to your next payday.
- **Trackers** — Budget categories with weekly, fortnightly, monthly, or payday reset cycles. Progress bar, days to reset, and transaction list per tracker.
- **Upcoming charges** — Bills and subscriptions with frequency, due date, and optional Spendable deduction.
- **Weekly insights** — Money in, money out, saver movement, and category breakdown for any week.
- **Month at a glance** — Day-by-day spending chart vs. the previous month, with key metrics and narrative summary.
- **Analytics** — Deeper trends across Trackers, Reports, and Savers.
- **Savers** — Track Up Bank saver accounts with goal amounts, target dates, contribution history, and drag-to-reorder cards.
- **Budget Plan** — Group expenses into named buckets with hypothetical "what if?" lines and a free-spending summary.
- **Notifications** — Bell inbox in the navbar with 8 financial alert types (bills due, tracker overspent, low spendable, payday, large transactions, saver milestones, and more); per-type toggles in Settings.
- **Transactions** — Full history with filters (date, category, amount, search) and round-up linking.
- **Profile export / import** — Back up settings, trackers, and upcoming charges to an encrypted file; restore on another device.
- **Biometric unlock** — Touch ID / Face ID via WebAuthn with configurable inactivity lock (Settings → Security).
- **What's new** — In-app changelog shown automatically after updates; full release history at `/changelog`.
- **Demo mode** — Try the app with sample data, no Up Bank token required.
- **PWA** — Installable, works offline after first load.

---

## Quick start

**Requirements:** Node.js 18+

```bash
npm install
npm run dev
```

Open the URL shown in the terminal.

---

## Setup

**Up Bank Personal Access Token:** Create in Up app → Profile → Data sharing → Personal access tokens. Enter during onboarding; it is encrypted with a key derived from your passphrase and never stored in plain form.

**First run:** The onboarding wizard guides you through passphrase creation, API token entry, payday schedule, and initial sync. After that, an unlock screen appears on each app open.

**Demo / sample data:** Choose "Try with sample data" on the first onboarding step to explore the app without an Up Bank token. A DEMO badge appears in the navbar.

**Validate (format, lint, typecheck):** `npm run validate` — CI runs format-check, lint, typecheck, tests, and `npm audit --audit-level=critical` before each build.

**Troubleshooting:**
- *"Could not load app storage"* — IndexedDB failed to initialise; try another browser, clear site data, or check storage quota.
- *Sync errors* — Verify your API token is valid; Up API rate limit (~60/min) may apply — wait and retry.
- *Forgotten passphrase* — Clear site data and re-onboard with a new passphrase and API token (the old token cannot be recovered).

---

## Security

All data is stored locally in your browser (IndexedDB). Your Up Bank API token is encrypted with a passphrase-derived key (PBKDF2 + AES-GCM 256-bit); the passphrase is never stored. Biometric unlock (Touch ID / Face ID) is available as an optional convenience layer — it does not replace the passphrase. No secrets are committed to this repository.

See [SECURITY.md](SECURITY.md) for full details and how to report a vulnerability.

---

## Deployment

**Hosting:** Cloudflare Pages — auto-deploys on every push to `main`. No manual steps required. Configuration: `public/_redirects` (SPA routing), `public/_headers` (security headers).

**Live site:** [https://myvantura.xyz/](https://myvantura.xyz/)

**Old URL redirect:** `https://ostafford.github.io/Vantura_v3/` now redirects automatically to `https://myvantura.xyz/` via a `gh-pages` branch redirect page.

**CI:** GitHub Actions (`.github/workflows/deploy.yml`) runs format-check, lint, typecheck, tests, and `npm audit --audit-level=critical` on every push. Cloudflare Pages handles deployment automatically on push to `main`.

**Cloudflare Pages build settings:**
- Project name + build output directory: see [`wrangler.toml`](wrangler.toml) (in-repo, verifiable)
- Build command: `npm run build` (configured in the Cloudflare dashboard)
- Environment variable: `NODE_VERSION=24` (configured in the Cloudflare dashboard)

**Local preview:** `npm run preview`

---

## Documentation

| File | Purpose |
|------|---------|
| [ROADMAP.md](ROADMAP.md) | Full feature timeline — what was built, when, and what's under consideration |
| [CHANGELOG.md](CHANGELOG.md) | Version-by-version change log |
| [SECURITY.md](SECURITY.md) | Data handling and vulnerability reporting |
| `Reference_Docs/` | Deep technical reference (schema, calc logic, sync, UI/UX, security) — not in the public repo, working detail for active development |
