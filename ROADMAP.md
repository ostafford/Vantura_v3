# Vantura — Roadmap

A timeline of everything built, when it shipped, and what's under consideration next.

---

## Shipped

### Foundation — February 2026

The initial build established the full technical foundation: local-first storage, encryption, Up Bank sync, and the core dashboard.

| Date | Feature |
|------|---------|
| Feb 11 | Initial commit — project scaffolded (React, TypeScript, Vite, sql.js, IndexedDB) |
| Feb 16 | **Onboarding wizard** — 6-step flow: welcome, passphrase creation, API token (validated + encrypted), payday schedule, initial sync with progress bar, completion |
| Feb 16 | **Encryption & unlock** — API token encrypted with passphrase-derived key (PBKDF2 100k iterations, AES-GCM 256-bit); passphrase never stored; unlock screen on every app open |
| Feb 16 | **Up Bank sync** — Initial and incremental sync; cursor-based pagination; rate limiting |
| Feb 16 | **Dashboard** — Balance cards (Available, Spendable), Weekly insights, Trackers, Upcoming charges, Savers |
| Feb 16 | **Spendable balance** — Available minus prorated upcoming charges due before next payday |
| Feb 16 | **Trackers** — Budget categories with weekly / fortnightly / monthly / payday reset cycles; progress bar and days-to-reset |
| Feb 16 | **Weekly insights** — Money in, money out, saver movement, category breakdown |
| Feb 16 | **Upcoming charges** — Manual entry with frequency, due date, and Include in Spendable toggle |
| Feb 16 | **Transactions** — Full history with date/category/amount/search filters, sort, date grouping, round-up linking |
| Feb 16 | **Settings** — Re-sync, theme toggle, Update API token, Clear all data |
| Feb 16 | **GitHub Pages deployment** — GitHub Actions CI/CD; SPA routing via `404.html` |

---

### Polish & Tooling — February 2026

| Date | Feature |
|------|---------|
| Feb 17 | Weekly insights formula refinements — UTC date fix, payday alignment |
| Feb 18 | Re-sync improvements and transaction list UI |
| Feb 20 | Payday settings update and UI refinements |
| Feb 23 | **Help page** — User guide at `/help` with sections for all core features |
| Feb 23 | **Quality gates** — `typecheck`, `format:check`, `validate` scripts; CI runs checks before build |
| Feb 25 | **Demo mode** — "Try with sample data" on onboarding; DEMO badge in navbar and sidebar; no Up Bank token required |
| Feb 25 | **Tracker period navigation** — Previous/Next chevron icons with tooltips at all viewport widths |
| Feb 25 | **Tracker badge colours** — Optional colour per tracker (schema migration) |
| Feb 25 | **Mobile / portrait layout** — Sidebar becomes overlay drawer below 768px; vertical bar charts; card-based lists on mobile |
| Feb 27 | **D3 bar charts** — Weekly insights and Savers charts rebuilt with D3.js; estimated axis label space for compact left axis |
| Feb 27 | **Weekly insights category colours** — Click a category bar to set a persistent colour; applies across all weeks |

---

### Analytics & Navigation — March–April 2026

| Date | Feature |
|------|---------|
| Mar 17 | **Month at a glance** — Line chart (current vs. previous month), key metrics, narrative summary; drag-and-drop section reorder |
| Mar 18 | Responsive design fixes |
| Mar 21 | Settings and user guide UI overhaul |
| Mar 24 | Need vs Want feature (Beta v1) — experimental deliberate-spending tracker |
| Mar 25 | Dashboard card UI refinements |
| Apr 1  | Need vs Want removed; card UI updated |
| Apr 3  | 50/30/20 budget feature removed; Plan/Goals workspace removed; legacy URLs redirected |
| Apr 5  | **Year at a glance** — Full-year spending summary added to Analytics |
| Apr 5  | Breadcrumb navigation; loading screen removed |

---

### Maybuys — April 2026

| Date | Feature |
|------|---------|
| Apr 28 | **Maybuys wishlist** — Add items you're considering buying (name, price, optional URL and notes); "days thinking" timer; mark as Bought or Skipped; History tab with days-held count; optional Saver link; reorderable Dashboard card showing up to 3 pending items |

---

### Dashboard & Tracker Refinements — April–May 2026

| Date | Feature |
|------|---------|
| Apr 29 | Transaction modal improvements |
| Apr 30 | Dashboard section UI updates; Settings transaction option removed |
| May 2  | Tracker UI update — grouping, layout refinements |
| May 2  | Dashboard 2-column grid layout |
| May 5  | Upcoming charges UI update |
| May 6–7 | Spendable calculation refinements — proration accuracy improvements |

