/**
 * Admin Routes - Qwen 账户管理
 * OAuth Device Code Flow 方式授权的 Qwen 账户
 */

const express = require('express')
const crypto = require('crypto')
const axios = require('axios')
const router = express.Router()

const qwenAccountService = require('../../services/qwenAccountService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const ProxyHelper = require('../../utils/proxyHelper')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

// 从 qwenAccountService 获取配置，避免重复定义
const QWEN_DEVICE_ENDPOINT = qwenAccountService.qwenDeviceEndpoint
const QWEN_TOKEN_ENDPOINT = qwenAccountService.qwenTokenEndpoint
const QWEN_CLIENT_ID = qwenAccountService.qwenClientId
const QWEN_SCOPE = qwenAccountService.qwenScope
const QWEN_AUTH_BASE_URL = qwenAccountService.qwenAuthBaseUrl
const QWEN_AUTH_CLIENT = qwenAccountService.qwenAuthClient

/**
 * 生成 PKCE code verifier
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * 生成 PKCE code challenge
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/**
 * POST 表单请求助手
 */
async function postForm(url, params, proxyConfig = null) {
  const body = new URLSearchParams(params)
  const proxyAgent = proxyConfig ? ProxyHelper.createProxyAgent(proxyConfig) : null

  const requestOptions = {
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'claude-cli/1.0.56 (external, cli)'
    },
    data: body.toString(),
    timeout: 30000,
    ...(proxyAgent && {
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      proxy: false
    })
  }

  const response = await axios(requestOptions)
  const data = response.data

  if (!response.status || response.status < 200 || response.status >= 300) {
    const error = data?.error || data?.message || `HTTP ${response.status}`
    throw new Error(String(error))
  }

  return data
}

// ==================== Qwen 账户管理 API ====================

