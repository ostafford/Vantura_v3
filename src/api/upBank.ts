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
    roundUp: { amount: { value: string; valueInBaseUnits: number } } | null
    amount: { currencyCode: string; value: string; valueInBaseUnits: number }
    settledAt: string | null
    createdAt: string
  }
  relationships: {
    account: { data: { id: string } }
    category?: { data: { id: string } | null }
    parentCategory?: { data: { id: string } | null }
    transferAccount?: { data: { id: string } | null }
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

async function fetchWithAuth(
  url: string,
  token: string,
  options: RequestInit = {}
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
    throw new Error('Too many requests. Please wait a minute and try again.')
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
    const res = await fetchWithAuth(`${BASE_URL}/api/v1/accounts`, token)
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
 * Fetch all transactions in batches (HELD + SETTLED). Fetches both statuses and merges by id;
 * when the same id appears in both, the SETTLED version is kept. 1s delay between pages.
 */
export async function fetchAllTransactions(
  token: string,
  sinceDate: string | null,
  progressCallback: (progress: { fetched: number; hasMore: boolean }) => void
): Promise<UpTransaction[]> {
  const byId = new Map<string, UpTransaction>()
  const report = (fetched: number, hasMore: boolean) =>
    progressCallback({ fetched, hasMore })

  const held = await fetchTransactionsByStatus(token, sinceDate, 'HELD', (p) =>
    report(p.fetched, p.hasMore)
  )
  for (const tx of held) byId.set(tx.id, tx)
  const heldCount = byId.size

  const settled = await fetchTransactionsByStatus(
    token,
    sinceDate,
    'SETTLED',
    (p) => report(heldCount + p.fetched, p.hasMore)
  )
  for (const tx of settled) byId.set(tx.id, tx)

  return Array.from(byId.values())
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
