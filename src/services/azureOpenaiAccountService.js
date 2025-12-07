const redisClient = require('../models/redis')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const config = require('../../config/config')
const logger = require('../utils/logger')

const DEFAULT_RATE_LIMIT_DURATION_MINUTES = Number.isFinite(
  parseInt(config.azureOpenai?.rateLimitDuration, 10)
)
  ? parseInt(config.azureOpenai.rateLimitDuration, 10)
  : 60
const TEMP_UNAVAILABLE_TTL_SECONDS = Number.isFinite(
  parseInt(config.azureOpenai?.tempUnavailableTtlSeconds, 10)
)
  ? parseInt(config.azureOpenai.tempUnavailableTtlSeconds, 10)
  : 300

// 加密相关常量
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

// 🚀 安全的加密密钥生成，支持动态salt
const ENCRYPTION_SALT = config.security?.azureOpenaiSalt || 'azure-openai-account-default-salt'

class EncryptionKeyManager {
  constructor() {
    this.keyCache = new Map()
    this.keyRotationInterval = 24 * 60 * 60 * 1000 // 24小时
  }

  getKey(version = 'current') {
    const cached = this.keyCache.get(version)
    if (cached && Date.now() - cached.timestamp < this.keyRotationInterval) {
      return cached.key
    }

    // 生成新密钥
    const key = crypto.scryptSync(config.security.encryptionKey, ENCRYPTION_SALT, 32)
    this.keyCache.set(version, {
      key,
      timestamp: Date.now()
    })

    logger.debug('🔑 Azure OpenAI encryption key generated/refreshed')
    return key
  }

  // 清理过期密钥
  cleanup() {
    const now = Date.now()
    for (const [version, cached] of this.keyCache.entries()) {
      if (now - cached.timestamp > this.keyRotationInterval) {
        this.keyCache.delete(version)
      }
    }
  }
}

const encryptionKeyManager = new EncryptionKeyManager()

// 定期清理过期密钥
setInterval(
  () => {
    encryptionKeyManager.cleanup()
  },
  60 * 60 * 1000
) // 每小时清理一次

// 生成加密密钥 - 使用安全的密钥管理器
function generateEncryptionKey() {
  return encryptionKeyManager.getKey()
}

// Azure OpenAI 账户键前缀
const AZURE_OPENAI_ACCOUNT_KEY_PREFIX = 'azure_openai:account:'
const SHARED_AZURE_OPENAI_ACCOUNTS_KEY = 'shared_azure_openai_accounts'
const ACCOUNT_SESSION_MAPPING_PREFIX = 'azure_openai_session_account_mapping:'

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

// 解密函数 - 移除缓存以提高安全性
function decrypt(text) {
  if (!text) {
    return ''
  }

  try {
    const key = generateEncryptionKey()
    // IV 是固定长度的 32 个十六进制字符（16 字节）
    const ivHex = text.substring(0, 32)
    const encryptedHex = text.substring(33) // 跳过冒号

    if (ivHex.length !== 32 || !encryptedHex) {
      throw new Error('Invalid encrypted text format')
    }

    const iv = Buffer.from(ivHex, 'hex')
    const encryptedText = Buffer.from(encryptedHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    const result = decrypted.toString()

    return result
  } catch (error) {
    logger.error('Azure OpenAI decryption error:', error.message)
    return ''
  }
}

// 创建账户
async function createAccount(accountData, noFailover = false) {
  const accountId = uuidv4()
  const now = new Date().toISOString()

  const normalizedNoFailover = accountData.noFailover ?? noFailover

  const account = {
    id: accountId,
    name: accountData.name,
    description: accountData.description || '',
    accountType: accountData.accountType || 'shared',
    groupId: accountData.groupId || null,
    priority: accountData.priority || 50,
    // Azure OpenAI 特有字段
    azureEndpoint: accountData.azureEndpoint || '',
    apiVersion: accountData.apiVersion || '2024-02-01', // 使用稳定版本
    deploymentName: accountData.deploymentName || 'gpt-4', // 使用默认部署名称
    apiKey: encrypt(accountData.apiKey || ''),
    // 支持的模型
    supportedModels: JSON.stringify(
      accountData.supportedModels || ['gpt-4', 'gpt-4-turbo', 'gpt-35-turbo', 'gpt-35-turbo-16k']
    ),

    // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
    // 注意：Azure OpenAI 使用 API Key 认证，没有 OAuth token，因此没有 expiresAt
    subscriptionExpiresAt: accountData.subscriptionExpiresAt || null,

    // 状态字段
    isActive: accountData.isActive !== false ? 'true' : 'false',
    status: 'active',
    schedulable: accountData.schedulable !== false ? 'true' : 'false',
    noFailover: normalizedNoFailover.toString(),
    errorMessage: '',
    rateLimitedAt: '',
    rateLimitStatus: '',
    rateLimitResetAt: '',
    rateLimitDuration: (
      accountData.rateLimitDuration || DEFAULT_RATE_LIMIT_DURATION_MINUTES
    ).toString(),
    unauthorizedAt: '',
    tempUnavailableAt: '',
    tempUnavailableUntil: '',
    createdAt: now,
    updatedAt: now
  }

  // 代理配置
  if (accountData.proxy) {
    account.proxy =
      typeof accountData.proxy === 'string' ? accountData.proxy : JSON.stringify(accountData.proxy)
  }

  const client = redisClient.getClientSafe()
  await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, account)

  // 如果是共享账户，添加到共享账户集合
  if (account.accountType === 'shared') {
    await client.sadd(SHARED_AZURE_OPENAI_ACCOUNTS_KEY, accountId)
  }

  logger.info(`Created Azure OpenAI account: ${accountId}`)
  return account
}

