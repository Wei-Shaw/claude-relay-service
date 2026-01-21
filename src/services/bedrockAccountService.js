const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')
const bedrockRelayService = require('./bedrockRelayService')
const LRUCache = require('../utils/lruCache')

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
      credentialType = 'access_key' // 'access_key', 'bearer_token'（默认为 access_key）
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

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      // 注意：Bedrock 使用 AWS 凭证，没有 OAuth token，因此没有 expiresAt
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'bedrock' // 标识这是Bedrock账户
    }

    // 加密存储AWS凭证
    if (awsCredentials) {
      accountData.awsCredentials = this._encryptAwsCredentials(awsCredentials)
    }

    // 加密存储 Bearer Token
    if (bearerToken) {
      accountData.bearerToken = this._encryptAwsCredentials({ token: bearerToken })
    }

    const client = redis.getClientSafe()
    await client.set(`bedrock_account:${accountId}`, JSON.stringify(accountData))
    await redis.addToIndex('bedrock_account:index', accountId)

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

      // 根据凭证类型解密对应的凭证
      // 增强逻辑：优先按照 credentialType 解密，如果字段不存在则尝试解密实际存在的字段（兜底）
      try {
        let accessKeyDecrypted = false
        let bearerTokenDecrypted = false

        // 第一步：按照 credentialType 尝试解密对应的凭证
        if (account.credentialType === 'access_key' && account.awsCredentials) {
          // Access Key 模式：解密 AWS 凭证
          account.awsCredentials = this._decryptAwsCredentials(account.awsCredentials)
          accessKeyDecrypted = true
          logger.debug(
            `🔓 解密 Access Key 成功 - ID: ${accountId}, 类型: ${account.credentialType}`
          )
        } else if (account.credentialType === 'bearer_token' && account.bearerToken) {
          // Bearer Token 模式：解密 Bearer Token
          const decrypted = this._decryptAwsCredentials(account.bearerToken)
          account.bearerToken = decrypted.token
          bearerTokenDecrypted = true
          logger.debug(
            `🔓 解密 Bearer Token 成功 - ID: ${accountId}, 类型: ${account.credentialType}`
          )
        } else if (!account.credentialType || account.credentialType === 'default') {
          // 向后兼容：旧版本账号可能没有 credentialType 字段，尝试解密所有存在的凭证
          if (account.awsCredentials) {
            account.awsCredentials = this._decryptAwsCredentials(account.awsCredentials)
            accessKeyDecrypted = true
          }
          if (account.bearerToken) {
            const decrypted = this._decryptAwsCredentials(account.bearerToken)
            account.bearerToken = decrypted.token
            bearerTokenDecrypted = true
          }
          logger.debug(
            `🔓 兼容模式解密 - ID: ${accountId}, Access Key: ${accessKeyDecrypted}, Bearer Token: ${bearerTokenDecrypted}`
          )
        }

        // 第二步：兜底逻辑 - 如果按照 credentialType 没有解密到任何凭证，尝试解密实际存在的字段
        if (!accessKeyDecrypted && !bearerTokenDecrypted) {
          logger.warn(
            `⚠️ credentialType="${account.credentialType}" 与实际字段不匹配，尝试兜底解密 - ID: ${accountId}`
          )
          if (account.awsCredentials) {
            account.awsCredentials = this._decryptAwsCredentials(account.awsCredentials)
            accessKeyDecrypted = true
            logger.warn(
              `🔓 兜底解密 Access Key 成功 - ID: ${accountId}, credentialType 应为 'access_key'`
            )
          }
          if (account.bearerToken) {
            const decrypted = this._decryptAwsCredentials(account.bearerToken)
            account.bearerToken = decrypted.token
            bearerTokenDecrypted = true
            logger.warn(
              `🔓 兜底解密 Bearer Token 成功 - ID: ${accountId}, credentialType 应为 'bearer_token'`
            )
          }
        }

        // 验证至少解密了一种凭证
        if (!accessKeyDecrypted && !bearerTokenDecrypted) {
          logger.error(
            `❌ 未找到任何凭证可解密 - ID: ${accountId}, credentialType: ${account.credentialType}, hasAwsCredentials: ${!!account.awsCredentials}, hasBearerToken: ${!!account.bearerToken}`
          )
          return {
            success: false,
            error: 'No valid credentials found in account data'
          }
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

            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            type: 'bedrock',
            platform: 'bedrock',
            // 根据凭证类型判断是否有凭证
            hasCredentials:
              account.credentialType === 'bearer_token'
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

      // 更新 Bearer Token
      if (updates.bearerToken !== undefined) {
        if (updates.bearerToken) {
          account.bearerToken = this._encryptAwsCredentials({ token: updates.bearerToken })
        } else {
          delete account.bearerToken
        }
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
      await redis.removeFromIndex('bedrock_account:index', accountId)

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
  async testAccount(accountId) {
    try {
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        return accountResult
      }

      const account = accountResult.data

      logger.info(
        `🧪 测试Bedrock账户连接 - ID: ${accountId}, 名称: ${account.name}, 凭证类型: ${account.credentialType}`
      )

      // 验证凭证是否已解密
      const hasValidCredentials =
        (account.credentialType === 'access_key' && account.awsCredentials) ||
        (account.credentialType === 'bearer_token' && account.bearerToken) ||
        (!account.credentialType && (account.awsCredentials || account.bearerToken))

      if (!hasValidCredentials) {
        logger.error(
          `❌ 测试失败：账户没有有效凭证 - ID: ${accountId}, credentialType: ${account.credentialType}`
        )
        return {
          success: false,
          error: 'No valid credentials found after decryption'
        }
      }

      // 尝试创建 Bedrock 客户端来验证凭证格式
      try {
        bedrockRelayService._getBedrockClient(account.region, account)
        logger.debug(`✅ Bedrock客户端创建成功 - ID: ${accountId}`)
      } catch (clientError) {
        logger.error(`❌ 创建Bedrock客户端失败 - ID: ${accountId}`, clientError)
        return {
          success: false,
          error: `Failed to create Bedrock client: ${clientError.message}`
        }
      }

      // 获取可用模型列表（硬编码，但至少验证了凭证格式正确）
      const models = await bedrockRelayService.getAvailableModels(account)

      if (models && models.length > 0) {
        logger.info(
          `✅ Bedrock账户测试成功 - ID: ${accountId}, 发现 ${models.length} 个模型, 凭证类型: ${account.credentialType}`
        )
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
   * 🧪 测试 Bedrock 账户连接（SSE 流式返回，供前端测试页面使用）
   * @param {string} accountId - 账户ID
   * @param {Object} res - Express response 对象
   * @param {string} model - 测试使用的模型
   */
  async testAccountConnection(accountId, res, model = null) {
    const { InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime')

    try {
      // 获取账户信息
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Account not found')
      }

      const account = accountResult.data

      // 根据账户类型选择合适的测试模型
      if (!model) {
        // Access Key 模式使用 Haiku（更快更便宜）
        model = account.defaultModel || 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
      }

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

      // 构造测试请求体（Bedrock 格式）
      const bedrockPayload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content:
              'Hello! Please respond with a simple greeting to confirm the connection is working. And tell me who are you?'
          }
        ]
      }

      // 获取 Bedrock 客户端
      const region = account.region || bedrockRelayService.defaultRegion
      const client = bedrockRelayService._getBedrockClient(region, account)

      // 创建流式调用命令
      const command = new InvokeModelWithResponseStreamCommand({
        modelId: model,
        body: JSON.stringify(bedrockPayload),
        contentType: 'application/json',
        accept: 'application/json'
      })

      logger.debug(`🌊 Bedrock test stream - model: ${model}, region: ${region}`)

      const startTime = Date.now()
      const response = await client.send(command)

      // 处理流式响应
      // let responseText = ''
      for await (const chunk of response.body) {
        if (chunk.chunk) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes))

          // 提取文本内容
          if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
            const { text } = chunkData.delta
            // responseText += text

            // 发送 content 事件
            res.write(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
          }

          // 检测错误
          if (chunkData.type === 'error') {
            throw new Error(chunkData.error?.message || 'Bedrock API error')
          }
        }
      }

      const duration = Date.now() - startTime
      logger.info(`✅ Bedrock test completed - model: ${model}, duration: ${duration}ms`)

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
    if (!account.subscriptionExpiresAt) {
      return false // 未设置视为永不过期
    }
    const expiryDate = new Date(account.subscriptionExpiresAt)
    return expiryDate <= new Date()
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
