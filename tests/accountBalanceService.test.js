// Mock logger，避免测试输出污染控制台
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const accountBalanceServiceModule = require('../src/services/account/accountBalanceService')

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
