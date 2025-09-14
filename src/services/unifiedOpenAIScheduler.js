const openaiAccountService = require('./openaiAccountService')
const openaiResponsesAccountService = require('./openaiResponsesAccountService')
const accountGroupService = require('./accountGroupService')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class UnifiedOpenAIScheduler {
  constructor() {
    this.SESSION_MAPPING_PREFIX = 'unified_openai_session_mapping:'
  }

  // 🔧 辅助方法：检查账户是否可调度（兼容字符串和布尔值）
  _isSchedulable(schedulable) {
    // 如果是 undefined 或 null，默认为可调度
    if (schedulable === undefined || schedulable === null) {
      return true
    }
    // 明确设置为 false（布尔值）或 'false'（字符串）时不可调度
    return schedulable !== false && schedulable !== 'false'
  }

  // 🔧 辅助方法：检查账户是否被限流（兼容字符串和对象格式）
  _isRateLimited(rateLimitStatus) {
    if (!rateLimitStatus) {
      return false
    }

    // 兼容字符串格式（Redis 原始数据）
    if (typeof rateLimitStatus === 'string') {
      return rateLimitStatus === 'limited'
    }

    // 兼容对象格式（getAllAccounts 返回的数据）
    if (typeof rateLimitStatus === 'object') {
      // 检查对象中的 status 字段
      return rateLimitStatus.status === 'limited' || rateLimitStatus.isRateLimited === true
    }

    return false
  }

  // 🎯 统一调度OpenAI账号
  async selectAccountForApiKey(apiKeyData, sessionHash = null, requestedModel = null) {
    try {
      // 如果API Key绑定了专属账户或分组，优先使用
      if (apiKeyData.openaiAccountId) {
        // 检查是否是分组
        if (apiKeyData.openaiAccountId.startsWith('group:')) {
          const groupId = apiKeyData.openaiAccountId.replace('group:', '')
          logger.info(
            `🎯 API key ${apiKeyData.name} is bound to group ${groupId}, selecting from group`
          )
          return await this.selectAccountFromGroup(groupId, sessionHash, requestedModel, apiKeyData)
        }

        // 普通专属账户 - 根据前缀判断是 OpenAI 还是 OpenAI-Responses 类型
        let boundAccount = null
        let accountType = 'openai'

        // 检查是否有 responses: 前缀（用于区分 OpenAI-Responses 账户）
        if (apiKeyData.openaiAccountId.startsWith('responses:')) {
          const accountId = apiKeyData.openaiAccountId.replace('responses:', '')
          boundAccount = await openaiResponsesAccountService.getAccount(accountId)
          accountType = 'openai-responses'
        } else {
          // 普通 OpenAI 账户
          boundAccount = await openaiAccountService.getAccount(apiKeyData.openaiAccountId)
          accountType = 'openai'
        }

        if (
          boundAccount &&
          (boundAccount.isActive === true || boundAccount.isActive === 'true') &&
          boundAccount.status !== 'error'
        ) {
          // 检查是否被限流
          if (accountType === 'openai') {
            const isRateLimited = await this.isAccountRateLimited(boundAccount.id)
            if (isRateLimited) {
              const errorMsg = `Dedicated account ${boundAccount.name} is currently rate limited`
              logger.warn(`⚠️ ${errorMsg}`)
              throw new Error(errorMsg)
            }
          } else if (
            accountType === 'openai-responses' &&
            this._isRateLimited(boundAccount.rateLimitStatus)
          ) {
            // OpenAI-Responses 账户的限流检查
            const isRateLimitCleared = await openaiResponsesAccountService.checkAndClearRateLimit(
              boundAccount.id
            )
            if (!isRateLimitCleared) {
              const errorMsg = `Dedicated account ${boundAccount.name} is currently rate limited`
              logger.warn(`⚠️ ${errorMsg}`)
              throw new Error(errorMsg)
            }
          }

          // 专属账户：可选的模型检查（只有明确配置了supportedModels且不为空才检查）
          // OpenAI-Responses 账户默认支持所有模型
          if (
            accountType === 'openai' &&
            requestedModel &&
            boundAccount.supportedModels &&
            boundAccount.supportedModels.length > 0
          ) {
            const modelSupported = boundAccount.supportedModels.includes(requestedModel)
            if (!modelSupported) {
              const errorMsg = `Dedicated account ${boundAccount.name} does not support model ${requestedModel}`
              logger.warn(`⚠️ ${errorMsg}`)
              throw new Error(errorMsg)
            }
          }

          logger.info(
            `🎯 Using bound dedicated ${accountType} account: ${boundAccount.name} (${boundAccount.id}) for API key ${apiKeyData.name}`
          )
          // 更新账户的最后使用时间
          if (accountType === 'openai') {
            await openaiAccountService.recordUsage(boundAccount.id, 0)
          } else {
            await openaiResponsesAccountService.updateAccount(boundAccount.id, {
              lastUsedAt: new Date().toISOString()
            })
          }
          return {
            accountId: boundAccount.id,
            accountType
          }
        } else {
          // 专属账户不可用时直接报错，不降级到共享池
          const errorMsg = boundAccount
            ? `Dedicated account ${boundAccount.name} is not available (inactive or error status)`
            : `Dedicated account ${apiKeyData.openaiAccountId} not found`
          logger.warn(`⚠️ ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash)
        if (mappedAccount) {
          // 验证映射的账户是否仍然可用
          const isAvailable = await this._isAccountAvailable(
            mappedAccount.accountId,
            mappedAccount.accountType
          )
          if (isAvailable) {
            // 🚀 智能会话续期（续期 unified 映射键，按配置）
            await this._extendSessionMappingTTL(sessionHash)
            logger.info(
              `🎯 Using sticky session account: ${mappedAccount.accountId} (${mappedAccount.accountType}) for session ${sessionHash}`
            )
            // 更新账户的最后使用时间
            await openaiAccountService.recordUsage(mappedAccount.accountId, 0)
            return mappedAccount
          } else {
            logger.warn(
              `⚠️ Mapped account ${mappedAccount.accountId} is no longer available, selecting new account`
            )
            await this._deleteSessionMapping(sessionHash)
          }
        }
      }

      // 获取所有可用账户
      const availableAccounts = await this._getAllAvailableAccounts(apiKeyData, requestedModel)

      if (availableAccounts.length === 0) {
        // 提供更详细的错误信息
        if (requestedModel) {
          throw new Error(
            `No available OpenAI accounts support the requested model: ${requestedModel}`
          )
        } else {
          throw new Error('No available OpenAI accounts')
        }
      }

      // 按最后使用时间排序（最久未使用的优先，与 Claude 保持一致）
      const sortedAccounts = availableAccounts.sort((a, b) => {
        const aLastUsed = new Date(a.lastUsedAt || 0).getTime()
        const bLastUsed = new Date(b.lastUsedAt || 0).getTime()
        return aLastUsed - bLastUsed // 最久未使用的优先
      })

      // 选择第一个账户
      const selectedAccount = sortedAccounts[0]

      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await this._setSessionMapping(
          sessionHash,
          selectedAccount.accountId,
          selectedAccount.accountType
        )
        logger.info(
          `🎯 Created new sticky session mapping: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for session ${sessionHash}`
        )
      }

      logger.info(
        `🎯 Selected account: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for API key ${apiKeyData.name}`
      )

      // 更新账户的最后使用时间
      await openaiAccountService.recordUsage(selectedAccount.accountId, 0)

      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      }
    } catch (error) {
      logger.error('❌ Failed to select account for API key:', error)
      throw error
    }
  }

  // 📋 获取所有可用账户（仅共享池）
  async _getAllAvailableAccounts(apiKeyData, requestedModel = null) {
    const availableAccounts = []

    // 注意：专属账户的处理已经在 selectAccountForApiKey 中完成
    // 这里只处理共享池账户

    // 获取所有OpenAI账户（共享池）
    const openaiAccounts = await openaiAccountService.getAllAccounts()
    for (let account of openaiAccounts) {
      if (
        account.isActive &&
        account.status !== 'error' &&
        (account.accountType === 'shared' || !account.accountType) && // 兼容旧数据
        this._isSchedulable(account.schedulable)
      ) {
        // 检查是否可调度

        // 检查token是否过期并自动刷新
        const isExpired = openaiAccountService.isTokenExpired(account)
        if (isExpired) {
          if (!account.refreshToken) {
            logger.warn(
              `⚠️ OpenAI account ${account.name} token expired and no refresh token available`
            )
            continue
          }

          // 自动刷新过期的 token
          try {
            logger.info(`🔄 Auto-refreshing expired token for OpenAI account ${account.name}`)
            await openaiAccountService.refreshAccountToken(account.id)
            // 重新获取更新后的账户信息
            account = await openaiAccountService.getAccount(account.id)
            logger.info(`✅ Token refreshed successfully for ${account.name}`)
          } catch (refreshError) {
            logger.error(`❌ Failed to refresh token for ${account.name}:`, refreshError.message)
            continue // 刷新失败，跳过此账户
          }
        }

        // 检查模型支持（仅在明确设置了supportedModels且不为空时才检查）
        // 如果没有设置supportedModels或为空数组，则支持所有模型
        if (requestedModel && account.supportedModels && account.supportedModels.length > 0) {
          const modelSupported = account.supportedModels.includes(requestedModel)
          if (!modelSupported) {
            logger.debug(
              `⏭️ Skipping OpenAI account ${account.name} - doesn't support model ${requestedModel}`
            )
            continue
          }
        }

        // 检查是否被限流
        const isRateLimited = await this.isAccountRateLimited(account.id)
        if (isRateLimited) {
          logger.debug(`⏭️ Skipping OpenAI account ${account.name} - rate limited`)
          continue
        }

        availableAccounts.push({
          ...account,
          accountId: account.id,
          accountType: 'openai',
          priority: parseInt(account.priority) || 50,
          lastUsedAt: account.lastUsedAt || '0'
        })
      }
    }

    // 获取所有 OpenAI-Responses 账户（共享池）
    const openaiResponsesAccounts = await openaiResponsesAccountService.getAllAccounts()
    for (const account of openaiResponsesAccounts) {
      if (
        (account.isActive === true || account.isActive === 'true') &&
        account.status !== 'error' &&
        account.status !== 'rateLimited' &&
        (account.accountType === 'shared' || !account.accountType) && // 兼容旧数据
        this._isSchedulable(account.schedulable)
      ) {
        // 检查并清除过期的限流状态
        const isRateLimitCleared = await openaiResponsesAccountService.checkAndClearRateLimit(
          account.id
        )

        // 如果仍然处于限流状态，跳过
        if (this._isRateLimited(account.rateLimitStatus) && !isRateLimitCleared) {
          logger.debug(`⏭️ Skipping OpenAI-Responses account ${account.name} - rate limited`)
          continue
        }

        // OpenAI-Responses 账户默认支持所有模型
        // 因为它们是第三方兼容 API，模型支持由第三方决定

        availableAccounts.push({
          ...account,
          accountId: account.id,
          accountType: 'openai-responses',
          priority: parseInt(account.priority) || 50,
          lastUsedAt: account.lastUsedAt || '0'
        })
      }
    }

    return availableAccounts
  }

  // 🔢 按优先级和最后使用时间排序账户（已废弃，改为与 Claude 保持一致，只按最后使用时间排序）
  // _sortAccountsByPriority(accounts) {
  //   return accounts.sort((a, b) => {
  //     // 首先按优先级排序（数字越小优先级越高）
  //     if (a.priority !== b.priority) {
  //       return a.priority - b.priority
  //     }

  //     // 优先级相同时，按最后使用时间排序（最久未使用的优先）
  //     const aLastUsed = new Date(a.lastUsedAt || 0).getTime()
  //     const bLastUsed = new Date(b.lastUsedAt || 0).getTime()
  //     return aLastUsed - bLastUsed
  //   })
  // }

  // 🔍 检查账户是否可用
  async _isAccountAvailable(accountId, accountType) {
    try {
      if (accountType === 'openai') {
        const account = await openaiAccountService.getAccount(accountId)
        if (!account || !account.isActive || account.status === 'error') {
          return false
        }
        // 检查是否可调度
        if (!this._isSchedulable(account.schedulable)) {
          logger.info(`🚫 OpenAI account ${accountId} is not schedulable`)
          return false
        }
        return !(await this.isAccountRateLimited(accountId))
      } else if (accountType === 'openai-responses') {
        const account = await openaiResponsesAccountService.getAccount(accountId)
        if (
          !account ||
          (account.isActive !== true && account.isActive !== 'true') ||
          account.status === 'error'
        ) {
          return false
        }
        // 检查是否可调度
        if (!this._isSchedulable(account.schedulable)) {
          logger.info(`🚫 OpenAI-Responses account ${accountId} is not schedulable`)
          return false
        }
        // 检查并清除过期的限流状态
        const isRateLimitCleared =
          await openaiResponsesAccountService.checkAndClearRateLimit(accountId)
        return !this._isRateLimited(account.rateLimitStatus) || isRateLimitCleared
      }
      return false
    } catch (error) {
      logger.warn(`⚠️ Failed to check account availability: ${accountId}`, error)
      return false
    }
  }

  // 🔗 获取会话映射
  async _getSessionMapping(sessionHash) {
    const client = redis.getClientSafe()
    const mappingData = await client.get(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`)

    if (mappingData) {
      try {
        return JSON.parse(mappingData)
      } catch (error) {
        logger.warn('⚠️ Failed to parse session mapping:', error)
        return null
      }
    }

    return null
  }

  // 💾 设置会话映射
  async _setSessionMapping(sessionHash, accountId, accountType) {
    const client = redis.getClientSafe()
    const mappingData = JSON.stringify({ accountId, accountType })
    // 依据配置设置TTL（小时）
    const appConfig = require('../../config/config')
    const ttlHours = appConfig.session?.stickyTtlHours || 1
    const ttlSeconds = Math.max(1, Math.floor(ttlHours * 60 * 60))
    await client.setex(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`, ttlSeconds, mappingData)
  }

  // 🗑️ 删除会话映射
  async _deleteSessionMapping(sessionHash) {
    const client = redis.getClientSafe()
    await client.del(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`)
  }

  // 🔁 续期统一调度会话映射TTL（针对 unified_openai_session_mapping:* 键），遵循会话配置
  async _extendSessionMappingTTL(sessionHash) {
    try {
      const client = redis.getClientSafe()
      const key = `${this.SESSION_MAPPING_PREFIX}${sessionHash}`
      const remainingTTL = await client.ttl(key)

      if (remainingTTL === -2) {
        return false
      }
      if (remainingTTL === -1) {
        return true
      }

      const appConfig = require('../../config/config')
      const ttlHours = appConfig.session?.stickyTtlHours || 1
      const renewalThresholdMinutes = appConfig.session?.renewalThresholdMinutes || 0
      if (!renewalThresholdMinutes) {
        return true
      }

      const fullTTL = Math.max(1, Math.floor(ttlHours * 60 * 60))
      const threshold = Math.max(0, Math.floor(renewalThresholdMinutes * 60))

      if (remainingTTL < threshold) {
        await client.expire(key, fullTTL)
        logger.debug(
          `🔄 Renewed unified OpenAI session TTL: ${sessionHash} (was ${Math.round(remainingTTL / 60)}m, renewed to ${ttlHours}h)`
        )
      } else {
        logger.debug(
          `✅ Unified OpenAI session TTL sufficient: ${sessionHash} (remaining ${Math.round(remainingTTL / 60)}m)`
        )
      }
      return true
    } catch (error) {
      logger.error('❌ Failed to extend unified OpenAI session TTL:', error)
      return false
    }
  }

  // 🚫 标记账户为限流状态
  async markAccountRateLimited(accountId, accountType, sessionHash = null, resetsInSeconds = null) {
    try {
      if (accountType === 'openai') {
        await openaiAccountService.setAccountRateLimited(accountId, true, resetsInSeconds)
      } else if (accountType === 'openai-responses') {
        // 对于 OpenAI-Responses 账户，使用与普通 OpenAI 账户类似的处理方式
        const duration = resetsInSeconds ? Math.ceil(resetsInSeconds / 60) : null
        await openaiResponsesAccountService.markAccountRateLimited(accountId, duration)

        // 同时更新调度状态，避免继续被调度
        await openaiResponsesAccountService.updateAccount(accountId, {
          schedulable: 'false',
          rateLimitResetAt: resetsInSeconds
            ? new Date(Date.now() + resetsInSeconds * 1000).toISOString()
            : new Date(Date.now() + 3600000).toISOString() // 默认1小时
        })
      }

      // 删除会话映射
      if (sessionHash) {
        await this._deleteSessionMapping(sessionHash)
      }

      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to mark account as rate limited: ${accountId} (${accountType})`,
        error
      )
      throw error
    }
  }

  // ✅ 移除账户的限流状态
  async removeAccountRateLimit(accountId, accountType) {
    try {
      if (accountType === 'openai') {
        await openaiAccountService.setAccountRateLimited(accountId, false)
      } else if (accountType === 'openai-responses') {
        // 清除 OpenAI-Responses 账户的限流状态
        await openaiResponsesAccountService.updateAccount(accountId, {
          rateLimitedAt: '',
          rateLimitStatus: '',
          rateLimitResetAt: '',
          status: 'active',
          errorMessage: '',
          schedulable: 'true'
        })
        logger.info(`✅ Rate limit cleared for OpenAI-Responses account ${accountId}`)
      }

      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to remove rate limit for account: ${accountId} (${accountType})`,
        error
      )
      throw error
    }
  }

  // 🔍 检查账户是否处于限流状态
  async isAccountRateLimited(accountId) {
    try {
      const account = await openaiAccountService.getAccount(accountId)
      if (!account) {
        return false
      }

      if (this._isRateLimited(account.rateLimitStatus)) {
        // 如果有具体的重置时间，使用它
        if (account.rateLimitResetAt) {
          const resetTime = new Date(account.rateLimitResetAt).getTime()
          const now = Date.now()
          const isStillLimited = now < resetTime

          // 如果已经过了重置时间，自动清除限流状态
          if (!isStillLimited) {
            logger.info(`✅ Auto-clearing rate limit for account ${accountId} (reset time reached)`)
            await openaiAccountService.setAccountRateLimited(accountId, false)
            return false
          }

          return isStillLimited
        }

        // 如果没有具体的重置时间，使用默认的1小时
        if (account.rateLimitedAt) {
          const limitedAt = new Date(account.rateLimitedAt).getTime()
          const now = Date.now()
          const limitDuration = 60 * 60 * 1000 // 1小时
          return now < limitedAt + limitDuration
        }
      }
      return false
    } catch (error) {
      logger.error(`❌ Failed to check rate limit status: ${accountId}`, error)
      return false
    }
  }

  // 👥 从分组中选择账户
  async selectAccountFromGroup(groupId, sessionHash = null, requestedModel = null) {
    try {
      // 获取分组信息
      const group = await accountGroupService.getGroup(groupId)
      if (!group) {
        throw new Error(`Group ${groupId} not found`)
      }

      if (group.platform !== 'openai') {
        throw new Error(`Group ${group.name} is not an OpenAI group`)
      }

      logger.info(`👥 Selecting account from OpenAI group: ${group.name}`)

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash)
        if (mappedAccount) {
          // 验证映射的账户是否仍然可用并且在分组中
          const isInGroup = await this._isAccountInGroup(mappedAccount.accountId, groupId)
          if (isInGroup) {
            const isAvailable = await this._isAccountAvailable(
              mappedAccount.accountId,
              mappedAccount.accountType
            )
            if (isAvailable) {
              // 🚀 智能会话续期（续期 unified 映射键，按配置）
              await this._extendSessionMappingTTL(sessionHash)
              logger.info(
                `🎯 Using sticky session account from group: ${mappedAccount.accountId} (${mappedAccount.accountType})`
              )
              // 更新账户的最后使用时间
              await openaiAccountService.recordUsage(mappedAccount.accountId, 0)
              return mappedAccount
            }
          }
          // 如果账户不可用或不在分组中，删除映射
          await this._deleteSessionMapping(sessionHash)
        }
      }

      // 获取分组成员
      const memberIds = await accountGroupService.getGroupMembers(groupId)
      if (memberIds.length === 0) {
        throw new Error(`Group ${group.name} has no members`)
      }

      // 获取可用的分组成员账户
      const availableAccounts = []
      for (const memberId of memberIds) {
        const account = await openaiAccountService.getAccount(memberId)
        if (
          account &&
          account.isActive &&
          account.status !== 'error' &&
          this._isSchedulable(account.schedulable)
        ) {
          // 检查token是否过期
          const isExpired = openaiAccountService.isTokenExpired(account)
          if (isExpired && !account.refreshToken) {
            logger.warn(
              `⚠️ Group member OpenAI account ${account.name} token expired and no refresh token available`
            )
            continue
          }

          // 检查模型支持（仅在明确设置了supportedModels且不为空时才检查）
          // 如果没有设置supportedModels或为空数组，则支持所有模型
          if (requestedModel && account.supportedModels && account.supportedModels.length > 0) {
            const modelSupported = account.supportedModels.includes(requestedModel)
            if (!modelSupported) {
              logger.debug(
                `⏭️ Skipping group member OpenAI account ${account.name} - doesn't support model ${requestedModel}`
              )
              continue
            }
          }

          // 检查是否被限流
          const isRateLimited = await this.isAccountRateLimited(account.id)
          if (isRateLimited) {
            logger.debug(`⏭️ Skipping group member OpenAI account ${account.name} - rate limited`)
            continue
          }

          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType: 'openai',
            priority: parseInt(account.priority) || 50,
            lastUsedAt: account.lastUsedAt || '0'
          })
        }
      }

      if (availableAccounts.length === 0) {
        throw new Error(`No available accounts in group ${group.name}`)
      }

      // 按最后使用时间排序（最久未使用的优先，与 Claude 保持一致）
      const sortedAccounts = availableAccounts.sort((a, b) => {
        const aLastUsed = new Date(a.lastUsedAt || 0).getTime()
        const bLastUsed = new Date(b.lastUsedAt || 0).getTime()
        return aLastUsed - bLastUsed // 最久未使用的优先
      })

      // 选择第一个账户
      const selectedAccount = sortedAccounts[0]

      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await this._setSessionMapping(
          sessionHash,
          selectedAccount.accountId,
          selectedAccount.accountType
        )
        logger.info(
          `🎯 Created new sticky session mapping from group: ${selectedAccount.name} (${selectedAccount.accountId})`
        )
      }

      logger.info(
        `🎯 Selected account from group: ${selectedAccount.name} (${selectedAccount.accountId})`
      )

      // 更新账户的最后使用时间
      await openaiAccountService.recordUsage(selectedAccount.accountId, 0)

      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      }
    } catch (error) {
      logger.error(`❌ Failed to select account from group ${groupId}:`, error)
      throw error
    }
  }

  // 🔍 检查账户是否在分组中
  async _isAccountInGroup(accountId, groupId) {
    const members = await accountGroupService.getGroupMembers(groupId)
    return members.includes(accountId)
  }

  // 📊 更新账户最后使用时间
  async updateAccountLastUsed(accountId, accountType) {
    try {
      if (accountType === 'openai') {
        await openaiAccountService.updateAccount(accountId, {
          lastUsedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      logger.warn(`⚠️ Failed to update last used time for account ${accountId}:`, error)
    }
  }
}

module.exports = new UnifiedOpenAIScheduler()
