const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const { BEDROCK_TEST_MODEL } = require('../../../config/models')
const bedrockRelayService = require('../relay/bedrockRelayService')
const LRUCache = require('../../utils/lruCache')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const { normalizeBedrockRegion, assertSupportedBedrockModel } = require('../../utils/bedrockConfig')

const BEDROCK_CREDENTIAL_TYPES = ['access_key', 'bearer_token', 'default']

class BedrockAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'salt'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    this._encryptionKeyCache = null

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

  _createValidationError(message) {
    const error = new Error(message)
    error.code = 'BEDROCK_VALIDATION_ERROR'
    error.statusCode = 400
    return error
  }

  _resolveCredentialType(account = {}) {
    if (BEDROCK_CREDENTIAL_TYPES.includes(account.credentialType)) {
      return account.credentialType
    }
    if (account.awsCredentials) {
      return 'access_key'
    }
    if (account.bearerToken) {
      return 'bearer_token'
    }
    return 'default'
  }

  _assertCredentialType(credentialType) {
    if (!BEDROCK_CREDENTIAL_TYPES.includes(credentialType)) {
      throw this._createValidationError(
        `Invalid credential type. Must be one of: ${BEDROCK_CREDENTIAL_TYPES.join(', ')}`
      )
    }
    return credentialType
  }

  _normalizeAccessKeyCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') {
      return credentials
    }
    const normalized = {}
    if (Object.prototype.hasOwnProperty.call(credentials, 'accessKeyId')) {
      normalized.accessKeyId =
        typeof credentials.accessKeyId === 'string'
          ? credentials.accessKeyId.trim()
          : credentials.accessKeyId
    }
    if (Object.prototype.hasOwnProperty.call(credentials, 'secretAccessKey')) {
      normalized.secretAccessKey =
        typeof credentials.secretAccessKey === 'string'
          ? credentials.secretAccessKey.trim()
          : credentials.secretAccessKey
    }
    if (Object.prototype.hasOwnProperty.call(credentials, 'sessionToken')) {
      normalized.sessionToken =
        typeof credentials.sessionToken === 'string'
          ? credentials.sessionToken.trim() || null
          : credentials.sessionToken
    }
    return normalized
  }

  _assertCompleteAccessKeyCredentials(credentials) {
    if (
      typeof credentials?.accessKeyId !== 'string' ||
      !credentials.accessKeyId ||
      typeof credentials?.secretAccessKey !== 'string' ||
      !credentials.secretAccessKey
    ) {
      throw this._createValidationError(
        'AWS Access Key ID and Secret Access Key are required for access_key credentials'
      )
    }
  }

  // 🏢 创建Bedrock账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Bedrock Account',
      description = '',
      region = process.env.AWS_REGION || 'us-east-1',
      awsCredentials = null, // { accessKeyId, secretAccessKey, sessionToken }
      bearerToken = null, // AWS Bearer Token for Bedrock API Keys
      defaultModel = 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      priority = 50, // 调度优先级 (1-100，数字越小优先级越高)
      schedulable = true, // 是否可被调度
      credentialType = 'access_key',
      disableAutoProtection = false // 是否关闭自动防护（429/401/400/529 不自动禁用）
    } = options

    const accountId = uuidv4()
    const normalizedRegion = normalizeBedrockRegion(region, 'us-east-1')
    const normalizedCredentialType = this._assertCredentialType(credentialType)
    const normalizedDefaultModel = defaultModel ? assertSupportedBedrockModel(defaultModel) : null
    const normalizedCredentials = this._normalizeAccessKeyCredentials(awsCredentials)

    if (normalizedCredentialType === 'access_key') {
      this._assertCompleteAccessKeyCredentials(normalizedCredentials)
    } else if (
      normalizedCredentialType === 'bearer_token' &&
      (typeof bearerToken !== 'string' || !bearerToken.trim())
    ) {
      throw this._createValidationError('Bearer Token is required for bearer_token credentials')
    }

    const accountData = {
      id: accountId,
      name,
      description,
      region: normalizedRegion,
      defaultModel: normalizedDefaultModel,
      isActive,
      accountType,
      priority,
      schedulable,
      credentialType: normalizedCredentialType,

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      // 注意：Bedrock 使用 AWS 凭证，没有 OAuth token，因此没有 expiresAt
      subscriptionExpiresAt: options.subscriptionExpiresAt || options.expiresAt || null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'bedrock', // 标识这是Bedrock账户
      disableAutoProtection // 关闭自动防护
    }

    // 加密存储AWS凭证
    if (normalizedCredentialType === 'access_key') {
      accountData.awsCredentials = this._encryptAwsCredentials(normalizedCredentials)
    }

    // 加密存储 Bearer Token
    if (normalizedCredentialType === 'bearer_token') {
      accountData.bearerToken = this._encryptAwsCredentials({ token: bearerToken.trim() })
    }

    const client = redis.getClientSafe()
    await client.set(`bedrock_account:${accountId}`, JSON.stringify(accountData))
    await redis.addToIndex('bedrock_account:index', accountId)

    logger.info(
      `✅ 创建Bedrock账户成功 - ID: ${accountId}, 名称: ${name}, 区域: ${normalizedRegion}`
    )

    return {
      success: true,
      data: {
        id: accountId,
        name,
        description,
        region: normalizedRegion,
        defaultModel: normalizedDefaultModel,
        isActive,
        accountType,
        priority,
        schedulable,
        credentialType: normalizedCredentialType,
        expiresAt: accountData.subscriptionExpiresAt,
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
      account.region = normalizeBedrockRegion(account.region, 'us-east-1')
      account.credentialType = this._resolveCredentialType(account)

      try {
        if (account.credentialType === 'access_key') {
          if (!account.awsCredentials) {
            throw new Error('AWS access key credentials are missing')
          }
          account.awsCredentials = this._decryptAwsCredentials(account.awsCredentials)
          this._assertCompleteAccessKeyCredentials(account.awsCredentials)
          delete account.bearerToken
        } else if (account.credentialType === 'bearer_token') {
          if (!account.bearerToken) {
            throw new Error('AWS Bedrock bearer token is missing')
          }
          const decrypted = this._decryptAwsCredentials(account.bearerToken)
          account.bearerToken = decrypted.token
          if (!account.bearerToken) {
            throw new Error('AWS Bedrock bearer token is empty')
          }
          delete account.awsCredentials
        } else {
          // Default provider-chain accounts must never accidentally use stale stored credentials.
          delete account.awsCredentials
          delete account.bearerToken
        }
      } catch (decryptError) {
        logger.error(
          `❌ 解密Bedrock凭证失败 - ID: ${accountId}, 类型: ${account.credentialType}`,
          decryptError
        )
        return {
          success: false,
          error: `Credentials decryption failed: ${decryptError.message}`
        }
      }

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
      const _client = redis.getClientSafe()
      const accountIds = await redis.getAllIdsByIndex(
        'bedrock_account:index',
        'bedrock_account:*',
        /^bedrock_account:(.+)$/
      )
      const keys = accountIds.map((id) => `bedrock_account:${id}`)
      const accounts = []
      const dataList = await redis.batchGetChunked(keys)

      for (let i = 0; i < keys.length; i++) {
        const accountData = dataList[i]
        if (accountData) {
          const account = JSON.parse(accountData)
          const credentialType = this._resolveCredentialType(account)
          let normalizedRegion
          try {
            normalizedRegion = normalizeBedrockRegion(account.region, 'us-east-1')
          } catch (_error) {
            normalizedRegion = String(account.region || '')
              .trim()
              .toLowerCase()
          }

          // 返回给前端时，不包含敏感信息，只显示掩码
          accounts.push({
            id: account.id,
            name: account.name,
            description: account.description,
            region: normalizedRegion,
            defaultModel: account.defaultModel,
            isActive: account.isActive,
            accountType: account.accountType,
            priority: account.priority,
            schedulable: account.schedulable,
            credentialType,

            // ✅ 前端显示订阅过期时间（业务字段）
            expiresAt: account.subscriptionExpiresAt || null,

            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            type: 'bedrock',
            platform: 'bedrock',
            // 根据凭证类型判断是否有凭证
            hasCredentials:
              credentialType === 'default'
                ? true
                : credentialType === 'bearer_token'
                  ? !!account.bearerToken
                  : !!account.awsCredentials
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
      const currentCredentialType = this._resolveCredentialType(account)
      const targetCredentialType = this._assertCredentialType(
        updates.credentialType === undefined ? currentCredentialType : updates.credentialType
      )

      // 更新字段
      if (updates.name !== undefined) {
        account.name = updates.name
      }
      if (updates.description !== undefined) {
        account.description = updates.description
      }
      if (updates.region !== undefined) {
        account.region = normalizeBedrockRegion(updates.region, account.region || 'us-east-1')
      } else {
        account.region = normalizeBedrockRegion(account.region, 'us-east-1')
      }
      if (updates.defaultModel !== undefined) {
        account.defaultModel = updates.defaultModel
          ? assertSupportedBedrockModel(updates.defaultModel)
          : null
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
      if (targetCredentialType === 'access_key') {
        if (targetCredentialType !== currentCredentialType && !updates.awsCredentials) {
          throw this._createValidationError(
            'Complete AWS access key credentials are required when switching credential type'
          )
        }

        if (updates.awsCredentials === null) {
          delete account.awsCredentials
        } else if (updates.awsCredentials !== undefined) {
          const existingCredentials =
            targetCredentialType === currentCredentialType && account.awsCredentials
              ? this._decryptAwsCredentials(account.awsCredentials)
              : {}
          const patch = this._normalizeAccessKeyCredentials(updates.awsCredentials)
          const mergedCredentials = { ...existingCredentials }

          if (Object.prototype.hasOwnProperty.call(patch, 'accessKeyId')) {
            mergedCredentials.accessKeyId = patch.accessKeyId
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'secretAccessKey')) {
            mergedCredentials.secretAccessKey = patch.secretAccessKey
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'sessionToken')) {
            if (patch.sessionToken === null) {
              delete mergedCredentials.sessionToken
            } else {
              mergedCredentials.sessionToken = patch.sessionToken
            }
          }

          this._assertCompleteAccessKeyCredentials(mergedCredentials)
          account.awsCredentials = this._encryptAwsCredentials(mergedCredentials)
        } else if (account.awsCredentials?.accessKeyId) {
          account.awsCredentials = this._encryptAwsCredentials(account.awsCredentials)
        }
        delete account.bearerToken
      } else if (targetCredentialType === 'bearer_token') {
        if (
          targetCredentialType !== currentCredentialType &&
          (typeof updates.bearerToken !== 'string' || !updates.bearerToken.trim())
        ) {
          throw this._createValidationError(
            'Bearer Token is required when switching credential type'
          )
        }

        if (updates.bearerToken !== undefined) {
          if (typeof updates.bearerToken === 'string' && updates.bearerToken.trim()) {
            account.bearerToken = this._encryptAwsCredentials({
              token: updates.bearerToken.trim()
            })
          } else {
            delete account.bearerToken
          }
        }
        delete account.awsCredentials
      } else {
        delete account.awsCredentials
        delete account.bearerToken
      }
      account.credentialType = targetCredentialType

      // ✅ 直接保存 subscriptionExpiresAt（如果提供）
      // Bedrock 没有 token 刷新逻辑，不会覆盖此字段
      if (updates.subscriptionExpiresAt !== undefined) {
        account.subscriptionExpiresAt = updates.subscriptionExpiresAt
      }

      // 自动防护开关
      if (updates.disableAutoProtection !== undefined) {
        account.disableAutoProtection = updates.disableAutoProtection
      }

      account.updatedAt = new Date().toISOString()

      await client.set(`bedrock_account:${accountId}`, JSON.stringify(account))
      bedrockRelayService.invalidateAccountClients(accountId)

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
          expiresAt: account.subscriptionExpiresAt || null,
          updatedAt: account.updatedAt,
          type: 'bedrock'
        }
      }
    } catch (error) {
      logger.error(`❌ 更新Bedrock账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message, statusCode: error.statusCode }
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
      await redis.removeFromIndex('bedrock_account:index', accountId)
      bedrockRelayService.invalidateAccountClients(accountId)

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
  async testAccount(accountId, model = BEDROCK_TEST_MODEL) {
    try {
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        return accountResult
      }

      const account = accountResult.data

      const connection = await bedrockRelayService.testConnection(account, model)
      const models = await bedrockRelayService.getAvailableModels(account)

      logger.info(`✅ Bedrock账户真实连接测试成功 - ID: ${accountId}, 模型: ${connection.model}`)
      return {
        success: true,
        data: {
          ...connection,
          modelsCount: models.length,
          credentialType: account.credentialType
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
   * 🧪 测试 Bedrock 账户连接（SSE 流式返回，供前端测试页面使用）
   * @param {string} accountId - 账户ID
   * @param {Object} res - Express response 对象
   * @param {string} model - 测试使用的模型
   */
  async testAccountConnection(accountId, res, model = null) {
    try {
      // 获取账户信息
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Account not found')
      }

      const account = accountResult.data

      model = model || BEDROCK_TEST_MODEL

      logger.info(
        `🧪 Testing Bedrock account connection: ${account.name} (${accountId}), model: ${model}, credentialType: ${account.credentialType}`
      )

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.status(200)

      // 发送 test_start 事件
      res.write(`data: ${JSON.stringify({ type: 'test_start' })}\n\n`)

      const connection = await bedrockRelayService.testConnection(account, model, (text) => {
        res.write(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
      })
      logger.info(
        `✅ Bedrock test completed - model: ${connection.model}, duration: ${connection.duration}ms`
      )

      // 发送 message_stop 事件（前端兼容）
      res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)

      // 发送 test_complete 事件
      res.write(`data: ${JSON.stringify({ type: 'test_complete', success: true })}\n\n`)

      // 结束响应
      res.end()

      logger.info(`✅ Test request completed for Bedrock account: ${account.name}`)
    } catch (error) {
      logger.error(`❌ Test Bedrock account connection failed:`, error)

      // 发送错误事件给前端
      try {
        // 检查响应流是否仍然可写
        if (!res.writableEnded && !res.destroyed) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.status(200)
          }
          const errorMsg = error.message || '测试失败'
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
          res.end()
        }
      } catch (writeError) {
        logger.error('Failed to write error to response stream:', writeError)
      }

      // 不再重新抛出错误，避免路由层再次处理
      // throw error
    }
  }

  /**
   * 检查账户订阅是否过期
   * @param {Object} account - 账户对象
   * @returns {boolean} - true: 已过期, false: 未过期
   */
  isSubscriptionExpired(account) {
    const expiresAt = account?.subscriptionExpiresAt || account?.expiresAt
    if (!expiresAt) {
      return false // 未设置视为永不过期
    }
    const expiryTime = new Date(expiresAt).getTime()
    return Number.isFinite(expiryTime) && expiryTime <= Date.now()
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

  // 🔄 重置Bedrock账户所有异常状态
  async resetAccountStatus(accountId) {
    try {
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        throw new Error('Account not found')
      }

      const client = redis.getClientSafe()
      const accountKey = `bedrock:account:${accountId}`

      const updates = {
        status: 'active',
        errorMessage: '',
        schedulable: 'true',
        isActive: 'true'
      }

      const fieldsToDelete = [
        'rateLimitedAt',
        'rateLimitStatus',
        'unauthorizedAt',
        'unauthorizedCount',
        'overloadedAt',
        'overloadStatus',
        'blockedAt',
        'quotaStoppedAt'
      ]

      await client.hset(accountKey, updates)
      await client.hdel(accountKey, ...fieldsToDelete)

      logger.success(`Reset all error status for Bedrock account ${accountId}`)

      // 清除临时不可用状态
      await upstreamErrorHelper.clearTempUnavailable(accountId, 'bedrock').catch(() => {})

      // 异步发送 Webhook 通知（忽略错误）
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: accountData.name || accountId,
          platform: 'bedrock',
          status: 'recovered',
          errorCode: 'STATUS_RESET',
          reason: 'Account status manually reset',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.warn('Failed to send webhook notification for Bedrock status reset:', webhookError)
      }

      return { success: true, accountId }
    } catch (error) {
      logger.error(`❌ Failed to reset Bedrock account status: ${accountId}`, error)
      throw error
    }
  }
}

module.exports = new BedrockAccountService()
