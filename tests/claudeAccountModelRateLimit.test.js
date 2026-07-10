// Regression test for per-model rate-limit buckets.
//
// Bug: a model-specific (weekly) 429 — originally claude-fable-5, later claude-sonnet-4-5 —
// was routed into the account-wide bucket (markAccountRateLimited -> schedulable='false'),
// taking the whole OAuth account offline so claude-opus-4-8 failed with
// "No available Claude accounts support the requested model".
//
// Fix: every model family (opus/sonnet/haiku/fable) gets its own bucket that never
// disables account-wide scheduling and never sets the general rate-limit state.

const mockStore = new Map()

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(async (id) => mockStore.get(id) || {}),
  setClaudeAccount: jest.fn(async (id, data) => {
    mockStore.set(id, { ...data })
  }),
  client: { hdel: jest.fn(async () => 1) }
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/services/tokenRefreshService', () => ({}))
jest.mock('../src/utils/tokenRefreshLogger', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({ sendAccountAnomalyNotification: jest.fn() }))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn(() => ({ catch: jest.fn() })),
  markTempUnavailable: jest.fn(() => ({ catch: jest.fn() })),
  parseRetryAfter: jest.fn(() => null)
}))
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('axios', () => ({}))

// The service constructor starts a cache-cleanup setInterval at load; unref it so the
// timer never keeps Jest alive.
const _realSetInterval = global.setInterval
global.setInterval = (fn, ms, ...args) => {
  const timer = _realSetInterval(fn, ms, ...args)
  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }
  return timer
}
const claudeAccountService = require('../src/services/account/claudeAccountService')
global.setInterval = _realSetInterval

const ACCOUNT_ID = 'acct-model-test'
const DAY = 24 * 60 * 60 * 1000
const futureTs = () => Math.floor((Date.now() + 3 * DAY) / 1000)

const seed = () => {
  mockStore.clear()
  mockStore.set(ACCOUNT_ID, {
    id: ACCOUNT_ID,
    name: 'test-account',
    isActive: 'true',
    status: 'active',
    schedulable: 'true'
  })
}

describe('per-model rate-limit buckets (claudeAccountService)', () => {
  beforeEach(seed)

  it.each(['opus', 'sonnet', 'haiku', 'fable'])(
    'records a %s limit without flipping the account-wide kill switch',
    async (family) => {
      await claudeAccountService.markAccountModelRateLimited(ACCOUNT_ID, family, futureTs())

      const stored = mockStore.get(ACCOUNT_ID)
      expect(stored[`${family}RateLimitedAt`]).toBeTruthy()
      expect(stored[`${family}RateLimitEndAt`]).toBeTruthy()
      // The heart of the bug: a model limit must NOT disable account-wide scheduling,
      // and must NOT write the general rate-limit state that blocks every other model.
      expect(stored.schedulable).not.toBe('false')
      expect(stored.rateLimitStatus).toBeUndefined()
      expect(stored.rateLimitAutoStopped).toBeUndefined()
      expect(stored.rateLimitEndAt).toBeUndefined()
    }
  )

  it('a sonnet limit leaves opus schedulable and the general bucket untouched', async () => {
    await claudeAccountService.markAccountModelRateLimited(ACCOUNT_ID, 'sonnet', futureTs())

    expect(await claudeAccountService.isAccountModelRateLimited(ACCOUNT_ID, 'sonnet')).toBe(true)
    // This is exactly what regressed opus in production.
    expect(await claudeAccountService.isAccountModelRateLimited(ACCOUNT_ID, 'opus')).toBe(false)
    expect(await claudeAccountService.isAccountRateLimited(ACCOUNT_ID)).toBe(false)
  })

  it('auto-clears an expired model limit', async () => {
    const pastTs = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
    await claudeAccountService.markAccountModelRateLimited(ACCOUNT_ID, 'sonnet', pastTs)

    expect(await claudeAccountService.isAccountModelRateLimited(ACCOUNT_ID, 'sonnet')).toBe(false)
    expect(mockStore.get(ACCOUNT_ID).sonnetRateLimitEndAt).toBeUndefined()
  })

  it('reports remaining minutes via getAccountModelRateLimitInfo', async () => {
    await claudeAccountService.markAccountModelRateLimited(ACCOUNT_ID, 'haiku', futureTs())
    const info = await claudeAccountService.getAccountModelRateLimitInfo(ACCOUNT_ID, 'haiku')
    expect(info.isRateLimited).toBe(true)
    expect(info.minutesRemaining).toBeGreaterThan(0)
  })

  it('keeps the legacy Opus/Fable wrappers writing the same Redis fields', async () => {
    await claudeAccountService.markAccountOpusRateLimited(ACCOUNT_ID, futureTs())
    await claudeAccountService.markAccountFableRateLimited(ACCOUNT_ID, futureTs())

    const stored = mockStore.get(ACCOUNT_ID)
    expect(stored.opusRateLimitEndAt).toBeTruthy()
    expect(stored.fableRateLimitEndAt).toBeTruthy()
    expect(await claudeAccountService.isAccountOpusRateLimited(ACCOUNT_ID)).toBe(true)
    expect(await claudeAccountService.isAccountFableRateLimited(ACCOUNT_ID)).toBe(true)
    expect(stored.schedulable).not.toBe('false')
  })
})
