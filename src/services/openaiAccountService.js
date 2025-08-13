const redisClient = require('../models/redis')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const config = require('../../config/config')
const logger = require('../utils/logger')
// const { maskToken } = require('../utils/tokenMask')
const {
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError,
  logTokenUsage,
  logRefreshSkipped
} = require('../utils/tokenRefreshLogger')
// const tokenRefreshService = require('./tokenRefreshService')

// 加密相关常量
const ALGORITHM = 'aes-256-cbc'
const ENCRYPTION_SALT = 'openai-account-salt'
const IV_LENGTH = 16

// 生成加密密钥（使用与 claudeAccountService 相同的方法）
function generateEncryptionKey() {
  return crypto.scryptSync(config.security.encryptionKey, ENCRYPTION_SALT, 32)
}

// OpenAI 账户键前缀
const OPENAI_ACCOUNT_KEY_PREFIX = 'openai:account:'
const SHARED_OPENAI_ACCOUNTS_KEY = 'shared_openai_accounts'
const ACCOUNT_SESSION_MAPPING_PREFIX = 'openai_session_account_mapping:'

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
    return decrypted.toString()
  } catch (error) {
    logger.error('Decryption error:', error)
    return ''
  }
}

// 刷新访问令牌
async function refreshAccessToken(_refreshToken) {
  try {
    // OpenAI OAuth token 刷新实现
    // TODO: 实现具体的 OpenAI OAuth token 刷新逻辑
    logger.warn('OpenAI token refresh not yet implemented')
    return null
  } catch (error) {
    logger.error('Error refreshing OpenAI access token:', error)
    throw error
  }
}

// 检查 token 是否过期
function isTokenExpired(account) {
  if (!account.expiresAt) {
    return false
  }
  return new Date(account.expiresAt) <= new Date()
}

// 刷新账户的 access token
async function refreshAccountToken(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  const accountName = account.name || accountId
  logRefreshStart(accountId, accountName, 'openai')

  // 检查是否有 refresh token
  const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null
  if (!refreshToken) {
    logRefreshSkipped(accountId, accountName, 'openai', 'No refresh token available')
    throw new Error('No refresh token available')
  }

  try {
    const newTokens = await refreshAccessToken(refreshToken)
    if (!newTokens) {
      throw new Error('Failed to refresh token')
    }

    // 更新账户信息
    await updateAccount(accountId, {
      accessToken: encrypt(newTokens.access_token),
      expiresAt: new Date(newTokens.expiry_date).toISOString()
    })

    logRefreshSuccess(accountId, accountName, 'openai', newTokens.expiry_date)
    return newTokens
  } catch (error) {
    logRefreshError(accountId, accountName, 'openai', error.message)
    throw error
  }
}

