---
name: vantura-audit
description: Vantura's repeatable feature/codebase accuracy audit — scope, ground in the current docs (docs/features/*/OVERVIEW.md + CONTEXT.md + docs/adr/), review through three parallel lenses (correctness, spec/doc fidelity, standards & structure), fix, adversarial second pass, close out. Use when Okky asks to audit a feature, verify the 99%+ accuracy bar, or check something for bugs across the codebase.
---

# Vantura accuracy audit

Vantura holds a **flat 99%+ accuracy bar across the whole codebase** (`CLAUDE.md`) —
a UI bug gets the same rigour as a Spendable miscalculation, no tiered effort. This
skill is the repeatable procedure for verifying that bar and fixing what fails it,
distilled from prior audits (Dashboard, Tracker, Analytics, Payday, full-codebase —
see the `audit_*` memories).

It is **end-to-end**: scope → ground → review → fix → adversarial second pass →
close out. Not a find-only review.

## 1. Scope the audit

Ask, or infer from the request, whether this is a **single feature** ("audit
trackers") or a **whole-codebase pass**. Never assume one for the other.

## 2. Pin what you're auditing

- **Auditing recent work / a branch**: capture the diff once — `git diff <fixed-point>...HEAD` (three-dot, against the merge-base) — and the commit list — `git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves (`git rev-parse <fixed-point>`) and the diff is non-empty *before* spawning any sub-agent.
- **Auditing existing, unchanged code**: the surface is the feature's full file set — every `src/services/*`, `src/components/*`, `src/lib/*` that touches it, read end-to-end.

## 3. Ground yourself in intended behaviour before reading code

For a feature audit, read first:

- **`docs/features/<feature>/OVERVIEW.md`** — how the feature is supposed to work.
- The relevant entries in the repo-root **`CONTEXT.md`** glossary — the canonical term definitions and the precise filter/rule each names.
- Any **`docs/adr/`** entry touching the area.
- **`docs/DATABASE.md`** — schema, columns, `app_settings` keys.

For a whole-codebase pass, each domain agent (section 5) reads its own feature folder(s) + the glossary sections + ADRs for its area.

**Rules for using the docs:**

- **Code is ground truth on conflict** (`CLAUDE.md`). If code and doc disagree, trust the code — but flag the drift, propose the specific doc edit, and get explicit confirmation before writing it. Never edit a `*.md` autonomously.
- **An ADR that explains a deliberate divergence is a "do not fix this" signal, not a finding.** E.g. `docs/adr/0005` — the net-worth projection excludes `LIABILITY_REPAYMENT` while Spendable's Reserved includes them, on purpose. A lens that flags this as an inconsistency is wrong; check the ADRs before reporting any "these two should match" finding.
- If the correct behaviour for an edge case isn't defined anywhere — code, docs, or ADRs — do **not** guess. Section 6.

## 4. The recurring bug-class checklist

These have recurred across multiple audits. Check for each explicitly — don't wait to stumble on one.

**Dates & time**
- Local calendar strings compared against UTC timestamps in a range filter (shifts every range by the UTC offset). Use `localDateStartUtc` / `localDateEndUtc`.
- Unpadded day-of-month strings (`2026-3-5`) breaking string comparison.
- `setUTCMonth(-1)` on a Date still carrying a large day-of-month — rolls a short month (Feb) back into itself. Compute target year/month by arithmetic instead.
- Local-time vs UTC-noon inconsistency between modules (e.g. `getWeekRange` is local; payday/tracker maths is UTC-noon).

**Payday & periods**
- `PAYDAY` frequency hardcoded as `MONTHLY` in a period conversion — grep for literal `MONTHLY` near PAYDAY handling.
- Relative payday codes (100–105) reaching a code path that treats `payday_day` as a plain 1–28 day.

**Sync reactivity**
- A component/memo that reads synced data but doesn't depend on `syncStore.lastSyncCompletedAt` — goes stale after a background sync.

**Schema**
- A past migration block edited instead of a new `if (version < N)` block added.

**Dead entry points**
- UI still offers an action whose backing service function is a no-op or was removed in a rewrite.

**Idempotency & guards** (surfaced by the notifications / large-tx audits)
- A checkpoint / high-water-mark advanced to wall-clock time regardless of what was observed — anything arriving later with an older `settled_at` is permanently skipped. Advance to the max value actually seen.
- Two records sharing an exact timestamp: a strict `>` against a checkpoint silently drops the second. Track ids seen at the checkpoint value.
- Substring `LIKE '%name%'` matching where a name can be a substring of another ("Gym" vs "Anytime Gym Membership"). Anchor the pattern.

**Unenforced invariants across a seam**
- A loop or function whose termination / correctness depends on a caller having done something first (`recalculateTrackers` assumed `advanceNextPaydayIfNeeded` already ran — an infinite loop when it hadn't). Make the function self-guaranteeing: only mark "changed" / recurse when a value actually changed.

**Money & sign conventions**
- Negative amounts rendered as `$-1,234.56` instead of `−$1,234.56`. Check every `formatMoney` call site, including ones using a field that can *unexpectedly* go negative (a HOME_LOAN in credit; `upBankLiabilitiesCents`).
- HOME_LOAN (negative synced balance) or HELD (already netted by Up) sign handling — double-counted or shown on the wrong side.

**False-green regression tests**
- An existing regression test that passes without actually exercising the bug it claims to guard (wrong date, wrong fixture). A passing suite is not proof.

## 5. Review through three lenses — parallel sub-agents

Spawn these as **parallel `Agent` calls** so their contexts don't pollute each
other. Each gets the diff command + commit list (or the file list), and reads its
own docs first (section 3).

1. **Correctness** — every calculation and conditional vs. the intended behaviour in `OVERVIEW.md` / `CONTEXT.md`, and vs. section 4's checklist. Report each failure as `file:line`, what breaks, the input that triggers it.
2. **Spec / doc fidelity** — does the behaviour match `OVERVIEW.md`, the glossary term definitions, and the originating issue? Report: missing/partial requirements; behaviour not asked for (scope creep); things that look implemented but wrong. Quote the doc/issue line per finding.
3. **Standards & structure** — documented repo standards (`CLAUDE.md`, any `CONTRIBUTING`), **plus the Fowler smell baseline** (paste the 12 smells from `.claude/plugins/.../code-review/SKILL.md` step 3 into the agent prompt — it has no other access), **plus deep-module checks**: a shallow module (interface nearly as complex as its implementation); calc-critical logic not extracted into a pure, directly-testable core (see the `calculateReservedAmount` / `computeProjectedNetWorth` / `calculateForecastSpendable` pattern — pure function + thin DB wrapper); an interface whose invariants/ordering/error-modes aren't enforced by the module itself. Distinguish **hard violations** (a documented standard breached) from **judgement calls** (baseline smells — always heuristics). A documented repo standard overrides the baseline. Skip anything tooling already enforces.

**Aggregate the three reports under their own headings. Do not merge or rerank across lenses** — the separation is the point (correct code that drifts from the doc; on-spec code with a structural smell; etc.).

## 6. No assumptions

If the correct behaviour for an edge case isn't explicitly defined in code, docs,
or an ADR, do **not** guess a fix. Either ask Okky, or leave it flagged under
"known open items" with why. Any non-trivial call — remove vs. restore a dead
feature, which of two plausible semantics is intended — is Okky's, not a silent
decision.

## 7. Fix, with regression tests for anything calc-critical

For a fix to payday, tracker periods, Spendable, Reserved, Forecast, balances, or
net worth:

- **Extract the logic into a pure function** if it isn't already — no DB, no I/O — and test it directly through that interface. Follow the `__test__` export-bag pattern (`trackers.ts`, `sync.ts`) for internals that need direct coverage.
- Write a **new, deliberately adversarial test** that exercises the actual failure mode — not a re-run of the existing suite.
- **Verify the new test fails on the pre-fix code.** A test that passes both before and after proves nothing.

## 8. Adversarial second pass

After the fix pass, run a **second, independent review** — fresh `Agent` calls,
no prior context, reviewing the **actual diff**, not the plan. Past audits caught
real, still-reachable bugs this way that the first pass missed (the
`recalculateTrackers` loop was re-found through a narrower trigger on the second
pass). Don't skip it.

## 9. Close out

- `npm run validate` and `npm run test` — confirm clean before reporting done.
- Report in the established shape: **Bugs fixed** (`file:line`, what broke, the fix), **Confirmed correct / not touched** (so the next audit knows what was checked), **Known open items NOT fixed** (flagged, with why).
- A structural finding that's a genuine, hard-to-reverse trade-off → propose a `docs/adr/` entry.
- Doc drift found → propose the specific `OVERVIEW.md` / `CONTEXT.md` / `DATABASE.md` edit and get explicit confirmation. Never edit a `*.md` autonomously (`CLAUDE.md` docs-collaboration rule).
