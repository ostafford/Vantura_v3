# Up Bank API surface for Pay Splitting

**Ticket:** [ostafford/Vantura_v3#81](https://github.com/ostafford/Vantura_v3/issues/81)
**Date:** 2026-09-08
**Scope:** Does the Up Bank API expose anything about Pay Splitting — the feature that routes a
percentage or fixed amount of each pay into Savers (including the Essentials Saver)?

## TL;DR

**The Up API has no Pay Splitting surface at all.**

1. **No endpoint exposes a user's pay-split configuration** (targets, amounts, percentages, frequency).
   The entire v1 (beta) resource list is: Accounts, Transactions, Categories, Tags, Attachments,
   Webhooks, `util/ping`. There is no Savers-management resource, no auto-transfer resource, no
   scheduled-payments resource, and no pay-split resource. Multiple open feature requests on Up's own
   API repo confirm the gap; Up staff said Saver management is "planned" — in **November 2020** — and
   it still has not shipped as of the latest spec commit (Feb 2026).
2. **Pay-split transfers are indistinguishable from any other internal transfer** in `GET /transactions`.
   They show up as a plain transfer transaction: `transactionType` a free-text string (observed
   `"Transfer"`; **no enum in the spec**), `description` like `"Transfer to <Saver name>"` /
   `"Transfer from <account>"`, `transferAccount` pointing at the other account (when it still exists),
   `category`/`parentCategory` `null`, `isCategorizable` `false`, and `roundUp` / `cashback` /
   `holdInfo` `null`.
3. **Nothing lets a consumer tell a pay-split-driven transfer apart from a manual transfer** into the
   same Saver. There is no provenance / "created by automation" / rule-id field on a transaction.
   Only weak heuristics are available (timing right after a salary credit, `message` text, amount ==
   a known % of pay) and none are authoritative.

---

## 1. Is there an endpoint that exposes a user's pay-split configuration?

**No.**

### The full API surface (no pay-split / saver-config resource)

From the API reference at <https://developer.up.com.au/> and the OpenAPI spec
(<https://github.com/up-banking/api>, `v1/openapi.json`):

| Resource | Operations |
|---|---|
| Accounts | `GET /accounts`, `GET /accounts/{id}`, `GET /accounts/{accountId}/transactions` |
| Transactions | `GET /transactions`, `GET /transactions/{id}`, `PATCH /transactions/{id}/relationships/category` |
| Categories | `GET /categories`, `GET /categories/{id}` |
| Tags | `GET /tags`, `POST`/`DELETE /transactions/{id}/relationships/tags` |
| Attachments | `GET /attachments`, `GET /attachments/{id}` |
| Webhooks | `GET`/`POST /webhooks`, `GET`/`DELETE /webhooks/{id}`, `POST /webhooks/{id}/ping`, `GET /webhooks/{id}/logs` |
| Utility | `GET /util/ping` |

There is **no** endpoint for: Savers configuration, Saver goals, auto-transfers / scheduled transfers,
pay splitting / "Split Payments", recurring payments, or "Boosts". Searching the OpenAPI spec for
`split`, `splitting`, `payday`, `scheduled`, `recurring`, `auto transfer` returns nothing.
`Account` objects expose only `displayName`, `accountType` (`SAVER` / `TRANSACTIONAL` / `HOME_LOAN`),
`ownershipType`, `balance`, `createdAt` — no goal, no emoji, no transfer rules.

### Up's own issue tracker confirms it is absent (and unbuilt)

The `up-banking/api` repo is first-party (Up maintains it and staff respond there). Relevant threads:

- **[#68 "Modifying Savers and Auto Transfers"](https://github.com/up-banking/api/issues/68)** (open) —
  requests API to read/modify "auto-transfer amounts into savers" and "auto-transfer frequency".
  Up staff reply (`d11wtq`, `CONTRIBUTOR`, 2020-11-03): *"Exposing and managing Savers is definitely
  planned 👍"*. Still open, last +1 June 2024.
- **[#134 "Expose Payments and Savers Information"](https://github.com/up-banking/api/issues/134)** (open) —
  opener: *"My wife and I have a fairly complex system of payment splits and a large number of saver
  accounts with auto transfers to manage how our pay is distributed and categorised … I'd love to have
  this information exposed in the API so that I can do some validation and error checking on how I've
  set things up."* Up staff (`markbrown4`, `CONTRIBUTOR`): *"there are other issues requesting various
  saver / payment information. Are there specific fields you'd like to see?"* A commenter then lists
  the still-missing data: *"Auto transfers (for all accounts)"* — account name, amount, direction,
  frequency, next transfer date, pause-on-goal — plus scheduled-payment details. Nothing shipped.
- **[#132 "Transfer money between savers"](https://github.com/up-banking/api/issues/132)** (open) —
  no API to move funds between accounts at all (read-only API).
- **[#10 "Expose Savers: Goal, Name, Emoji"](https://github.com/up-banking/api/issues/10)** (open,
  marked "planned") — even Saver goal metadata is not exposed.
- **[#16 "Send Payments"](https://github.com/up-banking/api/issues/16)** (open) — the API is
  read-only; it cannot create transfers or payments.

### Changelog / release notes

There is no dated public changelog for the API. The effective change history is commits to
`up-banking/api` `v1/openapi.json`. Recent commits (through 2026-02-24) are all community
`EXAMPLES.md` edits — **no spec changes** touching savers, auto transfers, pay splitting, scheduled
payments, or new transaction attributes. `CHANGELOG.md` does not exist in the repo (404).

---

## 2. How do the resulting split transfers appear in `GET /transactions`?

Pay Splitting produces an ordinary **internal transfer** from the transactional account into the
target Saver. It is not modelled as anything special. Per the OpenAPI spec's `TransactionResource`
`attributes` and the transfer-behaviour discussion in issues #131 / #163 / #80 / #55:

| Field | Value for a pay-split transfer |
|---|---|
| `transactionType` | Free-text string. Spec description: *"A description of the transaction method used e.g. Purchase, BPAY Payment."* **`type: string, nullable: true`, no `enum`.** Internal transfers are observed as `"Transfer"`, but this is convention, not contract. |
| `description` | The Saver name on the debit side / source account on the credit side. Issue #131 describes the two halves as *"Transfer to `<name>`"* and *"Transfer from `<name>`"* (e.g. `"Transfer to Home loan deposit"`, `"Transfer from Spending"`). |
| `rawText` | `null` for internal transfers (spec: original unprocessed text, mainly for card purchases). |
| `message` | *"Attached message for this transaction, such as a payment message, or a transfer note."* May be `null` or carry a transfer note. |
| `amount` | Negative on the transactional-account side, positive on the Saver side. Spec: *"The `amount` field can be used to determine the direction of the transfer."* |
| `transferAccount` (relationship) | Spec: *"If this transaction is a transfer between accounts, this relationship will contain the account the transaction went to/came from."* Populated with the counterpart account **when that account still exists**. Issue #163: *"only current savers have a corresponding transfer account field entry"*; issue #55: once a Saver is closed the id remains in transactions but the account is no longer retrievable. **Caveat:** round-ups and "Quick save" swipe transfers have historically had `transferAccount` unset on both sides ([#80](https://github.com/up-banking/api/issues/80)) — but a scheduled pay split is a regular transfer, distinct from those. |
| `category` / `parentCategory` (relationships) | `null`. Transfers are not categorised. |
| `isCategorizable` | `false`. Spec: *"Boolean flag set to true on transactions that support the use of categories."* Transfers do not. |
| `roundUp` | `null`. Spec: *"Details of how this transaction was rounded-up. If no Round Up was applied this field will be `null`."* A pay split is not a round-up, so this is always `null`. |
| `cashback` | `null`. |
| `holdInfo` | `null` — transfers settle immediately (`status` `SETTLED`, `settledAt` set). |
| `cardPurchaseMethod` | `null`. |
| `foreignAmount` | `null`. |
| `performingCustomer` (relationship) | The customer. |
| `note` | `null` unless the user added one (Up High only). |

### Known reconciliation quirks (from Up's issue tracker)

- **[#131](https://github.com/up-banking/api/issues/131)** — round-up transfers can be missing their
  "transfer to" half; regular transfers have both halves but there is *no direct link between the two
  halves* ("if I have a 'transfer from' transaction, it has no reference to the corresponding
  'transfer to' and vice-versa"). Matching halves requires heuristics (opposite-sign amount, message
  prefix, timestamps within ~1 minute).
- **[#163](https://github.com/up-banking/api/issues/163)** — transfer transactions don't always net
  to zero across the dataset, especially once Savers are closed and their history drops out.

---

## 3. Can a consumer distinguish a pay-split-driven transfer from a manual transfer into the same Saver?

**No.**

A pay-split transfer and a manual/one-off transfer into the same Saver have the **same transaction
shape**: `transactionType` `"Transfer"`, `description` `"Transfer to <Saver>"`, `transferAccount` set,
`isCategorizable` `false`, no `roundUp`, no `cashback`. The API exposes:

- **no pay-split configuration** to correlate against (see section 1);
- **no per-transaction provenance field** — nothing like `source`, `origin`, `createdBy`,
  `automationId`, `ruleId`, `isAutomated`, or a "scheduled vs manual" flag anywhere on
  `TransactionResource`;
- **no link** between a transfer and the salary/pay credit that triggered it.

The only signals available to a consumer are weak heuristics, none authoritative:

- **Timing** — a pay split lands within seconds/minutes of an incoming salary credit (which Up
  detects internally as "pay"/"salary", but that classification is also not surfaced on the
  transaction).
- **`message` text** — may or may not be present/meaningful.
- **Amount** — matches a fixed dollar split, or a clean percentage of the pay just received.
- **Regularity** — same destination + similar amount each pay cycle.

None of these can be relied on for the 99%+ accuracy bar. If Vantura needs to treat pay-split inflows
to a Saver differently from manual top-ups, that distinction **cannot be made from the Up API** and
would require user configuration inside Vantura (e.g. the user declaring which Savers are pay-split
targets and the expected split), not data from Up.

---

## Sources (all primary / first-party)

- Up API reference — <https://developer.up.com.au/>
- Up API OpenAPI spec — <https://github.com/up-banking/api> (`v1/openapi.json`,
  <https://raw.githubusercontent.com/up-banking/api/master/v1/openapi.json>)
- Up API repo commit history (effective changelog) — <https://github.com/up-banking/api/commits/master>
- Issue #68 "Modifying Savers and Auto Transfers" — <https://github.com/up-banking/api/issues/68>
- Issue #134 "Expose Payments and Savers Information" — <https://github.com/up-banking/api/issues/134>
- Issue #132 "Transfer money between savers" — <https://github.com/up-banking/api/issues/132>
- Issue #10 "Expose Savers: Goal, Name, Emoji" — <https://github.com/up-banking/api/issues/10>
- Issue #16 "Send Payments" — <https://github.com/up-banking/api/issues/16>
- Issue #80 "transferAccount missing for quick saves/roundups" — <https://github.com/up-banking/api/issues/80>
- Issue #131 "Transfer vs Roundup inconsistency" — <https://github.com/up-banking/api/issues/131>
- Issue #163 "Query: reconciling transfers" — <https://github.com/up-banking/api/issues/163>
- Issue #55 "Closed Savers" — <https://github.com/up-banking/api/issues/55>
- Up product page "Save on auto-pilot with Pay Splitting" — <https://up.com.au/features/pay-splitting/>
  (product description only: supports 1% percentage increments and fixed dollar amounts; no API/transaction detail)