// 获取账户
async function getAccount(accountId) {
  const client = redisClient.getClientSafe()
  const accountData = await client.hgetall(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`)

  if (!accountData || Object.keys(accountData).length === 0) {
    return null
  }

  // 解密敏感数据（仅用于内部处理，不返回给前端）
  if (accountData.apiKey) {
    accountData.apiKey = decrypt(accountData.apiKey)
  }

  // 解析代理配置
  if (accountData.proxy && typeof accountData.proxy === 'string') {
    try {
      accountData.proxy = JSON.parse(accountData.proxy)
    } catch (e) {
      accountData.proxy = null
    }
  }

  // 解析支持的模型
  if (accountData.supportedModels && typeof accountData.supportedModels === 'string') {
    try {
      accountData.supportedModels = JSON.parse(accountData.supportedModels)
    } catch (e) {
      accountData.supportedModels = ['gpt-4', 'gpt-35-turbo']
    }
  }

  // 处理 noFailover 布尔值
  accountData.noFailover = accountData.noFailover === 'true' || accountData.noFailover === true

  // 解析限流持续时间
  const parsedRateLimitDuration = parseInt(accountData.rateLimitDuration, 10)
  accountData.rateLimitDuration = Number.isNaN(parsedRateLimitDuration)
    ? DEFAULT_RATE_LIMIT_DURATION_MINUTES
    : parsedRateLimitDuration

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
  if (updates.apiKey) {
    updates.apiKey = encrypt(updates.apiKey)
  }

  // 处理代理配置
  if (updates.proxy) {
    updates.proxy =
      typeof updates.proxy === 'string' ? updates.proxy : JSON.stringify(updates.proxy)
  }

  // 处理支持的模型
  if (updates.supportedModels) {
    updates.supportedModels =
      typeof updates.supportedModels === 'string'
        ? updates.supportedModels
        : JSON.stringify(updates.supportedModels)
  }

  if (updates.noFailover !== undefined) {
    updates.noFailover = updates.noFailover.toString()
  }

  if (updates.rateLimitDuration !== undefined) {
    const parsedDuration = parseInt(updates.rateLimitDuration, 10)
    updates.rateLimitDuration = Number.isNaN(parsedDuration)
      ? DEFAULT_RATE_LIMIT_DURATION_MINUTES.toString()
      : parsedDuration.toString()
  }

  // ✅ 直接保存 subscriptionExpiresAt（如果提供）
  // Azure OpenAI 使用 API Key，没有 token 刷新逻辑，不会覆盖此字段
  if (updates.subscriptionExpiresAt !== undefined) {
    // 直接保存，不做任何调整
  }

  // 更新账户类型时处理共享账户集合
  const client = redisClient.getClientSafe()
  if (updates.accountType && updates.accountType !== existingAccount.accountType) {
    if (updates.accountType === 'shared') {
      await client.sadd(SHARED_AZURE_OPENAI_ACCOUNTS_KEY, accountId)
    } else {
      await client.srem(SHARED_AZURE_OPENAI_ACCOUNTS_KEY, accountId)
    }
  }

  await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, updates)

  logger.info(`Updated Azure OpenAI account: ${accountId}`)

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
  // 首先从所有分组中移除此账户
  const accountGroupService = require('./accountGroupService')
  await accountGroupService.removeAccountFromAllGroups(accountId)

  const client = redisClient.getClientSafe()
  const accountKey = `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`

  // 从Redis中删除账户数据
  await client.del(accountKey)

  // 从共享账户集合中移除
  await client.srem(SHARED_AZURE_OPENAI_ACCOUNTS_KEY, accountId)

  logger.info(`Deleted Azure OpenAI account: ${accountId}`)
  return true
}

// 获取所有账户
async function getAllAccounts() {
  const client = redisClient.getClientSafe()
  const keys = await client.keys(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}*`)

  if (!keys || keys.length === 0) {
    return []
  }

  const accounts = []
  for (const key of keys) {
    const accountData = await client.hgetall(key)
    if (accountData && Object.keys(accountData).length > 0) {
      // 不返回敏感数据给前端
      delete accountData.apiKey

      // 解析代理配置
      if (accountData.proxy && typeof accountData.proxy === 'string') {
        try {
          accountData.proxy = JSON.parse(accountData.proxy)
        } catch (e) {
          accountData.proxy = null
        }
      }

      // 解析支持的模型
      if (accountData.supportedModels && typeof accountData.supportedModels === 'string') {
        try {
          accountData.supportedModels = JSON.parse(accountData.supportedModels)
        } catch (e) {
          accountData.supportedModels = ['gpt-4', 'gpt-35-turbo']
        }
      }

      accounts.push({
        ...accountData,
        isActive: accountData.isActive === 'true',
        schedulable: accountData.schedulable !== 'false',

        // ✅ 前端显示订阅过期时间（业务字段）
        expiresAt: accountData.subscriptionExpiresAt || null,
        platform: 'azure-openai'
      })
    }
  }

  return accounts
}

