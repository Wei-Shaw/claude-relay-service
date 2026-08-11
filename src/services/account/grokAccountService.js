/**
 * Grok / xAI 账户服务
 * 支持 OAuth(PKCE) 与 API Key 两种认证；凭证 AES 加密存 Redis
 * 行为对齐 sub2api Grok OAuth/账户生命周期，存储对齐 CRS 既有账户服务
 */

const { v4: uuidv4 } = require('uuid')
const axios = require('axios')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const ProxyHelper = require('../../utils/proxyHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const { createEncryptor } = require('../../utils/commonHelper')
const { RedisKeys, TTL } = require('../../constants/redisKeys')
const tokenRefreshService = require('../tokenRefreshService')
const {
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError
} = require('../../utils/tokenRefreshLogger')
const xaiHelper = require('../../utils/xaiHelper')
const grokSsoHelper = require('../../utils/grokSsoHelper')

const encryptor = createEncryptor('grok-account-salt')
const { encrypt, decrypt } = encryptor

const DEFAULT_ACCESS_TOKEN_TTL_MS = 6 * 60 * 60 * 1000
const OAUTH_SESSION_TTL_SECONDS = Math.floor(
  (xaiHelper.XAI_DEFAULTS.sessionTtlMs || 30 * 60 * 1000) / 1000
)

setInterval(
  () => {
    encryptor.clearCache()
    logger.info('🧹 Grok decrypt cache cleanup completed', encryptor.getStats())
  },
  10 * 60 * 1000
).unref?.()

const boolToStr = (value, defaultTrue = true) => {
  if (value === undefined || value === null || value === '') {
    return defaultTrue ? 'true' : 'false'
  }
  return value === true || value === 'true' ? 'true' : 'false'
}

const toStr = (value, fallback = '') => {
  if (value === undefined || value === null) {
    return fallback
  }
  return String(value)
}

const parseJsonField = (raw, fallback = null) => {
  if (!raw) {
    return fallback
  }
  if (typeof raw === 'object') {
    return raw
  }
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const normalizeBaseUrl = (raw, accountType) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return accountType === 'oauth'
      ? xaiHelper.effectiveCliBaseUrl()
      : xaiHelper.effectiveBaseUrl()
  }
  if (accountType === 'oauth' && xaiHelper.isOfficialBaseUrl(trimmed)) {
    return xaiHelper.validateTrustedBaseUrl(trimmed)
  }
  return xaiHelper.validateBaseUrl(trimmed)
}

const buildAxiosProxyConfig = (proxy) => {
  if (!proxy) {
    return {}
  }
  const agent = ProxyHelper.createProxyAgent(proxy)
  if (!agent) {
    return {}
  }
  return { httpAgent: agent, httpsAgent: agent, proxy: false }
}

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) {
      return null
    }
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    )
    return JSON.parse(payload)
  } catch {
    return null
  }
}

class GrokAccountService {
  constructor() {
    this.platform = 'grok'
  }

  // ========== OAuth 会话 ==========

  async generateAuthUrl({ proxy = null, redirectUri = '', proxyBound = false } = {}) {
    const state = xaiHelper.generateState()
    const nonce = xaiHelper.generateNonce()
    const codeVerifier = xaiHelper.generateCodeVerifier()
    const codeChallenge = xaiHelper.generateCodeChallenge(codeVerifier)
    const sessionId = xaiHelper.generateSessionId()
    const effectiveRedirect = xaiHelper.effectiveRedirectUri(redirectUri)

    const authUrl = xaiHelper.buildAuthorizationUrl({
      state,
      codeChallenge,
      redirectUri: effectiveRedirect,
      nonce
    })

    const client = redis.getClientSafe()
    const key = RedisKeys.session.oauth(sessionId)
    await client.hset(key, {
      platform: 'grok',
      state,
      codeVerifier,
      codeChallenge,
      clientId: xaiHelper.effectiveClientId(),
      scope: xaiHelper.effectiveScope(),
      redirectUri: effectiveRedirect,
      proxy: proxy ? JSON.stringify(proxy) : '',
      proxyBound: proxyBound ? 'true' : 'false',
      createdAt: new Date().toISOString()
    })
    await client.expire(key, OAUTH_SESSION_TTL_SECONDS || TTL.oauthSession || 600)

    return { authUrl, sessionId, state }
  }

  async _loadOAuthSession(sessionId) {
    const client = redis.getClientSafe()
    const key = RedisKeys.session.oauth(sessionId)
    const data = await client.hgetall(key)
    if (!data || Object.keys(data).length === 0 || data.platform !== 'grok') {
      return null
    }
    return {
      ...data,
      proxy: parseJsonField(data.proxy, null)
    }
  }

  async _deleteOAuthSession(sessionId) {
    const client = redis.getClientSafe()
    await client.del(RedisKeys.session.oauth(sessionId))
  }

