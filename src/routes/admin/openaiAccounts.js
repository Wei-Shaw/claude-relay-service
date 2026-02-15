/**
 * Admin Routes - OpenAI 账户管理
 * 处理 OpenAI 账户的 CRUD 操作和 OAuth 授权流程
 */

const express = require('express')
const crypto = require('crypto')
const axios = require('axios')
const openaiAccountService = require('../../services/account/openaiAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const ProxyHelper = require('../../utils/proxyHelper')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

const router = express.Router()

// OpenAI OAuth 配置
const OPENAI_CONFIG = {
  BASE_URL: 'https://auth.openai.com',
  CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  REDIRECT_URI: 'http://localhost:1455/auth/callback',
  SCOPE: 'openid profile email offline_access'
}

/**
 * 生成 PKCE 参数
 * @returns {Object} 包含 codeVerifier 和 codeChallenge 的对象
 */
function generateOpenAIPKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('hex')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

  return {
    codeVerifier,
    codeChallenge
  }
}

// 生成 OpenAI OAuth 授权 URL
router.post('/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body

    // 生成 PKCE 参数
    const pkce = generateOpenAIPKCE()

    // 生成随机 state
    const state = crypto.randomBytes(32).toString('hex')

    // 创建会话 ID
    const sessionId = crypto.randomUUID()

    // 将 PKCE 参数和代理配置存储到 Redis
    await redis.setOAuthSession(sessionId, {
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      state,
      proxy: proxy || null,
      platform: 'openai',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })

    // 构建授权 URL 参数
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OPENAI_CONFIG.CLIENT_ID,
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      scope: OPENAI_CONFIG.SCOPE,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true'
    })

    const authUrl = `${OPENAI_CONFIG.BASE_URL}/oauth/authorize?${params.toString()}`

    logger.success('Generated OpenAI OAuth authorization URL')

    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 OpenAI 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL（包含 code 参数）',
          '5. 在添加账户表单中粘贴完整的回调 URL'
        ]
      }
    })
  } catch (error) {
    logger.error('生成 OpenAI OAuth URL 失败:', error)
    return res.status(500).json({
      success: false,
      message: '生成授权链接失败',
      error: error.message
    })
  }
})

// 交换 OpenAI 授权码
router.post('/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId } = req.body

    if (!code || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      })
    }

    // 从 Redis 获取会话数据
    const sessionData = await redis.getOAuthSession(sessionId)
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: '会话已过期或无效'
      })
    }

    // 准备 token 交换请求
    const tokenData = {
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      client_id: OPENAI_CONFIG.CLIENT_ID,
      code_verifier: sessionData.codeVerifier
    }

    logger.info('Exchanging OpenAI authorization code:', {
      sessionId,
      codeLength: code.length,
      hasCodeVerifier: !!sessionData.codeVerifier
    })

    // 配置代理（如果有）
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }

    // 配置代理（如果有）
    const proxyAgent = ProxyHelper.createProxyAgent(sessionData.proxy)
    if (proxyAgent) {
      axiosConfig.httpAgent = proxyAgent
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
    }

    // 交换 authorization code 获取 tokens
    const tokenResponse = await axios.post(
      `${OPENAI_CONFIG.BASE_URL}/oauth/token`,
      new URLSearchParams(tokenData).toString(),
      axiosConfig
    )

    const { id_token, access_token, refresh_token, expires_in } = tokenResponse.data

    // 解析 ID token 获取用户信息
    const idTokenParts = id_token.split('.')
    if (idTokenParts.length !== 3) {
      throw new Error('Invalid ID token format')
    }

    // 解码 JWT payload
    const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64url').toString())

    // 获取 OpenAI 特定的声明
    const authClaims = payload['https://api.openai.com/auth'] || {}
    const accountId = authClaims.chatgpt_account_id || ''
    const chatgptUserId = authClaims.chatgpt_user_id || authClaims.user_id || ''
    const planType = authClaims.chatgpt_plan_type || ''

    // 获取组织信息
    const organizations = authClaims.organizations || []
    const defaultOrg = organizations.find((org) => org.is_default) || organizations[0] || {}
    const organizationId = defaultOrg.id || ''
    const organizationRole = defaultOrg.role || ''
    const organizationTitle = defaultOrg.title || ''

    // 清理 Redis 会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('OpenAI OAuth token exchange successful')

    return res.json({
      success: true,
      data: {
        tokens: {
          idToken: id_token,
          accessToken: access_token,
          refreshToken: refresh_token,
          expires_in
        },
        accountInfo: {
          accountId,
          chatgptUserId,
          organizationId,
          organizationRole,
          organizationTitle,
          planType,
          email: payload.email || '',
          name: payload.name || '',
          emailVerified: payload.email_verified || false,
          organizations
        }
      }
    })
  } catch (error) {
    logger.error('OpenAI OAuth token exchange failed:', error)
    return res.status(500).json({
      success: false,
      message: '交换授权码失败',
      error: error.message
    })
  }
})

