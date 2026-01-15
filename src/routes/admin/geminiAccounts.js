const express = require('express')
const geminiAccountService = require('../../services/geminiAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

const router = express.Router()

// 🤖 Gemini OAuth 账户管理
function getDefaultRedirectUri(oauthProvider) {
  if (oauthProvider === 'antigravity') {
    return process.env.ANTIGRAVITY_OAUTH_REDIRECT_URI || 'http://localhost:45462'
  }
  return process.env.GEMINI_OAUTH_REDIRECT_URI || 'https://codeassist.google.com/authcode'
}

// 生成 Gemini OAuth 授权 URL
router.post('/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { state, proxy, oauthProvider } = req.body // 接收代理配置与OAuth Provider

    const redirectUri = getDefaultRedirectUri(oauthProvider)

    logger.info(`Generating Gemini OAuth URL with redirect_uri: ${redirectUri}`)

    const {
      authUrl,
      state: authState,
      codeVerifier,
      redirectUri: finalRedirectUri,
      oauthProvider: resolvedOauthProvider
    } = await geminiAccountService.generateAuthUrl(state, redirectUri, proxy, oauthProvider)

    // 创建 OAuth 会话，包含 codeVerifier 和代理配置
    const sessionId = authState
    await redis.setOAuthSession(sessionId, {
      state: authState,
      type: 'gemini',
      redirectUri: finalRedirectUri,
      codeVerifier, // 保存 PKCE code verifier
      proxy: proxy || null, // 保存代理配置
      oauthProvider: resolvedOauthProvider,
      createdAt: new Date().toISOString()
    })

    logger.info(`Generated Gemini OAuth URL with session: ${sessionId}`)
    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId,
        oauthProvider: resolvedOauthProvider
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Gemini auth URL:', error)
    return res.status(500).json({ error: 'Failed to generate auth URL', message: error.message })
  }
})

// 轮询 Gemini OAuth 授权状态
router.post('/poll-auth-status', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    const result = await geminiAccountService.pollAuthorizationStatus(sessionId)

    if (result.success) {
      logger.success(`✅ Gemini OAuth authorization successful for session: ${sessionId}`)
      return res.json({ success: true, data: { tokens: result.tokens } })
    } else {
      return res.json({ success: false, error: result.error })
    }
  } catch (error) {
    logger.error('❌ Failed to poll Gemini auth status:', error)
    return res.status(500).json({ error: 'Failed to poll auth status', message: error.message })
  }
})

// 交换 Gemini 授权码
router.post('/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId, proxy: requestProxy, oauthProvider } = req.body
    let resolvedOauthProvider = oauthProvider

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' })
    }

    let redirectUri = getDefaultRedirectUri(resolvedOauthProvider)
    let codeVerifier = null
    let proxyConfig = null

    // 如果提供了 sessionId，从 OAuth 会话中获取信息
    if (sessionId) {
      const sessionData = await redis.getOAuthSession(sessionId)
      if (sessionData) {
        const {
          redirectUri: sessionRedirectUri,
          codeVerifier: sessionCodeVerifier,
          proxy,
          oauthProvider: sessionOauthProvider
        } = sessionData
        redirectUri = sessionRedirectUri || redirectUri
        codeVerifier = sessionCodeVerifier
        proxyConfig = proxy // 获取代理配置
        if (!resolvedOauthProvider && sessionOauthProvider) {
          // 会话里保存的 provider 仅作为兜底
          resolvedOauthProvider = sessionOauthProvider
        }
        logger.info(
          `Using session redirect_uri: ${redirectUri}, has codeVerifier: ${!!codeVerifier}, has proxy from session: ${!!proxyConfig}`
        )
      }
    }

    // 如果请求体中直接提供了代理配置，优先使用它
    if (requestProxy) {
      proxyConfig = requestProxy
      logger.info(
        `Using proxy from request body: ${proxyConfig ? JSON.stringify(proxyConfig) : 'none'}`
      )
    }

    const tokens = await geminiAccountService.exchangeCodeForTokens(
      code,
      redirectUri,
      codeVerifier,
      proxyConfig, // 传递代理配置
      resolvedOauthProvider
    )

    // 清理 OAuth 会话
    if (sessionId) {
      await redis.deleteOAuthSession(sessionId)
    }

    logger.success('✅ Successfully exchanged Gemini authorization code')
    return res.json({ success: true, data: { tokens, oauthProvider: resolvedOauthProvider } })
  } catch (error) {
    logger.error('❌ Failed to exchange Gemini authorization code:', error)
    return res.status(500).json({ error: 'Failed to exchange code', message: error.message })
  }
})

