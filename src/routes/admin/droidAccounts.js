const express = require('express')
const crypto = require('crypto')
const droidAccountService = require('../../services/account/droidAccountService')
const testModelConfigService = require('../../services/testModelConfigService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const proxyResolver = require('../../utils/proxyResolver')
const {
  startDeviceAuthorization,
  pollDeviceAuthorization,
  WorkOSDeviceAuthError
} = require('../../utils/workosOAuthHelper')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')
const { stripReadonlyAccountFields } = require('../../utils/commonHelper')
const { extractErrorMessage } = require('../../utils/testPayloadHelper')

const router = express.Router()

// ==================== Droid 账户管理 API ====================

// 生成 Droid 设备码授权信息
router.post('/droid-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy, proxyGroupId, proxyId } = req.body || {}
    // 账户绑代理池时设备码授权也走池代理（未绑池回退静态 proxy）
    const effectiveProxy = proxyResolver.resolveAuthProxy(
      { proxyGroupId, proxyId, platform: 'droid' },
      'droid',
      proxy
    )
    const deviceAuth = await startDeviceAuthorization(effectiveProxy)

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + deviceAuth.expiresIn * 1000).toISOString()

    await redis.setOAuthSession(sessionId, {
      deviceCode: deviceAuth.deviceCode,
      userCode: deviceAuth.userCode,
      verificationUri: deviceAuth.verificationUri,
      verificationUriComplete: deviceAuth.verificationUriComplete,
      interval: deviceAuth.interval,
      proxy: effectiveProxy,
      proxyBound: !!(proxyGroupId || proxyId), // 代理来源是否池绑定，供 exchange 一致性校验
      createdAt: new Date().toISOString(),
      expiresAt
    })

    logger.success('🤖 生成 Droid 设备码授权信息成功', { sessionId })
    return res.json({
      success: true,
      data: {
        sessionId,
        userCode: deviceAuth.userCode,
        verificationUri: deviceAuth.verificationUri,
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresIn: deviceAuth.expiresIn,
        interval: deviceAuth.interval,
        instructions: [
          '1. 使用下方验证码进入授权页面并确认访问权限。',
          '2. 在授权页面登录 Factory / Droid 账户并点击允许。',
          '3. 回到此处点击"完成授权"完成凭证获取。'
        ]
      }
    })
  } catch (error) {
    const message =
      error instanceof WorkOSDeviceAuthError ? error.message : error.message || '未知错误'
    logger.error('❌ 生成 Droid 设备码授权失败:', message)
    return res.status(500).json({ error: 'Failed to start Droid device authorization', message })
  }
})

// 交换 Droid 授权码
router.post('/droid-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  const { sessionId } = req.body || {}
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    if (oauthSession.expiresAt && new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    if (!oauthSession.deviceCode) {
      await redis.deleteOAuthSession(sessionId)
      return res.status(400).json({ error: 'OAuth session missing device code, please retry' })
    }

    // 一致性校验：会话来源为池绑定但无已解析代理，拒绝（不允许授权直连暴露真实出口）
    if (oauthSession.proxyBound && !oauthSession.proxy) {
      await redis.deleteOAuthSession(sessionId)
      return res.status(409).json({
        error: '账户绑定的代理池当前无可用代理，已阻止授权请求直连（避免暴露真实出口）'
      })
    }

    const proxyConfig = oauthSession.proxy || null
    const tokens = await pollDeviceAuthorization(oauthSession.deviceCode, proxyConfig)

    await redis.deleteOAuthSession(sessionId)

    logger.success('🤖 成功获取 Droid 访问令牌', { sessionId })
    return res.json({ success: true, data: { tokens } })
  } catch (error) {
    if (error instanceof WorkOSDeviceAuthError) {
      if (error.code === 'authorization_pending' || error.code === 'slow_down') {
        const oauthSession = await redis.getOAuthSession(sessionId)
        const expiresAt = oauthSession?.expiresAt ? new Date(oauthSession.expiresAt) : null
        const remainingSeconds =
          expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
            ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
            : null

        return res.json({
          success: false,
          pending: true,
          error: error.code,
          message: error.message,
          retryAfter: error.retryAfter || Number(oauthSession?.interval) || 5,
          expiresIn: remainingSeconds
        })
      }

      if (error.code === 'expired_token') {
        await redis.deleteOAuthSession(sessionId)
        return res.status(400).json({
          error: 'Device code expired',
          message: '授权已过期，请重新生成设备码并再次授权'
        })
      }

      logger.error('❌ Droid 授权失败:', error.message)
      return res.status(500).json({
        error: 'Failed to exchange Droid authorization code',
        message: error.message,
        errorCode: error.code
      })
    }

    logger.error('❌ 交换 Droid 授权码失败:', error)
    return res.status(500).json({
      error: 'Failed to exchange Droid authorization code',
      message: error.message
    })
  }
})

