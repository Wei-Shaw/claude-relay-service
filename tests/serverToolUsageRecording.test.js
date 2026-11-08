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
  getApiKey: jest.fn(),
  setApiKey: jest.fn(),
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
  info: jest.fn(),
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

jest.mock('../src/services/pricingService', () => ({
  calculateCost: jest.fn(),
  getModelPricing: jest.fn()
}))

const redis = require('../src/models/redis')
const serviceRatesService = require('../src/services/serviceRatesService')
const billingEventPublisher = require('../src/services/billingEventPublisher')
const pricingService = require('../src/services/pricingService')
const apiKeyService = require('../src/services/apiKeyService')

const SONNET_PRICING = {
  input_cost_per_token: 0.000003,
  output_cost_per_token: 0.000015,
  cache_creation_input_token_cost: 0.00000375,
  cache_read_input_token_cost: 0.0000003,
  litellm_provider: 'anthropic',
  search_context_cost_per_query: { search_context_size_medium: 0.01 }
}

describe('apiKeyService.recordUsageWithDetails with server tool use', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    pricingService.getModelPricing.mockReturnValue(SONNET_PRICING)
    redis.getApiKey.mockResolvedValue({ id: 'key-1', name: 'Key', serviceRates: '{}' })
    redis.setApiKey.mockResolvedValue()
    redis.incrementTokenUsage.mockResolvedValue()
    redis.incrementDailyCost.mockResolvedValue()
    redis.incrementAccountUsage.mockResolvedValue()
    redis.addUsageRecord.mockResolvedValue()
    serviceRatesService.getService.mockReturnValue('claude')
    serviceRatesService.getServiceRate.mockResolvedValue(1)
    billingEventPublisher.publishBillingEvent.mockResolvedValue()
  })

  const record = (usage) =>
    apiKeyService.recordUsageWithDetails(
      'key-1',
      usage,
      'claude-sonnet-4-5-20250929',
      'acct-1',
      'claude-official',
      { requestId: 'req-1', endpoint: '/api/v1/messages', method: 'POST', statusCode: 200 }
    )

  it('adds the per-search fee to the cost counters that enforce the key cost limits', async () => {
    const result = await record({
      input_tokens: 10682,
      output_tokens: 510,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: 3 }
    })

    const expected = 10682 * 0.000003 + 510 * 0.000015 + 3 * 0.01
    expect(result.realCost).toBeCloseTo(expected, 10)
    expect(redis.incrementDailyCost).toHaveBeenCalledTimes(1)
    expect(redis.incrementDailyCost.mock.calls[0][2]).toBeCloseTo(expected, 10)

    const [, usageRecord] = redis.addUsageRecord.mock.calls[0]
    expect(usageRecord.realCostBreakdown.webSearch).toBeCloseTo(0.03, 10)
    expect(usageRecord.realCost).toBeCloseTo(Number(expected.toFixed(6)), 10)
  })

  it('records token cost only when the response reports no server tool use', async () => {
    const result = await record({
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    })

    expect(result.realCost).toBeCloseTo(1000 * 0.000003 + 100 * 0.000015, 10)
    const [, usageRecord] = redis.addUsageRecord.mock.calls[0]
    expect(usageRecord.realCostBreakdown.webSearch).toBe(0)
  })
})
