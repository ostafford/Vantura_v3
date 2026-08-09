# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vantura is a **local-first** personal finance app for Up Bank customers. All data lives in the browser (SQLite via sql.js, persisted to IndexedDB) — nothing is sent to a server. There is no backend; sync means "call the Up Bank REST API directly from the browser and write results into the local DB."

## Product philosophy

Vantura's product vision, target users, and non-negotiable design principles live in `docs/PRODUCT.md` — read it before making product/UX judgment calls, not just architectural ones. In short: Spendable is a safety-net "source of truth" value, and the Up Bank API is ground truth beneath it.

## Engineering standards & working agreement

- **Accuracy bar: 99%+, applied equally across the entire codebase.** No tiered rigor — a UI bug and a Spendable miscalculation are held to the same standard. If a feature can't be built to this bar with strict, well-defined conditions, pause it rather than ship a partial/best-effort version.
- **No assumptions.** Every calculation and conditional must be based on an explicitly-defined rule. If the correct behavior for a case isn't known, don't guess — ask, or make the feature decline to run for that case rather than produce an unverified answer.
- **Docs are collaborative, not autonomous.** Never edit any `*.md` file (this file, `docs/*`, `Reference_Docs/*`, README, ROADMAP, CHANGELOG, SECURITY) without first proposing the change and getting explicit confirmation. When the correct content isn't derivable from code — product intent, calculation edge cases, UX judgment — ask for it in your own words rather than inferring it. `CONTEXT.md` files specifically need an actual discussion, not just a draft to rubber-stamp — see the docs-collaboration memory.

## Commands

```bash
npm run dev              # start dev server (Vite)
npm run build             # tsc -b && vite build
npm run validate           # format:check + lint + typecheck — run before considering work done
npm run test               # vitest run (unit tests, node environment)
npm run test:watch          # vitest watch mode
npm run test:coverage        # vitest with v8 coverage
npm run test:e2e            # playwright (chromium)
npx vitest run path/to/file.test.ts        # single test file
npx vitest run -t "test name substring"     # single test by name
```

CI (`.github/workflows/deploy.yml`) runs format-check, lint, typecheck, unit tests, e2e tests, and `npm audit` on every push. Cloudflare Pages auto-deploys `main` on push — no manual deploy step. `npm run validate` mirrors the fast part of CI locally.

Pre-commit hook (`husky` + `lint-staged`) auto-formats/lints staged `.ts`/`.tsx`/`.css` files.

## Architecture

### Data layer: sql.js + IndexedDB, no server

- `src/db/index.ts` — owns the single in-memory sql.js `Database` instance. On boot, `initDb()` loads the serialized DB from IndexedDB (or creates a fresh one), then every write schedules a **debounced (400ms) export-and-persist** back to IndexedDB. Flushes are also forced on `beforeunload`, `pagehide` (needed for iOS/macOS PWA, which doesn't reliably fire `beforeunload`), and tab backgrounding. Because persistence is async and debounced, don't assume a write is durable until the flush has happened — the multiple flush triggers exist specifically to cover PWA lifecycle edge cases.
- `src/db/schema.ts` — schema is defined as raw DDL strings plus a linear, sequential migration ladder (`runMigrations`, gated by `if (version < N)` blocks incrementing `schema_version` in `app_settings`). Current version is in `SCHEMA_VERSION` at the top of the file — bump it and add a new `if (version < N)` block for any schema change; never edit a past migration block. Check `docs/DATABASE.md` before adding tables/columns and update it alongside the migration — it drifts easily, so treat `schema.ts` as ground truth if the two disagree.
- All DB access goes through `src/services/*.ts` (one file per domain: `trackers.ts`, `sync.ts`, `accounts.ts`, `budgetBuckets.ts`, etc.) using raw SQL via `db.prepare()`/`db.run()`. There is no ORM.

### Sync: Up Bank API → local DB

- `src/api/upBank.ts` wraps the Up Bank REST API (Personal Access Token, ~60 req/min rate limit).
- `src/services/sync.ts` orchestrates fetch-and-upsert of accounts/transactions/categories/tags, and drives payday/tracker recalculation. It is called on every app boot (`App.tsx`) via `advanceNextPaydayIfNeeded()` then `recalculateTrackers()`, and again on manual/periodic sync. Check `docs/features/sync/` before touching pagination, rate limiting, or the initial-vs-incremental sync split.

### Payday-centric domain model

A recurring theme across the codebase: budgets, trackers, and the "Spendable" balance are all anchored to the user's **payday cycle**, not the calendar month. `src/lib/payday.ts` defines the payday frequency/day encoding (including special codes 100–105 for "last weekday/Mon–Fri of the month"), and `advanceNextPaydayIfNeeded()` in `sync.ts` rolls `next_payday` forward whenever it's in the past. Trackers can reset weekly/fortnightly/monthly/`PAYDAY`; when touching tracker reset logic, budget periods, or the Spendable calculation, check `src/lib/payday.ts` and `docs/features/payday-spendable/` and `docs/features/trackers/` first — this logic has had several date-edge-case bugs historically (unpadded dates, month-rollover, relative payday rules).

### State management: vanilla zustand stores, not React context

Stores in `src/stores/*.ts` use `zustand/vanilla`'s `createStore`, consumed in components via `useStore(store, selector)` (from `zustand`, not `zustand/react`'s `create`). This lets non-React code (services, `App.tsx` boot sequence) read/write store state directly via `store.getState()` without a Provider. Follow this pattern for new global state rather than introducing React Context or `create()`.

