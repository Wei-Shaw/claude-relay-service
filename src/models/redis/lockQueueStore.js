// ============================================================================
// 分布式锁 + 用户消息队列方法（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 注意：时区辅助函数别名（getDateInTimezone 等）仍留在 redis.js（引用其顶层 import）。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys } = require('../../constants/redisKeys')

function attach(redisClient) {
  // 分布式锁相关方法
  redisClient.setAccountLock = async function (lockKey, lockValue, ttlMs) {
    try {
      // 使用SET NX PX实现原子性的锁获取
      // ioredis语法: set(key, value, 'PX', milliseconds, 'NX')
      const result = await this.client.set(lockKey, lockValue, 'PX', ttlMs, 'NX')
      return result === 'OK'
    } catch (error) {
      logger.error(`Failed to acquire lock ${lockKey}:`, error)
      return false
    }
  }

  redisClient.releaseAccountLock = async function (lockKey, lockValue) {
    try {
      // 使用Lua脚本确保只有持有锁的进程才能释放锁
      const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
      // ioredis语法: eval(script, numberOfKeys, key1, key2, ..., arg1, arg2, ...)
      const result = await this.client.eval(script, 1, lockKey, lockValue)
      return result === 1
    } catch (error) {
      logger.error(`Failed to release lock ${lockKey}:`, error)
      return false
    }
  }

  // ============== 用户消息队列相关方法 ==============

  /**
   * 尝试获取用户消息队列锁
   * 使用 Lua 脚本保证原子性
   * @param {string} accountId - 账户ID
   * @param {string} requestId - 请求ID
   * @param {number} lockTtlMs - 锁 TTL（毫秒）
   * @param {number} delayMs - 请求间隔（毫秒）
   * @returns {Promise<{acquired: boolean, waitMs: number}>}
   *   - acquired: 是否成功获取锁
   *   - waitMs: 需要等待的毫秒数（-1表示被占用需等待，>=0表示需要延迟的毫秒数）
   */
  redisClient.acquireUserMessageLock = async function (accountId, requestId, lockTtlMs, delayMs) {
    const lockKey = RedisKeys.userMsgQueue.lock(accountId)
    const lastTimeKey = RedisKeys.userMsgQueue.last(accountId)

    const script = `
    local lockKey = KEYS[1]
    local lastTimeKey = KEYS[2]
    local requestId = ARGV[1]
    local lockTtl = tonumber(ARGV[2])
    local delayMs = tonumber(ARGV[3])

    -- 检查锁是否空闲
    local currentLock = redis.call('GET', lockKey)
    if currentLock == false then
      -- 检查是否需要延迟
      local lastTime = redis.call('GET', lastTimeKey)
      local now = redis.call('TIME')
      local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)

      if lastTime then
        local elapsed = nowMs - tonumber(lastTime)
        if elapsed < delayMs then
          -- 需要等待的毫秒数
          return {0, delayMs - elapsed}
        end
      end

      -- 获取锁
      redis.call('SET', lockKey, requestId, 'PX', lockTtl)
      return {1, 0}
    end

    -- 锁被占用，返回等待
    return {0, -1}
  `

    try {
      const result = await this.client.eval(
        script,
        2,
        lockKey,
        lastTimeKey,
        requestId,
        lockTtlMs,
        delayMs
      )
      return {
        acquired: result[0] === 1,
        waitMs: result[1]
      }
    } catch (error) {
      logger.error(`Failed to acquire user message lock for account ${accountId}:`, error)
      // 返回 redisError 标记，让上层能区分 Redis 故障和正常锁占用
      return { acquired: false, waitMs: -1, redisError: true, errorMessage: error.message }
    }
  }

  /**
   * 释放用户消息队列锁并记录完成时间
   * @param {string} accountId - 账户ID
   * @param {string} requestId - 请求ID
   * @returns {Promise<boolean>} 是否成功释放
   */
  redisClient.releaseUserMessageLock = async function (accountId, requestId) {
    const lockKey = RedisKeys.userMsgQueue.lock(accountId)
    const lastTimeKey = RedisKeys.userMsgQueue.last(accountId)

    const script = `
    local lockKey = KEYS[1]
    local lastTimeKey = KEYS[2]
    local requestId = ARGV[1]

    -- 验证锁持有者
    local currentLock = redis.call('GET', lockKey)
    if currentLock == requestId then
      -- 记录完成时间
      local now = redis.call('TIME')
      local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
      redis.call('SET', lastTimeKey, nowMs, 'EX', 60)  -- 60秒后过期

      -- 删除锁
      redis.call('DEL', lockKey)
      return 1
    end
    return 0
  `

    try {
      const result = await this.client.eval(script, 2, lockKey, lastTimeKey, requestId)
      return result === 1
    } catch (error) {
      logger.error(`Failed to release user message lock for account ${accountId}:`, error)
      return false
    }
  }

  /**
   * 强制释放用户消息队列锁（用于清理孤儿锁）
   * @param {string} accountId - 账户ID
   * @returns {Promise<boolean>} 是否成功释放
   */
  redisClient.forceReleaseUserMessageLock = async function (accountId) {
    const lockKey = RedisKeys.userMsgQueue.lock(accountId)

    try {
      await this.client.del(lockKey)
      return true
    } catch (error) {
      logger.error(`Failed to force release user message lock for account ${accountId}:`, error)
      return false
    }
  }

  /**
   * 获取用户消息队列统计信息（用于调试）
   * @param {string} accountId - 账户ID
   * @returns {Promise<Object>} 队列统计
   */
  redisClient.getUserMessageQueueStats = async function (accountId) {
    const lockKey = RedisKeys.userMsgQueue.lock(accountId)
    const lastTimeKey = RedisKeys.userMsgQueue.last(accountId)

    try {
      const [lockHolder, lastTime, lockTtl] = await Promise.all([
        this.client.get(lockKey),
        this.client.get(lastTimeKey),
        this.client.pttl(lockKey)
      ])

      return {
        accountId,
        isLocked: !!lockHolder,
        lockHolder,
        lockTtlMs: lockTtl > 0 ? lockTtl : 0,
        lockTtlRaw: lockTtl, // 原始 PTTL 值：>0 有TTL，-1 无过期时间，-2 键不存在
        lastCompletedAt: lastTime ? new Date(parseInt(lastTime)).toISOString() : null
      }
    } catch (error) {
      logger.error(`Failed to get user message queue stats for account ${accountId}:`, error)
      return {
        accountId,
        isLocked: false,
        lockHolder: null,
        lockTtlMs: 0,
        lockTtlRaw: -2,
        lastCompletedAt: null
      }
    }
  }

  /**
   * 扫描所有用户消息队列锁（用于清理任务）
   * @returns {Promise<string[]>} 账户ID列表
   */
  redisClient.scanUserMessageQueueLocks = async function () {
    const accountIds = []
    let cursor = '0'
    let iterations = 0
    const MAX_ITERATIONS = 1000 // 防止无限循环

    try {
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          RedisKeys.userMsgQueue.lockPattern,
          'COUNT',
          100
        )
        cursor = newCursor
        iterations++

        for (const key of keys) {
          const accountId = key.replace('user_msg_queue_lock:', '')
          accountIds.push(accountId)
        }

        // 防止无限循环
        if (iterations >= MAX_ITERATIONS) {
          logger.warn(
            `📬 User message queue: SCAN reached max iterations (${MAX_ITERATIONS}), stopping early`,
            { foundLocks: accountIds.length }
          )
          break
        }
      } while (cursor !== '0')

      if (accountIds.length > 0) {
        logger.debug(
          `📬 User message queue: scanned ${accountIds.length} lock(s) in ${iterations} iteration(s)`
        )
      }

      return accountIds
    } catch (error) {
      logger.error('Failed to scan user message queue locks:', error)
      return []
    }
  }
}

module.exports = { attach }
