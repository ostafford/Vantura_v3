# Vantura — Glossary

Vantura is a local-first personal finance app for Up Bank customers. This is the
project glossary: the canonical word for each domain concept, and the words to
avoid. It covers **spending and income**, the **Dashboard** and **Headroom**, the
**Budget Plan**, **Regulars**, **Trackers**, **transactions**, **Savers**, **sync**,
**security**, **Settings**, **appearance** and **motion**. Implementation lives in
`docs/features/`; decisions live in `docs/adr/`.

## Language

### Spending and income

**Actual spending**:
What a period really cost: Up purchases and payments out (held or settled) on the Spending account and every Saver, minus refunds, by Display date in local time. Round-ups don't count. Transfers between your own accounts, Round Up rows, joint accounts, pay, interest and any other uncategorised money in are not spending. Can be negative when refunds outweigh purchases, and is never clamped. The one definition behind Trackers, attribution, Headroom and Month at a glance. The line falls at "Up put it in a category" because a categorised credit undoes a purchase Vantura can place; an uncategorised one points at no purchase, so counting a friend's repayment would be a guess. The accepted cost: a split bill shows as the whole bill, which overstates spending rather than understating it.
_Avoid_: money out (the screen label), spend, expenses, debits

**Refund**:
A positive Up amount that carries a category. It reduces Actual spending in that category, in the month it lands, never the month of the original purchase.
_Avoid_: credit, reversal, money back

