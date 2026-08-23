// ============== 代理池相关方法（从 src/models/redis.js 按域抽出）==============
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上。this 绑定不变：
// 仍按 redisClient.xxx() 调用，this 指向单例，this.getClientSafe()/this.getAllIdsByIndex()
// 照常解析。方法体逐字保留原样（含 `redisClient.` 前缀，形参同名）。
// Redis 作为单一权威源：configs/groups 既是运行时缓存也是持久化存储。
const logger = require('../../utils/logger')
const { RedisKeys, TTL, LIMITS } = require('../../constants/redisKeys')

// 账户存储元数据：删除代理/分组时据此全平台扫描清理悬空绑定
// type 'hash' 走 hdel；'string'（bedrock）走 GET→改写→SET；gemini 与 antigravity 共用同一前缀
// prefix 由对应账户 builder('') 派生(= 'xxx:account:' / 'xxx_account:'),与账户主数据 key 前缀逐字一致
const PROXY_BINDABLE_STORES = [
  { indexKey: RedisKeys.accounts.claudeIndex, prefix: RedisKeys.accounts.claude(''), type: 'hash' },
  {
    indexKey: RedisKeys.accounts.claudeConsoleIndex,
    prefix: RedisKeys.accounts.claudeConsole(''),
    type: 'hash'
  },
  { indexKey: RedisKeys.accounts.ccrIndex, prefix: RedisKeys.accounts.ccr(''), type: 'hash' },
  { indexKey: RedisKeys.accounts.droidIndex, prefix: RedisKeys.accounts.droid(''), type: 'hash' },
  { indexKey: RedisKeys.accounts.openaiIndex, prefix: RedisKeys.accounts.openai(''), type: 'hash' },
  {
    indexKey: RedisKeys.accounts.openaiResponsesIndex,
    prefix: RedisKeys.accounts.openaiResponses(''),
    type: 'hash'
  },
  {
    indexKey: RedisKeys.accounts.azureOpenaiIndex,
    prefix: RedisKeys.accounts.azureOpenai(''),
    type: 'hash'
  },
  { indexKey: RedisKeys.accounts.geminiIndex, prefix: RedisKeys.accounts.gemini(''), type: 'hash' },
  {
    indexKey: RedisKeys.accounts.geminiApiIndex,
    prefix: RedisKeys.accounts.geminiApi(''),
    type: 'hash'
  },
  {
    indexKey: RedisKeys.accounts.bedrockIndex,
    prefix: RedisKeys.accounts.bedrock(''),
    type: 'string'
  }
]

// 单账户「比较并删除」：仅当字段值仍等于目标 id 时才 HDEL，原子完成
// 杜绝「扫描读到旧值后、在 HDEL 前用户把该账户改绑到别的代理」导致的误删新绑定
const HASH_CAS_DELETE_LUA =
  "if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then return redis.call('HDEL', KEYS[1], ARGV[1]) else return 0 end"

// bedrock 为 JSON string：Lua+cjson 原子 compare-and-clear，仅当字段仍等于目标 id 时删字段并写回
// pcall 保护：解析失败则不动；标准 JSON round-trip 保真（null 经 cjson.null 保留）
const STRING_JSON_CAS_CLEAR_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, obj = pcall(cjson.decode, raw)
if not ok then return 0 end
if obj[ARGV[1]] == ARGV[2] then
  obj[ARGV[1]] = nil
  redis.call('SET', KEYS[1], cjson.encode(obj))
  return 1
