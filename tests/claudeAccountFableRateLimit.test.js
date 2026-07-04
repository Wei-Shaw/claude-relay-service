// Regression test for Fable-5 rate-limit isolation.
//
// Bug: a `claude-fable-5` 429 (a separate, weekly-scale limit) was routed into the
// account-wide rate-limit bucket (markAccountRateLimited → schedulable='false'),
// taking the whole OAuth account offline. Subsequent `claude-opus-4-8` requests then
// failed with "No available Claude accounts support the requested model".
//
// Fix: Fable limits get their own model-scoped bucket (markAccountFableRateLimited),
// mirroring the Opus bucket, that does NOT disable account-wide scheduling and does
// NOT set the general rate-limit state that gates every other model.

const mockStore = new Map()

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(async (id) => mockStore.get(id) || {}),
  setClaudeAccount: jest.fn(async (id, data) => {
    mockStore.set(id, { ...data })
  }),
  client: {
    hdel: jest.fn(async () => 1)
  }
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

// Side-effectful deps the Fable rate-limit methods never touch.
jest.mock('../src/services/tokenRefreshService', () => ({}))
jest.mock('../src/utils/tokenRefreshLogger', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn()
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn(() => ({ catch: jest.fn() })),
  markTempUnavailable: jest.fn(() => ({ catch: jest.fn() })),
  parseRetryAfter: jest.fn(() => null)
}))
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('axios', () => ({}))

// The service constructor starts a cache-cleanup setInterval at load. Unref it so the
// timer never keeps the Jest process alive (avoids needing --forceExit for this file).
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

const ACCOUNT_ID = 'acct-fable-test'
const DAY = 24 * 60 * 60 * 1000

const seedActiveAccount = () => {
  mockStore.clear()
  mockStore.set(ACCOUNT_ID, {
    id: ACCOUNT_ID,
    name: 'test-account',
    isActive: 'true',
    status: 'active',
    schedulable: 'true'
  })
}

describe('Fable rate-limit isolation (claudeAccountService)', () => {
  beforeEach(() => {
    seedActiveAccount()
  })

  it('records the Fable bucket without flipping the account-wide kill switch', async () => {
    // ~3 days out — a weekly-scale limit, exactly the shape that regressed opus.
    const resetTs = Math.floor((Date.now() + 3 * DAY) / 1000)

    await claudeAccountService.markAccountFableRateLimited(ACCOUNT_ID, resetTs)

    const stored = mockStore.get(ACCOUNT_ID)
    expect(stored.fableRateLimitedAt).toBeTruthy()
    expect(stored.fableRateLimitEndAt).toBeTruthy()
    // The heart of the bug: a Fable limit must NOT disable scheduling account-wide,
    // and must NOT write the general rate-limit state that blocks every other model.
    expect(stored.schedulable).not.toBe('false')
    expect(stored.rateLimitStatus).toBeUndefined()
    expect(stored.rateLimitAutoStopped).toBeUndefined()
    expect(stored.rateLimitEndAt).toBeUndefined()
  })

  it('is fable-limited but NOT general (account-wide) rate-limited', async () => {
    const resetTs = Math.floor((Date.now() + 3 * DAY) / 1000)
    await claudeAccountService.markAccountFableRateLimited(ACCOUNT_ID, resetTs)

    expect(await claudeAccountService.isAccountFableRateLimited(ACCOUNT_ID)).toBe(true)
    // Opus (and every non-fable model) is gated by the GENERAL bucket; a fable limit
    // must leave it false so opus-4-8 keeps scheduling on this account.
    expect(await claudeAccountService.isAccountRateLimited(ACCOUNT_ID)).toBe(false)
    // And it must not leak into the Opus bucket either.
    expect(await claudeAccountService.isAccountOpusRateLimited(ACCOUNT_ID)).toBe(false)
  })

  it('auto-clears an expired Fable limit', async () => {
    const pastTs = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
    await claudeAccountService.markAccountFableRateLimited(ACCOUNT_ID, pastTs)

    expect(await claudeAccountService.isAccountFableRateLimited(ACCOUNT_ID)).toBe(false)
    expect(mockStore.get(ACCOUNT_ID).fableRateLimitEndAt).toBeUndefined()
  })

  it('surfaces fable status via getAccountFableRateLimitInfo', async () => {
    const resetTs = Math.floor((Date.now() + 3 * DAY) / 1000)
    await claudeAccountService.markAccountFableRateLimited(ACCOUNT_ID, resetTs)

    const info = await claudeAccountService.getAccountFableRateLimitInfo(ACCOUNT_ID)
    expect(info.isRateLimited).toBe(true)
    expect(info.minutesRemaining).toBeGreaterThan(0)
  })
})