  async exchangeCode({
    sessionId,
    code,
    state = '',
    redirectUri = '',
    proxy = null
  } = {}) {
    const session = await this._loadOAuthSession(sessionId)
    if (!session) {
      throw new Error('Grok OAuth session not found or expired')
    }

    try {
      const parsed = xaiHelper.parseAuthorizationInput(code)
      const authCode = parsed.code
      if (!authCode) {
        throw new Error('authorization code is required')
      }

      // Grok OAuth 一律强制 state 校验（CSRF/mix-up 防护）
      // 禁止裸 code（requiresState=false）绕过；state 可来自 body 字段或 callback URL/query
      let finalState = String(state || '').trim()
      if (!finalState) {
        finalState = parsed.state
      }
      if (!finalState) {
        throw new Error('oauth state is required')
      }
      if (finalState !== session.state) {
        throw new Error('invalid oauth state')
      }

      const finalRedirect = redirectUri || session.redirectUri
      const finalProxy = proxy || session.proxy
      const tokenInfo = await this._requestToken({
        grantType: 'authorization_code',
        code: authCode,
        codeVerifier: session.codeVerifier,
        redirectUri: finalRedirect,
        clientId: session.clientId || xaiHelper.effectiveClientId(),
        proxy: finalProxy
      })

      return this._normalizeTokenInfo(tokenInfo, session.clientId)
    } finally {
      await this._deleteOAuthSession(sessionId)
    }
  }

  async refreshAccessToken(refreshToken, { proxy = null, clientId = '' } = {}) {
    const token = String(refreshToken || '').trim()
    if (!token) {
      throw new Error('refresh_token is required')
    }
    const tokenInfo = await this._requestToken({
      grantType: 'refresh_token',
      refreshToken: token,
      clientId: clientId || xaiHelper.effectiveClientId(),
      proxy
    })
    const normalized = this._normalizeTokenInfo(tokenInfo, clientId)
    if (!normalized.refreshToken) {
      normalized.refreshToken = token
    }
    return normalized
  }