// 创建账户
async function createAccount(accountData) {
  const accountId = uuidv4()
  const now = new Date().toISOString()

  // 处理OAuth数据
  let oauthData = {}
  if (accountData.openaiOauth) {
    oauthData =
      typeof accountData.openaiOauth === 'string'
        ? JSON.parse(accountData.openaiOauth)
        : accountData.openaiOauth
  }

  // 处理账户信息
  const accountInfo = accountData.accountInfo || {}

  const account = {
    id: accountId,
    name: accountData.name,
    description: accountData.description || '',
    accountType: accountData.accountType || 'shared',
    groupId: accountData.groupId || null,
    priority: accountData.priority || 50,
    rateLimitDuration:
      accountData.rateLimitDuration !== undefined && accountData.rateLimitDuration !== null
        ? accountData.rateLimitDuration
        : 60,
    // OAuth相关字段（加密存储）
    idToken: encrypt(oauthData.idToken || ''),
    accessToken: encrypt(oauthData.accessToken || ''),
    refreshToken: encrypt(oauthData.refreshToken || ''),
    openaiOauth: encrypt(JSON.stringify(oauthData)),
    // 账户信息字段
    accountId: accountInfo.accountId || '',
    chatgptUserId: accountInfo.chatgptUserId || '',
    organizationId: accountInfo.organizationId || '',
    organizationRole: accountInfo.organizationRole || '',
    organizationTitle: accountInfo.organizationTitle || '',
    planType: accountInfo.planType || '',
    email: encrypt(accountInfo.email || ''),
    emailVerified: accountInfo.emailVerified || false,
    // 过期时间
    expiresAt: oauthData.expires_in
      ? new Date(Date.now() + oauthData.expires_in * 1000).toISOString()
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 默认1年
    // 状态字段
    isActive: accountData.isActive !== false ? 'true' : 'false',
    status: 'active',
    schedulable: accountData.schedulable !== false ? 'true' : 'false',
    lastRefresh: now,
    createdAt: now,
    updatedAt: now
  }

  // 代理配置
  if (accountData.proxy) {
    account.proxy =
      typeof accountData.proxy === 'string' ? accountData.proxy : JSON.stringify(accountData.proxy)
  }

  const client = redisClient.getClientSafe()
  await client.hset(`${OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, account)

  // 如果是共享账户，添加到共享账户集合
  if (account.accountType === 'shared') {
    await client.sadd(SHARED_OPENAI_ACCOUNTS_KEY, accountId)
  }

  logger.info(`Created OpenAI account: ${accountId}`)
  return account
}

// 获取账户
async function getAccount(accountId) {
  const client = redisClient.getClientSafe()
  const accountData = await client.hgetall(`${OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`)

  if (!accountData || Object.keys(accountData).length === 0) {
    return null
  }

  // 解密敏感数据（仅用于内部处理，不返回给前端）
  if (accountData.idToken) {
    accountData.idToken = decrypt(accountData.idToken)
  }
  if (accountData.accessToken) {
    accountData.accessToken = decrypt(accountData.accessToken)
  }
  if (accountData.refreshToken) {
    accountData.refreshToken = decrypt(accountData.refreshToken)
  }
  if (accountData.email) {
    accountData.email = decrypt(accountData.email)
  }
  if (accountData.openaiOauth) {
    try {
      accountData.openaiOauth = JSON.parse(decrypt(accountData.openaiOauth))
    } catch (e) {
      accountData.openaiOauth = null
    }
  }

  // 解析代理配置
  if (accountData.proxy && typeof accountData.proxy === 'string') {
    try {
      accountData.proxy = JSON.parse(accountData.proxy)
    } catch (e) {
      accountData.proxy = null
    }
  }

  return accountData
}

// 更新账户
async function updateAccount(accountId, updates) {
  const existingAccount = await getAccount(accountId)
  if (!existingAccount) {
    throw new Error('Account not found')
  }

  updates.updatedAt = new Date().toISOString()

  // 加密敏感数据
  if (updates.openaiOauth) {
    const oauthData =
      typeof updates.openaiOauth === 'string'
        ? updates.openaiOauth
        : JSON.stringify(updates.openaiOauth)
    updates.openaiOauth = encrypt(oauthData)
  }
  if (updates.idToken) {
    updates.idToken = encrypt(updates.idToken)
  }
  if (updates.accessToken) {
    updates.accessToken = encrypt(updates.accessToken)
  }
  if (updates.refreshToken) {
    updates.refreshToken = encrypt(updates.refreshToken)
  }
  if (updates.email) {
    updates.email = encrypt(updates.email)
  }

  // 处理代理配置
  if (updates.proxy) {
    updates.proxy =
      typeof updates.proxy === 'string' ? updates.proxy : JSON.stringify(updates.proxy)
  }

  // 更新账户类型时处理共享账户集合
  const client = redisClient.getClientSafe()
  if (updates.accountType && updates.accountType !== existingAccount.accountType) {
    if (updates.accountType === 'shared') {
      await client.sadd(SHARED_OPENAI_ACCOUNTS_KEY, accountId)
    } else {
      await client.srem(SHARED_OPENAI_ACCOUNTS_KEY, accountId)
    }
  }

  await client.hset(`${OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, updates)

  logger.info(`Updated OpenAI account: ${accountId}`)

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
  await client.del(`${OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`)

  // 从共享账户集合中移除
  if (account.accountType === 'shared') {
    await client.srem(SHARED_OPENAI_ACCOUNTS_KEY, accountId)
  }

  // 清理会话映射
  const sessionMappings = await client.keys(`${ACCOUNT_SESSION_MAPPING_PREFIX}*`)
  for (const key of sessionMappings) {
    const mappedAccountId = await client.get(key)
    if (mappedAccountId === accountId) {
      await client.del(key)
    }
  }

  logger.info(`Deleted OpenAI account: ${accountId}`)
  return true
}

// 获取所有账户
async function getAllAccounts() {
  const client = redisClient.getClientSafe()
  const keys = await client.keys(`${OPENAI_ACCOUNT_KEY_PREFIX}*`)
  const accounts = []

  for (const key of keys) {
    const accountData = await client.hgetall(key)
    if (accountData && Object.keys(accountData).length > 0) {
      // 解密敏感数据（但不返回给前端）
      if (accountData.email) {
        accountData.email = decrypt(accountData.email)
      }

      // 屏蔽敏感信息（token等不应该返回给前端）
      delete accountData.idToken
      delete accountData.accessToken
      delete accountData.refreshToken
      delete accountData.openaiOauth

      // 获取限流状态信息
      const rateLimitInfo = await getAccountRateLimitInfo(accountData.id)

      // 解析代理配置
      if (accountData.proxy) {
        try {
          accountData.proxy = JSON.parse(accountData.proxy)
          // 屏蔽代理密码
          if (accountData.proxy && accountData.proxy.password) {
            accountData.proxy.password = '******'
          }
        } catch (e) {
          // 如果解析失败，设置为null
          accountData.proxy = null
        }
      }

      // 不解密敏感字段，只返回基本信息
      accounts.push({
        ...accountData,
        openaiOauth: accountData.openaiOauth ? '[ENCRYPTED]' : '',
        accessToken: accountData.accessToken ? '[ENCRYPTED]' : '',
        refreshToken: accountData.refreshToken ? '[ENCRYPTED]' : '',
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

  // 检查是否绑定了 OpenAI 账户
  if (apiKeyData.openaiAccountId) {
    const account = await getAccount(apiKeyData.openaiAccountId)
    if (account && account.isActive === 'true') {
      // 检查 token 是否过期
      const isExpired = isTokenExpired(account)

      // 记录token使用情况
      logTokenUsage(account.id, account.name, 'openai', account.expiresAt, isExpired)

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
  const sharedAccountIds = await client.smembers(SHARED_OPENAI_ACCOUNTS_KEY)
  const availableAccounts = []

  for (const accountId of sharedAccountIds) {
    const account = await getAccount(accountId)
    if (account && account.isActive === 'true' && !isRateLimited(account)) {
      availableAccounts.push(account)
    }
  }

  if (availableAccounts.length === 0) {
    throw new Error('No available OpenAI accounts')
  }

  // 选择使用最少的账户
  const selectedAccount = availableAccounts.reduce((prev, curr) => {
    const prevUsage = parseInt(prev.totalUsage || 0)
    const currUsage = parseInt(curr.totalUsage || 0)
    return prevUsage <= currUsage ? prev : curr
  })

  // 检查 token 是否过期
  if (isTokenExpired(selectedAccount)) {
    await refreshAccountToken(selectedAccount.id)
    return await getAccount(selectedAccount.id)
  }

  // 创建粘性会话映射
  if (sessionHash) {
    await client.setex(
      `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionHash}`,
      3600, // 1小时过期
      selectedAccount.id
    )
  }

  return selectedAccount
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

// 设置账户限流状态
async function setAccountRateLimited(accountId, isLimited) {
  const updates = {
    rateLimitStatus: isLimited ? 'limited' : 'normal',
    rateLimitedAt: isLimited ? new Date().toISOString() : null
  }

  await updateAccount(accountId, updates)
  logger.info(`Set rate limit status for OpenAI account ${accountId}: ${updates.rateLimitStatus}`)
}

// 切换账户调度状态
async function toggleSchedulable(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  // 切换调度状态
  const newSchedulable = account.schedulable === 'false' ? 'true' : 'false'

  await updateAccount(accountId, {
    schedulable: newSchedulable
  })

  logger.info(`Toggled schedulable status for OpenAI account ${accountId}: ${newSchedulable}`)

  return {
    success: true,
    schedulable: newSchedulable === 'true'
  }
}

// 获取账户限流信息
async function getAccountRateLimitInfo(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    return null
  }

  if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
    const limitedAt = new Date(account.rateLimitedAt).getTime()
    const now = Date.now()
    const limitDuration = 60 * 60 * 1000 // 1小时
    const remainingTime = Math.max(0, limitedAt + limitDuration - now)

    return {
      isRateLimited: remainingTime > 0,
      rateLimitedAt: account.rateLimitedAt,
      minutesRemaining: Math.ceil(remainingTime / (60 * 1000))
    }
  }

  return {
    isRateLimited: false,
    rateLimitedAt: null,
    minutesRemaining: 0
  }
}

// 更新账户使用统计（tokens参数可选，默认为0，仅更新最后使用时间）
async function updateAccountUsage(accountId, tokens = 0) {
  const account = await getAccount(accountId)
  if (!account) {
    return
  }

  const updates = {
    lastUsedAt: new Date().toISOString()
  }

  // 如果有 tokens 参数且大于0，同时更新使用统计
  if (tokens > 0) {
    const totalUsage = parseInt(account.totalUsage || 0) + tokens
    updates.totalUsage = totalUsage.toString()
  }

  await updateAccount(accountId, updates)
}

// 为了兼容性，保留recordUsage作为updateAccountUsage的别名
const recordUsage = updateAccountUsage

module.exports = {
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  selectAvailableAccount,
  refreshAccountToken,
  isTokenExpired,
  setAccountRateLimited,
  toggleSchedulable,
  getAccountRateLimitInfo,
  updateAccountUsage,
  recordUsage, // 别名，指向updateAccountUsage
  encrypt,
  decrypt
}
