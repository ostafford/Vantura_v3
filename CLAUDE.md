# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vantura is a **local-first** personal finance app for Up Bank customers. All data lives in the browser (SQLite via sql.js, persisted to IndexedDB) — nothing is sent to a server. There is no backend; sync means "call the Up Bank REST API directly from the browser and write results into the local DB."

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
- `src/db/schema.ts` — schema is defined as raw DDL strings plus a linear, sequential migration ladder (`runMigrations`, gated by `if (version < N)` blocks incrementing `schema_version` in `app_settings`). Current version is in `SCHEMA_VERSION` at the top of the file — bump it and add a new `if (version < N)` block for any schema change; never edit a past migration block. Check `Reference_Docs/03_Database_Schema.md` before adding tables/columns and update it alongside the migration — it drifts easily, so treat `schema.ts` as ground truth if the two disagree.
- All DB access goes through `src/services/*.ts` (one file per domain: `trackers.ts`, `sync.ts`, `accounts.ts`, `budgetBuckets.ts`, etc.) using raw SQL via `db.prepare()`/`db.run()`. There is no ORM.

### Sync: Up Bank API → local DB

- `src/api/upBank.ts` wraps the Up Bank REST API (Personal Access Token, ~60 req/min rate limit).
- `src/services/sync.ts` orchestrates fetch-and-upsert of accounts/transactions/categories/tags, and drives payday/tracker recalculation. It is called on every app boot (`App.tsx`) via `advanceNextPaydayIfNeeded()` then `recalculateTrackers()`, and again on manual/periodic sync. Check `Reference_Docs/06_Sync_Strategy.md` before touching pagination, rate limiting, or the initial-vs-incremental sync split.

### Payday-centric domain model

A recurring theme across the codebase: budgets, trackers, and the "Spendable" balance are all anchored to the user's **payday cycle**, not the calendar month. `src/lib/payday.ts` defines the payday frequency/day encoding (including special codes 100–105 for "last weekday/Mon–Fri of the month"), and `advanceNextPaydayIfNeeded()` in `sync.ts` rolls `next_payday` forward whenever it's in the past. Trackers can reset weekly/fortnightly/monthly/`PAYDAY`; when touching tracker reset logic, budget periods, or the Spendable calculation, check `src/lib/payday.ts` and `Reference_Docs/05_Calculation_logic.md` first — this logic has had several date-edge-case bugs historically (unpadded dates, month-rollover, relative payday rules).

### State management: vanilla zustand stores, not React context

Stores in `src/stores/*.ts` use `zustand/vanilla`'s `createStore`, consumed in components via `useStore(store, selector)` (from `zustand`, not `zustand/react`'s `create`). This lets non-React code (services, `App.tsx` boot sequence) read/write store state directly via `store.getState()` without a Provider. Follow this pattern for new global state rather than introducing React Context or `create()`.

### Security model

API token and any secrets are encrypted client-side (`src/lib/crypto.ts`: PBKDF2-SHA256 → AES-GCM 256-bit) using a key derived from the user's passphrase; the passphrase itself is never persisted. Biometric unlock (`src/lib/webauthn.ts`, `src/lib/biometricSession.ts`) is an optional convenience layer on top of the passphrase, not a replacement. See `SECURITY.md` and `Reference_Docs/08_Security.md` for the full model before touching auth/encryption code.

### Routing & app shell

`src/appRouter.tsx` defines routes; `src/App.tsx` gates rendering on three sequential states — DB boot (`initDb`) → onboarding complete? → session unlocked? — before mounting `RouterProvider`. `/changelog` is a special case reachable without auth for non-onboarded users.

### Path alias

`@/*` maps to `src/*` (configured in `tsconfig.json` and mirrored in Vite/Vitest). Use it instead of relative `../../` imports.

## Documentation map

- `Reference_Docs/` — deep technical reference, not in the public repo (gitignored; see `.gitignore`). Check the relevant doc before making non-trivial changes in that area, and update it if the change affects the documented design — but the code is ground truth if the two disagree, since these drift:
  - `01_Overview.md` — problem statement and feature summary
  - `03_Database_Schema.md` — full table DDL and `app_settings` key reference (mirrors `src/db/schema.ts`)
  - `04_Core_Features.md` — per-feature behavior spec (dashboard, trackers, savers, budget plan, etc.)
  - `05_Calculation_logic.md` — Spendable balance, reserved amount, payday math
  - `06_Sync_Strategy.md` — initial vs. incremental sync, Up Bank API shapes, rate limiting
  - `07_UI_UX_Design.md` — theme tokens, accent palette, chart color system
  - `08_Security.md` — encryption/auth threat model
- `ROADMAP.md` — feature timeline and what's under consideration.
- `CHANGELOG.md` — version history (also surfaced in-app at `/changelog`).
- `SECURITY.md` — data handling and vulnerability reporting.