// 获取共享账户
async function getSharedAccounts() {
  const client = redisClient.getClientSafe()
  const accountIds = await client.smembers(SHARED_AZURE_OPENAI_ACCOUNTS_KEY)

  if (!accountIds || accountIds.length === 0) {
    return []
  }

  const accounts = []
  for (const accountId of accountIds) {
    const account = await getAccount(accountId)
    if (account && account.isActive === 'true') {
      accounts.push(account)
    }
  }

  return accounts
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

// 选择可用账户
async function selectAvailableAccount(sessionId = null) {
  // 如果有会话ID，尝试获取之前分配的账户
  if (sessionId) {
    const client = redisClient.getClientSafe()
    const mappingKey = `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionId}`
    const accountId = await client.get(mappingKey)

    if (accountId) {
      const account = await getAccount(accountId)
      if (account && account.isActive === 'true' && account.schedulable === 'true') {
        const isRateLimited = await isAccountRateLimited(account.id)
        const unauthorized = await isAccountUnauthorized(account.id)
        const blocked = await isAccountBlocked(account.id)
        const tempUnavailable = await isAccountTemporarilyUnavailable(account.id)
        const overloaded = await isAccountOverloaded(account.id)

        if (!isRateLimited && !unauthorized && !blocked && !tempUnavailable && !overloaded) {
          logger.debug(`Reusing Azure OpenAI account ${accountId} for session ${sessionId}`)
          return account
        }
      }
    }
  }

  // 获取所有共享账户
  const sharedAccounts = await getSharedAccounts()

  // 过滤出可用的账户
  const availableAccounts = []
  for (const acc of sharedAccounts) {
    // ✅ 检查账户订阅是否过期
    if (isSubscriptionExpired(acc)) {
      logger.debug(
        `⏰ Skipping expired Azure OpenAI account: ${acc.name}, expired at ${acc.subscriptionExpiresAt}`
      )
      continue
    }

    const isRateLimited = await isAccountRateLimited(acc.id)
    if (isRateLimited) {
      logger.debug(`⏳ Skipping rate limited Azure OpenAI account: ${acc.name}`)
      continue
    }

    const unauthorized = await isAccountUnauthorized(acc.id)
    if (unauthorized) {
      logger.debug(`🚫 Skipping unauthorized Azure OpenAI account: ${acc.name}`)
      continue
    }

    const blocked = await isAccountBlocked(acc.id)
    if (blocked) {
      logger.debug(`🚫 Skipping blocked Azure OpenAI account: ${acc.name}`)
      continue
    }

    const tempUnavailable = await isAccountTemporarilyUnavailable(acc.id)
    if (tempUnavailable) {
      logger.debug(`⏱️ Skipping temporarily unavailable Azure OpenAI account: ${acc.name}`)
      continue
    }

    const overloaded = await isAccountOverloaded(acc.id)
    if (overloaded) {
      logger.debug(`🔥 Skipping overloaded Azure OpenAI account: ${acc.name}`)
      continue
    }

    // 重新获取账户以确保状态是最新的
    const hydratedAccount = await getAccount(acc.id)
    if (
      hydratedAccount &&
      hydratedAccount.isActive === 'true' &&
      hydratedAccount.schedulable === 'true'
    ) {
      availableAccounts.push(hydratedAccount)
    }
  }

  if (availableAccounts.length === 0) {
    throw new Error('No available Azure OpenAI accounts')
  }

  // 按优先级排序并选择
  availableAccounts.sort((a, b) => (b.priority || 50) - (a.priority || 50))
  const selectedAccount = availableAccounts[0]

  // 如果有会话ID，保存映射关系
  if (sessionId && selectedAccount) {
    const client = redisClient.getClientSafe()
    const mappingKey = `${ACCOUNT_SESSION_MAPPING_PREFIX}${sessionId}`
    await client.setex(mappingKey, 3600, selectedAccount.id) // 1小时过期
  }

  logger.debug(`Selected Azure OpenAI account: ${selectedAccount.id}`)
  return selectedAccount
}

// 🚫 标记账户为被禁止状态（403）
async function markAccountBlocked(accountId, reason = 'Forbidden') {
  try {
    const key = `azure_openai_account_blocked:${accountId}`
    await redisClient.setex(key, 86400, reason) // 24小时
    logger.warn(`🚫 Marked Azure OpenAI account ${accountId} as blocked: ${reason}`)
  } catch (error) {
    logger.error(`❌ Failed to mark Azure OpenAI account ${accountId} as blocked`, error)
    throw error
  }
}

// 🔍 检查账户是否被禁止
async function isAccountBlocked(accountId) {
  try {
    const key = `azure_openai_account_blocked:${accountId}`
    const blocked = await redisClient.get(key)
    return !!blocked
  } catch (error) {
    logger.error(`❌ Failed to check blocked status for Azure OpenAI account ${accountId}`, error)
    return false
  }
}

// ✅ 清除被禁止状态
async function clearAccountBlocked(accountId) {
  try {
    const key = `azure_openai_account_blocked:${accountId}`
    await redisClient.del(key)
    logger.debug(`✅ Cleared blocked status for Azure OpenAI account ${accountId}`)
  } catch (error) {
    logger.error(`❌ Failed to clear blocked status for Azure OpenAI account ${accountId}`, error)
    throw error
  }
}

// 🚫 标记账户为未授权状态（401/402）
async function markAccountUnauthorized(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const account = await getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const now = new Date().toISOString()
    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'unauthorized',
      unauthorizedAt: now,
      schedulable: 'false',
      errorMessage: 'Azure OpenAI account unauthorized'
    })

    logger.warn(`🚫 Marked Azure OpenAI account as unauthorized: ${account.name} (${accountId})`)
    return { success: true, unauthorizedAt: now }
  } catch (error) {
    logger.error(`❌ Failed to mark Azure OpenAI account as unauthorized: ${accountId}`, error)
    throw error
  }
}

