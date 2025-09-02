const openaiAccountService = require('./openaiAccountService')
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

        // 普通专属账户
        const boundAccount = await openaiAccountService.getAccount(apiKeyData.openaiAccountId)
        if (
          boundAccount &&
          (boundAccount.isActive === true || boundAccount.isActive === 'true') &&
          boundAccount.status !== 'error'
        ) {
          // 检查是否被限流
          const isRateLimited = await this.isAccountRateLimited(boundAccount.id)
          if (isRateLimited) {
            const errorMsg = `Dedicated account ${boundAccount.name} is currently rate limited`
            logger.warn(`⚠️ ${errorMsg}`)
            throw new Error(errorMsg)
          }

          // 专属账户：可选的模型检查（只有明确配置了supportedModels且不为空才检查）
          if (
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
            `🎯 Using bound dedicated OpenAI account: ${boundAccount.name} (${apiKeyData.openaiAccountId}) for API key ${apiKeyData.name}`
          )
          // 更新账户的最后使用时间
          await openaiAccountService.recordUsage(apiKeyData.openaiAccountId, 0)
          return {
            accountId: apiKeyData.openaiAccountId,
            accountType: 'openai'
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
    for (const account of openaiAccounts) {
      if (
        account.isActive &&
        account.status !== 'error' &&
        (account.accountType === 'shared' || !account.accountType) && // 兼容旧数据
        this._isSchedulable(account.schedulable)
      ) {
        // 检查是否可调度

        // 检查token是否过期
        const isExpired = openaiAccountService.isTokenExpired(account)
        if (isExpired && !account.refreshToken) {
          logger.warn(
            `⚠️ OpenAI account ${account.name} token expired and no refresh token available`
          )
          continue
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

    // 设置1小时过期
    await client.setex(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`, 3600, mappingData)
  }

  // 🗑️ 删除会话映射
  async _deleteSessionMapping(sessionHash) {
    const client = redis.getClientSafe()
    await client.del(`${this.SESSION_MAPPING_PREFIX}${sessionHash}`)
  }

  // 🚫 标记账户为限流状态
  async markAccountRateLimited(accountId, accountType, sessionHash = null) {
    try {
      if (accountType === 'openai') {
        await openaiAccountService.setAccountRateLimited(accountId, true)
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

      if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
        const limitedAt = new Date(account.rateLimitedAt).getTime()
        const now = Date.now()
        const limitDuration = 60 * 60 * 1000 // 1小时

        return now < limitedAt + limitDuration
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
