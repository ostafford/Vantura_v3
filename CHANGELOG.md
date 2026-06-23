# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Hosting consolidated to Cloudflare Pages:** Domain (`myvantura.xyz`), CDN, and hosting now reside within a single provider. The app URL is unchanged. SPA routing handled by `public/_redirects`; security headers (CSP, HSTS, etc.) moved to `public/_headers`. Netlify configuration (`netlify.toml`) retained for reference but is no longer the active host. See `public/_redirects`, `public/_headers`.

## [0.5.2] - 2026-06-21

### Changed

- **Hosting migrated to Netlify** (`https://vanturaup.netlify.app`): Vantura is now served from Netlify's global CDN. All sub-routes (`/settings`, `/transactions`, `/analytics`, etc.) return HTTP 200 for every user on every device — PWA and browser — with no service worker dependency. The GitHub Pages 404-on-sub-route issue is permanently resolved. See `netlify.toml`, `vite.config.ts` (base path `/ `).
- **Base path simplified:** Removed the `/Vantura_v3/` repo-name prefix from all asset URLs. All resources now serve from root `/`.
- **CI workflow updated:** GitHub Actions renamed from "Deploy to GitHub Pages" to "CI"; runs on all branches and pull requests. Quality gates (format, lint, typecheck, tests, audit, build) still run on every push. Netlify handles deployment automatically on push to `main`. See `.github/workflows/deploy.yml`.
- **Toast notifications slide in/out:** Replaced Bootstrap's fade-only Toast with a custom component using CSS `@keyframes` — notifications slide down from the top on entry and slide back up on dismiss. Applies to all 50 toast calls across the app (sync, save, update check, settings changes, etc.). See `src/components/ToastProvider.tsx`, `src/index.css`.

### Fixed

- **What's New modal no longer shows empty:** If a version bump has no matching milestone entries in `changelog.ts`, the modal silently marks the version seen and suppresses itself rather than rendering a blank body. See `src/components/WhatsNewModal.tsx`.

## [0.5.1] - 2026-06-21

### Added

- **PWA auto-update on app resume:** The service worker now silently checks for updates every time the user returns to the app (`visibilitychange`) and on a 30-minute background interval for long-running sessions — no force-quit required to pick up a new build. See `src/hooks/usePwaUpdate.ts`.
- **"Check for updates" button in Settings → Help:** Manually trigger an update check at any time. Shows a spinner while checking, then a toast confirming "Vantura is up to date", "Update found! See the banner below to install.", or a connection-error message. In development (no service worker), shows an informational message explaining why the check is unavailable. See `src/pages/Settings.tsx`, `src/hooks/usePwaUpdate.ts`.

### Changed

- **PWA update banner actions:** "Reload" renamed to "Install" (more accurate); a "Later" button added to dismiss the banner without installing — the update remains available via Settings → Help → "Update available — Install now". See `src/components/PwaUpdateBanner.tsx`, `src/layout/Layout.tsx`, `src/App.tsx`.

## [0.5.0] - 2026-06-21

