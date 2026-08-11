/**
 * 连通性测试默认模型配置服务
 * 管理各平台账户测试 / API Key 测试的默认模型，存于 Redis，admin 可在后台配置
 */

const redis = require('../models/redis')
const logger = require('../utils/logger')
const { RedisKeys } = require('../constants/redisKeys')

const CONFIG_KEY = RedisKeys.testModelConfig

// 默认配置：account = 账户连通性测试各平台默认模型，apikey = API Key 测试各服务默认模型
// azure-openai 走账户的 deploymentName，无需配置
const DEFAULT_CONFIG = {
  account: {
    claude: 'claude-opus-4-8',
    'claude-console': 'claude-opus-4-8',
    bedrock: 'us.anthropic.claude-opus-4-6-20250610-v1:0',
    gemini: 'gemini-2.5-pro',
    'gemini-api': 'gemini-2.5-flash',
    'openai-responses': 'gpt-5.5',
    droid: 'claude-opus-4-8',
    grok: 'grok-4.5',
    ccr: 'claude-opus-4-8'
  },
  apikey: {
    claude: 'claude-opus-4-8',
    gemini: 'gemini-2.5-pro',
    openai: 'gpt-5.5',
    grok: 'grok-4.5'
  },
  updatedAt: null,
  updatedBy: null
}

// 内存缓存（避免频繁 Redis 查询）
let configCache = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60000 // 1分钟缓存

class TestModelConfigService {
  // 合并默认值（深合并 account / apikey 两个子对象，保证新增平台默认值始终生效）
  _withDefaults(parsed) {
    const p = parsed || {}
    return {
      account: { ...DEFAULT_CONFIG.account, ...(p.account || {}) },
      apikey: { ...DEFAULT_CONFIG.apikey, ...(p.apikey || {}) },
      updatedAt: p.updatedAt || null,
      updatedBy: p.updatedBy || null
    }
  }

  // 获取配置（带缓存）
  async getConfig() {
    try {
      if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
        return configCache
      }

      const client = redis.getClient()
      if (!client) {
        logger.warn('⚠️ Redis not connected, using default test model config')
        return this._withDefaults(null)
      }

      const data = await client.get(CONFIG_KEY)
      configCache = this._withDefaults(data ? JSON.parse(data) : null)
      configCacheTime = Date.now()
      return configCache
    } catch (error) {
      logger.error('❌ Failed to get test model config:', error)
      return this._withDefaults(null)
    }
  }

  // 更新配置（只接受已知平台/服务的 key，值须为非空字符串）
  async updateConfig(newConfig, updatedBy) {
    try {
      const client = redis.getClientSafe()
      const current = await this.getConfig()

      const merged = {
        account: { ...current.account },
        apikey: { ...current.apikey },
        updatedAt: new Date().toISOString(),
        updatedBy
      }

      if (newConfig.account) {
        for (const key of Object.keys(DEFAULT_CONFIG.account)) {
          const value = newConfig.account[key]
          if (typeof value === 'string' && value.trim()) {
            merged.account[key] = value.trim()
          }
        }
      }
      if (newConfig.apikey) {
        for (const key of Object.keys(DEFAULT_CONFIG.apikey)) {
          const value = newConfig.apikey[key]
          if (typeof value === 'string' && value.trim()) {
            merged.apikey[key] = value.trim()
          }
        }
      }

      await client.set(CONFIG_KEY, JSON.stringify(merged))

      configCache = merged
      configCacheTime = Date.now()

      logger.info(`✅ Test model config updated by ${updatedBy}`)
      return merged
    } catch (error) {
      logger.error('❌ Failed to update test model config:', error)
      throw error
    }
  }

  // 仅含模型映射（剥离 updatedAt/updatedBy 等管理元数据），供公开接口使用，避免信息泄露
  async getModelDefaults() {
    const cfg = await this.getConfig()
    return { account: cfg.account, apikey: cfg.apikey }
  }

  // 解析"账户连通性测试"应使用的模型：请求显式指定优先，否则回退到后台配置默认
  // 这是默认测试模型的单一事实源，所有测试路由经此解析，不再各自硬编码
  async resolveAccountModel(platform, requested) {
    if (typeof requested === 'string' && requested.trim()) {
      return requested.trim()
    }
    const cfg = await this.getConfig()
    return cfg.account[platform] || null
  }

  // 解析"API Key 测试"应使用的模型：请求显式指定优先，否则回退到后台配置默认
  async resolveApikeyModel(service, requested) {
    if (typeof requested === 'string' && requested.trim()) {
      return requested.trim()
    }
    const cfg = await this.getConfig()
    return cfg.apikey[service] || null
  }

  // 清除缓存（测试或强制刷新用）
  clearCache() {
    configCache = null
    configCacheTime = 0
  }
}

module.exports = new TestModelConfigService()
