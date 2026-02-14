/**
 * PricingService 长上下文（200K+）分层计费测试
 *
 * 测试当 [1m] 模型总输入超过 200K tokens 时的分层计费逻辑：
 * - 使用 model_pricing.json 中的 *_above_200k_tokens 字段
 * - 所有 token 类型（input/output/cache_create/cache_read）都切换到高档价格
 */

// Mock logger to avoid console output during tests
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

// Mock fs to control pricing data
jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn(),
    watchFile: jest.fn(),
    unwatchFile: jest.fn()
  }
})

describe('PricingService - 200K+ Long Context Pricing', () => {
  let pricingService
  const fs = require('fs')

  // 模拟 claude-sonnet-4-20250514 的完整价格数据（来自 model_pricing.json）
  const mockPricingData = {
    'claude-sonnet-4-20250514': {
      input_cost_per_token: 0.000003, // $3/MTok
      output_cost_per_token: 0.000015, // $15/MTok
      cache_creation_input_token_cost: 0.00000375, // $3.75/MTok
      cache_read_input_token_cost: 0.0000003, // $0.30/MTok
      // 200K+ 高档价格
      input_cost_per_token_above_200k_tokens: 0.000006, // $6/MTok (2x)
      output_cost_per_token_above_200k_tokens: 0.0000225, // $22.50/MTok (1.5x)
      cache_creation_input_token_cost_above_200k_tokens: 0.0000075, // $7.50/MTok (2x)
      cache_read_input_token_cost_above_200k_tokens: 0.0000006, // $0.60/MTok (2x)
      // 1小时缓存价格
      cache_creation_input_token_cost_above_1hr: 0.0000075,
      cache_creation_input_token_cost_above_1hr_above_200k_tokens: 0.000015
    },
    // 没有 above_200k 字段的模型
    'claude-3-haiku-20240307': {
      input_cost_per_token: 0.00000025,
      output_cost_per_token: 0.00000125,
      cache_creation_input_token_cost: 0.0000003,
      cache_read_input_token_cost: 0.00000003
    }
  }

  beforeEach(() => {
    // 清除缓存的模块
    jest.resetModules()

    // 配置 fs mock
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify(mockPricingData))
    fs.statSync.mockReturnValue({ mtime: new Date(), mtimeMs: Date.now() })
    fs.watchFile.mockImplementation(() => {})
    fs.unwatchFile.mockImplementation(() => {})

    // 重新加载 pricingService
    pricingService = require('../src/services/pricingService')

    // 直接设置价格数据（绕过初始化）
    pricingService.pricingData = mockPricingData
    pricingService.lastUpdated = new Date()
  })

  afterEach(() => {
    // 清理定时器
    if (pricingService.cleanup) {
      pricingService.cleanup()
    }
    jest.clearAllMocks()
  })

  describe('阈值边界测试', () => {
    it('199999 tokens - 应使用基础价格', () => {
      const usage = {
        input_tokens: 199999,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
      expect(result.pricing.output).toBe(0.000015) // 基础价格
    })

    it('200000 tokens - 应使用基础价格（边界不触发）', () => {
      const usage = {
        input_tokens: 200000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // 200000 不大于 200000，所以不触发高档价格
      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
    })

    it('200001 tokens - 应使用 200K+ 高档价格', () => {
      const usage = {
        input_tokens: 200001,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(true)
      expect(result.pricing.input).toBe(0.000006) // 200K+ 高档价格
      expect(result.pricing.output).toBe(0.0000225) // 200K+ 高档价格
    })
  })

  describe('总输入计算（input + cache_creation + cache_read）', () => {
    it('分散在各类 token 中总计超过 200K 应触发高档价格', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 10000,
        cache_creation_input_tokens: 40000,
        cache_read_input_tokens: 20000
      }
      // Total: 150000 + 40000 + 20000 = 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(true)
      expect(result.pricing.input).toBe(0.000006)
      expect(result.pricing.output).toBe(0.0000225)
      expect(result.pricing.cacheCreate).toBe(0.0000075)
      expect(result.pricing.cacheRead).toBe(0.0000006)
    })

    it('仅 cache_creation + cache_read 超过 200K 也应触发', () => {
      const usage = {
        input_tokens: 50000,
        output_tokens: 5000,
        cache_creation_input_tokens: 100000,
        cache_read_input_tokens: 60000
      }
      // Total: 50000 + 100000 + 60000 = 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(true)
    })
  })

  describe('Cache 高档价格测试', () => {
    it('cache_creation 应使用 cache_creation_input_token_cost_above_200k_tokens', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 1000,
        cache_creation_input_tokens: 60000, // 60K cache creation
        cache_read_input_tokens: 0
      }
      // Total: 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // cache_creation_input_token_cost_above_200k_tokens = 0.0000075
      expect(result.pricing.cacheCreate).toBe(0.0000075)
      expect(result.cacheCreateCost).toBeCloseTo(60000 * 0.0000075, 10)
    })

    it('cache_read 应使用 cache_read_input_token_cost_above_200k_tokens', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 60000 // 60K cache read
      }
      // Total: 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // cache_read_input_token_cost_above_200k_tokens = 0.0000006
      expect(result.pricing.cacheRead).toBe(0.0000006)
      expect(result.cacheReadCost).toBeCloseTo(60000 * 0.0000006, 10)
    })
  })

  describe('详细缓存创建数据（ephemeral_5m / ephemeral_1h）', () => {
    it('200K+ 时 ephemeral_1h 应使用 cache_creation_input_token_cost_above_1hr_above_200k_tokens', () => {
      const usage = {
        input_tokens: 200001,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000, // 向后兼容字段
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 5000,
          ephemeral_1h_input_tokens: 5000
        }
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(true)
      // ephemeral_5m: 5000 * 0.0000075 = 0.0000375
      expect(result.ephemeral5mCost).toBeCloseTo(5000 * 0.0000075, 10)
      // ephemeral_1h: 5000 * 0.000015 (above_1hr_above_200k)
      expect(result.ephemeral1hCost).toBeCloseTo(5000 * 0.000015, 10)
    })
  })

  describe('回退测试', () => {
    it('模型无 above_200k 字段时回退到基础价格', () => {
      const usage = {
        input_tokens: 250000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-3-haiku-20240307[1m]')

      // 模型没有 above_200k 字段，使用基础价格
      expect(result.isLongContextRequest).toBe(true) // 超过 200K
      expect(result.pricing.input).toBe(0.00000025) // 基础价格（没有 above_200k 字段）
      expect(result.pricing.cacheCreate).toBe(0.0000003) // 基础价格
    })
  })

  describe('兼容性测试', () => {
    it('非 [1m] 模型不受影响，始终使用基础价格', () => {
      const usage = {
        input_tokens: 250000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      // 不带 [1m] 后缀
      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
      expect(result.pricing.output).toBe(0.000015) // 基础价格
      expect(result.pricing.cacheCreate).toBe(0.00000375) // 基础价格
      expect(result.pricing.cacheRead).toBe(0.0000003) // 基础价格
    })

    it('[1m] 模型未超过 200K 时使用基础价格', () => {
      const usage = {
        input_tokens: 100000,
        output_tokens: 1000,
        cache_creation_input_tokens: 50000,
        cache_read_input_tokens: 49000
      }
      // Total: 199000 < 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
    })

    it('无定价数据时返回 hasPricing=false', () => {
      const usage = {
        input_tokens: 250000,
        output_tokens: 1000
      }

      const result = pricingService.calculateCost(usage, 'unknown-model[1m]')

      expect(result.hasPricing).toBe(false)
      expect(result.totalCost).toBe(0)
    })
  })

  describe('成本计算准确性', () => {
    it('应正确计算 200K+ 场景下的总成本', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 10000,
        cache_creation_input_tokens: 40000,
        cache_read_input_tokens: 20000
      }
      // Total input: 210000 > 200000 → 使用 200K+ 价格

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // 手动计算预期成本
      const expectedInputCost = 150000 * 0.000006 // $0.9
      const expectedOutputCost = 10000 * 0.0000225 // $0.225
      const expectedCacheCreateCost = 40000 * 0.0000075 // $0.3
      const expectedCacheReadCost = 20000 * 0.0000006 // $0.012
      const expectedTotal =
        expectedInputCost + expectedOutputCost + expectedCacheCreateCost + expectedCacheReadCost

      expect(result.inputCost).toBeCloseTo(expectedInputCost, 10)
      expect(result.outputCost).toBeCloseTo(expectedOutputCost, 10)
      expect(result.cacheCreateCost).toBeCloseTo(expectedCacheCreateCost, 10)
      expect(result.cacheReadCost).toBeCloseTo(expectedCacheReadCost, 10)
      expect(result.totalCost).toBeCloseTo(expectedTotal, 10)
    })
  })
})