---

### Analytics Overhaul — May–June 2026

| Date | Feature |
|------|---------|
| May 9–10 | Analytics pages UI refresh — overview, tracker detail, reports |
| Jun 5–6 | **Savers overhaul** — Collapsible balance and contribution charts; saver card redesign; drag-to-reorder; On track / Behind pace status based on contribution rate; monthly history |
| Jun 6  | Savers round-up display fix; saver goals on sync; delta formatting |
| Jun 6  | KPI tooltips on Savers analytics tiles |
| Jun 6  | Maybuys removed from Dashboard (moved to Analytics-only) |
| Jun 7  | **Reports UI rebuild** — Category breakdown, date filters, improved chart layout |
| Jun 7  | Saver card forecast and tooltip added |
| Jun 8  | Tracker UI final — progress bar styling, layout polish |
| Jun 10 | Analytics inner pages UI update |
| Jun 11 | Demo data updated — PAYDAY tracker, tags, saver goals, badge colours |

---

### Budget Plan — June 2026

| Date | Feature |
|------|---------|
| Jun 13 | **Budget Plan** (`/analytics/budget`) — Named expense buckets (e.g. Subscriptions, Household, Lifestyle); assign upcoming charges to buckets; hypothetical "what if?" lines (flask icon); period toggle (weekly / fortnightly / monthly); summary footer showing Income, Committed spend, and Free Spending; Income figure sourced from pay amount in Settings |
| Jun 14 | Budget Plan breadcrumb and bucket detail page navigation |
| Jun 16 | Budget Plan UI refinements; modal UI improvements |

---

### Security, Theming & UX — June 2026

| Date | Feature |
|------|---------|
| Jun 13 | **Pastel accent colour system** — Six pastel swatches (Sky, Mint, Lavender, Peach, Blush, Lemon) replace previous purple palette; dark text on pastel surfaces; default: Sky |
| Jun 13 | Light theme removed; dark-only UI |
| Jun 16 | **Biometric unlock** — Touch ID / Face ID via WebAuthn (Settings → Security); credential ID stored locally; derived key cached in browser credential store; falls back to passphrase |
| Jun 16 | **Configurable inactivity lock** — Auto-lock after 1–30 minutes of inactivity (default 3); configurable in Settings → Security |
| Jun 18 | Biometric UX improvements — enrolment flow, error states, fallback behaviour |
| Jun 18 | iOS Safari auto-zoom fix — input `font-size` set to 16px to prevent zoom on focus |

---

### Brand Identity & Onboarding Polish — June 2026

| Date | Feature |
|------|---------|
| Jun 18 | **Vantura cipher monogram logo** — Designed from scratch: N + P paths that simultaneously read as V, A, N, T, U, R, A; white-to-accent gradient driven by user's accent colour selection; three variants (icon, wordmark, text); implemented in sidebar, navbar, onboarding, public changelog shell, and favicon |
| Jun 18 | **Onboarding page redesign** — Progress bar replaced with animated step dots at the bottom; "Setup" title removed; brand mark circle (dark background, no border); deeper input and button shadows for dark theme clarity |
| Jun 18 | **Sticky page headers** — What's new, User Guide, and Settings pages now have sticky headers matching the Analytics pattern; solid border replaced with soft shadow across all sticky toolbars |
| Jun 18 | **Bug fix: public changelog shell** — Fixed race condition where authenticated users reloading on `/changelog` were shown the public shell instead of the unlock screen |
| Jun 18 | **PWA manifest corrected** — Icon updated from Vite default to Vantura logo; `theme_color` and `background_color` set to dark theme (`#1a142d`); apple-touch-icon added to `index.html` |
| Jun 18 | **Repo hygiene** — Stale planning doc removed; `public/vite.svg` deleted; Husky pre-commit updated to v9 format |

---

### PWA & Lock Screen Polish — June 2026

