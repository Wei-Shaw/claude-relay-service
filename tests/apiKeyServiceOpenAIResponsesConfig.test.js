jest.mock(
  '../config/config',
  () => ({
    security: {
      apiKeyPrefix: 'cr_'
    }
  }),
  { virtual: true }
)

jest.mock('../src/models/redis', () => ({
  setApiKey: jest.fn(),
  getApiKey: jest.fn(),
  incrementTokenUsage: jest.fn(),
  incrementDailyCost: jest.fn(),
  incrementAccountUsage: jest.fn(),
  addUsageRecord: jest.fn()
}))

jest.mock('../src/services/costRankService', () => ({
  addKeyToIndexes: jest.fn()
}))

jest.mock('../src/services/apiKeyIndexService', () => ({
  addToIndex: jest.fn(),
  updateIndex: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  database: jest.fn(),
  debug: jest.fn()
}))

jest.mock('../src/services/serviceRatesService', () => ({
  getService: jest.fn(),
  getServiceRate: jest.fn()
}))
jest.mock('../src/services/requestDetailService', () => ({
  captureRequestDetail: jest.fn()
}))
jest.mock('../src/services/billingEventPublisher', () => ({
  publishBillingEvent: jest.fn()
}))
jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn()
}))
jest.mock('../src/utils/modelHelper', () => ({
  isClaudeFamilyModel: jest.fn(() => false)
}))
jest.mock('../src/utils/requestDetailHelper', () => ({
  finalizeRequestDetailMeta: jest.fn((value) => value)
}))

const redis = require('../src/models/redis')
const serviceRatesService = require('../src/services/serviceRatesService')
const requestDetailService = require('../src/services/requestDetailService')
const billingEventPublisher = require('../src/services/billingEventPublisher')
const CostCalculator = require('../src/utils/costCalculator')
const apiKeyService = require('../src/services/apiKeyService')