// 获取所有 OpenAI 账户
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiAccountService.getAllAccounts()

    // 缓存账户所属分组，避免重复查询
    const accountGroupCache = new Map()
    const fetchAccountGroups = async (accountId) => {
      if (!accountGroupCache.has(accountId)) {
        const groups = await accountGroupService.getAccountGroups(accountId)
        accountGroupCache.set(accountId, groups || [])
      }
      return accountGroupCache.get(accountId)
    }

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'openai') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await fetchAccountGroups(account.id)
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
          const groupInfos = await fetchAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              monthly: usageStats.monthly
            }
          }
        } catch (error) {
          logger.debug(`Failed to get usage stats for OpenAI account ${account.id}:`, error)
          const groupInfos = await fetchAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
        }
      })
    )

    logger.info(`获取 OpenAI 账户列表: ${accountsWithStats.length} 个账户`)

    return res.json({
      success: true,
      data: accountsWithStats
    })
  } catch (error) {
    logger.error('获取 OpenAI 账户列表失败:', error)
    return res.status(500).json({
      success: false,
      message: '获取账户列表失败',
      error: error.message
    })
  }
})

// 创建 OpenAI 账户
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      openaiOauth,
      accountInfo,
      proxy,
      accountType,
      groupId,
      groupIds, // 支持多分组
      rateLimitDuration,
      priority,
      needsImmediateRefresh, // 是否需要立即刷新
      requireRefreshSuccess // 是否必须刷新成功才能创建
    } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '账户名称不能为空'
      })
    }

    // 准备账户数据
    const accountData = {
      name,
      description: description || '',
      accountType: accountType || 'shared',
      priority: priority || 50,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      openaiOauth: openaiOauth || {},
      accountInfo: accountInfo || {},
      proxy: proxy || null,
      isActive: true,
      schedulable: true
    }

    // 如果需要立即刷新且必须成功（OpenAI 手动模式）
    if (needsImmediateRefresh && requireRefreshSuccess) {
      // 先创建临时账户以测试刷新
      const tempAccount = await openaiAccountService.createAccount(accountData)

      try {
        logger.info(`🔄 测试刷新 OpenAI 账户以获取完整 token 信息`)

        // 尝试刷新 token（会自动使用账户配置的代理）
        await openaiAccountService.refreshAccountToken(tempAccount.id)

        // 刷新成功，获取更新后的账户信息
        const refreshedAccount = await openaiAccountService.getAccount(tempAccount.id)

        // 检查是否获取到了 ID Token
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          // 没有获取到 ID Token，删除账户
          await openaiAccountService.deleteAccount(tempAccount.id)
          throw new Error('无法获取 ID Token，请检查 Refresh Token 是否有效')
        }

        // 如果是分组类型，添加到分组（支持多分组）
        if (accountType === 'group') {
          if (groupIds && groupIds.length > 0) {
            await accountGroupService.setAccountGroups(tempAccount.id, groupIds, 'openai')
          } else if (groupId) {
            await accountGroupService.addAccountToGroup(tempAccount.id, groupId, 'openai')
          }
        }

        // 清除敏感信息后返回
        delete refreshedAccount.idToken
        delete refreshedAccount.accessToken
        delete refreshedAccount.refreshToken

        logger.success(`创建并验证 OpenAI 账户成功: ${name} (ID: ${tempAccount.id})`)

        return res.json({
          success: true,
          data: refreshedAccount,
          message: '账户创建成功，并已获取完整 token 信息'
        })
      } catch (refreshError) {
        // 刷新失败，删除临时创建的账户
        logger.warn(`❌ 刷新失败，删除临时账户: ${refreshError.message}`)
        await openaiAccountService.deleteAccount(tempAccount.id)

        // 构建详细的错误信息
        const errorResponse = {
          success: false,
          message: '账户创建失败',
          error: refreshError.message
        }

        // 添加更详细的错误信息
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }

        // 提供更友好的错误提示
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }

        return res.status(400).json(errorResponse)
      }
    }

    // 不需要强制刷新的情况（OAuth 模式或其他平台）
    const createdAccount = await openaiAccountService.createAccount(accountData)

    // 如果是分组类型，添加到分组（支持多分组）
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        await accountGroupService.setAccountGroups(createdAccount.id, groupIds, 'openai')
      } else if (groupId) {
        await accountGroupService.addAccountToGroup(createdAccount.id, groupId, 'openai')
      }
    }

    // 如果需要刷新但不强制成功（OAuth 模式可能已有完整信息）
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${createdAccount.id}`)
        await openaiAccountService.refreshAccountToken(createdAccount.id)
        logger.info(`✅ 刷新成功`)
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户已创建: ${refreshError.message}`)
      }
    }

    logger.success(`创建 OpenAI 账户成功: ${name} (ID: ${createdAccount.id})`)

    return res.json({
      success: true,
      data: createdAccount
    })
  } catch (error) {
    logger.error('创建 OpenAI 账户失败:', error)
    return res.status(500).json({
      success: false,
      message: '创建账户失败',
      error: error.message
    })
  }
})

