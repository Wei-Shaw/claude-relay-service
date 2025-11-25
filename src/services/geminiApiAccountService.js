const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')
const LRUCache = require('../utils/lruCache')

class GeminiApiAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'gemini-api-salt'

    // Redis 键前缀
    this.ACCOUNT_KEY_PREFIX = 'gemini_api_account:'
    this.SHARED_ACCOUNTS_KEY = 'shared_gemini_api_accounts'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存，提高解密性能
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info('🧹 Gemini-API decrypt cache cleanup completed', this._decryptCache.getStats())
      },
      10 * 60 * 1000
    )
  }

  // 创建账户
  async createAccount(options = {}) {
    const {
      name = 'Gemini API Account',
      description = '',
      apiKey = '', // 必填：Google AI Studio API Key
      baseUrl = 'https://generativelanguage.googleapis.com', // 默认 Gemini API 基础 URL
      proxy = null,
      priority = 50, // 调度优先级 (1-100)
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      schedulable = true, // 是否可被调度
      supportedModels = [], // 支持的模型列表
      rateLimitDuration = 60 // 限流时间（分钟）
    } = options

    // 验证必填字段
    if (!apiKey) {
      throw new Error('API Key is required for Gemini-API account')
    }

    // 规范化 baseUrl（确保不以 / 结尾）
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

    const accountId = uuidv4()

    const accountData = {
      id: accountId,
      platform: 'gemini-api',
      name,
      description,
      baseUrl: normalizedBaseUrl,
      apiKey: this._encryptSensitiveData(apiKey),
      priority: priority.toString(),
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      schedulable: schedulable.toString(),
      supportedModels: JSON.stringify(supportedModels),

      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      status: 'active',
      errorMessage: '',

      // 限流相关
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitDuration: rateLimitDuration.toString()
    }

    // 保存到 Redis
    await this._saveAccount(accountId, accountData)

    logger.success(`🚀 Created Gemini-API account: ${name} (${accountId})`)

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

    if (accountData.supportedModels) {
      try {
        accountData.supportedModels = JSON.parse(accountData.supportedModels)
      } catch (e) {
        accountData.supportedModels = []
      }
    }

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

    if (updates.supportedModels !== undefined) {
      updates.supportedModels = JSON.stringify(updates.supportedModels)
    }

    // 规范化 baseUrl
    if (updates.baseUrl) {
      updates.baseUrl = updates.baseUrl.endsWith('/')
        ? updates.baseUrl.slice(0, -1)
        : updates.baseUrl
    }

    // 更新 Redis
    const client = redis.getClientSafe()
    const key = `${this.ACCOUNT_KEY_PREFIX}${accountId}`
    await client.hset(key, updates)

    logger.info(`📝 Updated Gemini-API account: ${account.name}`)

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

    logger.info(`🗑️ Deleted Gemini-API account: ${accountId}`)

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

          // 获取限流状态信息
          const rateLimitInfo = this._getRateLimitInfo(account)

          // 格式化 rateLimitStatus 为对象
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

          // 转换 schedulable 字段为布尔值
          account.schedulable = account.schedulable !== 'false'
          // 转换 isActive 字段为布尔值
          account.isActive = account.isActive === 'true'

          account.platform = account.platform || 'gemini-api'

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

            if (accountData.supportedModels) {
              try {
                accountData.supportedModels = JSON.parse(accountData.supportedModels)
              } catch (e) {
                accountData.supportedModels = []
              }
            }

            // 获取限流状态信息
            const rateLimitInfo = this._getRateLimitInfo(accountData)

            // 格式化 rateLimitStatus 为对象
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

            // 转换 schedulable 字段为布尔值
            accountData.schedulable = accountData.schedulable !== 'false'
            // 转换 isActive 字段为布尔值
            accountData.isActive = accountData.isActive === 'true'

            accountData.platform = accountData.platform || 'gemini-api'

            accounts.push(accountData)
          }
        }
      }
    }

    return accounts
  }

  // 标记账户已使用
  async markAccountUsed(accountId) {
    await this.updateAccount(accountId, {
      lastUsedAt: new Date().toISOString()
    })
  }

  // 标记账户限流
  async setAccountRateLimited(accountId, isLimited, duration = null) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }

    if (isLimited) {
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
        `⏳ Gemini-API account ${account.name} marked as rate limited for ${rateLimitDuration} minutes (until ${resetAt.toISOString()})`
      )
    } else {
      // 清除限流状态
      await this.updateAccount(accountId, {
        rateLimitedAt: '',
        rateLimitStatus: '',
        rateLimitResetAt: '',
        status: 'active',
        schedulable: 'true',
        errorMessage: ''
      })

      logger.info(`✅ Rate limit cleared for Gemini-API account ${account.name}`)
    }
  }

  // 🚫 标记账户为未授权状态（401错误）
  async markAccountUnauthorized(accountId, reason = 'Gemini API账号认证失败（401错误）') {
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
      `🚫 Gemini-API account ${account.name || accountId} marked as unauthorized due to 401 error`
    )

    try {
      const webhookNotifier = require('../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: account.name || accountId,
        platform: 'gemini-api',
        status: 'unauthorized',
        errorCode: 'GEMINI_API_UNAUTHORIZED',
        reason,
        timestamp: now
      })
      logger.info(
        `📢 Webhook notification sent for Gemini-API account ${account.name || accountId} unauthorized state`
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
      await this.setAccountRateLimited(accountId, false)
      return true
    }

    return false
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
      `🔄 Toggled schedulable status for Gemini-API account ${account.name}: ${newSchedulableStatus}`
    )

    return {
      success: true,
      schedulable: newSchedulableStatus === 'true'
    }
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
    logger.info(`✅ Reset all error status for Gemini-API account ${accountId}`)

    // 发送 Webhook 通知
    try {
      const webhookNotifier = require('../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: account.name || accountId,
        platform: 'gemini-api',
        status: 'recovered',
        errorCode: 'STATUS_RESET',
        reason: 'Account status manually reset',
        timestamp: new Date().toISOString()
      })
      logger.info(
        `📢 Webhook notification sent for Gemini-API account ${account.name} status reset`
      )
    } catch (webhookError) {
      logger.error('Failed to send status reset webhook notification:', webhookError)
    }

    return { success: true, message: 'Account status reset successfully' }
  }

  // API Key 不会过期
  isTokenExpired(_account) {
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

module.exports = new GeminiApiAccountService()
