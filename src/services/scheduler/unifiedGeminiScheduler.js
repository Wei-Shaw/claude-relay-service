const geminiAccountService = require('../account/geminiAccountService')
const geminiApiAccountService = require('../account/geminiApiAccountService')
const accountGroupService = require('../accountGroupService')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const {
  isSchedulable,
  isActive,
  isAutoProtectionDisabled,
  sortAccountsByPriority
} = require('../../utils/commonHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const { RedisKeys, TTL } = require('../../constants/redisKeys')

const OAUTH_PROVIDER_GEMINI_CLI = 'gemini-cli'
const OAUTH_PROVIDER_ANTIGRAVITY = 'antigravity'
const KNOWN_OAUTH_PROVIDERS = [OAUTH_PROVIDER_GEMINI_CLI, OAUTH_PROVIDER_ANTIGRAVITY]

function normalizeOauthProvider(oauthProvider) {
  if (!oauthProvider) {
    return OAUTH_PROVIDER_GEMINI_CLI
  }
  return oauthProvider === OAUTH_PROVIDER_ANTIGRAVITY
    ? OAUTH_PROVIDER_ANTIGRAVITY
    : OAUTH_PROVIDER_GEMINI_CLI
}

class UnifiedGeminiScheduler {
  _getSessionMappingKey(sessionHash, oauthProvider = null) {
    if (!sessionHash) {
      return null
    }
    if (!oauthProvider) {
      return RedisKeys.session.unifiedGeminiMapping(sessionHash)
    }
    const normalized = normalizeOauthProvider(oauthProvider)
    return RedisKeys.session.unifiedGeminiMappingByProvider(normalized, sessionHash)
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

  // 🔧 辅助方法：检查账户是否激活（兼容字符串和布尔值）
  _isActive(activeValue) {
    // 兼容布尔值 true 和字符串 'true'
    return activeValue === true || activeValue === 'true'
  }

  // 🔧 模型支持检查（无 requestedModel 或未配置 supportedModels 时视为支持）
  _isGeminiModelSupported(account, requestedModel) {
    if (!requestedModel || !account.supportedModels || account.supportedModels.length === 0) {
      return true
    }
    const normalizedModel = requestedModel.replace('models/', '')
    return account.supportedModels.some((model) => model.replace('models/', '') === normalizedModel)
  }

  // [人工决策-2026-06-03 14:51:27] Gemini OAuth token 失效统一处理(单一实现：共享池与 _isAccountAvailable 都调它,
  //   dedicated/group 经 _isAccountAvailable 间接复用,避免两套实现漂移)。
  //   返回有效 token 的账户(过期可刷新者返回刷新后的最新账户);死号或刷新失败返回 null。
  async _ensureGeminiTokenValid(account, accountId) {
    if (!geminiAccountService.isTokenExpired(account)) {
      return account
    }
    if (!account.refreshToken) {
      logger.warn(`⚠️ Gemini account ${accountId} token expired and no refresh token available`)
      return null
    }
    try {
      await geminiAccountService.refreshAccountToken(accountId)
      return await geminiAccountService.getAccount(accountId)
    } catch (refreshError) {
      logger.warn(`⚠️ Gemini account ${accountId} token refresh failed: ${refreshError.message}`)
      return null
    }
  }

  // 🎯 统一调度Gemini账号
  async selectAccountForApiKey(
    apiKeyData,
    sessionHash = null,
    requestedModel = null,
    options = {}
  ) {
    const { allowApiAccounts = false, oauthProvider = null } = options
    const normalizedOauthProvider = oauthProvider ? normalizeOauthProvider(oauthProvider) : null

    try {
      // 如果API Key绑定了专属账户或分组，优先使用
      if (apiKeyData.geminiAccountId) {
        // 检查是否是 Gemini API 账户（api: 前缀）
        if (apiKeyData.geminiAccountId.startsWith('api:')) {
          const accountId = apiKeyData.geminiAccountId.replace('api:', '')
          const boundAccount = await geminiApiAccountService.getAccount(accountId)
          // [人工决策-2026-06-02 23:30:05] 专属绑定走与共享池一致的校验：
          //   _isAccountAvailable(硬门 isActive/schedulable + 开关绕过 status/temp/限流) + 模型支持
          const usable =
            !!boundAccount &&
            (await this._isAccountAvailable(accountId, 'gemini-api')) &&
            this._isGeminiModelSupported(boundAccount, requestedModel)
          if (usable) {
            logger.info(
              `🎯 Using bound Gemini-API account: ${boundAccount.name} (${accountId}) for API key ${apiKeyData.name}`
            )
            // 更新账户的最后使用时间
            await geminiApiAccountService.markAccountUsed(accountId)
            return {
              accountId,
              accountType: 'gemini-api'
            }
          } else {
            logger.warn(
              `⚠️ Bound Gemini-API account ${accountId} is not available (schedulable/status/temp/rate/model), falling back to pool`
            )
          }
        }
        // 检查是否是分组
        else if (apiKeyData.geminiAccountId.startsWith('group:')) {
          const groupId = apiKeyData.geminiAccountId.replace('group:', '')
          logger.info(
            `🎯 API key ${apiKeyData.name} is bound to group ${groupId}, selecting from group`
          )
          return await this.selectAccountFromGroup(groupId, sessionHash, requestedModel, apiKeyData)
        }
        // 普通 Gemini OAuth 专属账户
        else {
          const boundAccount = await geminiAccountService.getAccount(apiKeyData.geminiAccountId)
          const providerMismatch =
            !!boundAccount &&
            !!normalizedOauthProvider &&
            normalizeOauthProvider(boundAccount.oauthProvider) !== normalizedOauthProvider
          // [人工决策-2026-06-02 23:30:05] 专属绑定走 _isAccountAvailable(硬门 + 开关绕过上游错误) + 模型 + oauthProvider 校验
          const usable =
            !!boundAccount &&
            !providerMismatch &&
            (await this._isAccountAvailable(apiKeyData.geminiAccountId, 'gemini')) &&
            this._isGeminiModelSupported(boundAccount, requestedModel)
          if (usable) {
            logger.info(
              `🎯 Using bound dedicated Gemini account: ${boundAccount.name} (${apiKeyData.geminiAccountId}) for API key ${apiKeyData.name}`
            )
            // 更新账户的最后使用时间
            await geminiAccountService.markAccountUsed(apiKeyData.geminiAccountId)
            return {
              accountId: apiKeyData.geminiAccountId,
              accountType: 'gemini'
            }
          } else if (providerMismatch) {
            logger.warn(
              `⚠️ Bound Gemini OAuth account ${boundAccount.name} oauthProvider=${normalizeOauthProvider(boundAccount.oauthProvider)} does not match requested oauthProvider=${normalizedOauthProvider}, falling back to pool`
            )
          } else {
            logger.warn(
              `⚠️ Bound Gemini account ${apiKeyData.geminiAccountId} is not available, falling back to pool`
            )
          }
        }
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash, normalizedOauthProvider)
        if (mappedAccount) {
          // 验证映射的账户是否仍然可用
          const isAvailable = await this._isAccountAvailable(
            mappedAccount.accountId,
            mappedAccount.accountType
          )
          if (isAvailable) {
            // 🚀 智能会话续期（续期 unified 映射键，按配置）
            await this._extendSessionMappingTTL(sessionHash, normalizedOauthProvider)
            logger.info(
              `🎯 Using sticky session account: ${mappedAccount.accountId} (${mappedAccount.accountType}) for session ${sessionHash}`
            )
            // 更新账户的最后使用时间（根据账户类型调用正确的服务）
            if (mappedAccount.accountType === 'gemini-api') {
              await geminiApiAccountService.markAccountUsed(mappedAccount.accountId)
            } else {
              await geminiAccountService.markAccountUsed(mappedAccount.accountId)
            }
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
      const availableAccounts = await this._getAllAvailableAccounts(apiKeyData, requestedModel, {
        allowApiAccounts,
        oauthProvider: normalizedOauthProvider
      })

      if (availableAccounts.length === 0) {
        // 提供更详细的错误信息
        if (requestedModel) {
          throw new Error(
            `No available Gemini accounts support the requested model: ${requestedModel}`
          )
        } else {
          throw new Error('No available Gemini accounts')
        }
      }

      // 按优先级和最后使用时间排序
      const sortedAccounts = sortAccountsByPriority(availableAccounts)

      // 选择第一个账户
      const selectedAccount = sortedAccounts[0]

      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await this._setSessionMapping(
          sessionHash,
          selectedAccount.accountId,
          selectedAccount.accountType,
          normalizedOauthProvider
        )
        logger.info(
          `🎯 Created new sticky session mapping: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for session ${sessionHash}`
        )
      }

      logger.info(
        `🎯 Selected account: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) with priority ${selectedAccount.priority} for API key ${apiKeyData.name}`
      )

      // 更新账户的最后使用时间（根据账户类型调用正确的服务）
      if (selectedAccount.accountType === 'gemini-api') {
        await geminiApiAccountService.markAccountUsed(selectedAccount.accountId)
      } else {
        await geminiAccountService.markAccountUsed(selectedAccount.accountId)
      }

      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      }
    } catch (error) {
      logger.error('❌ Failed to select account for API key:', error)
      throw error
    }
  }

  // 📋 获取所有可用账户
  async _getAllAvailableAccounts(
    apiKeyData,
    requestedModel = null,
    allowApiAccountsOrOptions = false
  ) {
    const options =
      allowApiAccountsOrOptions && typeof allowApiAccountsOrOptions === 'object'
        ? allowApiAccountsOrOptions
        : { allowApiAccounts: allowApiAccountsOrOptions }
    const { allowApiAccounts = false, oauthProvider = null } = options
    const normalizedOauthProvider = oauthProvider ? normalizeOauthProvider(oauthProvider) : null

    const availableAccounts = []

    // 如果API Key绑定了专属账户，优先返回
    if (apiKeyData.geminiAccountId) {
      // 检查是否是 Gemini API 账户（api: 前缀）
      if (apiKeyData.geminiAccountId.startsWith('api:')) {
        const accountId = apiKeyData.geminiAccountId.replace('api:', '')
        const boundAccount = await geminiApiAccountService.getAccount(accountId)
        // [人工决策-2026-06-02 23:30:05] 专属绑定统一委托 _isAccountAvailable（硬门 + 开关绕过上游错误）+ 模型，避免重抄漂移
        const usable =
          !!boundAccount &&
          (await this._isAccountAvailable(accountId, 'gemini-api')) &&
          this._isGeminiModelSupported(boundAccount, requestedModel)
        if (usable) {
          logger.info(`🎯 Using bound Gemini-API account: ${boundAccount.name} (${accountId})`)
          return [
            {
              ...boundAccount,
              accountId,
              accountType: 'gemini-api',
              priority: parseInt(boundAccount.priority) || 50,
              lastUsedAt: boundAccount.lastUsedAt || '0'
            }
          ]
        }
        logger.warn(
          `⚠️ Bound Gemini-API account ${accountId} is not available in _getAllAvailableAccounts, falling back to pool`
        )
      }
      // 普通 Gemini OAuth 账户
      else if (!apiKeyData.geminiAccountId.startsWith('group:')) {
        const boundAccount = await geminiAccountService.getAccount(apiKeyData.geminiAccountId)
        const providerMismatch =
          !!boundAccount &&
          !!normalizedOauthProvider &&
          normalizeOauthProvider(boundAccount.oauthProvider) !== normalizedOauthProvider
        if (providerMismatch) {
          return availableAccounts
        }
        // [人工决策-2026-06-02 23:30:05] 专属绑定统一委托 _isAccountAvailable（硬门 + 开关绕过上游错误）+ 模型，避免重抄漂移
        const usable =
          !!boundAccount &&
          (await this._isAccountAvailable(apiKeyData.geminiAccountId, 'gemini')) &&
          this._isGeminiModelSupported(boundAccount, requestedModel)
        if (usable) {
          logger.info(
            `🎯 Using bound dedicated Gemini account: ${boundAccount.name} (${apiKeyData.geminiAccountId})`
          )
          return [
            {
              ...boundAccount,
              accountId: boundAccount.id,
              accountType: 'gemini',
              priority: parseInt(boundAccount.priority) || 50,
              lastUsedAt: boundAccount.lastUsedAt || '0'
            }
          ]
        }
        logger.warn(`⚠️ Bound Gemini account ${apiKeyData.geminiAccountId} is not available`)
      }
    }

    // 获取所有Gemini OAuth账户（共享池）
    const geminiAccounts = await geminiAccountService.getAllAccounts()
    for (let account of geminiAccounts) {
      const autoOff = isAutoProtectionDisabled(account)
      if (
        isActive(account.isActive) &&
        (account.accountType === 'shared' || !account.accountType) && // 兼容旧数据
        isSchedulable(account.schedulable)
      ) {
        if (
          normalizedOauthProvider &&
          normalizeOauthProvider(account.oauthProvider) !== normalizedOauthProvider
        ) {
          continue
        }

        // token 失效：统一走 _ensureGeminiTokenValid(单一实现)；过期可刷新者刷新后用最新账户
        const freshAccount = await this._ensureGeminiTokenValid(account, account.id)
        if (!freshAccount) {
          continue
        }
        account = freshAccount

        if (!autoOff && account.status === 'error') {
          continue
        }

        // [人工决策-2026-06-02 23:30:05] 开关 ON：跳过 temp_unavailable / 限流自动暂停；模型/token 校验保留
        if (!autoOff) {
          const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
            account.id,
            'gemini'
          )
          if (isTempUnavailable) {
            logger.debug(`⏭️ Skipping Gemini account ${account.name} - temporarily unavailable`)
            continue
          }
        }

        // 检查模型支持
        if (requestedModel && account.supportedModels && account.supportedModels.length > 0) {
          // 处理可能带有 models/ 前缀的模型名
          const normalizedModel = requestedModel.replace('models/', '')
          const modelSupported = account.supportedModels.some(
            (model) => model.replace('models/', '') === normalizedModel
          )
          if (!modelSupported) {
            logger.debug(
              `⏭️ Skipping Gemini account ${account.name} - doesn't support model ${requestedModel}`
            )
            continue
          }
        }

        // 检查是否被限流（开关 ON 时跳过限流过滤）
        const isRateLimited = autoOff ? false : await this.isAccountRateLimited(account.id)
        if (!isRateLimited) {
          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType: 'gemini',
            priority: parseInt(account.priority) || 50, // 默认优先级50
            lastUsedAt: account.lastUsedAt || '0'
          })
        }
      }
    }

    // 如果允许调度 Gemini API 账户，则添加到可用列表
    if (allowApiAccounts) {
      const geminiApiAccounts = await geminiApiAccountService.getAllAccounts()
      for (const account of geminiApiAccounts) {
        const autoOff = isAutoProtectionDisabled(account)
        if (
          isActive(account.isActive) &&
          (account.accountType === 'shared' || !account.accountType) &&
          isSchedulable(account.schedulable) &&
          (autoOff || account.status !== 'error')
        ) {
          // 检查模型支持
          if (requestedModel && account.supportedModels && account.supportedModels.length > 0) {
            const normalizedModel = requestedModel.replace('models/', '')
            const modelSupported = account.supportedModels.some(
              (model) => model.replace('models/', '') === normalizedModel
            )
            if (!modelSupported) {
              logger.debug(
                `⏭️ Skipping Gemini-API account ${account.name} - doesn't support model ${requestedModel}`
              )
              continue
            }
          }

          // [人工决策-2026-06-02 23:30:05] apikey 开关 ON：暴力打，跳过 temp_unavailable / 限流；模型校验保留
          if (!autoOff) {
            const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
              account.id,
              'gemini-api'
            )
            if (isTempUnavailable) {
              logger.debug(
                `⏭️ Skipping Gemini-API account ${account.name} - temporarily unavailable`
              )
              continue
            }
          }

          // 检查是否被限流（开关 ON 时跳过限流过滤）
          const isRateLimited = autoOff ? false : await this.isAccountRateLimited(account.id)
          if (!isRateLimited) {
            availableAccounts.push({
              ...account,
              accountId: account.id,
              accountType: 'gemini-api',
              priority: parseInt(account.priority) || 50,
              lastUsedAt: account.lastUsedAt || '0'
            })
          }
        }
      }
    }

    logger.info(
      `📊 Total available accounts: ${availableAccounts.length} (Gemini OAuth + ${allowApiAccounts ? 'Gemini API' : 'no API accounts'})`
    )
    return availableAccounts
  }

  // 🔍 检查账户是否可用
  async _isAccountAvailable(accountId, accountType) {
    try {
      if (accountType === 'gemini') {
        const account = await geminiAccountService.getAccount(accountId)
        if (!account || !isActive(account.isActive)) {
          return false
        }
        // [人工决策-2026-06-02 23:30:05] 开 disableAutoProtection = 暴力打：忽略上游错误类自动暂停
        //   (status error、temp_unavailable、限流)；手动停用(isActive/schedulable)始终生效。
        if (!isSchedulable(account.schedulable)) {
          logger.info(`🚫 Gemini account ${accountId} is not schedulable`)
          return false
        }
        // [人工决策-2026-06-03 14:51:27] token 失效：统一走 _ensureGeminiTokenValid(单一实现);死号/刷新失败=不可用
        const validatedAccount = await this._ensureGeminiTokenValid(account, accountId)
        if (!validatedAccount) {
          return false
        }
        const currentAccount = validatedAccount
        if (isAutoProtectionDisabled(currentAccount)) {
          return true
        }
        if (currentAccount.status === 'error') {
          return false
        }
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
          accountId,
          accountType
        )
        if (isTempUnavailable) {
          logger.info(`⏱️ Gemini account ${accountId} is temporarily unavailable`)
          return false
        }
        return !(await this.isAccountRateLimited(accountId))
      } else if (accountType === 'gemini-api') {
        const account = await geminiApiAccountService.getAccount(accountId)
        if (!account || !isActive(account.isActive)) {
          return false
        }
        // [人工决策-2026-06-02 23:30:05] apikey 类开 disableAutoProtection = 暴力打：忽略上游错误类自动暂停
        //   (status error、temp_unavailable、限流)；手动停用(isActive/schedulable)始终生效。
        if (!isSchedulable(account.schedulable)) {
          logger.info(`🚫 Gemini-API account ${accountId} is not schedulable`)
          return false
        }
        if (isAutoProtectionDisabled(account)) {
          return true
        }
        if (account.status === 'error') {
          return false
        }
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
          accountId,
          accountType
        )
        if (isTempUnavailable) {
          logger.info(`⏱️ Gemini account ${accountId} is temporarily unavailable`)
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
  async _getSessionMapping(sessionHash, oauthProvider = null) {
    const client = redis.getClientSafe()
    const key = this._getSessionMappingKey(sessionHash, oauthProvider)
    const mappingData = key ? await client.get(key) : null

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
  async _setSessionMapping(sessionHash, accountId, accountType, oauthProvider = null) {
    const client = redis.getClientSafe()
    const mappingData = JSON.stringify({ accountId, accountType })
    // 依据配置设置TTL（小时）
    const ttlSeconds = Math.max(1, Math.floor(TTL.stickySession()))
    const key = this._getSessionMappingKey(sessionHash, oauthProvider)
    if (!key) {
      return
    }
    await client.setex(key, ttlSeconds, mappingData)
  }

  // 🗑️ 删除会话映射
  async _deleteSessionMapping(sessionHash) {
    const client = redis.getClientSafe()
    if (!sessionHash) {
      return
    }

    const keys = [this._getSessionMappingKey(sessionHash)]
    for (const provider of KNOWN_OAUTH_PROVIDERS) {
      keys.push(this._getSessionMappingKey(sessionHash, provider))
    }
    await client.del(keys.filter(Boolean))
  }

  // 🔁 续期统一调度会话映射TTL（针对 unified_gemini_session_mapping:* 键），遵循会话配置
  async _extendSessionMappingTTL(sessionHash, oauthProvider = null) {
    try {
      const client = redis.getClientSafe()
      const key = this._getSessionMappingKey(sessionHash, oauthProvider)
      if (!key) {
        return false
      }
      const remainingTTL = await client.ttl(key)

      if (remainingTTL === -2) {
        return false
      }
      if (remainingTTL === -1) {
        return true
      }

      const appConfig = require('../../../config/config')
      const ttlHours = appConfig.session.stickyTtlHours
      const { renewalThresholdMinutes } = appConfig.session
      if (!renewalThresholdMinutes) {
        return true
      }

      const fullTTL = Math.max(1, Math.floor(TTL.stickySession()))
      const threshold = Math.max(0, Math.floor(renewalThresholdMinutes * 60))

      if (remainingTTL < threshold) {
        await client.expire(key, fullTTL)
        logger.debug(
          `🔄 Renewed unified Gemini session TTL: ${sessionHash} (was ${Math.round(remainingTTL / 60)}m, renewed to ${ttlHours}h)`
        )
      } else {
        logger.debug(
          `✅ Unified Gemini session TTL sufficient: ${sessionHash} (remaining ${Math.round(remainingTTL / 60)}m)`
        )
      }
      return true
    } catch (error) {
      logger.error('❌ Failed to extend unified Gemini session TTL:', error)
      return false
    }
  }

  // 🚫 标记账户为限流状态
  async markAccountRateLimited(accountId, accountType, sessionHash = null) {
    try {
      if (accountType === 'gemini') {
        await geminiAccountService.setAccountRateLimited(accountId, true)
      } else if (accountType === 'gemini-api') {
        await geminiApiAccountService.setAccountRateLimited(accountId, true)
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
      if (accountType === 'gemini') {
        await geminiAccountService.setAccountRateLimited(accountId, false)
      } else if (accountType === 'gemini-api') {
        await geminiApiAccountService.setAccountRateLimited(accountId, false)
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
  async isAccountRateLimited(accountId, accountType = null) {
    try {
      let account = null

      // 如果指定了账户类型，直接使用对应服务
      if (accountType === 'gemini-api') {
        account = await geminiApiAccountService.getAccount(accountId)
      } else if (accountType === 'gemini') {
        account = await geminiAccountService.getAccount(accountId)
      } else {
        // 未指定类型，先尝试 gemini，再尝试 gemini-api
        account = await geminiAccountService.getAccount(accountId)
        if (!account) {
          account = await geminiApiAccountService.getAccount(accountId)
        }
      }

      if (!account) {
        return false
      }

      if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
        const limitedAt = new Date(account.rateLimitedAt).getTime()
        const now = Date.now()
        // 使用账户配置的限流时长，默认1小时
        const rateLimitDuration = parseInt(account.rateLimitDuration) || 60
        const limitDuration = rateLimitDuration * 60 * 1000

        return now < limitedAt + limitDuration
      }
      return false
    } catch (error) {
      logger.error(`❌ Failed to check rate limit status: ${accountId}`, error)
      return false
    }
  }

  // 👥 从分组中选择账户（支持 Gemini OAuth 和 Gemini API 两种账户类型）
  async selectAccountFromGroup(groupId, sessionHash = null, requestedModel = null) {
    try {
      // 获取分组信息
      const group = await accountGroupService.getGroup(groupId)
      if (!group) {
        throw new Error(`Group ${groupId} not found`)
      }

      if (group.platform !== 'gemini') {
        throw new Error(`Group ${group.name} is not a Gemini group`)
      }

      logger.info(`👥 Selecting account from Gemini group: ${group.name}`)

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash)
        if (mappedAccount) {
          // 验证映射的账户是否属于这个分组
          const memberIds = await accountGroupService.getGroupMembers(groupId)
          if (memberIds.includes(mappedAccount.accountId)) {
            const isAvailable = await this._isAccountAvailable(
              mappedAccount.accountId,
              mappedAccount.accountType
            )
            if (isAvailable) {
              // 🚀 智能会话续期（续期 unified 映射键，按配置）
              await this._extendSessionMappingTTL(sessionHash)
              logger.info(
                `🎯 Using sticky session account from group: ${mappedAccount.accountId} (${mappedAccount.accountType}) for session ${sessionHash}`
              )
              // 更新账户的最后使用时间（根据账户类型调用正确的服务）
              if (mappedAccount.accountType === 'gemini-api') {
                await geminiApiAccountService.markAccountUsed(mappedAccount.accountId)
              } else {
                await geminiAccountService.markAccountUsed(mappedAccount.accountId)
              }
              return mappedAccount
            }
          }
          // 如果映射的账户不可用或不在分组中，删除映射
          await this._deleteSessionMapping(sessionHash)
        }
      }

      // 获取分组内的所有账户
      const memberIds = await accountGroupService.getGroupMembers(groupId)
      if (memberIds.length === 0) {
        throw new Error(`Group ${group.name} has no members`)
      }

      const availableAccounts = []

      // 获取所有成员账户的详细信息（支持 Gemini OAuth 和 Gemini API 两种类型）
      for (const memberId of memberIds) {
        // 首先尝试从 Gemini OAuth 账户服务获取
        let account = await geminiAccountService.getAccount(memberId)
        let accountType = 'gemini'

        // 如果 Gemini OAuth 账户不存在，尝试从 Gemini API 账户服务获取
        if (!account) {
          account = await geminiApiAccountService.getAccount(memberId)
          accountType = 'gemini-api'
        }

        if (!account) {
          logger.warn(`⚠️ Gemini account ${memberId} not found in group ${group.name}`)
          continue
        }

        // [人工决策-2026-06-03 14:51:27] 分组成员统一委托 _isAccountAvailable(硬门+开关绕过上游错误,含 token 失效硬门) + 模型,
        //   与共享/复检同一判定,不再内联手抄
        const usable =
          (await this._isAccountAvailable(account.id, accountType)) &&
          this._isGeminiModelSupported(account, requestedModel)
        if (usable) {
          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType,
            priority: parseInt(account.priority) || 50,
            lastUsedAt: account.lastUsedAt || '0'
          })
        }
      }

      if (availableAccounts.length === 0) {
        throw new Error(`No available accounts in Gemini group ${group.name}`)
      }

      // 使用现有的优先级排序逻辑
      const sortedAccounts = sortAccountsByPriority(availableAccounts)

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
          `🎯 Created new sticky session mapping in group: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for session ${sessionHash}`
        )
      }

      logger.info(
        `🎯 Selected account from Gemini group ${group.name}: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) with priority ${selectedAccount.priority}`
      )

      // 更新账户的最后使用时间（根据账户类型调用正确的服务）
      if (selectedAccount.accountType === 'gemini-api') {
        await geminiApiAccountService.markAccountUsed(selectedAccount.accountId)
      } else {
        await geminiAccountService.markAccountUsed(selectedAccount.accountId)
      }

      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      }
    } catch (error) {
      logger.error(`❌ Failed to select account from Gemini group ${groupId}:`, error)
      throw error
    }
  }
}

module.exports = new UnifiedGeminiScheduler()
