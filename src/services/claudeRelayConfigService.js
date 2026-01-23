/**
 * Claude 转发配置服务
 * 管理全局 Claude Code 限制和会话绑定配置
 */

const redis = require('../models/redis')
const logger = require('../utils/logger')

const CONFIG_KEY = 'claude_relay_config'
const SESSION_BINDING_PREFIX = 'original_session_binding:'

// 默认配置
const DEFAULT_CONFIG = {
  claudeCodeOnlyEnabled: false,
  globalSessionBindingEnabled: false,
  sessionBindingErrorMessage: '你的本地session已污染，请清理后使用。',
  sessionBindingTtlDays: 1, // 会话绑定 TTL（天），默认1天（支持 /clear 场景，避免 Redis 累积）
  // 用户消息队列配置
  userMessageQueueEnabled: false, // 是否启用用户消息队列（默认关闭）
  userMessageQueueDelayMs: 200, // 请求间隔（毫秒）
  userMessageQueueTimeoutMs: 60000, // 队列等待超时（毫秒）
  userMessageQueueLockTtlMs: 120000, // 锁TTL（毫秒）
  // 并发请求排队配置
  concurrentRequestQueueEnabled: false, // 是否启用并发请求排队（默认关闭）
  concurrentRequestQueueMaxSize: 3, // 固定最小排队数（默认3）
  concurrentRequestQueueMaxSizeMultiplier: 0, // 并发数的倍数（默认0，仅使用固定值）
  concurrentRequestQueueTimeoutMs: 10000, // 排队超时（毫秒，默认10秒）
  concurrentRequestQueueMaxRedisFailCount: 5, // 连续 Redis 失败阈值（默认5次）
  // 排队健康检查配置
  concurrentRequestQueueHealthCheckEnabled: true, // 是否启用排队健康检查（默认开启）
  concurrentRequestQueueHealthThreshold: 0.8, // 健康检查阈值（P90 >= 超时 × 阈值时拒绝新请求）
  updatedAt: null,
  updatedBy: null
}

// 内存缓存（避免频繁 Redis 查询）
let configCache = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60000 // 1分钟缓存

class ClaudeRelayConfigService {
  /**
   * 从 metadata.user_id 中提取原始 sessionId
   * 格式: user_{64位十六进制}_account__session_{uuid}
   * @param {Object} requestBody - 请求体
   * @returns {string|null} 原始 sessionId 或 null
   */
  extractOriginalSessionId(requestBody) {
    if (!requestBody?.metadata?.user_id) {
      return null
    }

    const userId = requestBody.metadata.user_id
    const match = userId.match(/session_([a-f0-9-]{36})$/i)
    return match ? match[1] : null
  }

  /**
   * 获取配置（带缓存）
   * @returns {Promise<Object>} 配置对象
   */
  async getConfig() {
    try {
      // 检查缓存
      if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
        return configCache
      }

      const client = redis.getClient()
      if (!client) {
        logger.warn('⚠️ Redis not connected, using default config')
        return { ...DEFAULT_CONFIG }
      }

      const data = await client.get(CONFIG_KEY)

      if (data) {
        configCache = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
      } else {
        configCache = { ...DEFAULT_CONFIG }
      }

      configCacheTime = Date.now()
      return configCache
    } catch (error) {
      logger.error('❌ Failed to get Claude relay config:', error)
      return { ...DEFAULT_CONFIG }
    }
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   * @param {string} updatedBy - 更新者
   * @returns {Promise<Object>} 更新后的配置
   */
  async updateConfig(newConfig, updatedBy) {
    try {
      const client = redis.getClientSafe()
      const currentConfig = await this.getConfig()

      const updatedConfig = {
        ...currentConfig,
        ...newConfig,
        updatedAt: new Date().toISOString(),
        updatedBy
      }

      await client.set(CONFIG_KEY, JSON.stringify(updatedConfig))

      // 更新缓存
      configCache = updatedConfig
      configCacheTime = Date.now()

      logger.info(`✅ Claude relay config updated by ${updatedBy}:`, {
        claudeCodeOnlyEnabled: updatedConfig.claudeCodeOnlyEnabled,
        globalSessionBindingEnabled: updatedConfig.globalSessionBindingEnabled,
        concurrentRequestQueueEnabled: updatedConfig.concurrentRequestQueueEnabled
      })

      return updatedConfig
    } catch (error) {
      logger.error('❌ Failed to update Claude relay config:', error)
      throw error
    }
  }

