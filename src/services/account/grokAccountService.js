const { v4: uuidv4 } = require('uuid')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { createEncryptor, isTruthy } = require('../../utils/commonHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const tokenRefreshService = require('../tokenRefreshService')
const {
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError,
  logRefreshSkipped
} = require('../../utils/tokenRefreshLogger')
const grokHelper = require('../../utils/grokHelper')
const grokQuota = require('../../utils/grokQuota')

class GrokAccountService {
  constructor() {
    this._encryptor = createEncryptor('grok-account-salt')
    this.ACCOUNT_KEY_PREFIX = 'grok_account:'
    this.SHARED_ACCOUNTS_KEY = 'shared_grok_accounts'
    this.INDEX_KEY = 'grok_account:index'

    if (process.env.NODE_ENV !== 'test') {
      setInterval(
        () => {
          this._encryptor.clearCache()
          logger.info('🧹 Grok decrypt cache cleanup completed', this._encryptor.getStats())
        },
        10 * 60 * 1000
      )
    }
  }

  _encrypt(text) {
    return this._encryptor.encrypt(text)
  }

  _decrypt(text) {
    return this._encryptor.decrypt(text)
  }

  _normalizeAuthType(value) {
    return value === grokHelper.AUTH_TYPES.API_KEY
      ? grokHelper.AUTH_TYPES.API_KEY
      : grokHelper.AUTH_TYPES.OAUTH
  }

  _normalizePriority(priority) {
    const parsed = parseInt(priority, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 50
    }
    return Math.min(100, parsed)
  }

  _toStoredBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') {
      return defaultValue ? 'true' : 'false'
    }
    return isTruthy(value) ? 'true' : 'false'
  }

  _resolveStoredBaseUrl({ authType, baseUrl, customUpstream }) {
    return grokHelper.resolveAccountBaseUrl({
      authType,
      baseUrl,
      customUpstream: isTruthy(customUpstream)
    })
  }

  async createAccount(options = {}) {
    const authType = this._normalizeAuthType(options.authType)
    const customUpstream = isTruthy(options.customUpstream)
    const name = options.name || 'Grok Account'
    const description = options.description || ''
    const priority = this._normalizePriority(options.priority)
    const accountType = options.accountType || 'shared'
    const isActive = options.isActive !== false
    const schedulable = options.schedulable !== false
    const dailyQuota = options.dailyQuota || 0
    const quotaResetTime = options.quotaResetTime || '00:00'
    const rateLimitDuration = options.rateLimitDuration ?? 60
    const disableAutoProtection = isTruthy(options.disableAutoProtection)
    const userAgent = options.userAgent || ''

    let accessToken = String(options.accessToken || '').trim()
    let refreshToken = String(options.refreshToken || '').trim()
    let apiKey = String(options.apiKey || '').trim()
    let expiresAt = options.expiresAt || ''
    const tokenType = options.tokenType || 'Bearer'
    const email = options.email || ''

    if (authType === grokHelper.AUTH_TYPES.OAUTH) {
      if (!accessToken && !refreshToken) {
        throw new Error('Grok OAuth accounts require an access token or refresh token')
      }
      apiKey = ''
    } else {
      if (!apiKey) {
        throw new Error('Grok API Key accounts require an API key')
      }
      accessToken = ''
      refreshToken = ''
      expiresAt = ''
    }

    const baseUrl = this._resolveStoredBaseUrl({
      authType,
      baseUrl:
        options.baseUrl || grokHelper.resolveBaseUrlMode(options.baseUrlMode, options.baseUrl),
      customUpstream
    })

    const accountId = uuidv4()
    const now = new Date().toISOString()
    const subscriptionTier =
      grokQuota.subscriptionTierFromJWT(accessToken) ||
      grokQuota.normalizeSubscriptionTier(options.subscriptionTier) ||
      ''
    const accountData = {
      id: accountId,
      platform: 'grok',
      name,
      description,
      authType,
      customUpstream: customUpstream ? 'true' : 'false',
      baseUrl,
      apiKey: this._encrypt(apiKey),
      accessToken: this._encrypt(accessToken),
      refreshToken: this._encrypt(refreshToken),
      tokenType,
      expiresAt,
      email: this._encrypt(email),
      userAgent,
      priority: String(priority),
      proxy: options.proxy ? JSON.stringify(options.proxy) : '',
      isActive: isActive ? 'true' : 'false',
      accountType,
      schedulable: schedulable ? 'true' : 'false',
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,
      subscriptionTier,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: '',
      lastRefreshAt: accessToken || apiKey ? now : '',
      status: 'active',
      errorMessage: '',
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitDuration: String(rateLimitDuration),
      dailyQuota: String(dailyQuota),
      dailyUsage: '0',
      lastResetDate: redis.getDateStringInTimezone(),
      quotaResetTime,
      quotaStoppedAt: '',
      disableAutoProtection: disableAutoProtection ? 'true' : 'false'
    }

    await this._saveAccount(accountId, accountData)
    logger.success(`Created Grok account: ${name} (${accountId}) [${authType}]`)

    return this._sanitizeAccount(accountData, { includeSecrets: false })
  }

  async getAccount(accountId, { includeSecrets = true } = {}) {
    const client = redis.getClientSafe()
    const accountData = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
    if (!accountData || !accountData.id) {
      return null
    }

    accountData.apiKey = this._decrypt(accountData.apiKey)
    accountData.accessToken = this._decrypt(accountData.accessToken)
    accountData.refreshToken = this._decrypt(accountData.refreshToken)
    accountData.email = this._decrypt(accountData.email)

    if (accountData.proxy) {
      try {
        accountData.proxy = JSON.parse(accountData.proxy)
      } catch {
        accountData.proxy = null
      }
    }

    accountData.authType = this._normalizeAuthType(accountData.authType)
    accountData.customUpstream = isTruthy(accountData.customUpstream)
    accountData.platform = accountData.platform || 'grok'
    await this._hydrateSubscriptionTier(accountData)

    if (!includeSecrets) {
      return this._sanitizeAccount(accountData, { includeSecrets: false })
    }
    return accountData
  }

  async getAllAccounts(includeInactive = false) {
    const client = redis.getClientSafe()
    const accountIds = await redis.getAllIdsByIndex(
      this.INDEX_KEY,
      `${this.ACCOUNT_KEY_PREFIX}*`,
      /^grok_account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const pipeline = client.pipeline()
    accountIds.forEach((id) => pipeline.hgetall(`${this.ACCOUNT_KEY_PREFIX}${id}`))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData]) => {
      if (err || !accountData || !accountData.id) {
        return
      }
      if (!includeInactive && accountData.isActive !== 'true') {
        return
      }

      if (accountData.proxy) {
        try {
          accountData.proxy = JSON.parse(accountData.proxy)
        } catch {
          accountData.proxy = null
        }
      }

      accountData.accessToken = this._decrypt(accountData.accessToken)
      this._hydrateSubscriptionTier(accountData, { persist: true }).catch(() => {})

      const sanitized = this._sanitizeAccount(accountData, { includeSecrets: false })
      const rateLimitInfo = this._getRateLimitInfo(accountData)
      sanitized.rateLimitStatus = rateLimitInfo.isRateLimited
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
      sanitized.schedulable = accountData.schedulable !== 'false'
      sanitized.isActive = accountData.isActive === 'true'
      sanitized.expiresAt = accountData.subscriptionExpiresAt || accountData.expiresAt || null
      sanitized.platform = 'grok'
      sanitized.subscriptionTier = grokQuota.normalizeSubscriptionTier(accountData.subscriptionTier)
      sanitized.grokUsage = grokQuota.buildGrokUsageSnapshot(accountData)
      accounts.push(sanitized)
    })

    return accounts
  }

  async getSchedulableAccounts() {
    const accounts = await this.getAllAccounts(false)
    const ready = []
    for (const account of accounts) {
      if (!isTruthy(account.isActive) || !isTruthy(account.schedulable)) {
        continue
      }
      if (['error', 'unauthorized', 'blocked'].includes(account.status)) {
        continue
      }
      if (this.isSubscriptionExpired(account)) {
        continue
      }
      const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(account.id, 'grok')
      if (isTempUnavailable) {
        continue
      }
      ready.push(account)
    }
    return ready
  }

  async updateAccount(accountId, updates) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const sanitized = { ...updates }
    if (sanitized.authType) {
      sanitized.authType = this._normalizeAuthType(sanitized.authType)
    }
    if (sanitized.priority !== undefined) {
      sanitized.priority = String(this._normalizePriority(sanitized.priority))
    }
    if (sanitized.apiKey) {
      sanitized.apiKey = this._encrypt(sanitized.apiKey)
    }
    if (sanitized.accessToken) {
      sanitized.accessToken = this._encrypt(sanitized.accessToken)
    }
    if (sanitized.refreshToken) {
      sanitized.refreshToken = this._encrypt(sanitized.refreshToken)
    }
    if (sanitized.email) {
      sanitized.email = this._encrypt(sanitized.email)
    }
    if (sanitized.proxy !== undefined) {
      sanitized.proxy = sanitized.proxy ? JSON.stringify(sanitized.proxy) : ''
    }
    if (sanitized.customUpstream !== undefined) {
      sanitized.customUpstream = this._toStoredBool(sanitized.customUpstream, false)
    }
    if (sanitized.isActive !== undefined) {
      sanitized.isActive = this._toStoredBool(sanitized.isActive, true)
    }
    if (sanitized.schedulable !== undefined) {
      sanitized.schedulable = this._toStoredBool(sanitized.schedulable, true)
    }
    if (sanitized.disableAutoProtection !== undefined) {
      sanitized.disableAutoProtection = this._toStoredBool(sanitized.disableAutoProtection, false)
    }
    if (sanitized.dailyQuota !== undefined) {
      sanitized.dailyQuota = String(sanitized.dailyQuota)
    }
    if (sanitized.rateLimitDuration !== undefined) {
      sanitized.rateLimitDuration = String(sanitized.rateLimitDuration)
    }

    const nextAuthType = sanitized.authType || account.authType
    const nextCustomUpstream =
      sanitized.customUpstream !== undefined
        ? isTruthy(sanitized.customUpstream)
        : isTruthy(account.customUpstream)
    if (sanitized.baseUrl || sanitized.authType || sanitized.customUpstream !== undefined) {
      sanitized.baseUrl = this._resolveStoredBaseUrl({
        authType: nextAuthType,
        baseUrl: sanitized.baseUrl || account.baseUrl,
        customUpstream: nextCustomUpstream
      })
    }

    sanitized.updatedAt = new Date().toISOString()

    const client = redis.getClientSafe()
    await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, sanitized)

    if (sanitized.accountType === 'shared') {
      await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId)
    } else if (sanitized.accountType && sanitized.accountType !== 'shared') {
      await client.srem(this.SHARED_ACCOUNTS_KEY, accountId)
    }

    logger.info(`📝 Updated Grok account: ${account.name}`)
    return { success: true }
  }

  async deleteAccount(accountId) {
    const client = redis.getClientSafe()
    await client.srem(this.SHARED_ACCOUNTS_KEY, accountId)
    await redis.removeFromIndex(this.INDEX_KEY, accountId)
    await client.del(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
    logger.info(`🗑️ Deleted Grok account: ${accountId}`)
    return { success: true }
  }

  async refreshAccountToken(accountId) {
    let lockAcquired = false
    let account = null

    try {
      account = await this.getAccount(accountId)
      if (!account) {
        throw new Error('Account not found')
      }
      if (account.authType !== grokHelper.AUTH_TYPES.OAUTH) {
        throw new Error('Only Grok OAuth accounts can refresh tokens')
      }
      if (!account.refreshToken) {
        logRefreshSkipped(accountId, account.name, 'grok', 'No refresh token available')
        throw new Error('No refresh token available')
      }

      lockAcquired = await tokenRefreshService.acquireRefreshLock(accountId, 'grok')
      if (!lockAcquired) {
        logRefreshSkipped(accountId, account.name, 'grok', 'already_locked')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const updated = await this.getAccount(accountId)
        if (updated && !grokHelper.isTokenExpired(updated)) {
          return {
            accessToken: updated.accessToken,
            refreshToken: updated.refreshToken,
            expiresAt: updated.expiresAt
          }
        }
        throw new Error('Token refresh in progress by another process')
      }

      logRefreshStart(accountId, account.name, 'grok')
      const tokens = await grokHelper.refreshAccessToken(account.refreshToken, account.proxy)
      const subscriptionTier = grokQuota.subscriptionTierFromJWT(tokens.accessToken)
      const updates = {
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        tokenType: tokens.tokenType,
        lastRefreshAt: new Date().toISOString(),
        status: 'active',
        errorMessage: ''
      }
      if (subscriptionTier) {
        updates.subscriptionTier = subscriptionTier
      }
      if (tokens.refreshToken && tokens.refreshToken !== account.refreshToken) {
        updates.refreshToken = tokens.refreshToken
      }
      await this.updateAccount(accountId, updates)
      logRefreshSuccess(accountId, account.name, 'grok', tokens)
      return tokens
    } catch (error) {
      logRefreshError(accountId, account?.name || accountId, 'grok', error.message)
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: account?.name || accountId,
          platform: 'grok',
          status: 'error',
          errorCode: 'GROK_TOKEN_REFRESH_FAILED',
          reason: `Token refresh failed: ${error.message}`,
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.error('Failed to send Grok token refresh webhook:', webhookError)
      }
      throw error
    } finally {
      if (lockAcquired) {
        await tokenRefreshService.releaseRefreshLock(accountId, 'grok')
      }
    }
  }

  async ensureFreshAccessToken(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }
    if (account.authType !== grokHelper.AUTH_TYPES.OAUTH) {
      return account
    }
    if (!grokHelper.isTokenExpired(account) && account.accessToken) {
      return account
    }
    if (!account.refreshToken) {
      throw new Error('Grok OAuth access token expired and no refresh token is available')
    }
    await this.refreshAccountToken(accountId)
    return this.getAccount(accountId)
  }

  async markAccountRateLimited(accountId, duration = null) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return
    }
    if (isTruthy(account.disableAutoProtection)) {
      upstreamErrorHelper.recordErrorHistory(accountId, 'grok', 429, 'rate_limit').catch(() => {})
      return
    }

    const rateLimitDuration = duration || parseInt(account.rateLimitDuration) || 60
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

  async checkAndClearRateLimit(accountId) {
    const account = await this.getAccount(accountId)
    if (!account || account.rateLimitStatus !== 'limited') {
      return false
    }

    const now = new Date()
    let shouldClear = false
    if (account.rateLimitResetAt) {
      shouldClear = now >= new Date(account.rateLimitResetAt)
    } else if (account.rateLimitedAt) {
      const duration = parseInt(account.rateLimitDuration) || 60
      shouldClear = now - new Date(account.rateLimitedAt) > duration * 60000
    }

    if (shouldClear) {
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
    return false
  }

  async toggleSchedulable(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }
    const next = isTruthy(account.schedulable) ? 'false' : 'true'
    await this.updateAccount(accountId, { schedulable: next })
    return { success: true, schedulable: next === 'true' }
  }

  async resetAccountStatus(accountId) {
    const account = await this.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }
    await this.updateAccount(accountId, {
      status: 'active',
      schedulable: 'true',
      errorMessage: '',
      rateLimitedAt: '',
      rateLimitStatus: '',
      rateLimitResetAt: '',
      rateLimitDuration: ''
    })
    await upstreamErrorHelper.clearTempUnavailable(accountId, 'grok').catch(() => {})
    return { success: true, message: 'Account status reset successfully' }
  }

  async touchLastUsedAt(accountId) {
    if (!accountId) {
      return
    }
    try {
      const client = redis.getClientSafe()
      await client.hset(
        `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
        'lastUsedAt',
        new Date().toISOString()
      )
    } catch (error) {
      logger.warn(`⚠️ Failed to update lastUsedAt for Grok account ${accountId}:`, error)
    }
  }

  async _hydrateSubscriptionTier(accountData, { persist = true } = {}) {
    if (!accountData?.id || grokQuota.normalizeSubscriptionTier(accountData.subscriptionTier)) {
      return accountData
    }
    const token = accountData.accessToken
    if (!token) {
      return accountData
    }
    const tier = grokQuota.subscriptionTierFromJWT(token)
    if (!tier) {
      return accountData
    }
    accountData.subscriptionTier = tier
    if (persist) {
      try {
        const client = redis.getClientSafe()
        await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountData.id}`, 'subscriptionTier', tier)
      } catch (error) {
        logger.debug(
          `Failed to persist Grok subscription tier for ${accountData.id}: ${error.message}`
        )
      }
    }
    return accountData
  }

  async recordQuotaObservation(accountId, headers, { statusCode = 0, model = '' } = {}) {
    const account = await this.getAccount(accountId)
    if (!account) {
      return null
    }
    const next = grokQuota.parseQuotaHeaders(headers, { statusCode, model })
    if (!next) {
      return grokQuota.buildGrokUsageSnapshot(account)
    }
    const previous = grokQuota.parseStoredSnapshot(account.grokQuotaSnapshot)
    const merged = grokQuota.mergeQuotaSnapshots(previous, next)
    const subscriptionTier = grokQuota.canonicalPlan({
      subscriptionTier: account.subscriptionTier,
      snapshot: merged
    })
    const updates = {
      grokQuotaSnapshot: JSON.stringify(merged)
    }
    if (subscriptionTier) {
      updates.subscriptionTier = subscriptionTier
    }
    await this.updateAccount(accountId, updates)
    return grokQuota.buildGrokUsageSnapshot({
      ...account,
      ...updates,
      grokQuotaSnapshot: updates.grokQuotaSnapshot
    })
  }

  isSubscriptionExpired(account) {
    if (!account?.subscriptionExpiresAt) {
      return false
    }
    const expiryDate = new Date(account.subscriptionExpiresAt)
    return !Number.isNaN(expiryDate.getTime()) && expiryDate <= new Date()
  }

  _getRateLimitInfo(accountData) {
    if (accountData.rateLimitStatus !== 'limited') {
      return { isRateLimited: false }
    }
    const now = new Date()
    let remainingMinutes = 0
    if (accountData.rateLimitResetAt) {
      remainingMinutes = Math.max(
        0,
        Math.ceil((new Date(accountData.rateLimitResetAt) - now) / 60000)
      )
    } else if (accountData.rateLimitedAt) {
      const duration = parseInt(accountData.rateLimitDuration) || 60
      const elapsed = Math.floor((now - new Date(accountData.rateLimitedAt)) / 60000)
      remainingMinutes = Math.max(0, duration - elapsed)
    }
    return { isRateLimited: remainingMinutes > 0, remainingMinutes }
  }

  _sanitizeAccount(accountData, { includeSecrets = false } = {}) {
    const authType = this._normalizeAuthType(accountData.authType)
    return {
      ...accountData,
      authType,
      customUpstream: isTruthy(accountData.customUpstream),
      apiKey: includeSecrets ? accountData.apiKey : accountData.apiKey ? '***' : '',
      accessToken: includeSecrets ? accountData.accessToken : accountData.accessToken ? '***' : '',
      refreshToken: includeSecrets
        ? accountData.refreshToken
        : accountData.refreshToken
          ? '***'
          : '',
      email: includeSecrets ? accountData.email : accountData.email ? '***' : '',
      platform: 'grok',
      subscriptionTier: grokQuota.normalizeSubscriptionTier(accountData.subscriptionTier),
      grokUsage: grokQuota.buildGrokUsageSnapshot(accountData)
    }
  }

  async _saveAccount(accountId, accountData) {
    const client = redis.getClientSafe()
    await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, accountData)
    await redis.addToIndex(this.INDEX_KEY, accountId)
    if (accountData.accountType === 'shared') {
      await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId)
    }
  }
}

module.exports = new GrokAccountService()
