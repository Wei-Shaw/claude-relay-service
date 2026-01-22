/**
 * 服务倍率配置服务
 * 管理不同服务的消费倍率，以 Claude 为基准（倍率 1.0）
 * 用于聚合 Key 的虚拟额度计算
 */
const redis = require('../models/redis')
const logger = require('../utils/logger')

class ServiceRatesService {
  constructor() {
    this.CONFIG_KEY = 'system:service_rates'
    this.cachedRates = null
    this.cacheExpiry = 0
    this.CACHE_TTL = 60 * 1000 // 1分钟缓存
  }

  /**
   * 获取默认倍率配置
   */
  getDefaultRates() {
    return {
      baseService: 'claude',
      rates: {
        claude: 1.0, // 基准：1 USD = 1 CC额度
        codex: 1.0,
        gemini: 1.0,
        droid: 1.0,
        bedrock: 1.0,
        azure: 1.0,
        ccr: 1.0
      },
      updatedAt: null,
      updatedBy: null
    }
  }

  /**
   * 获取倍率配置（带缓存）
   */
  async getRates() {
    try {
      // 检查缓存
      if (this.cachedRates && Date.now() < this.cacheExpiry) {
        return this.cachedRates
      }

      const configStr = await redis.client.get(this.CONFIG_KEY)
      if (!configStr) {
        const defaultRates = this.getDefaultRates()
        this.cachedRates = defaultRates
        this.cacheExpiry = Date.now() + this.CACHE_TTL
        return defaultRates
      }

      const storedConfig = JSON.parse(configStr)
      // 合并默认值，确保新增服务有默认倍率
      const defaultRates = this.getDefaultRates()
      storedConfig.rates = {
        ...defaultRates.rates,
        ...storedConfig.rates
      }

      this.cachedRates = storedConfig
      this.cacheExpiry = Date.now() + this.CACHE_TTL
      return storedConfig
    } catch (error) {
      logger.error('获取服务倍率配置失败:', error)
      return this.getDefaultRates()
    }
  }

  /**
   * 保存倍率配置
   */
  async saveRates(config, updatedBy = 'admin') {
    try {
      const defaultRates = this.getDefaultRates()

      // 验证配置
      this.validateRates(config)

      const newConfig = {
        baseService: config.baseService || defaultRates.baseService,
        rates: {
          ...defaultRates.rates,
          ...config.rates
        },
        updatedAt: new Date().toISOString(),
        updatedBy
      }

      await redis.client.set(this.CONFIG_KEY, JSON.stringify(newConfig))

      // 清除缓存
      this.cachedRates = null
      this.cacheExpiry = 0

      logger.info(`✅ 服务倍率配置已更新 by ${updatedBy}`)
      return newConfig
    } catch (error) {
      logger.error('保存服务倍率配置失败:', error)
      throw error
    }
  }

  /**
   * 验证倍率配置
   */
  validateRates(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('无效的配置格式')
    }

    if (config.rates) {
      for (const [service, rate] of Object.entries(config.rates)) {
        if (typeof rate !== 'number' || rate <= 0) {
          throw new Error(`服务 ${service} 的倍率必须是正数`)
        }
      }
    }
  }

  /**
   * 获取单个服务的倍率
   */
  async getServiceRate(service) {
    const config = await this.getRates()
    return config.rates[service] || 1.0
  }

  /**
   * 计算消费的 CC 额度
   * @param {number} costUSD - 真实成本（USD）
   * @param {string} service - 服务类型
   * @returns {number} CC 额度消耗
   */
  async calculateQuotaConsumption(costUSD, service) {
    const rate = await this.getServiceRate(service)
    return costUSD * rate
  }

  /**
   * 根据模型名称获取服务类型
   */
  getServiceFromModel(model) {
    if (!model) {
      return 'claude'
    }

    const modelLower = model.toLowerCase()

    // Claude 系列
    if (
      modelLower.includes('claude') ||
      modelLower.includes('anthropic') ||
      modelLower.includes('opus') ||
      modelLower.includes('sonnet') ||
      modelLower.includes('haiku')
    ) {
      return 'claude'
    }

    // OpenAI / Codex 系列
    if (
      modelLower.includes('gpt') ||
      modelLower.includes('o1') ||
      modelLower.includes('o3') ||
      modelLower.includes('o4') ||
      modelLower.includes('codex') ||
      modelLower.includes('davinci') ||
      modelLower.includes('curie') ||
      modelLower.includes('babbage') ||
      modelLower.includes('ada')
    ) {
      return 'codex'
    }

    // Gemini 系列
    if (
      modelLower.includes('gemini') ||
      modelLower.includes('palm') ||
      modelLower.includes('bard')
    ) {
      return 'gemini'
    }

    // Droid 系列
    if (modelLower.includes('droid') || modelLower.includes('factory')) {
      return 'droid'
    }

    // Bedrock 系列（通常带有 aws 或特定前缀）
    if (
      modelLower.includes('bedrock') ||
      modelLower.includes('amazon') ||
      modelLower.includes('titan')
    ) {
      return 'bedrock'
    }

    // Azure 系列
    if (modelLower.includes('azure')) {
      return 'azure'
    }

    // 默认返回 claude
    return 'claude'
  }

  /**
   * 根据账户类型获取服务类型（优先级高于模型推断）
   */
  getServiceFromAccountType(accountType) {
    if (!accountType) {
      return null
    }

    const mapping = {
      claude: 'claude',
      'claude-official': 'claude',
      'claude-console': 'claude',
      ccr: 'ccr',
      bedrock: 'bedrock',
      gemini: 'gemini',
      'openai-responses': 'codex',
      openai: 'codex',
      azure: 'azure',
      'azure-openai': 'azure',
      droid: 'droid'
    }

    return mapping[accountType] || null
  }

  /**
   * 获取服务类型（优先 accountType，后备 model）
   */
  getService(accountType, model) {
    return this.getServiceFromAccountType(accountType) || this.getServiceFromModel(model)
  }

  /**
   * 获取所有支持的服务列表
   */
  async getAvailableServices() {
    const config = await this.getRates()
    return Object.keys(config.rates)
  }

  /**
   * 清除缓存（用于测试或强制刷新）
   */
  clearCache() {
    this.cachedRates = null
    this.cacheExpiry = 0
  }
}

module.exports = new ServiceRatesService()