// 获取所有 Droid 账户
router.get('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await droidAccountService.getAllAccounts()
    const accountIds = accounts.map((a) => a.id)

    // 并行获取：轻量 API Keys + 分组信息 + daily cost
    const [allApiKeys, allGroupInfosMap, dailyCostMap] = await Promise.all([
      apiKeyService.getAllApiKeysLite(),
      accountGroupService.batchGetAccountGroupsByIndex(accountIds, 'droid'),
      redis.batchGetAccountDailyCost(accountIds)
    ])

    // 构建绑定数映射（droid 需要展开 group 绑定）
    // 1. 先构建 groupId -> accountIds 映射
    const groupToAccountIds = new Map()
    for (const [accountId, groups] of allGroupInfosMap) {
      for (const group of groups) {
        if (!groupToAccountIds.has(group.id)) {
          groupToAccountIds.set(group.id, [])
        }
        groupToAccountIds.get(group.id).push(accountId)
      }
    }

    // 2. 单次遍历构建绑定数
    const directBindingCount = new Map()
    const groupBindingCount = new Map()
    for (const key of allApiKeys) {
      const binding = key.droidAccountId
      if (!binding) {
        continue
      }
      if (binding.startsWith('group:')) {
        const groupId = binding.substring('group:'.length)
        groupBindingCount.set(groupId, (groupBindingCount.get(groupId) || 0) + 1)
      } else {
        directBindingCount.set(binding, (directBindingCount.get(binding) || 0) + 1)
      }
    }

    // 批量获取使用统计
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

    const statsPipeline = client.pipeline()
    for (const accountId of accountIds) {
      statsPipeline.hgetall(RedisKeys.accountUsage.total(accountId))
      statsPipeline.hgetall(RedisKeys.accountUsage.daily(accountId, today))
      statsPipeline.hgetall(RedisKeys.accountUsage.monthly(accountId, currentMonth))
    }
    const statsResults = await statsPipeline.exec()

    // 处理统计数据
    const allUsageStatsMap = new Map()
    const parseUsage = (data) => ({
      requests: parseInt(data?.totalRequests || data?.requests) || 0,
      tokens: parseInt(data?.totalTokens || data?.tokens) || 0,
      inputTokens: parseInt(data?.totalInputTokens || data?.inputTokens) || 0,
      outputTokens: parseInt(data?.totalOutputTokens || data?.outputTokens) || 0,
      cacheCreateTokens: parseInt(data?.totalCacheCreateTokens || data?.cacheCreateTokens) || 0,
      cacheReadTokens: parseInt(data?.totalCacheReadTokens || data?.cacheReadTokens) || 0,
      allTokens:
        parseInt(data?.totalAllTokens || data?.allTokens) ||
        (parseInt(data?.totalInputTokens || data?.inputTokens) || 0) +
          (parseInt(data?.totalOutputTokens || data?.outputTokens) || 0) +
          (parseInt(data?.totalCacheCreateTokens || data?.cacheCreateTokens) || 0) +
          (parseInt(data?.totalCacheReadTokens || data?.cacheReadTokens) || 0)
    })

    // 构建 accountId -> createdAt 映射用于计算 averages
    const accountCreatedAtMap = new Map()
    for (const account of accounts) {
      accountCreatedAtMap.set(
        account.id,
        account.createdAt ? new Date(account.createdAt) : new Date()
      )
    }

    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i]
      const [errTotal, total] = statsResults[i * 3]
      const [errDaily, daily] = statsResults[i * 3 + 1]
      const [errMonthly, monthly] = statsResults[i * 3 + 2]

      const totalData = errTotal ? {} : parseUsage(total)
      const totalTokens = totalData.tokens || 0
      const totalRequests = totalData.requests || 0

      // 计算 averages
      const createdAt = accountCreatedAtMap.get(accountId)
      const now = new Date()
      const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)))
      const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)

      allUsageStatsMap.set(accountId, {
        total: totalData,
        daily: errDaily ? {} : parseUsage(daily),
        monthly: errMonthly ? {} : parseUsage(monthly),
        averages: {
          rpm: Math.round((totalRequests / totalMinutes) * 100) / 100,
          tpm: Math.round((totalTokens / totalMinutes) * 100) / 100,
          dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
          dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
        }
      })
    }

    // 处理账户数据
    const accountsWithStats = accounts.map((account) => {
      const groupInfos = allGroupInfosMap.get(account.id) || []
      const usageStats = allUsageStatsMap.get(account.id) || {
        daily: { tokens: 0, requests: 0 },
        total: { tokens: 0, requests: 0 },
        monthly: { tokens: 0, requests: 0 },
        averages: { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0 }
      }
      const dailyCost = dailyCostMap.get(account.id) || 0

      // 计算绑定数：直接绑定 + 通过 group 绑定
      let boundApiKeysCount = directBindingCount.get(account.id) || 0
      for (const group of groupInfos) {
        boundApiKeysCount += groupBindingCount.get(group.id) || 0
      }

      const formattedAccount = formatAccountExpiry(account)
      return {
        ...formattedAccount,
        schedulable: account.schedulable === 'true',
        boundApiKeysCount,
        groupInfos,
        usage: {
          daily: { ...usageStats.daily, cost: dailyCost },
          total: usageStats.total,
          monthly: usageStats.monthly,
          averages: usageStats.averages
        }
      }
    })

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get Droid accounts:', error)
    return res.status(500).json({ error: 'Failed to get Droid accounts', message: error.message })
  }
})

