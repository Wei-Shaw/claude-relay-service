jest.mock('../src/services/pricingService', () => ({
  calculateCost: jest.fn(),
  getModelPricing: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  api: jest.fn(),
  security: jest.fn()
}))

// Streamed Claude response with server-side web search, shaped like the example in
// https://platform.claude.com/docs/en/build-with-claude/streaming ("Web search tool"):
// message_start reports only the prompt; the final message_delta usage is cumulative and carries the
// search results as input tokens plus server_tool_use.web_search_requests.
const MESSAGE_START_USAGE = {
  input_tokens: 2679,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 3
}
const MESSAGE_DELTA_USAGE = {
  input_tokens: 10682,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 510,
  server_tool_use: { web_search_requests: 1 }
}

const SONNET_PRICING = {
  input_cost_per_token: 0.000003,
  output_cost_per_token: 0.000015,
  cache_creation_input_token_cost: 0.00000375,
  cache_read_input_token_cost: 0.0000003,
  litellm_provider: 'anthropic',
  search_context_cost_per_query: {
    search_context_size_low: 0.01,
    search_context_size_medium: 0.01,
    search_context_size_high: 0.01
  }
}

describe('server tool usage billing', () => {
  let CostCalculator
  let pricingService

  beforeEach(() => {
    jest.resetModules()
    pricingService = require('../src/services/pricingService')
    CostCalculator = require('../src/utils/costCalculator')
    pricingService.calculateCost.mockReset()
    pricingService.getModelPricing.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('takes cumulative input tokens and server_tool_use from message_delta', () => {
    const anthropicUsage = require('../src/utils/anthropicUsage')
    const collected = { ...MESSAGE_START_USAGE, model: 'claude-sonnet-4-5-20250929' }
    anthropicUsage.mergeMessageDeltaUsage(collected, MESSAGE_DELTA_USAGE)

    expect(collected.input_tokens).toBe(10682)
    expect(collected.output_tokens).toBe(510)
    expect(collected.server_tool_use).toEqual({ web_search_requests: 1, web_fetch_requests: 0 })
  })

  it('keeps message_start counters when message_delta omits them', () => {
    const anthropicUsage = require('../src/utils/anthropicUsage')
    const collected = { ...MESSAGE_START_USAGE }
    anthropicUsage.mergeMessageDeltaUsage(collected, { output_tokens: 15 })

    expect(collected.input_tokens).toBe(2679)
    expect(collected.output_tokens).toBe(15)
    expect(collected.server_tool_use).toBeUndefined()
  })

  it('charges each web search at the configured per-query price', () => {
    pricingService.getModelPricing.mockReturnValue(SONNET_PRICING)

    const result = CostCalculator.calculateCost(
      {
        input_tokens: 64087,
        output_tokens: 840,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use: { web_search_requests: 8 }
      },
      'claude-sonnet-4-5-20250929'
    )

    expect(result.costs.webSearch).toBeCloseTo(0.08, 10)
    expect(result.costs.total).toBeCloseTo(64087 * 0.000003 + 840 * 0.000015 + 0.08, 10)
  })

  it('falls back to the Anthropic list price for Claude models without a per-query price', () => {
    pricingService.getModelPricing.mockReturnValue({
      ...SONNET_PRICING,
      search_context_cost_per_query: undefined
    })

    const result = CostCalculator.calculateCost(
      { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 3 } },
      'claude-haiku-4-5-20251001'
    )

    expect(result.costs.webSearch).toBeCloseTo(0.03, 10)
  })

  it('leaves requests without server tool use unchanged', () => {
    pricingService.getModelPricing.mockReturnValue(SONNET_PRICING)

    const result = CostCalculator.calculateCost(
      { input_tokens: 1000, output_tokens: 100 },
      'claude-sonnet-4-5-20250929'
    )

    expect(result.costs.webSearch).toBeUndefined()
    expect(result.costs.total).toBeCloseTo(1000 * 0.000003 + 100 * 0.000015, 10)
  })
})
