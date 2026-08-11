/**
 * Admin Routes - Grok / xAI 账户管理
 */

const express = require('express')
const axios = require('axios')
const grokAccountService = require('../../services/account/grokAccountService')
const testModelConfigService = require('../../services/testModelConfigService')
const apiKeyService = require('../../services/apiKeyService')
const accountGroupService = require('../../services/accountGroupService')
const redis = require('../../models/redis')
const { RedisKeys } = require('../../constants/redisKeys')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const { stripReadonlyAccountFields } = require('../../utils/commonHelper')
const { extractErrorMessage } = require('../../utils/testPayloadHelper')
const ProxyHelper = require('../../utils/proxyHelper')
const proxyResolver = require('../../utils/proxyResolver')
const xaiHelper = require('../../utils/xaiHelper')

const router = express.Router()

// 生成 OAuth 授权 URL
router.post('/grok-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy, proxyGroupId, proxyId, redirectUri } = req.body || {}
    // 绑池 fail-closed：有池绑定必须走 resolveAuthProxy
    const effectiveProxy = proxyResolver.resolveAuthProxy(
      { proxyGroupId, proxyId, platform: 'grok' },
      'grok',
      proxy
    )
    const result = await grokAccountService.generateAuthUrl({
      proxy: effectiveProxy,
      redirectUri,
      proxyBound: !!(proxyGroupId || proxyId)
    })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error(error)
    logger.error('Failed to generate Grok OAuth URL:', error)
    res.status(500).json({ error: 'Failed to generate auth URL', message: error.message })
  }
})

// 用 code 换 token（不创建账户）
router.post('/grok-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, code, state, redirectUri, proxy, proxyGroupId, proxyId } = req.body || {}
    if (!sessionId || !code) {
      return res.status(400).json({ error: 'sessionId and code are required' })
    }
    // exchange 阶段优先用 session 里存的授权代理；若调用方仍传池绑定则再解析
    let effectiveProxy = proxy || null
    if (proxyGroupId || proxyId) {
      effectiveProxy = proxyResolver.resolveAuthProxy(
        { proxyGroupId, proxyId, platform: 'grok' },
        'grok',
        proxy
      )
    }
    const tokenInfo = await grokAccountService.exchangeCode({
      sessionId,
      code,
      state,
      redirectUri,
      proxy: effectiveProxy
    })
    res.json({
      success: true,
      data: {
        ...tokenInfo,
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken
      }
    })
  } catch (error) {
    console.error(error)
    logger.error('Failed to exchange Grok OAuth code:', error)
    res.status(400).json({ error: 'Failed to exchange code', message: error.message })
  }
})

// OAuth 一键创建账户
router.post('/grok-accounts/create-from-oauth', authenticateAdmin, async (req, res) => {
  try {
    const account = await grokAccountService.createAccountFromOAuth(req.body || {})
    res.json({ success: true, data: account })
  } catch (error) {
    console.error(error)
    logger.error('Failed to create Grok account from OAuth:', error)
    res.status(400).json({ error: 'Failed to create account', message: error.message })
  }
})

