# Does the Up Bank API expose "Regulars"?

**Ticket:** ostafford/Vantura_v3#80
**Researched:** 2026-09-08
**Question:** Does the Up Bank API expose Regulars (the user's recurring-bill
definitions that Essentials is built on) in any form — a dedicated endpoint, an
expansion on `/accounts`, attributes on transactions, or anything else? Or are
Regulars entirely app-only with no API surface?

---

## Answer

**No. Regulars are entirely app-only. The public Up API (v1) has no surface for
them** — no endpoint, no `/accounts` or `/transactions` expansion, no attribute
or relationship on any resource, nothing in webhooks. The API changelog does
**not** signal Regulars (or Essentials, or recurring/upcoming payments) as
planned, and Up has stated the developer API is in maintenance mode with no
active development.

---

## What "Regulars" are (product context)

- In the Up app you press-and-hold a recurring transaction in the Activity feed
  and tap **Create Regular**. Regulars are "subscriptions, direct debits and
  other recurring expenses", each with a period (weekly / monthly / yearly).
  Source: <https://up.com.au/blog/essentials/>
- **Essentials** brings bills together, keeps bill money separate, and "uses your
  Pay Day and Regulars to work out how much to put aside for bills". Essentials
  is the final feature moving from Up High into Up on **1 September 2026**.
  Sources: <https://up.com.au/blog/essentials/>,
  <https://up.com.au/blog/freeing-essentials/>

Both are app features. Neither appears anywhere in the API.

---

## Evidence from primary sources

### 1. OpenAPI specification — no Regulars anywhere

Repo: `up-banking/api`, file `v1/openapi.json`.
- Spec last changed in commit `7fc11add01b5ccd154533d59684b79103e14ef8b`
  ("Update openapi.json", 2024-08-06). Repo HEAD
  `b7469e4530f9f714e805d87cd5de88e3b2cfcb59` (2026-02-25) only edited
  `community/EXAMPLES.md`.
- Source: <https://github.com/up-banking/api/blob/master/v1/openapi.json>,
  rendered at <https://developer.up.com.au/>

**Every path in the spec:**

```
GET   /accounts
GET   /accounts/{id}
GET   /accounts/{accountId}/transactions
GET   /attachments
GET   /attachments/{id}
GET   /categories
GET   /categories/{id}
PATCH /transactions/{transactionId}/relationships/category
GET   /tags
POST  /transactions/{transactionId}/relationships/tags
DEL   /transactions/{transactionId}/relationships/tags
GET   /transactions
GET   /transactions/{id}
GET   /util/ping
GET   /webhooks
POST  /webhooks
GET   /webhooks/{id}
DEL   /webhooks/{id}
POST  /webhooks/{webhookId}/ping
GET   /webhooks/{webhookId}/logs
```

No `regulars`, `recurring`, `essentials`, `subscriptions`, `scheduled`,
`upcoming`, `payments`, or `auto-transfers` endpoint.

**`AccountResource.attributes`:** `displayName`, `accountType`
(`SAVER` | `TRANSACTIONAL` | `HOME_LOAN`), `ownershipType`, `balance`,
`createdAt`. Only relationship: `transactions`. There is no expansion / `include`
mechanism in the API at all — no way to inflate an account with recurring-bill
data.

**`TransactionResource.attributes`:** `status`, `rawText`, `description`,
`message`, `isCategorizable`, `holdInfo`, `roundUp`, `cashback`, `amount`,
`foreignAmount`, `cardPurchaseMethod`, `settledAt`, `createdAt`,
`transactionType`, `note`, `performingCustomer`.
**`TransactionResource.relationships`:** `account`, `transferAccount`,
`category`, `parentCategory`, `tags`, `attachment`.
No `isRegular` / `regular` / `recurrence` / `frequency` / `dueDate` field or
relationship. `transactionType` is a free-text description of the payment method
(e.g. "Purchase", "BPAY Payment"), not a recurrence flag.

**Keyword scan of `openapi.json`** (case-insensitive occurrence counts):
`regular` 0, `recurring` 0, `essential` 0, `subscription` 0, `schedule` 0,
`upcoming` 0, `frequency` 0, `"due date"` 0, `autopay` 0, `auto transfer` 0.
(`bpay` 1 — inside the `transactionType` description.)

