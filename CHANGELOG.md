# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Profile export/import:** Export settings, trackers, and upcoming charges to a passphrase-encrypted file (Settings > Data). Import on another device to restore your setup. Never exports transactions, API tokens, or bank data. Uses PBKDF2 + AES-GCM; file format versioned for forward compatibility. See `src/services/profileExport.ts`, `src/pages/Settings.tsx`.

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

[Unreleased]: https://github.com/ostafford/Vanture_v3/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/ostafford/Vanture_v3/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/ostafford/Vanture_v3/releases/tag/v0.0.1