> **Versioning convention from this release:** Vantura follows [Semantic Versioning](https://semver.org).
> `MINOR` bumps for new features; `PATCH` bumps for bug fixes and polish.
> `v1.0.0` marks the stable core milestone: sync → track → analyse → budget, no critical known issues.

### Added

- **Version display:** Current app version shown in Settings → Help and as a stat on the What's new page — always know what's installed without opening DevTools. See `src/pages/Settings.tsx`, `src/pages/Changelog.tsx`.
- **Per-version What's New filtering:** Each milestone is tagged with the version it shipped in. The What's New modal shows only features newer than your last-seen version — a single new feature in the next release shows just that one item. See `src/data/changelog.ts` (`version` field), `src/lib/appVersion.ts` (`versionGt`), `src/components/WhatsNewModal.tsx`.
- **What's New modal:** First-run modal that appears automatically after each app update. Shows the latest release highlights grouped by feature area; a "Full changelog →" link navigates to the full `/changelog` page. Version tracking via `localStorage`; first-ever install silently records the current version so only genuine updates trigger the modal. See `src/components/WhatsNewModal.tsx`, `src/lib/appVersion.ts`, `src/layout/Layout.tsx`.
- **Changelog page** (`/changelog`): In-app release history with month navigation, feature count stats, "What we're exploring next" section, and a colour-coded timeline of milestones. Accessible from Settings → Help → "What's new" and from the What's New modal footer. Also served publicly at `/changelog` without auth. See `src/pages/Changelog.tsx`, `src/data/changelog.ts`.
- **Notifications:** In-app notification inbox (bell icon in navbar) with a slide-out drawer showing up to 30 days of alert history. Nine check types run on every app open: bill reminders, tracker over budget, tracker pace warning, spendable balance low, payday landed, possible payday detected, large transaction, saver goal milestones, and data out of date. Each type has a per-type toggle in Settings → Notifications; master toggle requests browser permission on first enable. Large-transaction threshold is configurable. Unread items show a blue dot and numeric badge; scrolling past an item marks it read (IntersectionObserver). "Clear all" wipes the history. Tracker notifications deep-link directly to the specific tracker report page (`/analytics/trackers/:id`). See `src/lib/notifications.ts`, `src/services/notificationChecks.ts`, `src/stores/notificationStore.ts`, `src/components/NotificationDrawer.tsx`, `src/layout/Navbar.tsx`.
- **Payday source indicator:** A "Linked: [employer name]" chip in Settings → Payday shows which transaction has been selected as the user's salary source. Tapping × removes the link and resets the payday suggestion guard. See `src/pages/Settings.tsx`.
- **Improved payday detection:** Payday landed notification uses two tiers — precise `raw_text` match on the identified salary transaction, falling back to an amount heuristic (≥80% of `pay_amount_cents`). See `src/services/notificationChecks.ts`.
- **Budget Plan:** Group expenses into named buckets at `/analytics/budget`. Each bucket holds upcoming charges and optional hypothetical "what if?" lines. Summary footer shows Income, Committed spend, and Free Spending. Period toggle: weekly / fortnightly / monthly. Tables: `budget_buckets`, `budget_hypotheticals`, `budget_transaction_anchors` (schema v24). See `src/services/budgetBuckets.ts`, `src/pages/analytics/AnalyticsBudgetPlan.tsx`.
- **Biometric unlock:** Touch ID / Face ID via WebAuthn (Settings → Security). Configurable inactivity lock timeout (1–30 minutes, default 3 minutes). See `src/lib/webauthn.ts`, `src/hooks/useInactivityLock.ts`.
- **Pastel accent colour system:** Six pastel swatches — Sky, Mint, Lavender, Peach, Blush, Lemon. See `src/lib/accentPalettes.ts`, `src/stores/accentStore.ts`.
- **Maybuys:** Deliberate-spending wishlist at `/analytics/maybuys`. "Days thinking" timer; mark as Bought or Skipped; History tab. See `src/services/maybuys.ts`, `src/pages/analytics/AnalyticsMaybuys.tsx`.
- **Analytics Savers and Up API alignment:** Collapsible balance/contribution charts, drag-to-reorder, On track / Behind pace status, saver forecasting. See `src/pages/analytics/AnalyticsSavers.tsx`.
- **Profile export/import:** Export settings, trackers, and upcoming charges to a passphrase-encrypted file; import on another device. See `src/services/profileExport.ts`.
- **Analytics section:** `/analytics` with overview and detail pages for Reports, Trackers, and Savers. See `src/pages/analytics/*`.
- **Month at a glance dashboard card:** Current month vs previous month line chart, key metrics, and narrative summary. See `src/components/dashboard/MonthSummarySection.tsx`.

### Removed

- **Analytics Net worth:** Removed net worth hub, page, service, and tables (`net_worth_snapshots`, `net_worth_type_snapshots`, schema migration v14). Legacy URL redirects to `/analytics`.
- **Savers dashboard section:** Moved to Analytics-only at `/analytics/savers`. Tables cleaned up (schema migration v13).
- **Plan and standalone wants/goals:** Removed `/plan` workspace, `goals`/`goal_snapshots` tables (schema migration v12). Legacy URLs redirect to `/analytics`.
- **50/30/20 budget:** Removed the old Analytics budget experience and `budget_3020_config` from profile export.
- **Light theme:** Dark-only UI; theme toggle removed from Settings.
- **Maybuys dashboard card:** Moved to Analytics-only; no longer a reorderable Dashboard section.

### Changed

- **PWA safe area support:** `viewport-fit=cover` + `black-translucent` status bar for iPhone notch / Dynamic Island / home indicator. `100dvh` replaces `100vh` throughout. See `index.html`, `src/index.css`.
- **Lock screen UX:** Single screen — passphrase and fingerprint icon side-by-side; tapping fingerprint fires the prompt immediately. PWA update banner visible on the lock screen. See `src/pages/Unlock.tsx`.
- **Biometric auto-trigger privacy fix:** Auto-trigger waits for genuine user-presence (mousemove, touch, keydown, focus, visibilitychange) before prompting — no longer interrupts the user in another app.
- **Help page redesign:** Structured sub-headings, bullet lists, and Tip callouts; sections for Budget Plan and Savers added.
- **Dashboard layout:** 2-column grid; drag-and-drop section reorder on the Dashboard and in Settings.
- **Dashboard tour:** Steps follow the user's saved section order; all descriptions use HTML formatting.

### Fixed

- **PWA reopen crash on iOS/macOS ("Something went wrong"):** Safari's Back-Forward Cache (bfcache) restored a frozen page with a stale sql.js WASM handle, causing the first SQL call to throw. Fixed with a `pageshow` reload guard (`event.persisted`) and reliable `pagehide` + `visibilitychange` persist handlers — iOS does not fire `beforeunload` on swipe-away. See `src/main.tsx`, `src/db/index.ts`.

### Added

- **What's New modal:** First-run modal that appears automatically after each app update. Shows the latest release highlights grouped by feature area; a “Full changelog →” link navigates to the full `/changelog` page. Version tracking via `localStorage`; first-ever install silently records the current version so only genuine updates trigger the modal. See `src/components/WhatsNewModal.tsx`, `src/lib/appVersion.ts`, `src/layout/Layout.tsx`.
- **Changelog page** (`/changelog`): In-app release history with month navigation, feature count stats, “What we're exploring next” section, and a colour-coded timeline of milestones. Accessible from Settings → Help → “What's new” and from the What's New modal footer. Also served publicly at `/changelog` without auth for unauthenticated visitors. See `src/pages/Changelog.tsx`, `src/data/changelog.ts`.
- **Notifications:** In-app notification inbox (bell icon in navbar) with a slide-out drawer showing up to 30 days of alert history. Nine check types run on every app open: bill reminders, tracker over budget, tracker pace warning, spendable balance low, payday landed, possible payday detected, large transaction, saver goal milestones, and data out of date. Each type has a per-type toggle in Settings → Notifications; master toggle requests browser permission on first enable. Large-transaction threshold is configurable. Unread items show a blue dot and numeric badge; scrolling past an item marks it read (IntersectionObserver). “Clear all” wipes the history. Tracker notifications deep-link directly to the specific tracker report page (`/analytics/trackers/:id`). See `src/lib/notifications.ts`, `src/services/notificationChecks.ts`, `src/stores/notificationStore.ts`, `src/components/NotificationDrawer.tsx`, `src/layout/Navbar.tsx`.
- **Payday source indicator:** A “Linked: [employer name]” chip in Settings → Payday shows which transaction has been selected as the user's salary source. Tapping × removes the link and resets the payday suggestion guard so Vantura can re-suggest a payday source on the next sync. Selected employer name is persisted in `app_settings.payday_description` alongside `payday_raw_text`. See `src/pages/Settings.tsx`.
- **Improved payday detection:** Payday landed notification uses two tiers — precise match on the `raw_text` bank reference of the user's identified salary transaction, falling back to an amount heuristic (≥80% of `pay_amount_cents`) when no source is linked. See `src/services/notificationChecks.ts`.
- **Budget Plan:** Group expenses into named buckets (Subscriptions, Household, Lifestyle, etc.) at `/analytics/budget`. Each bucket holds upcoming charges and optional hypothetical lines (flask icon, removable at any time) for “what if?” scenarios. Summary footer shows Income, Committed spend, and Free Spending. Period toggle: weekly / fortnightly / monthly. Income requires pay amount in Settings → Payday. Tables: `budget_buckets`, `budget_hypotheticals`, `budget_transaction_anchors` (schema v24). See `src/services/budgetBuckets.ts`, `src/pages/analytics/AnalyticsBudgetPlan.tsx`, `src/pages/analytics/AnalyticsBudgetPlanBucket.tsx`.
- **Biometric unlock:** Touch ID / Face ID via WebAuthn (Settings → Security). Enrolled credential ID stored in `app_settings.biometric_credential_id`; the derived key is cached in the browser credential store and recalled on unlock without re-entering the passphrase. Falls back to passphrase if biometrics unavailable or fail. Configurable inactivity lock timeout (1–30 minutes, default 3 minutes) stored in `app_settings.lock_timeout_minutes`. See `src/lib/webauthn.ts`, `src/hooks/useInactivityLock.ts`.
- **Pastel accent colour system:** Six pastel accent swatches — Sky, Mint, Lavender, Peach, Blush, Lemon — replace the previous purple/blue palette. Each swatch applies a coordinated primary, chart, and badge colour. Default accent: Sky. See `src/lib/accentPalettes.ts`, `src/stores/accentStore.ts`.
- **Maybuys:** Deliberate-spending wishlist at `/analytics/maybuys`. Add items you're considering buying (name, price, optional URL and notes); a “days thinking” timer nudges toward an intentional decision. Mark each item as **Bought** or **Skipped** — decided items move to a History tab with a days-held count. Optionally link a Saver account to see how much you've already set aside. See `src/services/maybuys.ts`, `src/pages/analytics/AnalyticsMaybuys.tsx`.
- **Analytics Savers and Up API alignment:** Cursor-paginated `GET /accounts`, synced `ownershipType` and `HOME_LOAN` accounts, `round_up_amount` on transactions (schema v15). Weekly insights **Savers** adds sum of `round_up_amount` for round-up lines. `/analytics/savers` lists saver (and home loan) balances with links to transactions; `/analytics/savers/:id` opens Transactions with saver filters for that account. Transactions page: optional saver-related filter and URL params `saverActivity=1`, `linkedAccountId`. See `src/api/upBank.ts`, `src/services/sync.ts`, `src/services/insights.ts`, `src/services/accounts.ts`, `src/services/transactions.ts`, `src/pages/analytics/AnalyticsSavers.tsx`, `src/App.tsx`.
- **Profile export/import:** Export whitelisted settings, trackers, and upcoming charges to a passphrase-encrypted file (Settings > Data). Import on another device to restore your setup. Never exports transactions, API tokens, or bank data. Uses PBKDF2 + AES-GCM; file format versioned for forward compatibility. See `src/services/profileExport.ts`, `src/pages/Settings.tsx`.
- **Analytics section:** `/analytics` with overview and detail pages for Reports, Trackers, Insights, and Monthly review. Uses existing transaction data to surface longer-term trends across your finances. See `src/App.tsx`, `src/pages/analytics/*`.
- **This month (Month at a glance) dashboard card:** New Dashboard section summarising the current month vs previous month with a line chart, key metrics, and narrative insights, alongside Weekly insights, Trackers, and Upcoming sections. See `src/components/dashboard/MonthSummarySection.tsx`, `src/pages/Dashboard.tsx`, `src/index.css` (dashboard grid).

### Removed

- **Analytics Net worth:** Removed the Net worth hub card, `/analytics/net-worth` page, chart and `netWorth` service, sync-time snapshot recording, demo seed data for net worth tables, and `net_worth_snapshots` / `net_worth_type_snapshots` (schema migration v14). Legacy URL `/analytics/net-worth` redirects to `/analytics`. See `src/App.tsx`, `src/db/schema.ts`, `src/services/sync.ts`, `src/db/seedDemoData.ts`.
- **Savers dashboard section:** Removed the dedicated Savers dashboard section, old Analytics saver *pages* and writable saver goals, `savers` / `saver_balance_snapshots` tables and sync (`schema` migration v13), `saver_chart_colors` from profile export, and the Net worth **Savers only** filter. Up Bank saver accounts remain in `accounts` for transfers. A read-only Savers hub under Analytics was added (see Added above). See `src/db/schema.ts`, `src/services/sync.ts`, `src/App.tsx`.
- **Plan and standalone wants (goals):** Removed the **Plan** workspace (`/plan`), sidebar entry, Dashboard Plan section, Analytics Wants routes and pages, `goals` / `goal_snapshots` tables (schema migration v12), and wants from profile export/import. Legacy URLs (`/plan`, `/analytics/wants`, `/analytics/goals`, etc.) redirect to `/analytics`. See `src/db/schema.ts`, `src/App.tsx`, `src/services/profileExport.ts`.
- **50/30/20 budget:** Removed the Analytics budget experience (overview card, `/analytics/budget` and `/analytics/income` now redirect to `/analytics`), supporting services, the transaction “count as income” control used for that flow, and Future items plus `budget_3020_config` from profile export/import. The `future_items` table and `transaction_user_data.is_income` column remain in the database for existing installs but are unused by the app.
- **Light theme:** Dark-only UI; theme toggle removed from Settings.
- **Maybuys dashboard card:** Moved to Analytics-only at `/analytics/maybuys`; no longer a reorderable Dashboard section.

### Changed

- **PWA safe area support (iPhone / iPad / Mac):** Added `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent` to `index.html` so iOS exposes `env(safe-area-inset-*)` values. Navbar, sidebar brand header, sidebar footer (lock button), auth/lock screen, sticky toolbars, and mobile content area all respect the notch, Dynamic Island, home indicator bar, and rounded screen corners. Switched `100vh` to `100dvh` throughout for correct mobile viewport height. Sidebar z-index raised above the PWA update banner so the lock button is never obscured. See `index.html`, `src/index.css`, `src/layout/Sidebar.tsx`.
- **Lock screen UX — single screen:** The separate biometric mode screen has been removed. The passphrase field and a fingerprint icon button now appear side-by-side on one screen; tapping the fingerprint icon fires the biometric prompt immediately with no intermediate step. The PWA update banner is now visible on the lock screen as well as after sign-in. See `src/pages/Unlock.tsx`, `src/App.tsx`.
- **Biometric auto-trigger privacy fix:** The Touch ID / Face ID auto-trigger no longer fires while the user is in another app. It now waits for a genuine user-presence signal — mouse movement, pointer, touch, keydown, window focus, or visibility change — before prompting. This prevents the system auth dialog interrupting the user mid-task in a different application. See `src/pages/Unlock.tsx`.
- **Help page redesign:** All sections rewritten with structured sub-headings (MDI icons + uppercase labels), bullet lists, and Tip callouts — replacing the previous plain-paragraph layout. Added dedicated sections for Budget Plan and Savers. See `src/pages/Help.tsx`.
- **Tooltip and help copy improvements:** HelpPopovers added to Weekly Insights, Budget Plan, and Savers pages. Existing HelpPopover copy updated on Trackers and Upcoming sections. Available and Spendable card tooltip text made more precise. See `src/components/dashboard/InsightsSection.tsx`, `src/pages/analytics/AnalyticsBudgetPlan.tsx`, `src/pages/analytics/AnalyticsSavers.tsx`.
- **Dashboard tour:** Section steps now follow the user's saved Dashboard section order (previously hardcoded). All 8 tour step descriptions use HTML formatting (`<strong>` key terms, `<br><br>` line breaks) for readability. Month at a glance section added as a tour step. See `src/lib/dashboardTour.ts`, `src/pages/Dashboard.tsx`.
- **Dashboard layout and ordering:** Dashboard sections now use a 2-column grid with cards that grow to fit content. Sections can be reordered via drag-and-drop on the Dashboard or from Settings (Dashboard sections). See `src/pages/Dashboard.tsx`, `src/lib/dashboardSections.ts`, `src/index.css` (dashboard grid).

## [0.0.2] - 2025-03-03

### Added

- **Mobile / portrait layout (≤768px):** Optimised for vertical/portrait screens. Sidebar becomes an overlay drawer (hamburger in navbar opens it); content is full width with vertical scroll only. Weekly Insights and Savers charts use vertical bar charts on narrow viewports. Transactions page: vertical card list and filters in a drawer (Filters button). Upcoming section: vertical cards on mobile. See `src/lib/constants.ts` (MOBILE_BREAKPOINT_PX), `src/hooks/useMediaQuery.ts`, `src/layout/Layout.tsx`, `src/pages/Transactions.tsx`, `src/components/dashboard/InsightsSection.tsx`, `src/components/dashboard/SaversSection.tsx`, `src/components/dashboard/UpcomingSection.tsx`.
- **Quality gates:** `typecheck`, `format:check`, and `validate` scripts; CI runs format-check, lint, typecheck, tests, and `npm audit --audit-level=critical` before build.
- **Tests:** Vitest for `lib/crypto`, `lib/format`, `lib/payday`, `lib/chartColors`, `lib/chartLabelSpace`, `components/charts/chartData`, and `services/balance`.
- **Pre-commit:** Husky + lint-staged to run Prettier and ESLint on staged `src/**/*.{ts,tsx,css}`.
- **SECURITY.md:** Data handling and vulnerability reporting.
- **CHANGELOG.md:** Keep a Changelog format; README links to it and documents updating Unreleased when adding features.
- **Help:** User guide at `/help` (What is Vantura, getting started, Spendable, Trackers, Savers, Upcoming, security). Help popover/link from onboarding and Settings.
- **Dashboard tour:** First-time product tour (driver.js) over balance cards, Savers, Trackers, Weekly insights, Upcoming, sidebar, Lock. Can be run again from Settings ("Show dashboard tour again").
- **Trackers period navigation (icons + tooltips):** Previous/Next use chevron icons with tooltips ("Previous period", "Next period") at all viewport widths; removes the previous 900px text/icon label swap. See `src/components/dashboard/TrackersSection.tsx`. Aligns with `docs/trackers-icons-tooltips-recommendation.md`.
- **Chart axis labels (D3 bar charts):** D3-based bar chart components for Weekly Insights and Savers with estimated axis label space for a compact left axis on desktop and readable labels on mobile (`src/components/charts/InsightsBarChart.tsx`, `src/components/charts/SaversBarChart.tsx`, `src/lib/chartLabelSpace.ts`).
- **Trackers badge color (schema v2):** Optional `badge_color` per tracker; migration in `src/db/schema.ts` adds the column for existing DBs. Trackers UI and `src/services/trackers.ts` read/write it; TrackersSection shows a coloured badge when set.
- **Weekly Insights category colours (global persistence):** Category bar colours chosen in the Weekly Insights chart now apply to that category in all weeks (past, current, and future). Modal helper text and toast ("Colour updated for all weeks.") clarify the behaviour. Uncategorised transactions use a stable colour key for consistency. Savers Edit goals modal: helper text "This bar colour applies to this saver." See `src/lib/chartColors.ts`, `src/components/dashboard/InsightsSection.tsx`, `src/components/dashboard/SaversSection.tsx`.

### Changed

- **Sync state:** Centralised sync state in `syncStore` (`lastSyncCompletedAt`, syncing flag) used by Navbar, Dashboard, Settings, and Transactions for consistent "last synced" and sync-in-progress behaviour.
- **UI / styling:** Theme and accent colour options (Settings); layout/styling refinements (e.g. index.css, BalanceCard, StatCard, dashboard sections, Navbar, Sidebar).
- **Trackers:** Removed `TRACKER_COMPACT_NAV_*` constants from `src/lib/constants.ts`; period nav is now icon + tooltip at all widths.

## [0.0.1] - 2025-02-23

### Added

- **Onboarding & Sync (Phase 2):** 6-step onboarding wizard (welcome, passphrase creation, API token validation and encryption, payday schedule, initial sync, completion). API token encrypted with passphrase-derived key (PBKDF2 100k, AES-GCM 256-bit). Unlock screen on each app open. Incremental sync from navbar with Up Bank API (cursor pagination, rate limiting).
- **Core features (Phase 3):** Dashboard with 3-column layout (Savers, Weekly insights, Trackers; Upcoming below). Balance card (Available, Spendable with prorated reserved amount). Trackers (name, budget, reset frequency, multi-category). Savers (balance vs goal, target date, monthly transfer). Weekly insights (Money In/Out, saver changes, category breakdown). Upcoming charges (manual entry, frequency, Include in Spendable).
- **Transactions & filtering (Phase 4):** Full transaction list at `/transactions` with date/category/amount/search filters, sort (date/amount/merchant), date grouping. Round-ups linked to parent when `round_up_parent_id` set.
- **Polish (Phase 5):** Responsive layout (13"-27"), error boundary and DB/persist error handling, loading states, paginated transactions (50 per page), PWA (service worker, manifest, installable).
- **Deployment (Phase 6):** Production build with GitHub Pages base path; GitHub Actions deploy on push to `main`; SPA routing via `404.html`.
- **Settings (Phase 7):** Re-sync, Clear all data (confirmation modal, delete DB, reload to Onboarding).

[Unreleased]: https://github.com/ostafford/Vantura_v3/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/ostafford/Vantura_v3/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/ostafford/Vantura_v3/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/ostafford/Vantura_v3/compare/v0.0.2...v0.5.0
[0.0.2]: https://github.com/ostafford/Vantura_v3/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/ostafford/Vantura_v3/releases/tag/v0.0.1
