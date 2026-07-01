/**
 * Up Bank API client. Base URL: https://api.up.com.au
 * Auth: Bearer token. Rate limit: ~60/min; 1s delay between paginated requests.
 */

const BASE_URL = 'https://api.up.com.au'

/**
 * Thrown when the Up Bank API returns 401 (e.g. expired or revoked token).
 * UI can show specific guidance to update the token in Settings.
 */
export class UpBankUnauthorizedError extends Error {
  override name = 'UpBankUnauthorizedError'
  constructor(
    message = 'Up Bank API returned 401. Your Personal Access Token may have expired or been revoked.'
  ) {
    super(message)
    Object.setPrototypeOf(this, UpBankUnauthorizedError.prototype)
  }
}

/** Message shown when sync fails due to 401 (expired/revoked token). */
export const SYNC_401_MESSAGE =
  'Your Personal Access Token may have expired. Update it in Settings.'

/** Matches Up API AccountTypeEnum and OwnershipTypeEnum. */
export type UpAccountType = 'SAVER' | 'TRANSACTIONAL' | 'HOME_LOAN'
export type UpOwnershipType = 'INDIVIDUAL' | 'JOINT'

export interface UpAccount {
  id: string
  type: string
  attributes: {
    displayName: string
    accountType: UpAccountType
    ownershipType?: UpOwnershipType
    balance: { value: string; valueInBaseUnits: number }
    createdAt: string
  }
}

export interface UpTransaction {
  id: string
  type: string
  attributes: {
    status: string
    rawText: string | null
    description: string
    message: string | null
    isCategorizable: boolean
    transactionType: string | null
    deepLinkURL: string | null
    roundUp: {
      amount: { value: string; valueInBaseUnits: number }
      boostPortion: { value: string; valueInBaseUnits: number } | null
    } | null
    cashback: {
      description: string
      amount: { currencyCode: string; value: string; valueInBaseUnits: number }
    } | null
    amount: { currencyCode: string; value: string; valueInBaseUnits: number }
    foreignAmount: {
      currencyCode: string
      value: string
      valueInBaseUnits: number
    } | null
    holdInfo: {
      amount: { currencyCode: string; value: string; valueInBaseUnits: number }
      foreignAmount: {
        currencyCode: string
        value: string
        valueInBaseUnits: number
      } | null
    } | null
    note: { text: string } | null
    performingCustomer: { displayName: string } | null
    cardPurchaseMethod: {
      method: string
      cardNumberSuffix: string | null
    } | null
    settledAt: string | null
    createdAt: string
  }
  relationships: {
    account: { data: { id: string } }
    category?: { data: { id: string } | null }
    parentCategory?: { data: { id: string } | null }
    transferAccount?: { data: { id: string } | null }
    roundUp?: { data: { type: string; id: string } | null }
    tags?: { data: Array<{ type: string; id: string }> }
    attachment?: { data: { type: string; id: string } | null }
  }
}

export interface UpCategory {
  id: string
  type: string
  attributes: { name: string }
  relationships?: { parent?: { data: { id: string } | null } }
}

interface UpListResponse<T> {
  data: T[]
  links?: { next?: string | null; prev?: string | null }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MAX_429_RETRIES = 3
const MAX_RETRY_WAIT_MS = 30_000

/**
 * Fetch with auth. On 429, retries with backoff (honouring Retry-After if present,
 * capped at MAX_RETRY_WAIT_MS so a large server-supplied value can't stall the caller
 * indefinitely) instead of failing immediately — needed since HELD/SETTLED transaction
 * pages, and locally-HELD transaction lookups, are now fetched concurrently, which can
 * occasionally trip the rate limit. `attempt` counts retries used so far (0 on the
 * first call), independent of MAX_429_RETRIES, so the backoff sequence (2s, 4s, 6s...)
 * stays correct regardless of the configured retry limit.
 */
async function fetchWithAuth(
  url: string,
  token: string,
  options: RequestInit = {},
  attempt = 0
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 429) {
    if (attempt >= MAX_429_RETRIES) {
      throw new Error('Too many requests. Please wait a minute and try again.')
    }
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfterSecs = retryAfterHeader ? Number(retryAfterHeader) : NaN
    const waitMs = Math.min(
      Number.isFinite(retryAfterSecs) && retryAfterSecs > 0
        ? retryAfterSecs * 1000
        : 2000 * (attempt + 1), // 2s, 4s, 6s
      MAX_RETRY_WAIT_MS
    )
    await sleep(waitMs)
    return fetchWithAuth(url, token, options, attempt + 1)
  }
  if (res.status === 401) {
    throw new UpBankUnauthorizedError()
  }
  return res
}

