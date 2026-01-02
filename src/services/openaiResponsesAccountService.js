const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')
const LRUCache = require('../utils/lruCache')

class OpenAIResponsesAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'openai-responses-salt'

    // Redis 键前缀
    this.ACCOUNT_KEY_PREFIX = 'openai_responses_account:'
    this.SHARED_ACCOUNTS_KEY = 'shared_openai_responses_accounts'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存，提高解密性能
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info(
          '🧹 OpenAI-Responses decrypt cache cleanup completed',
          this._decryptCache.getStats()
        )
      },
      10 * 60 * 1000
    )
  }

  _serializeAutoRecoveryConfig(config, accountId) {
    if (config === undefined) {
      return undefined
    }
    if (config === null || config === '') {
      return ''
    }
    if (typeof config === 'string') {
      return config
    }
    try {
      return JSON.stringify(config)
    } catch (error) {
      logger.warn(
        `Failed to serialize autoRecoveryConfig for OpenAI-Responses account ${accountId}:`,
        error
      )
      return ''
    }
  }

  _parseAutoRecoveryConfig(rawConfig, accountId) {
    if (!rawConfig) {
      return null
    }
    if (typeof rawConfig === 'object') {
      return rawConfig
    }
    if (typeof rawConfig !== 'string') {
      return null
    }
    const trimmed = rawConfig.trim()
    if (!trimmed) {
      return null
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
      logger.warn(
        `Invalid autoRecoveryConfig for OpenAI-Responses account ${accountId}: not an object`
      )
      return rawConfig
    } catch (error) {
      logger.warn(
        `Failed to parse autoRecoveryConfig for OpenAI-Responses account ${accountId}:`,
        error
      )
      return rawConfig
    }
  }

  // 创建账户
  async createAccount(options = {}) {
    const {
      name = 'OpenAI Responses Account',
      description = '',
      baseApi = '', // 必填：API 基础地址
      apiKey = '', // 必填：API 密钥
      userAgent = '', // 可选：自定义 User-Agent，空则透传原始请求
      priority = 50, // 调度优先级 (1-100)
      proxy = null,
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      schedulable = true, // 是否可被调度
      dailyQuota = 0, // 每日额度限制（美元），0表示不限制
      quotaResetTime = '00:00', // 额度重置时间（HH:mm格式）
      rateLimitDuration = 60, // 限流时间（分钟）
      rpmLimit = 0, // 每分钟请求数限制，0表示不限制
      autoRecoveryConfig = undefined
    } = options

    // 验证必填字段
    if (!baseApi || !apiKey) {
      throw new Error('Base API URL and API Key are required for OpenAI-Responses account')
    }

    // 规范化 baseApi（确保不以 / 结尾）
    const normalizedBaseApi = baseApi.endsWith('/') ? baseApi.slice(0, -1) : baseApi

    const accountId = uuidv4()

    const accountData = {
      id: accountId,
      platform: 'openai-responses',
      name,
      description,
      baseApi: normalizedBaseApi,
      apiKey: this._encryptSensitiveData(apiKey),
      userAgent,
      priority: priority.toString(),
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      schedulable: schedulable.toString(),

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      // 注意：OpenAI-Responses 使用 API Key 认证，没有 OAuth token，因此没有 expiresAt
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,

      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      status: 'active',
      errorMessage: '',
      // 限流相关
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitDuration: rateLimitDuration.toString(),
      rpmLimit: rpmLimit.toString(),
      // 额度管理
      dailyQuota: dailyQuota.toString(),
      dailyUsage: '0',
      lastResetDate: redis.getDateStringInTimezone(),
      quotaResetTime,
      quotaStoppedAt: ''
    }

    const serializedAutoRecoveryConfig = this._serializeAutoRecoveryConfig(
      autoRecoveryConfig,
      accountId
    )
    if (serializedAutoRecoveryConfig !== undefined) {
      accountData.autoRecoveryConfig = serializedAutoRecoveryConfig
    }

    // 保存到 Redis
    await this._saveAccount(accountId, accountData)

    logger.success(`🚀 Created OpenAI-Responses account: ${name} (${accountId})`)

    return {
      ...accountData,
      apiKey: '***' // 返回时隐藏敏感信息
    }
  }

  // 获取账户
  async getAccount(accountId) {
    const client = redis.getClientSafe()
    const key = `${this.ACCOUNT_KEY_PREFIX}${accountId}`
    const accountData = await client.hgetall(key)

    if (!accountData || !accountData.id) {
      return null
    }

    // 解密敏感数据
    accountData.apiKey = this._decryptSensitiveData(accountData.apiKey)

    // 解析 JSON 字段
    if (accountData.proxy) {
      try {
        accountData.proxy = JSON.parse(accountData.proxy)
      } catch (e) {
        accountData.proxy = null
      }
    }

    const rpmValue = parseInt(accountData.rpmLimit, 10)
    accountData.rpmLimit = Number.isFinite(rpmValue) && rpmValue >= 0 ? rpmValue : 0

    accountData.autoRecoveryConfig = this._parseAutoRecoveryConfig(
      accountData.autoRecoveryConfig,
      accountId
    )

    return accountData
  }

  // 更新账户
  async updateAccount(accountId, updates) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    // 处理敏感字段加密
    if (updates.apiKey) {
      updates.apiKey = this._encryptSensitiveData(updates.apiKey)
    }

    // 处理 JSON 字段
    if (updates.proxy !== undefined) {
      updates.proxy = updates.proxy ? JSON.stringify(updates.proxy) : ''
    }

    // 规范化 baseApi
    if (updates.baseApi) {
      updates.baseApi = updates.baseApi.endsWith('/')
        ? updates.baseApi.slice(0, -1)
        : updates.baseApi
    }

    if (updates.rpmLimit !== undefined) {
      const rpmValue = parseInt(updates.rpmLimit, 10)
      updates.rpmLimit = Number.isFinite(rpmValue) && rpmValue >= 0 ? rpmValue.toString() : '0'
    }

    if (updates.autoRecoveryConfig !== undefined) {
      updates.autoRecoveryConfig = this._serializeAutoRecoveryConfig(
        updates.autoRecoveryConfig,
        accountId
      )
    }

    // ✅ 直接保存 subscriptionExpiresAt（如果提供）
    // OpenAI-Responses 使用 API Key，没有 token 刷新逻辑，不会覆盖此字段
    if (updates.subscriptionExpiresAt !== undefined) {
      // 直接保存，不做任何调整
    }

    // 更新 Redis
    const client = redis.getClientSafe()
    const key = `${this.ACCOUNT_KEY_PREFIX}${accountId}`
    await client.hset(key, updates)

    logger.info(`📝 Updated OpenAI-Responses account: ${account.name}`)

    return { success: true }
  }

  // 删除账户
  async deleteAccount(accountId) {
    const client = redis.getClientSafe()
    const key = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

    // 从共享账户列表中移除
    await client.srem(this.SHARED_ACCOUNTS_KEY, accountId)

    // 删除账户数据
    await client.del(key)

    logger.info(`🗑️ Deleted OpenAI-Responses account: ${accountId}`)

    return { success: true }
  }

  // 获取所有账户
  async getAllAccounts(includeInactive = false) {
    const client = redis.getClientSafe()
    const accountIds = await client.smembers(this.SHARED_ACCOUNTS_KEY)
    const accounts = []

    for (const accountId of accountIds) {
      const account = await this.getAccount(accountId)
      if (account) {
        // 过滤非活跃账户
        if (includeInactive || account.isActive === 'true') {
          // 隐藏敏感信息
          account.apiKey = '***'

          // 获取限流状态信息（与普通OpenAI账号保持一致的格式）
          const rateLimitInfo = this._getRateLimitInfo(account)

          // 格式化 rateLimitStatus 为对象（与普通 OpenAI 账号一致）
          account.rateLimitStatus = rateLimitInfo.isRateLimited
            ? {
                isRateLimited: true,
                rateLimitedAt: account.rateLimitedAt || null,
                minutesRemaining: rateLimitInfo.remainingMinutes || 0
              }
            : {
                isRateLimited: false,
                rateLimitedAt: null,
                minutesRemaining: 0
              }

          account.autoRecoveryConfig = this._parseAutoRecoveryConfig(
            account.autoRecoveryConfig,
            account.id
          )

          const rpmValue = parseInt(account.rpmLimit, 10)
          account.rpmLimit = Number.isFinite(rpmValue) && rpmValue >= 0 ? rpmValue : 0

          // 转换 schedulable 字段为布尔值（前端需要布尔值来判断）
          account.schedulable = account.schedulable !== 'false'
          // 转换 isActive 字段为布尔值
          account.isActive = account.isActive === 'true'

          // ✅ 前端显示订阅过期时间（业务字段）
          account.expiresAt = account.subscriptionExpiresAt || null
          account.platform = account.platform || 'openai-responses'

          accounts.push(account)
        }
      }
    }

    // 直接从 Redis 获取所有账户（包括非共享账户）
    const keys = await client.keys(`${this.ACCOUNT_KEY_PREFIX}*`)
    for (const key of keys) {
      const accountId = key.replace(this.ACCOUNT_KEY_PREFIX, '')
      if (!accountIds.includes(accountId)) {
        const accountData = await client.hgetall(key)
        if (accountData && accountData.id) {
          // 过滤非活跃账户
          if (includeInactive || accountData.isActive === 'true') {
            // 隐藏敏感信息
            accountData.apiKey = '***'
            // 解析 JSON 字段
            if (accountData.proxy) {
              try {
                accountData.proxy = JSON.parse(accountData.proxy)
              } catch (e) {
                accountData.proxy = null
              }
            }

            // 获取限流状态信息（与普通OpenAI账号保持一致的格式）
            const rateLimitInfo = this._getRateLimitInfo(accountData)

            // 格式化 rateLimitStatus 为对象（与普通 OpenAI 账号一致）
            accountData.rateLimitStatus = rateLimitInfo.isRateLimited
              ? {
                  isRateLimited: true,
                  rateLimitedAt: accountData.rateLimitedAt || null,
                  minutesRemaining: rateLimitInfo.remainingMinutes || 0
                }
              : {
                  isRateLimited: false,
                  rateLimitedAt: null,
                  minutesRemaining: 0
                }

            accountData.autoRecoveryConfig = this._parseAutoRecoveryConfig(
              accountData.autoRecoveryConfig,
              accountId
            )

            const rpmValue = parseInt(accountData.rpmLimit, 10)
            accountData.rpmLimit = Number.isFinite(rpmValue) && rpmValue >= 0 ? rpmValue : 0

            // 转换 schedulable 字段为布尔值（前端需要布尔值来判断）
            accountData.schedulable = accountData.schedulable !== 'false'
            // 转换 isActive 字段为布尔值
            accountData.isActive = accountData.isActive === 'true'

            // ✅ 前端显示订阅过期时间（业务字段）
            accountData.expiresAt = accountData.subscriptionExpiresAt || null
            accountData.platform = accountData.platform || 'openai-responses'

            accounts.push(accountData)
          }
        }
      }
    }

    return accounts
  }

  // 标记账户限流
  async markAccountRateLimited(accountId, duration = null) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }

    const rateLimitDuration = duration || parseInt(account.rateLimitDuration) || 60
    const now = new Date()
    const resetAt = new Date(now.getTime() + rateLimitDuration * 60000)

    await this.updateAccount(accountId, {
      rateLimitedAt: now.toISOString(),
      rateLimitStatus: 'limited',
      rateLimitResetAt: resetAt.toISOString(),
      rateLimitDuration: rateLimitDuration.toString(),
      status: 'rateLimited',
      schedulable: 'false', // 防止被调度
      errorMessage: `Rate limited until ${resetAt.toISOString()}`
    })

    logger.warn(
      `⏳ Account ${account.name} marked as rate limited for ${rateLimitDuration} minutes (until ${resetAt.toISOString()})`
    )
  }

  // 🚫 标记账户为未授权状态（401错误）
  async markAccountUnauthorized(accountId, reason = 'OpenAI Responses账号认证失败（401错误）') {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }

    const now = new Date().toISOString()
    const currentCount = parseInt(account.unauthorizedCount || '0', 10)
    const unauthorizedCount = Number.isFinite(currentCount) ? currentCount + 1 : 1

    await this.updateAccount(accountId, {
      status: 'unauthorized',
      schedulable: 'false',
      errorMessage: reason,
      unauthorizedAt: now,
      unauthorizedCount: unauthorizedCount.toString()
    })

    logger.warn(
      `🚫 OpenAI-Responses account ${account.name || accountId} marked as unauthorized due to 401 error`
    )

    try {
      const webhookNotifier = require('../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: account.name || accountId,
        platform: 'openai',
        status: 'unauthorized',
        errorCode: 'OPENAI_UNAUTHORIZED',
        reason,
        timestamp: now
      })
      logger.info(
        `📢 Webhook notification sent for OpenAI-Responses account ${account.name || accountId} unauthorized state`
      )
    } catch (webhookError) {
      logger.error('Failed to send unauthorized webhook notification:', webhookError)
    }
  }

  // 检查并清除过期的限流状态
  async checkAndClearRateLimit(accountId) {
    const account = await this.getAccount(accountId)
    if (!account || account.rateLimitStatus !== 'limited') {
      return false
    }

    const now = new Date()
    let shouldClear = false

    // 优先使用 rateLimitResetAt 字段
    if (account.rateLimitResetAt) {
      const resetAt = new Date(account.rateLimitResetAt)
      shouldClear = now >= resetAt
    } else {
      // 如果没有 rateLimitResetAt，使用旧的逻辑
      const rateLimitedAt = new Date(account.rateLimitedAt)
      const rateLimitDuration = parseInt(account.rateLimitDuration) || 60
      shouldClear = now - rateLimitedAt > rateLimitDuration * 60000
    }

    if (shouldClear) {
      // 限流已过期，清除状态
      await this.updateAccount(accountId, {
        rateLimitedAt: '',
        rateLimitStatus: '',
        rateLimitResetAt: '',
        status: 'active',
        schedulable: 'true', // 恢复调度
        errorMessage: ''
      })

      logger.info(`✅ Rate limit cleared for account ${account.name}`)
      return true
    }

    return false
  }

  // ⏱️ RPM 限制（每分钟请求数）
  async checkAndIncrementRpm(accountId, rpmLimit) {
    const limit = parseInt(rpmLimit, 10)
    if (!Number.isFinite(limit) || limit <= 0) {
      return { allowed: true, limit: 0 }
    }

    const client = redis.getClientSafe()
    const now = Date.now()
    const windowMs = 60 * 1000
    const windowKey = `openai_responses:rpm:window:${accountId}`
    const countKey = `openai_responses:rpm:count:${accountId}`

    let windowStart = await client.get(windowKey)
    if (!windowStart) {
      const pipeline = client.pipeline()
      pipeline.set(windowKey, now, 'PX', windowMs)
      pipeline.set(countKey, 0, 'PX', windowMs)
      await pipeline.exec()
      windowStart = now
    } else {
      const parsed = parseInt(windowStart, 10)
      windowStart = Number.isFinite(parsed) ? parsed : now
      if (now - windowStart >= windowMs) {
        const pipeline = client.pipeline()
        pipeline.set(windowKey, now, 'PX', windowMs)
        pipeline.set(countKey, 0, 'PX', windowMs)
        await pipeline.exec()
        windowStart = now
      }
    }

    const current = await client.incr(countKey)
    if (current === 1) {
      await client.pexpire(countKey, windowMs)
    }

    const resetAt = windowStart + windowMs
    const remainingSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000))

    if (current > limit) {
      return {
        allowed: false,
        current,
        limit,
        resetAt,
        remainingSeconds
      }
    }

    return {
      allowed: true,
      current,
      limit,
      resetAt,
      remainingSeconds
    }
  }

  // 👀 仅检查 RPM 状态，不增加计数
  async getRpmStatus(accountId, rpmLimit) {
    const limit = parseInt(rpmLimit, 10)
    if (!Number.isFinite(limit) || limit <= 0) {
      return { allowed: true, limit: 0, current: 0 }
    }

    const client = redis.getClientSafe()
    const now = Date.now()
    const windowMs = 60 * 1000
    const windowKey = `openai_responses:rpm:window:${accountId}`
    const countKey = `openai_responses:rpm:count:${accountId}`

    const windowStartRaw = await client.get(windowKey)
    if (!windowStartRaw) {
      return {
        allowed: true,
        current: 0,
        limit,
        resetAt: now + windowMs,
        remainingSeconds: Math.ceil(windowMs / 1000)
      }
    }

    const windowStart = parseInt(windowStartRaw, 10)
    if (!Number.isFinite(windowStart) || now - windowStart >= windowMs) {
      return {
        allowed: true,
        current: 0,
        limit,
        resetAt: now + windowMs,
        remainingSeconds: Math.ceil(windowMs / 1000)
      }
    }

    const currentRaw = await client.get(countKey)
    const current = parseInt(currentRaw || '0', 10)
    const resetAt = windowStart + windowMs
    const remainingSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000))

    if (current >= limit) {
      return { allowed: false, current, limit, resetAt, remainingSeconds }
    }

    return { allowed: true, current, limit, resetAt, remainingSeconds }
  }

  // 切换调度状态
  async toggleSchedulable(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const newSchedulableStatus = account.schedulable === 'true' ? 'false' : 'true'
    await this.updateAccount(accountId, {
      schedulable: newSchedulableStatus
    })

    logger.info(
      `🔄 Toggled schedulable status for account ${account.name}: ${newSchedulableStatus}`
    )

    return {
      success: true,
      schedulable: newSchedulableStatus === 'true'
    }
  }

  // 更新使用额度
  async updateUsageQuota(accountId, amount) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }

    // 检查是否需要重置额度
    const today = redis.getDateStringInTimezone()
    if (account.lastResetDate !== today) {
      // 重置额度
      await this.updateAccount(accountId, {
        dailyUsage: amount.toString(),
        lastResetDate: today,
        quotaStoppedAt: ''
      })
    } else {
      // 累加使用额度
      const currentUsage = parseFloat(account.dailyUsage) || 0
      const newUsage = currentUsage + amount
      const dailyQuota = parseFloat(account.dailyQuota) || 0

      const updates = {
        dailyUsage: newUsage.toString()
      }

      // 检查是否超出额度
      if (dailyQuota > 0 && newUsage >= dailyQuota) {
        updates.status = 'quotaExceeded'
        updates.quotaStoppedAt = new Date().toISOString()
        updates.errorMessage = `Daily quota exceeded: $${newUsage.toFixed(2)} / $${dailyQuota.toFixed(2)}`
        logger.warn(`💸 Account ${account.name} exceeded daily quota`)
      }

      await this.updateAccount(accountId, updates)
    }
  }

  // 更新账户使用统计（记录 token 使用量）
  async updateAccountUsage(accountId, tokens = 0) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }

    const updates = {
      lastUsedAt: new Date().toISOString()
    }

    // 如果有 tokens 参数且大于0，同时更新使用统计
    if (tokens > 0) {
      const currentTokens = parseInt(account.totalUsedTokens) || 0
      updates.totalUsedTokens = (currentTokens + tokens).toString()
    }

    await this.updateAccount(accountId, updates)
  }

  // 记录使用量（为了兼容性的别名）
  async recordUsage(accountId, tokens = 0) {
    return this.updateAccountUsage(accountId, tokens)
  }

  // 重置账户状态（清除所有异常状态）
  async resetAccountStatus(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const updates = {
      // 根据是否有有效的 apiKey 来设置 status
      status: account.apiKey ? 'active' : 'created',
      // 恢复可调度状态
      schedulable: 'true',
      // 清除错误相关字段
      errorMessage: '',
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitResetAt: '',
      rateLimitDuration: ''
    }

    await this.updateAccount(accountId, updates)
    logger.info(`✅ Reset all error status for OpenAI-Responses account ${accountId}`)

    // 发送 Webhook 通知
    try {
      const webhookNotifier = require('../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: account.name || accountId,
        platform: 'openai-responses',
        status: 'recovered',
        errorCode: 'STATUS_RESET',
        reason: 'Account status manually reset',
        timestamp: new Date().toISOString()
      })
      logger.info(
        `📢 Webhook notification sent for OpenAI-Responses account ${account.name} status reset`
      )
    } catch (webhookError) {
      logger.error('Failed to send status reset webhook notification:', webhookError)
    }

    return { success: true, message: 'Account status reset successfully' }
  }

  // ⏰ 检查账户订阅是否已过期
  isSubscriptionExpired(account) {
    if (!account.subscriptionExpiresAt) {
      return false // 未设置过期时间，视为永不过期
    }

    const expiryDate = new Date(account.subscriptionExpiresAt)
    const now = new Date()

    if (expiryDate <= now) {
      logger.debug(
        `⏰ OpenAI-Responses Account ${account.name} (${account.id}) subscription expired at ${account.subscriptionExpiresAt}`
      )
      return true
    }

    return false
  }

  // 获取限流信息
  _getRateLimitInfo(accountData) {
    if (accountData.rateLimitStatus !== 'limited') {
      return { isRateLimited: false }
    }

    const now = new Date()
    let willBeAvailableAt
    let remainingMinutes

    // 优先使用 rateLimitResetAt 字段
    if (accountData.rateLimitResetAt) {
      willBeAvailableAt = new Date(accountData.rateLimitResetAt)
      remainingMinutes = Math.max(0, Math.ceil((willBeAvailableAt - now) / 60000))
    } else {
      // 如果没有 rateLimitResetAt，使用旧的逻辑
      const rateLimitedAt = new Date(accountData.rateLimitedAt)
      const rateLimitDuration = parseInt(accountData.rateLimitDuration) || 60
      const elapsedMinutes = Math.floor((now - rateLimitedAt) / 60000)
      remainingMinutes = Math.max(0, rateLimitDuration - elapsedMinutes)
      willBeAvailableAt = new Date(rateLimitedAt.getTime() + rateLimitDuration * 60000)
    }

    return {
      isRateLimited: remainingMinutes > 0,
      remainingMinutes,
      willBeAvailableAt
    }
  }

  // 加密敏感数据
  _encryptSensitiveData(text) {
    if (!text) {
      return ''
    }

    const key = this._getEncryptionKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv)

    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()])

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`
  }

  // 解密敏感数据
  _decryptSensitiveData(text) {
    if (!text || text === '') {
      return ''
    }

    // 检查缓存
    const cacheKey = crypto.createHash('sha256').update(text).digest('hex')
    const cached = this._decryptCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    try {
      const key = this._getEncryptionKey()
      const [ivHex, encryptedHex] = text.split(':')

      const iv = Buffer.from(ivHex, 'hex')
      const encryptedText = Buffer.from(encryptedHex, 'hex')

      const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv)
      let decrypted = decipher.update(encryptedText)
      decrypted = Buffer.concat([decrypted, decipher.final()])

      const result = decrypted.toString()

      // 存入缓存（5分钟过期）
      this._decryptCache.set(cacheKey, result, 5 * 60 * 1000)

      return result
    } catch (error) {
      logger.error('Decryption error:', error)
      return ''
    }
  }

  // 获取加密密钥
  _getEncryptionKey() {
    if (!this._encryptionKeyCache) {
      this._encryptionKeyCache = crypto.scryptSync(
        config.security.encryptionKey,
        this.ENCRYPTION_SALT,
        32
      )
    }
    return this._encryptionKeyCache
  }

  // 保存账户到 Redis
  async _saveAccount(accountId, accountData) {
    const client = redis.getClientSafe()
    const key = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

    // 保存账户数据
    await client.hset(key, accountData)

    // 添加到共享账户列表
    if (accountData.accountType === 'shared') {
      await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId)
    }
  }
}

module.exports = new OpenAIResponsesAccountService()
