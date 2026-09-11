jest.mock('../src/services/apiKeyService', () => ({
  validateApiKeyForStats: jest.fn()
}))
jest.mock('../src/models/redis', () => ({
  getUsageRecords: jest.fn()
}))
jest.mock('../config/config', () => ({ system: { timezoneOffset: 8 } }))

const apiKeyService = require('../src/services/apiKeyService')
const redis = require('../src/models/redis')
const apiStatsUsageService = require('../src/services/apiStatsUsageService')

const API_KEY = 'cr_valid_test_key'
const KEY_DATA = {
  id: 'key-internal-id',
  name: '测试密钥',
  dailyCost: 1.25,
  dailyCostLimit: 10,
  totalCost: 8.5,
  totalCostLimit: 20,
  expiresAt: null
}

function setSystemTime(value) {
  jest.useFakeTimers().setSystemTime(new Date(value))
}

describe('apiStatsUsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setSystemTime('2026-07-26T04:00:00.000Z')
    apiKeyService.validateApiKeyForStats.mockResolvedValue({ valid: true, keyData: KEY_DATA })
    redis.getUsageRecords.mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('rejects an invalid raw API Key', async () => {
    apiKeyService.validateApiKeyForStats.mockResolvedValue({ valid: false, error: 'Key 不存在' })

    await expect(apiStatsUsageService.getUsageWorkspace({ apiKey: API_KEY })).rejects.toMatchObject(
      {
        message: 'Key 不存在',
        statusCode: 401
      }
    )
  })

  test('serializes only downstream-safe request and key fields', async () => {
    redis.getUsageRecords.mockResolvedValue([
      {
        timestamp: '2026-07-25T03:04:05.000Z',
        model: 'claude-sonnet-4',
        accountId: 'account-secret',
        accountType: 'claude-console',
        endpoint: '/v1/messages',
        realCost: 0.03,
        pricingSource: 'internal-pricing',
        requestBody: { secret: true },
        upstream: { credential: 'secret' },
        inputTokens: 1000,
        outputTokens: 250,
        cacheCreateTokens: 100,
        cacheReadTokens: 50,
        totalTokens: 1400,
        cost: 0.06,
        costBreakdown: { input: 0.02, output: 0.03, cacheCreate: 0.008, cacheRead: 0.002 },
        usageStatus: 'completed'
      }
    ])

    const result = await apiStatsUsageService.getUsageWorkspace({ apiKey: API_KEY })
    const serialized = JSON.stringify(result)

    expect(result.keyStats[0]).toEqual(
      expect.objectContaining({ name: '测试密钥', totalCost: 8.5, totalCostLimit: 20 })
    )
    expect(result.keyStats[0]).not.toHaveProperty('id')
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        apiKeyName: '测试密钥',
        model: 'claude-sonnet-4',
        cost: 0.06,
        outcome: 'completed'
      })
    )
    for (const field of [
      'accountId',
      'accountType',
      'endpoint',
      'realCost',
      'pricingSource',
      'requestBody',
      'upstream',
      'key-internal-id'
    ]) {
      expect(serialized).not.toContain(field)
    }
  })

  test('groups daily cost using the configured UTC+8 timezone', async () => {
    redis.getUsageRecords.mockResolvedValue([
      {
        timestamp: '2026-07-24T17:30:00.000Z',
        model: 'claude-sonnet-4',
        inputTokens: 1,
        cost: 0.1,
        costBreakdown: { input: 0.1 },
        usageStatus: 'completed'
      }
    ])

    const result = await apiStatsUsageService.getUsageWorkspace({
      apiKey: API_KEY,
      period: 'week'
    })

    expect(result.dailyStats.find((day) => day.date === '2026-07-25')).toEqual({
      date: '2026-07-25',
      requests: 1,
      cost: 0.1
    })
  })

  test('reconciles rounded billing items to the final charged amount', async () => {
    redis.getUsageRecords.mockResolvedValue([
      {
        timestamp: '2026-07-25T03:04:05.000Z',
        model: 'claude-sonnet-4',
        inputTokens: 11,
        outputTokens: 7,
        cacheReadTokens: 3,
        cost: 0.123457,
        costBreakdown: { input: 1, output: 1, cacheRead: 1 },
        usageStatus: 'completed'
      }
    ])

    const result = await apiStatsUsageService.getUsageWorkspace({ apiKey: API_KEY })
    const record = result.records[0]
    const allocated = Number(
      record.billing.items.reduce((sum, item) => sum + item.cost, 0).toFixed(6)
    )

    expect(record.billing.total).toBe(0.123457)
    expect(allocated).toBe(record.billing.total)
  })

  test('normalizes missing usage and applies filters and pagination', async () => {
    redis.getUsageRecords.mockResolvedValue([
      {
        timestamp: '2026-07-25T03:04:05.000Z',
        model: 'claude-sonnet-4',
        usageStatus: 'completed_without_usage',
        cost: 0
      },
      {
        timestamp: '2026-07-25T02:04:05.000Z',
        model: 'gpt-5',
        inputTokens: 5,
        cost: 0.02,
        costBreakdown: { input: 0.02 },
        usageStatus: 'completed'
      },
      {
        timestamp: '2026-07-25T01:04:05.000Z',
        model: 'gpt-5',
        inputTokens: 5,
        cost: 0.02,
        costBreakdown: { input: 0.02 },
        usageStatus: 'completed'
      }
    ])

    const unavailable = await apiStatsUsageService.getUsageWorkspace({
      apiKey: API_KEY,
      outcome: 'unavailable'
    })
    expect(unavailable.records).toHaveLength(1)
    expect(unavailable.records[0].outcome).toBe('unavailable')

    const secondPage = await apiStatsUsageService.getUsageWorkspace({
      apiKey: API_KEY,
      model: 'gpt-5',
      page: 2,
      pageSize: 1
    })
    expect(secondPage.pagination).toEqual(
      expect.objectContaining({ currentPage: 2, totalRecords: 2, totalPages: 2 })
    )
    expect(secondPage.records).toHaveLength(1)
    expect(secondPage.records[0].model).toBe('gpt-5')
  })
})