/**
 * Validate token by fetching accounts. Returns false on 401 (for onboarding);
 * throws UpBankUnauthorizedError is not used here so callers get boolean.
 */
export async function validateUpBankToken(token: string): Promise<boolean> {
  try {
    const res = await fetchWithAuth(`${BASE_URL}/api/v1/util/ping`, token)
    if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
    return true
  } catch (e) {
    if (e instanceof UpBankUnauthorizedError) return false
    throw e
  }
}

const ACCOUNTS_PAGE_SIZE = 100

function buildAccountsUrl(): string {
  const params = new URLSearchParams()
  params.set('page[size]', String(ACCOUNTS_PAGE_SIZE))
  return `${BASE_URL}/api/v1/accounts?${params.toString()}`
}

/**
 * Fetch one page of accounts. Use `links.next` for the next URL.
 */
export async function fetchAccountsPage(
  token: string,
  url: string
): Promise<{ data: UpAccount[]; nextUrl: string | null }> {
  const res = await fetchWithAuth(url, token)
  if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
  const json = (await res.json()) as UpListResponse<UpAccount>
  const nextUrl = json.links?.next ?? null
  return { data: json.data ?? [], nextUrl }
}

/**
 * Fetch all accounts (cursor pagination, 1s delay between pages; same pattern as transactions).
 */
export async function fetchAccounts(token: string): Promise<UpAccount[]> {
  const all: UpAccount[] = []
  let nextUrl: string | null = buildAccountsUrl()
  while (nextUrl) {
    const { data, nextUrl: next } = await fetchAccountsPage(token, nextUrl)
    all.push(...data)
    nextUrl = next
    if (nextUrl) await sleep(1000)
  }
  return all
}

/**
 * Build initial transactions URL. sinceDate null = all time.
 * statusFilter: Up API filter; when set, only that status (HELD or SETTLED) is returned.
 */
function buildTransactionsUrl(
  sinceDate: string | null,
  pageSize: number,
  statusFilter?: 'HELD' | 'SETTLED'
): string {
  const params = new URLSearchParams()
  params.set('page[size]', String(pageSize))
  if (sinceDate) params.set('filter[since]', sinceDate)
  if (statusFilter) params.set('filter[status]', statusFilter)
  return `${BASE_URL}/api/v1/transactions?${params.toString()}`
}

/**
 * Fetch one page of transactions. Pass nextUrl from links.next for pagination.
 */
export async function fetchTransactionsPage(
  token: string,
  url: string
): Promise<{ data: UpTransaction[]; nextUrl: string | null }> {
  const res = await fetchWithAuth(url, token)
  if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
  const json = (await res.json()) as UpListResponse<UpTransaction>
  const nextUrl = json.links?.next ?? null
  return { data: json.data ?? [], nextUrl }
}

/**
 * Fetch all transactions for one status (cursor-based). 1s delay between requests.
 */
async function fetchTransactionsByStatus(
  token: string,
  sinceDate: string | null,
  statusFilter: 'HELD' | 'SETTLED',
  progressCallback: (progress: { fetched: number; hasMore: boolean }) => void
): Promise<UpTransaction[]> {
  const all: UpTransaction[] = []
  let nextUrl: string | null = buildTransactionsUrl(
    sinceDate,
    100,
    statusFilter
  )
  while (nextUrl) {
    const { data, nextUrl: next } = await fetchTransactionsPage(token, nextUrl)
    all.push(...data)
    progressCallback({ fetched: all.length, hasMore: next !== null })
    nextUrl = next
    if (nextUrl) await sleep(1000)
  }
  return all
}

/**
 * Fetch all transactions in batches (HELD + SETTLED). The two statuses are fetched
 * concurrently (each still paced 1s/page to stay within the rate limit) rather than
 * one after the other — HELD is normally a handful of pages, so running it alongside
 * SETTLED means it no longer adds its own serial wait on top of the (much larger)
 * SETTLED history. Results are merged by id; when the same id appears in both, the
 * SETTLED version is kept (settled is applied to the map after held, same as before).
 */
