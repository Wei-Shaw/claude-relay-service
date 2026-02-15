const redisClient = require('../../models/redis')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const config = require('../../../config/config')
const logger = require('../../utils/logger')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

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
async function createAccount(accountData) {
  const accountId = uuidv4()
  const now = new Date().toISOString()

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
    disableAutoProtection:
      accountData.disableAutoProtection === true || accountData.disableAutoProtection === 'true'
        ? 'true'
        : 'false', // 关闭自动防护
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
  await redisClient.addToIndex('azure_openai:account:index', accountId)

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

  // ✅ 直接保存 subscriptionExpiresAt（如果提供）
  // Azure OpenAI 使用 API Key，没有 token 刷新逻辑，不会覆盖此字段
  if (updates.subscriptionExpiresAt !== undefined) {
    // 直接保存，不做任何调整
  }

  // 自动防护开关
  if (updates.disableAutoProtection !== undefined) {
    updates.disableAutoProtection =
      updates.disableAutoProtection === true || updates.disableAutoProtection === 'true'
        ? 'true'
        : 'false'
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
  const accountGroupService = require('../accountGroupService')
  await accountGroupService.removeAccountFromAllGroups(accountId)

  const client = redisClient.getClientSafe()
  const accountKey = `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${accountId}`

  // 从Redis中删除账户数据
  await client.del(accountKey)

  // 从索引中移除
  await redisClient.removeFromIndex('azure_openai:account:index', accountId)

  // 从共享账户集合中移除
  await client.srem(SHARED_AZURE_OPENAI_ACCOUNTS_KEY, accountId)

  logger.info(`Deleted Azure OpenAI account: ${accountId}`)
  return true
}

// 获取所有账户
async function getAllAccounts() {
  const accountIds = await redisClient.getAllIdsByIndex(
    'azure_openai:account:index',
    `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}*`,
    /^azure_openai:account:(.+)$/
  )

  if (!accountIds || accountIds.length === 0) {
    return []
  }

  const keys = accountIds.map((id) => `${AZURE_OPENAI_ACCOUNT_KEY_PREFIX}${id}`)
  const accounts = []
  const dataList = await redisClient.batchHgetallChunked(keys)

  for (let i = 0; i < keys.length; i++) {
    const accountData = dataList[i]
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
        const isTempUnavail = await upstreamErrorHelper.isTempUnavailable(accountId, 'azure-openai')
        if (!isTempUnavail) {
          logger.debug(`Reusing Azure OpenAI account ${accountId} for session ${sessionId}`)
          return account
        }
        logger.warn(
          `⏱️ Session-bound Azure OpenAI account ${accountId} temporarily unavailable, falling back to pool`
        )
      }
    }
  }

  // 获取所有共享账户
  const sharedAccounts = await getSharedAccounts()

  // 过滤出可用的账户（异步过滤，包含临时不可用检查）
  const availableAccounts = []
  for (const acc of sharedAccounts) {
    // 检查账户订阅是否过期
    if (isSubscriptionExpired(acc)) {
      logger.debug(
        `⏰ Skipping expired Azure OpenAI account: ${acc.name}, expired at ${acc.subscriptionExpiresAt}`
      )
      continue
    }

    if (acc.isActive !== 'true' || acc.schedulable !== 'true') {
      continue
    }

    // 检查临时不可用状态
    const isTempUnavail = await upstreamErrorHelper.isTempUnavailable(acc.id, 'azure-openai')
    if (isTempUnavail) {
      logger.debug(`⏱️ Skipping temporarily unavailable Azure OpenAI account: ${acc.name}`)
      continue
    }

    availableAccounts.push(acc)
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

// 🔄 重置Azure OpenAI账户所有异常状态
async function resetAccountStatus(accountId) {
  try {
    const accountData = await getAccount(accountId)
    if (!accountData) {
      throw new Error('Account not found')
    }

    const client = redisClient.getClientSafe()
    const accountKey = `azure_openai:account:${accountId}`

    const updates = {
      status: 'active',
      errorMessage: '',
      schedulable: 'true',
      isActive: 'true'
    }

    const fieldsToDelete = [
      'rateLimitedAt',
      'rateLimitStatus',
      'unauthorizedAt',
      'unauthorizedCount',
      'overloadedAt',
      'overloadStatus',
      'blockedAt',
      'quotaStoppedAt'
    ]

    await client.hset(accountKey, updates)
    await client.hdel(accountKey, ...fieldsToDelete)

    logger.success(`Reset all error status for Azure OpenAI account ${accountId}`)

    // 清除临时不可用状态
    await upstreamErrorHelper.clearTempUnavailable(accountId, 'azure-openai').catch(() => {})

    // 异步发送 Webhook 通知（忽略错误）
    try {
      const webhookNotifier = require('../../utils/webhookNotifier')
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId,
        accountName: accountData.name || accountId,
        platform: 'azure-openai',
        status: 'recovered',
        errorCode: 'STATUS_RESET',
        reason: 'Account status manually reset',
        timestamp: new Date().toISOString()
      })
    } catch (webhookError) {
      logger.warn(
        'Failed to send webhook notification for Azure OpenAI status reset:',
        webhookError
      )
    }

    return { success: true, accountId }
  } catch (error) {
    logger.error(`❌ Failed to reset Azure OpenAI account status: ${accountId}`, error)
    throw error
  }
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
  resetAccountStatus,
  encrypt,
  decrypt
}
