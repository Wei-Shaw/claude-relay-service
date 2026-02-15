const redis = require('../../models/redis')
const balanceScriptService = require('../balanceScriptService')
const logger = require('../../utils/logger')
const CostCalculator = require('../../utils/costCalculator')
const { isBalanceScriptEnabled } = require('../../utils/featureFlags')

class AccountBalanceService {
  constructor(options = {}) {
    this.redis = options.redis || redis
    this.logger = options.logger || logger

    this.providers = new Map()

    this.CACHE_TTL_SECONDS = 3600
    this.LOCAL_TTL_SECONDS = 300

    this.LOW_BALANCE_THRESHOLD = 10
    this.HIGH_USAGE_THRESHOLD_PERCENT = 90
    this.DEFAULT_CONCURRENCY = 10
  }

  getSupportedPlatforms() {
    return [
      'claude',
      'claude-console',
      'gemini',
      'gemini-api',
      'openai',
      'openai-responses',
      'azure_openai',
      'bedrock',
      'droid',
      'ccr'
    ]
  }

  normalizePlatform(platform) {
    if (!platform) {
      return null
    }

    const value = String(platform).trim().toLowerCase()

    // 兼容实施文档与历史命名
    if (value === 'claude-official') {
      return 'claude'
    }
    if (value === 'azure-openai') {
      return 'azure_openai'
    }

    // 保持前端平台键一致
    return value
  }

  registerProvider(platform, provider) {
    const normalized = this.normalizePlatform(platform)
    if (!normalized) {
      throw new Error('registerProvider: 缺少 platform')
    }
    if (!provider || typeof provider.queryBalance !== 'function') {
      throw new Error(`registerProvider: Provider 无效 (${normalized})`)
    }
    this.providers.set(normalized, provider)
  }

  async getAccountBalance(accountId, platform, options = {}) {
    const normalizedPlatform = this.normalizePlatform(platform)
    const account = await this.getAccount(accountId, normalizedPlatform)
    if (!account) {
      return null
    }
    return await this._getAccountBalanceForAccount(account, normalizedPlatform, options)
  }

  async refreshAccountBalance(accountId, platform) {
    const normalizedPlatform = this.normalizePlatform(platform)
    const account = await this.getAccount(accountId, normalizedPlatform)
    if (!account) {
      return null
    }

    return await this._getAccountBalanceForAccount(account, normalizedPlatform, {
      queryApi: true,
      useCache: false
    })
  }

  async getAllAccountsBalance(platform, options = {}) {
    const normalizedPlatform = this.normalizePlatform(platform)
    const accounts = await this.getAllAccountsByPlatform(normalizedPlatform)
    const queryApi = this._parseBoolean(options.queryApi) || false
    const useCache = options.useCache !== false

    const results = await this._mapWithConcurrency(
      accounts,
      this.DEFAULT_CONCURRENCY,
      async (acc) => {
        try {
          const balance = await this._getAccountBalanceForAccount(acc, normalizedPlatform, {
            queryApi,
            useCache
          })
          return { ...balance, name: acc.name || '' }
        } catch (error) {
          this.logger.error(`批量获取余额失败: ${normalizedPlatform}:${acc?.id}`, error)
          return {
            success: true,
            data: {
              accountId: acc?.id,
              platform: normalizedPlatform,
              balance: null,
              quota: null,
              statistics: {},
              source: 'local',
              lastRefreshAt: new Date().toISOString(),
              cacheExpiresAt: null,
              status: 'error',
              error: error.message || '批量查询失败'
            },
            name: acc?.name || ''
          }
        }
      }
    )

    return results
  }