// 生成 Qwen Device Code
router.post('/qwen-accounts/generate-device-code', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body || {}

    // 生成 PKCE 参数
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    const params = {
      client_id: QWEN_CLIENT_ID,
      scope: QWEN_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    }

    const data = await postForm(QWEN_DEVICE_ENDPOINT, params, proxy)

    const deviceCode = String(data.device_code || '')
    const userCode = String(data.user_code || '')
    const expiresIn = Number(data.expires_in || 0)
    const interval = Number(data.interval || 5)

    if (!deviceCode || !userCode || !expiresIn) {
      return res.status(500).json({ error: 'Invalid device code response from Qwen API' })
    }

    // 存储 Device Session 到 Redis
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    await redis.setQwenDeviceSession(sessionId, {
      deviceCode,
      userCode,
      codeVerifier,
      codeChallenge,
      interval: interval.toString(),
      expiresIn: expiresIn.toString(),
      expiresAt,
      proxy: proxy ? JSON.stringify(proxy) : '',
      createdAt: new Date().toISOString()
    })

    logger.success('Generated Qwen device code successfully', { sessionId, userCode })

    return res.json({
      success: true,
      data: {
        sessionId,
        deviceCode,
        userCode,
        verificationUri: data.verification_uri || QWEN_AUTH_BASE_URL,
        verificationUriComplete: `${QWEN_AUTH_BASE_URL}${userCode}${QWEN_AUTH_CLIENT}`,
        expiresIn,
        interval,
        instructions: [
          '1. 使用下方验证码进入授权页面并确认访问权限。',
          '2. 在授权页面登录 Qwen 账户并点击允许。',
          '3. 回到此处点击"完成授权"完成凭证获取。'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Qwen device code:', error)
    return res
      .status(500)
      .json({ error: 'Failed to generate device code', message: error.message })
  }
})

// 轮询 Token
router.post('/qwen-accounts/poll-token', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body || {}

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    // 获取 Device Session
    const session = await redis.getQwenDeviceSession(sessionId)
    if (!session || !session.deviceCode) {
      return res.status(400).json({ error: 'Invalid or expired session' })
    }

    // 检查会话是否过期
    if (new Date() > new Date(session.expiresAt)) {
      await redis.deleteQwenDeviceSession(sessionId)
      return res.status(400).json({ error: 'Session has expired, please generate a new device code' })
    }

    // 解析代理配置
    let proxyConfig = null
    if (session.proxy) {
      try {
        proxyConfig = JSON.parse(session.proxy)
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 轮询 Token 端点
    const params = {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: QWEN_CLIENT_ID,
      device_code: session.deviceCode,
      code_verifier: session.codeVerifier
    }

    try {
      const data = await postForm(QWEN_TOKEN_ENDPOINT, params, proxyConfig)

      // 成功获取 Token
      const accessToken = String(data.access_token || '')
      const refreshToken = String(data.refresh_token || '')
      const expiresIn = Number(data.expires_in || 0)
      const tokenType = String(data.token_type || '')
      const resourceUrl = data.resource_url ? String(data.resource_url) : undefined

      if (!accessToken) {
        return res.json({ success: false, pending: true, error: 'authorization_pending' })
      }

      // 构建 Qwen OAuth 数据
      const qwenOauth = {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType,
        resourceUrl,
        provider: 'qwen',
        obtainedAt: new Date().toISOString()
      }

      // 删除 Device Session
      await redis.deleteQwenDeviceSession(sessionId)

      logger.success('Successfully obtained Qwen access token', { sessionId })

      return res.json({
        success: true,
        data: { qwenOauth }
      })
    } catch (pollError) {
      // 特殊处理：检查是否是 AxiosError 并提取响应数据
      const responseData = pollError.response?.data
      const errorCode = responseData?.error || ''
      const errorDescription = responseData?.error_description || pollError.message || ''

      // 处理轮询状态：authorization_pending 和 slow_down 是正常的轮询响应
      if (errorCode === 'authorization_pending' || errorCode === 'slow_down') {
        const remainingSeconds = Math.max(
          0,
          Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
        )
        return res.json({
          success: false,
          pending: true,
          error: errorCode,
          message: errorCode === 'slow_down' ? '请求过于频繁，请稍后再试' : '等待用户授权',
          retryAfter: Number(session.interval) || 5,
          expiresIn: remainingSeconds
        })
      }

      if (errorCode === 'expired_token' || errorDescription.includes('expired_token')) {
        await redis.deleteQwenDeviceSession(sessionId)
        return res.status(400).json({
          error: 'Device code expired',
          message: '授权已过期，请重新生成设备码并再次授权'
        })
      }

      throw pollError
    }
  } catch (error) {
    logger.error('❌ Failed to poll Qwen token:', error)
    return res.status(500).json({
      error: 'Failed to poll token',
      message: error.message
    })
  }
})

// 获取所有 Qwen 账户
router.get('/qwen-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await qwenAccountService.getAllAccounts(false, { maskSensitive: true })
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'qwen')
          const formattedAccount = formatAccountExpiry(account)

          return {
            ...formattedAccount,
            schedulable: account.schedulable === 'true',
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (error) {
          logger.warn(`Failed to get stats for Qwen account ${account.id}:`, error.message)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            usage: {
              daily: { tokens: 0, requests: 0 },
              total: { tokens: 0, requests: 0 },
              averages: { rpm: 0, tpm: 0 }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get Qwen accounts:', error)
    return res.status(500).json({ error: 'Failed to get Qwen accounts', message: error.message })
  }
})

// 创建 Qwen 账户
router.post('/qwen-accounts', authenticateAdmin, async (req, res) => {
  try {
    const account = await qwenAccountService.createAccount(req.body)
    logger.success(`Created Qwen account: ${account.name} (${account.id})`)

    const formattedAccount = formatAccountExpiry(account)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('Failed to create Qwen account:', error)
    return res.status(500).json({ error: 'Failed to create Qwen account', message: error.message })
  }
})

// 更新 Qwen 账户
router.put('/qwen-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = { ...req.body }

    // 映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Qwen', id)

    await qwenAccountService.updateAccount(id, mappedUpdates)
    const updatedAccount = await qwenAccountService.getAccount(id)

    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error(`Failed to update Qwen account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to update Qwen account', message: error.message })
  }
})

// 切换 Qwen 账户调度状态
router.put('/qwen-accounts/:id/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await qwenAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ error: 'Qwen account not found' })
    }

    const currentSchedulable = account.schedulable === true || account.schedulable === 'true'
    const newSchedulable = !currentSchedulable

    await qwenAccountService.updateAccount(id, {
      schedulable: newSchedulable ? 'true' : 'false'
    })

    if (!newSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'Qwen Account',
        platform: 'qwen',
        status: 'disabled',
        errorCode: 'QWEN_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled Qwen account schedulable status: ${id} -> ${
        newSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )

    return res.json({ success: true, schedulable: newSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle Qwen account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取单个 Qwen 账户详细信息
router.get('/qwen-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await qwenAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Qwen account not found'
      })
    }

    // 获取使用统计
    let usageStats
    try {
      usageStats = await redis.getAccountUsageStats(account.id, 'qwen')
    } catch (error) {
      logger.debug(`Failed to get usage stats for Qwen account ${account.id}:`, error)
      usageStats = {
        daily: { tokens: 0, requests: 0, allTokens: 0 },
        total: { tokens: 0, requests: 0, allTokens: 0 },
        averages: { rpm: 0, tpm: 0 }
      }
    }

    const accountDetails = {
      ...account,
      // 隐藏敏感信息
      accessToken: account.accessToken ? '***' : '',
      refreshToken: account.refreshToken ? '***' : '',
      // 映射字段：使用 subscriptionExpiresAt 作为前端显示的 expiresAt
      expiresAt: account.subscriptionExpiresAt || null,
      schedulable: account.schedulable === 'true',
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
    logger.error(`Failed to get Qwen account ${req.params.id}:`, error)
    return res.status(500).json({
      error: 'Failed to get Qwen account',
      message: error.message
    })
  }
})

// 删除 Qwen 账户
router.delete('/qwen-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await qwenAccountService.deleteAccount(id)
    return res.json({ success: true, message: 'Qwen account deleted successfully' })
  } catch (error) {
    logger.error(`Failed to delete Qwen account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to delete Qwen account', message: error.message })
  }
})

// 刷新 Qwen 账户 token
router.post('/qwen-accounts/:id/refresh-token', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await qwenAccountService.refreshAccessToken(id)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error(`Failed to refresh Qwen account token ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

module.exports = router
