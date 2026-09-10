/**
 * Admin Routes - Grok 账户管理
 * 支持三种上游模式：OAuth 订阅、官方 xAI API Key、自定义中转
 */

const express = require('express')
const axios = require('axios')
const grokAccountService = require('../../services/account/grokAccountService')
const apiKeyService = require('../../services/apiKeyService')
const accountGroupService = require('../../services/accountGroupService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')
const { createOpenAITestPayload, extractErrorMessage } = require('../../utils/testPayloadHelper')
const ProxyHelper = require('../../utils/proxyHelper')
const grokHelper = require('../../utils/grokHelper')

const router = express.Router()

router.post('/grok-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy, redirectURI } = req.body || {}
    const state = grokHelper.generateState()
    const codeVerifier = grokHelper.generateCodeVerifier()
    const codeChallenge = grokHelper.generateCodeChallenge(codeVerifier)
    const nonce = grokHelper.generateNonce()
    const sessionId = require('crypto').randomUUID()

    await redis.setOAuthSession(sessionId, {
      codeVerifier,
      codeChallenge,
      state,
      nonce,
      redirectURI: grokHelper.effectiveRedirectURI(redirectURI),
      proxy: proxy || null,
      platform: 'grok',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })

    const authUrl = grokHelper.buildAuthorizationURL({
      state,
      codeChallenge,
      redirectURI,
      nonce
    })

    logger.success('Generated Grok OAuth authorization URL')
    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 xAI / Grok 账户并同意授权',
          '3. 复制浏览器地址栏中的完整回调 URL（包含 code 参数）或仅粘贴 code',
          '4. 在添加账户表单中粘贴回调 URL 或授权码'
        ]
      }
    })
  } catch (error) {
    logger.error('生成 Grok OAuth URL 失败:', error)
    return res.status(500).json({
      success: false,
      message: '生成授权链接失败',
      error: error.message
    })
  }
})

router.post('/grok-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId } = req.body || {}
    if (!code || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      })
    }

    const sessionData = await redis.getOAuthSession(sessionId)
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: '会话已过期或无效'
      })
    }

    const parsed = grokHelper.parseAuthorizationInput(code)
    if (!parsed.code) {
      return res.status(400).json({
        success: false,
        message: '未找到授权码'
      })
    }
    if (parsed.requiresState && parsed.state !== sessionData.state) {
      return res.status(400).json({
        success: false,
        message: 'OAuth state 不匹配，请重新生成授权链接'
      })
    }

    const tokens = await grokHelper.exchangeAuthorizationCode({
      code: parsed.code,
      codeVerifier: sessionData.codeVerifier,
      redirectURI: sessionData.redirectURI,
      proxy: sessionData.proxy
    })
    const accountInfo = grokHelper.extractAccountInfoFromTokens(tokens)
    await redis.deleteOAuthSession(sessionId)

    logger.success('Grok OAuth token exchange successful')
    return res.json({
      success: true,
      data: {
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: tokens.tokenType,
          expiresAt: tokens.expiresAt,
          expires_in: tokens.expiresIn
        },
        accountInfo
      }
    })
  } catch (error) {
    logger.error('Grok OAuth token exchange failed:', error)
    return res.status(500).json({
      success: false,
      message: '交换授权码失败',
      error: error.message
    })
  }
})

