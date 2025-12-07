const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')
const LRUCache = require('../utils/lruCache')

class BedrockAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'salt'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    this._encryptionKeyCache = null

    this.RATE_LIMIT_TTL_SECONDS = 300
    this.TEMP_UNAVAILABLE_TTL_SECONDS = 300

    // 🔄 解密结果缓存，提高解密性能
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info('🧹 Bedrock decrypt cache cleanup completed', this._decryptCache.getStats())
      },
      10 * 60 * 1000
    )
  }

  // 🏢 创建Bedrock账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Bedrock Account',
      description = '',
      region = process.env.AWS_REGION || 'us-east-1',
      awsCredentials = null, // { accessKeyId, secretAccessKey, sessionToken }
      defaultModel = 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      priority = 50, // 调度优先级 (1-100，数字越小优先级越高)
      schedulable = true, // 是否可被调度
      credentialType = 'default', // 'default', 'access_key', 'bearer_token'
      noFailover = false // 是否禁用 failover（默认false，即允许failover）
    } = options

    const accountId = uuidv4()

    const accountData = {
      id: accountId,
      name,
      description,
      region,
      defaultModel,
      isActive,
      accountType,
      priority,
      schedulable,
      credentialType,
      noFailover: noFailover.toString(),

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      // 注意：Bedrock 使用 AWS 凭证，没有 OAuth token，因此没有 expiresAt
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,
      status: 'active',
      errorMessage: '',
      rateLimitUntil: null,
      tempUnavailableUntil: null,
      unauthorizedAt: null,
      blockedAt: null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'bedrock' // 标识这是Bedrock账户
    }

    // 加密存储AWS凭证
    if (awsCredentials) {
      accountData.awsCredentials = this._encryptAwsCredentials(awsCredentials)
    }

    const client = redis.getClientSafe()
    await client.set(`bedrock_account:${accountId}`, JSON.stringify(accountData))

    logger.info(`✅ 创建Bedrock账户成功 - ID: ${accountId}, 名称: ${name}, 区域: ${region}`)

    return {
      success: true,
      data: {
        id: accountId,
        name,
        description,
        region,
        defaultModel,
        isActive,
        accountType,
        priority,
        schedulable,
        credentialType,
        createdAt: accountData.createdAt,
        type: 'bedrock'
      }
    }
  }

  // 🔍 获取账户信息
  async getAccount(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountData = await client.get(`bedrock_account:${accountId}`)
      if (!accountData) {
        return { success: false, error: 'Account not found' }
      }

      const account = JSON.parse(accountData)
      this._normalizeAccountStatus(account)

      // 解密AWS凭证用于内部使用
      if (account.awsCredentials) {
        account.awsCredentials = this._decryptAwsCredentials(account.awsCredentials)
      }

      account.noFailover = account.noFailover === 'true' || account.noFailover === true

      logger.debug(`🔍 获取Bedrock账户 - ID: ${accountId}, 名称: ${account.name}`)

      return {
        success: true,
        data: account
      }
    } catch (error) {
      logger.error(`❌ 获取Bedrock账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  // 📋 获取所有账户列表
  async getAllAccounts() {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys('bedrock_account:*')
      const accounts = []

      for (const key of keys) {
        const accountData = await client.get(key)
        if (accountData) {
          const account = JSON.parse(accountData)
          this._normalizeAccountStatus(account)

          // 返回给前端时，不包含敏感信息，只显示掩码
          accounts.push({
            id: account.id,
            name: account.name,
            description: account.description,
            region: account.region,
            defaultModel: account.defaultModel,
            isActive: account.isActive,
            accountType: account.accountType,
            priority: account.priority,
            schedulable: account.schedulable,
            credentialType: account.credentialType,

            // ✅ 前端显示订阅过期时间（业务字段）
            expiresAt: account.subscriptionExpiresAt || null,
            status: account.status || 'active',
            rateLimitUntil: account.rateLimitUntil || null,
            tempUnavailableUntil: account.tempUnavailableUntil || null,
            unauthorizedAt: account.unauthorizedAt || null,
            blockedAt: account.blockedAt || null,

            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            type: 'bedrock',
            platform: 'bedrock',
            hasCredentials: !!account.awsCredentials
          })
        }
      }

      // 按优先级和名称排序
      accounts.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }
        return a.name.localeCompare(b.name)
      })

      logger.debug(`📋 获取所有Bedrock账户 - 共 ${accounts.length} 个`)

      return {
        success: true,
        data: accounts
      }
    } catch (error) {
      logger.error('❌ 获取Bedrock账户列表失败', error)
      return { success: false, error: error.message }
    }
  }

  // ✏️ 更新账户信息
  async updateAccount(accountId, updates = {}) {
    try {
      // 获取原始账户数据（不解密凭证）
      const client = redis.getClientSafe()
      const accountData = await client.get(`bedrock_account:${accountId}`)
      if (!accountData) {
        return { success: false, error: 'Account not found' }
      }

      const account = JSON.parse(accountData)

      // 更新字段
      if (updates.name !== undefined) {
        account.name = updates.name
      }
      if (updates.description !== undefined) {
        account.description = updates.description
      }
      if (updates.region !== undefined) {
        account.region = updates.region
      }
      if (updates.defaultModel !== undefined) {
        account.defaultModel = updates.defaultModel
      }
      if (updates.isActive !== undefined) {
        account.isActive = updates.isActive
      }
      if (updates.accountType !== undefined) {
        account.accountType = updates.accountType
      }
      if (updates.priority !== undefined) {
        account.priority = updates.priority
      }
      if (updates.schedulable !== undefined) {
        account.schedulable = updates.schedulable
      }
      if (updates.credentialType !== undefined) {
        account.credentialType = updates.credentialType
      }
      if (updates.noFailover !== undefined) {
        account.noFailover = updates.noFailover.toString()
      }

      // 更新AWS凭证
      if (updates.awsCredentials !== undefined) {
        if (updates.awsCredentials) {
          account.awsCredentials = this._encryptAwsCredentials(updates.awsCredentials)
        } else {
          delete account.awsCredentials
        }
      } else if (account.awsCredentials && account.awsCredentials.accessKeyId) {
        // 如果没有提供新凭证但现有凭证是明文格式，重新加密
        const plainCredentials = account.awsCredentials
        account.awsCredentials = this._encryptAwsCredentials(plainCredentials)
        logger.info(`🔐 重新加密Bedrock账户凭证 - ID: ${accountId}`)
      }

      // ✅ 直接保存 subscriptionExpiresAt（如果提供）
      // Bedrock 没有 token 刷新逻辑，不会覆盖此字段
      if (updates.subscriptionExpiresAt !== undefined) {
        account.subscriptionExpiresAt = updates.subscriptionExpiresAt
      }

      account.updatedAt = new Date().toISOString()

      await client.set(`bedrock_account:${accountId}`, JSON.stringify(account))

      logger.info(`✅ 更新Bedrock账户成功 - ID: ${accountId}, 名称: ${account.name}`)

      return {
        success: true,
        data: {
          id: account.id,
          name: account.name,
          description: account.description,
          region: account.region,
          defaultModel: account.defaultModel,
          isActive: account.isActive,
          accountType: account.accountType,
          priority: account.priority,
          schedulable: account.schedulable,
          credentialType: account.credentialType,
          updatedAt: account.updatedAt,
          type: 'bedrock'
        }
      }
    } catch (error) {
      logger.error(`❌ 更新Bedrock账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  // 🗑️ 删除账户
  async deleteAccount(accountId) {
    try {
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        return accountResult
      }

      const client = redis.getClientSafe()
      await client.del(`bedrock_account:${accountId}`)

      logger.info(`✅ 删除Bedrock账户成功 - ID: ${accountId}`)

      return { success: true }
    } catch (error) {
      logger.error(`❌ 删除Bedrock账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  // 🎯 选择可用的Bedrock账户 (用于请求转发)
  async selectAvailableAccount() {
    try {
      const accountsResult = await this.getAllAccounts()
      if (!accountsResult.success) {
        return { success: false, error: 'Failed to get accounts' }
      }

      const availableAccounts = accountsResult.data.filter((account) => {
        // ✅ 检查账户订阅是否过期
        if (this.isSubscriptionExpired(account)) {
          logger.debug(
            `⏰ Skipping expired Bedrock account: ${account.name}, expired at ${account.subscriptionExpiresAt || account.expiresAt}`
          )
          return false
        }

        // 跳过受限或不可用的账号
        if (account.status === 'blocked' || account.status === 'unauthorized') {
          return false
        }

        const now = new Date()
        if (account.tempUnavailableUntil && new Date(account.tempUnavailableUntil) > now) {
          return false
        }
        if (account.rateLimitUntil && new Date(account.rateLimitUntil) > now) {
          return false
        }

        return account.isActive && account.schedulable
      })

      if (availableAccounts.length === 0) {
        return { success: false, error: 'No available Bedrock accounts' }
      }

      // 简单的轮询选择策略 - 选择优先级最高的账户
      const selectedAccount = availableAccounts[0]

      // 获取完整账户信息（包含解密的凭证）
      const fullAccountResult = await this.getAccount(selectedAccount.id)
      if (!fullAccountResult.success) {
        return { success: false, error: 'Failed to get selected account details' }
      }

      logger.debug(`🎯 选择Bedrock账户 - ID: ${selectedAccount.id}, 名称: ${selectedAccount.name}`)

      return {
        success: true,
        data: fullAccountResult.data
      }
    } catch (error) {
      logger.error('❌ 选择Bedrock账户失败', error)
      return { success: false, error: error.message }
    }
  }

  // 🧪 测试账户连接
  async testAccount(accountId) {
    try {
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        return accountResult
      }

      const account = accountResult.data
      const bedrockRelayService = require('./bedrockRelayService')

      logger.info(`🧪 测试Bedrock账户连接 - ID: ${accountId}, 名称: ${account.name}`)

      // 尝试获取模型列表来测试连接
      const models = await bedrockRelayService.getAvailableModels(account)

      if (models && models.length > 0) {
        logger.info(`✅ Bedrock账户测试成功 - ID: ${accountId}, 发现 ${models.length} 个模型`)
        return {
          success: true,
          data: {
            status: 'connected',
            modelsCount: models.length,
            region: account.region,
            credentialType: account.credentialType
          }
        }
      } else {
        return {
          success: false,
          error: 'Unable to retrieve models from Bedrock'
        }
      }
    } catch (error) {
      logger.error(`❌ 测试Bedrock账户失败 - ID: ${accountId}`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 检查账户订阅是否过期
   * @param {Object} account - 账户对象
   * @returns {boolean} - true: 已过期, false: 未过期
   */
  isSubscriptionExpired(account) {
    if (!account.subscriptionExpiresAt) {
      return false // 未设置视为永不过期
    }
    const expiryDate = new Date(account.subscriptionExpiresAt)
    return expiryDate <= new Date()
  }

  _getAccountKey(accountId) {
    return `bedrock_account:${accountId}`
  }

  _normalizeAccountStatus(account) {
    if (!account.status) {
      account.status = 'active'
    }
    return account
  }

  async _getAccountData(accountId) {
    const client = redis.getClientSafe()
    const raw = await client.get(this._getAccountKey(accountId))
    if (!raw) {
      throw new Error('Bedrock account not found')
    }
    const parsed = JSON.parse(raw)
    return this._normalizeAccountStatus(parsed)
  }

  async _saveAccountData(account) {
    const client = redis.getClientSafe()
    await client.set(this._getAccountKey(account.id), JSON.stringify(account))
  }

  async markAccountUnauthorized(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      account.status = 'unauthorized'
      account.unauthorizedAt = new Date().toISOString()
      delete account.rateLimitUntil
      delete account.rateLimitedAt
      await this._saveAccountData(account)
      logger.warn(`🚫 Marked Bedrock account as unauthorized: ${account.name || accountId}`)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Bedrock account unauthorized: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  async clearAccountUnauthorized(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      delete account.unauthorizedAt
      if (account.status === 'unauthorized') {
        account.status = 'active'
      }
      await this._saveAccountData(account)
      logger.info(
        `✅ Cleared unauthorized status for Bedrock account: ${account.name || accountId}`
      )
      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to clear unauthorized status for Bedrock account: ${accountId}`,
        error
      )
      return { success: false, error: error.message }
    }
  }

  async isAccountUnauthorized(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      return account.status === 'unauthorized'
    } catch (error) {
      logger.error(
        `❌ Failed to check unauthorized status for Bedrock account: ${accountId}`,
        error
      )
      return false
    }
  }

  async markAccountBlocked(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      account.status = 'blocked'
      account.blockedAt = new Date().toISOString()
      delete account.rateLimitUntil
      delete account.rateLimitedAt
      await this._saveAccountData(account)
      logger.warn(`⛔ Marked Bedrock account as blocked: ${account.name || accountId}`)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Bedrock account blocked: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  async markAccountRateLimited(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      const now = new Date()
      const until = new Date(now.getTime() + this.RATE_LIMIT_TTL_SECONDS * 1000)
      if (account.status !== 'blocked' && account.status !== 'unauthorized') {
        account.status = 'rate_limited'
      }
      account.rateLimitedAt = now.toISOString()
      account.rateLimitUntil = until.toISOString()
      await this._saveAccountData(account)
      logger.warn(
        `⏱️ Marked Bedrock account as rate limited until ${until.toISOString()}: ${account.name || accountId}`
      )
      return { success: true, rateLimitUntil: until.toISOString() }
    } catch (error) {
      logger.error(`❌ Failed to mark Bedrock account rate limited: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  async removeAccountRateLimit(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      delete account.rateLimitedAt
      delete account.rateLimitUntil
      if (account.status === 'rate_limited') {
        account.status = 'active'
      }
      await this._saveAccountData(account)
      logger.info(`✅ Removed rate limit for Bedrock account: ${account.name || accountId}`)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to remove Bedrock account rate limit: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  async isAccountRateLimited(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      if (account.rateLimitUntil) {
        const now = new Date()
        const until = new Date(account.rateLimitUntil)
        if (until > now) {
          return true
        }
        await this.removeAccountRateLimit(accountId)
      }
      return account.status === 'rate_limited'
    } catch (error) {
      logger.error(`❌ Failed to check Bedrock account rate limit: ${accountId}`, error)
      return false
    }
  }

  async markAccountTemporarilyUnavailable(
    accountId,
    ttlSeconds = this.TEMP_UNAVAILABLE_TTL_SECONDS
  ) {
    try {
      const client = redis.getClientSafe()
      const account = await this._getAccountData(accountId)
      const now = new Date()
      const until = new Date(now.getTime() + ttlSeconds * 1000)
      if (account.status !== 'blocked' && account.status !== 'unauthorized') {
        account.status = 'temporarily_unavailable'
      }
      account.tempUnavailableUntil = until.toISOString()
      await this._saveAccountData(account)
      await client.setex(`temp_unavailable:bedrock:${accountId}`, ttlSeconds, '1')
      logger.warn(
        `⏱️ Marked Bedrock account temporarily unavailable until ${until.toISOString()}: ${account.name || accountId}`
      )
      return { success: true, tempUnavailableUntil: until.toISOString() }
    } catch (error) {
      logger.error(`❌ Failed to mark Bedrock account temporarily unavailable: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  async isAccountTemporarilyUnavailable(accountId) {
    try {
      const account = await this._getAccountData(accountId)
      if (account.tempUnavailableUntil) {
        const now = new Date()
        const until = new Date(account.tempUnavailableUntil)
        if (until > now) {
          return true
        }
        delete account.tempUnavailableUntil
        if (account.status === 'temporarily_unavailable') {
          account.status = 'active'
        }
        await this._saveAccountData(account)
      }
      return account.status === 'temporarily_unavailable'
    } catch (error) {
      logger.error(
        `❌ Failed to check Bedrock account temporary unavailable status: ${accountId}`,
        error
      )
      return false
    }
  }

  // 🔑 生成加密密钥（缓存优化）
  _generateEncryptionKey() {
    if (!this._encryptionKeyCache) {
      this._encryptionKeyCache = crypto
        .createHash('sha256')
        .update(config.security.encryptionKey)
        .digest()
      logger.info('🔑 Bedrock encryption key derived and cached for performance optimization')
    }
    return this._encryptionKeyCache
  }

  // 🔐 加密AWS凭证
  _encryptAwsCredentials(credentials) {
    try {
      const key = this._generateEncryptionKey()
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv)

      const credentialsString = JSON.stringify(credentials)
      let encrypted = cipher.update(credentialsString, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      return {
        encrypted,
        iv: iv.toString('hex')
      }
    } catch (error) {
      logger.error('❌ AWS凭证加密失败', error)
      throw new Error('Credentials encryption failed')
    }
  }

  // 🔓 解密AWS凭证
  _decryptAwsCredentials(encryptedData) {
    try {
      // 检查数据格式
      if (!encryptedData || typeof encryptedData !== 'object') {
        logger.error('❌ 无效的加密数据格式:', encryptedData)
        throw new Error('Invalid encrypted data format')
      }

      // 检查是否为加密格式 (有 encrypted 和 iv 字段)
      if (encryptedData.encrypted && encryptedData.iv) {
        // 🎯 检查缓存
        const cacheKey = crypto
          .createHash('sha256')
          .update(JSON.stringify(encryptedData))
          .digest('hex')
        const cached = this._decryptCache.get(cacheKey)
        if (cached !== undefined) {
          return cached
        }

        // 加密数据 - 进行解密
        const key = this._generateEncryptionKey()
        const iv = Buffer.from(encryptedData.iv, 'hex')
        const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv)

        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        const result = JSON.parse(decrypted)

        // 💾 存入缓存（5分钟过期）
        this._decryptCache.set(cacheKey, result, 5 * 60 * 1000)

        // 📊 定期打印缓存统计
        if ((this._decryptCache.hits + this._decryptCache.misses) % 1000 === 0) {
          this._decryptCache.printStats()
        }

        return result
      } else if (encryptedData.accessKeyId) {
        // 纯文本数据 - 直接返回 (向后兼容)
        logger.warn('⚠️ 发现未加密的AWS凭证，建议更新账户以启用加密')
        return encryptedData
      } else {
        // 既不是加密格式也不是有效的凭证格式
        logger.error('❌ 缺少加密数据字段:', {
          hasEncrypted: !!encryptedData.encrypted,
          hasIv: !!encryptedData.iv,
          hasAccessKeyId: !!encryptedData.accessKeyId
        })
        throw new Error('Missing encrypted data fields or valid credentials')
      }
    } catch (error) {
      logger.error('❌ AWS凭证解密失败', error)
      throw new Error('Credentials decryption failed')
    }
  }

  // 🔍 获取账户统计信息
  async getAccountStats() {
    try {
      const accountsResult = await this.getAllAccounts()
      if (!accountsResult.success) {
        return { success: false, error: accountsResult.error }
      }

      const accounts = accountsResult.data
      const stats = {
        total: accounts.length,
        active: accounts.filter((acc) => acc.isActive).length,
        inactive: accounts.filter((acc) => !acc.isActive).length,
        schedulable: accounts.filter((acc) => acc.schedulable).length,
        byRegion: {},
        byCredentialType: {}
      }

      // 按区域统计
      accounts.forEach((acc) => {
        stats.byRegion[acc.region] = (stats.byRegion[acc.region] || 0) + 1
        stats.byCredentialType[acc.credentialType] =
          (stats.byCredentialType[acc.credentialType] || 0) + 1
      })

      return { success: true, data: stats }
    } catch (error) {
      logger.error('❌ 获取Bedrock账户统计失败', error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = new BedrockAccountService()
