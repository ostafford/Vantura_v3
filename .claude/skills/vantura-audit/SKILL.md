---
name: vantura-audit
description: Codifies Vantura's repeated feature/codebase accuracy audit — the workflow used for the Dashboard, Tracker, Analytics, Payday, and full-codebase audits. Use when Okky asks to audit a feature, verify 99%+ accuracy/correctness, or check something for bugs across the codebase.
---

# Vantura accuracy audit

This project holds a flat 99%+ accuracy bar across the whole codebase (see `CLAUDE.md`) — a UI bug gets the same rigor as a Spendable miscalculation. This skill is the repeatable procedure for verifying that bar on a feature or on the whole app, distilled from prior audit sessions (Dashboard, Tracker, Analytics, Payday, full-codebase — see memory for details).

## 1. Scope the audit

Ask (or infer from the request) whether this is a **single feature** (e.g. "audit trackers") or a **whole-codebase pass**. Don't assume whole-codebase for a feature request or vice versa.

## 2. Ground yourself in the spec before reading code

Read the relevant `Reference_Docs/*` file(s) first — they're the intended behavior, not the code. Map features to docs:

- Payday/tracker resets/Spendable/reserved amount → `05_Calculation_logic.md`, `src/lib/payday.ts`
- Schema/columns/`app_settings` keys → `03_Database_Schema.md`, `src/db/schema.ts`
- Per-feature UI behavior → `04_Core_Features.md`
- Sync/pagination/rate limiting → `06_Sync_Strategy.md`, `src/services/sync.ts`
- Theme/colors/charts → `07_UI_UX_Design.md`
- Auth/encryption → `08_Security.md`, `src/lib/crypto.ts`, `src/lib/webauthn.ts`

**If code and doc disagree, code is ground truth** (per `CLAUDE.md`) — but flag the drift for a docs pass rather than silently trusting the doc.

## 3. Check against known recurring bug classes

These have recurred across multiple past audits — check for them explicitly, don't wait to stumble on them:

- **Unpadded/local-vs-UTC date handling** — date-range filters comparing local calendar strings against UTC timestamps; unpadded day-of-month strings; `setUTCMonth(-1)`-style arithmetic on a Date that still carries a large day-of-month (breaks on day 29-31 in short months).
- **PAYDAY hardcoded as MONTHLY** — anywhere a tracker/budget period conversion assumes `payday_frequency`, grep for hardcoded `MONTHLY` near PAYDAY handling.
- **Missing sync-reactivity deps** — components/memos that read synced data but don't depend on `lastSyncCompletedAt`, so they go stale after a background sync.
- **Migration ladder violations** — a past migration block edited instead of a new `if (version < N)` block added.
- **Dead feature entry points** — UI still offers an action whose backing service function is a no-op or was removed in a rewrite.

## 4. Method by scope

**Single feature**: read the doc, then read every service/component file touching that feature end-to-end. Cross-check each calculation/conditional against the doc and against section 3's checklist. Note what's confirmed correct, not just what's broken — future audits need to know what was already checked.

**Whole codebase**: split into domain-scoped areas (sync/payday, trackers, budget plan, notifications, biometrics/lock screen, net worth, app shell/routing/stores are the areas covered historically) and dispatch parallel `Agent` calls (Explore or general-purpose) per domain, each told to read its relevant doc(s) first. After the fix pass, run a **second, independent adversarial review pass** — fresh agents with no prior context, reviewing the actual diff, not the plan — before calling it done. Past audits caught real gaps this way that the first pass missed.

## 5. No assumptions

Per `CLAUDE.md`'s working agreement: if correct behavior for an edge case isn't explicitly defined anywhere, don't guess a fix. Either ask Okky, or leave the case flagged under "known open items" rather than silently deciding. Any nontrivial call (e.g. remove vs. restore a broken dead feature) is Okky's call, not an assumption to make silently — ask.

## 6. Regression tests for critical fixes

For any fix to calculation-critical logic (payday, tracker periods, Spendable, balances), write a **new, deliberately adversarial test** that actually exercises the failure mode — not just a re-run of the existing suite. A past audit found an existing regression test that used a date that didn't actually hit the bug it claimed to guard (false-green). Check that new tests fail on the pre-fix code before trusting them.

## 7. Close out

- Run `npm run validate` and `npm run test` — confirm clean before reporting done.
- Report in the same shape as past audits: **Bugs fixed** (file:line, what broke, the fix), **Confirmed correct / not touched**, **Known open items NOT fixed** (flagged, out of scope, with why).
- If fixes reveal `Reference_Docs`/root `*.md` drift, propose the specific edit and get explicit confirmation before writing it — never edit `*.md` autonomously (see `CLAUDE.md` docs-collaboration rule).