end
return 0
`

function attach(redisClient) {
  // 全量代理配置（返回已解析的对象数组）
  redisClient.getProxyConfigsAll = async function () {
    const client = this.getClientSafe()
    const map = await client.hgetall(RedisKeys.proxy.configs)
    const result = []
    for (const v of Object.values(map || {})) {
      try {
        result.push(JSON.parse(v))
      } catch (e) {
        logger.warn('⚠️ Invalid proxy config JSON in Redis, skipped')
      }
    }
    return result
  }

  redisClient.getProxyConfig = async function (id) {
    const client = this.getClientSafe()
    const raw = await client.hget(RedisKeys.proxy.configs, String(id))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  redisClient.setProxyConfig = async function (proxyConfig) {
    const client = this.getClientSafe()
    await client.hset(RedisKeys.proxy.configs, String(proxyConfig.id), JSON.stringify(proxyConfig))
  }

  redisClient.deleteProxyConfig = async function (id) {
    const client = this.getClientSafe()
    await client.hdel(RedisKeys.proxy.configs, String(id))
  }

  // 全量分组配置
  redisClient.getProxyGroupsAll = async function () {
    const client = this.getClientSafe()
    const map = await client.hgetall(RedisKeys.proxy.groups)
    const result = []
    for (const v of Object.values(map || {})) {
      try {
        result.push(JSON.parse(v))
      } catch (e) {
        logger.warn('⚠️ Invalid proxy group JSON in Redis, skipped')
      }
    }
    return result
  }

  redisClient.getProxyGroup = async function (id) {
    const client = this.getClientSafe()
    const raw = await client.hget(RedisKeys.proxy.groups, String(id))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  redisClient.setProxyGroup = async function (group) {
    const client = this.getClientSafe()
    await client.hset(RedisKeys.proxy.groups, String(group.id), JSON.stringify(group))
  }

  redisClient.deleteProxyGroup = async function (id) {
    const client = this.getClientSafe()
    await client.hdel(RedisKeys.proxy.groups, String(id))
    await client.del(RedisKeys.proxy.groupMembers(id))
  }

  // 分组成员（返回字符串数组）
  redisClient.getProxyGroupMembers = async function (gid) {
    const client = this.getClientSafe()
    return client.smembers(RedisKeys.proxy.groupMembers(gid))
  }

  redisClient.addProxyGroupMember = async function (gid, proxyId) {
    const client = this.getClientSafe()
    await client.sadd(RedisKeys.proxy.groupMembers(gid), String(proxyId))
  }

  redisClient.removeProxyGroupMember = async function (gid, proxyId) {
    const client = this.getClientSafe()
    await client.srem(RedisKeys.proxy.groupMembers(gid), String(proxyId))
  }

  // 删除代理时从所有分组移除
  redisClient.removeProxyFromAllGroups = async function (proxyId, groupIds) {
    const client = this.getClientSafe()
    const pipeline = client.pipeline()
    for (const gid of groupIds) {
      pipeline.srem(RedisKeys.proxy.groupMembers(gid), String(proxyId))
    }
    await pipeline.exec()
  }

  // 路由表版本号
  redisClient.incrProxyRouteVersion = async function () {
    const client = this.getClientSafe()
    return client.incr(RedisKeys.proxy.routeVersion)
  }

  redisClient.getProxyRouteVersion = async function () {
    const client = this.getClientSafe()
    const v = await client.get(RedisKeys.proxy.routeVersion)
    return Number(v) || 0
  }

  redisClient.publishProxyConfigChanged = async function (version) {
    const client = this.getClientSafe()
    await client.publish(RedisKeys.proxy.configChangedChannel, String(version))
  }

  // 健康检查历史（List，最多 maxLen 条，7 天 TTL）
  redisClient.pushProxyHealthHistory = async function (
    proxyId,
    entry,
    maxLen = LIMITS.proxyHealthHistory
  ) {
    const client = this.getClientSafe()
    const key = RedisKeys.proxy.healthHistory(proxyId)
    const pipeline = client.pipeline()
    pipeline.lpush(key, typeof entry === 'string' ? entry : JSON.stringify(entry))
    pipeline.ltrim(key, 0, maxLen - 1)
    pipeline.expire(key, TTL.proxyHealthHistory)
    await pipeline.exec()
  }

  redisClient.getProxyHealthHistory = async function (proxyId, limit = 50) {
    const client = this.getClientSafe()
    const list = await client.lrange(RedisKeys.proxy.healthHistory(proxyId), 0, limit - 1)
    return list
      .map((v) => {
        try {
          return JSON.parse(v)
        } catch (e) {
          return null
        }
      })
      .filter(Boolean)
  }

  // 质量检测结果（最新一次，30 天 TTL）
  redisClient.setProxyQualityResult = async function (proxyId, result) {
    const client = this.getClientSafe()
    await client.set(
      RedisKeys.proxy.qualityResult(proxyId),
      JSON.stringify(result),
      'EX',
      TTL.proxyQuality
    )
  }

  redisClient.getProxyQualityResult = async function (proxyId) {
    const client = this.getClientSafe()
    const raw = await client.get(RedisKeys.proxy.qualityResult(proxyId))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  // 出口 IP / 地理信息（借 sub2api 探测，30 天 TTL）
  redisClient.setProxyExitInfo = async function (proxyId, info) {
    const client = this.getClientSafe()
    await client.set(
      RedisKeys.proxy.exitInfo(proxyId),
      JSON.stringify(info),
      'EX',
      TTL.proxyExitInfo
    )
  }

  redisClient.getProxyExitInfo = async function (proxyId) {
    const client = this.getClientSafe()
    const raw = await client.get(RedisKeys.proxy.exitInfo(proxyId))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  // 代理池全局调优设置（覆盖 env 默认）
  redisClient.getProxyPoolSettings = async function () {
    const client = this.getClientSafe()
    const raw = await client.get(RedisKeys.proxy.settings)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  redisClient.setProxyPoolSettings = async function (settings) {
    const client = this.getClientSafe()
    await client.set(RedisKeys.proxy.settings, JSON.stringify(settings))
  }

  // 删除代理/分组时清理悬空绑定：全平台扫描账户，清除引用该 id 的 proxyGroupId/proxyId
  // 低频运维操作，全量扫描可接受；不再维护反向索引，从根上避免索引与账户字段分叉
  redisClient.clearProxyBindingFromAllAccounts = async function (kind, id) {
    const client = this.getClientSafe()
    const field = kind === 'group' ? 'proxyGroupId' : 'proxyId'
    let cleared = 0
    for (const store of PROXY_BINDABLE_STORES) {
      const extractRegex = new RegExp(`^${store.prefix}(.+)$`)
      const accountIds = await this.getAllIdsByIndex(
        store.indexKey,
        `${store.prefix}*`,
        extractRegex
      )
      for (const accountId of accountIds) {
        const accountKey = `${store.prefix}${accountId}`
        try {
          if (store.type === 'string') {
            // bedrock：Lua+cjson 原子 compare-and-clear，清理侧消除 GET→SET 窗口
            // 注意：bedrock 自身 updateAccount 仍是 GET→改→SET 非原子（string 存储固有缺陷），
            // 与并发 update 的完全原子需将 bedrock 迁移为 hash 存储（独立工程，见交付说明）
            const removed = await client.eval(STRING_JSON_CAS_CLEAR_LUA, 1, accountKey, field, id)
            if (removed) {
              cleared += 1
            }
          } else {
            // hash 平台：Lua 原子 compare-and-delete，消除 hget→hdel 之间的字段级竞态
            const removed = await client.eval(HASH_CAS_DELETE_LUA, 1, accountKey, field, id)
            if (removed) {
              cleared += 1
            }
          }
        } catch (error) {
          logger.error(`❌ [ProxyPool] clear binding failed for ${accountKey}:`, error)
        }
      }
    }
    return cleared
  }
}

module.exports = { attach }
