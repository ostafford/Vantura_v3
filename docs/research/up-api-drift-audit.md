# Up Bank API drift audit vs `src/api/upBank.ts` + `src/services/sync.ts`

**Ticket:** ostafford/Vantura_v3#82 (part of #78) · **Date:** 2026-09-08 · **Branch:** `research/up-api-drift-audit`

## Scope

Full sweep of the current Up Bank API reference against everything Vantura models in
`src/api/upBank.ts` and consumes in `src/services/sync.ts`. For every area: `matches Vantura`
/ `drifted` / `new — not modelled`, plus whether the gap is material to the Spendable / money
model or cosmetic.

## Primary sources

| Source | What it is | Currency |
| --- | --- | --- |
| <https://developer.up.com.au/> | Live hosted reference (single-page). **Ground truth.** | Continuously updated |
| <https://raw.githubusercontent.com/up-banking/api/master/v1/openapi.json> | Machine-readable OpenAPI 3.0.3 spec, `up-banking/api` repo | **Stale** — last content change 2024-08-06 (commits `b173ae0e7`, `7fc11add0`); confirmed lagging live docs (issue [#170](https://github.com/up-banking/api/issues/170), [#172](https://github.com/up-banking/api/issues/172)) |
| <https://github.com/up-banking/api/issues/31> | The official "🚀 Up API Changelog" issue thread | Last entry 2024-07-04 |
| `up-banking/api` issues (rate limit, spec bugs) | Contributor answers from Up staff (`d11wtq`, `markbrown4`) | Cited inline |