// 获取所有 Gemini 账户
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await geminiAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'gemini') {
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

    // 为每个账户添加使用统计信息（与Claude账户相同的逻辑）
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Gemini account ${account.id}:`,
            statsError.message
          )
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
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Gemini accounts:', error)
    return res.status(500).json({ error: 'Failed to get accounts', message: error.message })
  }
})

// 创建新的 Gemini 账户
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body

    // 输入验证
    if (!accountData.name) {
      return res.status(400).json({ error: 'Account name is required' })
    }

    // 验证accountType的有效性
    if (
      accountData.accountType &&
      !['shared', 'dedicated', 'group'].includes(accountData.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId或groupIds
    if (
      accountData.accountType === 'group' &&
      !accountData.groupId &&
      (!accountData.groupIds || accountData.groupIds.length === 0)
    ) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    const newAccount = await geminiAccountService.createAccount(accountData)

    // 如果是分组类型，处理分组绑定
    if (accountData.accountType === 'group') {
      if (accountData.groupIds && accountData.groupIds.length > 0) {
        // 多分组模式
        await accountGroupService.setAccountGroups(newAccount.id, accountData.groupIds, 'gemini')
        logger.info(
          `🏢 Added Gemini account ${newAccount.id} to groups: ${accountData.groupIds.join(', ')}`
        )
      } else if (accountData.groupId) {
        // 单分组模式（向后兼容）
        await accountGroupService.addAccountToGroup(newAccount.id, accountData.groupId, 'gemini')
      }
    }

    logger.success(`🏢 Admin created new Gemini account: ${accountData.name}`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Gemini account:', error)
    return res.status(500).json({ error: 'Failed to create account', message: error.message })
  }
})

// 更新 Gemini 账户
router.put('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // 验证accountType的有效性
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId或groupIds
    if (
      updates.accountType === 'group' &&
      !updates.groupId &&
      (!updates.groupIds || updates.groupIds.length === 0)
    ) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await geminiAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Gemini', accountId)

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'gemini')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'gemini')
        }
      }
    }

    const updatedAccount = await geminiAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated Gemini account: ${accountId}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update Gemini account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 Gemini 账户
router.delete('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'gemini')

    // 获取账户信息以检查是否在分组中
    const account = await geminiAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await geminiAccountService.deleteAccount(accountId)

    let message = 'Gemini账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Gemini account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Gemini account:', error)
    return res.status(500).json({ error: 'Failed to delete account', message: error.message })
  }
})

// 刷新 Gemini 账户 token
router.post('/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await geminiAccountService.refreshAccountToken(accountId)

    logger.success(`🔄 Admin refreshed token for Gemini account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Gemini account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 切换 Gemini 账户调度状态
router.put('/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await geminiAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 现在 account.schedulable 已经是布尔值了，直接取反即可
    const newSchedulable = !account.schedulable

    await geminiAccountService.updateAccount(accountId, { schedulable: String(newSchedulable) })

    // 验证更新是否成功，重新获取账户信息
    const updatedAccount = await geminiAccountService.getAccount(accountId)
    const actualSchedulable = updatedAccount ? updatedAccount.schedulable : newSchedulable

    // 如果账号被禁用，发送webhook通知
    if (!actualSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.accountName || 'Gemini Account',
        platform: 'gemini',
        status: 'disabled',
        errorCode: 'GEMINI_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled Gemini account schedulable status: ${accountId} -> ${
        actualSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )

    // 返回实际的数据库值，确保前端状态与后端一致
    return res.json({ success: true, schedulable: actualSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle Gemini account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 重置 Gemini OAuth 账户限流状态
router.post('/:id/reset-rate-limit', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await geminiAccountService.updateAccount(id, {
      rateLimitedAt: '',
      rateLimitStatus: '',
      status: 'active',
      errorMessage: ''
    })

    logger.info(`🔄 Admin manually reset rate limit for Gemini account ${id}`)

    res.json({
      success: true,
      message: 'Rate limit reset successfully'
    })
  } catch (error) {
    logger.error('Failed to reset Gemini account rate limit:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 重置 Gemini OAuth 账户状态（清除所有异常状态）
router.post('/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await geminiAccountService.resetAccountStatus(id)

    logger.success(`✅ Admin reset status for Gemini account: ${id}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Gemini account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

module.exports = router