describe('apiKeyService openai responses config', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    redis.getApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'Key',
      serviceRates: '{}'
    })
    redis.setApiKey.mockResolvedValue()
    redis.incrementTokenUsage.mockResolvedValue()
    redis.incrementDailyCost.mockResolvedValue()
    redis.incrementAccountUsage.mockResolvedValue()
    redis.addUsageRecord.mockResolvedValue()
    serviceRatesService.getService.mockReturnValue('claude')
    serviceRatesService.getServiceRate.mockResolvedValue(1)
    requestDetailService.captureRequestDetail.mockResolvedValue({ captured: true })
    billingEventPublisher.publishBillingEvent.mockResolvedValue()
  })

  test('generateApiKey stores default toggle values', async () => {
    redis.setApiKey.mockResolvedValue()

    const result = await apiKeyService.generateApiKey({ name: 'Test Key' })
    const [, storedKeyData] = redis.setApiKey.mock.calls[0]

    expect(storedKeyData.enableOpenAIResponsesCodexAdaptation).toBe('true')
    expect(storedKeyData.enableOpenAIResponsesPayloadRules).toBe('false')
    expect(storedKeyData.openaiResponsesPayloadRules).toBe('[]')

    expect(result.enableOpenAIResponsesCodexAdaptation).toBe(true)
    expect(result.enableOpenAIResponsesPayloadRules).toBe(false)
    expect(result.openaiResponsesPayloadRules).toEqual([])
  })

  test('updateApiKey serializes toggle and payload rule fields', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'key-1',
      apiKey: 'hashed-key',
      name: 'Old Key',
      isActive: 'true',
      tags: '[]'
    })
    redis.setApiKey.mockResolvedValue()

    await apiKeyService.updateApiKey('key-1', {
      enableOpenAIResponsesCodexAdaptation: false,
      enableOpenAIResponsesPayloadRules: true,
      openaiResponsesPayloadRules: [{ path: 'model', valueType: 'string', value: 'gpt-5' }]
    })

    const [, storedKeyData] = redis.setApiKey.mock.calls[0]
    expect(storedKeyData.enableOpenAIResponsesCodexAdaptation).toBe('false')
    expect(storedKeyData.enableOpenAIResponsesPayloadRules).toBe('true')
    expect(storedKeyData.openaiResponsesPayloadRules).toBe(
      JSON.stringify([{ path: 'model', valueType: 'string', value: 'gpt-5' }])
    )
  })

  test('getApiKeyById returns parsed toggle and rule values', async () => {
    redis.getApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'Key',
      apiKey: 'hashed-key',
      tokenLimit: '0',
      isActive: 'true',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastUsedAt: '',
      expiresAt: '',
      userId: '',
      userUsername: '',
      createdBy: 'admin',
      permissions: '[]',
      dailyCostLimit: '0',
      totalCostLimit: '0',
      claudeAccountId: '',
      claudeConsoleAccountId: '',
      geminiAccountId: '',
      openaiAccountId: '',
      bedrockAccountId: '',
      droidAccountId: '',
      azureOpenaiAccountId: '',
      ccrAccountId: '',
      enableOpenAIResponsesCodexAdaptation: 'false',
      enableOpenAIResponsesPayloadRules: 'true',
      openaiResponsesPayloadRules: JSON.stringify([
        { path: 'model', valueType: 'string', value: 'gpt-5' }
      ])
    })

    const result = await apiKeyService.getApiKeyById('key-1')

    expect(result.enableOpenAIResponsesCodexAdaptation).toBe(false)
    expect(result.enableOpenAIResponsesPayloadRules).toBe(true)
    expect(result.openaiResponsesPayloadRules).toEqual([
      { path: 'model', valueType: 'string', value: 'gpt-5' }
    ])
  })

  test('recordUsageWithDetails uses CostCalculator unknown fallback for missing model pricing', async () => {
    CostCalculator.calculateCost.mockReturnValue({
      costs: {
        input: 0.051618,
        output: 0.000765,
        cacheCreate: 0,
        cacheWrite: 0,
        cacheRead: 0.0006144,
        total: 0.0529974
      },
      debug: {
        usedFallbackPricing: true,
        pricingSource: 'unknown-fallback',
        isLongContextRequest: false
      },
      usingDynamicPricing: false
    })

    const result = await apiKeyService.recordUsageWithDetails(
      'key-1',
      {
        input_tokens: 17206,
        output_tokens: 51,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 2048
      },
      'mimo-v2.5-pro',
      'acct-1',
      'claude-console',
      {
        requestId: 'req-1',
        endpoint: '/api/v1/messages',
        method: 'POST',
        statusCode: 200
      }
    )

    expect(CostCalculator.calculateCost).toHaveBeenCalledWith(
      {
        input_tokens: 17206,
        output_tokens: 51,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 2048
      },
      'mimo-v2.5-pro'
    )
    expect(result.realCost).toBeCloseTo(0.0529974, 10)
    expect(result.ratedCost).toBeCloseTo(0.0529974, 10)
    expect(redis.incrementDailyCost.mock.calls[0][0]).toBe('key-1')
    expect(redis.incrementDailyCost.mock.calls[0][1]).toBeCloseTo(0.0529974, 10)
    expect(redis.incrementDailyCost.mock.calls[0][2]).toBeCloseTo(0.0529974, 10)
    expect(redis.addUsageRecord).toHaveBeenCalledWith(
      'key-1',
      expect.objectContaining({
        model: 'mimo-v2.5-pro',
        cost: 0.052997,
        realCost: 0.052997,
        usedFallbackPricing: true,
        pricingSource: 'unknown-fallback',
        costBreakdown: expect.objectContaining({
          input: 0.051618,
          output: 0.000765,
          cacheRead: 0.0006144,
          total: 0.0529974
        })
      })
    )
    expect(requestDetailService.captureRequestDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        model: 'mimo-v2.5-pro',
        cost: 0.052997,
        realCost: 0.052997,
        usedFallbackPricing: true,
        pricingSource: 'unknown-fallback'
      })
    )
  })
})
