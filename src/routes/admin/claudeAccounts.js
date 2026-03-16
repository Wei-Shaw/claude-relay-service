/**
 * Admin Routes - Claude 官方账户管理
 * OAuth 方式授权的 Claude 账户
 */

const express = require('express')
const router = express.Router()

const claudeAccountService = require('../../services/account/claudeAccountService')
const claudeRelayService = require('../../services/relay/claudeRelayService')
const accountGroupService = require('../../services/accountGroupService')
const accountTestSchedulerService = require('../../services/accountTestSchedulerService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const oauthHelper = require('../../utils/oauthHelper')
const CostCalculator = require('../../utils/costCalculator')
const webhookNotifier = require('../../utils/webhookNotifier')
const {
  isEmptyValue,
  parseBooleanLike,
  normalizeOptionalNonNegativeInteger
} = require('../../utils/tempUnavailablePolicy')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

const TEMP_UNAVAILABLE_TTL_FIELDS = ['tempUnavailable503TtlSeconds', 'tempUnavailable5xxTtlSeconds']

const normalizeTempUnavailablePolicyPayload = (payload, options = {}) => {
  const { partial = false } = options
  const normalized = {}

  for (const field of TEMP_UNAVAILABLE_TTL_FIELDS) {
    if (partial && !Object.prototype.hasOwnProperty.call(payload, field)) {
      continue
    }

    const rawValue = payload[field]
    const parsedValue = normalizeOptionalNonNegativeInteger(rawValue)
    if (!isEmptyValue(rawValue) && parsedValue === null) {
      return { error: `${field} must be a non-negative integer` }
    }
    normalized[field] = parsedValue
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'disableTempUnavailable')) {
    normalized.disableTempUnavailable = parseBooleanLike(payload.disableTempUnavailable)
  }

  return { normalized }
}

// 生成OAuth授权URL
router.post('/claude-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body // 接收代理配置
    const oauthParams = await oauthHelper.generateOAuthParams()

    // 将codeVerifier和state临时存储到Redis，用于后续验证
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      codeVerifier: oauthParams.codeVerifier,
      state: oauthParams.state,
      codeChallenge: oauthParams.codeChallenge,
      proxy: proxy || null, // 存储代理配置
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    })

    logger.success('Generated OAuth authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: oauthParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL',
          '5. 在添加账户表单中粘贴完整的回调 URL 和授权码'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate OAuth URL:', error)
    return res.status(500).json({ error: 'Failed to generate OAuth URL', message: error.message })
  }
})

// 验证授权码并获取token
router.post('/claude-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body

    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }

    // 从Redis获取OAuth会话信息
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    // 统一处理授权码输入（可能是直接的code或完整的回调URL）
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode

    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }

    // 交换访问令牌
    const tokenData = await oauthHelper.exchangeCodeForTokens(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy // 传递代理配置
    )

    // 清理OAuth会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('🎉 Successfully exchanged authorization code for tokens')
    return res.json({
      success: true,
      data: {
        claudeAiOauth: tokenData
      }
    })
  } catch (error) {
    logger.error('❌ Failed to exchange authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      // 不记录完整的授权码，只记录长度和前几个字符
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange authorization code', message: error.message })
  }
})

// 生成Claude setup-token授权URL
router.post('/claude-accounts/generate-setup-token-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body // 接收代理配置
    const setupTokenParams = await oauthHelper.generateSetupTokenParams()

    // 将codeVerifier和state临时存储到Redis，用于后续验证
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      type: 'setup-token', // 标记为setup-token类型
      codeVerifier: setupTokenParams.codeVerifier,
      state: setupTokenParams.state,
      codeChallenge: setupTokenParams.codeChallenge,
      proxy: proxy || null, // 存储代理配置
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    })

    logger.success('Generated Setup Token authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: setupTokenParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Claude 账户并授权 Claude Code',
          '3. 完成授权后，从返回页面复制 Authorization Code',
          '4. 在添加账户表单中粘贴 Authorization Code'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Setup Token URL:', error)
    return res
      .status(500)
      .json({ error: 'Failed to generate Setup Token URL', message: error.message })
  }
})

