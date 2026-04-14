/**
 * PricingService 长上下文计费测试
 *
 * 根据 Anthropic 官方定价页面（https://platform.claude.com/docs/en/about-claude/pricing）：
 * - 所有 Claude 模型均为统一价格，无论上下文长度如何（1M token 内无额外加价）
 * - Fast Mode 倍率仍适用（Opus 4.6）
 * - 非 Claude 模型的 200K+ 分层计费逻辑仍保留
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

describe('PricingService - Long Context Pricing', () => {
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

  describe('Claude 模型平坦计费（无 200K+ 加价）', () => {
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

    it('200001 tokens - Claude 模型应使用基础价格（无 200K+ 加价）', () => {
      const usage = {
        input_tokens: 200001,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // 官方定价：Claude 模型全局统一价格，超过 200K 不加价
      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
      expect(result.pricing.output).toBe(0.000015) // 基础价格
    })

    it('分散在各类 token 中总计超过 200K 时 Claude 仍使用基础价格', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 10000,
        cache_creation_input_tokens: 40000,
        cache_read_input_tokens: 20000
      }
      // Total: 150000 + 40000 + 20000 = 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
      expect(result.pricing.output).toBe(0.000015) // 基础价格
      expect(result.pricing.cacheCreate).toBe(0.00000375) // 基础价格
      expect(result.pricing.cacheRead).toBeCloseTo(0.0000003, 12) // 基础价格
    })

    it('仅 cache tokens 超过 200K 时 Claude 也使用基础价格', () => {
      const usage = {
        input_tokens: 50000,
        output_tokens: 5000,
        cache_creation_input_tokens: 100000,
        cache_read_input_tokens: 60000
      }
      // Total: 50000 + 100000 + 60000 = 210000 > 200000

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
    })

    it('claude-sonnet-4-5 超过 200K 时也使用基础价格', () => {
      const usage = {
        input_tokens: 300000,
        output_tokens: 5000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-5[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格 $3/MTok
      expect(result.pricing.output).toBe(0.000015) // 基础价格 $15/MTok
    })

    it('claude-sonnet-4-6 超过 200K 时也使用基础价格', () => {
      const usage = {
        input_tokens: 500000,
        output_tokens: 10000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-6[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格 $3/MTok
      expect(result.pricing.output).toBe(0.000015) // 基础价格 $15/MTok
    })
  })

  describe('详细缓存创建数据（ephemeral_5m / ephemeral_1h）', () => {
    it('超过 200K 时 Claude 缓存价格仍使用基础价格', () => {
      const usage = {
        input_tokens: 200001,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 5000,
          ephemeral_1h_input_tokens: 5000
        }
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      expect(result.isLongContextRequest).toBe(false)
      // ephemeral_5m: 5000 * 0.00000375 = 0.00001875（基础 cache_creation 价格）
      expect(result.ephemeral5mCost).toBeCloseTo(5000 * 0.00000375, 10)
      // ephemeral_1h: 5000 * 0.000006（基础 1hr cache 价格）
      expect(result.pricing.ephemeral1h).toBeCloseTo(0.000006, 10)
      expect(result.ephemeral1hCost).toBeCloseTo(5000 * 0.000006, 10)
    })
  })

  describe('context-1m beta header 不影响 Claude 计费', () => {
    it('无 [1m] 后缀但带 context-1m beta 且超过 200K，Claude 仍使用基础价格', () => {
      const usage = {
        input_tokens: 210000,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        request_anthropic_beta: 'context-1m-2025-08-07'
      }

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514')

      // Claude 模型统一定价，无论是否带 beta 头都不应有额外加价
      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBe(0.000003) // 基础价格
      expect(result.pricing.output).toBe(0.000015) // 基础价格
    })
  })

  describe('Fast Mode 计费（Opus 4.6）', () => {
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

    it('Opus 4.6 在 fast-mode + [1m] 且超过 200K 时不叠加长上下文加价', () => {
      const usage = {
        input_tokens: 210000,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 10000,
        request_anthropic_beta: 'fast-mode-2026-02-01,context-1m-2025-08-07',
        speed: 'fast'
      }

      const result = pricingService.calculateCost(usage, 'claude-opus-4-6[1m]')

      expect(result.isLongContextRequest).toBe(false)
      // input: 0.000005（200K+ 维持同价）-> fast 6x => 0.00003
      expect(result.pricing.input).toBeCloseTo(0.00003, 12)
      // output: 0.000025（200K+ 维持同价）-> fast 6x => 0.00015
      expect(result.pricing.output).toBeCloseTo(0.00015, 12)
    })

    it('Opus 4.6 在 [1m] 且超过 200K、未开启 fast-mode 时保持基础价格', () => {
      const usage = {
        input_tokens: 210000,
        output_tokens: 1000,
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 10000,
        request_anthropic_beta: 'context-1m-2025-08-07'
      }

      const result = pricingService.calculateCost(usage, 'claude-opus-4-6[1m]')

      expect(result.isLongContextRequest).toBe(false)
      expect(result.pricing.input).toBeCloseTo(0.000005, 12)
      expect(result.pricing.output).toBeCloseTo(0.000025, 12)
      expect(result.pricing.cacheCreate).toBeCloseTo(0.00000625, 12)
      expect(result.pricing.cacheRead).toBeCloseTo(0.0000005, 12)
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

  describe('成本计算准确性（基础价格）', () => {
    it('应正确以基础价格计算超过 200K 场景下的总成本', () => {
      const usage = {
        input_tokens: 150000,
        output_tokens: 10000,
        cache_creation_input_tokens: 40000,
        cache_read_input_tokens: 20000
      }
      // Total input: 210000 > 200000，但 Claude 使用基础价格

      const result = pricingService.calculateCost(usage, 'claude-sonnet-4-20250514[1m]')

      // 手动计算预期成本（全部使用基础价格）
      const expectedInputCost = 150000 * 0.000003 // $0.45
      const expectedOutputCost = 10000 * 0.000015 // $0.15
      const expectedCacheCreateCost = 40000 * 0.00000375 // $0.15
      const expectedCacheReadCost = 20000 * 0.0000003 // $0.006
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
