const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')
const ProxyHelper = require('../../utils/proxyHelper')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const LRUCache = require('../../utils/lruCache')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

class ClaudeConsoleAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc'
    this.ENCRYPTION_SALT = 'claude-console-salt'

    // Redis键前缀
    this.ACCOUNT_KEY_PREFIX = 'claude_console_account:'
    this.SHARED_ACCOUNTS_KEY = 'shared_claude_console_accounts'

    // 🚀 性能优化：缓存派生的加密密钥，避免每次重复计算
    // scryptSync 是 CPU 密集型操作，缓存可以减少 95%+ 的 CPU 密集型操作
    this._encryptionKeyCache = null

    // 🔄 解密结果缓存，提高解密性能
    this._decryptCache = new LRUCache(500)

    // 🧹 定期清理缓存（每10分钟）
    setInterval(
      () => {
        this._decryptCache.cleanup()
        logger.info(
          '🧹 Claude Console decrypt cache cleanup completed',
          this._decryptCache.getStats()
        )
      },
      10 * 60 * 1000
    )
  }

  _getBlockedHandlingMinutes() {
    const raw = process.env.CLAUDE_CONSOLE_BLOCKED_HANDLING_MINUTES
    if (raw === undefined || raw === null || raw === '') {
      return 0
    }

    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }

    return parsed
  }

  _normalizeModelRestrictionMode(mode) {
    return mode === 'whitelist' || mode === 'mapping' ? mode : 'mapping'
  }

  // 🏢 创建Claude Console账户
  async createAccount(options = {}) {
    const {
      name = 'Claude Console Account',
      description = '',
      apiUrl = '',
      apiKey = '',
      priority = 50, // 默认优先级50（1-100）
      supportedModels = [], // 支持的模型列表或映射表，空数组/对象表示支持所有
      userAgent = 'claude-cli/1.0.69 (external, cli)',
      rateLimitDuration = 60, // 限流时间（分钟）
      proxy = null,
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      schedulable = true, // 是否可被调度
      dailyQuota = 0, // 每日额度限制（美元），0表示不限制
      quotaResetTime = '00:00', // 额度重置时间（HH:mm格式）
      maxConcurrentTasks = 0, // 最大并发任务数，0表示无限制
      disableAutoProtection = false, // 是否关闭自动防护（429/401/400/529 不自动禁用）
      modelRestrictionMode = 'mapping', // 模型限制 UI 模式
      interceptWarmup = false // 拦截预热请求（标题生成、Warmup等）
    } = options

    // 验证必填字段
    if (!apiUrl || !apiKey) {
      throw new Error('API URL and API Key are required for Claude Console account')
    }

    const accountId = uuidv4()

    // 处理 supportedModels，确保向后兼容
    const normalizedModelRestrictionMode = this._normalizeModelRestrictionMode(modelRestrictionMode)
    const processedModels = this._processModelMapping(
      supportedModels,
      normalizedModelRestrictionMode
    )

    const accountData = {
      id: accountId,
      platform: 'claude-console',
      name,
      description,
      apiUrl,
      apiKey: this._encryptSensitiveData(apiKey),
      priority: priority.toString(),
      supportedModels: JSON.stringify(processedModels),
      modelRestrictionMode: normalizedModelRestrictionMode,
      userAgent,
      rateLimitDuration: rateLimitDuration.toString(),
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      status: 'active',
      errorMessage: '',

      // ✅ 新增：账户订阅到期时间（业务字段，手动管理）
      // 注意：Claude Console 没有 OAuth token，因此没有 expiresAt（token过期）
      subscriptionExpiresAt: options.subscriptionExpiresAt || null,

      // 限流相关
      rateLimitedAt: '',
      rateLimitStatus: '',
      // 调度控制
      schedulable: schedulable.toString(),
      // 额度管理相关
      dailyQuota: dailyQuota.toString(), // 每日额度限制（美元）
      dailyUsage: '0', // 当日使用金额（美元）
      // 使用与统计一致的时区日期，避免边界问题
      lastResetDate: redis.getDateStringInTimezone(), // 最后重置日期（按配置时区）
      quotaResetTime, // 额度重置时间
      quotaStoppedAt: '', // 因额度停用的时间
      maxConcurrentTasks: maxConcurrentTasks.toString(), // 最大并发任务数，0表示无限制
      disableAutoProtection: disableAutoProtection.toString(), // 关闭自动防护
      interceptWarmup: interceptWarmup.toString() // 拦截预热请求
    }

    const client = redis.getClientSafe()
    logger.debug(
      `[DEBUG] Saving account data to Redis with key: ${this.ACCOUNT_KEY_PREFIX}${accountId}`
    )
    logger.debug(`[DEBUG] Account data to save: ${JSON.stringify(accountData, null, 2)}`)

    await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, accountData)
    await redis.addToIndex('claude_console_account:index', accountId)

    // 如果是共享账户，添加到共享账户集合
    if (accountType === 'shared') {
      await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId)
    }

    logger.success(`🏢 Created Claude Console account: ${name} (${accountId})`)

    return {
      id: accountId,
      name,
      description,
      apiUrl,
      priority,
      supportedModels,
      modelRestrictionMode: normalizedModelRestrictionMode,
      userAgent,
      rateLimitDuration,
      isActive,
      proxy,
      accountType,
      status: 'active',
      createdAt: accountData.createdAt,
      dailyQuota,
      dailyUsage: 0,
      lastResetDate: accountData.lastResetDate,
      quotaResetTime,
      quotaStoppedAt: null,
      maxConcurrentTasks, // 新增：返回并发限制配置
      disableAutoProtection, // 新增：返回自动防护开关
      interceptWarmup, // 新增：返回预热请求拦截开关
      activeTaskCount: 0 // 新增：新建账户当前并发数为0
    }
  }

  // 📋 获取所有Claude Console账户
  async getAllAccounts() {
    try {
      const client = redis.getClientSafe()
      const accountIds = await redis.getAllIdsByIndex(
        'claude_console_account:index',
        `${this.ACCOUNT_KEY_PREFIX}*`,
        /^claude_console_account:(.+)$/
      )
      const keys = accountIds.map((id) => `${this.ACCOUNT_KEY_PREFIX}${id}`)
      const accounts = []
      const dataList = await redis.batchHgetallChunked(keys)

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const accountData = dataList[i]
        if (accountData && Object.keys(accountData).length > 0) {
          if (!accountData.id) {
            logger.warn(`⚠️ 检测到缺少ID的Claude Console账户数据，执行清理: ${key}`)
            await client.del(key)
            continue
          }

          // 获取限流状态信息
          const rateLimitInfo = this._getRateLimitInfo(accountData)

          // 获取实时并发计数
          const activeTaskCount = await redis.getConsoleAccountConcurrency(accountData.id)

          accounts.push({
            id: accountData.id,
            platform: accountData.platform,
            name: accountData.name,
            description: accountData.description,
            apiUrl: accountData.apiUrl,
            priority: parseInt(accountData.priority) || 50,
            supportedModels: JSON.parse(accountData.supportedModels || '[]'),
            modelRestrictionMode: accountData.modelRestrictionMode || '',
            userAgent: accountData.userAgent,
            rateLimitDuration: Number.isNaN(parseInt(accountData.rateLimitDuration))
              ? 60
              : parseInt(accountData.rateLimitDuration),
            isActive: accountData.isActive === 'true',
            proxy: accountData.proxy ? JSON.parse(accountData.proxy) : null,
            accountType: accountData.accountType || 'shared',
            createdAt: accountData.createdAt,
            lastUsedAt: accountData.lastUsedAt,
            status: accountData.status || 'active',
            errorMessage: accountData.errorMessage,
            rateLimitInfo,
            schedulable: accountData.schedulable !== 'false', // 默认为true，只有明确设置为false才不可调度

            // ✅ 前端显示订阅过期时间（业务字段）
            expiresAt: accountData.subscriptionExpiresAt || null,

            // 额度管理相关
            dailyQuota: parseFloat(accountData.dailyQuota || '0'),
            dailyUsage: parseFloat(accountData.dailyUsage || '0'),
            lastResetDate: accountData.lastResetDate || '',
            quotaResetTime: accountData.quotaResetTime || '00:00',
            quotaStoppedAt: accountData.quotaStoppedAt || null,

            // 并发控制相关
            maxConcurrentTasks: parseInt(accountData.maxConcurrentTasks) || 0,
            activeTaskCount,
            disableAutoProtection: accountData.disableAutoProtection === 'true',
            // 拦截预热请求
            interceptWarmup: accountData.interceptWarmup === 'true'
          })
        }
      }

      return accounts
    } catch (error) {
      logger.error('❌ Failed to get Claude Console accounts:', error)
      throw error
    }
  }

  // 🔍 获取单个账户（内部使用，包含敏感信息）
  async getAccount(accountId) {
    const client = redis.getClientSafe()
    logger.debug(`[DEBUG] Getting account data for ID: ${accountId}`)
    const accountData = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)

    if (!accountData || Object.keys(accountData).length === 0) {
      logger.debug(`[DEBUG] No account data found for ID: ${accountId}`)
      return null
    }

    logger.debug(`[DEBUG] Raw account data keys: ${Object.keys(accountData).join(', ')}`)
    logger.debug(`[DEBUG] Raw supportedModels value: ${accountData.supportedModels}`)

    // 解密敏感字段（只解密apiKey，apiUrl不加密）
    const decryptedKey = this._decryptSensitiveData(accountData.apiKey)
    logger.debug(
      `[DEBUG] URL exists: ${!!accountData.apiUrl}, Decrypted key exists: ${!!decryptedKey}`
    )

    accountData.apiKey = decryptedKey

    // 解析JSON字段
    const parsedModels = JSON.parse(accountData.supportedModels || '[]')
    logger.debug(`[DEBUG] Parsed supportedModels: ${JSON.stringify(parsedModels)}`)

    accountData.supportedModels = parsedModels
    accountData.modelRestrictionMode = accountData.modelRestrictionMode || ''
    accountData.priority = parseInt(accountData.priority) || 50
    {
      const _parsedDuration = parseInt(accountData.rateLimitDuration)
      accountData.rateLimitDuration = Number.isNaN(_parsedDuration) ? 60 : _parsedDuration
    }
    accountData.isActive = accountData.isActive === 'true'
    accountData.schedulable = accountData.schedulable !== 'false' // 默认为true
    accountData.disableAutoProtection = accountData.disableAutoProtection === 'true'

    if (accountData.proxy) {
      accountData.proxy = JSON.parse(accountData.proxy)
    }

    // 解析并发控制字段
    accountData.maxConcurrentTasks = parseInt(accountData.maxConcurrentTasks) || 0
    // 获取实时并发计数
    accountData.activeTaskCount = await redis.getConsoleAccountConcurrency(accountId)

    logger.debug(
      `[DEBUG] Final account data - name: ${accountData.name}, hasApiUrl: ${!!accountData.apiUrl}, hasApiKey: ${!!accountData.apiKey}, supportedModels: ${JSON.stringify(accountData.supportedModels)}`
    )

    return accountData
  }

  // 📝 更新账户
  async updateAccount(accountId, updates) {
    try {
      const existingAccount = await this.getAccount(accountId)
      if (!existingAccount) {
        throw new Error('Account not found')
      }

      const client = redis.getClientSafe()
      const updatedData = {}

      // 处理各个字段的更新
      logger.debug(
        `[DEBUG] Update request received with fields: ${Object.keys(updates).join(', ')}`
      )
      logger.debug(`[DEBUG] Updates content: ${JSON.stringify(updates, null, 2)}`)

      if (updates.name !== undefined) {
        updatedData.name = updates.name
      }
      if (updates.description !== undefined) {
        updatedData.description = updates.description
      }
      if (updates.apiUrl !== undefined) {
        logger.debug(`[DEBUG] Updating apiUrl from frontend: ${updates.apiUrl}`)
        updatedData.apiUrl = updates.apiUrl
      }
      if (updates.apiKey !== undefined) {
        logger.debug(`[DEBUG] Updating apiKey (length: ${updates.apiKey?.length})`)
        updatedData.apiKey = this._encryptSensitiveData(updates.apiKey)
      }
      if (updates.priority !== undefined) {
        updatedData.priority = updates.priority.toString()
      }
      const modelRestrictionModeForUpdate =
        updates.modelRestrictionMode !== undefined
          ? this._normalizeModelRestrictionMode(updates.modelRestrictionMode)
          : existingAccount.modelRestrictionMode || 'mapping'

      if (updates.supportedModels !== undefined) {
        logger.debug(`[DEBUG] Updating supportedModels: ${JSON.stringify(updates.supportedModels)}`)
        // 处理 supportedModels，确保向后兼容
        const processedModels = this._processModelMapping(
          updates.supportedModels,
          modelRestrictionModeForUpdate
        )
        updatedData.supportedModels = JSON.stringify(processedModels)
      }
      if (updates.modelRestrictionMode !== undefined) {
        updatedData.modelRestrictionMode = modelRestrictionModeForUpdate
      }
      if (updates.userAgent !== undefined) {
        updatedData.userAgent = updates.userAgent
      }
      if (updates.rateLimitDuration !== undefined) {
        updatedData.rateLimitDuration = updates.rateLimitDuration.toString()
      }
      if (updates.proxy !== undefined) {
        updatedData.proxy = updates.proxy ? JSON.stringify(updates.proxy) : ''
      }
      if (updates.isActive !== undefined) {
        updatedData.isActive = updates.isActive.toString()
      }
      if (updates.schedulable !== undefined) {
        updatedData.schedulable = updates.schedulable.toString()
        // 如果是手动修改调度状态，清除所有自动停止相关的字段
        // 防止自动恢复
        updatedData.rateLimitAutoStopped = ''
        updatedData.quotaAutoStopped = ''
        // 兼容旧的标记
        updatedData.autoStoppedAt = ''
        updatedData.stoppedReason = ''

        // 记录日志
        if (updates.schedulable === true || updates.schedulable === 'true') {
          logger.info(`✅ Manually enabled scheduling for Claude Console account ${accountId}`)
        } else {
          logger.info(`⛔ Manually disabled scheduling for Claude Console account ${accountId}`)
        }
      }

      // 额度管理相关字段
      if (updates.dailyQuota !== undefined) {
        updatedData.dailyQuota = updates.dailyQuota.toString()
      }
      if (updates.quotaResetTime !== undefined) {
        updatedData.quotaResetTime = updates.quotaResetTime
      }
      if (updates.dailyUsage !== undefined) {
        updatedData.dailyUsage = updates.dailyUsage.toString()
      }
      if (updates.lastResetDate !== undefined) {
        updatedData.lastResetDate = updates.lastResetDate
      }
      if (updates.quotaStoppedAt !== undefined) {
        updatedData.quotaStoppedAt = updates.quotaStoppedAt
      }

      // 并发控制相关字段
      if (updates.maxConcurrentTasks !== undefined) {
        updatedData.maxConcurrentTasks = updates.maxConcurrentTasks.toString()
      }
      if (updates.disableAutoProtection !== undefined) {
        updatedData.disableAutoProtection = updates.disableAutoProtection.toString()
      }
      if (updates.interceptWarmup !== undefined) {
        updatedData.interceptWarmup = updates.interceptWarmup.toString()
      }

      // ✅ 直接保存 subscriptionExpiresAt（如果提供）
      // Claude Console 没有 token 刷新逻辑，不会覆盖此字段
      if (updates.subscriptionExpiresAt !== undefined) {
        updatedData.subscriptionExpiresAt = updates.subscriptionExpiresAt
      }

      // 处理账户类型变更
      if (updates.accountType && updates.accountType !== existingAccount.accountType) {
        updatedData.accountType = updates.accountType

        if (updates.accountType === 'shared') {
          await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId)
        } else {
          await client.srem(this.SHARED_ACCOUNTS_KEY, accountId)
        }
      }

      updatedData.updatedAt = new Date().toISOString()

      // 检查是否手动禁用了账号，如果是则发送webhook通知
      if (updates.isActive === false && existingAccount.isActive === true) {
        try {
          const webhookNotifier = require('../../utils/webhookNotifier')
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId,
            accountName: updatedData.name || existingAccount.name || 'Unknown Account',
            platform: 'claude-console',
            status: 'disabled',
            errorCode: 'CLAUDE_CONSOLE_MANUALLY_DISABLED',
            reason: 'Account manually disabled by administrator'
          })
        } catch (webhookError) {
          logger.error(
            'Failed to send webhook notification for manual account disable:',
            webhookError
          )
        }
      }

      logger.debug(`[DEBUG] Final updatedData to save: ${JSON.stringify(updatedData, null, 2)}`)
      logger.debug(`[DEBUG] Updating Redis key: ${this.ACCOUNT_KEY_PREFIX}${accountId}`)

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updatedData)

      logger.success(`📝 Updated Claude Console account: ${accountId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to update Claude Console account:', error)
      throw error
    }
  }

  // 🗑️ 删除账户
  async deleteAccount(accountId) {
    try {
      const client = redis.getClientSafe()
      const account = await this.getAccount(accountId)

      if (!account) {
        throw new Error('Account not found')
      }

      // 从Redis删除
      await client.del(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
      await redis.removeFromIndex('claude_console_account:index', accountId)

      // 从共享账户集合中移除
      if (account.accountType === 'shared') {
        await client.srem(this.SHARED_ACCOUNTS_KEY, accountId)
      }

      logger.success(`🗑️ Deleted Claude Console account: ${accountId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to delete Claude Console account:', error)
      throw error
    }
  }

  // 🚫 标记账号为限流状态
  async markAccountRateLimited(accountId) {
    try {
      const client = redis.getClientSafe()
      const account = await this.getAccount(accountId)

      if (!account) {
        throw new Error('Account not found')
      }

      // disableAutoProtection 检查
      if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
        logger.info(
          `🛡️ Account ${accountId} has auto-protection disabled, skipping markAccountRateLimited`
        )
        upstreamErrorHelper
          .recordErrorHistory(accountId, 'claude-console', 429, 'rate_limit')
          .catch(() => {})
        return { success: true, skipped: true }
      }

      // 如果限流时间设置为 0，表示不启用限流机制，直接返回
      if (account.rateLimitDuration === 0) {
        logger.info(
          `ℹ️ Claude Console account ${account.name} (${accountId}) has rate limiting disabled, skipping rate limit`
        )
        return { success: true, skipped: true }
      }

      const updates = {
        rateLimitedAt: new Date().toISOString(),
        rateLimitStatus: 'limited',
        isActive: 'false', // 禁用账户
        schedulable: 'false', // 停止调度，与其他平台保持一致
        errorMessage: `Rate limited at ${new Date().toISOString()}`,
        // 使用独立的限流自动停止标记
        rateLimitAutoStopped: 'true'
      }

      // 只有当前状态不是quota_exceeded时才设置为rate_limited
      // 避免覆盖更重要的配额超限状态
      const currentStatus = await client.hget(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, 'status')
      if (currentStatus !== 'quota_exceeded') {
        updates.status = 'rate_limited'
      }

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updates)

      // 发送Webhook通知
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        const { getISOStringWithTimezone } = require('../../utils/dateHelper')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'error',
          errorCode: 'CLAUDE_CONSOLE_RATE_LIMITED',
          reason: `Account rate limited (429 error) and has been disabled. ${account.rateLimitDuration ? `Will be automatically re-enabled after ${account.rateLimitDuration} minutes` : 'Manual intervention required to re-enable'}`,
          timestamp: getISOStringWithTimezone(new Date())
        })
      } catch (webhookError) {
        logger.error('Failed to send rate limit webhook notification:', webhookError)
      }

      logger.warn(
        `🚫 Claude Console account marked as rate limited: ${account.name} (${accountId})`
      )
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Claude Console account as rate limited: ${accountId}`, error)
      throw error
    }
  }

  // ✅ 移除账号的限流状态
  async removeAccountRateLimit(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      // 获取账户当前状态和额度信息
      const [currentStatus, quotaStoppedAt] = await client.hmget(
        accountKey,
        'status',
        'quotaStoppedAt'
      )

      // 删除限流相关字段
      await client.hdel(accountKey, 'rateLimitedAt', 'rateLimitStatus')

      // 根据不同情况决定是否恢复账户
      if (currentStatus === 'rate_limited') {
        if (quotaStoppedAt) {
          // 还有额度限制，改为quota_exceeded状态
          await client.hset(accountKey, {
            status: 'quota_exceeded'
            // isActive保持false
          })
          logger.info(`⚠️ Rate limit removed but quota exceeded remains for account: ${accountId}`)
        } else {
          // 没有额度限制，完全恢复
          const accountData = await client.hgetall(accountKey)
          const updateData = {
            isActive: 'true',
            status: 'active',
            errorMessage: ''
          }

          const hadAutoStop = accountData.rateLimitAutoStopped === 'true'

          // 只恢复因限流而自动停止的账户
          if (hadAutoStop && accountData.schedulable === 'false') {
            updateData.schedulable = 'true' // 恢复调度
            logger.info(
              `✅ Auto-resuming scheduling for Claude Console account ${accountId} after rate limit cleared`
            )
          }

          if (hadAutoStop) {
            await client.hdel(accountKey, 'rateLimitAutoStopped')
          }

          await client.hset(accountKey, updateData)
          logger.success(`Rate limit removed and account re-enabled: ${accountId}`)
        }
      } else {
        if (await client.hdel(accountKey, 'rateLimitAutoStopped')) {
          logger.info(
            `ℹ️ Removed stale auto-stop flag for Claude Console account ${accountId} during rate limit recovery`
          )
        }
        logger.success(`Rate limit removed for Claude Console account: ${accountId}`)
      }

      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to remove rate limit for Claude Console account: ${accountId}`, error)
      throw error
    }
  }

  // 🔍 检查账号是否处于限流状态
  async isAccountRateLimited(accountId) {
    try {
      const account = await this.getAccount(accountId)
      if (!account) {
        return false
      }

      // 如果限流时间设置为 0，表示不启用限流机制
      if (account.rateLimitDuration === 0) {
        return false
      }

      if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
        const rateLimitedAt = new Date(account.rateLimitedAt)
        const now = new Date()
        const minutesSinceRateLimit = (now - rateLimitedAt) / (1000 * 60)

        // 使用账户配置的限流时间
        const rateLimitDuration =
          typeof account.rateLimitDuration === 'number' && !Number.isNaN(account.rateLimitDuration)
            ? account.rateLimitDuration
            : 60

        if (minutesSinceRateLimit >= rateLimitDuration) {
          await this.removeAccountRateLimit(accountId)
          return false
        }

        return true
      }

      return false
    } catch (error) {
      logger.error(
        `❌ Failed to check rate limit status for Claude Console account: ${accountId}`,
        error
      )
      return false
    }
  }

  // 🔍 检查账号是否因额度超限而被停用（懒惰检查）
  async isAccountQuotaExceeded(accountId) {
    try {
      const account = await this.getAccount(accountId)
      if (!account) {
        return false
      }

      // 如果没有设置额度限制，不会超额
      const dailyQuota = parseFloat(account.dailyQuota || '0')
      if (isNaN(dailyQuota) || dailyQuota <= 0) {
        return false
      }

      // 如果账户没有被额度停用，检查当前使用情况
      if (!account.quotaStoppedAt) {
        return false
      }

      // 检查是否应该重置额度（到了新的重置时间点）
      if (this._shouldResetQuota(account)) {
        await this.resetDailyUsage(accountId)
        return false
      }

      // 仍在额度超限状态
      return true
    } catch (error) {
      logger.error(
        `❌ Failed to check quota exceeded status for Claude Console account: ${accountId}`,
        error
      )
      return false
    }
  }

  // 🔍 判断是否应该重置账户额度
  _shouldResetQuota(account) {
    // 与 Redis 统计一致：按配置时区判断“今天”与时间点
    const tzNow = redis.getDateInTimezone(new Date())
    const today = redis.getDateStringInTimezone(tzNow)

    // 如果已经是今天重置过的，不需要重置
    if (account.lastResetDate === today) {
      return false
    }

    // 检查是否到了重置时间点（按配置时区的小时/分钟）
    const resetTime = account.quotaResetTime || '00:00'
    const [resetHour, resetMinute] = resetTime.split(':').map((n) => parseInt(n))

    const currentHour = tzNow.getUTCHours()
    const currentMinute = tzNow.getUTCMinutes()

    // 如果当前时间已过重置时间且不是同一天重置的，应该重置
    return currentHour > resetHour || (currentHour === resetHour && currentMinute >= resetMinute)
  }

  // 🚫 标记账号为未授权状态（401错误）
  async markAccountUnauthorized(accountId) {
    try {
      const client = redis.getClientSafe()
      const account = await this.getAccount(accountId)

      if (!account) {
        throw new Error('Account not found')
      }

      // disableAutoProtection 检查
      if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
        logger.info(
          `🛡️ Account ${accountId} has auto-protection disabled, skipping markAccountUnauthorized`
        )
        upstreamErrorHelper
          .recordErrorHistory(accountId, 'claude-console', 401, 'auth_error')
          .catch(() => {})
        return { success: true, skipped: true }
      }

      const updates = {
        schedulable: 'false',
        status: 'unauthorized',
        errorMessage: 'API Key无效或已过期（401错误）',
        unauthorizedAt: new Date().toISOString(),
        unauthorizedCount: String((parseInt(account.unauthorizedCount || '0') || 0) + 1)
      }

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updates)

      // 发送Webhook通知
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'error',
          errorCode: 'CLAUDE_CONSOLE_UNAUTHORIZED',
          reason: 'API Key无效或已过期（401错误），账户已停止调度',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.error('Failed to send unauthorized webhook notification:', webhookError)
      }

      logger.warn(
        `🚫 Claude Console account marked as unauthorized: ${account.name} (${accountId})`
      )
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Claude Console account as unauthorized: ${accountId}`, error)
      throw error
    }
  }

  // 🚫 标记账号为临时封禁状态（400错误 - 账户临时禁用）
  async markConsoleAccountBlocked(accountId, errorDetails = '') {
    try {
      const client = redis.getClientSafe()
      const account = await this.getAccount(accountId)

      if (!account) {
        throw new Error('Account not found')
      }

      // disableAutoProtection 检查
      if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
        logger.info(
          `🛡️ Account ${accountId} has auto-protection disabled, skipping markConsoleAccountBlocked`
        )
        upstreamErrorHelper
          .recordErrorHistory(accountId, 'claude-console', 403, 'server_error')
          .catch(() => {})
        return { success: true, skipped: true }
      }

      const blockedMinutes = this._getBlockedHandlingMinutes()

      if (blockedMinutes <= 0) {
        logger.info(
          `ℹ️ CLAUDE_CONSOLE_BLOCKED_HANDLING_MINUTES 未设置或为0，跳过账户封禁：${account.name} (${accountId})`
        )

        if (account.blockedStatus === 'blocked') {
          try {
            await this.removeAccountBlocked(accountId)
          } catch (cleanupError) {
            logger.warn(`⚠️ 尝试移除账户封禁状态失败：${accountId}`, cleanupError)
          }
        }

        return { success: false, skipped: true }
      }

      const updates = {
        blockedAt: new Date().toISOString(),
        blockedStatus: 'blocked',
        isActive: 'false', // 禁用账户（与429保持一致）
        schedulable: 'false', // 停止调度（与429保持一致）
        status: 'account_blocked', // 设置状态（与429保持一致）
        errorMessage: '账户临时被禁用（400错误）',
        // 使用独立的封禁自动停止标记
        blockedAutoStopped: 'true'
      }

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updates)

      // 发送Webhook通知，包含完整错误详情
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'error',
          errorCode: 'CLAUDE_CONSOLE_BLOCKED',
          reason: `账户临时被禁用（400错误）。账户将在 ${blockedMinutes} 分钟后自动恢复。`,
          errorDetails: errorDetails || '无错误详情',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.error('Failed to send blocked webhook notification:', webhookError)
      }

      logger.warn(`🚫 Claude Console account temporarily blocked: ${account.name} (${accountId})`)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Claude Console account as blocked: ${accountId}`, error)
      throw error
    }
  }

  // ✅ 移除账号的临时封禁状态
  async removeAccountBlocked(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      // 获取账户当前状态和额度信息
      const [currentStatus, quotaStoppedAt] = await client.hmget(
        accountKey,
        'status',
        'quotaStoppedAt'
      )

      // 删除封禁相关字段
      await client.hdel(accountKey, 'blockedAt', 'blockedStatus')

      // 根据不同情况决定是否恢复账户
      if (currentStatus === 'account_blocked') {
        if (quotaStoppedAt) {
          // 还有额度限制，改为quota_exceeded状态
          await client.hset(accountKey, {
            status: 'quota_exceeded'
            // isActive保持false
          })
          logger.info(
            `⚠️ Blocked status removed but quota exceeded remains for account: ${accountId}`
          )
        } else {
          // 没有额度限制，完全恢复
          const accountData = await client.hgetall(accountKey)
          const updateData = {
            isActive: 'true',
            status: 'active',
            errorMessage: ''
          }

          const hadAutoStop = accountData.blockedAutoStopped === 'true'

          // 只恢复因封禁而自动停止的账户
          if (hadAutoStop && accountData.schedulable === 'false') {
            updateData.schedulable = 'true' // 恢复调度
            logger.info(
              `✅ Auto-resuming scheduling for Claude Console account ${accountId} after blocked status cleared`
            )
          }

          if (hadAutoStop) {
            await client.hdel(accountKey, 'blockedAutoStopped')
          }

          await client.hset(accountKey, updateData)
          logger.success(`Blocked status removed and account re-enabled: ${accountId}`)
        }
      } else {
        if (await client.hdel(accountKey, 'blockedAutoStopped')) {
          logger.info(
            `ℹ️ Removed stale auto-stop flag for Claude Console account ${accountId} during blocked status recovery`
          )
        }
        logger.success(`Blocked status removed for Claude Console account: ${accountId}`)
      }

      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to remove blocked status for Claude Console account: ${accountId}`,
        error
      )
      throw error
    }
  }

  // 🔍 检查账号是否处于临时封禁状态
  async isAccountBlocked(accountId) {
    try {
      const account = await this.getAccount(accountId)
      if (!account) {
        return false
      }

      if (account.blockedStatus === 'blocked' && account.blockedAt) {
        const blockedDuration = this._getBlockedHandlingMinutes()

        if (blockedDuration <= 0) {
          await this.removeAccountBlocked(accountId)
          return false
        }

        const blockedAt = new Date(account.blockedAt)
        const now = new Date()
        const minutesSinceBlocked = (now - blockedAt) / (1000 * 60)

        // 禁用时长过后自动恢复
        if (minutesSinceBlocked >= blockedDuration) {
          await this.removeAccountBlocked(accountId)
          return false
        }

        return true
      }

      return false
    } catch (error) {
      logger.error(
        `❌ Failed to check blocked status for Claude Console account: ${accountId}`,
        error
      )
      return false
    }
  }

  // 🚫 标记账号为过载状态（529错误）
  async markAccountOverloaded(accountId) {
    try {
      const client = redis.getClientSafe()
      const account = await this.getAccount(accountId)

      if (!account) {
        throw new Error('Account not found')
      }

      // disableAutoProtection 检查
      if (account.disableAutoProtection === true || account.disableAutoProtection === 'true') {
        logger.info(
          `🛡️ Account ${accountId} has auto-protection disabled, skipping markAccountOverloaded`
        )
        upstreamErrorHelper
          .recordErrorHistory(accountId, 'claude-console', 529, 'overload')
          .catch(() => {})
        return { success: true, skipped: true }
      }

      const updates = {
        overloadedAt: new Date().toISOString(),
        overloadStatus: 'overloaded',
        errorMessage: '服务过载（529错误）'
      }

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updates)

      // 发送Webhook通知
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'error',
          errorCode: 'CLAUDE_CONSOLE_OVERLOADED',
          reason: '服务过载（529错误）。账户将暂时停止调度',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.error('Failed to send overload webhook notification:', webhookError)
      }

      logger.warn(`🚫 Claude Console account marked as overloaded: ${account.name} (${accountId})`)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark Claude Console account as overloaded: ${accountId}`, error)
      throw error
    }
  }

  // ✅ 移除账号的过载状态
  async removeAccountOverload(accountId) {
    try {
      const client = redis.getClientSafe()

      await client.hdel(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, 'overloadedAt', 'overloadStatus')

      logger.success(`Overload status removed for Claude Console account: ${accountId}`)
      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to remove overload status for Claude Console account: ${accountId}`,
        error
      )
      throw error
    }
  }

  // 🔍 检查账号是否处于过载状态
  async isAccountOverloaded(accountId) {
    try {
      const account = await this.getAccount(accountId)
      if (!account) {
        return false
      }

      if (account.overloadStatus === 'overloaded' && account.overloadedAt) {
        const overloadedAt = new Date(account.overloadedAt)
        const now = new Date()
        const minutesSinceOverload = (now - overloadedAt) / (1000 * 60)

        // 过载状态持续10分钟后自动恢复
        if (minutesSinceOverload >= 10) {
          await this.removeAccountOverload(accountId)
          return false
        }

        return true
      }

      return false
    } catch (error) {
      logger.error(
        `❌ Failed to check overload status for Claude Console account: ${accountId}`,
        error
      )
      return false
    }
  }

  // 🚫 标记账号为封锁状态（模型不支持等原因）
  async blockAccount(accountId, reason) {
    try {
      const client = redis.getClientSafe()

      // 获取账户信息用于webhook通知
      const accountData = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)

      const updates = {
        status: 'blocked',
        errorMessage: reason,
        blockedAt: new Date().toISOString()
      }

      await client.hset(`${this.ACCOUNT_KEY_PREFIX}${accountId}`, updates)

      logger.warn(`🚫 Claude Console account blocked: ${accountId} - ${reason}`)

      // 发送Webhook通知
      if (accountData && Object.keys(accountData).length > 0) {
        try {
          const webhookNotifier = require('../../utils/webhookNotifier')
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId,
            accountName: accountData.name || 'Unknown Account',
            platform: 'claude-console',
            status: 'blocked',
            errorCode: 'CLAUDE_CONSOLE_BLOCKED',
            reason
          })
        } catch (webhookError) {
          logger.error('Failed to send webhook notification:', webhookError)
        }
      }

      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to block Claude Console account: ${accountId}`, error)
      throw error
    }
  }

  // 🌐 创建代理agent（使用统一的代理工具）
  _createProxyAgent(proxyConfig) {
    const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
    if (proxyAgent) {
      logger.info(
        `🌐 Using proxy for Claude Console request: ${ProxyHelper.getProxyDescription(proxyConfig)}`
      )
    } else if (proxyConfig) {
      logger.debug('🌐 Failed to create proxy agent for Claude Console')
    } else {
      logger.debug('🌐 No proxy configured for Claude Console request')
    }
    return proxyAgent
  }

  // 🔐 加密敏感数据
  _encryptSensitiveData(data) {
    if (!data) {
      return ''
    }

    try {
      const key = this._generateEncryptionKey()
      const iv = crypto.randomBytes(16)

      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv)
      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      return `${iv.toString('hex')}:${encrypted}`
    } catch (error) {
      logger.error('❌ Encryption error:', error)
      return data
    }
  }

  // 🔓 解密敏感数据
  _decryptSensitiveData(encryptedData) {
    if (!encryptedData) {
      return ''
    }

    // 🎯 检查缓存
    const cacheKey = crypto.createHash('sha256').update(encryptedData).digest('hex')
    const cached = this._decryptCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    try {
      if (encryptedData.includes(':')) {
        const parts = encryptedData.split(':')
        if (parts.length === 2) {
          const key = this._generateEncryptionKey()
          const iv = Buffer.from(parts[0], 'hex')
          const encrypted = parts[1]

          const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv)
          let decrypted = decipher.update(encrypted, 'hex', 'utf8')
          decrypted += decipher.final('utf8')

          // 💾 存入缓存（5分钟过期）
          this._decryptCache.set(cacheKey, decrypted, 5 * 60 * 1000)

          // 📊 定期打印缓存统计
          if ((this._decryptCache.hits + this._decryptCache.misses) % 1000 === 0) {
            this._decryptCache.printStats()
          }

          return decrypted
        }
      }

      return encryptedData
    } catch (error) {
      logger.error('❌ Decryption error:', error)
      return encryptedData
    }
  }

  // 🔑 生成加密密钥
  _generateEncryptionKey() {
    // 性能优化：缓存密钥派生结果，避免重复的 CPU 密集计算
    // scryptSync 是故意设计为慢速的密钥派生函数（防暴力破解）
    // 但在高并发场景下，每次都重新计算会导致 CPU 100% 占用
    if (!this._encryptionKeyCache) {
      // 只在第一次调用时计算，后续使用缓存
      // 由于输入参数固定，派生结果永远相同，不影响数据兼容性
      this._encryptionKeyCache = crypto.scryptSync(
        config.security.encryptionKey,
        this.ENCRYPTION_SALT,
        32
      )
      logger.info('🔑 Console encryption key derived and cached for performance optimization')
    }
    return this._encryptionKeyCache
  }

  // 🎭 掩码API URL
  _maskApiUrl(apiUrl) {
    if (!apiUrl) {
      return ''
    }

    try {
      const url = new URL(apiUrl)
      return `${url.protocol}//${url.hostname}/***`
    } catch {
      return '***'
    }
  }

  // 📊 获取限流信息
  _getRateLimitInfo(accountData) {
    if (accountData.rateLimitStatus === 'limited' && accountData.rateLimitedAt) {
      const rateLimitedAt = new Date(accountData.rateLimitedAt)
      const now = new Date()
      const minutesSinceRateLimit = Math.floor((now - rateLimitedAt) / (1000 * 60))
      const __parsedDuration = parseInt(accountData.rateLimitDuration)
      const rateLimitDuration = Number.isNaN(__parsedDuration) ? 60 : __parsedDuration
      const minutesRemaining = Math.max(0, rateLimitDuration - minutesSinceRateLimit)

      return {
        isRateLimited: minutesRemaining > 0,
        rateLimitedAt: accountData.rateLimitedAt,
        minutesSinceRateLimit,
        minutesRemaining
      }
    }

    return {
      isRateLimited: false,
      rateLimitedAt: null,
      minutesSinceRateLimit: 0,
      minutesRemaining: 0
    }
  }

  // 🔄 处理模型映射，确保向后兼容
  _processModelMapping(supportedModels, modelRestrictionMode = 'mapping') {
    const normalizedMode = this._normalizeModelRestrictionMode(modelRestrictionMode)

    // 如果是空值，返回空对象（支持所有模型）
    if (!supportedModels || (Array.isArray(supportedModels) && supportedModels.length === 0)) {
      return {}
    }

    // 如果已经是对象格式（新的映射表格式），按模式归一化
    if (typeof supportedModels === 'object' && !Array.isArray(supportedModels)) {
      if (normalizedMode === 'whitelist') {
        const mapping = {}
        Object.keys(supportedModels).forEach((model) => {
          if (model && typeof model === 'string') {
            mapping[model] = model
          }
        })
        return mapping
      }
      return supportedModels
    }

    // 如果是数组格式（旧格式），转换为映射表
    if (Array.isArray(supportedModels)) {
      const mapping = {}
      supportedModels.forEach((model) => {
        if (model && typeof model === 'string') {
          mapping[model] = model // 映射到自身
        }
      })
      return mapping
    }

    // 其他情况返回空对象
    return {}
  }

  // 🔍 检查模型是否支持（用于调度）
  isModelSupported(modelMapping, requestedModel) {
    // 如果映射表为空，支持所有模型
    if (!modelMapping || Object.keys(modelMapping).length === 0) {
      return true
    }

    // 检查请求的模型是否在映射表的键中（精确匹配）
    if (Object.prototype.hasOwnProperty.call(modelMapping, requestedModel)) {
      return true
    }

    // 尝试大小写不敏感匹配
    const requestedModelLower = requestedModel.toLowerCase()
    for (const key of Object.keys(modelMapping)) {
      if (key.toLowerCase() === requestedModelLower) {
        return true
      }
    }

    return false
  }

  // 🔄 获取映射后的模型名称
  getMappedModel(modelMapping, requestedModel) {
    // 如果映射表为空，返回原模型
    if (!modelMapping || Object.keys(modelMapping).length === 0) {
      return requestedModel
    }

    // 精确匹配
    if (modelMapping[requestedModel]) {
      return modelMapping[requestedModel]
    }

    // 大小写不敏感匹配
    const requestedModelLower = requestedModel.toLowerCase()
    for (const [key, value] of Object.entries(modelMapping)) {
      if (key.toLowerCase() === requestedModelLower) {
        return value
      }
    }

    // 如果不存在则返回原模型
    return requestedModel
  }

  // 💰 检查账户使用额度（基于实时统计数据）
  async checkQuotaUsage(accountId) {
    try {
      // 获取实时的使用统计（包含费用）
      const usageStats = await redis.getAccountUsageStats(accountId)
      const currentDailyCost = usageStats.daily.cost || 0

      // 获取账户配置
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        logger.warn(`Account not found: ${accountId}`)
        return
      }

      // 解析额度配置，确保数值有效
      const dailyQuota = parseFloat(accountData.dailyQuota || '0')
      if (isNaN(dailyQuota) || dailyQuota <= 0) {
        // 没有设置有效额度，无需检查
        return
      }

      // 检查是否已经因额度停用（避免重复操作）
      if (accountData.quotaStoppedAt) {
        return
      }

      // 检查是否超过额度限制
      if (currentDailyCost >= dailyQuota) {
        // 使用原子操作避免竞态条件 - 再次检查是否已设置quotaStoppedAt
        const client = redis.getClientSafe()
        const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

        // double-check locking pattern - 检查quotaStoppedAt而不是status
        const existingQuotaStop = await client.hget(accountKey, 'quotaStoppedAt')
        if (existingQuotaStop) {
          return // 已经被其他进程处理
        }

        // 超过额度，停止调度但保持账户状态正常
        // 不修改 isActive 和 status，只用独立字段标记配额超限
        const updates = {
          quotaStoppedAt: new Date().toISOString(),
          errorMessage: `Daily quota exceeded: $${currentDailyCost.toFixed(2)} / $${dailyQuota.toFixed(2)}`,
          schedulable: false, // 停止调度
          // 使用独立的额度超限自动停止标记
          quotaAutoStopped: 'true'
        }

        await this.updateAccount(accountId, updates)

        logger.warn(
          `💰 Account ${accountId} exceeded daily quota: $${currentDailyCost.toFixed(2)} / $${dailyQuota.toFixed(2)}`
        )

        // 发送webhook通知
        try {
          const webhookNotifier = require('../../utils/webhookNotifier')
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId,
            accountName: accountData.name || 'Unknown Account',
            platform: 'claude-console',
            status: 'quota_exceeded',
            errorCode: 'CLAUDE_CONSOLE_QUOTA_EXCEEDED',
            reason: `Daily quota exceeded: $${currentDailyCost.toFixed(2)} / $${dailyQuota.toFixed(2)}`
          })
        } catch (webhookError) {
          logger.error('Failed to send webhook notification for quota exceeded:', webhookError)
        }
      }

      logger.debug(
        `💰 Quota check for account ${accountId}: $${currentDailyCost.toFixed(4)} / $${dailyQuota.toFixed(2)}`
      )
    } catch (error) {
      logger.error('Failed to check quota usage:', error)
    }
  }

  // 🔄 重置账户每日使用量（恢复因额度停用的账户）
  async resetDailyUsage(accountId) {
    try {
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        return
      }

      const today = redis.getDateStringInTimezone()
      const updates = {
        lastResetDate: today
      }

      // 如果账户因配额超限被停用，恢复账户
      // 新逻辑：不再依赖 isActive === false 和 status 判断
      // 只要有 quotaStoppedAt 就说明是因配额超限被停止的
      if (accountData.quotaStoppedAt) {
        updates.errorMessage = ''
        updates.quotaStoppedAt = ''

        // 只恢复因额度超限而自动停止的账户
        if (accountData.quotaAutoStopped === 'true') {
          updates.schedulable = true
          updates.quotaAutoStopped = ''
        }

        logger.info(`✅ Restored account ${accountId} after daily quota reset`)
      }

      await this.updateAccount(accountId, updates)

      logger.debug(`🔄 Reset daily usage for account ${accountId}`)
    } catch (error) {
      logger.error('Failed to reset daily usage:', error)
    }
  }

  // 🔄 重置所有账户的每日使用量
  async resetAllDailyUsage() {
    try {
      const accounts = await this.getAllAccounts()
      // 与统计一致使用配置时区日期
      const today = redis.getDateStringInTimezone()
      let resetCount = 0

      for (const account of accounts) {
        // 只重置需要重置的账户
        if (account.lastResetDate !== today) {
          await this.resetDailyUsage(account.id)
          resetCount += 1
        }
      }

      logger.success(`Reset daily usage for ${resetCount} Claude Console accounts`)
    } catch (error) {
      logger.error('Failed to reset all daily usage:', error)
    }
  }

  // 📊 获取账户使用统计（基于实时数据）
  async getAccountUsageStats(accountId) {
    try {
      // 获取实时的使用统计（包含费用）
      const usageStats = await redis.getAccountUsageStats(accountId)
      const currentDailyCost = usageStats.daily.cost || 0

      // 获取账户配置
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        return null
      }

      const dailyQuota = parseFloat(accountData.dailyQuota || '0')

      return {
        dailyQuota,
        dailyUsage: currentDailyCost, // 使用实时计算的费用
        remainingQuota: dailyQuota > 0 ? Math.max(0, dailyQuota - currentDailyCost) : null,
        usagePercentage: dailyQuota > 0 ? (currentDailyCost / dailyQuota) * 100 : 0,
        lastResetDate: accountData.lastResetDate,
        quotaStoppedAt: accountData.quotaStoppedAt,
        isQuotaExceeded: dailyQuota > 0 && currentDailyCost >= dailyQuota,
        // 额外返回完整的使用统计
        fullUsageStats: usageStats
      }
    } catch (error) {
      logger.error('Failed to get account usage stats:', error)
      return null
    }
  }

  // 🔄 重置账户所有异常状态
  async resetAccountStatus(accountId) {
    try {
      const accountData = await this.getAccount(accountId)
      if (!accountData) {
        throw new Error('Account not found')
      }

      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      // 准备要更新的字段
      const updates = {
        status: 'active',
        errorMessage: '',
        schedulable: 'true',
        isActive: 'true' // 重要：必须恢复isActive状态
      }

      // 删除所有异常状态相关的字段
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

      // 执行更新
      await client.hset(accountKey, updates)
      await client.hdel(accountKey, ...fieldsToDelete)

      logger.success(`Reset all error status for Claude Console account ${accountId}`)

      // 清除临时不可用状态
      await upstreamErrorHelper.clearTempUnavailable(accountId, 'claude-console').catch(() => {})

      // 发送 Webhook 通知
      try {
        const webhookNotifier = require('../../utils/webhookNotifier')
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId,
          accountName: accountData.name || accountId,
          platform: 'claude-console',
          status: 'recovered',
          errorCode: 'STATUS_RESET',
          reason: 'Account status manually reset',
          timestamp: new Date().toISOString()
        })
      } catch (webhookError) {
        logger.warn('Failed to send webhook notification:', webhookError)
      }

      return { success: true, accountId }
    } catch (error) {
      logger.error(`❌ Failed to reset Claude Console account status: ${accountId}`, error)
      throw error
    }
  }

  /**
   * ⏰ 检查账户订阅是否过期
   * @param {Object} account - 账户对象
   * @returns {boolean} - true: 已过期, false: 未过期
   */
  isSubscriptionExpired(account) {
    if (!account.subscriptionExpiresAt) {
      return false // 未设置视为永不过期
    }
    const expiryDate = new Date(account.subscriptionExpiresAt)
    return expiryDate <= new Date()
  }

  // 🚫 标记账户的 count_tokens 端点不可用
  async markCountTokensUnavailable(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      // 检查账户是否存在
      const exists = await client.exists(accountKey)
      if (!exists) {
        logger.warn(
          `⚠️ Cannot mark count_tokens unavailable for non-existent account: ${accountId}`
        )
        return { success: false, reason: 'Account not found' }
      }

      await client.hset(accountKey, {
        countTokensUnavailable: 'true',
        countTokensUnavailableAt: new Date().toISOString()
      })

      logger.info(
        `🚫 Marked count_tokens endpoint as unavailable for Claude Console account: ${accountId}`
      )
      return { success: true }
    } catch (error) {
      logger.error(`❌ Failed to mark count_tokens unavailable for account ${accountId}:`, error)
      throw error
    }
  }

  // ✅ 移除账户的 count_tokens 不可用标记
  async removeCountTokensUnavailable(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      await client.hdel(accountKey, 'countTokensUnavailable', 'countTokensUnavailableAt')

      logger.info(
        `✅ Removed count_tokens unavailable mark for Claude Console account: ${accountId}`
      )
      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to remove count_tokens unavailable mark for account ${accountId}:`,
        error
      )
      throw error
    }
  }

  // 🔍 检查账户的 count_tokens 端点是否不可用
  async isCountTokensUnavailable(accountId) {
    try {
      const client = redis.getClientSafe()
      const accountKey = `${this.ACCOUNT_KEY_PREFIX}${accountId}`

      const value = await client.hget(accountKey, 'countTokensUnavailable')
      return value === 'true'
    } catch (error) {
      logger.error(`❌ Failed to check count_tokens availability for account ${accountId}:`, error)
      return false // 出错时默认返回可用，避免误阻断
    }
  }
}

module.exports = new ClaudeConsoleAccountService()