  async _requestToken({
    grantType,
    code = '',
    codeVerifier = '',
    redirectUri = '',
    refreshToken = '',
    clientId = '',
    proxy = null
  }) {
    const form = new URLSearchParams()
    form.set('grant_type', grantType)
    form.set('client_id', clientId || xaiHelper.effectiveClientId())

    if (grantType === 'authorization_code') {
      form.set('code', code)
      form.set('redirect_uri', xaiHelper.effectiveRedirectUri(redirectUri))
      form.set('code_verifier', codeVerifier)
    } else if (grantType === 'refresh_token') {
      form.set('refresh_token', refreshToken)
    } else {
      throw new Error(`unsupported grant_type: ${grantType}`)
    }

    const tokenUrl = xaiHelper.validateOAuthEndpointUrl(xaiHelper.effectiveTokenUrl())
    const response = await axios.post(tokenUrl, form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'claude-relay-service-grok-oauth/1.0'
      },
      timeout: 60000,
      ...buildAxiosProxyConfig(proxy),
      validateStatus: () => true
    })

    if (response.status < 200 || response.status >= 300) {
      const body =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {})
      const err = new Error(
        `Grok OAuth token request failed: status ${response.status}, body: ${body.slice(0, 500)}`
      )
      err.status = response.status
      err.body = body
      throw err
    }

    return response.data || {}
  }

  _normalizeTokenInfo(tokenResp, clientId = '') {
    const expiresIn =
      Number(tokenResp.expires_in) > 0
        ? Number(tokenResp.expires_in)
        : Math.floor(DEFAULT_ACCESS_TOKEN_TTL_MS / 1000)
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    const idToken = tokenResp.id_token || ''
    const claims = decodeJwtPayload(idToken) || {}

    return {
      accessToken: tokenResp.access_token || '',
      refreshToken: tokenResp.refresh_token || '',
      idToken,
      tokenType: tokenResp.token_type || 'Bearer',
      expiresIn,
      expiresAt,
      clientId: String(clientId || xaiHelper.effectiveClientId()).trim(),
      scope: tokenResp.scope || '',
      email: claims.email || claims.preferred_username || '',
      subject: claims.sub || '',
      teamId: claims.team_id || claims.teamId || '',
      subscriptionTier: claims.subscription_tier || claims.xai_subscription_tier || '',
      entitlementStatus: claims.entitlement_status || ''
    }
  }

  buildCredentialsFromToken(tokenInfo, overrides = {}) {
    const creds = {
      access_token: tokenInfo.accessToken,
      expires_at: tokenInfo.expiresAt,
      token_type: tokenInfo.tokenType || 'Bearer',
      base_url: overrides.baseUrl || xaiHelper.effectiveCliBaseUrl()
    }
    if (tokenInfo.refreshToken) {
      creds.refresh_token = tokenInfo.refreshToken
    }
    if (tokenInfo.idToken) {
      creds.id_token = tokenInfo.idToken
    }
    if (tokenInfo.clientId) {
      creds.client_id = tokenInfo.clientId
    }
    if (tokenInfo.scope) {
      creds.scope = tokenInfo.scope
    }
    if (tokenInfo.email) {
      creds.email = tokenInfo.email
    }
    if (tokenInfo.subject) {
      creds.sub = tokenInfo.subject
    }
    if (tokenInfo.teamId) {
      creds.team_id = tokenInfo.teamId
    }
    if (tokenInfo.subscriptionTier) {
      creds.subscription_tier = tokenInfo.subscriptionTier
    }
    if (tokenInfo.entitlementStatus) {
      creds.entitlement_status = tokenInfo.entitlementStatus
    }
    if (overrides.baseUrl) {
      creds.base_url = overrides.baseUrl
    }
    if (overrides.mediaBaseUrl) {
      creds.media_base_url = overrides.mediaBaseUrl
    }
    return creds
  }

  // ========== CRUD ==========

  async createAccount(options = {}) {
    const accountType = options.accountType === 'apikey' ? 'apikey' : 'oauth'
    const authType = options.authType || accountType

    let baseUrl = ''
    try {
      baseUrl = normalizeBaseUrl(options.baseUrl || options.baseApi, authType)
    } catch (error) {
      throw new Error(`Invalid base URL: ${error.message}`)
    }

    const accountId = uuidv4()
    const now = new Date().toISOString()

    // dedicated/shared：优先 sharedType；accountType 仅当值为 dedicated/shared 时采用
    let sharedKind = 'shared'
    if (options.sharedType === 'dedicated' || options.sharedType === 'shared') {
      sharedKind = options.sharedType
    } else if (options.accountType === 'dedicated' || options.accountType === 'shared') {
      sharedKind = options.accountType
    }

    const accountData = {
      id: accountId,
      platform: 'grok',
      name: options.name || (options.email ? options.email : 'Grok Account'),
      description: options.description || '',
      authType,
      accountType: sharedKind,
      priority: toStr(options.priority ?? 50),
      proxy: options.proxy ? JSON.stringify(options.proxy) : '',
      proxyGroupId: options.proxyGroupId || '',
      proxyId: options.proxyId || '',
      isActive: boolToStr(options.isActive, true),
      schedulable: boolToStr(options.schedulable, true),
      status: 'active',
      errorMessage: '',
      disableAutoProtection: boolToStr(options.disableAutoProtection, false),
      rateLimitDuration: toStr(options.rateLimitDuration ?? 60),
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitResetAt: '',
      dailyQuota: toStr(options.dailyQuota ?? 0),
      quotaResetTime: options.quotaResetTime || '00:00',
      dailyUsage: '0',
      lastQuotaResetDate: '',
      groupId: options.groupId || '',
      supportedModels: options.supportedModels
        ? typeof options.supportedModels === 'string'
          ? options.supportedModels
          : JSON.stringify(options.supportedModels)
        : '',
      userAgent: options.userAgent || '',
      baseUrl,
      mediaBaseUrl: options.mediaBaseUrl
        ? String(options.mediaBaseUrl).replace(/\/+$/, '')
        : '',
      clientId: options.clientId || xaiHelper.effectiveClientId(),
      email: options.email ? encrypt(options.email) : '',
      subscriptionTier: options.subscriptionTier || '',
      entitlementStatus: options.entitlementStatus || '',
      planType: options.planType || options.subscriptionTier || '',
      subscriptionExpiresAt: options.subscriptionExpiresAt || '',
      createdAt: now,
      updatedAt: now,
      lastUsedAt: '',
      lastRefresh: '',
      expiresAt: ''
    }

    if (authType === 'oauth') {
      const accessToken = options.accessToken || options.credentials?.access_token || ''
      const refreshToken = options.refreshToken || options.credentials?.refresh_token || ''
      if (!accessToken && !refreshToken) {
        throw new Error('OAuth Grok account requires accessToken or refreshToken')
      }
      accountData.accessToken = accessToken ? encrypt(accessToken) : ''
      accountData.refreshToken = refreshToken ? encrypt(refreshToken) : ''
      accountData.idToken = options.idToken ? encrypt(options.idToken) : ''
      accountData.expiresAt =
        options.expiresAt ||
        options.credentials?.expires_at ||
        new Date(Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString()
      if (!accountData.baseUrl) {
        accountData.baseUrl = xaiHelper.effectiveCliBaseUrl()
      }
    } else {
      const apiKey = options.apiKey || options.credentials?.api_key || ''
      if (!apiKey) {
        throw new Error('API Key is required for Grok apikey account')
      }
      if (!baseUrl) {
        throw new Error('Base URL is required for Grok apikey account')
      }
      accountData.apiKey = encrypt(apiKey)
      accountData.accessToken = ''
      accountData.refreshToken = ''
    }

    // 若 OAuth 创建时未显式 baseUrl，凭据默认 CLI 网关
    if (authType === 'oauth' && !options.baseUrl && !options.baseApi) {
      accountData.baseUrl = xaiHelper.effectiveCliBaseUrl()
    }

    await this._saveAccount(accountId, accountData)

    if (accountData.accountType === 'shared') {
      await redis.getClientSafe().sadd(RedisKeys.accounts.sharedGrok, accountId)
    }

    logger.info(`[GrokAccount] created id=${accountId} authType=${authType}`)
    return this._maskForList(await this.getAccount(accountId, { decryptSecrets: false }))
  }

  async createAccountFromOAuth({
    sessionId,
    code,
    state,
    redirectUri,
    proxy,
    proxyGroupId,
    proxyId,
    name,
    description,
    priority,
    groupId,
    disableAutoProtection,
    dailyQuota,
    baseUrl
  } = {}) {
    const tokenInfo = await this.exchangeCode({ sessionId, code, state, redirectUri, proxy })
    return this.createAccount({
      name: name || tokenInfo.email || 'Grok OAuth Account',
      description,
      authType: 'oauth',
      accountType: 'shared',
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken,
      idToken: tokenInfo.idToken,
      expiresAt: tokenInfo.expiresAt,
      email: tokenInfo.email,
      clientId: tokenInfo.clientId,
      subscriptionTier: tokenInfo.subscriptionTier,
      entitlementStatus: tokenInfo.entitlementStatus,
      planType: tokenInfo.subscriptionTier,
      proxy,
      proxyGroupId,
      proxyId,
      priority,
      groupId,
      disableAutoProtection,
      dailyQuota,
      baseUrl: baseUrl || xaiHelper.effectiveCliBaseUrl()
    })
  }

  async getAccount(accountId, { decryptSecrets = true } = {}) {
    const client = redis.getClientSafe()
    const accountData = await client.hgetall(RedisKeys.accounts.grok(accountId))
    if (!accountData || Object.keys(accountData).length === 0) {
      return null
    }

    if (accountData.proxy) {
      accountData.proxy = parseJsonField(accountData.proxy, null)
    }
    if (accountData.supportedModels) {
      accountData.supportedModels = parseJsonField(accountData.supportedModels, [])
    }

    if (decryptSecrets) {
      if (accountData.accessToken) {
        accountData.accessToken = decrypt(accountData.accessToken)
      }
      if (accountData.refreshToken) {
        accountData.refreshToken = decrypt(accountData.refreshToken)
      }
      if (accountData.idToken) {
        accountData.idToken = decrypt(accountData.idToken)
      }
      if (accountData.apiKey) {
        accountData.apiKey = decrypt(accountData.apiKey)
      }
      if (accountData.email) {
        try {
          accountData.email = decrypt(accountData.email)
        } catch {
          // 明文兼容
        }
      }
    }

    accountData.platform = 'grok'
    return accountData
  }

  async getDecryptedAccessToken(accountId) {
    const account = await this.getAccount(accountId, { decryptSecrets: true })
    if (!account) {
      return null
    }
    if (account.authType === 'apikey') {
      return account.apiKey || null
    }
    return account.accessToken || null
  }

  async updateAccount(accountId, updates = {}) {
    const existing = await this.getAccount(accountId, { decryptSecrets: false })
    if (!existing) {
      throw new Error('Account not found')
    }

    const next = { ...updates, updatedAt: new Date().toISOString() }

    if (next.accessToken) {
      next.accessToken = encrypt(next.accessToken)
    }
    if (next.refreshToken && String(next.refreshToken).trim()) {
      next.refreshToken = encrypt(next.refreshToken)
    }
    if (next.idToken) {
      next.idToken = encrypt(next.idToken)
    }
    if (next.apiKey) {
      next.apiKey = encrypt(next.apiKey)
    }
    if (next.email) {
      next.email = encrypt(next.email)
    }
    if (next.proxy && typeof next.proxy === 'object') {
      next.proxy = JSON.stringify(next.proxy)
    }
    if (next.proxyGroupId !== undefined) {
      next.proxyGroupId = next.proxyGroupId || ''
    }
    if (next.proxyId !== undefined) {
      next.proxyId = next.proxyId || ''
    }
    if (next.supportedModels && typeof next.supportedModels !== 'string') {
      next.supportedModels = JSON.stringify(next.supportedModels)
    }
    if (next.baseUrl) {
      try {
        next.baseUrl = normalizeBaseUrl(next.baseUrl, existing.authType || 'oauth')
      } catch (error) {
        throw new Error(`Invalid base URL: ${error.message}`)
      }
    }
    if (next.mediaBaseUrl) {
      next.mediaBaseUrl = String(next.mediaBaseUrl).replace(/\/+$/, '')
    }
    if (next.isActive !== undefined) {
      next.isActive = boolToStr(next.isActive, true)
    }
    if (next.schedulable !== undefined) {
      next.schedulable = boolToStr(next.schedulable, true)
    }
    if (next.disableAutoProtection !== undefined) {
      next.disableAutoProtection = boolToStr(next.disableAutoProtection, false)
    }
    if (next.priority !== undefined) {
      next.priority = toStr(next.priority)
    }
    if (next.dailyQuota !== undefined) {
      next.dailyQuota = toStr(next.dailyQuota)
    }
    if (next.rateLimitDuration !== undefined) {
      next.rateLimitDuration = toStr(next.rateLimitDuration)
    }

    // 开启 disableAutoProtection 时清理自动停用状态（手动停用不碰）
    const enablingAutoProtection =
      next.disableAutoProtection === 'true' && existing.disableAutoProtection !== 'true'

    const client = redis.getClientSafe()
    await client.hset(RedisKeys.accounts.grok(accountId), next)

    if (next.accountType && next.accountType !== existing.accountType) {
      if (next.accountType === 'shared') {
        await client.sadd(RedisKeys.accounts.sharedGrok, accountId)
      } else {
        await client.srem(RedisKeys.accounts.sharedGrok, accountId)
      }
    }

    if (enablingAutoProtection) {
      await upstreamErrorHelper.clearAutoProtectionCooldowns(accountId, 'grok')
    }

    logger.info(`[GrokAccount] updated id=${accountId}`)
    return { success: true }
  }

  async deleteAccount(accountId) {
    const client = redis.getClientSafe()
    await client.srem(RedisKeys.accounts.sharedGrok, accountId)
    await redis.removeFromIndex(RedisKeys.accounts.grokIndex, accountId)
    await client.del(RedisKeys.accounts.grok(accountId))
    // 清理会话反向索引
    await client.del(RedisKeys.session.grokAccountSessions(accountId))
    logger.info(`[GrokAccount] deleted id=${accountId}`)
    return { success: true }
  }

  async getAllAccounts(includeInactive = false) {
    const client = redis.getClientSafe()
    const accountIds = await redis.getAllIdsByIndex(
      RedisKeys.accounts.grokIndex,
      RedisKeys.accounts.grokPattern,
      /^grok:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const pipeline = client.pipeline()
    accountIds.forEach((id) => pipeline.hgetall(RedisKeys.accounts.grok(id)))
    const results = await pipeline.exec()

    const accounts = []
    for (const [err, accountData] of results) {
      if (err || !accountData || !accountData.id) {
        continue
      }
      if (!includeInactive && accountData.isActive !== 'true') {
        continue
      }
      accounts.push(this._maskForList(this._hydrateListAccount(accountData)))
    }
    return accounts
  }

  _hydrateListAccount(accountData) {
    const data = { ...accountData }
    data.proxy = parseJsonField(data.proxy, null)
    data.supportedModels = parseJsonField(data.supportedModels, [])
    data.schedulable = data.schedulable !== 'false'
    data.isActive = data.isActive === 'true'
    data.disableAutoProtection =
      data.disableAutoProtection === true || data.disableAutoProtection === 'true'
    data.platform = 'grok'
    data.priority = parseInt(data.priority, 10) || 50
    data.dailyQuota = parseFloat(data.dailyQuota) || 0
    if (data.email) {
      try {
        data.email = decrypt(data.email)
      } catch {
        // keep raw
      }
    }
    return data
  }

  _maskForList(account) {
    if (!account) {
      return account
    }
    const masked = { ...account }
    if (masked.accessToken) {
      masked.accessToken = '***'
    }
    if (masked.refreshToken) {
      masked.refreshToken = '***'
    }
    if (masked.idToken) {
      masked.idToken = '***'
    }
    if (masked.apiKey) {
      masked.apiKey = '***'
    }
    return masked
  }

  async _saveAccount(accountId, accountData) {
    const client = redis.getClientSafe()
    await client.hset(RedisKeys.accounts.grok(accountId), accountData)
    await redis.addToIndex(RedisKeys.accounts.grokIndex, accountId)
  }

  // ========== Token 刷新 ==========

  async refreshAccountToken(accountId) {
    let lockAcquired = false
    let account = null
    try {
      lockAcquired = await tokenRefreshService.acquireRefreshLock(accountId, 'grok')
      if (!lockAcquired) {
        logger.debug(`[GrokAccount] refresh lock busy id=${accountId}`)
        account = await this.getAccount(accountId, { decryptSecrets: true })
        return account
      }

      account = await this.getAccount(accountId, { decryptSecrets: true })
      if (!account) {
        throw new Error('Account not found')
      }
      if (account.authType === 'apikey') {
        return account
      }
      if (!account.refreshToken) {
        throw new Error('no refresh token available')
      }

      logRefreshStart(accountId, account.name, 'grok')
      const tokenInfo = await this.refreshAccessToken(account.refreshToken, {
        proxy: account.proxy,
        clientId: account.clientId
      })

      await this.updateAccount(accountId, {
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken || account.refreshToken,
        idToken: tokenInfo.idToken || undefined,
        expiresAt: tokenInfo.expiresAt,
        lastRefresh: new Date().toISOString(),
        status: account.status === 'unauthorized' ? 'active' : account.status,
        errorMessage: account.status === 'unauthorized' ? '' : account.errorMessage
      })

      logRefreshSuccess(accountId, account.name, 'grok')
      return this.getAccount(accountId, { decryptSecrets: true })
    } catch (error) {
      logRefreshError(accountId, account?.name || accountId, 'grok', error.message)
      console.error(error)
      throw error
    } finally {
      if (lockAcquired) {
        await tokenRefreshService.releaseRefreshLock(accountId, 'grok')
      }
    }
  }

  async ensureFreshToken(accountId) {
    const account = await this.getAccount(accountId, { decryptSecrets: true })
    if (!account) {
      return null
    }
    if (account.authType === 'apikey') {
      return account
    }
    const expiresAt = account.expiresAt ? Date.parse(account.expiresAt) : 0
    const skewMs = 5 * 60 * 1000
    if (!expiresAt || Date.now() + skewMs >= expiresAt) {
      if (!account.refreshToken) {
        return account
      }
      return this.refreshAccountToken(accountId)
    }
    return account
  }

  getUpstreamBaseUrl(account, { media = false } = {}) {
    if (!account) {
      return xaiHelper.effectiveBaseUrl()
    }
    if (media && account.mediaBaseUrl) {
      return String(account.mediaBaseUrl).replace(/\/+$/, '')
    }
    if (account.baseUrl) {
      return String(account.baseUrl).replace(/\/+$/, '')
    }
    return account.authType === 'oauth'
      ? xaiHelper.effectiveCliBaseUrl()
      : xaiHelper.effectiveBaseUrl()
  }

  // ========== 状态 / 限流 ==========

  async markAccountRateLimited(accountId, duration = null) {
    const account = await this.getAccount(accountId, { decryptSecrets: false })
    if (!account) {
      return
    }
    if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
      logger.info(
        `🛡️ Grok account ${accountId} has auto-protection disabled, skip markAccountRateLimited`
      )
      upstreamErrorHelper
        .recordErrorHistory(
          accountId,
          'grok',
          429,
          'rate_limit',
          upstreamErrorHelper.buildErrorContext({ reason: 'auto_protection_disabled_rate_limit' })
        )
        .catch((e) => console.error(e))
      return
    }

    const rateLimitDuration = duration || parseInt(account.rateLimitDuration, 10) || 60
    const now = new Date()
    const resetAt = new Date(now.getTime() + rateLimitDuration * 60000)
    await this.updateAccount(accountId, {
      rateLimitedAt: now.toISOString(),
      rateLimitStatus: 'limited',
      rateLimitResetAt: resetAt.toISOString(),
      rateLimitDuration: String(rateLimitDuration),
      status: 'rateLimited',
      schedulable: 'false',
      errorMessage: `Rate limited until ${resetAt.toISOString()}`
    })
  }

  async markAccountUnauthorized(accountId, reason = 'Grok account unauthorized (401)') {
    const account = await this.getAccount(accountId, { decryptSecrets: false })
    if (!account) {
      return
    }
    if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
      logger.info(
        `🛡️ Grok account ${accountId} has auto-protection disabled, skip markAccountUnauthorized`
      )
      upstreamErrorHelper
        .recordErrorHistory(
          accountId,
          'grok',
          401,
          'auth_error',
          upstreamErrorHelper.buildErrorContext({ reason: 'auto_protection_disabled_unauthorized' })
        )
        .catch((e) => console.error(e))
      return
    }

    await this.updateAccount(accountId, {
      status: 'unauthorized',
      schedulable: 'false',
      errorMessage: reason,
      unauthorizedAt: new Date().toISOString()
    })
  }

  async checkAndClearRateLimit(accountId) {
    const account = await this.getAccount(accountId, { decryptSecrets: false })
    if (!account || account.rateLimitStatus !== 'limited') {
      return false
    }
    const now = new Date()
    let shouldClear = false
    if (account.rateLimitResetAt) {
      shouldClear = now >= new Date(account.rateLimitResetAt)
    } else if (account.rateLimitedAt) {
      const duration = parseInt(account.rateLimitDuration, 10) || 60
      shouldClear = now - new Date(account.rateLimitedAt) > duration * 60000
    }
    if (!shouldClear) {
      return false
    }
    await this.updateAccount(accountId, {
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitResetAt: '',
      status: 'active',
      schedulable: 'true',
      errorMessage: ''
    })
    return true
  }

  async toggleSchedulable(accountId) {
    const account = await this.getAccount(accountId, { decryptSecrets: false })
    if (!account) {
      throw new Error('Account not found')
    }
    const next = account.schedulable === true || account.schedulable === 'true' ? 'false' : 'true'
    await this.updateAccount(accountId, { schedulable: next })
    return { schedulable: next === 'true' }
  }

  async resetAccountStatus(accountId) {
    await this.updateAccount(accountId, {
      status: 'active',
      schedulable: 'true',
      errorMessage: '',
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitResetAt: ''
    })
    return { success: true }
  }

  async updateAccountUsage(accountId) {
    await this.updateAccount(accountId, { lastUsedAt: new Date().toISOString() })
  }

  // ========== 配额探测 ==========

  async queryQuota(accountId) {
    const account = await this.ensureFreshToken(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const token =
      account.authType === 'apikey' ? account.apiKey : account.accessToken
    if (!token) {
      throw new Error('No credential available for quota probe')
    }

    const baseUrl = this.getUpstreamBaseUrl(account)
    const weeklyUrl = xaiHelper.buildBillingUrl(baseUrl, true)
    const monthlyUrl = xaiHelper.buildBillingUrl(baseUrl, false)
    const headers = {
      Authorization: `Bearer ${token}`,
      ...xaiHelper.buildCliIdentityHeaders()
    }

    const proxyConfig = buildAxiosProxyConfig(account.proxy)
    const [weeklyRes, monthlyRes] = await Promise.all([
      axios
        .get(weeklyUrl, {
          headers,
          timeout: 30000,
          ...proxyConfig,
          validateStatus: () => true
        })
        .catch((error) => ({ error })),
      axios
        .get(monthlyUrl, {
          headers,
          timeout: 30000,
          ...proxyConfig,
          validateStatus: () => true
        })
        .catch((error) => ({ error }))
    ])

    const weekly =
      weeklyRes?.error || weeklyRes.status >= 400
        ? { error: weeklyRes.error?.message || `status ${weeklyRes.status}` }
        : weeklyRes.data
    const monthly =
      monthlyRes?.error || monthlyRes.status >= 400
        ? { error: monthlyRes.error?.message || `status ${monthlyRes.status}` }
        : monthlyRes.data

    // 尽量从响应头提取订阅档
    const tierHeader =
      weeklyRes?.headers?.['xai-subscription-tier'] ||
      monthlyRes?.headers?.['xai-subscription-tier'] ||
      ''
    const entitlementHeader =
      weeklyRes?.headers?.['xai-entitlement-status'] ||
      monthlyRes?.headers?.['xai-entitlement-status'] ||
      ''

    if (tierHeader || entitlementHeader) {
      await this.updateAccount(accountId, {
        subscriptionTier: tierHeader || undefined,
        planType: tierHeader || undefined,
        entitlementStatus: entitlementHeader || undefined
      }).catch((e) => console.error(e))
    }

    return {
      accountId,
      baseUrl,
      subscriptionTier: tierHeader || account.subscriptionTier || account.planType || '',
      entitlementStatus: entitlementHeader || account.entitlementStatus || '',
      weekly,
      monthly,
      probedAt: new Date().toISOString()
    }
  }

  runtimeSanity() {
    const check = (value, validate) => {
      try {
        const normalized = validate(value)
        return { value: normalized, valid: true }
      } catch (error) {
        return { value, valid: false, error: error.message }
      }
    }
    return {
      baseUrl: check(xaiHelper.effectiveBaseUrl(), (v) => xaiHelper.validateBaseUrl(v)),
      oauthAuthorizeUrl: check(xaiHelper.effectiveAuthorizeUrl(), (v) =>
        xaiHelper.validateOAuthEndpointUrl(v)
      ),
      oauthTokenUrl: check(xaiHelper.effectiveTokenUrl(), (v) =>
        xaiHelper.validateOAuthEndpointUrl(v)
      ),
      oauthRedirectUri: {
        value: xaiHelper.effectiveRedirectUri(),
        valid: true
      },
      unsafeUrlOverrides: xaiHelper.allowUnsafeUrlOverrides(),
      unsafeHighConcurrency: config.xai?.unsafeAllowHighConcurrency === true,
      clientId: xaiHelper.effectiveClientId()
    }
  }

  // ========== 媒体资格（OAuth Free fail-closed） ==========

  /**
   * 对齐 sub2api Account.GrokMediaGenerationEligibility
   * @returns {{ eligible: boolean, reason: string }}
   */
  getMediaGenerationEligibility(account) {
    if (!account || account.platform !== 'grok') {
      return { eligible: false, reason: 'not_grok' }
    }
    // 显式覆盖
    if (account.mediaEligible === true || account.mediaEligible === 'true') {
      return { eligible: true, reason: 'override_enabled' }
    }
    if (account.mediaEligible === false || account.mediaEligible === 'false') {
      return { eligible: false, reason: 'override_disabled' }
    }
    // API Key 默认放行
    if (account.authType === 'apikey') {
      return { eligible: true, reason: 'non_oauth' }
    }

    const plan = String(
      account.planType || account.subscriptionTier || account.subscriptionTier || ''
    )
      .trim()
      .toLowerCase()
    // Free / basic 明确拒绝
    if (
      plan === 'free' ||
      plan === 'basic' ||
      plan === 'grok free' ||
      (plan.includes('free') && !plan.includes('super'))
    ) {
      return { eligible: false, reason: 'billing_free_tier' }
    }
    // SuperGrok / SuperGrok Heavy 放行
    if (plan.includes('super') || plan.includes('heavy') || plan.includes('premium')) {
      return { eligible: true, reason: 'eligible' }
    }
    // 有月度配额观测（queryQuota 写回）且非 free
    if (account.billingObserved === true || account.billingObserved === 'true') {
      if (account.billingForbidden === true || account.billingForbidden === 'true') {
        return { eligible: false, reason: 'billing_forbidden' }
      }
      return { eligible: true, reason: 'eligible' }
    }
    // 未观测：调度仍可选，转发前必须 probe；此处返回 unobserved
    return { eligible: false, reason: 'billing_unobserved' }
  }

  /**
   * 媒体转发前探测资格；unobserved 时触发 quota probe 后再判
   */
  async ensureMediaEligible(accountId) {
    let account = await this.getAccount(accountId, { decryptSecrets: false })
    if (!account) {
      return { eligible: false, reason: 'not_found', account: null }
    }
    let result = this.getMediaGenerationEligibility(account)
    if (result.reason === 'billing_unobserved' && account.authType === 'oauth') {
      try {
        const quota = await this.queryQuota(accountId)
        const tier = String(quota.subscriptionTier || '').toLowerCase()
        const isFree =
          !tier ||
          tier === 'free' ||
          tier === 'basic' ||
          (tier.includes('free') && !tier.includes('super'))
        const forbidden =
          (quota.weekly && quota.weekly.error && String(quota.weekly.error).includes('403')) ||
          (quota.monthly && quota.monthly.error && String(quota.monthly.error).includes('403'))
        await this.updateAccount(accountId, {
          planType: quota.subscriptionTier || account.planType || '',
          subscriptionTier: quota.subscriptionTier || '',
          entitlementStatus: quota.entitlementStatus || '',
          billingObserved: 'true',
          billingForbidden: forbidden ? 'true' : 'false'
        })
        account = await this.getAccount(accountId, { decryptSecrets: false })
        if (forbidden) {
          return { eligible: false, reason: 'billing_forbidden', account }
        }
        if (isFree) {
          return { eligible: false, reason: 'billing_free_tier', account }
        }
        // 有成功月度/周度观测且非 free
        const hasObservation =
          quota.monthly && !quota.monthly.error
            ? true
            : quota.weekly && !quota.weekly.error
        if (!hasObservation) {
          return { eligible: false, reason: 'billing_inconclusive', account }
        }
        return { eligible: true, reason: 'eligible', account }
      } catch (error) {
        console.error(error)
        return { eligible: false, reason: 'billing_unobserved', account }
      }
    }
    return { ...result, account }
  }

  // ========== SSO 批量导入 ==========

  async createAccountFromSSOToken(ssoToken, options = {}) {
    const tokenResp = await grokSsoHelper.convertSSOToBuild(ssoToken, {
      proxy: options.proxy || null
    })
    const tokenInfo = this._normalizeTokenInfo(tokenResp, xaiHelper.effectiveClientId())
    return this.createAccount({
      name: options.name || tokenInfo.email || 'Grok SSO Account',
      description: options.description || 'Imported from Grok Web SSO',
      authType: 'oauth',
      accountType: options.accountType || 'shared',
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken,
      idToken: tokenInfo.idToken,
      expiresAt: tokenInfo.expiresAt,
      email: tokenInfo.email,
      clientId: tokenInfo.clientId,
      proxy: options.proxy || null,
      proxyGroupId: options.proxyGroupId || '',
      proxyId: options.proxyId || '',
      priority: options.priority,
      groupId: options.groupId,
      disableAutoProtection: options.disableAutoProtection,
      dailyQuota: options.dailyQuota,
      baseUrl: options.baseUrl || xaiHelper.effectiveCliBaseUrl()
    })
  }

  /**
   * 批量 SSO 导入，并发上限 3
   */
  async createAccountsFromSSO({
    ssoTokens = [],
    ssoToken = '',
    proxy = null,
    proxyGroupId = '',
    proxyId = '',
    name = '',
    priority = 50,
    groupId = '',
    baseUrl = ''
  } = {}) {
    const tokens = []
    if (Array.isArray(ssoTokens)) {
      for (const item of ssoTokens) {
        const normalized = grokSsoHelper.normalizeSSOToken(item)
        if (normalized) {
          tokens.push(normalized)
        }
      }
    }
    const single = grokSsoHelper.normalizeSSOToken(ssoToken)
    if (single) {
      tokens.push(single)
    }
    if (tokens.length === 0) {
      throw new Error('sso_tokens is required')
    }

    // SSO 兑换也走池代理（fail-closed）
    let effectiveProxy = proxy
    if (proxyGroupId || proxyId) {
      const proxyResolver = require('../../utils/proxyResolver')
      effectiveProxy = proxyResolver.resolveAuthProxy(
        { proxyGroupId, proxyId, platform: 'grok' },
        'grok',
        proxy
      )
    }

    const concurrency = Math.min(3, tokens.length)
    const results = new Array(tokens.length)
    let cursor = 0

    const worker = async () => {
      while (cursor < tokens.length) {
        const index = cursor
        cursor += 1
        const token = tokens[index]
        try {
          const accountName =
            name && tokens.length === 1
              ? name
              : name
                ? `${name}-${index + 1}`
                : `Grok SSO ${index + 1}`
          const account = await this.createAccountFromSSOToken(token, {
            proxy: effectiveProxy,
            proxyGroupId,
            proxyId,
            name: accountName,
            priority,
            groupId,
            baseUrl
          })
          this.ensureMediaEligible(account.id).catch((e) => console.error(e))
          results[index] = {
            index: index + 1,
            created: true,
            account,
            email: account.email || ''
          }
        } catch (error) {
          console.error(error)
          results[index] = {
            index: index + 1,
            created: false,
            error: error.message || String(error)
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    return {
      created: results.filter((item) => item.created),
      failed: results.filter((item) => !item.created)
    }
  }
/**
   * OAuth 批量对账：扫描近过期/缺 token 账户，可选 dry-run 或 apply 刷新
   */
  async reconcileOAuthAccounts({
    mode = 'dry_run',
    limit = 50,
    nearExpiryMinutes = 60
  } = {}) {
    const apply = mode === 'apply'
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500)
    const all = await this.getAllAccounts(true)
    const oauthAccounts = all.filter((account) => account.authType === 'oauth')
    const items = []
    const nearMs = nearExpiryMinutes * 60 * 1000
    const now = Date.now()

    for (const listed of oauthAccounts) {
      if (items.length >= pageSize) {
        break
      }
      const account = await this.getAccount(listed.id, { decryptSecrets: true })
      if (!account) {
        continue
      }
      let reason = ''
      let action = ''
      if (!account.refreshToken) {
        reason = 'missing_refresh_token'
        action = 'block_account'
      } else if (!account.accessToken) {
        reason = 'missing_access_token'
        action = 'refresh_credentials'
      } else if (!account.expiresAt) {
        reason = 'missing_expiry'
        action = 'refresh_credentials'
      } else {
        const expiresAt = Date.parse(account.expiresAt)
        if (!Number.isFinite(expiresAt)) {
          reason = 'invalid_expiry'
          action = 'refresh_credentials'
        } else if (expiresAt - now <= nearMs) {
          reason = 'near_expiry'
          action = 'refresh_credentials'
        }
      }
      if (!reason) {
        continue
      }

      const item = {
        accountId: account.id,
        name: account.name,
        reason,
        action,
        outcome: 'planned'
      }

      if (apply) {
        try {
          if (action === 'block_account') {
            await this.updateAccount(account.id, {
              status: 'error',
              schedulable: 'false',
              errorMessage: 'OAuth reconcile: missing refresh token'
            })
            item.outcome = 'applied'
          } else if (action === 'refresh_credentials') {
            await this.refreshAccountToken(account.id)
            item.outcome = 'applied'
          }
        } catch (error) {
          console.error(error)
          item.outcome = 'failed'
          item.error = error.message
        }
      }
      items.push(item)
    }

    return {
      mode: apply ? 'apply' : 'dry_run',
      scanned: oauthAccounts.length,
      matched: items.length,
      items
    }
  }
}

module.exports = new GrokAccountService()
