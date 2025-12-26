const redisClient = require('../models/redis')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const https = require('https')
const config = require('../../config/config')
const logger = require('../utils/logger')
const { OAuth2Client } = require('google-auth-library')
const { maskToken } = require('../utils/tokenMask')
const ProxyHelper = require('../utils/proxyHelper')
const {
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError,
  logTokenUsage,
  logRefreshSkipped
} = require('../utils/tokenRefreshLogger')
const tokenRefreshService = require('./tokenRefreshService')
const LRUCache = require('../utils/lruCache')
const antigravityClient = require('./antigravityClient')

// Gemini OAuth 配置 - 支持 Gemini CLI 与 Antigravity 两种 OAuth 应用
const OAUTH_PROVIDER_GEMINI_CLI = 'gemini-cli'
const OAUTH_PROVIDER_ANTIGRAVITY = 'antigravity'

const OAUTH_PROVIDERS = {
  [OAUTH_PROVIDER_GEMINI_CLI]: {
    // Gemini CLI OAuth 配置（公开）
    clientId:
      process.env.GEMINI_OAUTH_CLIENT_ID ||
      '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET || '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',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  },
  [OAUTH_PROVIDER_ANTIGRAVITY]: {
    // Antigravity OAuth 配置（参考 gcli2api）
    clientId:
      process.env.ANTIGRAVITY_OAUTH_CLIENT_ID ||
      '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    clientSecret:
      process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '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',
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/cclog',
      'https://www.googleapis.com/auth/experimentsandconfigs'
    ]
  }
}

if (!process.env.GEMINI_OAUTH_CLIENT_SECRET) {
  logger.warn(
    '⚠️ GEMINI_OAUTH_CLIENT_SECRET 未设置，使用内置默认值（建议在生产环境通过环境变量覆盖）'
  )
}
if (!process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET) {
  logger.warn(
    '⚠️ ANTIGRAVITY_OAUTH_CLIENT_SECRET 未设置，使用内置默认值（建议在生产环境通过环境变量覆盖）'
  )
}

function normalizeOauthProvider(oauthProvider) {
  if (!oauthProvider) {
    return OAUTH_PROVIDER_GEMINI_CLI
  }
  return oauthProvider === OAUTH_PROVIDER_ANTIGRAVITY
    ? OAUTH_PROVIDER_ANTIGRAVITY
    : OAUTH_PROVIDER_GEMINI_CLI
}

function getOauthProviderConfig(oauthProvider) {
  const normalized = normalizeOauthProvider(oauthProvider)
  return OAUTH_PROVIDERS[normalized] || OAUTH_PROVIDERS[OAUTH_PROVIDER_GEMINI_CLI]
}

// 🌐 TCP Keep-Alive Agent 配置
// 解决长时间流式请求中 NAT/防火墙空闲超时导致的连接中断问题
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // 每30秒发送一次 keep-alive 探测
  timeout: 120000, // 120秒连接超时
  maxSockets: 100, // 最大并发连接数
  maxFreeSockets: 10 // 保持的空闲连接数
})

logger.info('🌐 Gemini HTTPS Agent initialized with TCP Keep-Alive support')

async function fetchAvailableModelsAntigravity(
  accessToken,
  proxyConfig = null,
  refreshToken = null
) {
  try {
    let effectiveToken = accessToken
    if (refreshToken) {
      try {
        const client = await getOauthClient(
          accessToken,
          refreshToken,
          proxyConfig,
          OAUTH_PROVIDER_ANTIGRAVITY
        )
        if (client && client.getAccessToken) {
          const latest = await client.getAccessToken()
          if (latest?.token) {
            effectiveToken = latest.token
          }
        }
      } catch (error) {
        logger.warn('Failed to refresh Antigravity access token for models list:', {
          message: error.message
        })
      }
    }

    const data = await antigravityClient.fetchAvailableModels({
      accessToken: effectiveToken,
      proxyConfig
    })
    const modelsDict = data?.models
    const created = Math.floor(Date.now() / 1000)

    const models = []
    const seen = new Set()
    const {
      getAntigravityModelAlias,
      getAntigravityModelMetadata,
      normalizeAntigravityModelInput
    } = require('../utils/antigravityModel')

    const pushModel = (modelId) => {
      if (!modelId || seen.has(modelId)) {
        return
      }
      seen.add(modelId)
      const metadata = getAntigravityModelMetadata(modelId)
      const entry = {
        id: modelId,
        object: 'model',
        created,
        owned_by: 'antigravity'
      }
      if (metadata?.name) {
        entry.name = metadata.name
      }
      if (metadata?.maxCompletionTokens) {
        entry.max_completion_tokens = metadata.maxCompletionTokens
      }
      if (metadata?.thinking) {
        entry.thinking = metadata.thinking
      }
      models.push(entry)
    }

    if (modelsDict && typeof modelsDict === 'object') {
      for (const modelId of Object.keys(modelsDict)) {
        const normalized = normalizeAntigravityModelInput(modelId)
        const alias = getAntigravityModelAlias(normalized)
        if (!alias) {
          continue
        }
        pushModel(alias)

        if (alias.endsWith('-thinking')) {
          pushModel(alias.replace(/-thinking$/, ''))
        }

        if (alias.startsWith('gemini-claude-')) {
          pushModel(alias.replace(/^gemini-/, ''))
        }
      }
    }

    return models
  } catch (error) {
    logger.error('Failed to fetch Antigravity models:', error.response?.data || error.message)
    return [
      {
        id: 'gemini-2.5-flash',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'antigravity'
      }
    ]
  }
}

async function countTokensAntigravity(client, contents, model, proxyConfig = null) {
  const { token } = await client.getAccessToken()
  const response = await antigravityClient.countTokens({
    accessToken: token,
    proxyConfig,
    contents,
    model
  })
  return response
}

// 加密相关常量
const ALGORITHM = 'aes-256-cbc'
const ENCRYPTION_SALT = 'gemini-account-salt'
const IV_LENGTH = 16

// 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
// scryptSync 是 CPU 密集型操作，缓存可以减少 95%+ 的 CPU 占用
let _encryptionKeyCache = null

// 🔄 解密结果缓存，提高解密性能
const decryptCache = new LRUCache(500)

// 生成加密密钥（使用与 claudeAccountService 相同的方法）
function generateEncryptionKey() {
  if (!_encryptionKeyCache) {
    _encryptionKeyCache = crypto.scryptSync(config.security.encryptionKey, ENCRYPTION_SALT, 32)
    logger.info('🔑 Gemini encryption key derived and cached for performance optimization')
  }
  return _encryptionKeyCache
}

// Gemini 账户键前缀
const GEMINI_ACCOUNT_KEY_PREFIX = 'gemini_account:'
const SHARED_GEMINI_ACCOUNTS_KEY = 'shared_gemini_accounts'
const ACCOUNT_SESSION_MAPPING_PREFIX = 'gemini_session_account_mapping:'

