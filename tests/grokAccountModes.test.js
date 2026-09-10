jest.mock('../src/models/redis', () => {
  const store = new Map()
  const indexes = new Map()
  const client = {
    hset: jest.fn(async (key, data) => {
      const existing = store.get(key) || {}
      store.set(key, { ...existing, ...data })
      return 1
    }),
    hgetall: jest.fn(async (key) => store.get(key) || {}),
    del: jest.fn(async (key) => {
      store.delete(key)
      return 1
    }),
    sadd: jest.fn(async () => 1),
    srem: jest.fn(async () => 1),
    pipeline: () => {
      const keys = []
      return {
        hgetall(key) {
          keys.push(key)
          return this
        },
        async exec() {
          return keys.map((key) => [null, store.get(key) || {}])
        }
      }
    }
  }
  return {
    getClientSafe: () => client,
    getDateStringInTimezone: () => '2026-09-01',
    addToIndex: jest.fn(async (indexKey, id) => {
      const set = indexes.get(indexKey) || new Set()
      set.add(id)
      indexes.set(indexKey, set)
    }),
    removeFromIndex: jest.fn(async (indexKey, id) => {
      const set = indexes.get(indexKey)
      if (set) {
        set.delete(id)
      }
    }),
    getAllIdsByIndex: jest.fn(async (indexKey) => Array.from(indexes.get(indexKey) || [])),
    __store: store,
    __reset() {
      store.clear()
      indexes.clear()
    }
  }
})

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  isTempUnavailable: jest.fn(async () => false),
  clearTempUnavailable: jest.fn(async () => {}),
  recordErrorHistory: jest.fn(async () => {}),
  markTempUnavailable: jest.fn(async () => {})
}))

jest.mock('../src/services/tokenRefreshService', () => ({
  acquireRefreshLock: jest.fn(async () => true),
  releaseRefreshLock: jest.fn(async () => {})
}))

jest.mock('../src/utils/tokenRefreshLogger', () => ({
  logRefreshStart: jest.fn(),
  logRefreshSuccess: jest.fn(),
  logRefreshError: jest.fn(),
  logRefreshSkipped: jest.fn()
}))

jest.mock('../config/config', () => ({
  security: { encryptionKey: 'test-encryption-key-for-grok' },
  requestTimeout: 60000
}))

const redis = require('../src/models/redis')
const grokHelper = require('../src/utils/grokHelper')
const grokAccountService = require('../src/services/account/grokAccountService')

describe('Grok account modes', () => {
  beforeEach(() => {
    redis.__reset()
    jest.clearAllMocks()
  })

  it('creates an OAuth subscription account that defaults to the CLI proxy', async () => {
    const account = await grokAccountService.createAccount({
      name: 'oauth-sub',
      authType: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1'
    })

    expect(account.authType).toBe('oauth')
    expect(account.baseUrl).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
    expect(account.accessToken).toBe('***')
    expect(account.apiKey).toBe('')

    const full = await grokAccountService.getAccount(account.id)
    expect(full.accessToken).toBe('access-1')
    expect(full.refreshToken).toBe('refresh-1')
    expect(full.apiKey).toBe('')
  })

  it('creates an official xAI API-key account on api.x.ai', async () => {
    const account = await grokAccountService.createAccount({
      name: 'official-key',
      authType: 'api_key',
      apiKey: 'xai-secret',
      baseUrlMode: 'api'
    })

    expect(account.authType).toBe('api_key')
    expect(account.baseUrl).toBe(grokHelper.DEFAULT_API_BASE_URL)

    const full = await grokAccountService.getAccount(account.id)
    expect(full.apiKey).toBe('xai-secret')
    expect(full.accessToken).toBe('')
    expect(full.refreshToken).toBe('')
  })

  it('creates a custom relay API-key account and keeps the path prefix', async () => {
    const account = await grokAccountService.createAccount({
      name: 'custom-relay',
      authType: 'api_key',
      apiKey: 'relay-key',
      baseUrl: 'https://relay.example.com/xai/v1',
      customUpstream: true
    })

    expect(account.authType).toBe('api_key')
    expect(account.baseUrl).toBe('https://relay.example.com/xai/v1')
    expect(account.customUpstream).toBe(true)
  })

  it('refuses OAuth create without tokens and API-key create without a key', async () => {
    await expect(
      grokAccountService.createAccount({ name: 'bad-oauth', authType: 'oauth' })
    ).rejects.toThrow(/access token or refresh token/i)

    await expect(
      grokAccountService.createAccount({ name: 'bad-key', authType: 'api_key' })
    ).rejects.toThrow(/API key/i)
  })

  it('does not treat API-key accounts as refreshable', async () => {
    const account = await grokAccountService.createAccount({
      name: 'key-only',
      authType: 'api_key',
      apiKey: 'xai-secret',
      baseUrlMode: 'api'
    })

    await expect(grokAccountService.refreshAccountToken(account.id)).rejects.toThrow(
      /Only Grok OAuth accounts/
    )
  })

  it('keeps an OAuth custom upstream sticky unless the overlay is cleared', async () => {
    const account = await grokAccountService.createAccount({
      name: 'oauth-overlay',
      authType: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      customUpstream: true,
      baseUrl: 'https://relay.example.com/xai/v1'
    })

    expect(account.customUpstream).toBe(true)
    expect(account.baseUrl).toBe('https://relay.example.com/xai/v1')

    await grokAccountService.updateAccount(account.id, { priority: 20 })
    const unchanged = await grokAccountService.getAccount(account.id)
    expect(unchanged.customUpstream).toBe(true)
    expect(unchanged.baseUrl).toBe('https://relay.example.com/xai/v1')

    await grokAccountService.updateAccount(account.id, { customUpstream: false })
    const cleared = await grokAccountService.getAccount(account.id)
    expect(cleared.customUpstream).toBe(false)
    expect(cleared.baseUrl).toBe(grokHelper.DEFAULT_CLI_BASE_URL)
  })

  it('masks secrets in list responses', async () => {
    const created = await grokAccountService.createAccount({
      name: 'secret-mask',
      authType: 'oauth',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      email: 'user@example.com'
    })
    const listed = (await grokAccountService.getAllAccounts(true)).find(
      (item) => item.id === created.id
    )
    expect(listed.accessToken).toBe('***')
    expect(listed.refreshToken).toBe('***')
    expect(listed.email).toBe('***')

    const publicAccount = await grokAccountService.getAccount(created.id, { includeSecrets: false })
    expect(publicAccount.accessToken).toBe('***')
    expect(publicAccount.email).toBe('***')
  })
})
