const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const ProxyHelper = require('../utils/proxyHelper')
const axios = require('axios')
const redis = require('../models/redis')
const config = require('../../config/config')
const logger = require('../utils/logger')
// const { maskToken } = require('../utils/tokenMask') // 未使用，已注释
const LRUCache = require('../utils/lruCache')

/**
 * Qwen Account Service
 * 管理 Qwen OAuth 账户（Device Code Flow）
 */
class QwenAccountService {
  constructor() {
    // Qwen API 端点
    this.qwenDeviceEndpoint = 'https://chat.qwen.ai/api/v1/oauth2/device/code'
    this.qwenTokenEndpoint = 'https://chat.qwen.ai/api/v1/oauth2/token'
    this.qwenClientId = 'f0304373b74a44d2b584a3fb70ca9e56'
    this.qwenScope = 'openid profile email model.completion'
    this.qwenAuthBaseUrl = 'https://chat.qwen.ai/authorize?user_code='
    this.qwenAuthClient = '&client=qwen-code'

    // 加密相关常量（与 Claude 一致）
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'qwen-salt'

    // 🚀 性能优化：缓存派生的加密密钥
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info('🧹 Qwen decrypt cache cleanup completed', this._decryptCache.getStats())
      },
      10 * 60 * 1000
    )
  }

  // 🏢 创建 Qwen 账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Qwen Account',
      description = '',
      qwenOauth = null, // Qwen OAuth 数据
      proxy = null,
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared' or 'group'
      platform = 'qwen',
      priority = 50,
      schedulable = true,
      subscriptionExpiresAt = null
    } = options

    const accountId = uuidv4()

    if (!qwenOauth) {
      throw new Error('Qwen OAuth data is required')
    }

    // 计算 expiresAt
    const obtainedAt = qwenOauth.obtainedAt || new Date().toISOString()
    const expiresIn = qwenOauth.expiresIn || 3600
    const expiresAt = new Date(new Date(obtainedAt).getTime() + expiresIn * 1000).getTime()

    const accountData = {
      id: accountId,
      name,
      description,
      platform,
      // OAuth 数据（加密）
      qwenOauth: this._encryptSensitiveData(JSON.stringify(qwenOauth)),
      accessToken: this._encryptSensitiveData(qwenOauth.accessToken),
      refreshToken: this._encryptSensitiveData(qwenOauth.refreshToken || ''),
      expiresIn: expiresIn.toString(),
      obtainedAt,
      expiresAt: expiresAt.toString(),
      resourceUrl: qwenOauth.resourceUrl || '',
      // 代理和调度配置
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      priority: priority.toString(),
      schedulable: schedulable.toString(),
      // 时间戳
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      lastRefreshAt: '',
      // 状态
      status: 'active',
      errorMessage: '',
      // 订阅到期
      subscriptionExpiresAt: subscriptionExpiresAt || ''
    }

    await redis.setQwenAccount(accountId, accountData)

    logger.success(`🚀 Created Qwen account: ${name} (${accountId})`)

    return {
      ...accountData,
      accessToken: '***',
      refreshToken: '***'
    }
  }

  // 📖 获取账户
  async getAccount(accountId) {
    const accountData = await redis.getQwenAccount(accountId)

    if (!accountData || !accountData.id) {
      return null
    }

    // 解密敏感数据
    accountData.accessToken = this._decryptSensitiveData(accountData.accessToken)
    accountData.refreshToken = this._decryptSensitiveData(accountData.refreshToken)

    // 解析 JSON 字段
    if (accountData.proxy) {
      try {
        accountData.proxy = JSON.parse(accountData.proxy)
      } catch (e) {
        accountData.proxy = null
      }
    }

    if (accountData.qwenOauth) {
      try {
        accountData.qwenOauth = JSON.parse(this._decryptSensitiveData(accountData.qwenOauth))
      } catch (e) {
        accountData.qwenOauth = null
      }
    }

    return accountData
  }

  // 📝 更新账户
  async updateAccount(accountId, updates) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    // 处理敏感字段加密
    if (updates.accessToken) {
      updates.accessToken = this._encryptSensitiveData(updates.accessToken)
    }

    if (updates.refreshToken) {
      updates.refreshToken = this._encryptSensitiveData(updates.refreshToken)
    }

    if (updates.qwenOauth) {
      const qwenOauthData = updates.qwenOauth

      // 同步更新 access/refresh token
      if (qwenOauthData.accessToken) {
        updates.accessToken = this._encryptSensitiveData(qwenOauthData.accessToken)
      }
      if (qwenOauthData.refreshToken) {
        updates.refreshToken = this._encryptSensitiveData(qwenOauthData.refreshToken)
      }

      // 更新过期时间
      if (qwenOauthData.expiresIn && qwenOauthData.obtainedAt) {
        const expiresAt = new Date(
          new Date(qwenOauthData.obtainedAt).getTime() + qwenOauthData.expiresIn * 1000
        ).getTime()
        updates.expiresAt = expiresAt.toString()
        updates.expiresIn = qwenOauthData.expiresIn.toString()
        updates.obtainedAt = qwenOauthData.obtainedAt
      }

      updates.qwenOauth = this._encryptSensitiveData(JSON.stringify(qwenOauthData))
    }

    // 处理 JSON 字段
    if (updates.proxy !== undefined) {
      updates.proxy = updates.proxy ? JSON.stringify(updates.proxy) : ''
    }

    // 更新 Redis
    const client = redis.getClientSafe()
    const key = `qwen:account:${accountId}`
    await client.hset(key, updates)

    logger.info(`📝 Updated Qwen account: ${account.name}`)

    return { success: true }
  }

  // 🗑️ 删除账户
  async deleteAccount(accountId) {
    await redis.deleteQwenAccount(accountId)
    logger.info(`🗑️ Deleted Qwen account: ${accountId}`)
    return { success: true }
  }

  // 📋 获取所有账户
  async getAllAccounts(includeInactive = false, options = {}) {
    const { maskSensitive = false } = options || {}
    const accounts = await redis.getAllQwenAccounts()
    const processedAccounts = []

    for (const account of accounts) {
      // 解密敏感数据
      if (account.accessToken) {
        account.accessToken = this._decryptSensitiveData(account.accessToken)
      }
      if (account.refreshToken) {
        account.refreshToken = this._decryptSensitiveData(account.refreshToken)
      }

      // 解析 JSON 字段
      if (account.proxy) {
        try {
          account.proxy = JSON.parse(account.proxy)
        } catch (e) {
          account.proxy = null
        }
      }

      // 过滤非活跃账户
      if (!includeInactive && account.isActive !== 'true') {
        continue
      }

      if (maskSensitive) {
        const maskedAccount = {
          ...account,
          accessToken: account.accessToken ? '[ENCRYPTED]' : '',
          refreshToken: account.refreshToken ? '[ENCRYPTED]' : '',
          qwenOauth: account.qwenOauth ? '[ENCRYPTED]' : ''
        }
        processedAccounts.push(maskedAccount)
      } else {
        processedAccounts.push(account)
      }
    }

    return processedAccounts
  }

  // 🔄 刷新 Access Token
  async refreshAccessToken(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const { refreshToken } = account
    if (!refreshToken) {
      throw new Error('Refresh token not found')
    }

    logger.info(`🔄 Refreshing access token for Qwen account: ${account.name}`)

    try {
      const proxyAgent = account.proxy ? ProxyHelper.createProxyAgent(account.proxy) : null

      const requestData = {
        grant_type: 'refresh_token',
        client_id: this.qwenClientId,
        refresh_token: refreshToken
      }

      const requestOptions = {
        method: 'POST',
        url: this.qwenTokenEndpoint,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'claude-cli/1.0.56 (external, cli)'
        },
        data: new URLSearchParams(requestData).toString(),
        timeout: 30000,
        ...(proxyAgent && {
          httpAgent: proxyAgent,
          httpsAgent: proxyAgent,
          proxy: false
        })
      }

      const response = await axios(requestOptions)

      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid token response from Qwen API')
      }

      const {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: expiresIn,
        token_type: _tokenType, // 未使用，使用 _ 前缀表示
        resource_url: resourceUrl
      } = response.data

      // 更新账户数据
      const obtainedAt = new Date().toISOString()
      const expiresAt = new Date(Date.now() + expiresIn * 1000).getTime()

      const updates = {
        accessToken: this._encryptSensitiveData(accessToken),
        refreshToken: this._encryptSensitiveData(newRefreshToken || refreshToken),
        expiresIn: expiresIn.toString(),
        obtainedAt,
        expiresAt: expiresAt.toString(),
        lastRefreshAt: new Date().toISOString(),
        status: 'active',
        errorMessage: ''
      }

      if (resourceUrl) {
        updates.resourceUrl = resourceUrl
      }

      await this.updateAccount(accountId, updates)

      logger.success(`✅ Successfully refreshed access token for Qwen account: ${account.name}`)

      return {
        success: true,
        accessToken,
        expiresAt: new Date(expiresAt).toISOString(),
        expiresIn,
        obtainedAt
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message

      // 处理 invalid_grant 错误（需要重新授权）
      if (
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('refresh_token not found')
      ) {
        await this.updateAccount(accountId, {
          status: 'error',
          errorMessage: 'Refresh token invalid, re-authorization required',
          schedulable: 'false'
        })
        throw new Error('Refresh token invalid, please re-authorize the account')
      }

      await this.updateAccount(accountId, {
        status: 'error',
        errorMessage: `Token refresh failed: ${errorMessage}`
      })

      logger.error(`❌ Failed to refresh Qwen access token:`, error)
      throw error
    }
  }

  // ✅ 获取有效的 Access Token（自动刷新）
  async getValidAccessToken(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    // 计算是否过期（提前 60 分钟刷新）
    const expiresAt = parseInt(account.expiresAt)
    const now = Date.now()
    const isExpired = !expiresAt || now >= expiresAt - 60 * 60 * 1000 // 60分钟提前刷新

    if (isExpired) {
      logger.info(`🔄 Access token expired or expiring soon for ${account.name}, refreshing...`)
      const result = await this.refreshAccessToken(accountId)
      return result.accessToken
    }

    return account.accessToken
  }

  // 🔐 加密敏感数据
  _encryptSensitiveData(data) {
    if (!data) {
      return ''
    }

    try {
      // 生成或获取缓存的加密密钥
      if (!this._encryptionKeyCache) {
        this._encryptionKeyCache = crypto.scryptSync(
          config.security.encryptionKey,
          this.ENCRYPTION_SALT,
          32
        )
      }

      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this._encryptionKeyCache, iv)

      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      return `${iv.toString('hex')}:${encrypted}`
    } catch (error) {
      logger.error('❌ Encryption error:', error)
      throw new Error('Failed to encrypt sensitive data')
    }
  }

  // 🔓 解密敏感数据
  _decryptSensitiveData(encryptedData) {
    if (!encryptedData) {
      return ''
    }

    // 检查缓存
    const cached = this._decryptCache.get(encryptedData)
    if (cached) {
      return cached
    }

    try {
      // 生成或获取缓存的加密密钥
      if (!this._encryptionKeyCache) {
        this._encryptionKeyCache = crypto.scryptSync(
          config.security.encryptionKey,
          this.ENCRYPTION_SALT,
          32
        )
      }

      const parts = encryptedData.split(':')
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format')
      }

      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]

      const decipher = crypto.createDecipheriv(
        this.ENCRYPTION_ALGORITHM,
        this._encryptionKeyCache,
        iv
      )

      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      // 缓存解密结果
      this._decryptCache.set(encryptedData, decrypted)

      return decrypted
    } catch (error) {
      logger.error('❌ Decryption error:', error)
      return ''
    }
  }
}

module.exports = new QwenAccountService()