export async function fetchAllTransactions(
  token: string,
  sinceDate: string | null,
  progressCallback: (progress: { fetched: number; hasMore: boolean }) => void
): Promise<UpTransaction[]> {
  const byId = new Map<string, UpTransaction>()
  let heldFetched = 0
  let settledFetched = 0
  let heldHasMore = true
  let settledHasMore = true
  const report = () =>
    progressCallback({
      fetched: heldFetched + settledFetched,
      hasMore: heldHasMore || settledHasMore,
    })

  const [held, settled] = await Promise.all([
    fetchTransactionsByStatus(token, sinceDate, 'HELD', (p) => {
      heldFetched = p.fetched
      heldHasMore = p.hasMore
      report()
    }),
    fetchTransactionsByStatus(token, sinceDate, 'SETTLED', (p) => {
      settledFetched = p.fetched
      settledHasMore = p.hasMore
      report()
    }),
  ])

  for (const tx of held) byId.set(tx.id, tx)
  for (const tx of settled) byId.set(tx.id, tx)

  return Array.from(byId.values())
}

interface UpSingleResponse<T> {
  data: T
}

/**
 * Fetch a single transaction by id. Used to resolve locally-HELD transactions (check
 * whether they've settled, or picked up a category change) without a full history
 * re-sync. Returns null on 404 (e.g. an authorization hold that was later voided and
 * no longer exists on Up's side) rather than throwing, so callers can skip it.
 */
export async function fetchTransactionById(
  token: string,
  id: string
): Promise<UpTransaction | null> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/v1/transactions/${id}`,
    token
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
  const json = (await res.json()) as UpSingleResponse<UpTransaction>
  return json.data
}

/**
 * Fetch all categories.
 */
export async function fetchCategories(token: string): Promise<UpCategory[]> {
  const res = await fetchWithAuth(`${BASE_URL}/api/v1/categories`, token)
  if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
  const json = (await res.json()) as UpListResponse<UpCategory>
  return json.data ?? []
}

/** In the Up API, a tag's id is the label itself (e.g. "Holiday"). */
export interface UpTag {
  type: string
  id: string
}

/** Fetch all tags the user has created (cursor-paginated). */
export async function fetchTags(token: string): Promise<UpTag[]> {
  const all: UpTag[] = []
  let nextUrl: string | null = `${BASE_URL}/api/v1/tags?page[size]=100`
  while (nextUrl) {
    const res = await fetchWithAuth(nextUrl, token)
    if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
    const json = (await res.json()) as UpListResponse<UpTag>
    all.push(...(json.data ?? []))
    nextUrl = json.links?.next ?? null
    if (nextUrl) await sleep(1000)
  }
  return all
}

/**
 * Update the category on a transaction. Pass null to remove the category.
 * Returns 204 on success.
 */
export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  token: string
): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/v1/transactions/${transactionId}/relationships/category`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: categoryId ? { type: 'categories', id: categoryId } : null,
      }),
    }
  )
  if (!res.ok) throw new Error(`Up Bank API error: ${res.status}`)
}

/**
 * Associate tags with a transaction. tagIds are the tag labels (Up uses label as id).
 * Max 6 tags per transaction. Returns 204 on success.
 */
export async function addTransactionTags(
  transactionId: string,
  tagIds: string[],
  token: string
): Promise<void> {
  if (tagIds.length === 0) return
  const res = await fetchWithAuth(
    `${BASE_URL}/api/v1/transactions/${transactionId}/relationships/tags`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        data: tagIds.map((id) => ({ type: 'tags', id })),
      }),
    }
  )
  if (res.status !== 204) throw new Error(`Up Bank API error: ${res.status}`)
}

/**
 * Remove tags from a transaction. Returns 204 on success.
 */
export async function removeTransactionTags(
  transactionId: string,
  tagIds: string[],
  token: string
): Promise<void> {
  if (tagIds.length === 0) return
  const res = await fetchWithAuth(
    `${BASE_URL}/api/v1/transactions/${transactionId}/relationships/tags`,
    token,
    {
      method: 'DELETE',
      body: JSON.stringify({
        data: tagIds.map((id) => ({ type: 'tags', id })),
      }),
    }
  )
  if (res.status !== 204) throw new Error(`Up Bank API error: ${res.status}`)
}