// 更新 OpenAI 账户
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'OpenAI', id)

    const { needsImmediateRefresh, requireRefreshSuccess } = mappedUpdates

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
    const currentAccount = await openaiAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 如果更新了 Refresh Token，需要验证其有效性
    if (mappedUpdates.openaiOauth?.refreshToken && needsImmediateRefresh && requireRefreshSuccess) {
      // 先更新 token 信息
      const tempUpdateData = {}
      if (mappedUpdates.openaiOauth.refreshToken) {
        tempUpdateData.refreshToken = mappedUpdates.openaiOauth.refreshToken
      }
      if (mappedUpdates.openaiOauth.accessToken) {
        tempUpdateData.accessToken = mappedUpdates.openaiOauth.accessToken
      }
      // 更新代理配置（如果有）
      if (mappedUpdates.proxy !== undefined) {
        tempUpdateData.proxy = mappedUpdates.proxy
      }

      // 临时更新账户以测试新的 token
      await openaiAccountService.updateAccount(id, tempUpdateData)

      try {
        logger.info(`🔄 验证更新的 OpenAI token (账户: ${id})`)

        // 尝试刷新 token（会使用账户配置的代理）
        await openaiAccountService.refreshAccountToken(id)

        // 获取刷新后的账户信息
        const refreshedAccount = await openaiAccountService.getAccount(id)

        // 检查是否获取到了 ID Token
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          // 恢复原始 token
          await openaiAccountService.updateAccount(id, {
            refreshToken: currentAccount.refreshToken,
            accessToken: currentAccount.accessToken,
            idToken: currentAccount.idToken
          })

          return res.status(400).json({
            success: false,
            message: '无法获取 ID Token，请检查 Refresh Token 是否有效',
            error: 'Invalid refresh token'
          })
        }

        logger.success(`Token 验证成功，继续更新账户信息`)
      } catch (refreshError) {
        // 刷新失败，恢复原始 token
        logger.warn(`❌ Token 验证失败，恢复原始配置: ${refreshError.message}`)
        await openaiAccountService.updateAccount(id, {
          refreshToken: currentAccount.refreshToken,
          accessToken: currentAccount.accessToken,
          idToken: currentAccount.idToken,
          proxy: currentAccount.proxy
        })

        // 构建详细的错误信息
        const errorResponse = {
          success: false,
          message: '更新失败',
          error: refreshError.message
        }

        // 添加更详细的错误信息
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }

        // 提供更友好的错误提示
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }

        return res.status(400).json(errorResponse)
      }
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，移除所有原分组关联
      if (currentAccount.accountType === 'group') {
        await accountGroupService.removeAccountFromAllGroups(id)
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(id, mappedUpdates.groupIds, 'openai')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(id)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(id, mappedUpdates.groupId, 'openai')
        }
      }
    }

    // 准备更新数据
    const updateData = { ...mappedUpdates }

    // 处理敏感数据加密
    if (mappedUpdates.openaiOauth) {
      updateData.openaiOauth = mappedUpdates.openaiOauth
      // 编辑时不允许直接输入 ID Token，只能通过刷新获取
      if (mappedUpdates.openaiOauth.accessToken) {
        updateData.accessToken = mappedUpdates.openaiOauth.accessToken
      }
      if (mappedUpdates.openaiOauth.refreshToken) {
        updateData.refreshToken = mappedUpdates.openaiOauth.refreshToken
      }
      if (mappedUpdates.openaiOauth.expires_in) {
        updateData.expiresAt = new Date(
          Date.now() + mappedUpdates.openaiOauth.expires_in * 1000
        ).toISOString()
      }
    }

    // 更新账户信息
    if (mappedUpdates.accountInfo) {
      updateData.accountId = mappedUpdates.accountInfo.accountId || currentAccount.accountId
      updateData.chatgptUserId =
        mappedUpdates.accountInfo.chatgptUserId || currentAccount.chatgptUserId
      updateData.organizationId =
        mappedUpdates.accountInfo.organizationId || currentAccount.organizationId
      updateData.organizationRole =
        mappedUpdates.accountInfo.organizationRole || currentAccount.organizationRole
      updateData.organizationTitle =
        mappedUpdates.accountInfo.organizationTitle || currentAccount.organizationTitle
      updateData.planType = mappedUpdates.accountInfo.planType || currentAccount.planType
      updateData.email = mappedUpdates.accountInfo.email || currentAccount.email
      updateData.emailVerified =
        mappedUpdates.accountInfo.emailVerified !== undefined
          ? mappedUpdates.accountInfo.emailVerified
          : currentAccount.emailVerified
    }

    const updatedAccount = await openaiAccountService.updateAccount(id, updateData)

    // 如果需要刷新但不强制成功（非关键更新）
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${id}`)
        await openaiAccountService.refreshAccountToken(id)
        logger.info(`✅ 刷新成功`)
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户信息已更新: ${refreshError.message}`)
      }
    }

    logger.success(`📝 Admin updated OpenAI account: ${id}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update OpenAI account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 OpenAI 账户
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账户不存在'
      })
    }

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai')

    // 如果账户在分组中，从分组中移除
    if (account.accountType === 'group') {
      const group = await accountGroupService.getAccountGroup(id)
      if (group) {
        await accountGroupService.removeAccountFromGroup(id, group.id)
      }
    }

    await openaiAccountService.deleteAccount(id)

    let message = 'OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(
      `✅ 删除 OpenAI 账户成功: ${account.name} (ID: ${id}), unbound ${unboundCount} keys`
    )

    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('删除 OpenAI 账户失败:', error)
    return res.status(500).json({
      success: false,
      message: '删除账户失败',
      error: error.message
    })
  }
})

// 切换 OpenAI 账户状态
router.put('/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await redis.getOpenAiAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账户不存在'
      })
    }

    // 切换启用状态
    account.enabled = !account.enabled
    account.updatedAt = new Date().toISOString()

    // TODO: 更新方法
    // await redis.updateOpenAiAccount(id, account)

    logger.success(
      `✅ ${account.enabled ? '启用' : '禁用'} OpenAI 账户: ${account.name} (ID: ${id})`
    )

    return res.json({
      success: true,
      data: account
    })
  } catch (error) {
    logger.error('切换 OpenAI 账户状态失败:', error)
    return res.status(500).json({
      success: false,
      message: '切换账户状态失败',
      error: error.message
    })
  }
})

// 重置 OpenAI 账户状态（清除所有异常状态）
router.post('/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await openaiAccountService.resetAccountStatus(accountId)

    logger.success(`Admin reset status for OpenAI account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换 OpenAI 账户调度状态
router.put('/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await openaiAccountService.toggleSchedulable(accountId)

    // 如果账号被禁用，发送webhook通知
    if (!result.schedulable) {
      // 获取账号信息
      const account = await redis.getOpenAiAccount(accountId)
      if (account) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || 'OpenAI Account',
          platform: 'openai',
          status: 'disabled',
          errorCode: 'OPENAI_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }
    }

    return res.json({
      success: result.success,
      schedulable: result.schedulable,
      message: result.schedulable ? '已启用调度' : '已禁用调度'
    })
  } catch (error) {
    logger.error('切换 OpenAI 账户调度状态失败:', error)
    return res.status(500).json({
      success: false,
      message: '切换调度状态失败',
      error: error.message
    })
  }
})

module.exports = router
