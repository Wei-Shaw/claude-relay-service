// Exercise real account reads, updates and encryption; isolate all external effects.
const mockStore = new Map()
const mockClient = {
  hgetall: jest.fn(async (key) => ({ ...(mockStore.get(key) || {}) })),
  hset: jest.fn(async (key, updates) => {
    const serialized = Object.fromEntries(
      Object.entries(updates).map(([field, value]) => [field, String(value ?? '')])
    )
    mockStore.set(key, { ...(mockStore.get(key) || {}), ...serialized })
    return 1
  }),
  eval: jest.fn(async (script, count, key, serialized) => {
    if (!script.includes('-- openai-rate-limit-claim') || count !== 1) {
      throw new Error('Unsupported synthetic Lua operation')
    }
    const current = mockStore.get(key)
    if (!current) {
      return 0
    }
    const owns =
      current.isActive === 'true' &&
      current.status === 'active' &&
      ((current.schedulable !== false && current.schedulable !== 'false') ||
        (current.rateLimitOwnsSchedulable === 'true' && current.rateLimitStatus === 'limited'))
    await mockClient.hset(key, {
      ...JSON.parse(serialized),
      rateLimitOwnsSchedulable: owns ? 'true' : 'false'
    })
    return owns ? 1 : 2
  }),
  sadd: jest.fn(),
  srem: jest.fn()
}

jest.mock('../src/models/redis', () => ({ getClientSafe: jest.fn(() => mockClient) }))
jest.mock(
  '../config/config',
  () => ({
    security: { encryptionKey: 'synthetic-ownership-test-key-not-a-real-secret' }
  }),
  { virtual: true }
)
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('axios', () => jest.fn())
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('../src/services/tokenRefreshService', () => ({}))
jest.mock('../src/utils/tokenRefreshLogger', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn(async () => {})
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn(async () => {})
}))

// Prevent the module's cache-cleanup interval from creating a real open handle.
jest.useFakeTimers()
jest.setSystemTime(new Date('2026-09-20T00:00:00.000Z'))
const accountService = require('../src/services/account/openaiAccountService')
const axios = require('axios')
const webhookNotifier = require('../src/utils/webhookNotifier')
const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
const ACCOUNT_ID = 'account-rate-limit-ownership-test'
const ACCOUNT_KEY = `openai:account:${ACCOUNT_ID}`
const stored = () => mockStore.get(ACCOUNT_KEY)

function seed(overrides = {}) {
  mockStore.set(ACCOUNT_KEY, {
    id: ACCOUNT_ID,
    name: 'Synthetic ownership account',
    accountType: 'dedicated',
    isActive: 'true',
    status: 'active',
    schedulable: 'true',
    ...overrides
  })
}