// 列表
router.get('/grok-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.query
    let accounts = await grokAccountService.getAllAccounts(true)

    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'grok') {
        const members = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => members.includes(account.id))
      } else {
        accounts = []
      }
    }

    const accountIds = accounts.map((account) => account.id)
    await Promise.all(accountIds.map((id) => grokAccountService.checkAndClearRateLimit(id)))

    // 重新拉一次清限流后的列表（轻量：仅列表字段）
    accounts = await grokAccountService.getAllAccounts(true)
    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'grok') {
        const members = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => members.includes(account.id))
      } else {
        accounts = []
      }
    }

    const [allApiKeys, allGroupInfosMap, dailyCostMap] = await Promise.all([
      apiKeyService.getAllApiKeysLite(),
      accountGroupService.batchGetAccountGroupsByIndex
        ? accountGroupService.batchGetAccountGroupsByIndex(accountIds, 'grok')
        : Promise.resolve(new Map()),
      redis.batchGetAccountDailyCost
        ? redis.batchGetAccountDailyCost(accountIds)
        : Promise.resolve(new Map())
    ])

    const bindingCountMap = new Map()
    for (const key of allApiKeys) {
      const binding = key.grokAccountId
      if (!binding || String(binding).startsWith('group:')) {
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
      statsPipeline.hgetall(RedisKeys.accountUsage.total(accountId))
      statsPipeline.hgetall(RedisKeys.accountUsage.daily(accountId, today))
      statsPipeline.hgetall(RedisKeys.accountUsage.monthly(accountId, currentMonth))
    }
    const statsResults = await statsPipeline.exec()

    const accountsWithStats = accounts.map((account, index) => {
      const [errTotal, total] = statsResults[index * 3] || []
      const [errDaily, daily] = statsResults[index * 3 + 1] || []
      const [errMonthly, monthly] = statsResults[index * 3 + 2] || []
      const parseUsage = (data) => ({
        requests: parseInt(data?.totalRequests || data?.requests) || 0,
        tokens: parseInt(data?.totalTokens || data?.tokens) || 0,
        allTokens: parseInt(data?.totalAllTokens || data?.allTokens) || 0
      })
      return {
        ...account,
        groupInfos: allGroupInfosMap?.get?.(account.id) || [],
        boundApiKeyCount: bindingCountMap.get(account.id) || 0,
        dailyCost: dailyCostMap?.get?.(account.id) || 0,
        usage: {
          total: errTotal ? {} : parseUsage(total),
          daily: errDaily ? {} : parseUsage(daily),
          monthly: errMonthly ? {} : parseUsage(monthly)
        }
      }
    })

    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    console.error(error)
    logger.error('Failed to list Grok accounts:', error)
    res.status(500).json({ error: 'Failed to list accounts', message: error.message })
  }
})

// 创建（API Key 或已有 token）
router.post('/grok-accounts', authenticateAdmin, async (req, res) => {
  try {
    const body = stripReadonlyAccountFields(req.body || {})
    const account = await grokAccountService.createAccount(body)
    res.json({ success: true, data: account })
  } catch (error) {
    console.error(error)
    logger.error('Failed to create Grok account:', error)
    res.status(400).json({ error: 'Failed to create account', message: error.message })
  }
})

// 详情
router.get('/grok-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const account = await grokAccountService.getAccount(req.params.id, { decryptSecrets: false })
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }
    res.json({
      success: true,
      data: {
        ...account,
        accessToken: account.accessToken ? '***' : '',
        refreshToken: account.refreshToken ? '***' : '',
        apiKey: account.apiKey ? '***' : '',
        idToken: account.idToken ? '***' : ''
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to get account', message: error.message })
  }
})

// 更新
router.put('/grok-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const updates = stripReadonlyAccountFields(req.body || {})
    // 前端可能传 *** 表示不改
    for (const field of ['accessToken', 'refreshToken', 'apiKey', 'idToken']) {
      if (updates[field] === '***' || updates[field] === '') {
        delete updates[field]
      }
    }
    await grokAccountService.updateAccount(req.params.id, updates)
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    logger.error('Failed to update Grok account:', error)
    res.status(400).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除
router.delete('/grok-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    await grokAccountService.deleteAccount(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to delete account', message: error.message })
  }
})

// 切换调度
router.put('/grok-accounts/:id/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const result = await grokAccountService.toggleSchedulable(req.params.id)
    res.json({ success: true, data: result })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Failed to toggle schedulable', message: error.message })
  }
})