// 创建 Droid 账户
router.post('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { accountType: rawAccountType = 'shared', groupId, groupIds } = req.body

    const normalizedAccountType = rawAccountType || 'shared'

    if (!['shared', 'dedicated', 'group'].includes(normalizedAccountType)) {
      return res.status(400).json({ error: '账户类型必须是 shared、dedicated 或 group' })
    }

    const normalizedGroupIds = Array.isArray(groupIds)
      ? groupIds.filter((id) => typeof id === 'string' && id.trim())
      : []

    if (
      normalizedAccountType === 'group' &&
      normalizedGroupIds.length === 0 &&
      (!groupId || typeof groupId !== 'string' || !groupId.trim())
    ) {
      return res.status(400).json({ error: '分组调度账户必须至少选择一个分组' })
    }

    const accountPayload = {
      ...req.body,
      accountType: normalizedAccountType
    }

    delete accountPayload.groupId
    delete accountPayload.groupIds

    const account = await droidAccountService.createAccount(accountPayload)

    if (normalizedAccountType === 'group') {
      try {
        if (normalizedGroupIds.length > 0) {
          await accountGroupService.setAccountGroups(account.id, normalizedGroupIds, 'droid')
        } else if (typeof groupId === 'string' && groupId.trim()) {
          await accountGroupService.addAccountToGroup(account.id, groupId, 'droid')
        }
      } catch (groupError) {
        logger.error(`Failed to attach Droid account ${account.id} to groups:`, groupError)
        return res.status(500).json({
          error: 'Failed to bind Droid account to groups',
          message: groupError.message
        })
      }
    }

    logger.success(`Created Droid account: ${account.name} (${account.id})`)
    const formattedAccount = formatAccountExpiry(account)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('Failed to create Droid account:', error)
    return res.status(500).json({ error: 'Failed to create Droid account', message: error.message })
  }
})

