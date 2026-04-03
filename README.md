# Vantura

Desktop-first financial insights app that syncs with Up Bank. Data is stored locally; nothing leaves your device.

**Live app:** [https://ostafford.github.io/Vantura_v3/](https://ostafford.github.io/Vantura_v3/)

## Quick start

**Requirements:** Node.js 18+.

```bash
npm install
npm run dev
```

Open the URL shown in the terminal. For build and deployment, see [Setup](#setup) and [Deployment](#deployment) below.

## What's new

User- and developer-visible changes are listed in [CHANGELOG.md](CHANGELOG.md). When adding features, update CHANGELOG under **Unreleased**.

## Features (implementation status)

### Phase 2: Onboarding & Sync — Implemented

- **Onboarding wizard (6 steps):** Welcome, passphrase creation, API token (validated and encrypted), payday schedule, initial sync with progress bar, completion. See `src/pages/Onboarding.tsx`.
- **Encryption & unlock:** API token encrypted with passphrase-derived key (Web Crypto: PBKDF2 100k iterations, AES-GCM 256-bit). Passphrase is never stored. Unlock screen on each app open. See `src/lib/crypto.ts`, `src/pages/Unlock.tsx`.
- **Sync:** Initial and incremental sync from navbar; Up Bank API with cursor-based pagination and rate limiting. See `src/services/sync.ts`, `src/api/upBank.ts`.

### Phase 3: Core Features — Implemented

- **Dashboard (2-column grid):** Balance cards (Available, Spendable with prorated reserved amount). Reorderable sections—**This month** (month-on-month summary), **Weekly insights**, **Trackers**, **Upcoming charges**—with drag-and-drop on the Dashboard or from Settings (Dashboard sections). Navbar: Sync, Last synced, Lock, Theme. See `src/pages/Dashboard.tsx`, `src/lib/dashboardSections.ts`.
- **Spendable balance:** Available minus reserved for upcoming charges (prorated by next payday; monthly/quarterly/yearly). See `src/services/balance.ts`, `src/components/BalanceCard.tsx`.
- **Trackers:** Create/edit with name, budget, reset frequency (Weekly/Fortnightly/Monthly/Payday), multi-category, optional badge color. Progress bar, days left, transactions in period. See `src/services/trackers.ts`, `src/components/dashboard/TrackersSection.tsx`.
- **Weekly insights:** Money In, Money Out, Saver changes, Charges count, Payments; category breakdown. Click a category bar to set a custom colour (applies to that category in all weeks). See `src/services/insights.ts`, `src/components/dashboard/InsightsSection.tsx`.
- **Upcoming charges:** Manual entry (name, amount, frequency, next charge date, category, Include in Spendable). Grouped by Next pay / Later. See `src/services/upcoming.ts`, `src/components/dashboard/UpcomingSection.tsx`.

### Phase 4: Transactions & Filtering — Implemented

- **Transaction list:** `/transactions` with filters (date range, category, amount range, search), sort (date, amount, merchant), date grouping. Round-ups linked to parent when `round_up_parent_id` set. See `src/pages/Transactions.tsx`, `src/services/transactions.ts`.

### Phase 5: Polish — Complete

- **Responsive (13"-27" desktop; mobile/portrait ≤768px):** Max-width 1400px; sidebar auto-collapses below 1280px; below 768px sidebar is an overlay drawer and content is full width. Vertical bar charts and card-based lists on mobile for better portrait use. Desktop horizontal bar charts (Weekly insights) use D3-based components with estimated axis label space for a compact left axis (`src/components/charts/InsightsBarChart.tsx`, `src/lib/chartLabelSpace.ts`). Error boundary; DB/persist error handling; loading states. Paginated transactions (50 per page). PWA (service worker, manifest, installable). See `src/layout/Layout.tsx`, `src/components/ErrorBoundary.tsx`, `vite.config.ts`.
- **Help page (user guide at `/help`) and optional dashboard tour (first-time and re-runnable from Settings):** tour covers balance cards, Trackers, Weekly insights, Upcoming charges, navigation (Analytics and other pages), and Lock. See `src/lib/dashboardTour.ts`.

### Phase 6: Deployment — Implemented

- **Build:** `npm run build` → `dist/` with base `/Vantura_v3/`; `dist/index.html` copied to `dist/404.html` for SPA routing. GitHub Actions (`.github/workflows/deploy.yml`) deploys on push to `main`.

### Phase 7: Settings — Implemented

- **Settings page:** Re-sync (button, Last synced, error state); theme and accent colour options; "Show dashboard tour again" button; Clear all data (confirmation; deletes database, reloads to Onboarding). See `src/pages/Settings.tsx`, `src/db/index.ts`.
- **Profile export/import:** Export whitelisted settings (theme, accent, payday and pay amount, spendable alerts, dashboard section order, categorization rules, insights category colours, dashboard tour state), plus trackers and upcoming charges, to a passphrase-encrypted file; import on another device. No transactions, API tokens, or bank data are ever exported. See Settings > Data section and `src/services/profileExport.ts`.

## Security

Data is stored locally in your browser (IndexedDB). Your Up Bank API token is encrypted with a key derived from your passphrase (PBKDF2 + AES-GCM); the passphrase is never stored. No secrets are committed to the repo. See [SECURITY.md](SECURITY.md) for details and how to report a vulnerability.

## Setup

**Requirements:** Node.js 18+.

```bash
npm install
npm run dev
```

**Build:** `npm run build`.

**Validate (format, lint, typecheck):** `npm run validate`. CI runs format-check, lint, typecheck, tests, and `npm audit --audit-level=critical` before build.

**Up Bank Personal Access Token:** Create in Up app > Profile > Data sharing > Personal access tokens. Enter during onboarding (step 3); it is validated, encrypted with your passphrase-derived key, and stored locally. Your passphrase is never stored.

**First run:** Onboarding guides you through passphrase creation, API token, payday schedule, and initial sync. After that, you see the Unlock screen on each app open until you enter your passphrase.

**Demo / sample data:** On the first onboarding step you can choose "Try with sample data" to use the app without an Up Bank token. Demo data is generated once at onboarding: transactions, trackers, and upcoming charges. Trackers and weekly insights include current and previous periods/weeks so you can try period navigation and comparisons. In demo mode the Unlock screen offers "Open demo" (no passphrase required) and a "DEMO" badge appears in the navbar and sidebar.

**Troubleshooting:**

- "Could not load app storage" — IndexedDB failed to initialise; try another browser, clear site data and retry, or check storage quota.
- Sync errors — Verify API token is valid and has required scopes; Up API rate limit (~60/min) may apply; wait and retry.
- Invalid token — Re-onboard: clear site data and start again (passphrase cannot be recovered if forgotten).

## Deployment

**GitHub Pages:** In repo Settings > Pages > Build and deployment > Source, choose "GitHub Actions". Push to `main` to trigger deploy. Live site: [https://ostafford.github.io/Vantura_v3/](https://ostafford.github.io/Vantura_v3/).

**Custom domain at root:** Set `base: '/'` in `vite.config.ts` if deploying to a custom domain at root.

**Local preview:** `npm run preview` (uses base `/Vantura_v3/` from vite.config). To preview at site root: `npm run preview -- --base /`.

## Documentation

Design notes and recommendations may appear under `docs/`. For user- and developer-visible changes, see [CHANGELOG.md](CHANGELOG.md). Implementation details live in the source tree (e.g. `src/db/schema.ts`, `src/services/`).