**Money in**:
Positive, non-transfer Up amounts with no category: pay, interest, money from people. Shown beside Money out on Month at a glance. Refunds aren't money in; they reduce Actual spending instead.
_Avoid_: income (that's the Settings-based figure), deposits, credits

**Pay amount**:
The take-home amount of one pay, as the user entered it. Optional; without it, every figure built on Income shows a prompt to set it instead of a number.
_Avoid_: salary, wage, Income (that's the monthly figure)

**Pay frequency**:
How often the pay amount arrives: weekly, fortnightly or monthly. With Pay amount, the only pay setting that outlives the payday date (#195).
_Avoid_: payday frequency, pay cycle, pay schedule

**Income**:
Pay amount × the average number of pays in a month for the pay frequency (52/12 weekly, 26/12 fortnightly, 1 monthly). The same every month; never detected from deposits. "Not set", never $0, when the Pay amount or Pay frequency isn't set. A month with an extra pay therefore understates what was really left over.
_Avoid_: Money in (that's what actually arrived), salary, earnings, pay (bare)

**Round-up**:
A Spending-account round-up contribution, identified only by the Up API's `roundUp` attribute — never inferred from description text. Up records each one as its own Round Up row; the purchase's own amount already excludes it, so a rounded purchase counts at its own amount and is never treated as a transfer.
_Avoid_: round up transfer, spare change, micro-saving

**Round Up row**:
Up's separate transaction that moves round-up money, usually a credit into a Saver and sometimes a debit on the Spending account. Never Actual spending, whatever its transfer account: a few carry none, so the transfer rule alone would let them through.
_Avoid_: round-up (bare), round-up transfer

**Defined percentage**:
A percentage is shown only when it has a defined meaning. A change needs both figures above zero. A share of a budget needs both the spend and the budget above zero. Otherwise the dollar figure stands alone, never 0% and never clamped. So a change from $100 to −$50 shows the dollar change, not "down 150%", and a tracker with $0 spent shows no percentage. Over 100% is shown as it is.
_Avoid_: percentage guard, N/A %

### Dashboard

**Headroom**:
On hand minus Still to go out: what's left of the money you have once this calendar month's remaining bills and tracker budgets have gone out. Can be negative, and is never clamped; a negative figure is the shortfall signal. Shown on the Dashboard only.
_Avoid_: Spendable, safe to spend, available, free cash, leftover

**On hand**:
The live Up balance of the Spending account plus every Saver switched on for it. A Saver that first appears on a sync starts switched off, so Headroom never moves without the user's say-so.
_Avoid_: Available, balance, total balance, cash

**Still to go out**:
What's still expected to leave this calendar month: every Regular occurrence due this month that isn't paid yet (overdue ones included), plus each Tracker's Left. Counts every Regular and active Tracker, in a bucket or not. Unplanned spending isn't forecast.
_Avoid_: Reserved, Still planned, committed, upcoming, remaining

**Left**:
A Tracker's planned amount for the calendar month minus its Actual spending, floored at $0, so one tracker's overspend never cancels another's remainder. Summed as "Left in trackers". A Tracker word only.
_Avoid_: remaining, available, balance

**Free spending so far**:
Income minus Actual spending for the calendar month to date. Shown in the Headroom card. Not Unallocated, which is Income minus Committed.
_Avoid_: Unallocated, Headroom, leftover, remaining

**Month review**:
A card at the top of the Dashboard for the latest finished month that hasn't been reviewed. It shows that month's Saved or Overspent and opens the Budget Plan on it. Mark reviewed marks that month and every earlier one as reviewed.
_Avoid_: notification, reminder, alert, prompt, Review last month

**Dashboard section**:
One of the rearrangeable blocks below Headroom: Month at a glance, Trackers, Regulars. Each has a per-browser order, size and visibility. Order is editable on the Dashboard *and* in Settings; size and visibility only on the Dashboard — an intentional split. Headroom is fixed above them.
_Avoid_: widget, panel, module

**Stale data**:
Synced Up Bank data whose last sync was 30 minutes or more ago, or that has never synced. What the app does about it is in `docs/features/sync/OVERVIEW.md`.
_Avoid_: outdated, expired, old data

### Budget Plan

**Budget Plan**:
The page where Regulars and Trackers are grouped into buckets and compared with what's actually been spent, one calendar month at a time: the current month against today's plan, a finished month against its Month-end plan.
_Avoid_: budget, planner, forecast

**Bucket**:
A named group of Regulars and Trackers on the Budget Plan. Being in a bucket decides what an item contributes to Committed; it never decides which spending the item owns.
_Avoid_: category, group, envelope, folder

**Committed**:
What a month's buckets plan for: each Regular's occurrences dated in that month at their full amount (one-offs included), plus each Tracker's planned amount for the month. Items not in a bucket add nothing. Read from that month's plan: today's plan for the current month, its Month-end plan for a finished one (`docs/adr/0024`).
_Avoid_: allocated, reserved, budgeted total

**Unallocated**:
Income minus Committed for a calendar month: the part of Income that no bucket plans for. Shows a prompt instead of a number while Income isn't set. Not Free spending so far, which is Income minus Actual spending.
_Avoid_: Free spending, spare, surplus, disposable income

**Attribution**:
The rule for where each Actual spending transaction counts in a calendar month: exactly one place, in this order. (1) The Regular it's a Linked payment of. (2) Otherwise, the active Tracker whose categories, as they stood on its Display date, include its category. (3) Otherwise, Unplanned. Refunds skip step 1. If two Trackers own the category on that day (only possible through overlapping config history), neither takes it and it goes to Unplanned. So Regulars + Trackers + Unplanned always equals the month's Actual spending. Computed on every read; buckets never decide it (`docs/adr/0022`).
_Avoid_: allocation, categorisation, matching

**Unplanned**:
Actual spending in a month that no Regular or Tracker took under attribution. It means "not covered by the plan", not "unexpected": a routine grocery shop in a category with no Tracker is Unplanned. Can go negative when refunds exceed purchases. Shown on the Budget Plan's bar as "Spent unplanned".
_Avoid_: unbudgeted, other, miscellaneous, unexpected

**Spent on plan**:
Actual spending in a month that a Regular or Tracker took under Attribution, whether or not the item is in a bucket. It isn't measured against Committed, which counts only items in a bucket. Together with Unplanned, it makes up the month's Actual spending.
_Avoid_: committed spending, budgeted spending, on budget

**If the rest goes to plan**:
Income minus Actual spending minus Still to go out: where the month ends up if everything still expected goes out and nothing more is unplanned. Current month only; once the month finishes, Saved takes its place. Can go below zero.
_Avoid_: projected savings, forecast, Headroom, Free spending so far

**Saved**:
A finished month's Income, taken from its Month-end plan, minus that month's Actual spending. Below zero it's shown as **Overspent**: a positive amount in the over colour. Actuals stay live, so a late sync can still change it. There's no figure when the Month-end plan has no pay. Not Free spending so far, which is for the current month and uses today's pay.
_Avoid_: surplus, leftover, savings, Free spending so far

**Overspent**:
Saved below zero, shown as a positive amount. See Saved.

**Month-end plan**:
The plan as it stood when a calendar month ended: its buckets, its Regulars and their occurrences, its Trackers and the pay. A finished month is judged against it. It never changes afterwards, except that Mark paid can still mark its occurrences paid. Months from before Vantura started keeping them have none.
_Avoid_: snapshot, history, archive

### Regulars

**Regular**:
A bill or subscription you expect to pay: name, amount, frequency and date. Its stored date is never advanced; each read projects it forward to its occurrences. Feeds Still to go out, the Budget Plan and the due-soon banner. Named after Up's own term (`docs/adr/0018`).
_Avoid_: upcoming charge, bill (bare), recurring transaction, scheduled payment

**Occurrence**:
One due date of a Regular. A one-off has exactly one.
_Avoid_: instance, payment date, due item

**Linked payment**:
A held or settled, non-transfer Up debit that belongs to a Regular: its description is exactly the one the Regular is linked to, and its amount is within ±20% of the Regular's amount. A payment that would belong to two Regulars belongs to neither, and a refund is never one (`docs/adr/0020`).
_Avoid_: match, fingerprint, reconciled transaction

**Paid**:
An occurrence is paid when a Linked payment lands nearest to it (the earlier occurrence when two are equally near), or when the user has used **Mark paid** on it. Never assumed because its date has passed. Mark paid changes the status only, never Actual spending.
_Avoid_: settled, cleared, reconciled

**Overdue / This month / Later**:
The groups the Regulars list is split into, one row per Regular, placed by its earliest unpaid occurrence. *Overdue*: before today in this calendar month, or a one-off from an earlier month still unpaid. *This month*: today to month end. *Later*: after this month, including a Regular whose occurrences this month are all paid.
_Avoid_: next pay, urgent / non-urgent, upcoming / scheduled, arrears

**Due soon**:
A Regular whose earliest unpaid occurrence from today falls within the reminder window the user set for it. Shown in the Dashboard banner until it's paid or dismissed for the day.
_Avoid_: reminder (that's the setting), alert, notification

### Trackers

**Tracker**:
A user-defined budget over one or more Up Bank categories: a name, a budget amount, a reset cycle, and the categories whose Actual spending counts against it. A category belongs to at most one active tracker (`docs/adr/0003`).
_Avoid_: budget (bare — reserve for the amount), category group, envelope

**Reset cycle**:
How often a tracker's budget starts over: weekly, fortnightly or monthly, each on its own reset day (a weekday, or day-of-month 1–28). For Headroom and attribution a tracker is measured over the calendar month instead.
_Avoid_: reset frequency (in prose), billing cycle, period type

**Tracker period**:
The half-open date window `[last_reset_date, next_reset_date)` a tracker's spending is currently measured in on Trackers' own screens.
_Avoid_: cycle, window, budget period

**Config history**:
The per-tracker timeline of budget-amount and category-set versions, each with an effective-from date. A budget or category edit takes effect the next day and the current tracker period **splits** at that boundary — the part before the change stays judged against the old config, the part after against the new one, each segment's budget prorated by its share of the period's days. Not retroactive, not blended. Current-period only; past periods are unaffected (`docs/adr/0014`).
_Avoid_: audit log, revision history, effective budget (that is the derived number, not this timeline)

### Transactions

**Display date**:
`created_at ?? settled_at`, in device local time: the date Vantura uses for a transaction everywhere — which month it counts in, range filters, grouping, sort, tracker periods. Matches the Up app. Not the settled date.
_Avoid_: transaction date (ambiguous), posted date, settled date

**Transaction user data**:
The local overlay of things a user adds to a synced transaction — currently just a note — stored apart from the transaction, never touched by sync. It exists only while it carries a note (`docs/adr/0008`). Category changes go through Up instead.
_Avoid_: transaction metadata, annotations, custom fields

### Accounts and Savers

**Spending account**:
Up's everyday transactional account. Its balance is always part of On hand.
_Avoid_: transactional account (in prose), main account, everyday account

**Saver**:
An Up Bank account with `account_type = 'SAVER'`. No separate table — it's an `accounts` row. Optionally carries Vantura-side goals (see *Saver goal cycle*), independent of anything configured in Up.
_Avoid_: savings account, sub-account, pot, goal account

**Saver goal cycle**:
One goal a saver has had — amount, optional target date, when it started, when it was reached (`achieved_at`, sticky), when it was superseded. Stored as a row in `saver_goal_history` (`docs/adr/0015`); the current cycle is the row not yet archived. `accounts.target_amount_cents` mirrors the current cycle's amount. Reaching a goal doesn't end the cycle — setting the next one does.
_Avoid_: goal, target (ambiguous), goal history (that's the table)

**Interest (saver)**:
An Up interest payment into a saver — `transaction_type = 'Interest'`, a positive credit with no transfer and no round-up. Summed per goal cycle and all-time; kept separate from contributions (which are transfers / round-ups).
_Avoid_: bonus, yield, earnings

**Pace projection**:
A saver's on-track / behind-pace status: `currentBalance + lastCompleteMonthRate × monthsRemaining` vs. the goal. Derived from real contribution history, not a configured contribution. The in-progress month is excluded. Also solves for *when* the goal is reached at that rate (`monthsToGoal`), so being ahead is framed concretely — "~N months early" — not just a green light. Math lives in `src/pages/analytics/saverProjection.ts`.
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

### Security

**Unlock passphrase**:
The passphrase that derives (via PBKDF2) the AES key protecting the stored Up Bank API token. Never persisted anywhere — it exists only transiently while the key is derived. 12-character minimum (`PASSPHRASE_MIN_LENGTH`), no composition rules. Changeable in Settings → Security without data loss (`reEncryptSecret` re-keys under a fresh salt); no forgot-passphrase recovery — Clear-all-data is the only way back.
_Avoid_: password, PIN, master key

**Export passphrase**:
A separate, user-chosen passphrase encrypting a profile export file. Independent of the unlock passphrase, but shares its 12-character floor (`PASSPHRASE_MIN_LENGTH`; `encryptExportPayload` rejects anything shorter, `#32`). The export never contains the API token.
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
A passphrase-encrypted file holding a subset of the local data: whitelisted settings, trackers, Regulars and their paid marks, the Budget Plan, saver goals, and which Savers count in On hand. Never the API token, accounts or transactions. The export passphrase is separate from the unlock passphrase.
_Avoid_: backup, snapshot, dump

**Profile import**:
Applying an export file as a per-section **replace** (delete-then-reinsert), never a merge (`docs/adr/0013`). Sections and settings belonging to removed features are skipped, and the user is told which. Destructive to the sections chosen.
_Avoid_: restore, sync, merge

**What's New**:
The modal shown once per app version, listing what changed in that version. Not a notification.
_Avoid_: release notes popup, update alert

### Appearance

**Computed colour**:
A per-item colour (tracker dot, Budget Plan bucket, category bar, frequency badge) derived at render time from the entity's stable id — never stored, never user-chosen, no picker. Validated as a set for colour-vision-deficiency safety, which is why the categorical chart's parent-group order is fixed (`docs/adr/0011`).
_Avoid_: assigned colour, colour setting, badge colour

**Locked accent**:
The single app-wide primary colour (`--vantura-primary`, Sky). Deliberately not selectable — it replaced an earlier 6-swatch picker.
_Avoid_: theme colour, brand colour, accent setting

### Motion

**Frequency gate**:
The rule that decides whether — and how much — an element animates, keyed to how often a user sees it: 100+ times/day (keyboard shortcuts, command toggles) → no animation ever; tens of times/day (hover, list nav) → near-imperceptible or none; occasional (modals, drawers, toasts) → standard; rare / first-run (onboarding, a goal hit) → the delight budget. From `docs/PRODUCT.md`'s *Motion & polish* section.
_Avoid_: animation policy, motion rule, transition setting

**Delight budget**:
The small allowance for expressive, noticeable motion — reserved for rare, high-emotion moments and spent nowhere on the hot path. A finance tool's restraint principle applies to the interface, not just the number.
_Avoid_: flourish, wow moment, polish budget

**Interruptible motion**:
Motion that retargets from its current position when re-triggered mid-flight instead of restarting — a CSS transition or spring, never a `@keyframes`. Required for anything rapidly triggered or reversible (a drawer spammed open/closed, a toggle).
_Avoid_: reversible animation, cancellable transition

**1:1 tracking**:
During a drag or scrub, the element stays glued to the pointer and updates continuously through the whole gesture — never only on release, never snapping to the element's centre on grab.
_Avoid_: drag follow, pointer lock, live drag

**Response-on-press**:
Interactive elements acknowledge input on pointer-down, not on click/release — a button highlights the instant it's pressed. Feedback during an interaction is continuous, not deferred to the end.
_Avoid_: press feedback delay, active-state lag