function seedOwnedPause(overrides = {}) {
  seed({
    schedulable: 'false',
    rateLimitStatus: 'limited',
    rateLimitOwnsSchedulable: 'true',
    ...overrides
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStore.clear()
  seed()
})

afterEach(() => {
  expect(axios).not.toHaveBeenCalled()
})

afterAll(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('OpenAI rate-limit scheduling ownership', () => {
  it.each(['true', true, undefined])(
    'owns an automatic pause from schedulable=%s',
    async (schedulable) => {
      seed({ schedulable })

      await accountService.setAccountRateLimited(ACCOUNT_ID, true, 120)

      expect(stored()).toMatchObject({
        schedulable: 'false',
        rateLimitStatus: 'limited',
        rateLimitOwnsSchedulable: 'true',
        rateLimitResetAt: '2026-09-20T00:02:00.000Z'
      })
      expect(mockClient.hset).toHaveBeenCalledWith(
        ACCOUNT_KEY,
        expect.objectContaining({
          rateLimitOwnsSchedulable: 'true'
        })
      )
      // Existing reads: auto-protection check, central update, webhook. No marker re-read.
      expect(mockClient.hgetall).toHaveBeenCalledTimes(3)
      expect(webhookNotifier.sendAccountAnomalyNotification).toHaveBeenCalledTimes(1)
    }
  )

  it('does not claim a manual pause racing after the protection snapshot', async () => {
    const read = mockClient.hgetall.getMockImplementation()
    let first = true
    mockClient.hgetall.mockImplementation(async (key) => {
      const value = await read(key)
      if (first) {
        first = false
        mockStore.set(key, {
          ...mockStore.get(key),
          schedulable: 'false',
          rateLimitOwnsSchedulable: 'false'
        })
      }
      return value
    })
    try {
      await accountService.setAccountRateLimited(ACCOUNT_ID, true, 120)
      expect(stored().schedulable).toBe('false')
      expect(stored().rateLimitOwnsSchedulable).toBe('false')
    } finally {
      mockClient.hgetall.mockImplementation(read)
    }
  })

  it('retains ownership across repeated automatic rate limits', async () => {
    await accountService.setAccountRateLimited(ACCOUNT_ID, true, 120)
    await accountService.setAccountRateLimited(ACCOUNT_ID, true, 240)

    expect(stored()).toMatchObject({
      schedulable: 'false',
      rateLimitStatus: 'limited',
      rateLimitOwnsSchedulable: 'true',
      rateLimitResetAt: '2026-09-20T00:04:00.000Z'
    })
  })

  it.each(['false', false])(
    'does not claim a pre-existing manual pause (%s)',
    async (schedulable) => {
      seed({ schedulable })

      await accountService.setAccountRateLimited(ACCOUNT_ID, true)

      expect(stored()).toMatchObject({
        schedulable: 'false',
        rateLimitStatus: 'limited',
        rateLimitOwnsSchedulable: 'false'
      })
    }
  )

  it('does not infer ownership for legacy limited accounts without a marker', async () => {
    seed({ schedulable: 'false', rateLimitStatus: 'limited' })

    await accountService.setAccountRateLimited(ACCOUNT_ID, true)

    expect(stored().rateLimitOwnsSchedulable).toBe('false')
  })

  it('rejects stale ownership when the prior rate-limit status is not limited', async () => {
    seedOwnedPause({ rateLimitStatus: 'normal' })

    await accountService.setAccountRateLimited(ACCOUNT_ID, true)

    expect(stored().rateLimitOwnsSchedulable).toBe('false')
  })

  it.each(['false', false, 'true', true])(
    'revokes ownership on an explicit schedulable=%s update',
    async (schedulable) => {
      seedOwnedPause()

      const updated = await accountService.updateAccount(ACCOUNT_ID, { schedulable })

      expect(updated.rateLimitOwnsSchedulable).toBe('false')
      expect(stored().rateLimitOwnsSchedulable).toBe('false')
      expect(stored().schedulable).toBe(String(schedulable))
    }
  )

  it.each([true, 'true', false, 'false'])(
    'persists explicit ownership %s as a string during scheduling writes',
    async (marker) => {
      seedOwnedPause()

      const updated = await accountService.updateAccount(ACCOUNT_ID, {
        schedulable: 'false',
        rateLimitOwnsSchedulable: marker
      })

      expect(updated.rateLimitOwnsSchedulable).toBe(String(marker))
      expect(mockClient.hset).toHaveBeenCalledWith(
        ACCOUNT_KEY,
        expect.objectContaining({
          rateLimitOwnsSchedulable: String(marker)
        })
      )
    }
  )

  it.each([false, 'false'])(
    'revokes ownership on isActive=%s, including after reactivation',
    async (isActive) => {
      seedOwnedPause()

      await accountService.updateAccount(ACCOUNT_ID, { isActive })
      expect(stored().rateLimitOwnsSchedulable).toBe('false')
      await accountService.updateAccount(ACCOUNT_ID, { isActive: 'true' })

      expect(stored().rateLimitOwnsSchedulable).toBe('false')
      expect(stored().schedulable).toBe('false')
    }
  )

  it('gives deactivation precedence over an explicit ownership marker', async () => {
    seedOwnedPause()

    await accountService.updateAccount(ACCOUNT_ID, {
      isActive: false,
      rateLimitOwnsSchedulable: 'true'
    })

    expect(stored().rateLimitOwnsSchedulable).toBe('false')
  })

  it.each(['disabled', 'unauthorized', 'error'])(
    'revokes ownership on status=%s, including after status recovery',
    async (status) => {
      seedOwnedPause()

      await accountService.updateAccount(ACCOUNT_ID, { status })
      expect(stored().rateLimitOwnsSchedulable).toBe('false')
      await accountService.updateAccount(ACCOUNT_ID, { status: 'active' })

      expect(stored().rateLimitOwnsSchedulable).toBe('false')
    }
  )

  it('does not reacquire ownership after a manual scheduling pause', async () => {
    await accountService.setAccountRateLimited(ACCOUNT_ID, true)
    await accountService.updateAccount(ACCOUNT_ID, { schedulable: 'false' })
    await accountService.setAccountRateLimited(ACCOUNT_ID, true)

    expect(stored().rateLimitOwnsSchedulable).toBe('false')
  })

  it('preserves ownership and real encryption during a token-only update', async () => {
    seedOwnedPause()
    const tokens = {
      accessToken: 'synthetic-access-token',
      refreshToken: 'synthetic-refresh-token',
      idToken: 'synthetic-id-token',
      openaiOauth: { accessToken: 'synthetic-nested-token' },
      expiresAt: '2026-09-20T01:00:00.000Z'
    }

    await accountService.updateAccount(ACCOUNT_ID, { ...tokens })
    const account = await accountService.getAccount(ACCOUNT_ID)

    expect(stored().rateLimitOwnsSchedulable).toBe('true')
    expect(mockClient.hset.mock.calls[0][1]).not.toHaveProperty('rateLimitOwnsSchedulable')
    for (const field of ['accessToken', 'refreshToken', 'idToken']) {
      expect(stored()[field]).not.toBe(tokens[field])
      expect(accountService.decrypt(stored()[field])).toBe(tokens[field])
    }
    expect(account.accessToken).toBe(stored().accessToken)
    expect(account.refreshToken).toBe(tokens.refreshToken)
    expect(account.idToken).toBe(tokens.idToken)
    expect(account.openaiOauth).toEqual(tokens.openaiOauth)
  })

  it.each([
    { codexPrimaryUsedPercent: '0', codexUsageUpdatedAt: '2026-09-20T00:00:00.000Z' },
    { name: 'Renamed synthetic account', description: 'Unrelated metadata' },
    { isActive: 'true', status: 'active' }
  ])('preserves ownership for unrelated updates: %j', async (updates) => {
    seedOwnedPause()

    await accountService.updateAccount(ACCOUNT_ID, { ...updates })

    expect(stored().rateLimitOwnsSchedulable).toBe('true')
    expect(mockClient.hset.mock.calls[0][1]).not.toHaveProperty('rateLimitOwnsSchedulable')
  })

  it('does not backfill ownership during a legacy metadata-only update', async () => {
    await accountService.updateAccount(ACCOUNT_ID, { description: 'Still legacy' })

    expect(stored()).not.toHaveProperty('rateLimitOwnsSchedulable')
  })

  it.each(['true', 'false', undefined])(
    'clears ownership=%s without changing legacy unlimit behavior',
    async (marker) => {
      seedOwnedPause({
        rateLimitOwnsSchedulable: marker,
        isActive: 'false',
        status: 'unauthorized'
      })

      await accountService.setAccountRateLimited(ACCOUNT_ID, false)

      expect(stored()).toMatchObject({
        schedulable: 'true',
        isActive: 'false',
        status: 'unauthorized',
        rateLimitStatus: 'normal',
        rateLimitedAt: '',
        rateLimitResetAt: '',
        rateLimitOwnsSchedulable: 'false'
      })
      expect(mockClient.hgetall).toHaveBeenCalledTimes(1)
      expect(webhookNotifier.sendAccountAnomalyNotification).not.toHaveBeenCalled()
    }
  )

  it('leaves ownership untouched when automatic protection is disabled', async () => {
    seedOwnedPause({ disableAutoProtection: 'true' })

    await accountService.setAccountRateLimited(ACCOUNT_ID, true)

    expect(mockClient.hset).not.toHaveBeenCalled()
    expect(stored().rateLimitOwnsSchedulable).toBe('true')
    expect(upstreamErrorHelper.recordErrorHistory).toHaveBeenCalledWith(
      ACCOUNT_ID,
      'openai',
      429,
      'rate_limit'
    )
    expect(webhookNotifier.sendAccountAnomalyNotification).not.toHaveBeenCalled()
  })

  it('does not create an account when a rate limit targets a missing account', async () => {
    mockStore.clear()

    await expect(accountService.setAccountRateLimited(ACCOUNT_ID, true)).rejects.toThrow(
      'Account not found'
    )

    expect(mockClient.hset).not.toHaveBeenCalled()
  })
})