// 更新 Droid 账户
router.put('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = { ...req.body }

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    // review#3：剥离外部传入的状态类字段，禁止伪造自动停用证据
    const mappedUpdates = stripReadonlyAccountFields(mapExpiryField(updates, 'Droid', id))

    // review#4：剥离 apiKeys 子项里的状态类字段（status/errorMessage），禁止外部伪造 key 级 error
    // key 级 error 只能由自动流程(markApiKeyAsError)写入，手动停用走账户级 schedulable/isActive
    if (Array.isArray(mappedUpdates.apiKeys)) {
      mappedUpdates.apiKeys = mappedUpdates.apiKeys.map((entry) => {
        if (entry && typeof entry === 'object') {
          const { status: _status, errorMessage: _errorMessage, ...rest } = entry
          return rest
        }
        return entry
      })
    }

    const { accountType: rawAccountType, groupId, groupIds } = mappedUpdates

    if (rawAccountType && !['shared', 'dedicated', 'group'].includes(rawAccountType)) {
      return res.status(400).json({ error: '账户类型必须是 shared、dedicated 或 group' })
    }

    if (
      rawAccountType === 'group' &&
      (!groupId || typeof groupId !== 'string' || !groupId.trim()) &&
      (!Array.isArray(groupIds) || groupIds.length === 0)
    ) {
      return res.status(400).json({ error: '分组调度账户必须至少选择一个分组' })
    }

    const currentAccount = await droidAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Droid account not found' })
    }

    const normalizedGroupIds = Array.isArray(groupIds)
      ? groupIds.filter((gid) => typeof gid === 'string' && gid.trim())
      : []
    const hasGroupIdsField = Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')
    const hasGroupIdField = Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupId')
    const targetAccountType = rawAccountType || currentAccount.accountType || 'shared'

    delete mappedUpdates.groupId
    delete mappedUpdates.groupIds

    if (rawAccountType) {
      mappedUpdates.accountType = targetAccountType
    }

    const account = await droidAccountService.updateAccount(id, mappedUpdates)

    try {
      if (currentAccount.accountType === 'group' && targetAccountType !== 'group') {
        await accountGroupService.removeAccountFromAllGroups(id)
      } else if (targetAccountType === 'group') {
        if (hasGroupIdsField) {
          if (normalizedGroupIds.length > 0) {
            await accountGroupService.setAccountGroups(id, normalizedGroupIds, 'droid')
          } else {
            await accountGroupService.removeAccountFromAllGroups(id)
          }
        } else if (hasGroupIdField && typeof groupId === 'string' && groupId.trim()) {
          await accountGroupService.setAccountGroups(id, [groupId], 'droid')
        }
      }
    } catch (groupError) {
      logger.error(`Failed to update Droid account ${id} groups:`, groupError)
      return res.status(500).json({
        error: 'Failed to update Droid account groups',
        message: groupError.message
      })
    }

    if (targetAccountType === 'group') {
      try {
        account.groupInfos = await accountGroupService.getAccountGroups(id)
      } catch (groupFetchError) {
        logger.debug(`Failed to fetch group infos for Droid account ${id}:`, groupFetchError)
      }
    }

    return res.json({ success: true, data: account })
  } catch (error) {
    logger.error(`Failed to update Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to update Droid account', message: error.message })
  }
})

// 切换 Droid 账户调度状态
router.put('/droid-accounts/:id/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await droidAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ error: 'Droid account not found' })
    }

    const currentSchedulable = account.schedulable === true || account.schedulable === 'true'
    const newSchedulable = !currentSchedulable

    await droidAccountService.updateAccount(id, { schedulable: newSchedulable ? 'true' : 'false' })

    const updatedAccount = await droidAccountService.getAccount(id)
    const actualSchedulable = updatedAccount
      ? updatedAccount.schedulable === true || updatedAccount.schedulable === 'true'
      : newSchedulable

    if (!actualSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'Droid Account',
        platform: 'droid',
        status: 'disabled',
        errorCode: 'DROID_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled Droid account schedulable status: ${id} -> ${
        actualSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )

    return res.json({ success: true, schedulable: actualSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle Droid account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取单个 Droid 账户详细信息
router.get('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // 获取账户基本信息
    const account = await droidAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Droid account not found'
      })
    }

    // 获取使用统计信息
    let usageStats
    try {
      usageStats = await redis.getAccountUsageStats(account.id, 'droid')
    } catch (error) {
      logger.debug(`Failed to get usage stats for Droid account ${account.id}:`, error)
      usageStats = {
        daily: { tokens: 0, requests: 0, allTokens: 0 },
        total: { tokens: 0, requests: 0, allTokens: 0 },
        averages: { rpm: 0, tpm: 0 }
      }
    }

    // 获取分组信息
    let groupInfos = []
    try {
      groupInfos = await accountGroupService.getAccountGroups(account.id)
    } catch (error) {
      logger.debug(`Failed to get group infos for Droid account ${account.id}:`, error)
      groupInfos = []
    }

    // 获取绑定的 API Key 数量
    const allApiKeys = await apiKeyService.getAllApiKeysFast()
    const groupIds = groupInfos.map((group) => group.id)
    const boundApiKeysCount = allApiKeys.reduce((count, key) => {
      const binding = key.droidAccountId
      if (!binding) {
        return count
      }
      if (binding === account.id) {
        return count + 1
      }
      if (binding.startsWith('group:')) {
        const groupId = binding.substring('group:'.length)
        if (groupIds.includes(groupId)) {
          return count + 1
        }
      }
      return count
    }, 0)

    // 获取解密的 API Keys（用于管理界面）
    let decryptedApiKeys = []
    try {
      decryptedApiKeys = await droidAccountService.getDecryptedApiKeyEntries(id)
    } catch (error) {
      logger.debug(`Failed to get decrypted API keys for Droid account ${account.id}:`, error)
      decryptedApiKeys = []
    }

    // 返回完整的账户信息，包含实际的 API Keys
    const accountDetails = {
      ...account,
      // 映射字段：使用 subscriptionExpiresAt 作为前端显示的 expiresAt
      expiresAt: account.subscriptionExpiresAt || null,
      schedulable: account.schedulable === 'true',
      boundApiKeysCount,
      groupInfos,
      // 包含实际的 API Keys（用于管理界面）
      apiKeys: decryptedApiKeys.map((entry) => ({
        key: entry.key,
        id: entry.id,
        usageCount: entry.usageCount || 0,
        lastUsedAt: entry.lastUsedAt || null,
        status: entry.status || 'active', // 使用实际的状态，默认为 active
        errorMessage: entry.errorMessage || '', // 包含错误信息
        createdAt: entry.createdAt || null
      })),
      usage: {
        daily: usageStats.daily,
        total: usageStats.total,
        averages: usageStats.averages
      }
    }

    return res.json({
      success: true,
      data: accountDetails
    })
  } catch (error) {
    logger.error(`Failed to get Droid account ${req.params.id}:`, error)
    return res.status(500).json({
      error: 'Failed to get Droid account',
      message: error.message
    })
  }
})

// 删除 Droid 账户
router.delete('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await droidAccountService.deleteAccount(id)
    return res.json({ success: true, message: 'Droid account deleted successfully' })
  } catch (error) {
    logger.error(`Failed to delete Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to delete Droid account', message: error.message })
  }
})