// 验证setup-token授权码并获取token
router.post('/claude-accounts/exchange-setup-token-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body

    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }

    // 从Redis获取OAuth会话信息
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    // 检查是否是setup-token类型
    if (oauthSession.type !== 'setup-token') {
      return res.status(400).json({ error: 'Invalid session type for setup token exchange' })
    }

    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    // 统一处理授权码输入（可能是直接的code或完整的回调URL）
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode

    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }

    // 交换Setup Token
    const tokenData = await oauthHelper.exchangeSetupTokenCode(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy // 传递代理配置
    )

    // 清理OAuth会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('🎉 Successfully exchanged setup token authorization code for tokens')
    return res.json({
      success: true,
      data: {
        claudeAiOauth: tokenData
      }
    })
  } catch (error) {
    logger.error('❌ Failed to exchange setup token authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      // 不记录完整的授权码，只记录长度和前几个字符
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange setup token authorization code', message: error.message })
  }
})

// =============================================================================
// Cookie自动授权端点 (基于sessionKey自动完成OAuth流程)
// =============================================================================

// 普通OAuth的Cookie自动授权
router.post('/claude-accounts/oauth-with-cookie', authenticateAdmin, async (req, res) => {
  try {
    const { sessionKey, proxy } = req.body

    // 验证sessionKey参数
    if (!sessionKey || typeof sessionKey !== 'string' || sessionKey.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionKey不能为空',
        message: '请提供有效的sessionKey值'
      })
    }

    const trimmedSessionKey = sessionKey.trim()

    logger.info('🍪 Starting Cookie-based OAuth authorization', {
      sessionKeyLength: trimmedSessionKey.length,
      sessionKeyPrefix: `${trimmedSessionKey.substring(0, 10)}...`,
      hasProxy: !!proxy
    })

    // 执行Cookie自动授权流程
    const result = await oauthHelper.oauthWithCookie(trimmedSessionKey, proxy, false)

    logger.success('🎉 Cookie-based OAuth authorization completed successfully')

    return res.json({
      success: true,
      data: {
        claudeAiOauth: result.claudeAiOauth,
        organizationUuid: result.organizationUuid,
        capabilities: result.capabilities
      }
    })
  } catch (error) {
    logger.error('❌ Cookie-based OAuth authorization failed:', {
      error: error.message,
      sessionKeyLength: req.body.sessionKey ? req.body.sessionKey.length : 0
    })

    return res.status(500).json({
      success: false,
      error: 'Cookie授权失败',
      message: error.message
    })
  }
})

// Setup Token的Cookie自动授权
router.post('/claude-accounts/setup-token-with-cookie', authenticateAdmin, async (req, res) => {
  try {
    const { sessionKey, proxy } = req.body

    // 验证sessionKey参数
    if (!sessionKey || typeof sessionKey !== 'string' || sessionKey.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionKey不能为空',
        message: '请提供有效的sessionKey值'
      })
    }

    const trimmedSessionKey = sessionKey.trim()

    logger.info('🍪 Starting Cookie-based Setup Token authorization', {
      sessionKeyLength: trimmedSessionKey.length,
      sessionKeyPrefix: `${trimmedSessionKey.substring(0, 10)}...`,
      hasProxy: !!proxy
    })

    // 执行Cookie自动授权流程（Setup Token模式）
    const result = await oauthHelper.oauthWithCookie(trimmedSessionKey, proxy, true)

    logger.success('🎉 Cookie-based Setup Token authorization completed successfully')

    return res.json({
      success: true,
      data: {
        claudeAiOauth: result.claudeAiOauth,
        organizationUuid: result.organizationUuid,
        capabilities: result.capabilities
      }
    })
  } catch (error) {
    logger.error('❌ Cookie-based Setup Token authorization failed:', {
      error: error.message,
      sessionKeyLength: req.body.sessionKey ? req.body.sessionKey.length : 0
    })

    return res.status(500).json({
      success: false,
      error: 'Cookie授权失败',
      message: error.message
    })
  }
})