// ✅ 清除未授权状态
async function clearAccountUnauthorized(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const account = await getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    await client.hdel(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, 'unauthorizedAt')
    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'active',
      schedulable: 'true',
      errorMessage: ''
    })

    logger.info(`✅ Cleared unauthorized status for Azure OpenAI account: ${account.name}`)
    return { success: true }
  } catch (error) {
    logger.error(
      `❌ Failed to clear unauthorized status for Azure OpenAI account ${accountId}`,
      error
    )
    throw error
  }
}

// 🔍 检查账户是否未授权
async function isAccountUnauthorized(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const [status, unauthorizedAt] = await client.hmget(
      `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`,
      'status',
      'unauthorizedAt'
    )

    return status === 'unauthorized' || !!unauthorizedAt
  } catch (error) {
    logger.error(
      `❌ Failed to check unauthorized status for Azure OpenAI account ${accountId}`,
      error
    )
    return false
  }
}

// ⏱️ 标记账户为限流状态
async function markAccountRateLimited(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const account = await getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const now = new Date()
    const durationMinutes = account.rateLimitDuration || DEFAULT_RATE_LIMIT_DURATION_MINUTES
    const resetAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString()

    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'rate_limited',
      rateLimitStatus: 'limited',
      rateLimitedAt: now.toISOString(),
      rateLimitResetAt: resetAt,
      schedulable: 'false',
      errorMessage: 'Azure OpenAI account rate limited'
    })

    logger.warn(
      `⏳ Marked Azure OpenAI account as rate limited until ${resetAt}: ${account.name} (${accountId})`
    )
    return { success: true, resetAt }
  } catch (error) {
    logger.error(`❌ Failed to mark Azure OpenAI account as rate limited: ${accountId}`, error)
    throw error
  }
}