### 2. API changelog — Regulars not mentioned, not planned

Changelog is GitHub issue **#31** (`up-banking/api`), linked from the README and
docs. Source: <https://github.com/up-banking/api/issues/31>

Last changelog entry: 2024-07-04. The full history of entries covers: webhook
descriptions, tags, categories, category filtering, 2Up / `ownershipType`,
categorize/de-categorize, a `filter[tag]` bugfix, in-app PAT management, new
transaction fields (`performingCustomer`, `deepLinkURL`, `transactionType`,
`note`), and the `attachment` relationship. **Nothing about Regulars,
Essentials, recurring payments, or upcoming/scheduled payments.**

### 3. Stated roadmap — Regulars absent

Issue **#135** "Is the Up Bank API going to be expanded?"
(<https://github.com/up-banking/api/issues/135>). Up staff (markbrown4,
2024-03-19) listed the near-term plan and applied a `planned` label to that set:

- Transaction: Type, Deep link, Transacting Customer, Notes, Covers/Forwards
- Account: BSB, Account number, Spendable Balance
- Savers: Goal amount, emoji, name
- Merchant: Location, URL, Logo

> "Exposing Payments, Upcoming, Auto Transfers would be nice additions as well
> but haven't made the initial cut. _Sending_ Payments and Transfers ... are not
> planned at this stage."

Regulars / Essentials are not named even among the "nice additions" tier.

Current `planned`-labelled issues: #176 (notes write), #117 (Spendable Balance),
#99 (covers/forwards linkage), #88 (BSB/acc#/PayID), #19 (merchants), #10
(savers). None concern Regulars or recurring bills.

Issue **#158** (<https://github.com/up-banking/api/issues/158>), Up staff
(markbrown4, 2025-04-12):

> "Fair to say the developer API is in maintenance mode right now, no active
> development at the moment. Our focus is on other higher impact features."

### 4. The closest community request has sat open since 2020

Issue **#39 "Upcoming"** (<https://github.com/up-banking/api/issues/39>) — open
since 2020. Staff (d11wtq): "This is not currently implemented but it will most
likely be implemented in the future." A commenter in 2021 explicitly proposed
"indicate if an existing transaction was flagged as a regular, and if so what
time period ... adding an ENUM attribute to an existing data structure" — never
actioned. Latest comment 2026-05-25 is still asking for a workaround.
Issue **#118 "Expose Upcoming List"** was closed as a duplicate of #39.

No issue in the tracker even uses the words "Regulars", "recurring", or
"Essentials" — keyword searches over the repo's issues return nothing.

### 5. Auth model note

The Up API has one auth mechanism: a **Personal Access Token** presented as a
bearer token (`Authorization: Bearer up:yeah:...`), ~60 requests/min, read-only
apart from tag/category writes and webhook management. There are no OAuth scopes,
so there is no "scope" that could gate a Regulars resource even in principle.
Source: <https://developer.up.com.au/> (Getting Started / Authentication).

---

## Conclusion for Vantura

If Vantura wants Regulars-style recurring-bill data it must derive it itself from
transaction history (the community has repeatedly asked Up for exactly this and
been declined/deferred since 2020). There is no endpoint, no account expansion,
no transaction flag, and no webhook event to lean on, and nothing on Up's public
roadmap suggests that will change soon.

## Sources

- Up API reference (renders the OpenAPI spec): <https://developer.up.com.au/>
- OpenAPI spec source: <https://github.com/up-banking/api/blob/master/v1/openapi.json>
  (last substantive change commit `7fc11add01b5ccd154533d59684b79103e14ef8b`, 2024-08-06)
- API repo: <https://github.com/up-banking/api>
- API changelog: <https://github.com/up-banking/api/issues/31> (last entry 2024-07-04)
- Roadmap statement: <https://github.com/up-banking/api/issues/135>
- Maintenance-mode statement: <https://github.com/up-banking/api/issues/158>
- "Upcoming" feature request (incl. 2021 "flag transaction as a regular" proposal): <https://github.com/up-banking/api/issues/39>
- "Expose Upcoming List" (dup of #39): <https://github.com/up-banking/api/issues/118>
- Up product — Essentials & Regulars: <https://up.com.au/blog/essentials/>, <https://up.com.au/blog/freeing-essentials/>