// 获取所有Claude账户
router.get('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await claudeAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'claude') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          // 获取会话窗口使用统计（仅对有活跃窗口的账户）
          let sessionWindowUsage = null
          if (account.sessionWindow && account.sessionWindow.hasActiveWindow) {
            const windowUsage = await redis.getAccountSessionWindowUsage(
              account.id,
              account.sessionWindow.windowStart,
              account.sessionWindow.windowEnd
            )

            // 计算会话窗口的总费用
            let totalCost = 0
            const modelCosts = {}

            for (const [modelName, usage] of Object.entries(windowUsage.modelUsage)) {
              const usageData = {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                cache_creation_input_tokens: usage.cacheCreateTokens,
                cache_read_input_tokens: usage.cacheReadTokens
              }

              // 添加 cache_creation 子对象以支持精确 ephemeral 定价
              if (usage.ephemeral5mTokens > 0 || usage.ephemeral1hTokens > 0) {
                usageData.cache_creation = {
                  ephemeral_5m_input_tokens: usage.ephemeral5mTokens,
                  ephemeral_1h_input_tokens: usage.ephemeral1hTokens
                }
              }

              logger.debug(`💰 Calculating cost for model ${modelName}:`, JSON.stringify(usageData))
              const costResult = CostCalculator.calculateCost(usageData, modelName)
              logger.debug(`💰 Cost result for ${modelName}: total=${costResult.costs.total}`)

              modelCosts[modelName] = {
                ...usage,
                cost: costResult.costs.total
              }
              totalCost += costResult.costs.total
            }

            sessionWindowUsage = {
              totalTokens: windowUsage.totalAllTokens,
              totalRequests: windowUsage.totalRequests,
              totalCost,
              modelUsage: modelCosts
            }
          }

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            // 转换schedulable为布尔值
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages,
              sessionWindow: sessionWindowUsage
            }
          }
        } catch (statsError) {
          logger.warn(`⚠️ Failed to get usage stats for account ${account.id}:`, statsError.message)
          // 如果获取统计失败，返回空统计
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Claude accounts:', error)
    return res.status(500).json({ error: 'Failed to get Claude accounts', message: error.message })
  }
})

// 批量获取 Claude 账户的 OAuth Usage 数据
router.get('/claude-accounts/usage', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await redis.getAllClaudeAccounts()
    const now = Date.now()
    const usageCacheTtlMs = 300 * 1000

    // 批量并发获取所有活跃 OAuth 账户的 Usage
    const usagePromises = accounts.map(async (account) => {
      // 检查是否为 OAuth 账户：scopes 包含 OAuth 相关权限
      const scopes = account.scopes && account.scopes.trim() ? account.scopes.split(' ') : []
      const isOAuth = scopes.includes('user:profile') && scopes.includes('user:inference')

      // 仅为 OAuth 授权的活跃账户调用 usage API
      if (
        isOAuth &&
        account.isActive === 'true' &&
        account.accessToken &&
        account.status === 'active'
      ) {
        // 若快照在 300 秒内更新，直接使用缓存避免频繁请求
        const cachedUsage = claudeAccountService.buildClaudeUsageSnapshot(account)
        const lastUpdatedAt = account.claudeUsageUpdatedAt
          ? new Date(account.claudeUsageUpdatedAt).getTime()
          : 0
        const isCacheFresh = cachedUsage && lastUpdatedAt && now - lastUpdatedAt < usageCacheTtlMs
        if (isCacheFresh) {
          return {
            accountId: account.id,
            claudeUsage: cachedUsage
          }
        }

        try {
          const usageData = await claudeAccountService.fetchOAuthUsage(account.id)
          if (usageData) {
            await claudeAccountService.updateClaudeUsageSnapshot(account.id, usageData)
          }
          // 重新读取更新后的数据
          const updatedAccount = await redis.getClaudeAccount(account.id)
          return {
            accountId: account.id,
            claudeUsage: claudeAccountService.buildClaudeUsageSnapshot(updatedAccount)
          }
        } catch (error) {
          logger.debug(`Failed to fetch OAuth usage for ${account.id}:`, error.message)
          return { accountId: account.id, claudeUsage: null }
        }
      }
      // Setup Token 账户不调用 usage API，直接返回 null
      return { accountId: account.id, claudeUsage: null }
    })

    const results = await Promise.allSettled(usagePromises)

    // 转换为 { accountId: usage } 映射
    const usageMap = {}
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        usageMap[result.value.accountId] = result.value.claudeUsage
      }
    })

    res.json({ success: true, data: usageMap })
  } catch (error) {
    logger.error('❌ Failed to fetch Claude accounts usage:', error)
    res.status(500).json({ error: 'Failed to fetch usage data', message: error.message })
  }
})