// ✅ 清除限流状态
async function removeAccountRateLimit(accountId) {
  try {
    const client = redisClient.getClientSafe()
    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'active',
      rateLimitStatus: '',
      rateLimitedAt: '',
      rateLimitResetAt: '',
      schedulable: 'true',
      errorMessage: ''
    })

    logger.info(`✅ Removed rate limit status for Azure OpenAI account: ${accountId}`)
    return { success: true }
  } catch (error) {
    logger.error(
      `❌ Failed to remove rate limit status for Azure OpenAI account ${accountId}`,
      error
    )
    throw error
  }
}

// 🔍 检查账户是否处于限流状态（自动恢复过期的限流）
async function isAccountRateLimited(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const [status, resetAt, limitedAt, durationRaw] = await client.hmget(
      `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`,
      'rateLimitStatus',
      'rateLimitResetAt',
      'rateLimitedAt',
      'rateLimitDuration'
    )

    if (status !== 'limited') {
      return false
    }

    const durationMinutes = Number.isNaN(parseInt(durationRaw, 10))
      ? DEFAULT_RATE_LIMIT_DURATION_MINUTES
      : parseInt(durationRaw, 10)
    const now = new Date()

    if (resetAt) {
      const resetTime = new Date(resetAt)
      if (now < resetTime) {
        return true
      }
    }

    if (limitedAt) {
      const limitTime = new Date(limitedAt)
      const expireTime = new Date(limitTime.getTime() + durationMinutes * 60 * 1000)
      if (now < expireTime) {
        return true
      }
    }

    await removeAccountRateLimit(accountId)
    return false
  } catch (error) {
    logger.error(
      `❌ Failed to check rate limit status for Azure OpenAI account ${accountId}`,
      error
    )
    return false
  }
}

// ⏱️ 标记账户为临时不可用（5xx 等错误）
async function markAccountTemporarilyUnavailable(
  accountId,
  ttlSeconds = TEMP_UNAVAILABLE_TTL_SECONDS
) {
  try {
    const client = redisClient.getClientSafe()
    const account = await getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const now = new Date()
    const until = new Date(now.getTime() + ttlSeconds * 1000).toISOString()

    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'temporarily_unavailable',
      tempUnavailableAt: now.toISOString(),
      tempUnavailableUntil: until,
      schedulable: 'false',
      errorMessage: 'Azure OpenAI temporarily unavailable'
    })

    // 额外的 TTL 标记，便于快速跳过
    await client.setex(`temp_unavailable:azure_openai:${accountId}`, ttlSeconds, '1')

    logger.warn(
      `⏱️ Marked Azure OpenAI account as temporarily unavailable until ${until}: ${account.name} (${accountId})`
    )
    return { success: true, until }
  } catch (error) {
    logger.error(
      `❌ Failed to mark Azure OpenAI account as temporarily unavailable: ${accountId}`,
      error
    )
    throw error
  }
}

// 🔍 检查账户是否临时不可用（自动恢复过期状态）
async function isAccountTemporarilyUnavailable(accountId) {
  try {
    const client = redisClient.getClientSafe()
    const flagExists = await client.exists(`temp_unavailable:azure_openai:${accountId}`)
    if (flagExists === 1) {
      return true
    }

    const [status, until] = await client.hmget(
      `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`,
      'status',
      'tempUnavailableUntil'
    )

    if (status !== 'temporarily_unavailable') {
      return false
    }

    if (until && new Date(until) > new Date()) {
      return true
    }

    // 状态已过期，自动恢复
    await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, {
      status: 'active',
      tempUnavailableAt: '',
      tempUnavailableUntil: '',
      schedulable: 'true',
      errorMessage: ''
    })

    return false
  } catch (error) {
    logger.error(
      `❌ Failed to check temporary unavailable status for Azure OpenAI account ${accountId}`,
      error
    )
    return false
  }
}

