const pricingService = require('../services/pricingService')
const logger = require('./logger')

const warnedDetailedPricingFallbackModels = new Set()

// Claude模型价格配置 (USD per 1M tokens) - 备用定价
const MODEL_PRICING = {
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20241022': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3
  },
  'claude-sonnet-4-20250514': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3
  },

  // Claude 3.5 Haiku
  'claude-3-5-haiku-20241022': {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.3,
    cacheRead: 0.03
  },

  // Claude 3 Opus
  'claude-3-opus-20240229': {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5
  },

  // Claude Opus 4.1 (新模型)
  'claude-opus-4-1-20250805': {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5
  },

  // Claude 3 Sonnet
  'claude-3-sonnet-20240229': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3
  },

  // Claude 3 Haiku
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.3,
    cacheRead: 0.03
  },

  // 默认定价（用于未知模型）
  unknown: {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3
  }
}

class CostCalculator {
  static isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
  }

  static isDetailedPricingRequest(usage, model = 'unknown') {
    return (
      (usage.cache_creation && typeof usage.cache_creation === 'object') ||
      (typeof model === 'string' && model.includes('[1m]'))
    )
  }

  static isValidPricingServiceResult(result) {
    return (
      result &&
      result.hasPricing === true &&
      result.pricing &&
      this.isFiniteNumber(result.pricing.input) &&
      this.isFiniteNumber(result.pricing.output) &&
      this.isFiniteNumber(result.pricing.cacheCreate) &&
      this.isFiniteNumber(result.pricing.cacheRead) &&
      this.isFiniteNumber(result.inputCost) &&
      this.isFiniteNumber(result.outputCost) &&
      this.isFiniteNumber(result.cacheCreateCost) &&
      this.isFiniteNumber(result.cacheReadCost) &&
      this.isFiniteNumber(result.totalCost)
    )
  }

  static isOpenAIModel(model, pricingData = null) {
    if (typeof model === 'string' && (model.includes('gpt') || model.includes('o1'))) {
      return true
    }

    return pricingData?.litellm_provider === 'openai'
  }

  static getPricingSource(model, pricingData) {
    if (pricingData) {
      return 'dynamic'
    }

    if (MODEL_PRICING[model]) {
      return 'static'
    }

    return 'unknown-fallback'
  }

  static logDetailedPricingFallback(model, usage, result) {
    const warnKey = typeof model === 'string' && model ? model : 'unknown'

    if (warnedDetailedPricingFallbackModels.has(warnKey)) {
      return
    }

    warnedDetailedPricingFallbackModels.add(warnKey)

    const hasDetailedCache = !!(usage.cache_creation && typeof usage.cache_creation === 'object')
    const isLongContextModel = typeof model === 'string' && model.includes('[1m]')

    logger.warn(
      `💰 Missing detailed pricing for model ${warnKey}; using fallback pricing ` +
        `(hasPricing=${result?.hasPricing === true}, cacheCreation=${hasDetailedCache}, longContext=${isLongContextModel})`
    )
  }

  static buildDetailedPricingResult(usage, model, result) {
    return {
      model,
      pricing: {
        input: result.pricing.input * 1000000, // 转换为 per 1M tokens
        output: result.pricing.output * 1000000,
        cacheWrite: result.pricing.cacheCreate * 1000000,
        cacheRead: result.pricing.cacheRead * 1000000
      },
      usingDynamicPricing: true,
      isLongContextRequest: result.isLongContextRequest || false,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        totalTokens:
          (usage.input_tokens || 0) +
          (usage.output_tokens || 0) +
          (usage.cache_creation_input_tokens || 0) +
          (usage.cache_read_input_tokens || 0)
      },
      costs: {
        input: result.inputCost,
        output: result.outputCost,
        cacheWrite: result.cacheCreateCost,
        cacheRead: result.cacheReadCost,
        total: result.totalCost
      },
      formatted: {
        input: this.formatCost(result.inputCost),
        output: this.formatCost(result.outputCost),
        cacheWrite: this.formatCost(result.cacheCreateCost),
        cacheRead: this.formatCost(result.cacheReadCost),
        total: this.formatCost(result.totalCost)
      },
      debug: {
        isOpenAIModel: this.isOpenAIModel(model),
        hasCacheCreatePrice: !!result.pricing.cacheCreate,
        cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        cacheWritePriceUsed: result.pricing.cacheCreate * 1000000,
        isLongContextModel: typeof model === 'string' && model.includes('[1m]'),
        isLongContextRequest: result.isLongContextRequest || false,
        usedFallbackPricing: false,
        pricingSource: 'dynamic'
      }
    }
  }

  static buildLegacyCostResult(usage, model = 'unknown', serviceTier = null, options = {}) {
    const safeModel = typeof model === 'string' && model ? model : 'unknown'

    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const cacheCreateTokens = usage.cache_creation_input_tokens || 0
    const cacheReadTokens = usage.cache_read_input_tokens || 0

    const pricingData = pricingService.getModelPricing(safeModel)
    const pricingSource = this.getPricingSource(safeModel, pricingData)
    let pricing
    let usingDynamicPricing = false

    if (pricingData) {
      const usePriority = serviceTier === 'priority' && pricingData.supports_service_tier

      const inputPrice =
        ((usePriority && pricingData.input_cost_per_token_priority) ||
          pricingData.input_cost_per_token ||
          0) * 1000000
      const outputPrice =
        ((usePriority && pricingData.output_cost_per_token_priority) ||
          pricingData.output_cost_per_token ||
          0) * 1000000
      const cacheReadPrice =
        ((usePriority && pricingData.cache_read_input_token_cost_priority) ||
          pricingData.cache_read_input_token_cost ||
          0) * 1000000

      let cacheWritePrice = (pricingData.cache_creation_input_token_cost || 0) * 1000000

      if (
        this.isOpenAIModel(safeModel, pricingData) &&
        !pricingData.cache_creation_input_token_cost &&
        cacheCreateTokens > 0
      ) {
        cacheWritePrice = inputPrice
      }

      pricing = {
        input: inputPrice,
        output: outputPrice,
        cacheWrite: cacheWritePrice,
        cacheRead: cacheReadPrice
      }
      usingDynamicPricing = true
    } else {
      pricing = MODEL_PRICING[safeModel] || MODEL_PRICING['unknown']
    }

    const inputCost = (inputTokens / 1000000) * pricing.input
    const outputCost = (outputTokens / 1000000) * pricing.output
    const cacheWriteCost = (cacheCreateTokens / 1000000) * pricing.cacheWrite
    const cacheReadCost = (cacheReadTokens / 1000000) * pricing.cacheRead

    const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost

    return {
      model: safeModel,
      pricing,
      usingDynamicPricing,
      usage: {
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        totalTokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
      },
      costs: {
        input: inputCost,
        output: outputCost,
        cacheWrite: cacheWriteCost,
        cacheRead: cacheReadCost,
        total: totalCost
      },
      formatted: {
        input: this.formatCost(inputCost),
        output: this.formatCost(outputCost),
        cacheWrite: this.formatCost(cacheWriteCost),
        cacheRead: this.formatCost(cacheReadCost),
        total: this.formatCost(totalCost)
      },
      debug: {
        isOpenAIModel: this.isOpenAIModel(safeModel, pricingData),
        hasCacheCreatePrice: !!pricingData?.cache_creation_input_token_cost,
        cacheCreateTokens,
        cacheWritePriceUsed: pricing.cacheWrite,
        isLongContextModel: typeof safeModel === 'string' && safeModel.includes('[1m]'),
        isLongContextRequest: false,
        usedFallbackPricing:
          options.usedFallbackPricing === true || pricingSource === 'unknown-fallback',
        pricingSource
      }
    }
  }

  /**
   * 计算单次请求的费用
   * @param {Object} usage - 使用量数据
   * @param {number} usage.input_tokens - 输入token数量
   * @param {number} usage.output_tokens - 输出token数量
   * @param {number} usage.cache_creation_input_tokens - 缓存创建token数量
   * @param {number} usage.cache_read_input_tokens - 缓存读取token数量
   * @param {string} model - 模型名称
   * @returns {Object} 费用详情
   */
  static calculateCost(usage, model = 'unknown', serviceTier = null) {
    // 如果 usage 包含详细的 cache_creation 对象或是 1M 模型，优先使用 pricingService
    if (this.isDetailedPricingRequest(usage, model)) {
      const result = pricingService.calculateCost(usage, model)
      if (this.isValidPricingServiceResult(result)) {
        return this.buildDetailedPricingResult(usage, model, result)
      }

      this.logDetailedPricingFallback(model, usage, result)

      return this.buildLegacyCostResult(usage, model, serviceTier, {
        usedFallbackPricing: true
      })
    }

    return this.buildLegacyCostResult(usage, model, serviceTier)
  }

  /**
   * 计算聚合使用量的费用
   * @param {Object} aggregatedUsage - 聚合使用量数据
   * @param {string} model - 模型名称
   * @returns {Object} 费用详情
   */
  static calculateAggregatedCost(aggregatedUsage, model = 'unknown') {
    const usage = {
      input_tokens: aggregatedUsage.inputTokens || aggregatedUsage.totalInputTokens || 0,
      output_tokens: aggregatedUsage.outputTokens || aggregatedUsage.totalOutputTokens || 0,
      cache_creation_input_tokens:
        aggregatedUsage.cacheCreateTokens || aggregatedUsage.totalCacheCreateTokens || 0,
      cache_read_input_tokens:
        aggregatedUsage.cacheReadTokens || aggregatedUsage.totalCacheReadTokens || 0
    }

    // 如果有 ephemeral 拆分数据，构建 cache_creation 子对象
    const eph5m = aggregatedUsage.ephemeral5mTokens || aggregatedUsage.totalEphemeral5mTokens || 0
    const eph1h = aggregatedUsage.ephemeral1hTokens || aggregatedUsage.totalEphemeral1hTokens || 0
    if (eph5m > 0 || eph1h > 0) {
      usage.cache_creation = {
        ephemeral_5m_input_tokens: eph5m,
        ephemeral_1h_input_tokens: eph1h
      }
    }

    return this.calculateCost(usage, model)
  }

  /**
   * 获取模型定价信息
   * @param {string} model - 模型名称
   * @returns {Object} 定价信息
   */
  static getModelPricing(model = 'unknown') {
    // 特殊处理：gpt-5-codex 回退到 gpt-5（如果没有专门定价）
    if (model === 'gpt-5-codex' && !MODEL_PRICING['gpt-5-codex']) {
      const gpt5Pricing = MODEL_PRICING['gpt-5']
      if (gpt5Pricing) {
        console.log(`Using gpt-5 pricing as fallback for ${model}`)
        return gpt5Pricing
      }
    }
    return MODEL_PRICING[model] || MODEL_PRICING['unknown']
  }

  /**
   * 获取所有支持的模型和定价
   * @returns {Object} 所有模型定价
   */
  static getAllModelPricing() {
    return { ...MODEL_PRICING }
  }

  /**
   * 验证模型是否支持
   * @param {string} model - 模型名称
   * @returns {boolean} 是否支持
   */
  static isModelSupported(model) {
    return !!MODEL_PRICING[model]
  }

  /**
   * 格式化费用显示
   * @param {number} cost - 费用金额
   * @param {number} decimals - 小数位数
   * @returns {string} 格式化的费用字符串
   */
  static formatCost(cost, decimals = 6) {
    if (cost >= 1) {
      return `$${cost.toFixed(2)}`
    } else if (cost >= 0.001) {
      return `$${cost.toFixed(4)}`
    } else {
      return `$${cost.toFixed(decimals)}`
    }
  }

  /**
   * 计算费用节省（使用缓存的节省）
   * @param {Object} usage - 使用量数据
   * @param {string} model - 模型名称
   * @returns {Object} 节省信息
   */
  static calculateCacheSavings(usage, model = 'unknown') {
    const pricing = this.getModelPricing(model) // 已包含 gpt-5-codex 回退逻辑
    const cacheReadTokens = usage.cache_read_input_tokens || 0

    // 如果这些token不使用缓存，需要按正常input价格计费
    const normalCost = (cacheReadTokens / 1000000) * pricing.input
    const cacheCost = (cacheReadTokens / 1000000) * pricing.cacheRead
    const savings = normalCost - cacheCost
    const savingsPercentage = normalCost > 0 ? (savings / normalCost) * 100 : 0

    return {
      normalCost,
      cacheCost,
      savings,
      savingsPercentage,
      formatted: {
        normalCost: this.formatCost(normalCost),
        cacheCost: this.formatCost(cacheCost),
        savings: this.formatCost(savings),
        savingsPercentage: `${savingsPercentage.toFixed(1)}%`
      }
    }
  }
}

module.exports = CostCalculator
