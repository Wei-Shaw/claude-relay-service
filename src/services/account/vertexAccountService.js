const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const { JWT } = require('google-auth-library')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const LRUCache = require('../../utils/lruCache')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

// 默认作用域 - Vertex AI 使用统一的 cloud-platform 作用域
const VERTEX_OAUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform']
// 默认 access token 缓存时长（毫秒）— Google access token 有效期为 1 小时
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000

class VertexAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'salt'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存，提高解密性能
    this._decryptCache = new LRUCache(500)

    // 🔑 Access Token 缓存（accountId -> { token, expiresAt })
    this._tokenCache = new Map()

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        this._cleanupExpiredTokens()
        logger.info('🧹 Vertex decrypt cache cleanup completed', this._decryptCache.getStats())
      },
      10 * 60 * 1000
    )
  }

  // ☁️ 创建 Vertex AI 账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Vertex Account',
      description = '',
      projectId = process.env.GOOGLE_CLOUD_PROJECT || '',
      region = process.env.GOOGLE_CLOUD_REGION || 'global',
      defaultModel = 'claude-sonnet-4-5@20250929',
      supportedModels = [],
      credentialsJson = null, // Service Account JSON 内容（对象或字符串）
      proxy = null,
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      priority = 50,
      schedulable = true,
      disableAutoProtection = false
    } = options

    if (!projectId) {
      throw new Error('projectId is required for Vertex AI account')
    }

    if (!credentialsJson) {
      throw new Error('credentialsJson (Service Account JSON) is required for Vertex AI account')
    }

    // 规范化 credentialsJson 为对象
    const normalizedCredentials =
      typeof credentialsJson === 'string' ? JSON.parse(credentialsJson) : credentialsJson

    if (!normalizedCredentials.client_email || !normalizedCredentials.private_key) {
      throw new Error(
        'Invalid Service Account JSON: client_email and private_key fields are required'
      )
    }

    const accountId = uuidv4()

    const accountData = {
      id: accountId,
      name,
      description,
      projectId,
      region,
      defaultModel,
      supportedModels: Array.isArray(supportedModels) ? supportedModels : [],
      proxy: proxy || null,
      isActive,
      accountType,
      priority,
      schedulable,

      // ✅ 账户订阅到期时间（业务字段，手动管理）
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'vertex',
      disableAutoProtection,

      // 加密存储 Service Account 凭证
      credentialsJson: this._encryptCredentials(normalizedCredentials)
    }

    const client = redis.getClientSafe()
    await client.set(`vertex_account:${accountId}`, JSON.stringify(accountData))
    await redis.addToIndex('vertex_account:index', accountId)

    logger.info(
      `✅ 创建 Vertex AI 账户成功 - ID: ${accountId}, 名称: ${name}, 项目: ${projectId}, 区域: ${region}`
    )

    return {
      success: true,
      data: {
        id: accountId,
        name,
        description,
        projectId,
        region,
        defaultModel,
        supportedModels: accountData.supportedModels,
        isActive,
        accountType,
        priority,
        schedulable,
        createdAt: accountData.createdAt,
        type: 'vertex'
      }
    }
  }

  // 🔍 获取账户信息（含解密凭证）
  async getAccount(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountData = await client.get(`vertex_account:${accountId}`)
      if (!accountData) {
        return { success: false, error: 'Account not found' }
      }

      const account = JSON.parse(accountData)

      try {
        if (account.credentialsJson) {
          account.credentialsJson = this._decryptCredentials(account.credentialsJson)
        } else {
          logger.error(`❌ Vertex 账户缺少 credentialsJson - ID: ${accountId}`)
          return { success: false, error: 'No credentials found in account data' }
        }
      } catch (decryptError) {
        logger.error(`❌ 解密 Vertex 凭证失败 - ID: ${accountId}`, decryptError)
        return {
          success: false,
          error: `Credentials decryption failed: ${decryptError.message}`
        }
      }

      logger.debug(`🔍 获取 Vertex AI 账户 - ID: ${accountId}, 名称: ${account.name}`)

      return {
        success: true,
        data: account
      }
    } catch (error) {
      logger.error(`❌ 获取 Vertex AI 账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  // 📋 获取所有账户列表（不含敏感凭证）
  async getAllAccounts() {
    try {
      const accountIds = await redis.getAllIdsByIndex(
        'vertex_account:index',
        'vertex_account:*',
        /^vertex_account:(.+)$/
      )
      const keys = accountIds.map((id) => `vertex_account:${id}`)
      const accounts = []
      const dataList = await redis.batchGetChunked(keys)

      for (let i = 0; i < keys.length; i++) {
        const accountData = dataList[i]
        if (accountData) {
          const account = JSON.parse(accountData)

          // 不返回完整凭证，仅暴露是否已配置
          accounts.push({
            id: account.id,
            name: account.name,
            description: account.description,
            projectId: account.projectId,
            region: account.region,
            defaultModel: account.defaultModel,
            supportedModels: account.supportedModels || [],
            proxy: account.proxy || null,
            isActive: account.isActive,
            accountType: account.accountType,
            priority: account.priority,
            schedulable: account.schedulable,

            // ✅ 前端显示订阅过期时间（业务字段）
            expiresAt: account.subscriptionExpiresAt || null,

            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            type: 'vertex',
            platform: 'vertex',
            hasCredentials: !!account.credentialsJson
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

      logger.debug(`📋 获取所有 Vertex AI 账户 - 共 ${accounts.length} 个`)

      return {
        success: true,
        data: accounts
      }
    } catch (error) {
      logger.error('❌ 获取 Vertex AI 账户列表失败', error)
      return { success: false, error: error.message }
    }
  }

  // ✏️ 更新账户信息
  async updateAccount(accountId, updates = {}) {
    try {
      const client = redis.getClientSafe()
      const accountData = await client.get(`vertex_account:${accountId}`)
      if (!accountData) {
        return { success: false, error: 'Account not found' }
      }

      const account = JSON.parse(accountData)

      const simpleFields = [
        'name',
        'description',
        'projectId',
        'region',
        'defaultModel',
        'isActive',
        'accountType',
        'priority',
        'schedulable',
        'proxy'
      ]
      for (const field of simpleFields) {
        if (updates[field] !== undefined) {
          account[field] = updates[field]
        }
      }

      if (updates.supportedModels !== undefined) {
        account.supportedModels = Array.isArray(updates.supportedModels)
          ? updates.supportedModels
          : []
      }

      // 更新 Service Account 凭证
      if (updates.credentialsJson !== undefined) {
        if (updates.credentialsJson) {
          const normalized =
            typeof updates.credentialsJson === 'string'
              ? JSON.parse(updates.credentialsJson)
              : updates.credentialsJson
          if (!normalized.client_email || !normalized.private_key) {
            return {
              success: false,
              error: 'Invalid Service Account JSON: client_email and private_key required'
            }
          }
          account.credentialsJson = this._encryptCredentials(normalized)
          // 清除 token 缓存，强制使用新凭证重新获取
          this._tokenCache.delete(accountId)
        }
      }

      // ✅ 直接保存 subscriptionExpiresAt（如果提供）
      if (updates.subscriptionExpiresAt !== undefined) {
        account.subscriptionExpiresAt = updates.subscriptionExpiresAt
      }

      // 自动防护开关
      if (updates.disableAutoProtection !== undefined) {
        account.disableAutoProtection = updates.disableAutoProtection
      }

      account.updatedAt = new Date().toISOString()

      await client.set(`vertex_account:${accountId}`, JSON.stringify(account))

      logger.info(`✅ 更新 Vertex AI 账户成功 - ID: ${accountId}, 名称: ${account.name}`)

      return {
        success: true,
        data: {
          id: account.id,
          name: account.name,
          description: account.description,
          projectId: account.projectId,
          region: account.region,
          defaultModel: account.defaultModel,
          supportedModels: account.supportedModels || [],
          isActive: account.isActive,
          accountType: account.accountType,
          priority: account.priority,
          schedulable: account.schedulable,
          updatedAt: account.updatedAt,
          type: 'vertex'
        }
      }
    } catch (error) {
      logger.error(`❌ 更新 Vertex AI 账户失败 - ID: ${accountId}`, error)
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
      await client.del(`vertex_account:${accountId}`)
      await redis.removeFromIndex('vertex_account:index', accountId)
      this._tokenCache.delete(accountId)

      logger.info(`✅ 删除 Vertex AI 账户成功 - ID: ${accountId}`)

      return { success: true }
    } catch (error) {
      logger.error(`❌ 删除 Vertex AI 账户失败 - ID: ${accountId}`, error)
      return { success: false, error: error.message }
    }
  }

  // 🔑 获取（或刷新）账户的 Google access token
  async getAccessToken(account) {
    if (!account || !account.id) {
      throw new Error('Invalid account passed to getAccessToken')
    }

    // 检查缓存
    const cached = this._tokenCache.get(account.id)
    if (cached && cached.expiresAt > Date.now() + 60 * 1000) {
      return cached.token
    }

    if (!account.credentialsJson) {
      throw new Error('Vertex account has no decrypted credentialsJson')
    }

    const credentials = account.credentialsJson
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Invalid Vertex credentials: missing client_email or private_key')
    }

    try {
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: VERTEX_OAUTH_SCOPES
      })

      const tokenResponse = await jwtClient.authorize()
      const accessToken = tokenResponse.access_token
      if (!accessToken) {
        throw new Error('Google did not return an access_token')
      }

      // expiry_date 是绝对毫秒；若缺失使用默认 50 分钟
      const expiresAt = tokenResponse.expiry_date || Date.now() + TOKEN_CACHE_TTL_MS

      this._tokenCache.set(account.id, {
        token: accessToken,
        expiresAt
      })

      logger.debug(
        `🔑 Vertex access token 已刷新 - 账户: ${account.name || account.id}, 过期: ${new Date(
          expiresAt
        ).toISOString()}`
      )

      return accessToken
    } catch (error) {
      logger.error(`❌ 获取 Vertex access token 失败 - ID: ${account.id}`, error)
      throw new Error(`Failed to obtain Google access token: ${error.message}`)
    }
  }

  // 🎯 选择可用的 Vertex AI 账户（用于请求转发）
  async selectAvailableAccount() {
    try {
      const accountsResult = await this.getAllAccounts()
      if (!accountsResult.success) {
        return { success: false, error: 'Failed to get accounts' }
      }

      const availableAccounts = accountsResult.data.filter((account) => {
        if (this.isSubscriptionExpired(account)) {
          logger.debug(
            `⏰ Skipping expired Vertex account: ${account.name}, expired at ${account.subscriptionExpiresAt || account.expiresAt}`
          )
          return false
        }
        return account.isActive && account.schedulable
      })

      if (availableAccounts.length === 0) {
        return { success: false, error: 'No available Vertex accounts' }
      }

      const selectedAccount = availableAccounts[0]
      const fullAccountResult = await this.getAccount(selectedAccount.id)
      if (!fullAccountResult.success) {
        return { success: false, error: 'Failed to get selected account details' }
      }

      logger.debug(
        `🎯 选择 Vertex AI 账户 - ID: ${selectedAccount.id}, 名称: ${selectedAccount.name}`
      )

      return {
        success: true,
        data: fullAccountResult.data
      }
    } catch (error) {
      logger.error('❌ 选择 Vertex AI 账户失败', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查账户订阅是否过期
   */
  isSubscriptionExpired(account) {
    if (!account.subscriptionExpiresAt) {
      return false
    }
    const expiryDate = new Date(account.subscriptionExpiresAt)
    return expiryDate <= new Date()
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
        byProject: {}
      }

      accounts.forEach((acc) => {
        stats.byRegion[acc.region] = (stats.byRegion[acc.region] || 0) + 1
        stats.byProject[acc.projectId] = (stats.byProject[acc.projectId] || 0) + 1
      })

      return { success: true, data: stats }
    } catch (error) {
      logger.error('❌ 获取 Vertex AI 账户统计失败', error)
      return { success: false, error: error.message }
    }
  }

  // 🔄 重置 Vertex 账户所有异常状态
  async resetAccountStatus(accountId) {
    try {
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        throw new Error('Account not found')
      }

      const client = redis.getClientSafe()
      const accountKey = `vertex:account:${accountId}`

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

      logger.success(`Reset all error status for Vertex account ${accountId}`)

      // 清除临时不可用状态
      await upstreamErrorHelper.clearTempUnavailable(accountId, 'vertex').catch(() => {})

      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: accountData.name || accountId,
          platform: 'vertex',
          status: 'recovered',
          errorCode: 'STATUS_RESET',
          reason: 'Account status manually reset',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.warn('Failed to send webhook notification for Vertex status reset:', webhookError)
      }

      return { success: true, accountId }
    } catch (error) {
      logger.error(`❌ Failed to reset Vertex account status: ${accountId}`, error)
      throw error
    }
  }

  // 🧹 清理过期的 token 缓存
  _cleanupExpiredTokens() {
    const now = Date.now()
    for (const [accountId, entry] of this._tokenCache.entries()) {
      if (entry.expiresAt <= now) {
        this._tokenCache.delete(accountId)
      }
    }
  }

  // 🔑 生成加密密钥（缓存优化）
  _generateEncryptionKey() {
    if (!this._encryptionKeyCache) {
      this._encryptionKeyCache = crypto
        .createHash('sha256')
        .update(config.security.encryptionKey)
        .digest()
      logger.info('🔑 Vertex encryption key derived and cached for performance optimization')
    }
    return this._encryptionKeyCache
  }

  // 🔐 加密凭证
  _encryptCredentials(credentials) {
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
      logger.error('❌ Vertex 凭证加密失败', error)
      throw new Error('Credentials encryption failed')
    }
  }

  // 🔓 解密凭证
  _decryptCredentials(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'object') {
        logger.error('❌ 无效的 Vertex 加密数据格式:', encryptedData)
        throw new Error('Invalid encrypted data format')
      }

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

        const key = this._generateEncryptionKey()
        const iv = Buffer.from(encryptedData.iv, 'hex')
        const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv)

        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        const result = JSON.parse(decrypted)

        // 💾 存入缓存（5分钟过期）
        this._decryptCache.set(cacheKey, result, 5 * 60 * 1000)

        return result
      } else if (encryptedData.client_email && encryptedData.private_key) {
        // 兼容明文存储（不推荐）
        logger.warn('⚠️ 发现未加密的 Vertex 凭证，建议更新账户以启用加密')
        return encryptedData
      } else {
        logger.error('❌ 缺少 Vertex 加密数据字段:', {
          hasEncrypted: !!encryptedData.encrypted,
          hasIv: !!encryptedData.iv
        })
        throw new Error('Missing encrypted data fields or valid credentials')
      }
    } catch (error) {
      logger.error('❌ Vertex 凭证解密失败', error)
      throw new Error('Credentials decryption failed')
    }
  }

  // 🧪 测试 Vertex 账户连通性（SSE 流式）
  async testAccountConnection(accountId, res, model = null) {
    const axios = require('axios')
    const ProxyHelper = require('../../utils/proxyHelper')
    const { IncrementalSSEParser } = require('../../utils/sseParser')

    try {
      const accountResult = await this.getAccount(accountId)
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Account not found')
      }

      const account = accountResult.data
      const projectId = account.projectId
      if (!projectId) {
        throw new Error('Vertex account missing projectId')
      }

      const region = account.region || process.env.VERTEX_REGION || 'global'
      const modelId = model || account.defaultModel || 'claude-sonnet-4-5@20250929'

      logger.info(
        `🧪 Testing Vertex account: ${account.name} (${accountId}), model: ${modelId}, region: ${region}, project: ${projectId}`
      )

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.status(200)
      res.write(`data: ${JSON.stringify({ type: 'test_start' })}\n\n`)

      const accessToken = await this.getAccessToken(account)

      const encodedModel = encodeURIComponent(modelId)
      const host =
        region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`
      const url = `https://${host}/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${encodedModel}:streamRawPredict`

      const payload = {
        anthropic_version: 'vertex-2023-10-16',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content:
              'Hello! Please respond with a simple greeting to confirm the connection is working. And tell me who are you?'
          }
        ]
      }

      const proxyAgent = ProxyHelper.createProxyAgent(account.proxy)
      const axiosConfig = {
        method: 'POST',
        url,
        data: payload,
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`
        },
        validateStatus: () => true
      }
      if (proxyAgent) {
        axiosConfig.httpAgent = proxyAgent
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.proxy = false
      }

      const startTime = Date.now()
      const response = await axios(axiosConfig)

      if (response.status >= 400) {
        const chunks = []
        for await (const chunk of response.data) {
          chunks.push(chunk)
        }
        const errorBody = Buffer.concat(chunks).toString('utf8').substring(0, 500)
        throw new Error(`Vertex upstream ${response.status}: ${errorBody}`)
      }

      const parser = new IncrementalSSEParser()
      for await (const chunk of response.data) {
        const events = parser.feed(chunk.toString('utf8'))
        for (const evt of events) {
          if (evt.type === 'data' && evt.data && evt.data.type) {
            const chunkData = evt.data
            if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
              res.write(
                `data: ${JSON.stringify({ type: 'content', text: chunkData.delta.text })}\n\n`
              )
            }
            if (chunkData.type === 'error') {
              throw new Error(chunkData.error?.message || 'Vertex API error')
            }
          }
        }
      }

      const duration = Date.now() - startTime
      logger.info(`✅ Vertex test completed - model: ${modelId}, duration: ${duration}ms`)

      res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'test_complete', success: true })}\n\n`)
      res.end()
    } catch (error) {
      logger.error('❌ Test Vertex account connection failed:', error)
      try {
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
    }
  }
}

module.exports = new VertexAccountService()