// 创建新的Claude账户
router.post('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType,
      platform = 'claude',
      priority,
      groupId,
      groupIds,
      autoStopOnWarning,
      useUnifiedUserAgent,
      useUnifiedClientId,
      unifiedClientId,
      expiresAt,
      extInfo,
      maxConcurrency,
      interceptWarmup,
      disableTempUnavailable,
      tempUnavailable503TtlSeconds,
      tempUnavailable5xxTtlSeconds
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId或groupIds
    if (accountType === 'group' && !groupId && (!groupIds || groupIds.length === 0)) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }

    // 验证priority的有效性
    if (
      priority !== undefined &&
      (typeof priority !== 'number' || priority < 1 || priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }

    const { normalized: normalizedTempUnavailablePolicy, error: tempUnavailablePolicyError } =
      normalizeTempUnavailablePolicyPayload({
        disableTempUnavailable,
        tempUnavailable503TtlSeconds,
        tempUnavailable5xxTtlSeconds
      })
    if (tempUnavailablePolicyError) {
      return res.status(400).json({ error: tempUnavailablePolicyError })
    }

    const newAccount = await claudeAccountService.createAccount({
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType: accountType || 'shared', // 默认为共享类型
      platform,
      priority: priority || 50, // 默认优先级为50
      autoStopOnWarning: autoStopOnWarning === true, // 默认为false
      useUnifiedUserAgent: useUnifiedUserAgent === true, // 默认为false
      useUnifiedClientId: useUnifiedClientId === true, // 默认为false
      unifiedClientId: unifiedClientId || '', // 统一的客户端标识
      expiresAt: expiresAt || null, // 账户订阅到期时间
      extInfo: extInfo || null,
      maxConcurrency: maxConcurrency || 0, // 账户级串行队列：0=使用全局配置，>0=强制启用
      interceptWarmup: interceptWarmup === true, // 拦截预热请求：默认为false
      disableTempUnavailable: normalizedTempUnavailablePolicy.disableTempUnavailable,
      tempUnavailable503TtlSeconds: normalizedTempUnavailablePolicy.tempUnavailable503TtlSeconds,
      tempUnavailable5xxTtlSeconds: normalizedTempUnavailablePolicy.tempUnavailable5xxTtlSeconds
    })

    // 如果是分组类型，将账户添加到分组
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        // 使用多分组设置
        await accountGroupService.setAccountGroups(newAccount.id, groupIds, newAccount.platform)
      } else if (groupId) {
        // 兼容单分组模式
        await accountGroupService.addAccountToGroup(newAccount.id, groupId, newAccount.platform)
      }
    }

    logger.success(`🏢 Admin created new Claude account: ${name} (${accountType || 'shared'})`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Claude account', message: error.message })
  }
})