// 刷新 Droid 账户 token
router.post('/droid-accounts/:id/refresh-token', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await droidAccountService.refreshAccessToken(id)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error(`Failed to refresh Droid account token ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 测试 Droid 账户连通性
router.post('/droid-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const startTime = Date.now()

  try {
    // 请求显式指定优先，否则用后台配置的默认测试模型（单一事实源）
    const model = await testModelConfigService.resolveAccountModel('droid', req.body.model)
    // 获取账户信息
    const account = await droidAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 确保 token 有效
    const tokenResult = await droidAccountService.ensureValidToken(accountId)
    if (!tokenResult.success) {
      return res.status(401).json({
        error: 'Token refresh failed',
        message: tokenResult.error
      })
    }

    const { accessToken } = tokenResult

    // 构造测试请求
    const axios = require('axios')
    const { getProxyAgent } = require('../../utils/proxyHelper')

    const apiUrl = 'https://api.factory.ai/v1/messages'
    const payload = {
      model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "Hello" in one word.' }]
    }

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 30000
    }

    // 配置代理
    if (account.proxy) {
      const agent = getProxyAgent(account.proxy)
      if (agent) {
        requestConfig.httpsAgent = agent
        requestConfig.httpAgent = agent
      }
    }

    const response = await axios.post(apiUrl, payload, requestConfig)
    const latency = Date.now() - startTime

    // 提取响应文本
    let responseText = ''
    if (response.data?.content?.[0]?.text) {
      responseText = response.data.content[0].text
    }

    logger.success(
      `✅ Droid account test passed: ${account.name} (${accountId}), latency: ${latency}ms`
    )

    return res.json({
      success: true,
      data: {
        accountId,
        accountName: account.name,
        model,
        latency,
        responseText: responseText.substring(0, 200)
      }
    })
  } catch (error) {
    const latency = Date.now() - startTime
    logger.error(`❌ Droid account test failed: ${accountId}`, error.message)

    return res.status(500).json({
      success: false,
      error: 'Test failed',
      message: extractErrorMessage(error.response?.data, error.message),
      latency
    })
  }
})

// 重置 Droid 账户状态
router.post('/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await droidAccountService.resetAccountStatus(accountId)
    logger.success(`Admin reset status for Droid account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Droid account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

module.exports = router
