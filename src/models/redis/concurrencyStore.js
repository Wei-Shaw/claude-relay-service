// ============================================================================
// API Key / Console 账户并发控制（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 内部互调用(_getConcurrencyConfig/incrConcurrency 等)及 this.getClientSafe/scanKeys
// 均经同一单例解析。含原子性 Lua 脚本（逐字保留）。
// ============================================================================
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const { RedisKeys, TTL } = require('../../constants/redisKeys')

function attach(redisClient) {
  // 获取并发配置
  redisClient._getConcurrencyConfig = function () {
    const defaults = {
      leaseSeconds: 300,
      renewIntervalSeconds: 30,
      cleanupGraceSeconds: 30
    }

    const configValues = {
      ...defaults,
      ...(config.concurrency || {})
    }

    const normalizeNumber = (value, fallback, options = {}) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        return fallback
      }

      if (options.allowZero && parsed === 0) {
        return 0
      }

      if (options.min !== undefined && parsed < options.min) {
        return options.min
      }

      return parsed
    }

    return {
      leaseSeconds: normalizeNumber(configValues.leaseSeconds, defaults.leaseSeconds, {
        min: 30
      }),
      renewIntervalSeconds: normalizeNumber(
        configValues.renewIntervalSeconds,
        defaults.renewIntervalSeconds,
        {
          allowZero: true,
          min: 0
        }
      ),
      cleanupGraceSeconds: normalizeNumber(
        configValues.cleanupGraceSeconds,
        defaults.cleanupGraceSeconds,
        {
          min: 0
        }
      )
    }
  }

  // 增加并发计数（基于租约的有序集合）
  redisClient.incrConcurrency = async function (apiKeyId, requestId, leaseSeconds = null) {
    if (!requestId) {
      throw new Error('Request ID is required for concurrency tracking')
    }

    try {
      const { leaseSeconds: defaultLeaseSeconds, cleanupGraceSeconds } =
        this._getConcurrencyConfig()
      const lease = leaseSeconds || defaultLeaseSeconds
      const key = RedisKeys.concurrency.byKey(apiKeyId)
      const now = Date.now()
      const expireAt = now + lease * 1000
      const ttl = TTL.concurrencyLeaseMs(lease, cleanupGraceSeconds)

      const luaScript = `
        local key = KEYS[1]
        local member = ARGV[1]
        local expireAt = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local ttl = tonumber(ARGV[4])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
        redis.call('ZADD', key, expireAt, member)

        if ttl > 0 then
          redis.call('PEXPIRE', key, ttl)
        end

        local count = redis.call('ZCARD', key)
        return count
      `

      const count = await this.client.eval(luaScript, 1, key, requestId, expireAt, now, ttl)
      logger.database(
        `🔢 Incremented concurrency for key ${apiKeyId}: ${count} (request ${requestId})`
      )
      return count
    } catch (error) {
      logger.error('❌ Failed to increment concurrency:', error)
      throw error
    }
  }

  // 刷新并发租约，防止长连接提前过期
  redisClient.refreshConcurrencyLease = async function (apiKeyId, requestId, leaseSeconds = null) {
    if (!requestId) {
      return 0
    }

    try {
      const { leaseSeconds: defaultLeaseSeconds, cleanupGraceSeconds } =
        this._getConcurrencyConfig()
      const lease = leaseSeconds || defaultLeaseSeconds
      const key = RedisKeys.concurrency.byKey(apiKeyId)
      const now = Date.now()
      const expireAt = now + lease * 1000
      const ttl = TTL.concurrencyLeaseMs(lease, cleanupGraceSeconds)

      const luaScript = `
        local key = KEYS[1]
        local member = ARGV[1]
        local expireAt = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local ttl = tonumber(ARGV[4])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', now)

        local exists = redis.call('ZSCORE', key, member)

        if exists then
          redis.call('ZADD', key, expireAt, member)
          if ttl > 0 then
            redis.call('PEXPIRE', key, ttl)
          end
          return 1
        end

        return 0
      `

      const refreshed = await this.client.eval(luaScript, 1, key, requestId, expireAt, now, ttl)
      if (refreshed === 1) {
        logger.debug(`🔄 Refreshed concurrency lease for key ${apiKeyId} (request ${requestId})`)
      }
      return refreshed
    } catch (error) {
      logger.error('❌ Failed to refresh concurrency lease:', error)
      return 0
    }
  }

  // 减少并发计数
  redisClient.decrConcurrency = async function (apiKeyId, requestId) {
    try {
      const key = RedisKeys.concurrency.byKey(apiKeyId)
      const now = Date.now()

      const luaScript = `
        local key = KEYS[1]
        local member = ARGV[1]
        local now = tonumber(ARGV[2])

        if member then
          redis.call('ZREM', key, member)
        end

        redis.call('ZREMRANGEBYSCORE', key, '-inf', now)

        local count = redis.call('ZCARD', key)
        if count <= 0 then
          redis.call('DEL', key)
          return 0
        end

        return count
      `

      const count = await this.client.eval(luaScript, 1, key, requestId || '', now)
      logger.database(
        `🔢 Decremented concurrency for key ${apiKeyId}: ${count} (request ${requestId || 'n/a'})`
      )
      return count
    } catch (error) {
      logger.error('❌ Failed to decrement concurrency:', error)
      throw error
    }
  }

  // 获取当前并发数
  redisClient.getConcurrency = async function (apiKeyId) {
    try {
      const key = RedisKeys.concurrency.byKey(apiKeyId)
      const now = Date.now()

      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
        return redis.call('ZCARD', key)
      `

      const count = await this.client.eval(luaScript, 1, key, now)
      return parseInt(count || 0)
    } catch (error) {
      logger.error('❌ Failed to get concurrency:', error)
      return 0
    }
  }

  // 🏢 Claude Console 账户并发控制（复用现有并发机制）
  // 增加 Console 账户并发计数
  redisClient.incrConsoleAccountConcurrency = async function (
    accountId,
    requestId,
    leaseSeconds = null
  ) {
    if (!requestId) {
      throw new Error('Request ID is required for console account concurrency tracking')
    }
    // 使用特殊的 key 前缀区分 Console 账户并发
    const compositeKey = RedisKeys.concurrency.consoleAccount(accountId)
    return await this.incrConcurrency(compositeKey, requestId, leaseSeconds)
  }

  // 刷新 Console 账户并发租约
  redisClient.refreshConsoleAccountConcurrencyLease = async function (
    accountId,
    requestId,
    leaseSeconds = null
  ) {
    if (!requestId) {
      return 0
    }
    const compositeKey = RedisKeys.concurrency.consoleAccount(accountId)
    return await this.refreshConcurrencyLease(compositeKey, requestId, leaseSeconds)
  }

  // 减少 Console 账户并发计数
  redisClient.decrConsoleAccountConcurrency = async function (accountId, requestId) {
    const compositeKey = RedisKeys.concurrency.consoleAccount(accountId)
    return await this.decrConcurrency(compositeKey, requestId)
  }

  // 获取 Console 账户当前并发数
  redisClient.getConsoleAccountConcurrency = async function (accountId) {
    const compositeKey = RedisKeys.concurrency.consoleAccount(accountId)
    return await this.getConcurrency(compositeKey)
  }

  redisClient.getAllConcurrencyStatus = async function () {
    try {
      const client = this.getClientSafe()
      const keys = await this.scanKeys(RedisKeys.concurrency.pattern)
      const now = Date.now()
      const results = []

      for (const key of keys) {
        // 跳过已知非 Sorted Set 类型的键
        // - concurrency:queue:stats:* 是 Hash 类型
        // - concurrency:queue:wait_times:* 是 List 类型
        // - concurrency:queue:* (不含stats/wait_times) 是 String 类型
        if (
          key.startsWith('concurrency:queue:stats:') ||
          key.startsWith('concurrency:queue:wait_times:') ||
          (key.startsWith('concurrency:queue:') &&
            !key.includes(':stats:') &&
            !key.includes(':wait_times:'))
        ) {
          continue
        }

        // 检查键类型，只处理 Sorted Set
        const keyType = await client.type(key)
        if (keyType !== 'zset') {
          logger.debug(`🔢 getAllConcurrencyStatus skipped non-zset key: ${key} (type: ${keyType})`)
          continue
        }

        // 提取 apiKeyId（去掉 concurrency: 前缀）
        const apiKeyId = key.replace('concurrency:', '')

        // 获取所有成员和分数（过期时间）
        const members = await client.zrangebyscore(key, now, '+inf', 'WITHSCORES')

        // 解析成员和过期时间
        const activeRequests = []
        for (let i = 0; i < members.length; i += 2) {
          const requestId = members[i]
          const expireAt = parseInt(members[i + 1])
          const remainingSeconds = Math.max(0, Math.round((expireAt - now) / 1000))
          activeRequests.push({
            requestId,
            expireAt: new Date(expireAt).toISOString(),
            remainingSeconds
          })
        }

        // 获取过期的成员数量
        const expiredCount = await client.zcount(key, '-inf', now)

        results.push({
          apiKeyId,
          key,
          activeCount: activeRequests.length,
          expiredCount,
          activeRequests
        })
      }

      return results
    } catch (error) {
      logger.error('❌ Failed to get all concurrency status:', error)
      throw error
    }
  }

  redisClient.getConcurrencyStatus = async function (apiKeyId) {
    try {
      const client = this.getClientSafe()
      const key = RedisKeys.concurrency.byKey(apiKeyId)
      const now = Date.now()

      // 检查 key 是否存在
      const exists = await client.exists(key)
      if (!exists) {
        return {
          apiKeyId,
          key,
          activeCount: 0,
          expiredCount: 0,
          activeRequests: [],
          exists: false
        }
      }

      // 检查键类型，只处理 Sorted Set
      const keyType = await client.type(key)
      if (keyType !== 'zset') {
        logger.warn(
          `⚠️ getConcurrencyStatus: key ${key} has unexpected type: ${keyType}, expected zset`
        )
        return {
          apiKeyId,
          key,
          activeCount: 0,
          expiredCount: 0,
          activeRequests: [],
          exists: true,
          invalidType: keyType
        }
      }

      // 获取所有成员和分数
      const allMembers = await client.zrange(key, 0, -1, 'WITHSCORES')

      const activeRequests = []
      const expiredRequests = []

      for (let i = 0; i < allMembers.length; i += 2) {
        const requestId = allMembers[i]
        const expireAt = parseInt(allMembers[i + 1])
        const remainingSeconds = Math.round((expireAt - now) / 1000)

        const requestInfo = {
          requestId,
          expireAt: new Date(expireAt).toISOString(),
          remainingSeconds
        }

        if (expireAt > now) {
          activeRequests.push(requestInfo)
        } else {
          expiredRequests.push(requestInfo)
        }
      }

      return {
        apiKeyId,
        key,
        activeCount: activeRequests.length,
        expiredCount: expiredRequests.length,
        activeRequests,
        expiredRequests,
        exists: true
      }
    } catch (error) {
      logger.error(`❌ Failed to get concurrency status for ${apiKeyId}:`, error)
      throw error
    }
  }

  redisClient.forceClearConcurrency = async function (apiKeyId) {
    try {
      const client = this.getClientSafe()
      const key = RedisKeys.concurrency.byKey(apiKeyId)

      // 检查键类型
      const keyType = await client.type(key)

      let beforeCount = 0
      let isLegacy = false

      if (keyType === 'zset') {
        // 正常的 zset 键，获取条目数
        beforeCount = await client.zcard(key)
      } else if (keyType !== 'none') {
        // 非 zset 且非空的遗留键
        isLegacy = true
        logger.warn(
          `⚠️ forceClearConcurrency: key ${key} has unexpected type: ${keyType}, will be deleted`
        )
      }

      // 删除键（无论什么类型）
      await client.del(key)

      logger.warn(
        `🧹 Force cleared concurrency for key ${apiKeyId}, removed ${beforeCount} entries${isLegacy ? ' (legacy key)' : ''}`
      )

      return {
        apiKeyId,
        key,
        clearedCount: beforeCount,
        type: keyType,
        legacy: isLegacy,
        success: true
      }
    } catch (error) {
      logger.error(`❌ Failed to force clear concurrency for ${apiKeyId}:`, error)
      throw error
    }
  }

  redisClient.forceClearAllConcurrency = async function () {
    try {
      const client = this.getClientSafe()
      const keys = await this.scanKeys(RedisKeys.concurrency.pattern)

      let totalCleared = 0
      let legacyCleared = 0
      const clearedKeys = []

      for (const key of keys) {
        // 跳过 queue 相关的键（它们有各自的清理逻辑）
        if (key.startsWith('concurrency:queue:')) {
          continue
        }

        // 检查键类型
        const keyType = await client.type(key)
        if (keyType === 'zset') {
          const count = await client.zcard(key)
          await client.del(key)
          totalCleared += count
          clearedKeys.push({
            key,
            clearedCount: count,
            type: 'zset'
          })
        } else {
          // 非 zset 类型的遗留键，直接删除
          await client.del(key)
          legacyCleared++
          clearedKeys.push({
            key,
            clearedCount: 0,
            type: keyType,
            legacy: true
          })
        }
      }

      logger.warn(
        `🧹 Force cleared all concurrency: ${clearedKeys.length} keys, ${totalCleared} entries, ${legacyCleared} legacy keys`
      )

      return {
        keysCleared: clearedKeys.length,
        totalEntriesCleared: totalCleared,
        legacyKeysCleared: legacyCleared,
        clearedKeys,
        success: true
      }
    } catch (error) {
      logger.error('❌ Failed to force clear all concurrency:', error)
      throw error
    }
  }

  redisClient.cleanupExpiredConcurrency = async function (apiKeyId = null) {
    try {
      const client = this.getClientSafe()
      const now = Date.now()
      let keys

      if (apiKeyId) {
        keys = [RedisKeys.concurrency.byKey(apiKeyId)]
      } else {
        keys = await this.scanKeys(RedisKeys.concurrency.pattern)
      }

      let totalCleaned = 0
      let legacyCleaned = 0
      const cleanedKeys = []

      for (const key of keys) {
        // 跳过 queue 相关的键（它们有各自的清理逻辑）
        if (key.startsWith('concurrency:queue:')) {
          continue
        }

        // 检查键类型
        const keyType = await client.type(key)
        if (keyType !== 'zset') {
          // 非 zset 类型的遗留键，直接删除
          await client.del(key)
          legacyCleaned++
          cleanedKeys.push({
            key,
            cleanedCount: 0,
            type: keyType,
            legacy: true
          })
          continue
        }

        // 只清理过期的条目
        const cleaned = await client.zremrangebyscore(key, '-inf', now)
        if (cleaned > 0) {
          totalCleaned += cleaned
          cleanedKeys.push({
            key,
            cleanedCount: cleaned
          })
        }

        // 如果 key 为空，删除它
        const remaining = await client.zcard(key)
        if (remaining === 0) {
          await client.del(key)
        }
      }

      logger.info(
        `🧹 Cleaned up expired concurrency: ${totalCleaned} entries from ${cleanedKeys.length} keys, ${legacyCleaned} legacy keys removed`
      )

      return {
        keysProcessed: keys.length,
        keysCleaned: cleanedKeys.length,
        totalEntriesCleaned: totalCleaned,
        legacyKeysRemoved: legacyCleaned,
        cleanedKeys,
        success: true
      }
    } catch (error) {
      logger.error('❌ Failed to cleanup expired concurrency:', error)
      throw error
    }
  }
}

module.exports = { attach }