> Note on method: the GitHub `openapi.json` and the live docs **disagree** in two places
> (`deepLinkURL`, `format: int64`). Where they disagree, the live reference at
> developer.up.com.au wins — the OpenAPI file in the repo is a hand-updated snapshot that
> Up admits it lets drift (issue [#170](https://github.com/up-banking/api/issues/170)).

---

## Summary verdict

**No material money-model drift.** Every field the Spendable calculation and balance logic
depend on — `amount` / `valueInBaseUnits`, `foreignAmount`, `holdInfo`, `roundUp`,
`cashback`, `status` (HELD/SETTLED), account `balance`, `accountType`, `ownershipType` —
matches the current API exactly. No new `accountType`, `ownershipType`, or
`transactionStatus` enum values. All identified drift is cosmetic, dead code, or an
un-built feature surface.

Highlights:

- **Cosmetic / dead code:** Vantura models a `relationships.roundUp` on transactions that
  the current API does not define (always resolves to `null`).
- **Stale in-code comment:** `upBank.ts` says "Rate limit: ~60/min"; Up staff describe it
  as ~1000 requests/hour bucketed hourly (issue [#167](https://github.com/up-banking/api/issues/167)).
- **Un-modelled surfaces (all non-money, mostly by design):** `/attachments`, the whole
  webhooks family, and the single-resource `GET` endpoints (`/accounts/{id}`,
  `/categories/{id}`, `/accounts/{accountId}/transactions`).

---

## Drift table

| Area | Vantura today | API today | Verdict | Material to money model? |
| --- | --- | --- | --- | --- |
| **`accountType` enum** | `'SAVER' \| 'TRANSACTIONAL' \| 'HOME_LOAN'` (`UpAccountType`) | `AccountTypeEnum` = `SAVER`, `TRANSACTIONAL`, `HOME_LOAN` — docs say "Currently returned values are `SAVER`, `TRANSACTIONAL` and `HOME_LOAN`" | **matches Vantura** — no new values | No |
| **`ownershipType` enum** | `'INDIVIDUAL' \| 'JOINT'` (`UpOwnershipType`), stored optional | `OwnershipTypeEnum` = `INDIVIDUAL`, `JOINT`; added for 2Up (changelog 2022-01-09). Marked `required` in the OpenAPI `AccountResource`, but Vantura treating it as optional is harmless | **matches Vantura** | No |
| **Account attributes** | `displayName`, `accountType`, `ownershipType?`, `balance.{value,valueInBaseUnits}`, `createdAt` | `displayName`, `accountType`, `ownershipType`, `balance` (MoneyObject), `createdAt`. Relationship: `transactions` (link only) | **matches Vantura** — every attribute consumed. `balance` currency code not read (savers/txn always AUD) | No |
| ↳ account `createdAt` reliability | Stored verbatim into `accounts.created_at` | Known API bug: wrong/placeholder `createdAt` for Savers on `GET /accounts` (issues [#157](https://github.com/up-banking/api/issues/157), [#160](https://github.com/up-banking/api/issues/160), still open) | **drifted — upstream bug**, not a schema change. Any Vantura feature keying off saver account age is exposed to it | No (not used in Spendable) |
| **`MoneyObject`** | `{ currencyCode, value, valueInBaseUnits }`; reads `valueInBaseUnits` as JS `number` | Same shape. `valueInBaseUnits` documented as "64-bit integer" but the OpenAPI spec still omits `format: int64` (issue [#172](https://github.com/up-banking/api/issues/172), labelled `planned`) | **matches Vantura** — AUD cent values are far under 2^53, JS `number` is safe | No |
| **Transaction `status`** | `status: string` (loose), logic branches on `'HELD'` / `'SETTLED'` | `TransactionStatusEnum` = `HELD`, `SETTLED` only | **matches Vantura** (loose typing, correct handling) | No |
| **`holdInfo`** | `{ amount: Money, foreignAmount: Money \| null } \| null` | `HoldInfoObject` = `{ amount, foreignAmount }`, nullable; present if txn "is currently in `HELD`, **or was ever** in `HELD`" | **matches Vantura** | No |
| **`roundUp` (attribute)** | `{ amount: Money, boostPortion: Money \| null } \| null`; both `valueInBaseUnits` persisted | `RoundUpObject` = `{ amount, boostPortion }`, amount negative, `boostPortion` nullable | **matches Vantura** | No |
| **`cashback`** | `{ description: string, amount: Money } \| null` | `CashbackObject` = `{ description, amount }` (amount positive) | **matches Vantura** | No |
| **`foreignAmount`** | `{ currencyCode, value, valueInBaseUnits } \| null` | MoneyObject, nullable, `null` for domestic | **matches Vantura** | No |
| **`cardPurchaseMethod`** | `{ method: string, cardNumberSuffix: string \| null } \| null` | `CardPurchaseMethodObject` = `{ method: CardPurchaseMethodEnum, cardNumberSuffix }`. Enum: `BAR_CODE`, `OCR`, `CARD_PIN`, `CARD_DETAILS`, `CARD_ON_FILE`, `ECOMMERCE`, `MAGNETIC_STRIPE`, `CONTACTLESS` | **matches Vantura** — `method` stored as raw string, not narrowed to the 8-value union. Not a bug; tighten the type only if a consumer needs it | No |
| **`transactionType`** | `string \| null`, stored opaque | `string`, nullable, free text ("Purchase", "BPAY Payment", …) — **no enum**. Added changelog 2024-07-03 | **matches Vantura** — correct to treat as opaque string | No |
| **`note`** | `{ text: string } \| null` | `NoteObject` = `{ text }`, nullable, "Up High subscribers only". Added changelog 2024-07-03 | **matches Vantura** | No |
| **`performingCustomer`** | `{ displayName: string } \| null` | `CustomerObject` = `{ displayName }`, nullable, "customer who initiated" (2Up). Added changelog 2024-07-03 | **matches Vantura** | No |
| **`deepLinkURL`** | `deepLinkURL: string \| null`, persisted to `transactions.deep_link_url` | Present in **live docs** (changelog 2024-07-03, "link directly to the receipt screen in-app"). **Absent from the GitHub `openapi.json`** (issue [#170](https://github.com/up-banking/api/issues/170), PR [#150](https://github.com/up-banking/api/pull/150) closed unmerged) | **matches Vantura** — Vantura is *ahead of* the stale OpenAPI file and correct against live | No |
| **`isCategorizable`** | `boolean` | `boolean` | **matches Vantura** | No |
| **`rawText` / `description` / `message` / `settledAt` / `createdAt`** | modelled, persisted | unchanged | **matches Vantura** | No |
| **Transaction relationships — `account`, `transferAccount`, `category`, `parentCategory`, `tags`** | all modelled and consumed | `account`, `transferAccount` (nullable data), `category` (nullable), `parentCategory` (nullable), `tags` (array) | **matches Vantura** | No |
| **Transaction relationship — `attachment`** | Typed in `UpTransaction.relationships.attachment` **but never consumed** in `sync.ts` (no column, no fetch) | `attachment` relationship, nullable; added changelog 2024-07-04 | **new — partially modelled, not consumed.** No `/attachments` wrapper (see below) | No |
| **Transaction relationship — `roundUp`** | Typed **and read**: `rel?.roundUp?.data?.id` → `transactions.round_up_parent_id` | **Not defined by the current API.** Live docs list transaction relationships as `account`, `transferAccount`, `category`, `parentCategory`, `tags`, `attachment` — no `roundUp`. OpenAPI `TransactionResource.relationships.required` = same six, no `roundUp` | **drifted — Vantura models a relationship the reference doesn't define.** Resolves to `null` on every real payload, so `round_up_parent_id` is always `null`. Cosmetic / dead code — safe to delete | No (always null) |
| **`GET /transactions` query params** | Uses `page[size]`, `filter[since]`, `filter[status]` | `page[size]` (≤100), `filter[status]`, `filter[since]`, `filter[until]`, `filter[category]`, `filter[tag]` | **matches Vantura** for what it uses. `filter[until]` / `filter[category]` / `filter[tag]` unused — Vantura fetches broadly and filters locally, by design | No |
| ↳ incremental-sync limitation | `filter[since]` matches on `createdAt`, so edits to old transactions are missed; worked around by `resolveHeldTransactions()` re-fetching HELD txns by id | Still **no `updatedAt` / last-modified filter** (feature request issue [#179](https://github.com/up-banking/api/issues/179), open, not shipped) | **matches Vantura** — the workaround is still required; no API change to adopt | No (workaround already in place) |
| **`GET /accounts` query params** | none (fetches all, `page[size]=100`) | `page[size]`, `filter[accountType]`, `filter[ownershipType]` (changelog 2022-01-09) | **matches Vantura** — server-side filters unused by choice | No |
| **Categories endpoint** | `GET /api/v1/categories`, reads `attributes.name` + `relationships.parent.data.id` | `GET /categories` + `GET /categories/{id}`. `CategoryResource.attributes` = `name` only; relationships `parent`, `children` | **matches Vantura** — `children` ignored (derivable), `GET /categories/{id}` unused (full list is fetched) | No |
| **Tags endpoint** | `GET /api/v1/tags` (cursor-paginated), `UpTag = { type, id }` (id = label) | `GET /tags`; `TagResource` has no attributes, id is the label; relationship `transactions` | **matches Vantura** | No |
| **Category write** | `PATCH /transactions/{id}/relationships/category`, body `{ data: {type:'categories', id} \| null }` | Identical | **matches Vantura** | No |
| **Tag write** | `POST` / `DELETE /transactions/{id}/relationships/tags`, `data: [{type:'tags', id}]`; expects 204 | Identical; docs note **max 6 tags per transaction** | **matches Vantura** (6-tag cap already noted in code comment) | No |
| **`GET /util/ping`** | Used by `validateUpBankToken()` | `GET /util/ping` | **matches Vantura** | No |
| **Pagination model** | `links.next` followed until null; `page[size]=100`; `UpListResponse.links.{next,prev}` | Cursor / opaque-URL pagination; `page[size]` "constrained to an upper limit of `100`"; follow `next` until `null` | **matches Vantura** | No |
| ↳ `page[before]` / `page[after]` | not used | Claimed valid but **undocumented** — only source is closed PR [#150](https://github.com/up-banking/api/pull/150); live docs describe only `next`/`prev`. Treat as unverified | **new — unverified, not needed** (Vantura only paginates forward) | No |
| **Rate limiting** | Code comment: "Rate limit: ~60/min; 1s delay between paginated requests." Handles `429` with `Retry-After` (capped 30s) + `2s/4s/6s` backoff, 3 retries | Docs: `429` "Too many requests… ideally with exponential backoff"; `X-RateLimit-Remaining` header on 429. **No published numeric limit in the docs.** Up staff (issue [#167](https://github.com/up-banking/api/issues/167)): "a per-hour limit… hours are bucketed" — ~1000 req/hour | **drifted — in-code comment is inaccurate.** Behaviour is fine (conservative 1s pacing + backoff both work under an hourly bucket), but the "~60/min" note should be corrected, and Vantura could optionally read `X-RateLimit-Remaining`. `Retry-After` is honoured but not actually documented by Up | No (behaviour safe) |
| **Idempotency** | None; relies on local `INSERT OR REPLACE` upserts being idempotent | API exposes **no** idempotency keys / no write endpoints that need them (only category & tag relationship writes, which are naturally idempotent) | **matches Vantura** (N/A) | No |
| **Attachments API** (`GET /attachments`, `GET /attachments/{id}`) | **Absent from `upBank.ts`.** No wrapper, no consumption | `AttachmentResource.attributes` = `createdAt`, `fileURL` (temp link), `fileURLExpiresAt`, `fileExtension`, `fileContentType`; relationship `transaction`. Read-only (attachments are created in-app). Changelog 2024-07-04 | **new — not modelled.** Candidate feature (show receipt thumbnails), not a defect | No |
| **Webhooks API** (`GET/POST /webhooks`, `GET/DELETE /webhooks/{id}`, `POST /webhooks/{id}/ping`, `GET /webhooks/{id}/logs`) | **Entirely absent** from `upBank.ts` | Full family present. `WebhookEventTypeEnum` = `TRANSACTION_CREATED`, `TRANSACTION_SETTLED`, `TRANSACTION_DELETED`, `PING`. `WebhookDeliveryStatusEnum` = `DELIVERED`, `UNDELIVERABLE`, `BAD_RESPONSE_CODE`. Callbacks signed with `X-Up-Authenticity-Signature` (SHA-256 HMAC of body using `secretKey`, returned once on create). Event payload: `webhook-events` resource with `attributes.eventType` + `attributes.createdAt`, relationships `webhook` + `transaction`. Requested-but-unshipped: `TRANSACTION_UPDATED` (issue [#174](https://github.com/up-banking/api/issues/174), open) | **new — not modelled, by design.** Vantura is local-first / serverless (CLAUDE.md) with no endpoint to receive callbacks. Documented here only for completeness | No |
| **Single-resource GET endpoints** — `GET /accounts/{id}`, `GET /categories/{id}`, `GET /accounts/{accountId}/transactions` | Not wrapped (`GET /transactions/{id}` **is** wrapped, via `fetchTransactionById`) | All exist | **new — not modelled.** Not needed by current sync design (bulk list + local filter). `GET /accounts/{accountId}/transactions` has a known quirk: includes unrelated Maybuy txns (issue [#148](https://github.com/up-banking/api/issues/148), open) | No |
| **Error object shape** | Ad-hoc `throw new Error(\`Up Bank API error: ${res.status}\`)`; dedicated `UpBankUnauthorizedError` for 401 | `ErrorResponse` = `{ errors: [{ status, title, detail, source? }] }` | **drifted — cosmetic.** Vantura discards the structured `errors[].detail`; surfacing it would improve error messages. No behavioural impact | No |

---

## Changelog timeline (issue #31, verbatim gist) — all already absorbed by Vantura except where noted

| Date | Change | Vantura status |
| --- | --- | --- |
| 2020-08-06 | Tags added (`/tags`, `filter[tag]`, tag relationship, add/remove tags) | Modelled |
| 2020-08-15 | Categories added (`/categories`, `category` + `parentCategory` relationships) | Modelled |
| 2020-08-21 | Saver emoji in `displayName`; `filter[status]` on transactions | Modelled (`filter[status]` used) |
| 2020-09-04 | `filter[category]` on transactions | Not used (local filter) |
| 2022-01-09 | 2Up accounts in API; `ownershipType` added; `filter[accountType]` / `filter[ownershipType]` | `ownershipType` modelled |
| 2022-01-13 | `PATCH …/relationships/category` (categorize / de-categorize) | Modelled |
| 2022-01-21 | Bugfix: `filter[tag]` now returns matching payments | n/a |
| 2024-07-03 | New txn fields: `performingCustomer`, `deepLinkURL`, `transactionType`, `note`; in-app PAT management | **All four modelled** |
| 2024-07-04 | Optional `attachment` relationship on transactions; `/attachments` + `/attachments/{id}` | Relationship typed but **not consumed**; endpoints **not wrapped** |

No changelog entries after 2024-07-04. Post-2024 activity in `up-banking/api` is spec-file
fixes (`format: int64`, `deepLinkURL` missing from JSON) and open feature requests
(`updatedAt` filter #179, `TRANSACTION_UPDATED` webhook #174, statements #60, send payments
#16) — **none shipped**.

---

## Recommended amendment tickets (for #78 to spawn)

1. **Cosmetic / cleanup** — remove the `relationships.roundUp` member from `UpTransaction`
   and the `round_up_parent_id` derivation in `sync.ts` (`rel?.roundUp?.data?.id`). The
   current API has no such relationship; the column is always `null`. *(Confirm the
   `round_up_parent_id` column has no downstream reader before dropping it.)*
2. **Cosmetic** — fix the `upBank.ts` header comment: rate limit is an hourly bucket
   (~1000 req/hr per Up staff, issue #167), not "~60/min". Optionally consume
   `X-RateLimit-Remaining` to pace proactively.
3. **Cosmetic** — parse `ErrorResponse.errors[].detail` and include it in thrown error
   messages instead of only the HTTP status.
4. **Feature (optional, non-money)** — model `/attachments` + the `attachment` relationship
   to show receipt images on transactions.
5. **Type tightening (optional)** — narrow `cardPurchaseMethod.method` to the
   `CardPurchaseMethodEnum` union if any consumer switches on it.
6. **No action** — webhooks (architecturally out of scope for a serverless local-first
   app); `filter[until|category|tag]` and single-resource GETs (bulk-list design is
   deliberate); `updatedAt` filter (not shipped — `resolveHeldTransactions` workaround
   stays).

## Bottom line

The wrapper is **accurate against the live API for everything that touches money**. Drift
is limited to one piece of dead code (`roundUp` relationship), one stale code comment
(rate limit), cosmetic error-handling, and deliberately-unbuilt surfaces (attachments,
webhooks). Nothing here changes a Spendable figure.
