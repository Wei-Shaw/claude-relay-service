// Mock logger，避免测试输出污染控制台
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const accountBalanceServiceModule = require('../src/services/accountBalanceService')

const { AccountBalanceService } = accountBalanceServiceModule

describe('AccountBalanceService', () => {
  const originalBalanceScriptEnabled = process.env.BALANCE_SCRIPT_ENABLED

  afterEach(() => {
    if (originalBalanceScriptEnabled === undefined) {
      delete process.env.BALANCE_SCRIPT_ENABLED
    } else {
      process.env.BALANCE_SCRIPT_ENABLED = originalBalanceScriptEnabled
    }
  })

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }

  const buildMockRedis = () => ({
    getLocalBalance: jest.fn().mockResolvedValue(null),
    setLocalBalance: jest.fn().mockResolvedValue(undefined),
    getAccountBalance: jest.fn().mockResolvedValue(null),
    setAccountBalance: jest.fn().mockResolvedValue(undefined),
    deleteAccountBalance: jest.fn().mockResolvedValue(undefined),
    getBalanceScriptConfig: jest.fn().mockResolvedValue(null),
    getAccountUsageStats: jest.fn().mockResolvedValue({
      total: { requests: 10 },
      daily: { requests: 2, cost: 20 },
      monthly: { requests: 5 }
    }),
    getDateInTimezone: (date) => new Date(date.getTime() + 8 * 3600 * 1000)
  })

  it('should normalize platform aliases', () => {
    const service = new AccountBalanceService({ redis: buildMockRedis(), logger: mockLogger })
    expect(service.normalizePlatform('claude-official')).toBe('claude')
    expect(service.normalizePlatform('azure-openai')).toBe('azure_openai')
    expect(service.normalizePlatform('gemini-api')).toBe('gemini-api')
  })

  it('should build local quota/balance from dailyQuota and local dailyCost', async () => {
    const mockRedis = buildMockRedis()
    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })

    service._computeMonthlyCost = jest.fn().mockResolvedValue(30)
    service._computeTotalCost = jest.fn().mockResolvedValue(123.45)

    const account = { id: 'acct-1', name: 'A', dailyQuota: '100', quotaResetTime: '00:00' }
    const result = await service._getAccountBalanceForAccount(account, 'claude-console', {
      queryApi: false,
      useCache: true
    })

    expect(result.success).toBe(true)
    expect(result.data.source).toBe('local')
    expect(result.data.balance.amount).toBeCloseTo(80, 6)
    expect(result.data.quota.percentage).toBeCloseTo(20, 6)
    expect(result.data.statistics.totalCost).toBeCloseTo(123.45, 6)
    expect(mockRedis.setLocalBalance).toHaveBeenCalled()
  })

  it('should use cached balance when account has no dailyQuota', async () => {
    const mockRedis = buildMockRedis()
    mockRedis.getAccountBalance.mockResolvedValue({
      status: 'success',
      balance: 12.34,
      currency: 'USD',
      quota: null,
      errorMessage: '',
      lastRefreshAt: '2025-01-01T00:00:00Z',
      ttlSeconds: 120
    })

    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })
    service._computeMonthlyCost = jest.fn().mockResolvedValue(0)
    service._computeTotalCost = jest.fn().mockResolvedValue(0)

    const account = { id: 'acct-2', name: 'B' }
    const result = await service._getAccountBalanceForAccount(account, 'openai', {
      queryApi: false,
      useCache: true
    })

    expect(result.data.source).toBe('cache')
    expect(result.data.balance.amount).toBeCloseTo(12.34, 6)
    expect(result.data.lastRefreshAt).toBe('2025-01-01T00:00:00Z')
  })

  it('should attach antigravity model cooldowns into quota buckets', async () => {
    const mockRedis = buildMockRedis()
    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })
    service._computeMonthlyCost = jest.fn().mockResolvedValue(0)
    service._computeTotalCost = jest.fn().mockResolvedValue(0)

    const resetAtClaude = new Date(Date.now() + 65 * 1000).toISOString()
    const resetAtFlash = new Date(Date.now() + 125 * 1000).toISOString()
    const resetAtOther = new Date(Date.now() + 185 * 1000).toISOString()
    const account = {
      id: 'acct-ag',
      name: 'AG',
      oauthProvider: 'antigravity',
      modelRateLimits: {
        'claude-opus-4-5-thinking': {
          status: 'limited',
          resetAt: resetAtClaude,
          reason: 'RATE_LIMIT_EXCEEDED'
        },
        'gemini-2.0-flash': {
          status: 'limited',
          resetAt: resetAtFlash,
          reason: 'RATE_LIMIT_EXCEEDED'
        },
        'totally-unknown-model': {
          status: 'limited',
          resetAt: resetAtOther,
          reason: 'MODEL_CAPACITY_EXHAUSTED'
        }
      }
    }

    mockRedis.getAccountBalance.mockResolvedValue({
      status: 'success',
      balance: null,
      currency: 'USD',
      quota: {
        type: 'antigravity',
        total: 100,
        used: 0,
        remaining: 100,
        percentage: 0,
        resetAt: null,
        buckets: [
          { category: 'Gemini Pro', remaining: 100, used: 0, percentage: 0, resetAt: null },
          { category: 'Claude', remaining: 100, used: 0, percentage: 0, resetAt: null },
          { category: 'Gemini Flash', remaining: 100, used: 0, percentage: 0, resetAt: null },
          { category: 'Gemini Image', remaining: 100, used: 0, percentage: 0, resetAt: null }
        ]
      },
      errorMessage: '',
      lastRefreshAt: '2025-01-01T00:00:00Z',
      ttlSeconds: 120
    })

    const cachedResult = await service._getAccountBalanceForAccount(account, 'gemini', {
      queryApi: false,
      useCache: true
    })

    expect(Array.isArray(cachedResult.data.quota.modelCooldowns)).toBe(true)
    expect(cachedResult.data.quota.modelCooldowns).toHaveLength(3)
    expect(cachedResult.data.quota.modelCooldowns[0].modelId).toBe('claude-opus-4-5-thinking')
    expect(cachedResult.data.quota.modelCooldowns[1].modelId).toBe('gemini-2.0-flash')
    expect(cachedResult.data.quota.modelCooldowns[2].modelId).toBe('totally-unknown-model')

    const claudeBucketCached = cachedResult.data.quota.buckets.find((b) => b.category === 'Claude')
    expect(claudeBucketCached.cooldown).toBeTruthy()
    expect(claudeBucketCached.cooldown.models).toHaveLength(1)
    expect(claudeBucketCached.cooldown.models[0].modelId).toBe('claude-opus-4-5-thinking')

    const flashBucketCached = cachedResult.data.quota.buckets.find((b) => b.category === 'Gemini Flash')
    expect(flashBucketCached.cooldown).toBeTruthy()
    expect(flashBucketCached.cooldown.models).toHaveLength(1)
    expect(flashBucketCached.cooldown.models[0].modelId).toBe('gemini-2.0-flash')

    const otherBucketCached = cachedResult.data.quota.buckets.find((b) => b.category === 'Other')
    expect(otherBucketCached.cooldown).toBeTruthy()
    expect(otherBucketCached.cooldown.models).toHaveLength(1)
    expect(otherBucketCached.cooldown.models[0].modelId).toBe('totally-unknown-model')

    const provider = {
      queryBalance: jest.fn().mockResolvedValue({
        balance: null,
        currency: 'USD',
        quota: {
          type: 'antigravity',
          total: 100,
          used: 0,
          remaining: 100,
          percentage: 0,
          resetAt: null,
          buckets: [
            { category: 'Gemini Pro', remaining: 100, used: 0, percentage: 0, resetAt: null },
            { category: 'Claude', remaining: 100, used: 0, percentage: 0, resetAt: null },
            { category: 'Gemini Flash', remaining: 100, used: 0, percentage: 0, resetAt: null },
            { category: 'Gemini Image', remaining: 100, used: 0, percentage: 0, resetAt: null }
          ]
        },
        queryMethod: 'api'
      })
    }
    service.registerProvider('gemini', provider)

    const apiResult = await service._getAccountBalanceForAccount(account, 'gemini', {
      queryApi: true,
      useCache: false
    })

    expect(Array.isArray(apiResult.data.quota.modelCooldowns)).toBe(true)
    expect(apiResult.data.quota.modelCooldowns).toHaveLength(3)

    const claudeBucketApi = apiResult.data.quota.buckets.find((b) => b.category === 'Claude')
    expect(provider.queryBalance).toHaveBeenCalled()
    expect(claudeBucketApi.cooldown).toBeTruthy()
    expect(claudeBucketApi.cooldown.resetAt).toBeTruthy()
    expect(claudeBucketApi.cooldown.models[0].resetAt).toBe(resetAtClaude)

    const flashBucketApi = apiResult.data.quota.buckets.find((b) => b.category === 'Gemini Flash')
    expect(flashBucketApi.cooldown).toBeTruthy()
    expect(flashBucketApi.cooldown.models[0].resetAt).toBe(resetAtFlash)

    const otherBucketApi = apiResult.data.quota.buckets.find((b) => b.category === 'Other')
    expect(otherBucketApi.cooldown).toBeTruthy()
    expect(otherBucketApi.cooldown.models[0].resetAt).toBe(resetAtOther)
  })

  it('should not cache provider errors and fallback to local when queryApi=true', async () => {
    const mockRedis = buildMockRedis()
    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })

    service._computeMonthlyCost = jest.fn().mockResolvedValue(0)
    service._computeTotalCost = jest.fn().mockResolvedValue(0)

    service.registerProvider('openai', {
      queryBalance: () => {
        throw new Error('boom')
      }
    })

    const account = { id: 'acct-3', name: 'C' }
    const result = await service._getAccountBalanceForAccount(account, 'openai', {
      queryApi: true,
      useCache: false
    })

    expect(mockRedis.setAccountBalance).not.toHaveBeenCalled()
    expect(result.data.source).toBe('local')
    expect(result.data.status).toBe('error')
    expect(result.data.error).toBe('boom')
  })

  it('should ignore script config when balance script is disabled', async () => {
    process.env.BALANCE_SCRIPT_ENABLED = 'false'

    const mockRedis = buildMockRedis()
    mockRedis.getBalanceScriptConfig.mockResolvedValue({
      scriptBody: '({ request: { url: "http://example.com" }, extractor: function(){ return {} } })'
    })

    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })
    service._computeMonthlyCost = jest.fn().mockResolvedValue(0)
    service._computeTotalCost = jest.fn().mockResolvedValue(0)

    const provider = { queryBalance: jest.fn().mockResolvedValue({ balance: 1, currency: 'USD' }) }
    service.registerProvider('openai', provider)

    const scriptSpy = jest.spyOn(service, '_getBalanceFromScript')

    const account = { id: 'acct-script-off', name: 'S' }
    const result = await service._getAccountBalanceForAccount(account, 'openai', {
      queryApi: true,
      useCache: false
    })

    expect(provider.queryBalance).toHaveBeenCalled()
    expect(scriptSpy).not.toHaveBeenCalled()
    expect(result.data.source).toBe('api')
  })

  it('should prefer script when configured and enabled', async () => {
    process.env.BALANCE_SCRIPT_ENABLED = 'true'

    const mockRedis = buildMockRedis()
    mockRedis.getBalanceScriptConfig.mockResolvedValue({
      scriptBody: '({ request: { url: "http://example.com" }, extractor: function(){ return {} } })'
    })

    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })
    service._computeMonthlyCost = jest.fn().mockResolvedValue(0)
    service._computeTotalCost = jest.fn().mockResolvedValue(0)

    const provider = { queryBalance: jest.fn().mockResolvedValue({ balance: 2, currency: 'USD' }) }
    service.registerProvider('openai', provider)

    jest.spyOn(service, '_getBalanceFromScript').mockResolvedValue({
      status: 'success',
      balance: 3,
      currency: 'USD',
      quota: null,
      queryMethod: 'script',
      rawData: { ok: true },
      lastRefreshAt: '2025-01-01T00:00:00Z',
      errorMessage: ''
    })

    const account = { id: 'acct-script-on', name: 'T' }
    const result = await service._getAccountBalanceForAccount(account, 'openai', {
      queryApi: true,
      useCache: false
    })

    expect(provider.queryBalance).not.toHaveBeenCalled()
    expect(result.data.source).toBe('api')
    expect(result.data.balance.amount).toBeCloseTo(3, 6)
    expect(result.data.lastRefreshAt).toBe('2025-01-01T00:00:00Z')
  })

  it('should count low balance once per account in summary', async () => {
    const mockRedis = buildMockRedis()
    const service = new AccountBalanceService({ redis: mockRedis, logger: mockLogger })

    service.getSupportedPlatforms = () => ['claude-console']
    service.getAllAccountsByPlatform = async () => [{ id: 'acct-4', name: 'D' }]
    service._getAccountBalanceForAccount = async () => ({
      success: true,
      data: {
        accountId: 'acct-4',
        platform: 'claude-console',
        balance: { amount: 5, currency: 'USD', formattedAmount: '$5.00' },
        quota: { percentage: 95 },
        statistics: { totalCost: 1 },
        source: 'local',
        lastRefreshAt: '2025-01-01T00:00:00Z',
        cacheExpiresAt: null,
        status: 'success',
        error: null
      }
    })

    const summary = await service.getBalanceSummary()
    expect(summary.lowBalanceCount).toBe(1)
    expect(summary.platforms['claude-console'].lowBalanceCount).toBe(1)
  })
})