  /**
   * 检查是否启用全局 Claude Code 限制
   * @returns {Promise<boolean>}
   */
  async isClaudeCodeOnlyEnabled() {
    const cfg = await this.getConfig()
    return cfg.claudeCodeOnlyEnabled === true
  }

  /**
   * 检查是否启用全局会话绑定
   * @returns {Promise<boolean>}
   */
  async isGlobalSessionBindingEnabled() {
    const cfg = await this.getConfig()
    return cfg.globalSessionBindingEnabled === true
  }

  /**
   * 获取会话绑定错误信息
   * @returns {Promise<string>}
   */
  async getSessionBindingErrorMessage() {
    const cfg = await this.getConfig()
    return cfg.sessionBindingErrorMessage || DEFAULT_CONFIG.sessionBindingErrorMessage
  }

  /**
   * 获取原始会话绑定
   * @param {string} originalSessionId - 原始会话ID
   * @returns {Promise<Object|null>} 绑定信息或 null
   */
  async getOriginalSessionBinding(originalSessionId) {
    if (!originalSessionId) {
      return null
    }

    try {
      const client = redis.getClient()
      if (!client) {
        return null
      }

      const key = `${SESSION_BINDING_PREFIX}${originalSessionId}`
      const data = await client.get(key)

      if (data) {
        return JSON.parse(data)
      }
      return null
    } catch (error) {
      logger.error(`❌ Failed to get session binding for ${originalSessionId}:`, error)
      return null
    }
  }

  /**
   * 设置原始会话绑定
   * @param {string} originalSessionId - 原始会话ID
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @returns {Promise<Object>} 绑定信息
   */
  async setOriginalSessionBinding(originalSessionId, accountId, accountType) {
    if (!originalSessionId || !accountId || !accountType) {
      throw new Error('Invalid parameters for session binding')
    }

    try {
      const client = redis.getClientSafe()
      const key = `${SESSION_BINDING_PREFIX}${originalSessionId}`

      const binding = {
        accountId,
        accountType,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      }

      // 使用配置的 TTL（默认30天）
      const cfg = await this.getConfig()
      const ttlDays = cfg.sessionBindingTtlDays || DEFAULT_CONFIG.sessionBindingTtlDays
      const ttlSeconds = Math.floor(ttlDays * 24 * 3600)

      await client.set(key, JSON.stringify(binding), 'EX', ttlSeconds)

      logger.info(
        `🔗 Session binding created: ${originalSessionId} -> ${accountId} (${accountType})`
      )

      return binding
    } catch (error) {
      logger.error(`❌ Failed to set session binding for ${originalSessionId}:`, error)
      throw error
    }
  }

  /**
   * 更新会话绑定的最后使用时间（续期）
   * @param {string} originalSessionId - 原始会话ID
   */
  async touchOriginalSessionBinding(originalSessionId) {
    if (!originalSessionId) {
      return
    }

    try {
      const binding = await this.getOriginalSessionBinding(originalSessionId)
      if (!binding) {
        return
      }

      binding.lastUsedAt = new Date().toISOString()

      const client = redis.getClientSafe()
      const key = `${SESSION_BINDING_PREFIX}${originalSessionId}`

      // 使用配置的 TTL（默认30天）
      const cfg = await this.getConfig()
      const ttlDays = cfg.sessionBindingTtlDays || DEFAULT_CONFIG.sessionBindingTtlDays
      const ttlSeconds = Math.floor(ttlDays * 24 * 3600)

      await client.set(key, JSON.stringify(binding), 'EX', ttlSeconds)
    } catch (error) {
      logger.warn(`⚠️ Failed to touch session binding for ${originalSessionId}:`, error)
    }
  }

  /**
   * 检查原始会话是否已绑定
   * @param {string} originalSessionId - 原始会话ID
   * @returns {Promise<boolean>}
   */
  async isOriginalSessionBound(originalSessionId) {
    const binding = await this.getOriginalSessionBinding(originalSessionId)
    return binding !== null
  }