  async getBalanceSummary() {
    const platforms = this.getSupportedPlatforms()

    const summary = {
      totalBalance: 0,
      totalCost: 0,
      lowBalanceCount: 0,
      platforms: {}
    }

    for (const platform of platforms) {
      const accounts = await this.getAllAccountsByPlatform(platform)
      const platformData = {
        count: accounts.length,
        totalBalance: 0,
        totalCost: 0,
        lowBalanceCount: 0,
        accounts: []
      }

      const balances = await this._mapWithConcurrency(
        accounts,
        this.DEFAULT_CONCURRENCY,
        async (acc) => {
          const balance = await this._getAccountBalanceForAccount(acc, platform, {
            queryApi: false,
            useCache: true
          })
          return { ...balance, name: acc.name || '' }
        }
      )

      for (const item of balances) {
        platformData.accounts.push(item)

        const amount = item?.data?.balance?.amount
        const percentage = item?.data?.quota?.percentage
        const totalCost = Number(item?.data?.statistics?.totalCost || 0)

        const hasAmount = typeof amount === 'number' && Number.isFinite(amount)
        const isLowBalance = hasAmount && amount < this.LOW_BALANCE_THRESHOLD
        const isHighUsage =
          typeof percentage === 'number' &&
          Number.isFinite(percentage) &&
          percentage > this.HIGH_USAGE_THRESHOLD_PERCENT

        if (hasAmount) {
          platformData.totalBalance += amount
        }

        if (isLowBalance || isHighUsage) {
          platformData.lowBalanceCount += 1
          summary.lowBalanceCount += 1
        }

        platformData.totalCost += totalCost
      }

      summary.platforms[platform] = platformData
      summary.totalBalance += platformData.totalBalance
      summary.totalCost += platformData.totalCost
    }

    return summary
  }

  async clearCache(accountId, platform) {
    const normalizedPlatform = this.normalizePlatform(platform)
    if (!normalizedPlatform) {
      throw new Error('缺少 platform 参数')
    }

    await this.redis.deleteAccountBalance(normalizedPlatform, accountId)
    this.logger.info(`余额缓存已清除: ${normalizedPlatform}:${accountId}`)
  }

  async getAccount(accountId, platform) {
    if (!accountId || !platform) {
      return null
    }

    const serviceMap = {
      claude: require('./claudeAccountService'),
      'claude-console': require('./claudeConsoleAccountService'),
      gemini: require('./geminiAccountService'),
      'gemini-api': require('./geminiApiAccountService'),
      openai: require('./openaiAccountService'),
      'openai-responses': require('./openaiResponsesAccountService'),
      azure_openai: require('./azureOpenaiAccountService'),
      bedrock: require('./bedrockAccountService'),
      droid: require('./droidAccountService'),
      ccr: require('./ccrAccountService')
    }

    const service = serviceMap[platform]
    if (!service || typeof service.getAccount !== 'function') {
      return null
    }

    const result = await service.getAccount(accountId)

    // 处理不同服务返回格式的差异
    // Bedrock/CCR/Droid 等服务返回 { success, data } 格式
    if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
      return result.success ? result.data : null
    }

