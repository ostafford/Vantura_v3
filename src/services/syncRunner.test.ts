import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  token: 'tok' as string | null,
  performSync: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => mocks.settings[key] ?? null,
}))
vi.mock('@/services/sync', () => ({ performSync: mocks.performSync }))
vi.mock('@/stores/sessionStore', () => ({
  sessionStore: { getState: () => ({ getToken: () => mocks.token }) },
}))
vi.mock('@/stores/toastStore', () => ({
  toast: { error: mocks.toastError },
}))

const { isSyncStale, runSync, autoSyncIfStale, STALE_SYNC_THRESHOLD_MS } =
  await import('./syncRunner')
const { syncStore } = await import('@/stores/syncStore')
const { UpBankUnauthorizedError, SYNC_401_MESSAGE } =
  await import('@/api/upBank')

const NOW = Date.parse('2026-10-24T03:00:00.000Z')

beforeEach(() => {
  for (const k of Object.keys(mocks.settings)) delete mocks.settings[k]
  mocks.token = 'tok'
  mocks.performSync.mockReset().mockResolvedValue(undefined)
  mocks.toastError.mockReset()
  syncStore.setState({ syncing: false, lastSyncCompletedAt: null })
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

describe('isSyncStale', () => {
  it('is stale with no sync recorded', () => {
    expect(isSyncStale(null, NOW)).toBe(true)
  })

  it('is fresh just under 30 minutes', () => {
    const at = new Date(NOW - STALE_SYNC_THRESHOLD_MS + 1000).toISOString()
    expect(isSyncStale(at, NOW)).toBe(false)
  })

  it('is stale at exactly 30 minutes', () => {
    const at = new Date(NOW - STALE_SYNC_THRESHOLD_MS).toISOString()
    expect(isSyncStale(at, NOW)).toBe(true)
  })

  it('is stale when last_sync is unparseable', () => {
    expect(isSyncStale('not a date', NOW)).toBe(true)
  })
})

describe('runSync', () => {
  it('runs a sync and signals completion', async () => {
    await expect(runSync('tok')).resolves.toBe('ran')
    expect(mocks.performSync).toHaveBeenCalledOnce()
    expect(syncStore.getState().lastSyncCompletedAt).toBe(NOW)
    expect(syncStore.getState().syncing).toBe(false)
  })

  it('skips when another sync is already running', async () => {
    syncStore.setState({ syncing: true })
    await expect(runSync('tok')).resolves.toBe('skipped')
    expect(mocks.performSync).not.toHaveBeenCalled()
  })

  it('a second call while the first is in flight is skipped', async () => {
    let finish!: () => void
    mocks.performSync.mockReturnValue(new Promise<void>((r) => (finish = r)))
    const first = runSync('tok')
    await expect(runSync('tok')).resolves.toBe('skipped')
    finish()
    await expect(first).resolves.toBe('ran')
    expect(mocks.performSync).toHaveBeenCalledOnce()
  })

  it('clears syncing and rethrows on failure', async () => {
    mocks.performSync.mockRejectedValue(new Error('boom'))
    await expect(runSync('tok')).rejects.toThrow('boom')
    expect(syncStore.getState().syncing).toBe(false)
    expect(syncStore.getState().lastSyncCompletedAt).toBeNull()
  })
})

describe('autoSyncIfStale', () => {
  it('syncs when data is stale', async () => {
    mocks.settings['last_sync'] = new Date(NOW - 31 * 60_000).toISOString()
    await autoSyncIfStale()
    expect(mocks.performSync).toHaveBeenCalledOnce()
  })

  it('does nothing when data is fresh', async () => {
    mocks.settings['last_sync'] = new Date(NOW - 5 * 60_000).toISOString()
    await autoSyncIfStale()
    expect(mocks.performSync).not.toHaveBeenCalled()
  })

  it('does nothing in demo mode or without a token', async () => {
    mocks.settings['demo_mode'] = '1'
    await autoSyncIfStale()
    delete mocks.settings['demo_mode']
    mocks.token = null
    await autoSyncIfStale()
    expect(mocks.performSync).not.toHaveBeenCalled()
  })

  it('stays quiet on a network failure', async () => {
    mocks.performSync.mockRejectedValue(new Error('Failed to fetch'))
    await expect(autoSyncIfStale()).resolves.toBeUndefined()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('stops retrying a rejected token, so the message shows once', async () => {
    mocks.token = 'revoked'
    mocks.performSync.mockRejectedValue(new UpBankUnauthorizedError())
    await autoSyncIfStale()
    await autoSyncIfStale()
    expect(mocks.performSync).toHaveBeenCalledOnce()
    expect(mocks.toastError).toHaveBeenCalledOnce()
  })

  it('resumes once the token changes', async () => {
    mocks.token = 'revoked-2'
    mocks.performSync.mockRejectedValueOnce(new UpBankUnauthorizedError())
    await autoSyncIfStale()
    mocks.token = 'new-token'
    await autoSyncIfStale()
    expect(mocks.performSync).toHaveBeenCalledTimes(2)
  })

  it('shows the token message on a 401, since it never fixes itself', async () => {
    // Own token string: a rejected token is remembered for the module's life.
    mocks.token = 'revoked-3'
    mocks.performSync.mockRejectedValue(new UpBankUnauthorizedError())
    await autoSyncIfStale()
    expect(mocks.toastError).toHaveBeenCalledWith(SYNC_401_MESSAGE)
  })
})