// 🚫 标记账户为过载状态（529）
async function markAccountOverloaded(accountId, ttlSeconds = 300) {
  try {
    const key = `azure_openai_account_overloaded:${accountId}`
    await redisClient.setex(key, ttlSeconds, 'overloaded') // 默认5分钟
    logger.warn(`🚫 Marked Azure OpenAI account ${accountId} as overloaded (TTL: ${ttlSeconds}s)`)
  } catch (error) {
    logger.error(`❌ Failed to mark Azure OpenAI account ${accountId} as overloaded`, error)
    throw error
  }
}

// 🔍 检查账户是否过载
async function isAccountOverloaded(accountId) {
  try {
    const key = `azure_openai_account_overloaded:${accountId}`
    const overloaded = await redisClient.get(key)
    return !!overloaded
  } catch (error) {
    logger.error(`❌ Failed to check overload status for Azure OpenAI account ${accountId}`, error)
    return false
  }
}

// ✅ 清除过载状态
async function removeAccountOverload(accountId) {
  try {
    const key = `azure_openai_account_overloaded:${accountId}`
    await redisClient.del(key)
    logger.debug(`✅ Cleared overload status for Azure OpenAI account ${accountId}`)
  } catch (error) {
    logger.error(`❌ Failed to clear overload status for Azure OpenAI account ${accountId}`, error)
    throw error
  }
}

// 更新账户使用量
async function updateAccountUsage(accountId, tokens) {
  const client = redisClient.getClientSafe()
  const now = new Date().toISOString()

  // 使用 HINCRBY 原子操作更新使用量
  await client.hincrby(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, 'totalTokensUsed', tokens)
  await client.hset(`${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`, 'lastUsedAt', now)

  logger.debug(`Updated Azure OpenAI account ${accountId} usage: ${tokens} tokens`)
}

// 健康检查单个账户
async function healthCheckAccount(accountId) {
  try {
    const account = await getAccount(accountId)
    if (!account) {
      return { id: accountId, status: 'error', message: 'Account not found' }
    }

    // 简单检查配置是否完整
    if (!account.azureEndpoint || !account.apiKey || !account.deploymentName) {
      return {
        id: accountId,
        status: 'error',
        message: 'Incomplete configuration'
      }
    }

    // 可以在这里添加实际的API调用测试
    // 暂时返回成功状态
    return {
      id: accountId,
      status: 'healthy',
      message: 'Account is configured correctly'
    }
  } catch (error) {
    logger.error(`Health check failed for Azure OpenAI account ${accountId}:`, error)
    return {
      id: accountId,
      status: 'error',
      message: error.message
    }
  }
}

// 批量健康检查
async function performHealthChecks() {
  const accounts = await getAllAccounts()
  const results = []

  for (const account of accounts) {
    const result = await healthCheckAccount(account.id)
    results.push(result)
  }

  return results
}

// 切换账户的可调度状态
async function toggleSchedulable(accountId) {
  const account = await getAccount(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  const newSchedulable = account.schedulable === 'true' ? 'false' : 'true'
  await updateAccount(accountId, { schedulable: newSchedulable })

  return {
    id: accountId,
    schedulable: newSchedulable === 'true'
  }
}

// 迁移 API Keys 以支持 Azure OpenAI
async function migrateApiKeysForAzureSupport() {
  const client = redisClient.getClientSafe()
  const apiKeyIds = await client.smembers('api_keys')

  let migratedCount = 0
  for (const keyId of apiKeyIds) {
    const keyData = await client.hgetall(`api_key:${keyId}`)
    if (keyData && !keyData.azureOpenaiAccountId) {
      // 添加 Azure OpenAI 账户ID字段（初始为空）
      await client.hset(`api_key:${keyId}`, 'azureOpenaiAccountId', '')
      migratedCount++
    }
  }

  logger.info(`Migrated ${migratedCount} API keys for Azure OpenAI support`)
  return migratedCount
}

module.exports = {
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  getSharedAccounts,
  selectAvailableAccount,
  updateAccountUsage,
  healthCheckAccount,
  performHealthChecks,
  toggleSchedulable,
  migrateApiKeysForAzureSupport,
  encrypt,
  decrypt,
  markAccountBlocked,
  markAccountUnauthorized,
  markAccountRateLimited,
  markAccountTemporarilyUnavailable,
  markAccountOverloaded,
  isAccountBlocked,
  isAccountRateLimited,
  isAccountUnauthorized,
  isAccountOverloaded,
  removeAccountRateLimit,
  removeAccountOverload,
  clearAccountUnauthorized,
  clearAccountBlocked
}
