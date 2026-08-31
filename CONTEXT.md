# Vantura — Domain Context

Vantura is a local-first personal finance app for Up Bank customers. This is the
project glossary: the canonical word for each domain concept, and the words to
avoid. It is grown one feature at a time as the docs are rebuilt — right now it
covers the **Dashboard**, the **payday cycle**, the balance figures,
**trackers**, **transactions**, **upcoming charges**, **budget plan**,
**savers**, the month/period **comparisons** and **reports**, the **weekly
metrics**, **net worth**, **sync**, **notifications**, **appearance**, **security**,
the **Settings** shell, and **profile export/import**. Implementation lives
in `docs/features/`; decisions live in `docs/adr/`.

## Language

### Balance figures

**Available**:
The sum of balances across the user's open Up Bank *transactional* accounts. Saver accounts are never included. Held (authorised-but-unsettled) transactions are already netted out by Up Bank, so Vantura does not deduct them again.
_Avoid_: balance, bank balance, total balance, current balance

**Reserved**:
The part of Available that must be held back to cover `is_reserved` upcoming charges falling due *strictly before* the next payday. A charge due *on* payday is not reserved — that day's incoming pay covers it. Weekly/fortnightly charges count once per occurrence before payday; infrequent charges (monthly and rarer) count their full amount once, never prorated. A safety-net floor, not a save-toward-a-future-bill fund (`docs/adr/0002`). An upcoming charge with `is_reserved` off is excluded from this entirely.
_Avoid_: allocated, committed, earmarked, set-aside, provisioned, sinking fund

**Spendable**:
Vantura's central safety-net figure: Available minus Reserved. Deliberately conservative — it is never a false "green light" to spend. The Up Bank API is ground truth beneath it.
_Avoid_: safe-to-spend, disposable, leftover, free cash, remaining

**Forecast**:
Spendable minus the remaining budget of every active tracker's current period — what stays safe if the user spends every tracker to its limit. Assumes no future tracker resets and no spending pace.
_Avoid_: projected spendable, predicted balance, estimated spendable

**Pay amount**:
The user's configured income per pay cycle (`pay_amount_cents`). Optional; when set it drives the cards' "after payday" projections and the percent-of-pay alert floor.
_Avoid_: salary, wage, income (as the stored value)

### Payday

**Payday cycle**:
The user's pay schedule — a frequency (`WEEKLY` / `FORTNIGHTLY` / `MONTHLY`), a day, and `next_payday` (always kept strictly in the future). Anchors Spendable, Reserved, and every PAYDAY-frequency tracker. It is always an explicit, user-confirmed fact — the app never infers or guesses it, and a request that needs it without it configured fails loudly rather than falling back to a default.
_Avoid_: pay period (for the config), pay schedule, salary cycle

**Relative payday rule**:
A `payday_day` value of 100–105 encoding "last «weekday» of the month" — 100 = last business day, 101–105 = last Monday…Friday. Exists because a fixed day-of-month can't express "paid on the last business day."
_Avoid_: floating payday, dynamic payday

**Payday nomination**:
Setting up the payday cycle by pointing at a real past income transaction and deriving the frequency/day/`next_payday` from it. An alternative on-ramp to manual entry — still a fact, captured more conveniently, not a guess.
_Avoid_: payday detection, auto-detect payday, payday inference

### Trackers

**Tracker**:
A user-defined budget over one or more Up Bank categories — a name, a budget amount, a reset cycle, and the categories whose spending counts against it. A personalised lens on already-categorised transaction data, not a separate data store. A category belongs to at most one active tracker (`docs/adr/0003`).
_Avoid_: budget (bare — reserve for the amount), category group, envelope

**Reset cycle**:
How often a tracker's budget starts over: `WEEKLY`, `FORTNIGHTLY`, `MONTHLY`, or `PAYDAY`. `PAYDAY` follows the payday cycle; the others use a reset day (weekday, or day-of-month 1–28).
_Avoid_: reset frequency (in prose — it is the column name, not the term), billing cycle, period type

**Tracker period**:
The half-open date window `[last_reset_date, next_reset_date)` a tracker's spend is currently measured in. Advanced by the reset engine once `next_reset_date` passes.
_Avoid_: cycle, window, budget period

### Transactions

**Display date**:
`created_at ?? settled_at` — the date Vantura uses for a transaction everywhere: range filters, date grouping, sort, tracker-period attribution. Matches the Up app's own choice. Not the settled date.
_Avoid_: transaction date (ambiguous), posted date, settled date

