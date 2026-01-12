const qwenAccountService = require('./qwenAccountService')
const accountGroupService = require('./accountGroupService')
const redis = require('../models/redis')
const logger = require('../utils/logger')

/**
 * Qwen 账户调度器
 * 负责选择可用的 Qwen 账户并维护会话粘性
 */
class QwenScheduler {
  constructor() {
    this.STICKY_PREFIX = 'qwen'
  }

  /**
   * 检查布尔值（兼容字符串和布尔类型）
   */
  _isTruthy(value) {
    if (value === undefined || value === null) {
      return false
    }
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }
    return Boolean(value)
  }

  /**
   * 检查账户是否可用
   */
  _isAccountActive(account) {
    if (!account) {
      return false
    }
    const isActive = this._isTruthy(account.isActive)
    if (!isActive) {
      return false
    }

    const status = (account.status || 'active').toLowerCase()
    const unhealthyStatuses = new Set(['error', 'unauthorized', 'blocked', 'ratelimited'])
    return !unhealthyStatuses.has(status)
  }

  /**
   * 检查账户是否可调度
   */
  _isAccountSchedulable(account) {
    return this._isTruthy(account?.schedulable ?? true)
  }

  /**
   * 按优先级和最后使用时间排序候选账户
   */
  _sortCandidates(candidates) {
    return [...candidates].sort((a, b) => {
      const priorityA = parseInt(a.priority, 10) || 50
      const priorityB = parseInt(b.priority, 10) || 50

      // 优先级低的数字优先
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // 优先级相同，选择最久未使用的
      const lastUsedA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const lastUsedB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0

      if (lastUsedA !== lastUsedB) {
        return lastUsedA - lastUsedB
      }

      // 如果都没用过，按创建时间
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return createdA - createdB
    })
  }

  /**
   * 生成会话粘性 Key
   */
  _composeStickySessionKey(sessionHash, apiKeyId) {
    if (!sessionHash) {
      return null
    }
    const apiKeyPart = apiKeyId || 'default'
    return `${this.STICKY_PREFIX}:${apiKeyPart}:${sessionHash}`
  }

  /**
   * 加载分组内的所有可用账户
   */
  async _loadGroupAccounts(groupId) {
    const memberIds = await accountGroupService.getGroupMembers(groupId)
    if (!memberIds || memberIds.length === 0) {
      return []
    }

    const accounts = await Promise.all(
      memberIds.map(async (memberId) => {
        try {
          return await qwenAccountService.getAccount(memberId)
        } catch (error) {
          logger.warn(`⚠️ 获取 Qwen 分组成员账号失败: ${memberId}`, error)
          return null
        }
      })
    )

    return accounts.filter(
      (account) => account && this._isAccountActive(account) && this._isAccountSchedulable(account)
    )
  }

  /**
   * 更新账户最后使用时间
   */
  async _ensureLastUsedUpdated(accountId) {
    try {
      await qwenAccountService.updateAccount(accountId, {
        lastUsedAt: new Date().toISOString()
      })
    } catch (error) {
      logger.warn(`⚠️ 更新 Qwen 账号最后使用时间失败: ${accountId}`, error)
    }
  }

  /**
   * 清理会话粘性映射
   */
  async _cleanupStickyMapping(stickyKey) {
    if (!stickyKey) {
      return
    }
    try {
      await redis.deleteSessionAccountMapping(stickyKey)
    } catch (error) {
      logger.warn(`⚠️ 清理 Qwen 粘性会话映射失败: ${stickyKey}`, error)
    }
  }

  /**
   * 选择可用的 Qwen 账户
   * @param {Object} apiKeyData - API Key 数据
   * @param {String} sessionHash - 会话哈希（用于会话粘性）
   * @returns {Object} 选中的账户
   */
  async selectAccount(apiKeyData, sessionHash) {
    const stickyKey = this._composeStickySessionKey(sessionHash, apiKeyData?.id)

    // 1. 尝试从会话粘性中恢复账户
    if (stickyKey) {
      const cachedAccountId = await redis.getSessionAccountMapping(stickyKey)
      if (cachedAccountId) {
        try {
          const cachedAccount = await qwenAccountService.getAccount(cachedAccountId)
          if (
            cachedAccount &&
            this._isAccountActive(cachedAccount) &&
            this._isAccountSchedulable(cachedAccount)
          ) {
            await redis.extendSessionAccountMappingTTL(stickyKey)
            await this._ensureLastUsedUpdated(cachedAccount.id)
            logger.info(`🔗 使用粘性会话 Qwen 账号: ${cachedAccount.name} (${cachedAccount.id})`)
            return cachedAccount
          }
          // 账户不可用，清理映射
          await this._cleanupStickyMapping(stickyKey)
        } catch (error) {
          logger.warn(`⚠️ 恢复粘性 Qwen 账号失败: ${cachedAccountId}`, error)
          await this._cleanupStickyMapping(stickyKey)
        }
      }
    }

    // 2. 获取 API Key 绑定的账户
    const boundAccountIds = apiKeyData?.qwenAccountId ? [apiKeyData.qwenAccountId] : []

    // 3. 获取 API Key 所属分组的账户
    const groupAccountIds = []
    if (apiKeyData?.groupId) {
      const groupAccounts = await this._loadGroupAccounts(apiKeyData.groupId)
      groupAccountIds.push(...groupAccounts.map((acc) => acc.id))
    }

    // 4. 加载所有共享账户
    const allAccounts = await qwenAccountService.getAllAccounts()
    const sharedAccounts = allAccounts.filter(
      (acc) =>
        acc.accountType === 'shared' &&
        this._isAccountActive(acc) &&
        this._isAccountSchedulable(acc)
    )

    // 5. 构建候选账户列表（优先级：绑定 > 分组 > 共享）
    const candidates = []

    // 优先使用绑定账户
    for (const accountId of boundAccountIds) {
      const account = await qwenAccountService.getAccount(accountId)
      if (account && this._isAccountActive(account) && this._isAccountSchedulable(account)) {
        candidates.push(account)
      }
    }

    // 其次使用分组账户
    if (candidates.length === 0 && groupAccountIds.length > 0) {
      for (const accountId of groupAccountIds) {
        const account = await qwenAccountService.getAccount(accountId)
        if (account && this._isAccountActive(account) && this._isAccountSchedulable(account)) {
          candidates.push(account)
        }
      }
    }

    // 最后使用共享账户
    if (candidates.length === 0) {
      candidates.push(...sharedAccounts)
    }

    if (candidates.length === 0) {
      throw new Error('No available Qwen accounts found')
    }

    // 6. 按优先级排序并选择账户
    const sortedCandidates = this._sortCandidates(candidates)
    const selectedAccount = sortedCandidates[0]

    // 7. 建立会话粘性映射
    if (stickyKey) {
      await redis.setSessionAccountMapping(stickyKey, selectedAccount.id)
    }

    // 8. 更新最后使用时间
    await this._ensureLastUsedUpdated(selectedAccount.id)

    logger.info(
      `✅ 选择 Qwen 账号: ${selectedAccount.name} (${selectedAccount.id}), 候选: ${candidates.length}`
    )

    return selectedAccount
  }

  /**
   * 标记账户为限流状态
   */
  async markAccountRateLimited(accountId) {
    try {
      await qwenAccountService.updateAccount(accountId, {
        status: 'rateLimited',
        schedulable: 'false',
        errorMessage: 'Rate limited by Qwen API'
      })
      logger.warn(`🚫 Qwen 账号被限流: ${accountId}`)
    } catch (error) {
      logger.error(`❌ 标记 Qwen 账号限流状态失败: ${accountId}`, error)
    }
  }

  /**
   * 标记账户为未授权状态
   */
  async markAccountUnauthorized(accountId) {
    try {
      await qwenAccountService.updateAccount(accountId, {
        status: 'unauthorized',
        schedulable: 'false',
        errorMessage: 'Unauthorized - token may be expired or invalid'
      })
      logger.warn(`🔒 Qwen 账号未授权: ${accountId}`)
    } catch (error) {
      logger.error(`❌ 标记 Qwen 账号未授权状态失败: ${accountId}`, error)
    }
  }

  /**
   * 标记账户为错误状态
   */
  async markAccountError(accountId, errorMessage) {
    try {
      await qwenAccountService.updateAccount(accountId, {
        status: 'error',
        errorMessage: errorMessage || 'Unknown error'
      })
      logger.error(`❌ Qwen 账号错误: ${accountId} - ${errorMessage}`)
    } catch (error) {
      logger.error(`❌ 标记 Qwen 账号错误状态失败: ${accountId}`, error)
    }
  }
}

module.exports = new QwenScheduler()
