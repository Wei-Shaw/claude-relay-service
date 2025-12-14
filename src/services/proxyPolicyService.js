const redis = require('../models/redis')
const logger = require('../utils/logger')
const ProxyHelper = require('../utils/proxyHelper')
const accountGroupService = require('./accountGroupService')

const CONFIG_KEY = 'proxy_policy_config'

const DEFAULT_CONFIG = {
  globalAccountProxy: null,
  platformProxies: {},
  updatedAt: null,
  updatedBy: null
}

let configCache = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60000 // 1分钟缓存

function normalizePlatform(platform) {
  if (!platform || typeof platform !== 'string') {
    return null
  }

  const lower = platform.toLowerCase()

  if (lower.startsWith('claude')) {
    return 'claude'
  }

  if (lower.startsWith('gemini')) {
    return 'gemini'
  }

  if (lower === 'azure-openai' || lower.startsWith('openai')) {
    return 'openai'
  }

  if (lower === 'droid') {
    return 'droid'
  }

  if (lower === 'bedrock') {
    return 'bedrock'
  }

  if (lower === 'ccr') {
    return 'ccr'
  }

  return lower
}

function parseProxyConfig(proxyConfig) {
  if (!proxyConfig) {
    return null
  }

  try {
    const parsed = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    return null
  }
}

function normalizeProxyPriority(value, defaultValue = 100) {
  if (value === null || value === undefined || value === '') {
    return defaultValue
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return parsed
}

class ProxyPolicyService {
  async getConfig() {
    try {
      if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
        return configCache
      }

      const client = redis.getClient()
      if (!client) {
        return { ...DEFAULT_CONFIG }
      }

      const raw = await client.get(CONFIG_KEY)
      if (!raw) {
        configCache = { ...DEFAULT_CONFIG }
      } else {
        configCache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      }

      configCacheTime = Date.now()
      return configCache
    } catch (error) {
      logger.error('❌ Failed to get proxy policy config:', error)
      return { ...DEFAULT_CONFIG }
    }
  }

  async updateConfig(updates = {}, updatedBy = 'unknown') {
    if (!updates || typeof updates !== 'object') {
      throw new Error('Invalid updates payload')
    }

    const current = await this.getConfig()

    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      updatedBy
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'globalAccountProxy')) {
      const incoming = updates.globalAccountProxy
      if (incoming === null || incoming === undefined || incoming === '') {
        next.globalAccountProxy = null
      } else {
        if (!ProxyHelper.validateProxyConfig(incoming)) {
          throw new Error('globalAccountProxy 代理配置无效')
        }
        next.globalAccountProxy = parseProxyConfig(incoming)
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'platformProxies')) {
      const incoming = updates.platformProxies
      if (incoming === null || incoming === undefined) {
        next.platformProxies = {}
      } else if (typeof incoming !== 'object' || Array.isArray(incoming)) {
        throw new Error('platformProxies 必须是对象')
      } else {
        const merged = { ...(next.platformProxies || {}) }
        for (const [platformKey, proxyValue] of Object.entries(incoming)) {
          const normalizedPlatform = normalizePlatform(platformKey)
          if (!normalizedPlatform) {
            continue
          }

          if (proxyValue === null || proxyValue === undefined || proxyValue === '') {
            delete merged[normalizedPlatform]
            continue
          }

          if (!ProxyHelper.validateProxyConfig(proxyValue)) {
            throw new Error(`platformProxies.${platformKey} 代理配置无效`)
          }

          merged[normalizedPlatform] = parseProxyConfig(proxyValue)
        }

        next.platformProxies = merged
      }
    }

    const client = redis.getClientSafe()
    await client.set(CONFIG_KEY, JSON.stringify(next))

    configCache = next
    configCacheTime = Date.now()

    return next
  }

  async resolveEffectiveProxyConfig({ accountId, platform, accountProxy }) {
    const normalizedPlatform = normalizePlatform(platform)

    const parsedAccountProxy = parseProxyConfig(accountProxy)
    if (parsedAccountProxy && ProxyHelper.validateProxyConfig(parsedAccountProxy)) {
      return {
        proxy: parsedAccountProxy,
        source: 'account',
        platform: normalizedPlatform
      }
    }

    // 分组代理：按 proxyPriority(小优先) + 更新时间(新优先) 选择第一个
    if (accountId && normalizedPlatform) {
      try {
        const groupsMap = await accountGroupService.getAccountGroupsMap(
          [accountId],
          normalizedPlatform
        )
        const groups = groupsMap?.[accountId] || []

        const candidates = groups
          .map((g) => ({
            group: g,
            proxy: parseProxyConfig(g.proxy),
            proxyPriority: normalizeProxyPriority(g.proxyPriority, 100),
            updatedAt: Date.parse(g.updatedAt || '') || 0,
            createdAt: Date.parse(g.createdAt || '') || 0
          }))
          .filter((item) => item.proxy && ProxyHelper.validateProxyConfig(item.proxy))

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            if (a.proxyPriority !== b.proxyPriority) {
              return a.proxyPriority - b.proxyPriority
            }
            if (a.updatedAt !== b.updatedAt) {
              return b.updatedAt - a.updatedAt
            }
            return b.createdAt - a.createdAt
          })

          const selected = candidates[0]
          return {
            proxy: selected.proxy,
            source: 'group',
            platform: normalizedPlatform,
            groupId: selected.group?.id || null,
            groupName: selected.group?.name || null
          }
        }
      } catch (error) {
        logger.warn(
          '⚠️ Failed to resolve group proxy, falling back to platform/global:',
          error.message
        )
      }
    }

    const cfg = await this.getConfig()

    const platformProxy = cfg?.platformProxies?.[normalizedPlatform] || null
    if (platformProxy && ProxyHelper.validateProxyConfig(platformProxy)) {
      return {
        proxy: platformProxy,
        source: 'platform',
        platform: normalizedPlatform
      }
    }

    const globalAccountProxy = cfg?.globalAccountProxy || null
    if (globalAccountProxy && ProxyHelper.validateProxyConfig(globalAccountProxy)) {
      return {
        proxy: globalAccountProxy,
        source: 'global',
        platform: normalizedPlatform
      }
    }

    return {
      proxy: null,
      source: 'none',
      platform: normalizedPlatform
    }
  }
}

module.exports = new ProxyPolicyService()