// 更新Claude账户
router.put('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【修改】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt（提前到参数验证之前）
    const mappedUpdates = mapExpiryField(updates, 'Claude', accountId)

    // 验证priority的有效性
    if (
      mappedUpdates.priority !== undefined &&
      (typeof mappedUpdates.priority !== 'number' ||
        mappedUpdates.priority < 1 ||
        mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }

    const { normalized: normalizedTempUnavailablePolicy, error: tempUnavailablePolicyError } =
      normalizeTempUnavailablePolicyPayload(mappedUpdates, { partial: true })
    if (tempUnavailablePolicyError) {
      return res.status(400).json({ error: tempUnavailablePolicyError })
    }
    Object.assign(mappedUpdates, normalizedTempUnavailablePolicy)

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId或groupIds
    if (
      mappedUpdates.accountType === 'group' &&
      !mappedUpdates.groupId &&
      (!mappedUpdates.groupIds || mappedUpdates.groupIds.length === 0)
    ) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await claudeAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        await accountGroupService.removeAccountFromAllGroups(accountId)
      }

      // 如果新类型是分组，添加到新分组
      if (mappedUpdates.accountType === 'group') {
        // 处理多分组/单分组的兼容性
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 使用多分组设置
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'claude')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 兼容单分组模式
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'claude')
        }
      }
    }

    await claudeAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated Claude account: ${accountId}`)
    return res.json({ success: true, message: 'Claude account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Claude account', message: error.message })
  }
})

// 删除Claude账户
router.delete('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'claude')

    // 获取账户信息以检查是否在分组中
    const account = await claudeAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await claudeAccountService.deleteAccount(accountId)

    let message = 'Claude账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Claude account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Claude account', message: error.message })
  }
})

// 更新单个Claude账户的Profile信息
router.post('/claude-accounts/:accountId/update-profile', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const profileInfo = await claudeAccountService.fetchAndUpdateAccountProfile(accountId)

    logger.success(`Updated profile for Claude account: ${accountId}`)
    return res.json({
      success: true,
      message: 'Account profile updated successfully',
      data: profileInfo
    })
  } catch (error) {
    logger.error('❌ Failed to update account profile:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update account profile', message: error.message })
  }
})

// 批量更新所有Claude账户的Profile信息
router.post('/claude-accounts/update-all-profiles', authenticateAdmin, async (req, res) => {
  try {
    const result = await claudeAccountService.updateAllAccountProfiles()

    logger.success('Batch profile update completed')
    return res.json({
      success: true,
      message: 'Batch profile update completed',
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to update all account profiles:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update all account profiles', message: error.message })
  }
})

// 刷新Claude账户token
router.post('/claude-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await claudeAccountService.refreshAccountToken(accountId)

    logger.success(`🔄 Admin refreshed token for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Claude account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 重置Claude账户状态（清除所有异常状态）