// 加密函数
function encrypt(text) {
  if (!text) {
    return ''
  }
  const key = generateEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

// 解密函数
function decrypt(text) {
  if (!text) {
    return ''
  }

  // 🎯 检查缓存
  const cacheKey = crypto.createHash('sha256').update(text).digest('hex')
  const cached = decryptCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    const key = generateEncryptionKey()
    // IV 是固定长度的 32 个十六进制字符（16 字节）
    const ivHex = text.substring(0, 32)
    const encryptedHex = text.substring(33) // 跳过冒号

    const iv = Buffer.from(ivHex, 'hex')
    const encryptedText = Buffer.from(encryptedHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    const result = decrypted.toString()

    // 💾 存入缓存（5分钟过期）
    decryptCache.set(cacheKey, result, 5 * 60 * 1000)

    // 📊 定期打印缓存统计
    if ((decryptCache.hits + decryptCache.misses) % 1000 === 0) {
      decryptCache.printStats()
    }

    return result
  } catch (error) {
    logger.error('Decryption error:', error)
    return ''
  }
}

// 🧹 定期清理缓存（每10分钟）
setInterval(
  () => {
    decryptCache.cleanup()
    logger.info('🧹 Gemini decrypt cache cleanup completed', decryptCache.getStats())
  },
  10 * 60 * 1000
)

// 创建 OAuth2 客户端（支持代理配置）
function createOAuth2Client(redirectUri = null, proxyConfig = null, oauthProvider = null) {
  // 如果没有提供 redirectUri，使用默认值
  const uri = redirectUri || 'http://localhost:45462'
  const oauthConfig = getOauthProviderConfig(oauthProvider)

  // 准备客户端选项
  const clientOptions = {
    clientId: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    redirectUri: uri
  }

  // 如果有代理配置，设置 transporterOptions
  if (proxyConfig) {
    const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
    if (proxyAgent) {
      // 通过 transporterOptions 传递代理配置给底层的 Gaxios
      clientOptions.transporterOptions = {
        agent: proxyAgent,
        httpsAgent: proxyAgent
      }
      logger.debug('Created OAuth2Client with proxy configuration')
    }
  }

  return new OAuth2Client(clientOptions)
}

// 生成授权 URL (支持 PKCE 和代理)
async function generateAuthUrl(
  state = null,
  redirectUri = null,
  proxyConfig = null,
  oauthProvider = null
) {
  // 使用新的 redirect URI
  const finalRedirectUri = redirectUri || 'https://codeassist.google.com/authcode'
  const normalizedProvider = normalizeOauthProvider(oauthProvider)
  const oauthConfig = getOauthProviderConfig(normalizedProvider)
  const oAuth2Client = createOAuth2Client(finalRedirectUri, proxyConfig, normalizedProvider)

  if (proxyConfig) {
    logger.info(
      `🌐 Using proxy for Gemini auth URL generation: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    logger.debug('🌐 No proxy configured for Gemini auth URL generation')
  }

  // 生成 PKCE code verifier
  const codeVerifier = await oAuth2Client.generateCodeVerifierAsync()
  const stateValue = state || crypto.randomBytes(32).toString('hex')

  const authUrl = oAuth2Client.generateAuthUrl({
    redirect_uri: finalRedirectUri,
    access_type: 'offline',
    scope: oauthConfig.scopes,
    code_challenge_method: 'S256',
    code_challenge: codeVerifier.codeChallenge,
    state: stateValue,
    prompt: 'select_account'
  })

  return {
    authUrl,
    state: stateValue,
    codeVerifier: codeVerifier.codeVerifier,
    redirectUri: finalRedirectUri,
    oauthProvider: normalizedProvider
  }
}

// 轮询检查 OAuth 授权状态
async function pollAuthorizationStatus(sessionId, maxAttempts = 60, interval = 2000) {
  let attempts = 0
  const client = redisClient.getClientSafe()

  while (attempts < maxAttempts) {
    try {
      const sessionData = await client.get(`oauth_session:${sessionId}`)
      if (!sessionData) {
        throw new Error('OAuth session not found')
      }

      const session = JSON.parse(sessionData)
      if (session.code) {
        // 授权码已获取，交换 tokens
        const tokens = await exchangeCodeForTokens(session.code)

        // 清理 session
        await client.del(`oauth_session:${sessionId}`)

        return {
          success: true,
          tokens
        }
      }

      if (session.error) {
        // 授权失败
        await client.del(`oauth_session:${sessionId}`)
        return {
          success: false,
          error: session.error
        }
      }

      // 等待下一次轮询
      await new Promise((resolve) => setTimeout(resolve, interval))
      attempts++
    } catch (error) {
      logger.error('Error polling authorization status:', error)
      throw error
    }
  }

  // 超时
  await client.del(`oauth_session:${sessionId}`)
  return {
    success: false,
    error: 'Authorization timeout'
  }
}

// 交换授权码获取 tokens (支持 PKCE 和代理)
async function exchangeCodeForTokens(
  code,
  redirectUri = null,
  codeVerifier = null,
  proxyConfig = null,
  oauthProvider = null
) {
  try {
    const normalizedProvider = normalizeOauthProvider(oauthProvider)
    const oauthConfig = getOauthProviderConfig(normalizedProvider)
    // 创建带代理配置的 OAuth2Client
    const oAuth2Client = createOAuth2Client(redirectUri, proxyConfig, normalizedProvider)

    if (proxyConfig) {
      logger.info(
        `🌐 Using proxy for Gemini token exchange: ${ProxyHelper.getProxyDescription(proxyConfig)}`
      )
    } else {
      logger.debug('🌐 No proxy configured for Gemini token exchange')
    }

    const tokenParams = {
      code,
      redirect_uri: redirectUri
    }

    // 如果提供了 codeVerifier，添加到参数中
    if (codeVerifier) {
      tokenParams.codeVerifier = codeVerifier
    }

    const { tokens } = await oAuth2Client.getToken(tokenParams)

    // 转换为兼容格式
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope || oauthConfig.scopes.join(' '),
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || Date.now() + tokens.expires_in * 1000
    }
  } catch (error) {
    logger.error('Error exchanging code for tokens:', error)
    throw new Error('Failed to exchange authorization code')
  }
}

// 刷新访问令牌
async function refreshAccessToken(refreshToken, proxyConfig = null, oauthProvider = null) {
  const normalizedProvider = normalizeOauthProvider(oauthProvider)
  const oauthConfig = getOauthProviderConfig(normalizedProvider)
  // 创建带代理配置的 OAuth2Client
  const oAuth2Client = createOAuth2Client(null, proxyConfig, normalizedProvider)

  try {
    // 设置 refresh_token
    oAuth2Client.setCredentials({
      refresh_token: refreshToken
    })

    if (proxyConfig) {
      logger.info(
        `🔄 Using proxy for Gemini token refresh: ${ProxyHelper.maskProxyInfo(proxyConfig)}`
      )
    } else {
      logger.debug('🔄 No proxy configured for Gemini token refresh')
    }

    // 调用 refreshAccessToken 获取新的 tokens
    const response = await oAuth2Client.refreshAccessToken()
    const { credentials } = response

    // 检查是否成功获取了新的 access_token
    if (!credentials || !credentials.access_token) {
      throw new Error('No access token returned from refresh')
    }

    logger.info(
      `🔄 Successfully refreshed Gemini token. New expiry: ${new Date(credentials.expiry_date).toISOString()}`
    )

    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken, // 保留原 refresh_token 如果没有返回新的
      scope: credentials.scope || oauthConfig.scopes.join(' '),
      token_type: credentials.token_type || 'Bearer',
      expiry_date: credentials.expiry_date || Date.now() + 3600000 // 默认1小时过期
    }
  } catch (error) {
    logger.error('Error refreshing access token:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      hasProxy: !!proxyConfig,
      proxy: proxyConfig ? ProxyHelper.maskProxyInfo(proxyConfig) : 'No proxy'
    })
    throw new Error(`Failed to refresh access token: ${error.message}`)
  }
}

// 创建 Gemini 账户
async function createAccount(accountData) {
  const id = uuidv4()
  const now = new Date().toISOString()
  const oauthProvider = normalizeOauthProvider(accountData.oauthProvider)
  const oauthConfig = getOauthProviderConfig(oauthProvider)

  // 处理凭证数据
  let geminiOauth = null
  let accessToken = ''
  let refreshToken = ''
  let expiresAt = ''

  if (accountData.geminiOauth || accountData.accessToken) {
    // 如果提供了完整的 OAuth 数据
    if (accountData.geminiOauth) {
      geminiOauth =
        typeof accountData.geminiOauth === 'string'
          ? accountData.geminiOauth
          : JSON.stringify(accountData.geminiOauth)

      const oauthData =
        typeof accountData.geminiOauth === 'string'
          ? JSON.parse(accountData.geminiOauth)
          : accountData.geminiOauth

      accessToken = oauthData.access_token || ''
      refreshToken = oauthData.refresh_token || ''
      expiresAt = oauthData.expiry_date ? new Date(oauthData.expiry_date).toISOString() : ''
    } else {
      // 如果只提供了 access token
      ;({ accessToken } = accountData)
      refreshToken = accountData.refreshToken || ''

      // 构造完整的 OAuth 数据
      geminiOauth = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: accountData.scope || oauthConfig.scopes.join(' '),
        token_type: accountData.tokenType || 'Bearer',
        expiry_date: accountData.expiryDate || Date.now() + 3600000 // 默认1小时
      })

      expiresAt = new Date(accountData.expiryDate || Date.now() + 3600000).toISOString()
    }
  }

  const account = {
    id,
    platform: 'gemini', // 标识为 Gemini 账户
    name: accountData.name || 'Gemini Account',
    description: accountData.description || '',
    accountType: accountData.accountType || 'shared',
    isActive: 'true',
    status: 'active',

    // 调度相关
    schedulable: accountData.schedulable !== undefined ? String(accountData.schedulable) : 'true',
    priority: accountData.priority || 50, // 调度优先级 (1-100，数字越小优先级越高)

    // OAuth 相关字段（加密存储）
    geminiOauth: geminiOauth ? encrypt(geminiOauth) : '',
    accessToken: accessToken ? encrypt(accessToken) : '',
    refreshToken: refreshToken ? encrypt(refreshToken) : '',
    expiresAt, // OAuth Token 过期时间（技术字段，自动刷新）
    // 只有OAuth方式才有scopes，手动添加的没有
    scopes: accountData.geminiOauth ? accountData.scopes || oauthConfig.scopes.join(' ') : '',
    oauthProvider,

    // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
    subscriptionExpiresAt: accountData.subscriptionExpiresAt || null,

    // 代理设置
    proxy: accountData.proxy ? JSON.stringify(accountData.proxy) : '',

    // 项目 ID（Google Cloud/Workspace 账号需要）
    projectId: accountData.projectId || '',

    // 临时项目 ID（从 loadCodeAssist 接口自动获取）
    tempProjectId: accountData.tempProjectId || '',

    // 支持的模型列表（可选）
    supportedModels: accountData.supportedModels || [], // 空数组表示支持所有模型

    // 时间戳
    createdAt: now,
    updatedAt: now,
    lastUsedAt: '',
    lastRefreshAt: ''
  }

  // 保存到 Redis
  const client = redisClient.getClientSafe()
  await client.hset(`${GEMINI_ACCOUNT_KEY_PREFIX}${id}`, account)

  // 如果是共享账户，添加到共享账户集合
  if (account.accountType === 'shared') {
    await client.sadd(SHARED_GEMINI_ACCOUNTS_KEY, id)
  }

  logger.info(`Created Gemini account: ${id}`)

  // 返回时解析代理配置
  const returnAccount = { ...account }
  if (returnAccount.proxy) {
    try {
      returnAccount.proxy = JSON.parse(returnAccount.proxy)
    } catch (e) {
      returnAccount.proxy = null
    }
  }

  return returnAccount
}

// 获取账户
async function getAccount(accountId) {
  const client = redisClient.getClientSafe()
  const accountData = await client.hgetall(`${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`)

  if (!accountData || Object.keys(accountData).length === 0) {
    return null
  }

  // 解密敏感字段
  if (accountData.geminiOauth) {
    accountData.geminiOauth = decrypt(accountData.geminiOauth)
  }
  if (accountData.accessToken) {
    accountData.accessToken = decrypt(accountData.accessToken)
  }
  if (accountData.refreshToken) {
    accountData.refreshToken = decrypt(accountData.refreshToken)
  }

  // 解析代理配置
  if (accountData.proxy) {
    try {
      accountData.proxy = JSON.parse(accountData.proxy)
    } catch (e) {
      // 如果解析失败，保持原样或设置为null
      accountData.proxy = null
    }
  }

  // 转换 schedulable 字符串为布尔值（与 claudeConsoleAccountService 保持一致）
  accountData.schedulable = accountData.schedulable !== 'false' // 默认为true，只有明确设置为'false'才为false

  return accountData
}

// 更新账户
async function updateAccount(accountId, updates) {
  const existingAccount = await getAccount(accountId)
  if (!existingAccount) {
    throw new Error('Account not found')
  }

  const now = new Date().toISOString()
  updates.updatedAt = now

  // 检查是否新增了 refresh token
  // existingAccount.refreshToken 已经是解密后的值了（从 getAccount 返回）
  const oldRefreshToken = existingAccount.refreshToken || ''
  let needUpdateExpiry = false

  // 处理代理设置
  if (updates.proxy !== undefined) {
    updates.proxy = updates.proxy ? JSON.stringify(updates.proxy) : ''
  }

  // 处理 schedulable 字段，确保正确转换为字符串存储
  if (updates.schedulable !== undefined) {
    updates.schedulable = updates.schedulable.toString()
  }

  if (updates.oauthProvider !== undefined) {
    updates.oauthProvider = normalizeOauthProvider(updates.oauthProvider)
  }

  // 加密敏感字段
  if (updates.geminiOauth) {
    updates.geminiOauth = encrypt(
      typeof updates.geminiOauth === 'string'
        ? updates.geminiOauth
        : JSON.stringify(updates.geminiOauth)
    )
  }
  if (updates.accessToken) {
    updates.accessToken = encrypt(updates.accessToken)
  }
  if (updates.refreshToken) {
    updates.refreshToken = encrypt(updates.refreshToken)
    // 如果之前没有 refresh token，现在有了，标记需要更新过期时间
    if (!oldRefreshToken && updates.refreshToken) {
      needUpdateExpiry = true
    }
  }

  // 更新账户类型时处理共享账户集合
  const client = redisClient.getClientSafe()
  if (updates.accountType && updates.accountType !== existingAccount.accountType) {
    if (updates.accountType === 'shared') {
      await client.sadd(SHARED_GEMINI_ACCOUNTS_KEY, accountId)
    } else {
      await client.srem(SHARED_GEMINI_ACCOUNTS_KEY, accountId)
    }
  }

  // ✅ 关键：如果新增了 refresh token，只更新 token 过期时间
  // 不要覆盖 subscriptionExpiresAt
  if (needUpdateExpiry) {
    const newExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    updates.expiresAt = newExpiry // 只更新 OAuth Token 过期时间
    // ⚠️ 重要：不要修改 subscriptionExpiresAt
    logger.info(
      `🔄 New refresh token added for Gemini account ${accountId}, setting token expiry to 10 minutes`
    )
  }

  // ✅ 如果通过路由映射更新了 subscriptionExpiresAt，直接保存
  // subscriptionExpiresAt 是业务字段，与 token 刷新独立
  if (updates.subscriptionExpiresAt !== undefined) {
    // 直接保存，不做任何调整
  }

  // 如果通过 geminiOauth 更新，也要检查是否新增了 refresh token
  if (updates.geminiOauth && !oldRefreshToken) {
    const oauthData =
      typeof updates.geminiOauth === 'string'
        ? JSON.parse(decrypt(updates.geminiOauth))
        : updates.geminiOauth

    if (oauthData.refresh_token) {
      // 如果 expiry_date 设置的时间过长（超过1小时），调整为10分钟
      const providedExpiry = oauthData.expiry_date || 0
      const currentTime = Date.now()
      const oneHour = 60 * 60 * 1000

      if (providedExpiry - currentTime > oneHour) {
        const newExpiry = new Date(currentTime + 10 * 60 * 1000).toISOString()
        updates.expiresAt = newExpiry
        logger.info(
          `🔄 Adjusted expiry time to 10 minutes for Gemini account ${accountId} with refresh token`
        )
      }
    }
  }

  // 检查是否手动禁用了账号，如果是则发送webhook通知
  if (updates.isActive === 'false' && existingAccount.isActive !== 'false') {
    try {
      const webhookNotifier = require('../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: updates.name || existingAccount.name || 'Unknown Account',
        platform: 'gemini',
        status: 'disabled',
        errorCode: 'GEMINI_MANUALLY_DISABLED',
        reason: 'Account manually disabled by administrator'
      })
    } catch (webhookError) {
      logger.error('Failed to send webhook notification for manual account disable:', webhookError)
    }
  }

  await client.hset(`${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`, updates)

  logger.info(`Updated Gemini account: ${accountId}`)

  // 合并更新后的账户数据
  const updatedAccount = { ...existingAccount, ...updates }

  // 返回时解析代理配置
  if (updatedAccount.proxy && typeof updatedAccount.proxy === 'string') {
    try {
      updatedAccount.proxy = JSON.parse(updatedAccount.proxy)
    } catch (e) {
      updatedAccount.proxy = null
    }
  }

  return updatedAccount
}

// 删除账户
async function deleteAccount(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  // 从 Redis 删除
  const client = redisClient.getClientSafe()
  await client.del(`${GEMINI_ACCOUNT_KEY_PREFIX}${accountId}`)

  // 从共享账户集合中移除
  if (account.accountType === 'shared') {
    await client.srem(SHARED_GEMINI_ACCOUNTS_KEY, accountId)
  }

  // 清理会话映射
  const sessionMappings = await client.keys(`${ACCOUNT_SESSION_MAPPING_PREFIX}*`)
  for (const key of sessionMappings) {
    const mappedAccountId = await client.get(key)
    if (mappedAccountId === accountId) {
      await client.del(key)
    }
  }

  logger.info(`Deleted Gemini account: ${accountId}`)
  return true
}

// 获取所有账户
async function getAllAccounts() {
  const client = redisClient.getClientSafe()
  const keys = await client.keys(`${GEMINI_ACCOUNT_KEY_PREFIX}*`)
  const accounts = []

  for (const key of keys) {
    const accountData = await client.hgetall(key)
    if (accountData && Object.keys(accountData).length > 0) {
      // 获取限流状态信息
      const rateLimitInfo = await getAccountRateLimitInfo(accountData.id)

      // 解析代理配置
      if (accountData.proxy) {
        try {
          accountData.proxy = JSON.parse(accountData.proxy)
        } catch (e) {
          // 如果解析失败，设置为null
          accountData.proxy = null
        }
      }

      // 转换 schedulable 字符串为布尔值（与 getAccount 保持一致）
      accountData.schedulable = accountData.schedulable !== 'false' // 默认为true，只有明确设置为'false'才为false

      const tokenExpiresAt = accountData.expiresAt || null
      const subscriptionExpiresAt =
        accountData.subscriptionExpiresAt && accountData.subscriptionExpiresAt !== ''
          ? accountData.subscriptionExpiresAt
          : null

      // 不解密敏感字段，只返回基本信息
      accounts.push({
        ...accountData,
        geminiOauth: accountData.geminiOauth ? '[ENCRYPTED]' : '',
        accessToken: accountData.accessToken ? '[ENCRYPTED]' : '',
        refreshToken: accountData.refreshToken ? '[ENCRYPTED]' : '',

        // ✅ 前端显示订阅过期时间（业务字段）
        // 注意：前端看到的 expiresAt 实际上是 subscriptionExpiresAt
        tokenExpiresAt,
        subscriptionExpiresAt,
        expiresAt: subscriptionExpiresAt,

        // 添加 scopes 字段用于判断认证方式
        // 处理空字符串和默认值的情况
        scopes:
          accountData.scopes && accountData.scopes.trim() ? accountData.scopes.split(' ') : [],
        // 添加 hasRefreshToken 标记
        hasRefreshToken: !!accountData.refreshToken,
        // 添加限流状态信息（统一格式）
        rateLimitStatus: rateLimitInfo
          ? {
              isRateLimited: rateLimitInfo.isRateLimited,
              rateLimitedAt: rateLimitInfo.rateLimitedAt,
              minutesRemaining: rateLimitInfo.minutesRemaining
            }
          : {
              isRateLimited: false,
              rateLimitedAt: null,
              minutesRemaining: 0
            }
      })
    }
  }

  return accounts
}

// 选择可用账户（支持专属和共享账户）
async function selectAvailableAccount(apiKeyId, sessionHash = null) {
  // 首先检查是否有粘性会话
  const client = redisClient.getClientSafe()
  if (sessionHash) {
    const mappedAccountId = await client.get(`${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`)

    if (mappedAccountId) {
      const account = await getAccount(mappedAccountId)
      if (account && account.isActive === 'true' && !isTokenExpired(account)) {
        logger.debug(`Using sticky session account: ${mappedAccountId}`)
        return account
      }
    }
  }

  // 获取 API Key 信息
  const apiKeyData = await client.hgetall(`api_key:${apiKeyId}`)

  // 检查是否绑定了 Gemini 账户
  if (apiKeyData.geminiAccountId) {
    const account = await getAccount(apiKeyData.geminiAccountId)
    if (account && account.isActive === 'true') {
      // 检查 token 是否过期
      const isExpired = isTokenExpired(account)

      // 记录token使用情况
      logTokenUsage(account.id, account.name, 'gemini', account.expiresAt, isExpired)

      if (isExpired) {
        await refreshAccountToken(account.id)
        return await getAccount(account.id)
      }

      // 创建粘性会话映射
      if (sessionHash) {
        await client.setex(
          `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`,
          3600, // 1小时过期
          account.id
        )
      }

      return account
    }
  }

  // 从共享账户池选择
  const sharedAccountIds = await client.smembers(SHARED_GEMINI_ACCOUNTS_KEY)
  const availableAccounts = []

  for (const accountId of sharedAccountIds) {
    const account = await getAccount(accountId)
    if (
      account &&
      account.isActive === 'true' &&
      !isRateLimited(account) &&
      !isSubscriptionExpired(account)
    ) {
      availableAccounts.push(account)
    } else if (account && isSubscriptionExpired(account)) {
      logger.debug(
        `⏰ Skipping expired Gemini account: ${account.name}, expired at ${account.subscriptionExpiresAt}`
      )
    }
  }

  if (availableAccounts.length === 0) {
    throw new Error('No available Gemini accounts')
  }

  // 选择最少使用的账户
  availableAccounts.sort((a, b) => {
    const aLastUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
    const bLastUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    return aLastUsed - bLastUsed
  })

  const selectedAccount = availableAccounts[0]

  // 检查并刷新 token
  const isExpired = isTokenExpired(selectedAccount)

  // 记录token使用情况
  logTokenUsage(
    selectedAccount.id,
    selectedAccount.name,
    'gemini',
    selectedAccount.expiresAt,
    isExpired
  )

  if (isExpired) {
    await refreshAccountToken(selectedAccount.id)
    return await getAccount(selectedAccount.id)
  }

  // 创建粘性会话映射
  if (sessionHash) {
    await client.setex(`${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`, 3600, selectedAccount.id)
  }

  return selectedAccount
}

// 检查 token 是否过期
function isTokenExpired(account) {
  if (!account.expiresAt) {
    return true
  }

  const expiryTime = new Date(account.expiresAt).getTime()
  const now = Date.now()
  const buffer = 10 * 1000 // 10秒缓冲

  return now >= expiryTime - buffer
}

/**
 * 检查账户订阅是否过期
 * @param {Object} account - 账户对象
 * @returns {boolean} - true: 已过期, false: 未过期
 */
function isSubscriptionExpired(account) {
  if (!account.subscriptionExpiresAt) {
    return false // 未设置视为永不过期
  }
  const expiryDate = new Date(account.subscriptionExpiresAt)
  return expiryDate <= new Date()
}

// 检查账户是否被限流
function isRateLimited(account) {
  if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
    const limitedAt = new Date(account.rateLimitedAt).getTime()
    const now = Date.now()
    const limitDuration = 60 * 60 * 1000 // 1小时

    return now < limitedAt + limitDuration
  }
  return false
}

// 刷新账户 token
async function refreshAccountToken(accountId) {
  let lockAcquired = false
  let account = null

  try {
    account = await getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    if (!account.refreshToken) {
      throw new Error('No refresh token available')
    }

    // 尝试获取分布式锁
    lockAcquired = await tokenRefreshService.acquireRefreshLock(accountId, 'gemini')

    if (!lockAcquired) {
      // 如果无法获取锁，说明另一个进程正在刷新
      logger.info(
        `🔒 Token refresh already in progress for Gemini account: ${account.name} (${accountId})`
      )
      logRefreshSkipped(accountId, account.name, 'gemini', 'already_locked')

      // 等待一段时间后返回，期望其他进程已完成刷新
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 重新获取账户数据（可能已被其他进程刷新）
      const updatedAccount = await getAccount(accountId)
      if (updatedAccount && updatedAccount.accessToken) {
        const oauthConfig = getOauthProviderConfig(updatedAccount.oauthProvider)
        const accessToken = decrypt(updatedAccount.accessToken)
        return {
          access_token: accessToken,
          refresh_token: updatedAccount.refreshToken ? decrypt(updatedAccount.refreshToken) : '',
          expiry_date: updatedAccount.expiresAt ? new Date(updatedAccount.expiresAt).getTime() : 0,
          scope: updatedAccount.scopes || oauthConfig.scopes.join(' '),
          token_type: 'Bearer'
        }
      }

      throw new Error('Token refresh in progress by another process')
    }

    // 记录开始刷新
    logRefreshStart(accountId, account.name, 'gemini', 'manual_refresh')
    logger.info(`🔄 Starting token refresh for Gemini account: ${account.name} (${accountId})`)

    // account.refreshToken 已经是解密后的值（从 getAccount 返回）
    // 传入账户的代理配置
    const newTokens = await refreshAccessToken(
      account.refreshToken,
      account.proxy,
      account.oauthProvider
    )

    // 更新账户信息
    const updates = {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || account.refreshToken,
      expiresAt: new Date(newTokens.expiry_date).toISOString(),
      lastRefreshAt: new Date().toISOString(),
      geminiOauth: JSON.stringify(newTokens),
      status: 'active', // 刷新成功后，将状态更新为 active
      errorMessage: '' // 清空错误信息
    }

    await updateAccount(accountId, updates)

    // 记录刷新成功
    logRefreshSuccess(accountId, account.name, 'gemini', {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresAt: newTokens.expiry_date,
      scopes: newTokens.scope
    })

    logger.info(
      `Refreshed token for Gemini account: ${accountId} - Access Token: ${maskToken(newTokens.access_token)}`
    )

    return newTokens
  } catch (error) {
    // 记录刷新失败
    logRefreshError(accountId, account ? account.name : 'Unknown', 'gemini', error)

    logger.error(`Failed to refresh token for account ${accountId}:`, error)

    // 标记账户为错误状态（只有在账户存在时）
    if (account) {
      try {
        await updateAccount(accountId, {
          status: 'error',
          errorMessage: error.message
        })

        // 发送Webhook通知
        try {
          const webhookNotifier = require('../utils/webhookNotifier')
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId,
            accountName: account.name,
            platform: 'gemini',
            status: 'error',
            errorCode: 'GEMINI_ERROR',
            reason: `Token refresh failed: ${error.message}`
          })
        } catch (webhookError) {
          logger.error('Failed to send webhook notification:', webhookError)
        }
      } catch (updateError) {
        logger.error('Failed to update account status after refresh error:', updateError)
      }
    }

    throw error
  } finally {
    // 释放锁
    if (lockAcquired) {
      await tokenRefreshService.releaseRefreshLock(accountId, 'gemini')
    }
  }
}

// 标记账户被使用
async function markAccountUsed(accountId) {
  await updateAccount(accountId, {
    lastUsedAt: new Date().toISOString()
  })
}

// 设置账户限流状态
async function setAccountRateLimited(accountId, isLimited = true) {
  const updates = isLimited
    ? {
        rateLimitStatus: 'limited',
        rateLimitedAt: new Date().toISOString()
      }
    : {
        rateLimitStatus: '',
        rateLimitedAt: ''
      }

  await updateAccount(accountId, updates)
}

// 获取账户的限流信息（参考 claudeAccountService 的实现）
async function getAccountRateLimitInfo(accountId) {
  try {
    const account = await getAccount(accountId)
    if (!account) {
      return null
    }

    if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
      const rateLimitedAt = new Date(account.rateLimitedAt)
      const now = new Date()
      const minutesSinceRateLimit = Math.floor((now - rateLimitedAt) / (1000 * 60))

      // Gemini 限流持续时间为 1 小时
      const minutesRemaining = Math.max(0, 60 - minutesSinceRateLimit)
      const rateLimitEndAt = new Date(rateLimitedAt.getTime() + 60 * 60 * 1000).toISOString()

      return {
        isRateLimited: minutesRemaining > 0,
        rateLimitedAt: account.rateLimitedAt,
        minutesSinceRateLimit,
        minutesRemaining,
        rateLimitEndAt
      }
    }

    return {
      isRateLimited: false,
      rateLimitedAt: null,
      minutesSinceRateLimit: 0,
      minutesRemaining: 0,
      rateLimitEndAt: null
    }
  } catch (error) {
    logger.error(`❌ Failed to get rate limit info for Gemini account: ${accountId}`, error)
    return null
  }
}

// 获取配置的OAuth客户端 - 参考GeminiCliSimulator的getOauthClient方法（支持代理）
async function getOauthClient(accessToken, refreshToken, proxyConfig = null, oauthProvider = null) {
  const normalizedProvider = normalizeOauthProvider(oauthProvider)
  const oauthConfig = getOauthProviderConfig(normalizedProvider)
  const client = createOAuth2Client(null, proxyConfig, normalizedProvider)

  const creds = {
    access_token: accessToken,
    refresh_token: refreshToken,
    scope: oauthConfig.scopes.join(' '),
    token_type: 'Bearer',
    expiry_date: 1754269905646
  }

  if (proxyConfig) {
    logger.info(
      `🌐 Using proxy for Gemini OAuth client: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    logger.debug('🌐 No proxy configured for Gemini OAuth client')
  }

  // 设置凭据
  client.setCredentials(creds)

  // 验证凭据本地有效性
  const { token } = await client.getAccessToken()

  if (!token) {
    return false
  }

  // 验证服务器端token状态（检查是否被撤销）
  await client.getTokenInfo(token)

  logger.info('✅ OAuth客户端已创建')
  return client
}

// 通用的 Code Assist API 转发函数（用于简单的请求/响应端点）
// 适用于：loadCodeAssist, onboardUser, countTokens, listExperiments 等不需要特殊处理的端点
async function forwardToCodeAssist(client, apiMethod, requestBody, proxyConfig = null) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)

  logger.info(`📡 ${apiMethod} API调用开始`)

  const axiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${apiMethod}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: requestBody,
    timeout: 30000
  }

  // 添加代理配置
  if (proxyAgent) {
    // 只设置 httpsAgent，因为目标 URL 是 HTTPS (cloudcode-pa.googleapis.com)
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
    logger.info(`🌐 Using proxy for ${apiMethod}: ${ProxyHelper.getProxyDescription(proxyConfig)}`)
  } else {
    logger.debug(`🌐 No proxy configured for ${apiMethod}`)
  }

  const response = await axios(axiosConfig)

  logger.info(`✅ ${apiMethod} API调用成功`)
  return response.data
}

// 调用 Google Code Assist API 的 loadCodeAssist 方法（支持代理）
async function loadCodeAssist(client, projectId = null, proxyConfig = null) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  // 🔍 只有个人账户（无 projectId）才需要调用 tokeninfo/userinfo
  // 这些调用有助于 Google 获取临时 projectId
  if (!projectId) {
    const tokenInfoConfig = {
      url: 'https://oauth2.googleapis.com/tokeninfo',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({ access_token: token }).toString(),
      timeout: 15000
    }

    if (proxyAgent) {
      tokenInfoConfig.httpAgent = proxyAgent
      tokenInfoConfig.httpsAgent = proxyAgent
      tokenInfoConfig.proxy = false
    }

    try {
      await axios(tokenInfoConfig)
      logger.info('📋 tokeninfo 接口验证成功')
    } catch (error) {
      logger.warn('⚠️ tokeninfo 接口调用失败:', error.message)
    }

    const userInfoConfig = {
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*'
      },
      timeout: 15000
    }

    if (proxyAgent) {
      userInfoConfig.httpAgent = proxyAgent
      userInfoConfig.httpsAgent = proxyAgent
      userInfoConfig.proxy = false
    }

    try {
      await axios(userInfoConfig)
      logger.info('📋 userinfo 接口获取成功')
    } catch (error) {
      logger.warn('⚠️ userinfo 接口调用失败:', error.message)
    }
  }

  // 创建ClientMetadata
  const clientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI'
  }

  // 只有当projectId存在时才添加duetProject
  if (projectId) {
    clientMetadata.duetProject = projectId
  }

  const request = {
    metadata: clientMetadata
  }

  // 只有当projectId存在时才添加cloudaicompanionProject
  if (projectId) {
    request.cloudaicompanionProject = projectId
  }

  const axiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: request,
    timeout: 30000
  }

  // 添加代理配置
  if (proxyAgent) {
    // 只设置 httpsAgent，因为目标 URL 是 HTTPS (cloudcode-pa.googleapis.com)
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
    logger.info(
      `🌐 Using proxy for Gemini loadCodeAssist: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    logger.debug('🌐 No proxy configured for Gemini loadCodeAssist')
  }

  const response = await axios(axiosConfig)

  logger.info('📋 loadCodeAssist API调用成功')
  return response.data
}

// 获取onboard层级 - 参考GeminiCliSimulator的getOnboardTier方法
function getOnboardTier(loadRes) {
  // 用户层级枚举
  const UserTierId = {
    LEGACY: 'LEGACY',
    FREE: 'FREE',
    PRO: 'PRO'
  }

  if (loadRes.currentTier) {
    return loadRes.currentTier
  }

  for (const tier of loadRes.allowedTiers || []) {
    if (tier.isDefault) {
      return tier
    }
  }

  return {
    name: '',
    description: '',
    id: UserTierId.LEGACY,
    userDefinedCloudaicompanionProject: true
  }
}

// 调用 Google Code Assist API 的 onboardUser 方法（包含轮询逻辑，支持代理）
async function onboardUser(client, tierId, projectId, clientMetadata, proxyConfig = null) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()

  const onboardReq = {
    tierId,
    metadata: clientMetadata
  }

  // 只有当projectId存在时才添加cloudaicompanionProject
  if (projectId) {
    onboardReq.cloudaicompanionProject = projectId
  }

  // 创建基础axios配置
  const baseAxiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:onboardUser`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: onboardReq,
    timeout: 30000
  }

  // 添加代理配置
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  if (proxyAgent) {
    baseAxiosConfig.httpAgent = proxyAgent
    baseAxiosConfig.httpsAgent = proxyAgent
    baseAxiosConfig.proxy = false
    logger.info(
      `🌐 Using proxy for Gemini onboardUser: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    logger.debug('🌐 No proxy configured for Gemini onboardUser')
  }

  logger.info('📋 开始onboardUser API调用', {
    tierId,
    projectId,
    hasProjectId: !!projectId,
    isFreeTier: tierId === 'free-tier' || tierId === 'FREE'
  })

  // 轮询onboardUser直到长运行操作完成
  let lroRes = await axios(baseAxiosConfig)

  let attempts = 0
  const maxAttempts = 12 // 最多等待1分钟（5秒 * 12次）

  while (!lroRes.data.done && attempts < maxAttempts) {
    logger.info(`⏳ 等待onboardUser完成... (${attempts + 1}/${maxAttempts})`)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    lroRes = await axios(baseAxiosConfig)
    attempts++
  }

  if (!lroRes.data.done) {
    throw new Error('onboardUser操作超时')
  }

  logger.info('✅ onboardUser API调用完成')
  return lroRes.data
}

// 完整的用户设置流程 - 参考setup.ts的逻辑（支持代理）
async function setupUser(
  client,
  initialProjectId = null,
  clientMetadata = null,
  proxyConfig = null
) {
  logger.info('🚀 setupUser 开始', { initialProjectId, hasClientMetadata: !!clientMetadata })

  let projectId = initialProjectId || process.env.GOOGLE_CLOUD_PROJECT || null
  logger.info('📋 初始项目ID', { projectId, fromEnv: !!process.env.GOOGLE_CLOUD_PROJECT })

  // 默认的ClientMetadata
  if (!clientMetadata) {
    clientMetadata = {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: projectId
    }
    logger.info('🔧 使用默认 ClientMetadata')
  }

  // 调用loadCodeAssist
  logger.info('📞 调用 loadCodeAssist...')
  const loadRes = await loadCodeAssist(client, projectId, proxyConfig)
  logger.info('✅ loadCodeAssist 完成', {
    hasCloudaicompanionProject: !!loadRes.cloudaicompanionProject
  })

  // 如果没有projectId，尝试从loadRes获取
  if (!projectId && loadRes.cloudaicompanionProject) {
    projectId = loadRes.cloudaicompanionProject
    logger.info('📋 从 loadCodeAssist 获取项目ID', { projectId })
  }

  const tier = getOnboardTier(loadRes)
  logger.info('🎯 获取用户层级', {
    tierId: tier.id,
    userDefinedProject: tier.userDefinedCloudaicompanionProject
  })

  if (tier.userDefinedCloudaiCompanionProject && !projectId) {
    throw new Error('此账号需要设置GOOGLE_CLOUD_PROJECT环境变量或提供projectId')
  }

  // 调用onboardUser
  logger.info('📞 调用 onboardUser...', { tierId: tier.id, projectId })
  const lroRes = await onboardUser(client, tier.id, projectId, clientMetadata, proxyConfig)
  logger.info('✅ onboardUser 完成', { hasDone: !!lroRes.done, hasResponse: !!lroRes.response })

  const result = {
    projectId: lroRes.response?.cloudaicompanionProject?.id || projectId || '',
    userTier: tier.id,
    loadRes,
    onboardRes: lroRes.response || {}
  }

  logger.info('🎯 setupUser 完成', { resultProjectId: result.projectId, userTier: result.userTier })
  return result
}

// 调用 Code Assist API 计算 token 数量（支持代理）
async function countTokens(client, contents, model = 'gemini-2.0-flash-exp', proxyConfig = null) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()

  // 按照 gemini-cli 的转换格式构造请求
  const request = {
    request: {
      model: `models/${model}`,
      contents
    }
  }

  logger.info('📊 countTokens API调用开始', { model, contentsLength: contents.length })

  const axiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:countTokens`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: request,
    timeout: 30000
  }

  // 添加代理配置
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  if (proxyAgent) {
    // 只设置 httpsAgent，因为目标 URL 是 HTTPS (cloudcode-pa.googleapis.com)
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
    logger.info(
      `🌐 Using proxy for Gemini countTokens: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    logger.debug('🌐 No proxy configured for Gemini countTokens')
  }

  const response = await axios(axiosConfig)

  logger.info('✅ countTokens API调用成功', { totalTokens: response.data.totalTokens })
  return response.data
}

// 调用 Code Assist API 生成内容（非流式）
async function generateContent(
  client,
  requestData,
  userPromptId,
  projectId = null,
  sessionId = null,
  proxyConfig = null
) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()

  // 按照 gemini-cli 的转换格式构造请求
  const request = {
    model: requestData.model,
    request: {
      ...requestData.request,
      session_id: sessionId
    }
  }

  // 只有当 userPromptId 存在时才添加
  if (userPromptId) {
    request.user_prompt_id = userPromptId
  }

  // 只有当projectId存在时才添加project字段
  if (projectId) {
    request.project = projectId
  }

  logger.info('🤖 generateContent API调用开始', {
    model: requestData.model,
    userPromptId,
    projectId,
    sessionId
  })

  // 添加详细的请求日志
  logger.info('📦 generateContent 请求详情', {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:generateContent`,
    requestBody: JSON.stringify(request, null, 2)
  })

  const axiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:generateContent`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: request,
    timeout: 600000 // 生成内容可能需要更长时间
  }

  // 添加代理配置
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  if (proxyAgent) {
    // 只设置 httpsAgent，因为目标 URL 是 HTTPS (cloudcode-pa.googleapis.com)
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
    logger.info(
      `🌐 Using proxy for Gemini generateContent: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    // 没有代理时，使用 keepAlive agent 防止长时间请求被中断
    axiosConfig.httpsAgent = keepAliveAgent
    logger.debug('🌐 Using keepAlive agent for Gemini generateContent')
  }

  const response = await axios(axiosConfig)

  logger.info('✅ generateContent API调用成功')
  return response.data
}

