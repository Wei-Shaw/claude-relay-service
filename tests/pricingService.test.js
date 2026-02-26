/**
 * PricingService 长上下文（200K+）分层计费测试
 *
 * 测试当 [1m] 模型总输入超过 200K tokens 时的分层计费逻辑：
 * - 输入/输出优先使用 model_pricing.json 中的 *_above_200k_tokens 字段
 * - Claude 缓存价格按输入价格倍率推导：
 *   - 5m cache write = input * 1.25
 *   - 1h cache write = input * 2
 *   - cache read = input * 0.1
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
  const path = require('path')

  // 使用真实的 model_pricing.json 数据（优先 data/，fallback 到 resources/）
  const realFs = jest.requireActual('fs')
  const primaryPath = path.join(process.cwd(), 'data', 'model_pricing.json')
  const fallbackPath = path.join(
    process.cwd(),
    'resources',
    'model-pricing',
    'model_prices_and_context_window.json'
  )
  const pricingFilePath = realFs.existsSync(primaryPath) ? primaryPath : fallbackPath
  const pricingData = JSON.parse(realFs.readFileSync(pricingFilePath, 'utf8'))

  beforeEach(() => {
    // 清除缓存的模块
    jest.resetModules()

    // 配置 fs mock（防止 pricingService 初始化时的文件副作用）
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify(pricingData))
    fs.statSync.mockReturnValue({ mtime: new Date(), mtimeMs: Date.now() })
    fs.watchFile.mockImplementation(() => {})
    fs.unwatchFile.mockImplementation(() => {})

    // 重新加载 pricingService
    pricingService = require('../src/services/pricingService')

    // 直接设置真实价格数据（绕过网络初始化）
    pricingService.pricingData = pricingData
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
      expect(result.pricing.cacheRead).toBeCloseTo(0.0000006, 12)
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
      expect(result.pricing.cacheRead).toBeCloseTo(0.0000006, 12)
      expect(result.cacheReadCost).toBeCloseTo(60000 * 0.0000006, 10)
    })
  })

  describe('详细缓存创建数据（ephemeral_5m / ephemeral_1h）', () => {
    it('200K+ 时 Claude ephemeral_1h 应按 input * 2 计算', () => {
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
      // 200K+ input = 0.000006, ephemeral_1h = input * 2 = 0.000012
      expect(result.pricing.ephemeral1h).toBeCloseTo(0.000012, 10)
      expect(result.ephemeral1hCost).toBeCloseTo(5000 * 0.000012, 10)
    })
  })

  describe('回退测试', () => {
    it('Claude 模型无 above_200k 字段时，200K+ 输入价格按 2 倍并推导缓存价格', () => {
      const usage = {
        input_tokens: 250000,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 10000
      }

      const result = pricingService.calculateCost(usage, 'claude-3-haiku-20240307[1m]')

      // 模型没有 above_200k 字段，Claude 200K+ 输入按 2 倍兜底
      expect(result.isLongContextRequest).toBe(true)
      expect(result.pricing.input).toBe(0.0000005) // 0.00000025 * 2
      // 缓存价格由输入价格推导
      expect(result.pricing.cacheCreate).toBeCloseTo(0.000000625, 12) // input * 1.25
      expect(result.pricing.cacheRead).toBeCloseTo(0.00000005, 12) // input * 0.1
    })
  })

  describe('Header 与 Fast Mode 适配', () => {
    it('无 [1m] 后缀但带 context-1m beta，超过 200K 时应触发长上下文计费', () => {
      const usage = {
        input_tokens: 210000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        request_anthropic_beta: 'context-1m-2025-08-07'
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514')

      expect(result.isLongContextRequest).toBe(true)
      expect(result.pricing.input).toBe(0.000006)
      expect(result.pricing.output).toBe(0.0000225)
    })

    it('Opus 4.6 在 fast-mode beta + speed=fast 时应用 Fast Mode 6x', () => {
      const usage = {
        input_tokens: 100000,
        output_tokens: 20000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 5000,
        request_anthropic_beta: 'fast-mode-2026-02-01',
        speed: 'fast'
      }

      const result = pricingService.calculateCost(usage, 'claude-opus-4-6')

      // input: 0.000005 * 6 = 0.00003
      expect(result.pricing.input).toBeCloseTo(0.00003, 12)
      // output: 0.000025 * 6 = 0.00015
      expect(result.pricing.output).toBeCloseTo(0.00015, 12)
      // cache create/read 由 fast 后 input 推导
      expect(result.pricing.cacheCreate).toBeCloseTo(0.0000375, 12) // 0.00003 * 1.25
      expect(result.pricing.cacheRead).toBeCloseTo(0.000003, 12) // 0.00003 * 0.1
      expect(result.pricing.ephemeral1h).toBeCloseTo(0.00006, 12) // 0.00003 * 2
    })

    it('Opus 4.6 在 fast-mode + [1m] 且超过 200K 时应叠加计费（12x input）', () => {
      const usage = {
        input_tokens: 210000,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 10000,
        request_anthropic_beta: 'fast-mode-2026-02-01,context-1m-2025-08-07',
        speed: 'fast'
      }

      const result = pricingService.calculateCost(usage, 'claude-opus-4-6[1m]')

      expect(result.isLongContextRequest).toBe(true)
      // input: 0.000005 -> long context 0.00001 -> fast 6x => 0.00006 (即标准 12x)
      expect(result.pricing.input).toBeCloseTo(0.00006, 12)
      // output: 0.000025 -> long context 0.0000375 -> fast 6x => 0.000225 (即标准 9x)
      expect(result.pricing.output).toBeCloseTo(0.000225, 12)
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
      expect(result.pricing.cacheRead).toBeCloseTo(0.0000003, 12) // 基础价格
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
