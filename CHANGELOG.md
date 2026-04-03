# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Profile export/import:** Export whitelisted settings, trackers, and upcoming charges to a passphrase-encrypted file (Settings > Data). Import on another device to restore your setup. Never exports transactions, API tokens, or bank data. Uses PBKDF2 + AES-GCM; file format versioned for forward compatibility. See `src/services/profileExport.ts`, `src/pages/Settings.tsx`.
- **Analytics section:** `/analytics` with overview and detail pages for Reports, Trackers, Insights, and Monthly review. Uses existing transaction data to surface longer-term trends across your finances. See `src/App.tsx`, `src/pages/analytics/*`.
- **This month (Month at a glance) dashboard card:** New Dashboard section summarising the current month vs previous month with a line chart, key metrics, and narrative insights, alongside Weekly insights, Trackers, and Upcoming sections. See `src/components/dashboard/MonthSummarySection.tsx`, `src/pages/Dashboard.tsx`, `src/index.css` (dashboard grid).

### Removed

- **Analytics Net worth:** Removed the Net worth hub card, `/analytics/net-worth` page, chart and `netWorth` service, sync-time snapshot recording, demo seed data for net worth tables, and `net_worth_snapshots` / `net_worth_type_snapshots` (schema migration v14). Legacy URL `/analytics/net-worth` redirects to `/analytics`. See `src/App.tsx`, `src/db/schema.ts`, `src/services/sync.ts`, `src/db/seedDemoData.ts`.
- **Savers feature:** Removed the dedicated Savers dashboard section, Analytics saver routes and pages, `savers` / `saver_balance_snapshots` tables and sync (`schema` migration v13), `saver_chart_colors` from profile export, and the Net worth **Savers only** filter. Legacy URLs `/analytics/savers` and `/analytics/savers/:id` redirect to `/analytics`. Up Bank saver accounts remain in `accounts` for transfers; Weekly insights **Saver changes** is unchanged. See `src/db/schema.ts`, `src/services/sync.ts`, `src/App.tsx`.
- **Plan and standalone wants (goals):** Removed the **Plan** workspace (`/plan`), sidebar entry, Dashboard Plan section, Analytics Wants routes and pages, `goals` / `goal_snapshots` tables (schema migration v12), and wants from profile export/import. Legacy URLs (`/plan`, `/analytics/wants`, `/analytics/goals`, etc.) redirect to `/analytics`. See `src/db/schema.ts`, `src/App.tsx`, `src/services/profileExport.ts`.
- **50/30/20 budget:** Removed the Analytics budget experience (overview card, `/analytics/budget` and `/analytics/income` now redirect to `/analytics`), supporting services, the transaction “count as income” control used for that flow, and Future items plus `budget_3020_config` from profile export/import. The `future_items` table and `transaction_user_data.is_income` column remain in the database for existing installs but are unused by the app.

### Changed

- **Documentation:** README and SECURITY profile export descriptions aligned with `src/services/profileExport.ts` (settings whitelist, trackers, upcoming charges only).
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

[Unreleased]: https://github.com/ostafford/Vantura_v3/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/ostafford/Vantura_v3/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/ostafford/Vantura_v3/releases/tag/v0.0.1
