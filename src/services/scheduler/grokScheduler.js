const grokAccountService = require('../account/grokAccountService')
const accountGroupService = require('../accountGroupService')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const { isTruthy, isAccountHealthy, sortAccountsByPriority } = require('../../utils/commonHelper')

class GrokScheduler {
  constructor() {
    this.STICKY_PREFIX = 'grok'
  }

  _isAccountSchedulable(account) {
    return isTruthy(account?.schedulable ?? true)
  }

  _composeStickySessionKey(sessionHash, apiKeyId) {
    if (!sessionHash) {
      return null
    }
    return `${this.STICKY_PREFIX}:${apiKeyId || 'default'}:${sessionHash}`
  }

  async _loadGroupAccounts(groupId) {
    const memberIds = await accountGroupService.getGroupMembers(groupId)
    if (!memberIds || memberIds.length === 0) {
      return []
    }

    const accounts = await Promise.all(
      memberIds.map(async (memberId) => {
        try {
          return await grokAccountService.getAccount(memberId)
        } catch (error) {
          logger.warn(`⚠️ 获取 Grok 分组成员账号失败: ${memberId}`, error)
          return null
        }
      })
    )

    const result = []
    for (const account of accounts) {
      if (!account || !isAccountHealthy(account) || !this._isAccountSchedulable(account)) {
        continue
      }
      if (grokAccountService.isSubscriptionExpired(account)) {
        continue
      }
      const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(account.id, 'grok')
      if (isTempUnavailable) {
        continue
      }
      result.push(account)
    }
    return result
  }

  async _cleanupStickyMapping(stickyKey) {
    if (!stickyKey) {
      return
    }
    try {
      await redis.deleteSessionAccountMapping(stickyKey)
    } catch (error) {
      logger.warn(`⚠️ 清理 Grok 粘性会话映射失败: ${stickyKey}`, error)
    }
  }

  async selectAccount(apiKeyData, sessionHash) {
    const stickyKey = this._composeStickySessionKey(sessionHash, apiKeyData?.id)
    let candidates = []
    let isDedicatedBinding = false

    if (apiKeyData?.grokAccountId) {
      const binding = apiKeyData.grokAccountId
      if (binding.startsWith('group:')) {
        const groupId = binding.substring('group:'.length)
        logger.info(
          `🤖 API Key ${apiKeyData.name || apiKeyData.id} 绑定 Grok 分组 ${groupId}，按分组调度`
        )
        candidates = await this._loadGroupAccounts(groupId)
      } else {
        const account = await grokAccountService.getAccount(binding)
        if (account) {
          const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(account.id, 'grok')
          if (isTempUnavailable) {
            logger.warn(
              `⏱️ Bound Grok account ${account.name || account.id} temporarily unavailable, falling back to pool`
            )
          } else {
            candidates = [account]
            isDedicatedBinding = true
          }
        }
      }
    }

    if (!candidates || candidates.length === 0) {
      candidates = await grokAccountService.getSchedulableAccounts()
    }

    const filteredResults = await Promise.all(
      (candidates || []).map(async (account) => {
        if (!account || !isAccountHealthy(account) || !this._isAccountSchedulable(account)) {
          return null
        }
        if (grokAccountService.isSubscriptionExpired(account)) {
          return null
        }
        await grokAccountService.checkAndClearRateLimit(account.id)
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(account.id, 'grok')
        if (isTempUnavailable) {
          return null
        }
        return account
      })
    )
    const filtered = filteredResults.filter(Boolean)

    if (filtered.length === 0) {
      const error = new Error(
        `No available Grok accounts${apiKeyData?.grokAccountId ? ' (respecting binding)' : ''}`
      )
      error.statusCode = 402
      throw error
    }

    if (stickyKey && !isDedicatedBinding) {
      const mappedAccountId = await redis.getSessionAccountMapping(stickyKey)
      if (mappedAccountId) {
        const mappedAccount = filtered.find((account) => account.id === mappedAccountId)
        if (mappedAccount) {
          await redis.extendSessionAccountMappingTTL(stickyKey)
          await grokAccountService.touchLastUsedAt(mappedAccount.id)
          return mappedAccount
        }
        await this._cleanupStickyMapping(stickyKey)
      }
    }

    const selected = sortAccountsByPriority(filtered)[0]
    if (stickyKey && !isDedicatedBinding) {
      await redis.setSessionAccountMapping(stickyKey, selected.id)
    }
    await grokAccountService.touchLastUsedAt(selected.id)
    logger.info(`🎯 Selected Grok account: ${selected.name} (${selected.id})`)
    return selected
  }

  async deleteSessionMapping(sessionHash, apiKeyId) {
    const stickyKey = this._composeStickySessionKey(sessionHash, apiKeyId)
    await this._cleanupStickyMapping(stickyKey)
  }
}

module.exports = new GrokScheduler()