| Date | Feature |
|------|---------|
| Jun 20 | **PWA safe area support** — `viewport-fit=cover` + `black-translucent` status bar style; navbar, sidebar, auth screen, and content areas respect `env(safe-area-inset-*)` for iPhone notch / Dynamic Island / home indicator / rounded corners; `100dvh` replaces `100vh` for correct mobile viewport; sidebar z-index raised above update banner |
| Jun 20 | **Lock screen UX** — Removed intermediate biometric mode screen; passphrase and fingerprint icon button now side-by-side on a single screen; tapping the fingerprint icon fires the prompt immediately; PWA update banner now visible on the lock screen |
| Jun 20 | **Biometric privacy fix** — Auto-trigger deferred until user is actively in the app (presence events: mousemove, touch, keydown, window focus, visibilitychange); Touch ID / Face ID prompt no longer appears while user is in another application |
| Jun 21 | **Bug fix: PWA reopen crash on iOS/macOS** — Safari's Back-Forward Cache (bfcache) restores a frozen page on app reopen, leaving the sql.js WASM handle stale and causing "Something went wrong". Fixed with a `pageshow` reload guard (`event.persisted`) and reliable `pagehide` + `visibilitychange` persist handlers (iOS does not fire `beforeunload` on swipe-away). See `src/main.tsx`, `src/db/index.ts` |

---

### Notifications & Payday Intelligence — June 2026

| Date | Feature |
|------|---------|
| Jun 20 | **Notification system** — Bell icon in navbar with numeric unread badge; slide-out drawer (desktop) / bottom sheet (mobile) showing 30-day notification history; 9 check types run on app open: bill reminders, tracker over budget, tracker pace warning, spendable balance low, payday landed, possible payday detected, large transaction (user opt-in), saver goal milestones, and data out of date (user opt-in); per-type toggles in Settings → Notifications; IntersectionObserver marks items read on scroll; "Clear all" clears history; each type uses a guard key to avoid re-firing within the same day or budget period |
| Jun 20 | **Payday source linking** — User can search for and select their salary transaction in Settings → Payday; Vantura saves the bank's `raw_text` reference for precise payday detection; a "Linked: [employer name]" chip shows the current source with a × to remove it; "Possible payday detected" notification suggests recurring large credits as a pay source when none is configured |
| Jun 21 | **Tracker notification deep-links** — Tracker over budget and tracker pace notifications now navigate directly to the specific tracker report page (`/analytics/trackers/:id`) instead of the overview; schema v29 migration cleans up generic-path rows from prior sessions |

---

### What's New & Changelog — June 2026

| Date | Feature |
|------|---------|
| Jun 21 | **What's New modal** — Appears automatically on first launch after a version bump; shows the latest release highlights grouped by feature area; dismissing marks the version seen; "Full changelog →" navigates to the full history page. Version tracked in `localStorage` (`vantura_last_seen_version`); first-ever install silently records the version so only genuine updates show the modal. See `src/components/WhatsNewModal.tsx`, `src/lib/appVersion.ts` |
| Jun 21 | **Changelog page** (`/changelog`) — In-app release history with month navigation, feature-count stats, "What we're exploring next" section, and a colour-coded timeline of milestones; accessible from Settings → Help and the What's New modal footer; also served publicly without auth. See `src/pages/Changelog.tsx`, `src/data/changelog.ts` |

---

### Documentation & UX Polish — June 2026

| Date | Feature |
|------|---------|
| Jun 18 | **Help page redesign** — All sections rewritten with structured sub-headings, bullet lists, and Tip callouts; added Budget Plan and Savers sections |
| Jun 18 | **Tooltip improvements** — HelpPopovers added to Weekly Insights, Budget Plan, and Savers pages; Trackers and Upcoming copy updated; balance card tooltips made more precise |
| Jun 18 | **Dashboard tour overhaul** — Section steps now follow the user's saved section order; all 8 steps use HTML formatting (bold key terms, line breaks); Month at a glance added as a tour step |
| Jun 18 | Internal documentation audit — README, CHANGELOG, SECURITY, Arch_Docs updated to reflect current state |

---

## Under Consideration

Features that have been discussed or noted as potential future additions. Nothing here is committed.

- **Profile export v2** — Include Budget Plan buckets in the exported profile file
- **Recurring transaction detection** — Auto-suggest upcoming charges based on transaction history patterns
- **Multi-currency display** — Show foreign transaction amounts alongside AUD equivalents
- **Tags / custom labels** — User-defined transaction tags for finer categorisation beyond Up Bank's category tree
- **Saver round-up tracking** — Dedicated view for Loose Change saver accumulation over time
- **Android / desktop PWA biometric** — Biometric support on Android (currently optimised for iOS/macOS WebAuthn)
- **Logo gradient on favicon** — Static `logo-icon.svg` uses neutral silver gradient; future work to generate per-accent favicons or use a Canvas-based approach

---

*For version-by-version change details, see [CHANGELOG.md](CHANGELOG.md). For security policy, see [SECURITY.md](SECURITY.md).*