router.get('/grok-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await grokAccountService.getAllAccounts(true)

    if (platform && platform !== 'grok') {
      accounts = []
    }

    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'grok') {
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      } else {
        accounts = []
      }
    }

    const accountIds = accounts.map((a) => a.id)
    const [allApiKeys, allGroupInfosMap, dailyCostMap, rollingUsageMap] = await Promise.all([
      apiKeyService.getAllApiKeysLite(),
      accountGroupService.batchGetAccountGroupsByIndex(accountIds, 'grok'),
      redis.batchGetAccountDailyCost(accountIds),
      redis.batchGetAccountRollingUsage(accountIds, { fallbackModel: 'grok-4.6' }),
      Promise.all(accountIds.map((id) => grokAccountService.checkAndClearRateLimit(id)))
    ])

    const bindingCountMap = new Map()
    for (const key of allApiKeys) {
      const binding = key.grokAccountId
      if (!binding) {
        continue
      }
      bindingCountMap.set(binding, (bindingCountMap.get(binding) || 0) + 1)
    }

    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    const statsPipeline = client.pipeline()
    for (const accountId of accountIds) {
      statsPipeline.hgetall(`account_usage:${accountId}`)
      statsPipeline.hgetall(`account_usage:daily:${accountId}:${today}`)
      statsPipeline.hgetall(`account_usage:monthly:${accountId}:${currentMonth}`)
    }
    const statsResults = await statsPipeline.exec()

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

    const allUsageStatsMap = new Map()
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i]
      const [errTotal, total] = statsResults[i * 3]
      const [errDaily, daily] = statsResults[i * 3 + 1]
      const [errMonthly, monthly] = statsResults[i * 3 + 2]
      allUsageStatsMap.set(accountId, {
        total: errTotal ? {} : parseUsage(total),
        daily: errDaily ? {} : parseUsage(daily),
        monthly: errMonthly ? {} : parseUsage(monthly)
      })
    }

    const accountsWithStats = accounts.map((account) => {
      const usageStats = allUsageStatsMap.get(account.id) || {
        daily: { requests: 0, tokens: 0, allTokens: 0 },
        total: { requests: 0, tokens: 0, allTokens: 0 },
        monthly: { requests: 0, tokens: 0, allTokens: 0 }
      }
      const formattedAccount = formatAccountExpiry(account)
      return {
        ...formattedAccount,
        groupInfos: allGroupInfosMap.get(account.id) || [],
        boundApiKeysCount: bindingCountMap.get(account.id) || 0,
        usage: {
          daily: { ...usageStats.daily, cost: dailyCostMap.get(account.id) || 0 },
          total: usageStats.total,
          monthly: usageStats.monthly
        },
        rollingUsage: rollingUsageMap.get(account.id) || null
      }
    })

    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get Grok accounts:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

