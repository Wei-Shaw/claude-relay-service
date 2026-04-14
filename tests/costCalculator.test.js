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

describe('CostCalculator', () => {
  let CostCalculator
  let pricingService
  let logger

  beforeEach(() => {
    jest.resetModules()

    pricingService = require('../src/services/pricingService')
    logger = require('../src/utils/logger')
    CostCalculator = require('../src/utils/costCalculator')

    jest.clearAllMocks()
    pricingService.calculateCost.mockReset()
    pricingService.getModelPricing.mockReset()
  })

  it('uses detailed pricing when pricingService returns a complete result', () => {
    pricingService.calculateCost.mockReturnValue({
      hasPricing: true,
      isLongContextRequest: false,
      inputCost: 0.003,
      outputCost: 0.0075,
      cacheCreateCost: 0.00075,
      cacheReadCost: 0.00003,
      totalCost: 0.01128,
      pricing: {
        input: 0.000003,
        output: 0.000015,
        cacheCreate: 0.00000375,
        cacheRead: 0.0000003
      }
    })

    const result = CostCalculator.calculateCost(
      {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 100,
        cache_creation: {
          ephemeral_5m_input_tokens: 200,
          ephemeral_1h_input_tokens: 0
        }
      },
      'claude-sonnet-4-20250514'
    )

    expect(result.usingDynamicPricing).toBe(true)
    expect(result.pricing.input).toBe(3)
    expect(result.pricing.cacheWrite).toBe(3.75)
    expect(result.costs.total).toBeCloseTo(0.01128, 10)
    expect(result.debug.usedFallbackPricing).toBe(false)
    expect(result.debug.pricingSource).toBe('dynamic')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('falls back to unknown pricing for detailed-cache requests with missing model pricing', () => {
    pricingService.calculateCost.mockReturnValue({
      hasPricing: false,
      totalCost: 0,
      isLongContextRequest: false
    })
    pricingService.getModelPricing.mockReturnValue(null)

    const usage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
      cache_creation: {
        ephemeral_5m_input_tokens: 100,
        ephemeral_1h_input_tokens: 100
      }
    }

    const first = CostCalculator.calculateCost(usage, 'kimi-k2.5')
    const second = CostCalculator.calculateCost(usage, 'kimi-k2.5')

    expect(first.usingDynamicPricing).toBe(false)
    expect(first.pricing.input).toBe(3)
    expect(first.pricing.cacheWrite).toBe(3.75)
    expect(first.costs.total).toBeCloseTo(0.01128, 10)
    expect(first.debug.usedFallbackPricing).toBe(true)
    expect(first.debug.pricingSource).toBe('unknown-fallback')
    expect(second.costs.total).toBeCloseTo(first.costs.total, 10)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('kimi-k2.5')
  })

  it('falls back instead of throwing for unknown long-context models', () => {
    pricingService.calculateCost.mockReturnValue({
      hasPricing: false,
      totalCost: 0,
      isLongContextRequest: false
    })
    pricingService.getModelPricing.mockReturnValue(null)

    const result = CostCalculator.calculateCost(
      {
        input_tokens: 250000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      'mystery-model[1m]'
    )

    expect(result.usingDynamicPricing).toBe(false)
    expect(result.costs.total).toBeCloseTo(0.765, 10)
    expect(result.debug.usedFallbackPricing).toBe(true)
    expect(result.debug.isLongContextModel).toBe(true)
    expect(result.debug.pricingSource).toBe('unknown-fallback')
  })

  it('keeps the legacy dynamic-pricing path for regular requests', () => {
    pricingService.getModelPricing.mockReturnValue({
      input_cost_per_token: 0.000002,
      output_cost_per_token: 0.000008,
      cache_creation_input_token_cost: 0.0000025,
      cache_read_input_token_cost: 0.0000002
    })

    const result = CostCalculator.calculateCost(
      {
        input_tokens: 2000,
        output_tokens: 1000,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 250
      },
      'glm-5'
    )

    expect(pricingService.calculateCost).not.toHaveBeenCalled()
    expect(result.usingDynamicPricing).toBe(true)
    expect(result.pricing.input).toBe(2)
    expect(result.pricing.output).toBe(8)
    expect(result.costs.total).toBeCloseTo(0.0133, 10)
    expect(result.debug.usedFallbackPricing).toBe(false)
    expect(result.debug.pricingSource).toBe('dynamic')
  })
})