**Transaction user data**:
The local overlay of things a user adds to a synced transaction — a note, a category override — stored in its own table, never on the transaction row, never touched by sync. A row exists only while it carries a note or an override (`docs/adr/0008`).
_Avoid_: transaction metadata, annotations, custom fields

**Category override**:
A user's local re-categorisation of a transaction. It does not change the category in Up Bank and, today, is display-only — filtering and category analytics still use Up's category (`#27`). Distinct from changing a category *through* Vantura, which PATCHes Up and clears any override.
_Avoid_: recategorisation, manual category, local category

### Budget Plan

**Budget Plan**:
The forward-looking organiser at `/analytics/budget` — buckets of recurring expenses, "what if" hypothetical lines, and an Income / Committed / Free Spending footer, all rescaled by a Weekly / Monthly / Yearly display-period toggle. A glanceable ledger, not a heavy planner.
_Avoid_: budget, planner, forecast

**Bucket**:
A named group within Budget Plan (`name` + `icon`). Holds assigned upcoming charges, assigned trackers, and hypothetical lines side by side. A tracker or charge is claimed by the bucket, not assigned from its own side.
_Avoid_: category, group, envelope, folder

**Hypothetical line**:
A "what if this expense existed" amount added to a bucket. It counts toward the bucket's and the page's Committed total (so the user sees its impact), is flagged with a flask icon, and can be removed with no effect on any real transaction or charge.
_Avoid_: draft, scenario, placeholder expense

**Free spending**:
Income minus Committed for the selected display period. `null` (and hidden) whenever the pay amount isn't set. One-time (`ONCE`) charges never reduce it (`docs/adr/0009`).
_Avoid_: disposable income, spare, remaining, leftover

### Upcoming charges

**Upcoming charge**:
A manually-entered future bill or subscription — name, amount, frequency, next date. Its stored date is never advanced; each read projects it forward to the next occurrence. Feeds Spendable (when `is_reserved`), the due-soon banner, and the calendar view.
_Avoid_: bill (bare), recurring transaction, scheduled payment

**Next pay / Later**:
The two buckets the upcoming-charges list is split into. *Next pay* = the charge's next occurrence is strictly before `next_payday`; *Later* = everything else (and everything, when no payday is configured).
_Avoid_: this pay period / future, urgent / non-urgent, upcoming / scheduled

**Settlement detection**:
Auto-clearing a bill's due notification when a real synced transaction matches the charge's linked `match_raw_text` (same amount sign, not a transfer, within 5 days before the projected date). Runs on app open.
_Avoid_: reconciliation, matching, clearing

