const droidAccountService = require('./droidAccountService')
const accountGroupService = require('./accountGroupService')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class DroidScheduler {
  constructor() {
    this.STICKY_PREFIX = 'droid'
  }

  _normalizeEndpointType(endpointType) {
    if (!endpointType) {
      return 'anthropic'
    }
    const normalized = String(endpointType).toLowerCase()
    if (normalized === 'openai') {
      return 'openai'
    }
    if (normalized === 'comm') {
      return 'comm'
    }
    if (normalized === 'anthropic') {
      return 'anthropic'
    }
    return 'anthropic'
  }

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

  _isAccountActive(account) {
    if (!account) {
      return false
    }
    const isActive = this._isTruthy(account.isActive)
    if (!isActive) {
      return false
    }

    const status = (account.status || 'active').toLowerCase()
    const unhealthyStatuses = new Set(['error', 'unauthorized', 'blocked'])
    return !unhealthyStatuses.has(status)
  }

  _isAccountSchedulable(account) {
    return this._isTruthy(account?.schedulable ?? true)
  }

  _matchesEndpoint(account, endpointType) {
    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    const accountEndpoint = this._normalizeEndpointType(account?.endpointType)
    if (normalizedEndpoint === accountEndpoint) {
      return true
    }

    // comm 端点可以使用任何类型的账户
    if (normalizedEndpoint === 'comm') {
      return true
    }

    const sharedEndpoints = new Set(['anthropic', 'openai'])
    return sharedEndpoints.has(normalizedEndpoint) && sharedEndpoints.has(accountEndpoint)
  }

  _sortCandidates(candidates) {
    return [...candidates].sort((a, b) => {
      const priorityA = parseInt(a.priority, 10) || 50
      const priorityB = parseInt(b.priority, 10) || 50

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      const lastUsedA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const lastUsedB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0

      if (lastUsedA !== lastUsedB) {
        return lastUsedA - lastUsedB
      }

      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return createdA - createdB
    })
  }

  _composeStickySessionKey(endpointType, sessionHash, apiKeyId) {
    if (!sessionHash) {
      return null
    }
    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    const apiKeyPart = apiKeyId || 'default'
    return `${this.STICKY_PREFIX}:${normalizedEndpoint}:${apiKeyPart}:${sessionHash}`
  }

  async _loadGroupAccounts(groupId) {
    const memberIds = await accountGroupService.getGroupMembers(groupId)
    if (!memberIds || memberIds.length === 0) {
      return []
    }

    const accounts = await Promise.all(
      memberIds.map(async (memberId) => {
        try {
          return await droidAccountService.getAccount(memberId)
        } catch (error) {
          logger.warn(`⚠️ 获取 Droid 分组成员账号失败: ${memberId}`, error)
          return null
        }
      })
    )

    return accounts.filter(
      (account) => account && this._isAccountActive(account) && this._isAccountSchedulable(account)
    )
  }

  async _ensureLastUsedUpdated(accountId) {
    try {
      await droidAccountService.touchLastUsedAt(accountId)
    } catch (error) {
      logger.warn(`⚠️ 更新 Droid 账号最后使用时间失败: ${accountId}`, error)
    }
  }

  async _cleanupStickyMapping(stickyKey) {
    if (!stickyKey) {
      return
    }
    try {
      await redis.deleteSessionAccountMapping(stickyKey)
    } catch (error) {
      logger.warn(`⚠️ 清理 Droid 粘性会话映射失败: ${stickyKey}`, error)
    }
  }

  async selectAccount(apiKeyData, endpointType, sessionHash) {
    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    const stickyKey = this._composeStickySessionKey(normalizedEndpoint, sessionHash, apiKeyData?.id)

    let candidates = []
    let isDedicatedBinding = false

    if (apiKeyData?.droidAccountId) {
      const binding = apiKeyData.droidAccountId
      if (binding.startsWith('group:')) {
        const groupId = binding.substring('group:'.length)
        logger.info(
          `🤖 API Key ${apiKeyData.name || apiKeyData.id} 绑定 Droid 分组 ${groupId}，按分组调度`
        )
        candidates = await this._loadGroupAccounts(groupId, normalizedEndpoint)
      } else {
        const account = await droidAccountService.getAccount(binding)
        if (account) {
          candidates = [account]
          isDedicatedBinding = true
        }
      }
    }

    if (!candidates || candidates.length === 0) {
      candidates = await droidAccountService.getSchedulableAccounts(normalizedEndpoint)
    }

    const filtered = candidates.filter(
      (account) =>
        account &&
        this._isAccountActive(account) &&
        this._isAccountSchedulable(account) &&
        this._matchesEndpoint(account, normalizedEndpoint)
    )

    if (filtered.length === 0) {
      throw new Error(
        `No available accounts for endpoint ${normalizedEndpoint}${apiKeyData?.droidAccountId ? ' (respecting binding)' : ''}`
      )
    }

    if (stickyKey && !isDedicatedBinding) {
      const mappedAccountId = await redis.getSessionAccountMapping(stickyKey)
      if (mappedAccountId) {
        const mappedAccount = filtered.find((account) => account.id === mappedAccountId)
        if (mappedAccount) {
          await redis.extendSessionAccountMappingTTL(stickyKey)
          logger.info(
            `🤖 命中 Droid 粘性会话: ${sessionHash} -> ${mappedAccount.name || mappedAccount.id}`
          )
          await this._ensureLastUsedUpdated(mappedAccount.id)
          return mappedAccount
        }

        await this._cleanupStickyMapping(stickyKey)
      }
    }

    const sorted = this._sortCandidates(filtered)
    const selected = sorted[0]

    if (!selected) {
      throw new Error(`No schedulable account available after sorting (${normalizedEndpoint})`)
    }

    if (stickyKey && !isDedicatedBinding) {
      await redis.setSessionAccountMapping(stickyKey, selected.id)
    }

    await this._ensureLastUsedUpdated(selected.id)

    logger.info(
      `🤖 选择 Droid 账号 ${selected.name || selected.id}（endpoint: ${normalizedEndpoint}, priority: ${selected.priority || 50}）`
    )

    return selected
  }
}

module.exports = new DroidScheduler()
