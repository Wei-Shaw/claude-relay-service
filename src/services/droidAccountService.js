const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const axios = require('axios')
const redis = require('../models/redis')
const config = require('../../config/config')
const logger = require('../utils/logger')
const { maskToken } = require('../utils/tokenMask')
const ProxyHelper = require('../utils/proxyHelper')
const LRUCache = require('../utils/lruCache')

/**
 * Droid 账户管理服务
 *
 * 支持 WorkOS OAuth 集成，管理 Droid (Factory.ai) 账户
 * 提供账户创建、token 刷新、代理配置等功能
 */
class DroidAccountService {
  constructor() {
    // WorkOS OAuth 配置
    this.oauthTokenUrl = 'https://api.workos.com/user_management/authenticate'
    this.factoryApiBaseUrl = 'https://app.factory.ai/api/llm'

    this.workosClientId = 'client_01HNM792M5G5G1A2THWPXKFMXB'

    // Token 刷新策略
    this.refreshIntervalHours = 6 // 每6小时刷新一次
    this.tokenValidHours = 8 // Token 有效期8小时

    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'droid-account-salt'

    // 🚀 性能优化：缓存派生的加密密钥
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info('🧹 Droid decrypt cache cleanup completed', this._decryptCache.getStats())
      },
      10 * 60 * 1000
    )
  }

  /**
   * 生成加密密钥（缓存优化）
   */
  _generateEncryptionKey() {
    if (!this._encryptionKeyCache) {
      this._encryptionKeyCache = crypto.scryptSync(
        config.security.encryptionKey,
        this.ENCRYPTION_SALT,
        32
      )
      logger.info('🔑 Droid encryption key derived and cached for performance optimization')
    }
    return this._encryptionKeyCache
  }

  /**
   * 加密敏感数据
   */
  _encryptSensitiveData(text) {
    if (!text) {
      return ''
    }

    const key = this._generateEncryptionKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return `${iv.toString('hex')}:${encrypted}`
  }

  /**
   * 解密敏感数据（带缓存）
   */
  _decryptSensitiveData(encryptedText) {
    if (!encryptedText) {
      return ''
    }

    // 🎯 检查缓存
    const cacheKey = crypto.createHash('sha256').update(encryptedText).digest('hex')
    const cached = this._decryptCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    try {
      const key = this._generateEncryptionKey()
      const parts = encryptedText.split(':')
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]

      const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      // 💾 存入缓存（5分钟过期）
      this._decryptCache.set(cacheKey, decrypted, 5 * 60 * 1000)

      return decrypted
    } catch (error) {
      logger.error('❌ Failed to decrypt Droid data:', error)
      return ''
    }
  }

  /**
   * 使用 WorkOS Refresh Token 刷新并验证凭证
   */
  async _refreshTokensWithWorkOS(refreshToken, proxyConfig = null) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error('Refresh Token 无效')
    }

    const formData = new URLSearchParams()
    formData.append('grant_type', 'refresh_token')
    formData.append('refresh_token', refreshToken)
    formData.append('client_id', this.workosClientId)

    const requestOptions = {
      method: 'POST',
      url: this.oauthTokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: formData.toString(),
      timeout: 30000
    }

    if (proxyConfig) {
      const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
      if (proxyAgent) {
        requestOptions.httpAgent = proxyAgent
        requestOptions.httpsAgent = proxyAgent
        logger.info(
          `🌐 使用代理验证 Droid Refresh Token: ${ProxyHelper.getProxyDescription(proxyConfig)}`
        )
      }
    }

    const response = await axios(requestOptions)
    if (!response.data || !response.data.access_token) {
      throw new Error('WorkOS OAuth 返回数据无效')
    }

    const {
      access_token,
      refresh_token,
      user,
      organization_id,
      expires_in,
      token_type,
      authentication_method
    } = response.data

    let expiresAt = response.data.expires_at || ''
    if (!expiresAt) {
      const expiresInSeconds =
        typeof expires_in === 'number' && Number.isFinite(expires_in)
          ? expires_in
          : this.tokenValidHours * 3600
      expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    }

    return {
      accessToken: access_token,
      refreshToken: refresh_token || refreshToken,
      expiresAt,
      expiresIn: typeof expires_in === 'number' && Number.isFinite(expires_in) ? expires_in : null,
      user: user || null,
      organizationId: organization_id || '',
      tokenType: token_type || 'Bearer',
      authenticationMethod: authentication_method || ''
    }
  }

  /**
   * 创建 Droid 账户
   *
   * @param {Object} options - 账户配置选项
   * @returns {Promise<Object>} 创建的账户信息
   */
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Droid Account',
      description = '',
      refreshToken = '', // WorkOS refresh token
      accessToken = '', // WorkOS access token (可选)
      expiresAt = '', // Token 过期时间
      proxy = null, // { type: 'socks5', host: 'localhost', port: 1080, username: '', password: '' }
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      platform = 'droid',
      priority = 50, // 调度优先级 (1-100)
      schedulable = true, // 是否可被调度
      endpointType = 'anthropic', // 默认端点类型: 'anthropic', 'openai', 'common'
      organizationId = '',
      ownerEmail = '',
      ownerName = '',
      userId = '',
      tokenType = 'Bearer',
      authenticationMethod = '',
      expiresIn = null
    } = options

    const accountId = uuidv4()

    let normalizedRefreshToken = refreshToken
    let normalizedAccessToken = accessToken
    let normalizedExpiresAt = expiresAt || ''
    let normalizedExpiresIn = expiresIn
    let normalizedOrganizationId = organizationId || ''
    let normalizedOwnerEmail = ownerEmail || ''
    let normalizedOwnerName = ownerName || ''
    let normalizedOwnerDisplayName = ownerName || ownerEmail || ''
    let normalizedUserId = userId || ''
    let normalizedTokenType = tokenType || 'Bearer'
    let normalizedAuthenticationMethod = authenticationMethod || ''
    let lastRefreshAt = accessToken ? new Date().toISOString() : ''
    let status = accessToken ? 'active' : 'created'

    if (normalizedRefreshToken) {
      try {
        let proxyConfig = null
        if (proxy && typeof proxy === 'object') {
          proxyConfig = proxy
        } else if (typeof proxy === 'string' && proxy.trim()) {
          try {
            proxyConfig = JSON.parse(proxy)
          } catch (error) {
            logger.warn('⚠️ Droid 手动账号代理配置解析失败，已忽略:', error.message)
            proxyConfig = null
          }
        }

        const refreshed = await this._refreshTokensWithWorkOS(normalizedRefreshToken, proxyConfig)

        normalizedAccessToken = refreshed.accessToken
        normalizedRefreshToken = refreshed.refreshToken
        normalizedExpiresAt = refreshed.expiresAt || normalizedExpiresAt
        normalizedTokenType = refreshed.tokenType || normalizedTokenType
        normalizedAuthenticationMethod =
          refreshed.authenticationMethod || normalizedAuthenticationMethod
        if (refreshed.expiresIn !== null) {
          normalizedExpiresIn = refreshed.expiresIn
        }
        if (refreshed.organizationId) {
          normalizedOrganizationId = refreshed.organizationId
        }

        if (refreshed.user) {
          const userInfo = refreshed.user
          if (typeof userInfo.email === 'string' && userInfo.email.trim()) {
            normalizedOwnerEmail = userInfo.email.trim()
          }
          const nameParts = []
          if (typeof userInfo.first_name === 'string' && userInfo.first_name.trim()) {
            nameParts.push(userInfo.first_name.trim())
          }
          if (typeof userInfo.last_name === 'string' && userInfo.last_name.trim()) {
            nameParts.push(userInfo.last_name.trim())
          }
          const derivedName =
            nameParts.join(' ').trim() ||
            (typeof userInfo.name === 'string' ? userInfo.name.trim() : '') ||
            (typeof userInfo.display_name === 'string' ? userInfo.display_name.trim() : '')

          if (derivedName) {
            normalizedOwnerName = derivedName
            normalizedOwnerDisplayName = derivedName
          } else if (normalizedOwnerEmail) {
            normalizedOwnerName = normalizedOwnerName || normalizedOwnerEmail
            normalizedOwnerDisplayName =
              normalizedOwnerDisplayName || normalizedOwnerEmail || normalizedOwnerName
          }

          if (typeof userInfo.id === 'string' && userInfo.id.trim()) {
            normalizedUserId = userInfo.id.trim()
          }
        }

        lastRefreshAt = new Date().toISOString()
        status = 'active'
        logger.success(`✅ 使用 Refresh Token 成功验证并刷新 Droid 账户: ${name} (${accountId})`)
      } catch (error) {
        logger.error('❌ 使用 Refresh Token 验证 Droid 账户失败:', error)
        throw new Error(`Refresh Token 验证失败：${error.message}`)
      }
    }

    const accountData = {
      id: accountId,
      name,
      description,
      refreshToken: this._encryptSensitiveData(normalizedRefreshToken),
      accessToken: this._encryptSensitiveData(normalizedAccessToken),
      expiresAt: normalizedExpiresAt || '',
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      platform,
      priority: priority.toString(),
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      lastRefreshAt,
      status, // created, active, expired, error
      errorMessage: '',
      schedulable: schedulable.toString(),
      endpointType, // anthropic, openai, common
      organizationId: normalizedOrganizationId || '',
      owner: normalizedOwnerName || normalizedOwnerEmail || '',
      ownerEmail: normalizedOwnerEmail || '',
      ownerName: normalizedOwnerName || '',
      ownerDisplayName:
        normalizedOwnerDisplayName || normalizedOwnerName || normalizedOwnerEmail || '',
      userId: normalizedUserId || '',
      tokenType: normalizedTokenType || 'Bearer',
      authenticationMethod: normalizedAuthenticationMethod || '',
      expiresIn:
        normalizedExpiresIn !== null && normalizedExpiresIn !== undefined
          ? String(normalizedExpiresIn)
          : ''
    }

    await redis.setDroidAccount(accountId, accountData)

    logger.success(`🏢 Created Droid account: ${name} (${accountId}) - Endpoint: ${endpointType}`)
    return { id: accountId, ...accountData }
  }

  /**
   * 获取 Droid 账户信息
   */
  async getAccount(accountId) {
    const account = await redis.getDroidAccount(accountId)
    if (!account || Object.keys(account).length === 0) {
      return null
    }

    // 解密敏感数据
    return {
      ...account,
      refreshToken: this._decryptSensitiveData(account.refreshToken),
      accessToken: this._decryptSensitiveData(account.accessToken)
    }
  }

  /**
   * 获取所有 Droid 账户
   */
  async getAllAccounts() {
    const accounts = await redis.getAllDroidAccounts()
    return accounts.map((account) => ({
      ...account,
      // 不解密完整 token，只返回掩码
      refreshToken: account.refreshToken ? '***ENCRYPTED***' : '',
      accessToken: account.accessToken
        ? maskToken(this._decryptSensitiveData(account.accessToken))
        : ''
    }))
  }

  /**
   * 更新 Droid 账户
   */
  async updateAccount(accountId, updates) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error(`Droid account not found: ${accountId}`)
    }

    const sanitizedUpdates = { ...updates }

    if (typeof sanitizedUpdates.accessToken === 'string') {
      sanitizedUpdates.accessToken = sanitizedUpdates.accessToken.trim()
    }
    if (typeof sanitizedUpdates.refreshToken === 'string') {
      sanitizedUpdates.refreshToken = sanitizedUpdates.refreshToken.trim()
    }

    const parseProxyConfig = (value) => {
      if (!value) {
        return null
      }
      if (typeof value === 'object') {
        return value
      }
      if (typeof value === 'string' && value.trim()) {
        try {
          return JSON.parse(value)
        } catch (error) {
          logger.warn('⚠️ Failed to parse stored Droid proxy config:', error.message)
        }
      }
      return null
    }

    let proxyConfig = null
    if (updates.proxy !== undefined) {
      if (updates.proxy && typeof updates.proxy === 'object') {
        proxyConfig = updates.proxy
        sanitizedUpdates.proxy = JSON.stringify(updates.proxy)
      } else if (typeof updates.proxy === 'string' && updates.proxy.trim()) {
        proxyConfig = parseProxyConfig(updates.proxy)
        sanitizedUpdates.proxy = updates.proxy
      } else {
        sanitizedUpdates.proxy = ''
      }
    } else if (account.proxy) {
      proxyConfig = parseProxyConfig(account.proxy)
    }

    const hasNewRefreshToken =
      typeof sanitizedUpdates.refreshToken === 'string' && sanitizedUpdates.refreshToken

    if (hasNewRefreshToken) {
      try {
        const refreshed = await this._refreshTokensWithWorkOS(
          sanitizedUpdates.refreshToken,
          proxyConfig
        )

        sanitizedUpdates.accessToken = refreshed.accessToken
        sanitizedUpdates.refreshToken = refreshed.refreshToken || sanitizedUpdates.refreshToken
        sanitizedUpdates.expiresAt =
          refreshed.expiresAt || sanitizedUpdates.expiresAt || account.expiresAt || ''

        if (refreshed.expiresIn !== null && refreshed.expiresIn !== undefined) {
          sanitizedUpdates.expiresIn = String(refreshed.expiresIn)
        }

        sanitizedUpdates.tokenType = refreshed.tokenType || account.tokenType || 'Bearer'
        sanitizedUpdates.authenticationMethod =
          refreshed.authenticationMethod || account.authenticationMethod || ''
        sanitizedUpdates.organizationId =
          sanitizedUpdates.organizationId ||
          refreshed.organizationId ||
          account.organizationId ||
          ''
        sanitizedUpdates.lastRefreshAt = new Date().toISOString()
        sanitizedUpdates.status = 'active'
        sanitizedUpdates.errorMessage = ''

        if (refreshed.user) {
          const userInfo = refreshed.user
          const email = typeof userInfo.email === 'string' ? userInfo.email.trim() : ''
          if (email) {
            sanitizedUpdates.ownerEmail = email
          }

          const nameParts = []
          if (typeof userInfo.first_name === 'string' && userInfo.first_name.trim()) {
            nameParts.push(userInfo.first_name.trim())
          }
          if (typeof userInfo.last_name === 'string' && userInfo.last_name.trim()) {
            nameParts.push(userInfo.last_name.trim())
          }

          const derivedName =
            nameParts.join(' ').trim() ||
            (typeof userInfo.name === 'string' ? userInfo.name.trim() : '') ||
            (typeof userInfo.display_name === 'string' ? userInfo.display_name.trim() : '')

          if (derivedName) {
            sanitizedUpdates.ownerName = derivedName
            sanitizedUpdates.ownerDisplayName = derivedName
            sanitizedUpdates.owner = derivedName
          } else if (sanitizedUpdates.ownerEmail) {
            sanitizedUpdates.ownerName = sanitizedUpdates.ownerName || sanitizedUpdates.ownerEmail
            sanitizedUpdates.ownerDisplayName =
              sanitizedUpdates.ownerDisplayName || sanitizedUpdates.ownerEmail
            sanitizedUpdates.owner = sanitizedUpdates.owner || sanitizedUpdates.ownerEmail
          }

          if (typeof userInfo.id === 'string' && userInfo.id.trim()) {
            sanitizedUpdates.userId = userInfo.id.trim()
          }
        }
      } catch (error) {
        logger.error('❌ 使用新的 Refresh Token 更新 Droid 账户失败:', error)
        throw new Error(`Refresh Token 验证失败：${error.message || '未知错误'}`)
      }
    }

    if (sanitizedUpdates.proxy === undefined) {
      sanitizedUpdates.proxy = account.proxy || ''
    }

    const encryptedUpdates = { ...sanitizedUpdates }

    if (sanitizedUpdates.refreshToken !== undefined) {
      encryptedUpdates.refreshToken = this._encryptSensitiveData(sanitizedUpdates.refreshToken)
    }
    if (sanitizedUpdates.accessToken !== undefined) {
      encryptedUpdates.accessToken = this._encryptSensitiveData(sanitizedUpdates.accessToken)
    }

    const updatedData = {
      ...account,
      ...encryptedUpdates,
      refreshToken:
        encryptedUpdates.refreshToken || this._encryptSensitiveData(account.refreshToken),
      accessToken: encryptedUpdates.accessToken || this._encryptSensitiveData(account.accessToken),
      proxy: encryptedUpdates.proxy
    }

    await redis.setDroidAccount(accountId, updatedData)
    logger.info(`✅ Updated Droid account: ${accountId}`)

    return this.getAccount(accountId)
  }

  /**
   * 删除 Droid 账户
   */
  async deleteAccount(accountId) {
    await redis.deleteDroidAccount(accountId)
    logger.success(`🗑️  Deleted Droid account: ${accountId}`)
  }

  /**
   * 刷新 Droid 账户的 access token
   *
   * 使用 WorkOS OAuth refresh token 刷新 access token
   */
  async refreshAccessToken(accountId, proxyConfig = null) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error(`Droid account not found: ${accountId}`)
    }

    if (!account.refreshToken) {
      throw new Error(`Droid account ${accountId} has no refresh token`)
    }

    logger.info(`🔄 Refreshing Droid account token: ${account.name} (${accountId})`)

    try {
      const proxy = proxyConfig || (account.proxy ? JSON.parse(account.proxy) : null)
      const refreshed = await this._refreshTokensWithWorkOS(account.refreshToken, proxy)

      // 更新账户信息
      await this.updateAccount(accountId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || account.refreshToken,
        expiresAt: refreshed.expiresAt,
        expiresIn:
          refreshed.expiresIn !== null && refreshed.expiresIn !== undefined
            ? String(refreshed.expiresIn)
            : account.expiresIn,
        tokenType: refreshed.tokenType || account.tokenType || 'Bearer',
        authenticationMethod: refreshed.authenticationMethod || account.authenticationMethod || '',
        organizationId: refreshed.organizationId || account.organizationId,
        lastRefreshAt: new Date().toISOString(),
        status: 'active',
        errorMessage: ''
      })

      // 记录用户信息
      if (refreshed.user) {
        const { user } = refreshed
        const updates = {}
        logger.info(
          `✅ Droid token refreshed for: ${user.email} (${user.first_name} ${user.last_name})`
        )
        logger.info(`   Organization ID: ${refreshed.organizationId || 'N/A'}`)

        if (typeof user.email === 'string' && user.email.trim()) {
          updates.ownerEmail = user.email.trim()
        }
        const nameParts = []
        if (typeof user.first_name === 'string' && user.first_name.trim()) {
          nameParts.push(user.first_name.trim())
        }
        if (typeof user.last_name === 'string' && user.last_name.trim()) {
          nameParts.push(user.last_name.trim())
        }
        const derivedName =
          nameParts.join(' ').trim() ||
          (typeof user.name === 'string' ? user.name.trim() : '') ||
          (typeof user.display_name === 'string' ? user.display_name.trim() : '')

        if (derivedName) {
          updates.ownerName = derivedName
          updates.ownerDisplayName = derivedName
          updates.owner = derivedName
        } else if (updates.ownerEmail) {
          updates.owner = updates.ownerEmail
          updates.ownerName = updates.ownerEmail
          updates.ownerDisplayName = updates.ownerEmail
        }

        if (typeof user.id === 'string' && user.id.trim()) {
          updates.userId = user.id.trim()
        }

        if (Object.keys(updates).length > 0) {
          await this.updateAccount(accountId, updates)
        }
      }

      logger.success(`✅ Droid account token refreshed successfully: ${accountId}`)

      return {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || account.refreshToken,
        expiresAt: refreshed.expiresAt
      }
    } catch (error) {
      logger.error(`❌ Failed to refresh Droid account token: ${accountId}`, error)

      // 更新账户状态为错误
      await this.updateAccount(accountId, {
        status: 'error',
        errorMessage: error.message || 'Token refresh failed'
      })

      throw error
    }
  }

  /**
   * 检查 token 是否需要刷新
   */
  shouldRefreshToken(account) {
    if (!account.lastRefreshAt) {
      return true // 从未刷新过
    }

    const lastRefreshTime = new Date(account.lastRefreshAt).getTime()
    const hoursSinceRefresh = (Date.now() - lastRefreshTime) / (1000 * 60 * 60)

    return hoursSinceRefresh >= this.refreshIntervalHours
  }

  /**
   * 获取有效的 access token（自动刷新）
   */
  async getValidAccessToken(accountId) {
    let account = await this.getAccount(accountId)
    if (!account) {
      throw new Error(`Droid account not found: ${accountId}`)
    }

    // 检查是否需要刷新
    if (this.shouldRefreshToken(account)) {
      logger.info(`🔄 Droid account token needs refresh: ${accountId}`)
      const proxyConfig = account.proxy ? JSON.parse(account.proxy) : null
      await this.refreshAccessToken(accountId, proxyConfig)
      account = await this.getAccount(accountId)
    }

    if (!account.accessToken) {
      throw new Error(`Droid account ${accountId} has no valid access token`)
    }

    return account.accessToken
  }

  /**
   * 获取可调度的 Droid 账户列表
   */
  async getSchedulableAccounts(endpointType = null) {
    const allAccounts = await redis.getAllDroidAccounts()

    return allAccounts
      .filter((account) => {
        // 基本过滤条件
        const isSchedulable =
          account.isActive === 'true' &&
          account.schedulable === 'true' &&
          account.status === 'active'

        // 如果指定了端点类型，进一步过滤
        if (endpointType) {
          return isSchedulable && account.endpointType === endpointType
        }

        return isSchedulable
      })
      .map((account) => ({
        ...account,
        priority: parseInt(account.priority, 10) || 50,
        // 解密 accessToken 用于使用
        accessToken: this._decryptSensitiveData(account.accessToken)
      }))
      .sort((a, b) => a.priority - b.priority) // 按优先级排序
  }

  /**
   * 选择一个可用的 Droid 账户（简单轮询）
   */
  async selectAccount(endpointType = null) {
    let accounts = await this.getSchedulableAccounts(endpointType)

    if (accounts.length === 0 && endpointType) {
      logger.warn(
        `No Droid accounts found for endpoint ${endpointType}, falling back to any available account`
      )
      accounts = await this.getSchedulableAccounts(null)
    }

    if (accounts.length === 0) {
      throw new Error(
        `No schedulable Droid accounts available${endpointType ? ` for endpoint type: ${endpointType}` : ''}`
      )
    }

    // 简单轮询：选择最高优先级且最久未使用的账户
    let selectedAccount = accounts[0]
    for (const account of accounts) {
      if (account.priority < selectedAccount.priority) {
        selectedAccount = account
      } else if (account.priority === selectedAccount.priority) {
        // 相同优先级，选择最久未使用的
        const selectedLastUsed = new Date(selectedAccount.lastUsedAt || 0).getTime()
        const accountLastUsed = new Date(account.lastUsedAt || 0).getTime()
        if (accountLastUsed < selectedLastUsed) {
          selectedAccount = account
        }
      }
    }

    // 更新最后使用时间
    await this.updateAccount(selectedAccount.id, {
      lastUsedAt: new Date().toISOString()
    })

    logger.info(
      `✅ Selected Droid account: ${selectedAccount.name} (${selectedAccount.id}) - Endpoint: ${selectedAccount.endpointType}`
    )

    return selectedAccount
  }

  /**
   * 获取 Factory.ai API 的完整 URL
   */
  getFactoryApiUrl(endpointType, endpoint) {
    const baseUrls = {
      anthropic: `${this.factoryApiBaseUrl}/a${endpoint}`,
      openai: `${this.factoryApiBaseUrl}/o${endpoint}`,
      common: `${this.factoryApiBaseUrl}/o${endpoint}`
    }

    return baseUrls[endpointType] || baseUrls.common
  }
}

// 导出单例
module.exports = new DroidAccountService()