// 刷新 token
router.post('/grok-accounts/:id/refresh-token', authenticateAdmin, async (req, res) => {
  try {
    const account = await grokAccountService.refreshAccountToken(req.params.id)
    res.json({
      success: true,
      data: {
        id: account.id,
        expiresAt: account.expiresAt,
        lastRefresh: account.lastRefresh,
        status: account.status
      }
    })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 重置状态
router.post('/grok-accounts/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    await grokAccountService.resetAccountStatus(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 配额探测
router.get('/grok-accounts/:id/quota', authenticateAdmin, async (req, res) => {
  try {
    const quota = await grokAccountService.queryQuota(req.params.id)
    res.json({ success: true, data: quota })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Failed to query quota', message: error.message })
  }
})

// runtime sanity
router.get('/grok/runtime-sanity', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: grokAccountService.runtimeSanity() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to run sanity check', message: error.message })
  }
})

// SSO cookie 批量导入
router.post('/grok-accounts/sso-to-oauth', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const result = await grokAccountService.createAccountsFromSSO({
      ssoTokens: body.sso_tokens || body.ssoTokens || [],
      ssoToken: body.sso_token || body.ssoToken || '',
      proxy: body.proxy || null,
      proxyGroupId: body.proxyGroupId || body.proxy_group_id || '',
      proxyId: body.proxyId || body.proxy_id || '',
      name: body.name || '',
      priority: body.priority,
      groupId: body.groupId || body.group_id || '',
      baseUrl: body.baseUrl || body.base_url || ''
    })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error(error)
    logger.error('Failed Grok SSO import:', error)
    res.status(400).json({ error: 'SSO import failed', message: error.message })
  }
})

// OAuth 批量对账
router.post('/grok/oauth/reconcile', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const result = await grokAccountService.reconcileOAuthAccounts({
      mode: body.mode || (body.apply === true ? 'apply' : 'dry_run'),
      limit: body.limit,
      nearExpiryMinutes: body.nearExpiryMinutes || body.near_expiry_minutes
    })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Reconcile failed', message: error.message })
  }
})

// 媒体资格探测
router.get('/grok-accounts/:id/media-eligibility', authenticateAdmin, async (req, res) => {
  try {
    const result = await grokAccountService.ensureMediaEligible(req.params.id)
    res.json({
      success: true,
      data: {
        eligible: result.eligible,
        reason: result.reason,
        planType: result.account?.planType || '',
        subscriptionTier: result.account?.subscriptionTier || ''
      }
    })
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Failed to probe media eligibility', message: error.message })
  }
})

// 连通性测试
router.post('/grok-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  try {
    const accountId = req.params.accountId
    const account = await grokAccountService.ensureFreshToken(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const model =
      req.body?.model ||
      (await testModelConfigService.resolveAccountModel?.('grok', req.body?.model)) ||
      'grok-4.5'
    const mappedModel = xaiHelper.mapModel(model)
    const token =
      account.authType === 'apikey' ? account.apiKey : account.accessToken
    if (!token) {
      return res.status(400).json({ error: 'No credential available' })
    }

    const url = xaiHelper.buildChatCompletionsUrl(grokAccountService.getUpstreamBaseUrl(account))
    const agent = account.proxy ? ProxyHelper.createProxyAgent(account.proxy) : null
    const started = Date.now()
    const response = await axios.post(
      url,
      {
        model: mappedModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(account.authType === 'oauth' ? xaiHelper.buildCliIdentityHeaders() : {})
        },
        timeout: 30000,
        httpAgent: agent || undefined,
        httpsAgent: agent || undefined,
        proxy: false,
        validateStatus: () => true
      }
    )

    const latencyMs = Date.now() - started
    if (response.status >= 200 && response.status < 300) {
      return res.json({
        success: true,
        data: {
          ok: true,
          status: response.status,
          latencyMs,
          model: mappedModel
        }
      })
    }

    res.status(400).json({
      success: false,
      error: 'Upstream test failed',
      message: extractErrorMessage(response.data) || `status ${response.status}`,
      data: { status: response.status, latencyMs, model: mappedModel }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Test failed', message: error.message })
  }
})

module.exports = router
