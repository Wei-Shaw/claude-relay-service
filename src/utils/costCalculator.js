const pricingService = require('../services/pricingService')

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
  static calculateCost(usage, model = 'unknown') {
    // 如果 usage 包含详细的 cache_creation 对象或是 1M 模型，使用 pricingService 来处理
    if (
      (usage.cache_creation && typeof usage.cache_creation === 'object') ||
      (model && model.includes('[1m]'))
    ) {
      const result = pricingService.calculateCost(usage, model)
      // 转换 pricingService 返回的格式到 costCalculator 的格式
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
          isOpenAIModel: model.includes('gpt') || model.includes('o1'),
          hasCacheCreatePrice: !!result.pricing.cacheCreate,
          cacheCreateTokens: usage.cache_creation_input_tokens || 0,
          cacheWritePriceUsed: result.pricing.cacheCreate * 1000000,
          isLongContextModel: model && model.includes('[1m]'),
          isLongContextRequest: result.isLongContextRequest || false
        }
      }
    }

    // 否则使用旧的逻辑（向后兼容）
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const cacheCreateTokens = usage.cache_creation_input_tokens || 0
    const cacheReadTokens = usage.cache_read_input_tokens || 0

    // 优先使用动态价格服务
    const pricingData = pricingService.getModelPricing(model)
    let pricing
    let usingDynamicPricing = false

    if (pricingData) {
      // 转换动态价格格式为内部格式
      const inputPrice = (pricingData.input_cost_per_token || 0) * 1000000 // 转换为per 1M tokens
      const outputPrice = (pricingData.output_cost_per_token || 0) * 1000000
      const cacheReadPrice = (pricingData.cache_read_input_token_cost || 0) * 1000000

      // OpenAI 模型的特殊处理：
      // - 如果没有 cache_creation_input_token_cost，缓存创建按普通 input 价格计费
      // - Claude 模型有专门的 cache_creation_input_token_cost
      let cacheWritePrice = (pricingData.cache_creation_input_token_cost || 0) * 1000000

      // 检测是否为 OpenAI 模型（通过模型名或 litellm_provider）
      const isOpenAIModel =
        model.includes('gpt') || model.includes('o1') || pricingData.litellm_provider === 'openai'

      if (isOpenAIModel && !pricingData.cache_creation_input_token_cost && cacheCreateTokens > 0) {
        // OpenAI 模型：缓存创建按普通 input 价格计费
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
      // 回退到静态价格
      pricing = MODEL_PRICING[model] || MODEL_PRICING['unknown']
    }

    // 计算各类型token的费用 (USD)
    const inputCost = (inputTokens / 1000000) * pricing.input
    const outputCost = (outputTokens / 1000000) * pricing.output
    const cacheWriteCost = (cacheCreateTokens / 1000000) * pricing.cacheWrite
    const cacheReadCost = (cacheReadTokens / 1000000) * pricing.cacheRead

    const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost

    return {
      model,
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
      // 格式化的费用字符串
      formatted: {
        input: this.formatCost(inputCost),
        output: this.formatCost(outputCost),
        cacheWrite: this.formatCost(cacheWriteCost),
        cacheRead: this.formatCost(cacheReadCost),
        total: this.formatCost(totalCost)
      },
      // 添加调试信息
      debug: {
        isOpenAIModel: model.includes('gpt') || model.includes('o1'),
        hasCacheCreatePrice: !!pricingData?.cache_creation_input_token_cost,
        cacheCreateTokens,
        cacheWritePriceUsed: pricing.cacheWrite
      }
    }
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