router.post('/claude-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await claudeAccountService.resetAccountStatus(accountId)

    logger.success(`Admin reset status for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Claude account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换Claude账户调度状态
router.put(
  '/claude-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const accounts = await claudeAccountService.getAllAccounts()
      const account = accounts.find((acc) => acc.id === accountId)

      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }

      const newSchedulable = !account.schedulable
      await claudeAccountService.updateAccount(accountId, { schedulable: newSchedulable })

      // 如果账号被禁用，发送webhook通知
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || account.claudeAiOauth?.email || 'Claude Account',
          platform: 'claude-oauth',
          status: 'disabled',
          errorCode: 'CLAUDE_OAUTH_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }

      logger.success(
        `🔄 Admin toggled Claude account schedulable status: ${accountId} -> ${
          newSchedulable ? 'schedulable' : 'not schedulable'
        }`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Claude account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 测试Claude OAuth账户连通性（流式响应）- 复用 claudeRelayService
router.post('/claude-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params

  try {
    // 直接调用服务层的测试方法
    await claudeRelayService.testAccountConnection(accountId, res)
  } catch (error) {
    logger.error(`❌ Failed to test Claude OAuth account:`, error)
    // 错误已在服务层处理，这里仅做日志记录
  }
})

// ============================================================================
// 账户定时测试相关端点
// ============================================================================

// 获取账户测试历史
router.get('/claude-accounts/:accountId/test-history', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params

  try {
    const history = await redis.getAccountTestHistory(accountId, 'claude')
    return res.json({
      success: true,
      data: {
        accountId,
        platform: 'claude',
        history
      }
    })
  } catch (error) {
    logger.error(`❌ Failed to get test history for account ${accountId}:`, error)
    return res.status(500).json({
      error: 'Failed to get test history',
      message: error.message
    })
  }
})

// 获取账户定时测试配置
router.get('/claude-accounts/:accountId/test-config', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params

  try {
    const testConfig = await redis.getAccountTestConfig(accountId, 'claude')
    return res.json({
      success: true,
      data: {
        accountId,
        platform: 'claude',
        config: testConfig || {
          enabled: false,
          cronExpression: '0 8 * * *',
          model: 'claude-sonnet-4-5-20250929'
        }
      }
    })
  } catch (error) {
    logger.error(`❌ Failed to get test config for account ${accountId}:`, error)
    return res.status(500).json({
      error: 'Failed to get test config',
      message: error.message
    })
  }
})

// 设置账户定时测试配置
router.put('/claude-accounts/:accountId/test-config', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const { enabled, cronExpression, model } = req.body

  try {
    // 验证 enabled 参数
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'enabled must be a boolean'
      })
    }

    // 验证 cronExpression 参数
    if (!cronExpression || typeof cronExpression !== 'string') {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'cronExpression is required and must be a string'
      })
    }

    // 限制 cronExpression 长度防止 DoS
    const MAX_CRON_LENGTH = 100
    if (cronExpression.length > MAX_CRON_LENGTH) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: `cronExpression too long (max ${MAX_CRON_LENGTH} characters)`
      })
    }

    // 使用 service 的方法验证 cron 表达式
    if (!accountTestSchedulerService.validateCronExpression(cronExpression)) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: `Invalid cron expression: ${cronExpression}. Format: "minute hour day month weekday" (e.g., "0 8 * * *" for daily at 8:00)`
      })
    }

    // 验证模型参数
    const testModel = model || 'claude-sonnet-4-5-20250929'
    if (typeof testModel !== 'string' || testModel.length > 256) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'model must be a valid string (max 256 characters)'
      })
    }

    // 检查账户是否存在
    const account = await claudeAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `Claude account ${accountId} not found`
      })
    }

    // 保存配置
    await redis.saveAccountTestConfig(accountId, 'claude', {
      enabled,
      cronExpression,
      model: testModel
    })

    logger.success(
      `📝 Updated test config for Claude account ${accountId}: enabled=${enabled}, cronExpression=${cronExpression}, model=${testModel}`
    )

    return res.json({
      success: true,
      message: 'Test config updated successfully',
      data: {
        accountId,
        platform: 'claude',
        config: { enabled, cronExpression, model: testModel }
      }
    })
  } catch (error) {
    logger.error(`❌ Failed to update test config for account ${accountId}:`, error)
    return res.status(500).json({
      error: 'Failed to update test config',
      message: error.message
    })
  }
})

// 手动触发账户测试（非流式，返回JSON结果）
router.post('/claude-accounts/:accountId/test-sync', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params

  try {
    // 检查账户是否存在
    const account = await claudeAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `Claude account ${accountId} not found`
      })
    }

    logger.info(`🧪 Manual sync test triggered for Claude account: ${accountId}`)

    // 执行测试
    const testResult = await claudeRelayService.testAccountConnectionSync(accountId)

    // 保存测试结果到历史
    await redis.saveAccountTestResult(accountId, 'claude', testResult)
    await redis.setAccountLastTestTime(accountId, 'claude')

    return res.json({
      success: true,
      data: {
        accountId,
        platform: 'claude',
        result: testResult
      }
    })
  } catch (error) {
    logger.error(`❌ Failed to run sync test for account ${accountId}:`, error)
    return res.status(500).json({
      error: 'Failed to run test',
      message: error.message
    })
  }
})

// 批量获取多个账户的测试历史
router.post('/claude-accounts/batch-test-history', authenticateAdmin, async (req, res) => {
  const { accountIds } = req.body

  try {
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'accountIds must be a non-empty array'
      })
    }

    // 限制批量查询数量
    const limitedIds = accountIds.slice(0, 100)

    const accounts = limitedIds.map((accountId) => ({
      accountId,
      platform: 'claude'
    }))

    const historyMap = await redis.getAccountsTestHistory(accounts)

    return res.json({
      success: true,
      data: historyMap
    })
  } catch (error) {
    logger.error('❌ Failed to get batch test history:', error)
    return res.status(500).json({
      error: 'Failed to get batch test history',
      message: error.message
    })
  }
})

module.exports = router