  /**
   * 验证绑定的账户是否可用
   * @param {Object} binding - 绑定信息
   * @returns {Promise<boolean>}
   */
  async validateBoundAccount(binding) {
    if (!binding || !binding.accountId || !binding.accountType) {
      return false
    }

    try {
      const { accountType } = binding
      const { accountId } = binding

      let accountService
      switch (accountType) {
        case 'claude-official':
          accountService = require('./claudeAccountService')
          break
        case 'claude-console':
          accountService = require('./claudeConsoleAccountService')
          break
        case 'bedrock':
          accountService = require('./bedrockAccountService')
          break
        case 'ccr':
          accountService = require('./ccrAccountService')
          break
        default:
          logger.warn(`Unknown account type for validation: ${accountType}`)
          return false
      }

      const account = await accountService.getAccount(accountId)

      // getAccount() 直接返回账户数据对象或 null，不是 { success, data } 格式
      if (!account) {
        logger.warn(`Session binding account not found: ${accountId} (${accountType})`)
        return false
      }

      const accountData = account

      // 检查账户是否激活
      if (accountData.isActive === false || accountData.isActive === 'false') {
        logger.warn(
          `Session binding account not active: ${accountId} (${accountType}), isActive: ${accountData.isActive}`
        )
        return false
      }

      // 检查账户状态（如果存在）
      if (accountData.status && accountData.status === 'error') {
        logger.warn(
          `Session binding account has error status: ${accountId} (${accountType}), status: ${accountData.status}`
        )
        return false
      }

      return true
    } catch (error) {
      logger.error(`❌ Failed to validate bound account ${binding.accountId}:`, error)
      return false
    }
  }

  /**
   * 验证新会话请求
   * @param {Object} _requestBody - 请求体（预留参数，当前未使用）
   * @param {string} originalSessionId - 原始会话ID
   * @returns {Promise<Object>} { valid: boolean, error?: string, binding?: object, isNewSession?: boolean }
   */
  async validateNewSession(_requestBody, originalSessionId) {
    const cfg = await this.getConfig()

    if (!cfg.globalSessionBindingEnabled) {
      return { valid: true }
    }

    // 如果没有 sessionId，跳过验证（可能是非 Claude Code 客户端）
    if (!originalSessionId) {
      return { valid: true }
    }

    const existingBinding = await this.getOriginalSessionBinding(originalSessionId)

    // 如果会话已存在绑定
    if (existingBinding) {
      // ⚠️ 只有 claude-official 类型账户受全局会话绑定限制
      // 其他类型（bedrock, ccr, claude-console等）忽略绑定，走正常调度
      if (existingBinding.accountType !== 'claude-official') {
        logger.info(
          `🔗 Session binding ignored for non-official account type: ${existingBinding.accountType}`
        )
        return { valid: true }
      }

      const accountValid = await this.validateBoundAccount(existingBinding)

      if (!accountValid) {
        return {
          valid: false,
          error: cfg.sessionBindingErrorMessage,
          code: 'SESSION_BINDING_INVALID'
        }
      }

      // 续期
      await this.touchOriginalSessionBinding(originalSessionId)

      // 已有绑定，允许继续（这是正常的会话延续）
      return { valid: true, binding: existingBinding }
    }

    // 没有绑定，是新会话
    // 注意：messages.length 检查在此处无法执行，因为我们不知道最终会调度到哪种账户类型
    // 绑定会在调度后创建，仅针对 claude-official 账户
    return { valid: true, isNewSession: true }
  }

  /**
   * 删除原始会话绑定
   * @param {string} originalSessionId - 原始会话ID
   */
  async deleteOriginalSessionBinding(originalSessionId) {
    if (!originalSessionId) {
      return
    }

    try {
      const client = redis.getClient()
      if (!client) {
        return
      }

      const key = `${SESSION_BINDING_PREFIX}${originalSessionId}`
      await client.del(key)
      logger.info(`🗑️ Session binding deleted: ${originalSessionId}`)
    } catch (error) {
      logger.error(`❌ Failed to delete session binding for ${originalSessionId}:`, error)
    }
  }

  /**
   * 获取会话绑定统计
   * @returns {Promise<Object>}
   */
  async getSessionBindingStats() {
    try {
      const client = redis.getClient()
      if (!client) {
        return { totalBindings: 0 }
      }

      let cursor = '0'
      let count = 0

      do {
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          `${SESSION_BINDING_PREFIX}*`,
          'COUNT',
          100
        )
        cursor = newCursor
        count += keys.length
      } while (cursor !== '0')

      return {
        totalBindings: count
      }
    } catch (error) {
      logger.error('❌ Failed to get session binding stats:', error)
      return { totalBindings: 0 }
    }
  }

  /**
   * 清除配置缓存（用于测试或强制刷新）
   */
  clearCache() {
    configCache = null
    configCacheTime = 0
  }
}

module.exports = new ClaudeRelayConfigService()
