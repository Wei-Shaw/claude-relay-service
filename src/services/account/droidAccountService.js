const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const axios = require('axios')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { maskToken } = require('../../utils/tokenMask')
const ProxyHelper = require('../../utils/proxyHelper')
const { createEncryptor, isTruthy } = require('../../utils/commonHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const { RedisKeys } = require('../../constants/redisKeys')

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
    this.factoryApiBaseUrl = 'https://api.factory.ai/api/llm'

    this.workosClientId = 'client_01HNM792M5G5G1A2THWPXKFMXB'

    // Token 刷新策略
    this.refreshIntervalHours = 6 // 每6小时刷新一次
    this.tokenValidHours = 8 // Token 有效期8小时

    // 使用 commonHelper 的加密器
    this._encryptor = createEncryptor('droid-account-salt')

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._encryptor.clearCache()
        logger.info('🧹 Droid decrypt cache cleanup completed', this._encryptor.getStats())
      },
      10 * 60 * 1000
    )

    this.supportedEndpointTypes = new Set(['anthropic', 'openai', 'comm'])
  }

  _sanitizeEndpointType(endpointType) {
    if (!endpointType) {
      return 'anthropic'
    }

    const normalized = String(endpointType).toLowerCase()
    if (normalized === 'openai') {
      return 'openai'
    }

    if (normalized === 'comm') {
      return 'comm'
    }

    if (this.supportedEndpointTypes.has(normalized)) {
      return normalized
    }

    return 'anthropic'
  }

  // 使用 commonHelper 的 isTruthy
  _isTruthy(value) {
    return isTruthy(value)
  }

  // 加密敏感数据
  _encryptSensitiveData(text) {
    return this._encryptor.encrypt(text)
  }

  // 解密敏感数据（带缓存）
  _decryptSensitiveData(encryptedText) {
    return this._encryptor.decrypt(encryptedText)
  }

  _parseApiKeyEntries(rawEntries) {
    if (!rawEntries) {
      return []
    }

    if (Array.isArray(rawEntries)) {
      return rawEntries
    }

    if (typeof rawEntries === 'string') {
      try {
        const parsed = JSON.parse(rawEntries)
        return Array.isArray(parsed) ? parsed : []
      } catch (error) {
        logger.warn('⚠️ Failed to parse Droid API Key entries:', error.message)
        return []
      }
    }

    return []
  }

  _buildApiKeyEntries(apiKeys, existingEntries = [], clearExisting = false) {
    const now = new Date().toISOString()
    const normalizedExisting = Array.isArray(existingEntries) ? existingEntries : []

    const entries = clearExisting
      ? []
      : normalizedExisting
          .filter((entry) => entry && entry.id && entry.encryptedKey)
          .map((entry) => ({
            ...entry,
            status: entry.status || 'active' // 确保有默认状态
          }))

    const hashSet = new Set(entries.map((entry) => entry.hash).filter(Boolean))

    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
      return entries
    }

    for (const rawKey of apiKeys) {
      if (typeof rawKey !== 'string') {
        continue
      }

      const trimmed = rawKey.trim()
      if (!trimmed) {
        continue
      }

      const hash = crypto.createHash('sha256').update(trimmed).digest('hex')
      if (hashSet.has(hash)) {
        continue
      }

      hashSet.add(hash)

      entries.push({
        id: uuidv4(),
        hash,
        encryptedKey: this._encryptSensitiveData(trimmed),
        createdAt: now,
        lastUsedAt: '',
        usageCount: '0',
        status: 'active', // 新增状态字段
        errorMessage: '' // 新增错误信息字段
      })
    }

    return entries
  }

  _maskApiKeyEntries(entries) {
    if (!Array.isArray(entries)) {
      return []
    }

    return entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt || '',
      lastUsedAt: entry.lastUsedAt || '',
      usageCount: entry.usageCount || '0',
      status: entry.status || 'active', // 新增状态字段
      errorMessage: entry.errorMessage || '' // 新增错误信息字段
    }))
  }

  _decryptApiKeyEntry(entry) {
    if (!entry || !entry.encryptedKey) {
      return null
    }

    const apiKey = this._decryptSensitiveData(entry.encryptedKey)
    if (!apiKey) {
      return null
    }

    const usageCountNumber = Number(entry.usageCount)

    return {
      id: entry.id,
      key: apiKey,
      hash: entry.hash || '',
      createdAt: entry.createdAt || '',
      lastUsedAt: entry.lastUsedAt || '',
      usageCount: Number.isFinite(usageCountNumber) && usageCountNumber >= 0 ? usageCountNumber : 0,
      status: entry.status || 'active', // 新增状态字段
      errorMessage: entry.errorMessage || '' // 新增错误信息字段
    }
  }

  async getDecryptedApiKeyEntries(accountId) {
    if (!accountId) {
      return []
    }

    const accountData = await redis.getDroidAccount(accountId)
    if (!accountData) {
      return []
    }

    const entries = this._parseApiKeyEntries(accountData.apiKeys)
    return entries
      .map((entry) => this._decryptApiKeyEntry(entry))
      .filter((entry) => entry && entry.key)
  }

  async touchApiKeyUsage(accountId, keyId) {
    if (!accountId || !keyId) {
      return
    }

    try {
      const accountData = await redis.getDroidAccount(accountId)
      if (!accountData) {
        return
      }

      const entries = this._parseApiKeyEntries(accountData.apiKeys)
      const index = entries.findIndex((entry) => entry.id === keyId)

      if (index === -1) {
        return
      }

      const updatedEntry = { ...entries[index] }
      updatedEntry.lastUsedAt = new Date().toISOString()
      const usageCount = Number(updatedEntry.usageCount)
      updatedEntry.usageCount = String(
        Number.isFinite(usageCount) && usageCount >= 0 ? usageCount + 1 : 1
      )

      entries[index] = updatedEntry

      accountData.apiKeys = JSON.stringify(entries)
      accountData.apiKeyCount = String(entries.length)

      await redis.setDroidAccount(accountId, accountData)
    } catch (error) {
      logger.warn(`⚠️ Failed to update API key usage for Droid account ${accountId}:`, error)
    }
  }

  /**
   * 删除指定的 Droid API Key 条目
   */
  async removeApiKeyEntry(accountId, keyId) {
    if (!accountId || !keyId) {
      return { removed: false, remainingCount: 0 }
    }

    try {
      const accountData = await redis.getDroidAccount(accountId)
      if (!accountData) {
        return { removed: false, remainingCount: 0 }
      }

      const entries = this._parseApiKeyEntries(accountData.apiKeys)
      if (!entries || entries.length === 0) {
        return { removed: false, remainingCount: 0 }
      }

      const filtered = entries.filter((entry) => entry && entry.id !== keyId)
      if (filtered.length === entries.length) {
        return { removed: false, remainingCount: entries.length }
      }

      accountData.apiKeys = filtered.length ? JSON.stringify(filtered) : ''
      accountData.apiKeyCount = String(filtered.length)

      await redis.setDroidAccount(accountId, accountData)

      logger.warn(
        `🚫 已删除 Droid API Key ${keyId}（Account: ${accountId}），剩余 ${filtered.length}`
      )

      return { removed: true, remainingCount: filtered.length }
    } catch (error) {
      logger.error(`❌ 删除 Droid API Key 失败：${keyId}（Account: ${accountId}）`, error)
      return { removed: false, remainingCount: 0, error }
    }
  }

  /**
   * 标记指定的 Droid API Key 条目为异常状态
   */
  async markApiKeyAsError(accountId, keyId, errorMessage = '') {
    if (!accountId || !keyId) {
      return { marked: false, error: '参数无效' }
    }

    try {
      const accountData = await redis.getDroidAccount(accountId)
      if (!accountData) {
        return { marked: false, error: '账户不存在' }
      }

      // disableAutoProtection：关闭自动防护时不把 API Key 标记为异常（保持可用、透传上游错误）
      if (
        accountData.disableAutoProtection === true ||
        accountData.disableAutoProtection === 'true'
      ) {
        logger.info(`🛡️ Droid 账号 ${accountId} 已关闭自动防护，跳过将 API Key ${keyId} 标记为异常`)
        return { marked: false, skipped: true }
      }

      const entries = this._parseApiKeyEntries(accountData.apiKeys)
      if (!entries || entries.length === 0) {
        return { marked: false, error: '无API Key条目' }
      }

      let marked = false
      const updatedEntries = entries.map((entry) => {
        if (entry && entry.id === keyId) {
          marked = true
          return {
            ...entry,
            status: 'error',
            errorMessage: errorMessage || 'API Key异常'
          }
        }
        return entry
      })

      if (!marked) {
        return { marked: false, error: '未找到指定的API Key' }
      }

      accountData.apiKeys = JSON.stringify(updatedEntries)
      await redis.setDroidAccount(accountId, accountData)

      logger.warn(
        `⚠️ 已标记 Droid API Key ${keyId} 为异常状态（Account: ${accountId}）：${errorMessage}`
      )

      return { marked: true }
    } catch (error) {
      logger.error(`❌ 标记 Droid API Key 异常状态失败：${keyId}（Account: ${accountId}）`, error)
      return { marked: false, error: error.message }
    }
  }

  /**
   * 使用 WorkOS Refresh Token 刷新并验证凭证
   */
  async _refreshTokensWithWorkOS(refreshToken, proxyConfig = null, organizationId = null) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error('Refresh Token 无效')
    }

    const formData = new URLSearchParams()
    formData.append('grant_type', 'refresh_token')
    formData.append('refresh_token', refreshToken)
    formData.append('client_id', this.workosClientId)
    if (organizationId) {
      formData.append('organization_id', organizationId)
    }

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
        requestOptions.proxy = false
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
   * 使用 Factory CLI 接口获取组织 ID 列表
   */
  async _fetchFactoryOrgIds(accessToken, proxyConfig = null) {
    if (!accessToken) {
      return []
    }

    const requestOptions = {
      method: 'GET',
      url: 'https://app.factory.ai/api/cli/org',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-factory-client': 'cli',
        'User-Agent': this.userAgent
      },
      timeout: 15000
    }

    if (proxyConfig) {
      const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
      if (proxyAgent) {
        requestOptions.httpAgent = proxyAgent
        requestOptions.httpsAgent = proxyAgent
        requestOptions.proxy = false
      }
    }

    try {
      const response = await axios(requestOptions)
      const data = response.data || {}
      if (Array.isArray(data.workosOrgIds) && data.workosOrgIds.length > 0) {
        return data.workosOrgIds
      }
      logger.warn('⚠️ 未从 Factory CLI 接口获取到 workosOrgIds')
      return []
    } catch (error) {
      logger.warn('⚠️ 获取 Factory 组织信息失败:', error.message)
      return []
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
      endpointType = 'anthropic', // 默认端点类型: 'anthropic', 'openai' 或 'comm'
      organizationId = '',
      ownerEmail = '',
      ownerName = '',
      userId = '',
      tokenType = 'Bearer',
      authenticationMethod = '',
      expiresIn = null,
      apiKeys = [],
      userAgent = '', // 自定义 User-Agent
      disableAutoProtection = false // 是否关闭自动防护（429/401/400/529 不自动禁用）
    } = options

    const accountId = uuidv4()

    const normalizedEndpointType = this._sanitizeEndpointType(endpointType)

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

    const apiKeyEntries = this._buildApiKeyEntries(apiKeys)
    const hasApiKeys = apiKeyEntries.length > 0

    if (hasApiKeys) {
      normalizedAuthenticationMethod = 'api_key'
      normalizedAccessToken = ''
      normalizedRefreshToken = ''
      normalizedExpiresAt = ''
      normalizedExpiresIn = null
      lastRefreshAt = ''
      status = 'active'
    }

    const normalizedAuthMethod =
      typeof normalizedAuthenticationMethod === 'string'
        ? normalizedAuthenticationMethod.toLowerCase().trim()
        : ''

    const isApiKeyProvision = normalizedAuthMethod === 'api_key'
    const isManualProvision = normalizedAuthMethod === 'manual'

    const provisioningMode = isApiKeyProvision ? 'api_key' : isManualProvision ? 'manual' : 'oauth'

    if (isApiKeyProvision) {
      logger.info(
        `🔍 [Droid api_key] 初始密钥 - AccountName: ${name}, KeyCount: ${apiKeyEntries.length}`
      )
    } else {
      logger.info(
        `🔍 [Droid ${provisioningMode}] 初始令牌 - AccountName: ${name}, AccessToken: ${
          normalizedAccessToken || '[empty]'
        }, RefreshToken: ${normalizedRefreshToken || '[empty]'}`
      )
    }

    let proxyConfig = null
    if (proxy && typeof proxy === 'object') {
      proxyConfig = proxy
    } else if (typeof proxy === 'string' && proxy.trim()) {
      try {
        proxyConfig = JSON.parse(proxy)
      } catch (error) {
        logger.warn('⚠️ Droid 代理配置解析失败，已忽略:', error.message)
        proxyConfig = null
      }
    }

    if (!isApiKeyProvision && normalizedRefreshToken && isManualProvision) {
      try {
        const refreshed = await this._refreshTokensWithWorkOS(normalizedRefreshToken, proxyConfig)

        logger.info(
          `🔍 [Droid manual] 刷新后令牌 - AccountName: ${name}, AccessToken: ${refreshed.accessToken || '[empty]'}, RefreshToken: ${refreshed.refreshToken || '[empty]'}, ExpiresAt: ${refreshed.expiresAt || '[empty]'}, ExpiresIn: ${
            refreshed.expiresIn !== null && refreshed.expiresIn !== undefined
              ? refreshed.expiresIn
              : '[empty]'
          }`
        )

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
        logger.success(`使用 Refresh Token 成功验证并刷新 Droid 账户: ${name} (${accountId})`)
      } catch (error) {
        logger.error('❌ 使用 Refresh Token 验证 Droid 账户失败:', error)
        throw new Error(`Refresh Token 验证失败：${error.message}`)
      }
    } else if (!isApiKeyProvision && normalizedRefreshToken && !isManualProvision) {
      try {
        const orgIds = await this._fetchFactoryOrgIds(normalizedAccessToken, proxyConfig)
        const selectedOrgId =
          normalizedOrganizationId ||
          (Array.isArray(orgIds)
            ? orgIds.find((id) => typeof id === 'string' && id.trim())
            : null) ||
          ''

        if (!selectedOrgId) {
          logger.warn(`⚠️ [Droid oauth] 未获取到组织ID，跳过 WorkOS 刷新: ${name} (${accountId})`)
        } else {
          const refreshed = await this._refreshTokensWithWorkOS(
            normalizedRefreshToken,
            proxyConfig,
            selectedOrgId
          )

          logger.info(
            `🔍 [Droid oauth] 组织刷新后令牌 - AccountName: ${name}, AccessToken: ${refreshed.accessToken || '[empty]'}, RefreshToken: ${refreshed.refreshToken || '[empty]'}, OrganizationId: ${
              refreshed.organizationId || selectedOrgId
            }, ExpiresAt: ${refreshed.expiresAt || '[empty]'}`
          )

          normalizedAccessToken = refreshed.accessToken
          normalizedRefreshToken = refreshed.refreshToken
          normalizedExpiresAt = refreshed.expiresAt || normalizedExpiresAt
          normalizedTokenType = refreshed.tokenType || normalizedTokenType
          normalizedAuthenticationMethod =
            refreshed.authenticationMethod || normalizedAuthenticationMethod
          if (refreshed.expiresIn !== null && refreshed.expiresIn !== undefined) {
            normalizedExpiresIn = refreshed.expiresIn
          }
          if (refreshed.organizationId) {
            normalizedOrganizationId = refreshed.organizationId
          } else {
            normalizedOrganizationId = selectedOrgId
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
        }
      } catch (error) {
        logger.warn(`⚠️ [Droid oauth] 初始化刷新失败: ${name} (${accountId}) - ${error.message}`)
      }
    }

    if (!isApiKeyProvision && !normalizedExpiresAt) {
      let expiresInSeconds = null
      if (typeof normalizedExpiresIn === 'number' && Number.isFinite(normalizedExpiresIn)) {
        expiresInSeconds = normalizedExpiresIn
      } else if (
        typeof normalizedExpiresIn === 'string' &&
        normalizedExpiresIn.trim() &&
        !Number.isNaN(Number(normalizedExpiresIn))
      ) {
        expiresInSeconds = Number(normalizedExpiresIn)
      }

      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        expiresInSeconds = this.tokenValidHours * 3600
      }

      normalizedExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      normalizedExpiresIn = expiresInSeconds
    }

    logger.info(
      `🔍 [Droid ${provisioningMode}] 写入前令牌快照 - AccountName: ${name}, AccessToken: ${normalizedAccessToken || '[empty]'}, RefreshToken: ${normalizedRefreshToken || '[empty]'}, ExpiresAt: ${normalizedExpiresAt || '[empty]'}, ExpiresIn: ${
        normalizedExpiresIn !== null && normalizedExpiresIn !== undefined
          ? normalizedExpiresIn
          : '[empty]'
      }`
    )

    const accountData = {
      id: accountId,
      name,
      description,
      refreshToken: this._encryptSensitiveData(normalizedRefreshToken),
      accessToken: this._encryptSensitiveData(normalizedAccessToken),
      expiresAt: normalizedExpiresAt || '', // OAuth Token 过期时间（技术字段，自动刷新）

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,

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
      endpointType: normalizedEndpointType, // anthropic, openai 或 comm
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
          : '',
      apiKeys: hasApiKeys ? JSON.stringify(apiKeyEntries) : '',
      apiKeyCount: hasApiKeys ? String(apiKeyEntries.length) : '0',
      apiKeyStrategy: hasApiKeys ? 'random_sticky' : '',
      userAgent: userAgent || '', // 自定义 User-Agent
      disableAutoProtection: disableAutoProtection.toString() // 关闭自动防护
    }

    await redis.setDroidAccount(accountId, accountData)

    logger.success(
      `🏢 Created Droid account: ${name} (${accountId}) - Endpoint: ${normalizedEndpointType}`
    )

    try {
      const verifyAccount = await this.getAccount(accountId)
      logger.info(
        `🔍 [Droid ${provisioningMode}] Redis 写入后验证 - AccountName: ${name}, AccessToken: ${verifyAccount?.accessToken || '[empty]'}, RefreshToken: ${verifyAccount?.refreshToken || '[empty]'}, ExpiresAt: ${verifyAccount?.expiresAt || '[empty]'}`
      )
    } catch (verifyError) {
      logger.warn(
        `⚠️ [Droid ${provisioningMode}] 写入后验证失败: ${name} (${accountId}) - ${verifyError.message}`
      )
    }
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
    const apiKeyEntries = this._parseApiKeyEntries(account.apiKeys)

    return {
      ...account,
      id: accountId,
      endpointType: this._sanitizeEndpointType(account.endpointType),
      refreshToken: this._decryptSensitiveData(account.refreshToken),
      accessToken: this._decryptSensitiveData(account.accessToken),
      apiKeys: this._maskApiKeyEntries(apiKeyEntries),
      apiKeyCount: apiKeyEntries.length
    }
  }

  /**
   * 获取所有 Droid 账户
   */
  async getAllAccounts() {
    const accounts = await redis.getAllDroidAccounts()
    return accounts.map((account) => ({
      ...account,
      endpointType: this._sanitizeEndpointType(account.endpointType),
      // 不解密完整 token，只返回掩码
      refreshToken: account.refreshToken ? '***ENCRYPTED***' : '',
      accessToken: account.accessToken
        ? maskToken(this._decryptSensitiveData(account.accessToken))
        : '',

      // ✅ 前端显示订阅过期时间（业务字段）
      expiresAt: account.subscriptionExpiresAt || null,
      platform: account.platform || 'droid',

      apiKeyCount: (() => {
        const parsedCount = this._parseApiKeyEntries(account.apiKeys).length
        if (account.apiKeyCount === undefined || account.apiKeyCount === null) {
          return parsedCount
        }
        const numeric = Number(account.apiKeyCount)
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : parsedCount
      })()
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

    const storedAccount = await redis.getDroidAccount(accountId)
    const hasStoredAccount =
      storedAccount && typeof storedAccount === 'object' && Object.keys(storedAccount).length > 0
    const sanitizedUpdates = { ...updates }

    if (typeof sanitizedUpdates.accessToken === 'string') {
      sanitizedUpdates.accessToken = sanitizedUpdates.accessToken.trim()
    }
    if (typeof sanitizedUpdates.refreshToken === 'string') {
      sanitizedUpdates.refreshToken = sanitizedUpdates.refreshToken.trim()
    }

    if (sanitizedUpdates.endpointType) {
      sanitizedUpdates.endpointType = this._sanitizeEndpointType(sanitizedUpdates.endpointType)
    }

    // 处理 userAgent 字段
    if (typeof sanitizedUpdates.userAgent === 'string') {
      sanitizedUpdates.userAgent = sanitizedUpdates.userAgent.trim()
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

    // ✅ 如果通过路由映射更新了 subscriptionExpiresAt，直接保存
    // subscriptionExpiresAt 是业务字段，与 token 刷新独立
    if (sanitizedUpdates.subscriptionExpiresAt !== undefined) {
      // 直接保存，不做任何调整
    }

    if (sanitizedUpdates.proxy === undefined) {
      sanitizedUpdates.proxy = account.proxy || ''
    }

    // 使用 Redis 中的原始数据获取加密的 API Key 条目
    const existingApiKeyEntries = this._parseApiKeyEntries(
      hasStoredAccount && Object.prototype.hasOwnProperty.call(storedAccount, 'apiKeys')
        ? storedAccount.apiKeys
        : ''
    )
    const newApiKeysInput = Array.isArray(updates.apiKeys) ? updates.apiKeys : []
    const removeApiKeysInput = Array.isArray(updates.removeApiKeys) ? updates.removeApiKeys : []
    const wantsClearApiKeys = Boolean(updates.clearApiKeys)
    const rawApiKeyMode =
      typeof updates.apiKeyUpdateMode === 'string'
        ? updates.apiKeyUpdateMode.trim().toLowerCase()
        : ''

    let apiKeyUpdateMode = ['append', 'replace', 'delete', 'update'].includes(rawApiKeyMode)
      ? rawApiKeyMode
      : ''

    if (!apiKeyUpdateMode) {
      if (wantsClearApiKeys) {
        apiKeyUpdateMode = 'replace'
      } else if (removeApiKeysInput.length > 0) {
        apiKeyUpdateMode = 'delete'
      } else {
        apiKeyUpdateMode = 'append'
      }
    }

    if (sanitizedUpdates.apiKeys !== undefined) {
      delete sanitizedUpdates.apiKeys
    }
    if (sanitizedUpdates.clearApiKeys !== undefined) {
      delete sanitizedUpdates.clearApiKeys
    }
    if (sanitizedUpdates.apiKeyUpdateMode !== undefined) {
      delete sanitizedUpdates.apiKeyUpdateMode
    }
    if (sanitizedUpdates.removeApiKeys !== undefined) {
      delete sanitizedUpdates.removeApiKeys
    }

    let mergedApiKeys = existingApiKeyEntries
    let apiKeysUpdated = false
    let addedCount = 0
    let removedCount = 0

    if (apiKeyUpdateMode === 'delete') {
      const removalHashes = new Set()

      for (const candidate of removeApiKeysInput) {
        if (typeof candidate !== 'string') {
          continue
        }
        const trimmed = candidate.trim()
        if (!trimmed) {
          continue
        }
        const hash = crypto.createHash('sha256').update(trimmed).digest('hex')
        removalHashes.add(hash)
      }

      if (removalHashes.size > 0) {
        mergedApiKeys = existingApiKeyEntries.filter(
          (entry) => entry && entry.hash && !removalHashes.has(entry.hash)
        )
        removedCount = existingApiKeyEntries.length - mergedApiKeys.length
        apiKeysUpdated = removedCount > 0

        if (!apiKeysUpdated) {
          logger.warn(
            `⚠️ 删除模式未匹配任何 Droid API Key: ${accountId} (提供 ${removalHashes.size} 条)`
          )
        }
      } else if (removeApiKeysInput.length > 0) {
        logger.warn(`⚠️ 删除模式未收到有效的 Droid API Key: ${accountId}`)
      }
    } else if (apiKeyUpdateMode === 'update') {
      // 更新模式：根据提供的 key 匹配现有条目并更新状态
      mergedApiKeys = [...existingApiKeyEntries]
      const updatedHashes = new Set()

      for (const updateItem of newApiKeysInput) {
        if (!updateItem || typeof updateItem !== 'object') {
          continue
        }

        const key = updateItem.key || updateItem.apiKey || ''
        if (!key || typeof key !== 'string') {
          continue
        }

        const trimmed = key.trim()
        if (!trimmed) {
          continue
        }

        const hash = crypto.createHash('sha256').update(trimmed).digest('hex')
        updatedHashes.add(hash)

        // 查找现有条目
        const existingIndex = mergedApiKeys.findIndex((entry) => entry && entry.hash === hash)

        if (existingIndex !== -1) {
          // 更新现有条目的状态信息
          const existingEntry = mergedApiKeys[existingIndex]
          mergedApiKeys[existingIndex] = {
            ...existingEntry,
            // [人工决策-2026-06-02 23:30:05] review#4 代码级保证：key 级 status/errorMessage 只由自动流程(markApiKeyAsError)写入，
            //   更新模式一律忽略外部传入的 status/errorMessage（防伪造 key 级 error），仅接受 lastUsedAt/usageCount
            status: existingEntry.status || 'active',
            errorMessage: existingEntry.errorMessage || '',
            lastUsedAt:
              updateItem.lastUsedAt !== undefined
                ? updateItem.lastUsedAt
                : existingEntry.lastUsedAt || '',
            usageCount:
              updateItem.usageCount !== undefined
                ? String(updateItem.usageCount)
                : existingEntry.usageCount || '0'
          }
          apiKeysUpdated = true
        }
      }

      if (!apiKeysUpdated) {
        logger.warn(
          `⚠️ 更新模式未匹配任何 Droid API Key: ${accountId} (提供 ${updatedHashes.size} 个哈希)`
        )
      }
    } else {
      const clearExisting = apiKeyUpdateMode === 'replace' || wantsClearApiKeys
      const baselineCount = clearExisting ? 0 : existingApiKeyEntries.length

      mergedApiKeys = this._buildApiKeyEntries(
        newApiKeysInput,
        existingApiKeyEntries,
        clearExisting
      )

      addedCount = Math.max(mergedApiKeys.length - baselineCount, 0)
      apiKeysUpdated = clearExisting || addedCount > 0
    }

    if (apiKeysUpdated) {
      sanitizedUpdates.apiKeys = mergedApiKeys.length ? JSON.stringify(mergedApiKeys) : ''
      sanitizedUpdates.apiKeyCount = String(mergedApiKeys.length)

      if (apiKeyUpdateMode === 'delete') {
        logger.info(
          `🔑 删除模式更新 Droid API keys for ${accountId}: 已移除 ${removedCount} 条，剩余 ${mergedApiKeys.length}`
        )
      } else if (apiKeyUpdateMode === 'update') {
        logger.info(
          `🔑 更新模式更新 Droid API keys for ${accountId}: 更新了 ${newApiKeysInput.length} 个 API Key 的状态信息`
        )
      } else if (apiKeyUpdateMode === 'replace' || wantsClearApiKeys) {
        logger.info(
          `🔑 覆盖模式更新 Droid API keys for ${accountId}: 当前总数 ${mergedApiKeys.length}，新增 ${addedCount}`
        )
      } else {
        logger.info(
          `🔑 追加模式更新 Droid API keys for ${accountId}: 当前总数 ${mergedApiKeys.length}，新增 ${addedCount}`
        )
      }

      if (mergedApiKeys.length > 0) {
        sanitizedUpdates.authenticationMethod = 'api_key'
        sanitizedUpdates.status = sanitizedUpdates.status || 'active'
      } else if (!sanitizedUpdates.accessToken && !account.accessToken) {
        const shouldPreserveApiKeyMode =
          account.authenticationMethod &&
          account.authenticationMethod.toLowerCase().trim() === 'api_key' &&
          (apiKeyUpdateMode === 'replace' || apiKeyUpdateMode === 'delete')

        sanitizedUpdates.authenticationMethod = shouldPreserveApiKeyMode
          ? 'api_key'
          : account.authenticationMethod === 'api_key'
            ? ''
            : account.authenticationMethod
      }
    }

    // 开启 disableAutoProtection 时立即清理已有自动停用状态并恢复调度（手动停用不受影响）
    const enablingAutoProtection =
      sanitizedUpdates.disableAutoProtection === true ||
      sanitizedUpdates.disableAutoProtection === 'true'
    if (enablingAutoProtection) {
      const recoveryPatch = upstreamErrorHelper.buildAutoProtectionRecoveryPatch(account)
      if (recoveryPatch) {
        Object.assign(sanitizedUpdates, recoveryPatch)
      }
      // 无条件重置因上游错误被标记 error 的 API Key（即便账户尚未硬停，也清理 per-key 根因）
      const hasErroredKey = mergedApiKeys.some((entry) => entry && entry.status === 'error')
      if (hasErroredKey) {
        const resetEntries = mergedApiKeys.map((entry) =>
          entry && entry.status === 'error'
            ? { ...entry, status: 'active', errorMessage: '' }
            : entry
        )
        sanitizedUpdates.apiKeys = resetEntries.length ? JSON.stringify(resetEntries) : ''
        sanitizedUpdates.apiKeyCount = String(resetEntries.length)
      }
    }

    const encryptedUpdates = { ...sanitizedUpdates }

    if (sanitizedUpdates.refreshToken !== undefined) {
      encryptedUpdates.refreshToken = this._encryptSensitiveData(sanitizedUpdates.refreshToken)
    }
    if (sanitizedUpdates.accessToken !== undefined) {
      encryptedUpdates.accessToken = this._encryptSensitiveData(sanitizedUpdates.accessToken)
    }

    const baseAccountData = hasStoredAccount ? { ...storedAccount } : { id: accountId }

    const updatedData = {
      ...baseAccountData,
      ...encryptedUpdates
    }

    if (!Object.prototype.hasOwnProperty.call(updatedData, 'refreshToken')) {
      updatedData.refreshToken =
        hasStoredAccount && Object.prototype.hasOwnProperty.call(storedAccount, 'refreshToken')
          ? storedAccount.refreshToken
          : this._encryptSensitiveData(account.refreshToken)
    }

    if (!Object.prototype.hasOwnProperty.call(updatedData, 'accessToken')) {
      updatedData.accessToken =
        hasStoredAccount && Object.prototype.hasOwnProperty.call(storedAccount, 'accessToken')
          ? storedAccount.accessToken
          : this._encryptSensitiveData(account.accessToken)
    }

    if (!Object.prototype.hasOwnProperty.call(updatedData, 'proxy')) {
      updatedData.proxy = hasStoredAccount ? storedAccount.proxy || '' : account.proxy || ''
    }

    await redis.setDroidAccount(accountId, updatedData)

    if (enablingAutoProtection) {
      await upstreamErrorHelper.clearAutoProtectionCooldowns(accountId, 'droid')
    }

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
      const refreshed = await this._refreshTokensWithWorkOS(
        account.refreshToken,
        proxy,
        account.organizationId || null
      )

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

      logger.success(`Droid account token refreshed successfully: ${accountId}`)

      return {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || account.refreshToken,
        expiresAt: refreshed.expiresAt
      }
    } catch (error) {
      logger.error(`❌ Failed to refresh Droid account token: ${accountId}`, error)

      // disableAutoProtection：关闭自动防护时不把账户写成 error（保持可调度、透传上游错误）
      if (account?.disableAutoProtection === true || account?.disableAutoProtection === 'true') {
        logger.info(`🛡️ Droid 账号 ${accountId} 已关闭自动防护，token 刷新失败时跳过写 error 状态`)
        upstreamErrorHelper
          .recordErrorHistory(
            accountId,
            'droid',
            0,
            'token_refresh_failed',
            upstreamErrorHelper.buildErrorContext({
              reason: 'token_refresh_failed',
              message: error.message
            })
          )
          .catch(() => {})
      } else {
        // 更新账户状态为错误
        await this.updateAccount(accountId, {
          status: 'error',
          errorMessage: error.message || 'Token refresh failed'
        })
      }

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

  /**
   * 获取有效的 access token（自动刷新）
   */
  async getValidAccessToken(accountId) {
    let account = await this.getAccount(accountId)
    if (!account) {
      throw new Error(`Droid account not found: ${accountId}`)
    }

    if (
      typeof account.authenticationMethod === 'string' &&
      account.authenticationMethod.toLowerCase().trim() === 'api_key'
    ) {
      throw new Error(`Droid account ${accountId} 已配置为 API Key 模式，不能获取 Access Token`)
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

    const normalizedFilter = endpointType ? this._sanitizeEndpointType(endpointType) : null

    return allAccounts
      .filter((account) => {
        const isActive = this._isTruthy(account.isActive)
        const isSchedulable = this._isTruthy(account.schedulable)
        const status = typeof account.status === 'string' ? account.status.toLowerCase() : ''

        // ✅ 检查账户订阅是否过期
        if (this.isSubscriptionExpired(account)) {
          logger.debug(
            `⏰ Skipping expired Droid account: ${account.name}, expired at ${account.subscriptionExpiresAt}`
          )
          return false
        }

        if (!isActive || !isSchedulable) {
          return false
        }
        // [人工决策-2026-06-02 23:30:05] 开 disableAutoProtection = 暴力打：忽略 status!=='active'；
        //   isActive/schedulable(手动停用)、订阅过期仍生效
        const autoOff =
          account.disableAutoProtection === true || account.disableAutoProtection === 'true'
        if (!autoOff && status !== 'active') {
          return false
        }

        if (!normalizedFilter) {
          return true
        }

        const accountEndpoint = this._sanitizeEndpointType(account.endpointType)

        if (normalizedFilter === 'openai') {
          return accountEndpoint === 'openai' || accountEndpoint === 'anthropic'
        }

        if (normalizedFilter === 'anthropic') {
          return accountEndpoint === 'anthropic' || accountEndpoint === 'openai'
        }

        // comm 端点可以使用任何类型的账户
        if (normalizedFilter === 'comm') {
          return true
        }

        return accountEndpoint === normalizedFilter
      })
      .map((account) => ({
        ...account,
        endpointType: this._sanitizeEndpointType(account.endpointType),
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
      `✅ Selected Droid account: ${selectedAccount.name} (${selectedAccount.id}) - Endpoint: ${this._sanitizeEndpointType(selectedAccount.endpointType)}`
    )

    return selectedAccount
  }

  /**
   * 获取 Factory.ai API 的完整 URL
   */
  getFactoryApiUrl(endpointType, endpoint) {
    const normalizedType = this._sanitizeEndpointType(endpointType)
    const baseUrls = {
      anthropic: `${this.factoryApiBaseUrl}/a${endpoint}`,
      openai: `${this.factoryApiBaseUrl}/o${endpoint}`,
      comm: `${this.factoryApiBaseUrl}/o${endpoint}`
    }

    return baseUrls[normalizedType] || baseUrls.openai
  }

  async touchLastUsedAt(accountId) {
    if (!accountId) {
      return
    }

    try {
      const client = redis.getClientSafe()
      await client.hset(RedisKeys.accounts.droid(accountId), 'lastUsedAt', new Date().toISOString())
    } catch (error) {
      logger.warn(`⚠️ Failed to update lastUsedAt for Droid account ${accountId}:`, error)
    }
  }

  // 🔄 重置Droid账户所有异常状态
  async resetAccountStatus(accountId) {
    try {
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        throw new Error('Account not found')
      }

      const client = redis.getClientSafe()
      const accountKey = RedisKeys.accounts.droid(accountId)

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

      logger.success(`Reset all error status for Droid account ${accountId}`)

      // 清除临时不可用状态
      await upstreamErrorHelper.clearTempUnavailable(accountId, 'droid').catch(() => {})

      // 异步发送 Webhook 通知（忽略错误）
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: accountData.name || accountId,
          platform: 'droid',
          status: 'recovered',
          errorCode: 'STATUS_RESET',
          reason: 'Account status manually reset',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.warn('Failed to send webhook notification for Droid status reset:', webhookError)
      }

      return { success: true, accountId }
    } catch (error) {
      logger.error(`❌ Failed to reset Droid account status: ${accountId}`, error)
      throw error
    }
  }
}

// 导出单例
module.exports = new DroidAccountService()