router.post('/grok-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body
    if (
      accountData.accountType === 'group' &&
      !accountData.groupId &&
      (!accountData.groupIds || accountData.groupIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Group ID is required for group type accounts'
      })
    }

    const account = await grokAccountService.createAccount(accountData)
    if (accountData.accountType === 'group') {
      if (accountData.groupIds && accountData.groupIds.length > 0) {
        await accountGroupService.setAccountGroups(account.id, accountData.groupIds, 'grok')
      } else if (accountData.groupId) {
        await accountGroupService.addAccountToGroup(account.id, accountData.groupId, 'grok')
      }
    }

    res.json({ success: true, data: formatAccountExpiry(account) })
  } catch (error) {
    logger.error('Failed to create Grok account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.put('/grok-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const currentAccount = await grokAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }

    const mappedUpdates = mapExpiryField(updates, 'Grok', id)
    if (mappedUpdates.priority !== undefined) {
      const priority = parseInt(mappedUpdates.priority)
      if (isNaN(priority) || priority < 1 || priority > 100) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be a number between 1 and 100'
        })
      }
      mappedUpdates.priority = priority.toString()
    }

    if (mappedUpdates.accountType !== undefined) {
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(id)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(id, oldGroup.id)
        }
      }
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            await accountGroupService.setAccountGroups(id, mappedUpdates.groupIds, 'grok')
          } else {
            await accountGroupService.removeAccountFromAllGroups(id)
          }
        } else if (mappedUpdates.groupId) {
          await accountGroupService.addAccountToGroup(id, mappedUpdates.groupId, 'grok')
        }
      }
    }

    const result = await grokAccountService.updateAccount(id, mappedUpdates)
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Failed to update Grok account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.delete('/grok-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await grokAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' })
    }

    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'grok')
    if (account.accountType === 'group') {
      await accountGroupService.removeAccountFromAllGroups(id)
    }
    const result = await grokAccountService.deleteAccount(id)
    res.json({
      success: true,
      ...result,
      message:
        unboundCount > 0
          ? `Grok账号已成功删除，${unboundCount} 个 API Key 已切换为共享池模式`
          : 'Grok账号已成功删除',
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('Failed to delete Grok account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.put('/grok-accounts/:id/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await grokAccountService.toggleSchedulable(id)
    if (!result.schedulable) {
      await webhookNotifier.sendAccountEvent('account.status_changed', {
        accountId: id,
        platform: 'grok',
        schedulable: result.schedulable,
        changedBy: 'admin',
        action: 'stopped_scheduling'
      })
    }
    res.json(result)
  } catch (error) {
    logger.error('Failed to toggle Grok account schedulable status:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.put('/grok-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await grokAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' })
    }
    const newActiveStatus =
      account.isActive === true || account.isActive === 'true' ? 'false' : 'true'
    await grokAccountService.updateAccount(id, { isActive: newActiveStatus })
    res.json({ success: true, isActive: newActiveStatus === 'true' })
  } catch (error) {
    logger.error('Failed to toggle Grok account status:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/grok-accounts/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const result = await grokAccountService.resetAccountStatus(req.params.id)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Grok account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

router.post('/grok-accounts/:id/refresh', authenticateAdmin, async (req, res) => {
  try {
    const tokens = await grokAccountService.refreshAccountToken(req.params.id)
    return res.json({
      success: true,
      data: {
        expiresAt: tokens.expiresAt
      }
    })
  } catch (error) {
    logger.error('Failed to refresh Grok account token:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/grok-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const { model = 'grok-4.5' } = req.body
  const startTime = Date.now()

  try {
    let account = await grokAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }
    if (account.authType === grokHelper.AUTH_TYPES.OAUTH) {
      account = await grokAccountService.ensureFreshAccessToken(accountId)
    }

    const credential =
      account.authType === grokHelper.AUTH_TYPES.API_KEY ? account.apiKey : account.accessToken
    if (!credential) {
      return res.status(401).json({ error: 'Credential not found or decryption failed' })
    }

    const baseUrl = grokHelper.resolveAccountBaseUrl({
      authType: account.authType,
      baseUrl: account.baseUrl,
      customUpstream: account.customUpstream
    })
    const apiUrl = grokHelper.joinBaseAndPath(baseUrl, '/responses')
    const payload = createOpenAITestPayload(model, { stream: false })
    const headers = grokHelper.applyCLIProxyHeaders(
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credential}`
      },
      apiUrl
    )
    const requestConfig = { headers, timeout: 30000 }
    if (account.proxy) {
      const agent = ProxyHelper.createProxyAgent(account.proxy)
      if (agent) {
        requestConfig.httpsAgent = agent
        requestConfig.httpAgent = agent
      }
    }

    const response = await axios.post(apiUrl, payload, requestConfig)
    grokAccountService
      .recordQuotaObservation(accountId, response.headers, {
        statusCode: response.status,
        model
      })
      .catch(() => {})
    if (response.status >= 400) {
      const latency = Date.now() - startTime
      return res.status(response.status).json({
        success: false,
        error: 'Test failed',
        message: extractErrorMessage(response.data, `HTTP ${response.status}`),
        latency
      })
    }
    const latency = Date.now() - startTime
    let responseText = ''
    const output = response.data?.output
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === 'output_text' && block.text) {
              responseText += block.text
            }
          }
        }
      }
    }

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
    if (error.response?.headers) {
      grokAccountService
        .recordQuotaObservation(accountId, error.response.headers, {
          statusCode: error.response.status,
          model
        })
        .catch(() => {})
    }
    const latency = Date.now() - startTime
    logger.error(`❌ Grok account test failed: ${accountId}`, error.message)
    return res.status(error.response?.status || 500).json({
      success: false,
      error: 'Test failed',
      message: extractErrorMessage(error.response?.data, error.message),
      latency
    })
  }
})

module.exports = router
