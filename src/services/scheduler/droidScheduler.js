const droidAccountService = require('../account/droidAccountService')
const accountGroupService = require('../accountGroupService')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const {
  isTruthy,
  isAccountHealthy,
  isAutoProtectionDisabled,
  sortAccountsByPriority,
  normalizeEndpointType
} = require('../../utils/commonHelper')
const { RedisKeys } = require('../../constants/redisKeys')

class DroidScheduler {
  _isAccountSchedulable(account) {
    return isTruthy(account?.schedulable ?? true)
  }

  // [人工决策-2026-06-03 14:51:27] droid 账户同步硬门单一判定（完整清单）：schedulable(手动停用)、订阅过期、endpoint 兼容
  //   始终生效；开关 ON 仅跳过 status 健康检查。temp_unavailable 为异步,由各路径单独 await（不并入此处）。
  //   group/dedicated/syncFiltered 三条路径统一调用此函数,避免订阅/endpoint 等硬门在某条路径漏检漂移。
  _passesDroidSyncGates(account, normalizedEndpoint) {
    if (!account || !this._isAccountSchedulable(account)) {
      return false
    }
    // [人工决策-2026-06-03 14:51:27] isActive(手动停用) 是硬门,开关 ON 也不豁免。
    //   注意 isAccountHealthy 把 isActive+status 绑在一起,所以此处必须单独硬挡 isActive,
    //   否则下面 `autoOff || isAccountHealthy` 在开关 ON 时会连 isActive=false 一起放行。
    if (!isTruthy(account.isActive)) {
      return false
    }
    if (droidAccountService.isSubscriptionExpired(account)) {
      return false
    }
    if (!this._matchesEndpoint(account, normalizedEndpoint)) {
      return false
    }
    // status 健康检查(error/unauthorized/blocked/temp_error)属上游错误类,开关 ON 跳过
    return isAutoProtectionDisabled(account) || isAccountHealthy(account)
  }

  // [人工决策-2026-06-03 14:51:27] droid 账户完整可调度判定(唯一真相,含异步 temp_unavailable)：
  //   sync 硬门(_passesDroidSyncGates) + temp_unavailable(开关 ON 跳过)。group/dedicated/共享池三路径统一调用此函数,
  //   不再各自在外面叠 temp,避免"两段式 gate"漂移。
  async _isDroidAccountUsable(account, normalizedEndpoint) {
    if (!this._passesDroidSyncGates(account, normalizedEndpoint)) {
      return false
    }
    if (isAutoProtectionDisabled(account)) {
      return true
    }
    return !(await upstreamErrorHelper.isTempUnavailable(account.id, 'droid'))
  }

  _matchesEndpoint(account, endpointType) {
    const normalizedEndpoint = normalizeEndpointType(endpointType)
    const accountEndpoint = normalizeEndpointType(account?.endpointType)
    if (normalizedEndpoint === accountEndpoint) {
      return true
    }
    if (normalizedEndpoint === 'comm') {
      return true
    }
    const sharedEndpoints = new Set(['anthropic', 'openai'])
    return sharedEndpoints.has(normalizedEndpoint) && sharedEndpoints.has(accountEndpoint)
  }

  _composeStickySessionKey(endpointType, sessionHash, apiKeyId) {
    if (!sessionHash) {
      return null
    }
    const normalizedEndpoint = normalizeEndpointType(endpointType)
    const apiKeyPart = apiKeyId || 'default'
    return RedisKeys.session.droidSticky(normalizedEndpoint, apiKeyPart, sessionHash)
  }

  async _loadGroupAccounts(groupId, normalizedEndpoint) {
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

    const result = []
    for (const account of accounts) {
      // 统一走 _isDroidAccountUsable（完整可调度判定单点：sync 硬门 + 异步 temp）
      if (await this._isDroidAccountUsable(account, normalizedEndpoint)) {
        result.push(account)
      }
    }
    return result
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
    const normalizedEndpoint = normalizeEndpointType(endpointType)
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
          // 专属绑定走与共享池一致的完整判定 _isDroidAccountUsable（sync 硬门 + temp）
          if (await this._isDroidAccountUsable(account, normalizedEndpoint)) {
            candidates = [account]
            isDedicatedBinding = true
          } else {
            logger.warn(
              `⏱️ Bound Droid account ${account.name || account.id} not usable (schedulable/subscription/endpoint/health/temp), falling back to pool`
            )
          }
        }
      }
    }

    if (!candidates || candidates.length === 0) {
      candidates = await droidAccountService.getSchedulableAccounts(normalizedEndpoint)
    }

    // 统一走 _isDroidAccountUsable（完整可调度判定单点：sync 硬门 + 异步 temp）
    const usabilityResults = await Promise.all(
      candidates.map(async (account) =>
        (await this._isDroidAccountUsable(account, normalizedEndpoint)) ? account : null
      )
    )
    const filtered = usabilityResults.filter(Boolean)

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

    const sorted = sortAccountsByPriority(filtered)
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