// 调用 Antigravity 上游生成内容（非流式）
async function generateContentAntigravity(
  client,
  requestData,
  userPromptId,
  projectId = null,
  sessionId = null,
  proxyConfig = null
) {
  const { token } = await client.getAccessToken()
  const { model } = antigravityClient.buildAntigravityEnvelope({
    requestData,
    projectId,
    sessionId,
    userPromptId
  })

  logger.info('🪐 Antigravity generateContent API调用开始', {
    model,
    userPromptId,
    projectId,
    sessionId
  })

  const { response } = await antigravityClient.request({
    accessToken: token,
    proxyConfig,
    requestData,
    projectId,
    sessionId,
    userPromptId,
    stream: false
  })
  logger.info('✅ Antigravity generateContent API调用成功')
  return response.data
}

// 调用 Code Assist API 生成内容（流式）
async function generateContentStream(
  client,
  requestData,
  userPromptId,
  projectId = null,
  sessionId = null,
  signal = null,
  proxyConfig = null
) {
  const axios = require('axios')
  const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
  const CODE_ASSIST_API_VERSION = 'v1internal'

  const { token } = await client.getAccessToken()

  // 按照 gemini-cli 的转换格式构造请求
  const request = {
    model: requestData.model,
    request: {
      ...requestData.request,
      session_id: sessionId
    }
  }

  // 只有当 userPromptId 存在时才添加
  if (userPromptId) {
    request.user_prompt_id = userPromptId
  }

  // 只有当projectId存在时才添加project字段
  if (projectId) {
    request.project = projectId
  }

  logger.info('🌊 streamGenerateContent API调用开始', {
    model: requestData.model,
    userPromptId,
    projectId,
    sessionId
  })

  const axiosConfig = {
    url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent`,
    method: 'POST',
    params: {
      alt: 'sse'
    },
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: request,
    responseType: 'stream',
    timeout: 0 // 流式请求不设置超时限制，由 keepAlive 和 AbortSignal 控制
  }

  // 添加代理配置
  const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
  if (proxyAgent) {
    // 只设置 httpsAgent，因为目标 URL 是 HTTPS (cloudcode-pa.googleapis.com)
    // 同时设置 httpAgent 和 httpsAgent 可能导致 axios/follow-redirects 选择错误的协议
    axiosConfig.httpsAgent = proxyAgent
    axiosConfig.proxy = false
    logger.info(
      `🌐 Using proxy for Gemini streamGenerateContent: ${ProxyHelper.getProxyDescription(proxyConfig)}`
    )
  } else {
    // 没有代理时，使用 keepAlive agent 防止长时间流式请求被中断
    axiosConfig.httpsAgent = keepAliveAgent
    logger.debug('🌐 Using keepAlive agent for Gemini streamGenerateContent')
  }

  // 如果提供了中止信号，添加到配置中
  if (signal) {
    axiosConfig.signal = signal
  }

  const response = await axios(axiosConfig)

  logger.info('✅ streamGenerateContent API调用成功，开始流式传输')
  return response.data // 返回流对象
}

// 调用 Antigravity 上游生成内容（流式）
async function generateContentStreamAntigravity(
  client,
  requestData,
  userPromptId,
  projectId = null,
  sessionId = null,
  signal = null,
  proxyConfig = null
) {
  const { token } = await client.getAccessToken()
  const { model } = antigravityClient.buildAntigravityEnvelope({
    requestData,
    projectId,
    sessionId,
    userPromptId
  })

  logger.info('🌊 Antigravity streamGenerateContent API调用开始', {
    model,
    userPromptId,
    projectId,
    sessionId
  })

  const { response } = await antigravityClient.request({
    accessToken: token,
    proxyConfig,
    requestData,
    projectId,
    sessionId,
    userPromptId,
    stream: true,
    signal,
    params: { alt: 'sse' }
  })
  logger.info('✅ Antigravity streamGenerateContent API调用成功，开始流式传输')
  return response.data
}

// 更新账户的临时项目 ID
async function updateTempProjectId(accountId, tempProjectId) {
  if (!tempProjectId) {
    return
  }

  try {
    const account = await getAccount(accountId)
    if (!account) {
      logger.warn(`Account ${accountId} not found when updating tempProjectId`)
      return
    }

    // 只有在没有固定项目 ID 的情况下才更新临时项目 ID
    if (!account.projectId && tempProjectId !== account.tempProjectId) {
      await updateAccount(accountId, { tempProjectId })
      logger.info(`Updated tempProjectId for account ${accountId}: ${tempProjectId}`)
    }
  } catch (error) {
    logger.error(`Failed to update tempProjectId for account ${accountId}:`, error)
  }
}

// 重置账户状态（清除所有异常状态）
async function resetAccountStatus(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  const updates = {
    // 根据是否有有效的 refreshToken 来设置 status
    status: account.refreshToken ? 'active' : 'created',
    // 恢复可调度状态
    schedulable: 'true',
    // 清除错误相关字段
    errorMessage: '',
    rateLimitedAt: '',
    rateLimitStatus: ''
  }

  await updateAccount(accountId, updates)
  logger.info(`✅ Reset all error status for Gemini account ${accountId}`)

  // 发送 Webhook 通知
  try {
    const webhookNotifier = require('../utils/webhookNotifier')
    await webhookNotifier.sendAccountAnomalyNotification({
      accountId,
      accountName: account.name || accountId,
      platform: 'gemini',
      status: 'recovered',
      errorCode: 'STATUS_RESET',
      reason: 'Account status manually reset',
      timestamp: new Date().toISOString()
    })
    logger.info(`📢 Webhook notification sent for Gemini account ${account.name} status reset`)
  } catch (webhookError) {
    logger.error('Failed to send status reset webhook notification:', webhookError)
  }

  return {
    success: true,
    message: 'Account status reset successfully'
  }
}

module.exports = {
  generateAuthUrl,
  pollAuthorizationStatus,
  exchangeCodeForTokens,
  refreshAccessToken,
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  selectAvailableAccount,
  refreshAccountToken,
  markAccountUsed,
  setAccountRateLimited,
  getAccountRateLimitInfo,
  isTokenExpired,
  getOauthClient,
  forwardToCodeAssist, // 通用转发函数
  loadCodeAssist,
  getOnboardTier,
  onboardUser,
  setupUser,
  encrypt,
  decrypt,
  generateEncryptionKey,
  decryptCache, // 暴露缓存对象以便测试和监控
  countTokens,
  countTokensAntigravity,
  generateContent,
  generateContentStream,
  generateContentAntigravity,
  generateContentStreamAntigravity,
  fetchAvailableModelsAntigravity,
  updateTempProjectId,
  resetAccountStatus
}