    return result
  }

  async getAllAccountsByPlatform(platform) {
    if (!platform) {
      return []
    }

    const serviceMap = {
      claude: require('./claudeAccountService'),
      'claude-console': require('./claudeConsoleAccountService'),
      gemini: require('./geminiAccountService'),
      'gemini-api': require('./geminiApiAccountService'),
      openai: require('./openaiAccountService'),
      'openai-responses': require('./openaiResponsesAccountService'),
      azure_openai: require('./azureOpenaiAccountService'),
      bedrock: require('./bedrockAccountService'),
      droid: require('./droidAccountService'),
      ccr: require('./ccrAccountService')
    }

    const service = serviceMap[platform]
    if (!service) {
      return []
    }

    // Bedrock 特殊：返回 { success, data }
    if (platform === 'bedrock' && typeof service.getAllAccounts === 'function') {
      const result = await service.getAllAccounts()
      return result?.success ? result.data || [] : []
    }

    if (platform === 'openai-responses') {
      return await service.getAllAccounts(true)
    }

    if (typeof service.getAllAccounts !== 'function') {
      return []
    }

    return await service.getAllAccounts()
  }

  async _getAccountBalanceForAccount(account, platform, options = {}) {
    const queryMode = this._parseQueryMode(options.queryApi)
    const useCache = options.useCache !== false

    const accountId = account?.id
    if (!accountId) {
      // 如果账户缺少 id，返回空响应而不是抛出错误，避免接口报错和UI错误
      this.logger.warn('账户缺少 id，返回空余额数据', { account, platform })
      return this._buildResponse(
        {
          status: 'error',
          errorMessage: '账户数据异常',
          balance: null,
          currency: 'USD',
          quota: null,
          statistics: {},
          lastRefreshAt: new Date().toISOString()
        },
        'unknown',
        platform,
        'local',
        null,
        { scriptEnabled: false, scriptConfigured: false }
      )
    }

    // 余额脚本配置状态（用于前端控制"刷新余额"按钮）
    let scriptConfig = null
    let scriptConfigured = false
    if (typeof this.redis?.getBalanceScriptConfig === 'function') {
      scriptConfig = await this.redis.getBalanceScriptConfig(platform, accountId)
      scriptConfigured = !!(
        scriptConfig &&
        scriptConfig.scriptBody &&
        String(scriptConfig.scriptBody).trim().length > 0
      )
    }
    const scriptEnabled = isBalanceScriptEnabled()
    const scriptMeta = { scriptEnabled, scriptConfigured }

    const localBalance = await this._getBalanceFromLocal(accountId, platform)
    const localStatistics = localBalance.statistics || {}

    const quotaFromLocal = this._buildQuotaFromLocal(account, localStatistics)

    // 安全限制：queryApi=auto 仅用于 Antigravity（gemini + oauthProvider=antigravity）账户
    const effectiveQueryMode =
      queryMode === 'auto' && !(platform === 'gemini' && account?.oauthProvider === 'antigravity')
        ? 'local'
        : queryMode

    // local: 仅本地统计/缓存；auto: 优先缓存，无缓存则尝试远程 Provider（并缓存结果）
    if (effectiveQueryMode !== 'api') {
      if (useCache) {
        const cached = await this.redis.getAccountBalance(platform, accountId)
        if (cached && cached.status === 'success') {
          return this._buildResponse(
            {
              status: cached.status,
              errorMessage: cached.errorMessage,
              balance: quotaFromLocal.balance ?? cached.balance,
              currency: quotaFromLocal.currency || cached.currency || 'USD',
              quota: quotaFromLocal.quota || cached.quota || null,
              statistics: localStatistics,
              lastRefreshAt: cached.lastRefreshAt
            },
            accountId,
            platform,
            'cache',
            cached.ttlSeconds,
            scriptMeta
          )
        }
      }

      if (effectiveQueryMode === 'local') {
        return this._buildResponse(
          {
            status: 'success',
            errorMessage: null,
            balance: quotaFromLocal.balance,
            currency: quotaFromLocal.currency || 'USD',
            quota: quotaFromLocal.quota,
            statistics: localStatistics,
            lastRefreshAt: localBalance.lastCalculated
          },
          accountId,
          platform,
          'local',
          null,
          scriptMeta
        )
      }
    }

    // 强制查询：优先脚本（如启用且已配置），否则调用 Provider；失败自动降级到本地统计
    let providerResult

    if (scriptEnabled && scriptConfigured) {
      providerResult = await this._getBalanceFromScript(scriptConfig, accountId, platform)
    } else {
      const provider = this.providers.get(platform)
      if (!provider) {
        return this._buildResponse(
          {
            status: 'error',
            errorMessage: `不支持的平台: ${platform}`,
            balance: quotaFromLocal.balance,
            currency: quotaFromLocal.currency || 'USD',
            quota: quotaFromLocal.quota,
            statistics: localStatistics,
            lastRefreshAt: new Date().toISOString()
          },
          accountId,
          platform,
          'local',
          null,
          scriptMeta
        )
      }
      providerResult = await this._getBalanceFromProvider(provider, account)
    }

    const isRemoteSuccess =
      providerResult.status === 'success' && ['api', 'script'].includes(providerResult.queryMethod)

    // 仅缓存“真实远程查询成功”的结果，避免把字段/本地降级结果当作 API 结果缓存 1h
    if (isRemoteSuccess) {
      await this.redis.setAccountBalance(
        platform,
        accountId,
        providerResult,
        this.CACHE_TTL_SECONDS
      )
    }

    const source = isRemoteSuccess ? 'api' : 'local'

    return this._buildResponse(
      {
        status: providerResult.status,
        errorMessage: providerResult.errorMessage,
        balance: quotaFromLocal.balance ?? providerResult.balance,
        currency: quotaFromLocal.currency || providerResult.currency || 'USD',
        quota: quotaFromLocal.quota || providerResult.quota || null,
        statistics: localStatistics,
        lastRefreshAt: providerResult.lastRefreshAt
      },
      accountId,
      platform,
      source,
      null,
      scriptMeta
    )
  }

  async _getBalanceFromScript(scriptConfig, accountId, platform) {
    try {
      const result = await balanceScriptService.execute({
        scriptBody: scriptConfig.scriptBody,
        timeoutSeconds: scriptConfig.timeoutSeconds || 10,
        variables: {
          baseUrl: scriptConfig.baseUrl || '',
          apiKey: scriptConfig.apiKey || '',
          token: scriptConfig.token || '',
          accountId,
          platform,
          extra: scriptConfig.extra || ''
        }
      })

      const mapped = result?.mapped || {}
      return {
        status: mapped.status || 'error',
        balance: typeof mapped.balance === 'number' ? mapped.balance : null,
        currency: mapped.currency || 'USD',
        quota: mapped.quota || null,
        queryMethod: 'api',
        rawData: mapped.rawData || result?.response?.data || null,
        lastRefreshAt: new Date().toISOString(),
        errorMessage: mapped.errorMessage || ''
      }
    } catch (error) {
      return {
        status: 'error',
        balance: null,
        currency: 'USD',
        quota: null,
        queryMethod: 'api',
        rawData: null,
        lastRefreshAt: new Date().toISOString(),
        errorMessage: error.message || '脚本执行失败'
      }
    }
  }

  async _getBalanceFromProvider(provider, account) {
    try {
      const result = await provider.queryBalance(account)
      return {
        status: 'success',
        balance: typeof result?.balance === 'number' ? result.balance : null,
        currency: result?.currency || 'USD',
        quota: result?.quota || null,
        queryMethod: result?.queryMethod || 'api',
        rawData: result?.rawData || null,
        lastRefreshAt: new Date().toISOString(),
        errorMessage: ''
      }
    } catch (error) {
      return {
        status: 'error',
        balance: null,
        currency: 'USD',
        quota: null,
        queryMethod: 'api',
        rawData: null,
        lastRefreshAt: new Date().toISOString(),
        errorMessage: error.message || '查询失败'
      }
    }
  }

  async _getBalanceFromLocal(accountId, platform) {
    const cached = await this.redis.getLocalBalance(platform, accountId)
    if (cached && cached.statistics) {
      return cached
    }

    const statistics = await this._computeLocalStatistics(accountId)
    const localBalance = {
      status: 'success',
      balance: null,
      currency: 'USD',
      statistics,
      queryMethod: 'local',
      lastCalculated: new Date().toISOString()
    }

    await this.redis.setLocalBalance(platform, accountId, localBalance, this.LOCAL_TTL_SECONDS)
    return localBalance
  }

  async _computeLocalStatistics(accountId) {
    const safeNumber = (value) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : 0
    }

    try {
      const usageStats = await this.redis.getAccountUsageStats(accountId)
      const dailyCost = safeNumber(usageStats?.daily?.cost || 0)
      const monthlyCost = await this._computeMonthlyCost(accountId)
      const totalCost = await this._computeTotalCost(accountId)

      return {
        totalCost,
        dailyCost,
        monthlyCost,
        totalRequests: safeNumber(usageStats?.total?.requests || 0),
        dailyRequests: safeNumber(usageStats?.daily?.requests || 0),
        monthlyRequests: safeNumber(usageStats?.monthly?.requests || 0)
      }
    } catch (error) {
      this.logger.debug(`本地统计计算失败: ${accountId}`, error)
      return {
        totalCost: 0,
        dailyCost: 0,
        monthlyCost: 0,
        totalRequests: 0,
        dailyRequests: 0,
        monthlyRequests: 0
      }
    }
  }

  async _computeMonthlyCost(accountId) {
    const tzDate = this.redis.getDateInTimezone(new Date())
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`

    const pattern = `account_usage:model:monthly:${accountId}:*:${currentMonth}`
    return await this._sumModelCostsByKeysPattern(pattern)
  }

  async _computeTotalCost(accountId) {
    const pattern = `account_usage:model:monthly:${accountId}:*:*`
    return await this._sumModelCostsByKeysPattern(pattern)
  }

  async _sumModelCostsByKeysPattern(pattern) {
    try {
      const client = this.redis.getClientSafe()
      let totalCost = 0
      let cursor = '0'
      const scanCount = 200
      let iterations = 0
      const maxIterations = 2000

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', scanCount)
        cursor = nextCursor
        iterations += 1

        if (!keys || keys.length === 0) {
          continue
        }

        const pipeline = client.pipeline()
        keys.forEach((key) => pipeline.hgetall(key))
        const results = await pipeline.exec()

        for (let i = 0; i < results.length; i += 1) {
          const [, data] = results[i] || []
          if (!data || Object.keys(data).length === 0) {
            continue
          }

          const parts = String(keys[i]).split(':')
          const model = parts[4] || 'unknown'

          const usage = {
            input_tokens: parseInt(data.inputTokens || 0),
            output_tokens: parseInt(data.outputTokens || 0),
            cache_creation_input_tokens: parseInt(data.cacheCreateTokens || 0),
            cache_read_input_tokens: parseInt(data.cacheReadTokens || 0)
          }

          const costResult = CostCalculator.calculateCost(usage, model)
          totalCost += costResult.costs.total || 0
        }

        if (iterations >= maxIterations) {
          this.logger.warn(`SCAN 次数超过上限，停止汇总：${pattern}`)
          break
        }
      } while (cursor !== '0')

      return totalCost
    } catch (error) {
      this.logger.debug(`汇总模型费用失败: ${pattern}`, error)
      return 0
    }
  }

  _buildQuotaFromLocal(account, statistics) {
    if (!account || !Object.prototype.hasOwnProperty.call(account, 'dailyQuota')) {
      return { balance: null, currency: null, quota: null }
    }

    const dailyQuota = Number(account.dailyQuota || 0)
    const used = Number(statistics?.dailyCost || 0)

    const resetAt = this._computeNextResetAt(account.quotaResetTime || '00:00')

    // 不限制
    if (!Number.isFinite(dailyQuota) || dailyQuota <= 0) {
      return {
        balance: null,
        currency: 'USD',
        quota: {
          daily: Infinity,
          used,
          remaining: Infinity,
          percentage: 0,
          unlimited: true,
          resetAt
        }
      }
    }

    const remaining = Math.max(0, dailyQuota - used)
    const percentage = dailyQuota > 0 ? (used / dailyQuota) * 100 : 0

    return {
      balance: remaining,
      currency: 'USD',
      quota: {
        daily: dailyQuota,
        used,
        remaining,
        resetAt,
        percentage: Math.round(percentage * 100) / 100
      }
    }
  }

  _computeNextResetAt(resetTime) {
    const now = new Date()
    const tzNow = this.redis.getDateInTimezone(now)
    const offsetMs = tzNow.getTime() - now.getTime()

    const [h, m] = String(resetTime || '00:00')
      .split(':')
      .map((n) => parseInt(n, 10))

    const resetHour = Number.isFinite(h) ? h : 0
    const resetMinute = Number.isFinite(m) ? m : 0

    const year = tzNow.getUTCFullYear()
    const month = tzNow.getUTCMonth()
    const day = tzNow.getUTCDate()

    let resetAtMs = Date.UTC(year, month, day, resetHour, resetMinute, 0, 0) - offsetMs
    if (resetAtMs <= now.getTime()) {
      resetAtMs += 24 * 60 * 60 * 1000
    }

    return new Date(resetAtMs).toISOString()
  }

  _buildResponse(balanceData, accountId, platform, source, ttlSeconds = null, extraData = {}) {
    const now = new Date()

    const amount = typeof balanceData.balance === 'number' ? balanceData.balance : null
    const currency = balanceData.currency || 'USD'

    let cacheExpiresAt = null
    if (source === 'cache') {
      const ttl =
        typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : this.CACHE_TTL_SECONDS
      cacheExpiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    }

    return {
      success: true,
      data: {
        accountId,
        platform,
        balance:
          typeof amount === 'number'
            ? {
                amount,
                currency,
                formattedAmount: this._formatCurrency(amount, currency)
              }
            : null,
        quota: balanceData.quota || null,
        statistics: balanceData.statistics || {},
        source,
        lastRefreshAt: balanceData.lastRefreshAt || now.toISOString(),
        cacheExpiresAt,
        status: balanceData.status || 'success',
        error: balanceData.errorMessage || null,
        ...(extraData && typeof extraData === 'object' ? extraData : {})
      }
    }
  }

  _formatCurrency(amount, currency = 'USD') {
    try {
      if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        return 'N/A'
      }
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
    } catch (error) {
      return `$${amount.toFixed(2)}`
    }
  }

  _parseBoolean(value) {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value !== 'string') {
      return null
    }
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false
    }
    return null
  }

  _parseQueryMode(value) {
    if (value === 'auto') {
      return 'auto'
    }
    const parsed = this._parseBoolean(value)
    return parsed ? 'api' : 'local'
  }

  async _mapWithConcurrency(items, limit, mapper) {
    const concurrency = Math.max(1, Number(limit) || 1)
    const list = Array.isArray(items) ? items : []

    const results = new Array(list.length)
    let nextIndex = 0

    const workers = new Array(Math.min(concurrency, list.length)).fill(null).map(async () => {
      while (nextIndex < list.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(list[currentIndex], currentIndex)
      }
    })

    await Promise.all(workers)
    return results
  }
}

const accountBalanceService = new AccountBalanceService()
module.exports = accountBalanceService
module.exports.AccountBalanceService = AccountBalanceService