### Security model

API token and any secrets are encrypted client-side (`src/lib/crypto.ts`: PBKDF2-SHA256 → AES-GCM 256-bit) using a key derived from the user's passphrase; the passphrase itself is never persisted. Biometric unlock (`src/lib/webauthn.ts`, `src/lib/biometricSession.ts`) is an optional convenience layer on top of the passphrase, not a replacement. See `SECURITY.md` and `docs/features/security-auth/` for the full model before touching auth/encryption code.

### Routing & app shell

`src/appRouter.tsx` defines routes; `src/App.tsx` gates rendering on three sequential states — DB boot (`initDb`) → onboarding complete? → session unlocked? — before mounting `RouterProvider`. `/changelog` is a special case reachable without auth for non-onboarded users.

### Path alias

`@/*` maps to `src/*` (configured in `tsconfig.json` and mirrored in Vite/Vitest). Use it instead of relative `../../` imports.

## Documentation map

Vantura's deep technical reference lives in `docs/` (gitignored, not in the public repo) — one folder per feature under `docs/features/`, plus `docs/DATABASE.md` for the schema and `docs/PRODUCT.md` for product vision/design principles. This replaces the old flat `Reference_Docs/` structure (still on disk during migration — see note below).

**Navigation convention:** landing in a feature folder for context? Read that folder's `CLAUDE.md` first — it's a short router that points to `OVERVIEW.md` (how the feature works, always present), `CONTEXT.md` (why it's built this way, if that folder has one), and `SKILL.md` (a pointer to a real skill in `.claude/skills/`, if one exists for that feature).

Feature folders: `dashboard/`, `settings/`, `payday-spendable/`, `trackers/`, `budget-plan/`, `upcoming-charges/`, `savers/`, `net-worth/`, `weekly-insights/`, `month-at-a-glance/`, `reports/`, `sync/`, `transactions/`, `profile-data/`, `notifications/`, `security-auth/`, `appearance-theme/`.

**Mid-migration note:** as of 2026-08-09, every folder above has only a `CLAUDE.md` stub — `OVERVIEW.md`/`CONTEXT.md` content is being migrated from `Reference_Docs/*.md` one feature at a time. Until a folder's `OVERVIEW.md` exists, fall back to the relevant `Reference_Docs/*.md` file for that topic (schema → `03_Database_Schema.md`, behavior → `04_Core_Features.md`, calculation → `05_Calculation_logic.md`, sync → `06_Sync_Strategy.md`, theme → `07_UI_UX_Design.md`, security → `08_Security.md`). Remove this note once migration is complete and `Reference_Docs/` is retired.

Root-level docs (public, in git):
- `ROADMAP.md` — feature timeline and what's under consideration.
- `CHANGELOG.md` — version history (also surfaced in-app at `/changelog`).
- `SECURITY.md` — data handling and vulnerability reporting.