**Liability repayment charge**:
An upcoming charge with `charge_type = LIABILITY_REPAYMENT` — a payment toward a tracked debt (`manual_accounts` liability), treated as net-worth-neutral rather than an expense. Excluded from the due-soon banner. The verify-and-deduct behaviour is not yet built (#19).
_Avoid_: loan payment, debt payment, transfer

### Comparisons

**Period comparison**:
The generic engine (`getPeriodComparison`) that turns a current and a previous date range into Money in / Money out / Charges / Net deltas plus narrative sentences. It never derives "previous" itself — one caller per period type does (`getMonthComparison`, `getYearComparison`, `getWeekComparison`); a custom range has no caller yet. `docs/adr/0007`.
_Avoid_: comparison report, delta engine, period diff

**Comparison narrative**:
The generated win / challenge / opportunity sentences a period comparison produces ("Income is up $X vs March"). Shown on the Reports "what changed" card and the Month/Weekly at-a-glance cards.
_Avoid_: insight text, summary, commentary

**YTD comparison**:
A period comparison for an in-progress year: Jan 1–today against Jan 1–the same day last year, not full year against full year. The only year-mode behaviour on the `/analytics` card; flagged to the user via `periodNote`.
_Avoid_: partial-year comparison, annual comparison

**Elapsed-day capping**:
When comparing a period that is still in progress against the previous one, the baseline is capped to the *same number of elapsed days*, never the full previous period. So an 11-days-in month compares against days 1–11 of last month, not all of last month. Applied by both the month and the week comparisons.
_Avoid_: partial-period adjustment, prorating, day alignment

### Weekly metrics

The four figures on the Weekly Insights card. Each is measured over a local-time Monday–Sunday week, on the transaction display date.

**Money in**:
Real Up Bank income for the week — positive amounts that are not internal transfers (`source = 'up'`). Excludes money moved in from a saver.
_Avoid_: income (bare), deposits, credits

**Money out**:
Spending for the week — negative, non-transfer, categorisable amounts. Excludes transfers to savers and round-ups.
_Avoid_: expenses (bare), debits, payments

**Charges (count)**:
The number of Money out transactions that week — one per purchase. Not a dollar figure.
_Avoid_: transactions, payments made

**Savers movement**:
Net flow between spending and saver accounts for the week, sign-flipped so money moved *into* savers reads as a positive "saved" figure and money withdrawn reads negative.
_Avoid_: savings, saver balance, transfers

### Net worth

**Net worth**:
All synced Up Bank balances plus manual-account assets, minus manual-account liabilities. Up Bank home-loan debt (a negative synced balance) is folded in as a liability.
_Avoid_: total balance, wealth, equity

**Manual account**:
A user-entered account Vantura does not sync — mortgage, super, property, credit card, HECS, other-bank savings, etc. Each has a `kind` of *asset* or *liability*, derived from its type at save time. Liability balances are stored as positive numbers.
_Avoid_: external account, offline account, custom account

**Net worth snapshot**:
One `net_worth_snapshots` row per calendar day, last write wins, holding the three component sums (Up Bank, manual assets, manual liabilities) — never a stored total. The only net-worth history there is; feeds the trend chart.
_Avoid_: history entry, balance record, daily total

**Projected net worth**:
Net worth minus the reserved `EXPENSE` upcoming charges due before the next payday. Excludes liability-repayment charges — those don't reduce net worth (`docs/adr/0005`).
_Avoid_: forecast net worth, future net worth, adjusted net worth

**Stale account**:
A manual account whose balance hasn't been updated within its type's threshold (7 days for a credit card, up to 365 for property). Shown with an "≈ approximate" marker.
_Avoid_: outdated account, unsynced account

### Savers

**Saver**:
An Up Bank account with `account_type = 'SAVER'`. No separate table — it's an `accounts` row. Optionally carries a Vantura-side goal amount (`target_amount_cents`) and goal date (`saver_goal_date_<id>`), both independent of anything configured in Up.
_Avoid_: savings account, sub-account, pot, goal account

**Pace projection**:
A saver's on-track / behind-pace status: `currentBalance + lastCompleteMonthRate × monthsRemaining` vs. the goal. Derived from real contribution history, not a configured contribution. The in-progress month is excluded.
_Avoid_: forecast, trajectory, savings rate

**Loose Change**:
A fallback display name shown for a round-up whose destination account has no name, plus the label on the Savers page's aggregate round-ups figure. **Not** a saver type or a saver Vantura recognises — round-up routing is an Up native setting Vantura can't see or change (`docs/adr/0010`).
_Avoid_: round-up saver, spare-change account, the round-up pot

### Sync

**Initial sync**:
The one-time full pull run during onboarding (`performInitialSync`) — every transaction, no date filter — before `onboarding_complete` is set.
_Avoid_: first sync, onboarding sync, bootstrap

**Incremental sync**:
The routine pull (`performSync`) — transactions since the last `last_sync` only. The app's only automatic sync (Dashboard mount when data is over 30 minutes old); otherwise manual. No timer or background sync exists.
_Avoid_: normal sync, background sync, periodic sync, delta sync

**Full re-sync**:
The manual "Re-sync" in Settings (`performFullSync`) — re-reads every transaction to pick up edits made in the Up app (e.g. re-categorising) that an incremental sync structurally can't see, because Up's API has no last-modified field (`docs/adr/0006`).
_Avoid_: hard sync, force sync, deep sync

**HELD transaction**:
An Up Bank transaction that is authorised but not yet settled. Each incremental sync re-checks any locally-HELD transaction that fell outside the `since` window, until it settles or is reversed.
_Avoid_: pending (bare), unsettled, provisional

**Round-up**:
A Spendable-account round-up contribution, identified only by the Up API's `roundUp` attribute — never inferred from description text. A round-up debit is deliberately *not* treated as an internal transfer.
_Avoid_: round up transfer, spare change, micro-saving

### Notifications

**Notification check**:
One of the nine idempotent functions `runNotificationChecks()` runs on Dashboard mount. Each decides whether to add a history row (and fire an OS alert), gated by its own per-type toggle — all nine default on — and its guard key.
_Avoid_: alert rule, notification job, trigger

**Notification guard key**:
The `app_settings` key that stops a check re-firing. Two shapes: a *daily* guard stores today's date and re-arms each calendar day; a *fired-for-value* guard stores a watched value (a tracker reset date, a saver target, a payee key) and re-fires only when that value changes.
_Avoid_: dedup key, lock, seen marker

**Sticky notification**:
A `bills_due` history row. It survives "clear non-sticky" and is removed only when settlement detection finds the matching payment — unlike every other type, which just ages out after 7 days.
_Avoid_: pinned notification, persistent alert

**What's New notification**:
A `whats_new` history row seeded once per app version from the CHANGELOG. No toggle, not a check, guarded in `localStorage` — so it is not carried by profile export and re-seeds on a restored profile.
_Avoid_: release note, changelog entry, update alert

### Security

**Unlock passphrase**:
The passphrase that derives (via PBKDF2) the AES key protecting the stored Up Bank API token. Never persisted anywhere — it exists only transiently while the key is derived. 12-character minimum at onboarding, no composition rules.
_Avoid_: password, PIN, master key

**Export passphrase**:
A separate, user-chosen passphrase encrypting a profile export file. Independent of the unlock passphrase, and has no minimum length today (`#32`). The export never contains the API token.
_Avoid_: backup password, import key

**Biometric session**:
A cache of the plain API token, encrypted with a fresh AES key generated at biometric enrolment. The key lives in `localStorage`, the ciphertext in `sessionStorage` — split so closing the tab destroys half of it (`docs/adr/0012`). Not derived from the passphrase.
_Avoid_: fingerprint login, saved token, Face ID key

**Inactivity lock**:
Auto-lock after N idle minutes (default 3, configurable 1–30). Clears the in-memory token and routes to the Unlock screen; the encrypted token on disk is untouched.
_Avoid_: session timeout, auto logout, idle lock

### Settings

**Demo mode**:
The state where `app_settings.demo_mode = '1'` — the DB holds seeded sample data, sync is disabled everywhere, and the API-token section is hidden. It's exited only by Clear-all-data; there is no toggle.
_Avoid_: sample mode, test mode, preview mode

**Profile export**:
A passphrase-encrypted file holding a subset of the local data — whitelisted settings, trackers, upcoming charges, and budget plan. Never the API token, accounts (Up or manual), transactions, or net-worth history. The export passphrase is separate from the unlock passphrase.
_Avoid_: backup, snapshot, dump

**Profile import**:
Applying an export file as a per-section **replace** (delete-then-reinsert), never a merge (`docs/adr/0013`). Foreign keys are remapped through a fresh id map; cross-database references resolve by name or are dropped. Destructive to the sections chosen.
_Avoid_: restore, sync, merge

### Appearance

**Computed colour**:
A per-item colour (tracker dot, Budget Plan bucket, category bar, frequency badge) derived at render time from the entity's stable id — never stored, never user-chosen, no picker. Validated as a set for colour-vision-deficiency safety, which is why the categorical chart's parent-group order is fixed (`docs/adr/0011`).
_Avoid_: assigned colour, colour setting, badge colour

**Locked accent**:
The single app-wide primary colour (`--vantura-primary`, Sky). Deliberately not selectable — it replaced an earlier 6-swatch picker.
_Avoid_: theme colour, brand colour, accent setting

### Dashboard

**Balance card**:
One of the three fixed figures at the top of the Dashboard: Available, Spendable, Forecast. Always present, not reorderable. Distinct from a Dashboard section.
_Avoid_: stat, tile, widget

**Dashboard section**:
One of the five rearrangeable blocks below the balance cards: Month at a glance, Weekly insights, Trackers, Upcoming transactions, Net Worth. Each has a per-browser order, size, and visibility. Order is editable on the Dashboard *and* in Settings; size and visibility are editable only on the Dashboard — an intentional split, kept until a deliberate decision to move it.
_Avoid_: widget, panel, module, card (reserve "card" for the balance cards)

**Spendable alert threshold**:
The user-set floor below which Spendable counts as low — the Spendable card turns red and a notification fires. Set by tapping the Spendable card, as *either* a dollar amount *or* a percentage of Pay amount (never both — schema v38 collapsed the old two-floor `max()` model). A percentage alert is dormant while no Pay amount is set.
_Avoid_: limit, cap, budget, minimum balance

**Stale data**:
Synced Up Bank data old enough to act on: the Dashboard quietly re-syncs when the last sync is over 30 minutes old, and shows an "N h old" badge when it is over 60 minutes old.
_Avoid_: outdated, expired, old data
