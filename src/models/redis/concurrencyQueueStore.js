// ============================================================================
// 🚦 API Key 并发请求排队方法（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL, LIMITS } = require('../../constants/redisKeys')

// 并发队列相关常量（仅本域使用，随域迁出，定义逐字保留）
const QUEUE_STATS_TTL_SECONDS = TTL.queueStats // 统计计数保留 7 天
const WAIT_TIME_TTL_SECONDS = TTL.waitTime // 等待时间样本保留 1 天（滚动窗口，无需长期保留）
// 等待时间样本数配置（提高统计置信度）
// - 每 API Key 从 100 提高到 500：提供更稳定的 P99 估计
// - 全局从 500 提高到 2000：支持更高精度的 P99.9 分析
// - 内存开销约 12-20KB（Redis quicklist 每元素 1-10 字节），可接受
// 详见 design.md Decision 5: 等待时间统计样本数
const WAIT_TIME_SAMPLES_PER_KEY = LIMITS.waitTimesPerKey // 每个 API Key 保留的等待时间样本数
const WAIT_TIME_SAMPLES_GLOBAL = LIMITS.waitTimesGlobal // 全局保留的等待时间样本数
const QUEUE_TTL_BUFFER_SECONDS = 30 // 排队计数器TTL缓冲时间

function attach(redisClient) {
  /**
   * 增加排队计数（使用 Lua 脚本确保原子性）
   * @param {string} apiKeyId - API Key ID
   * @param {number} [timeoutMs=60000] - 排队超时时间（毫秒），用于计算 TTL
   * @returns {Promise<number>} 增加后的排队数量
   */
  redisClient.incrConcurrencyQueue = async function (apiKeyId, timeoutMs = 60000) {
    const key = RedisKeys.concurrency.queue(apiKeyId)
    try {
      // 使用 Lua 脚本确保 INCR 和 EXPIRE 原子执行，防止进程崩溃导致计数器泄漏
      // TTL = 超时时间 + 缓冲时间（确保键不会在请求还在等待时过期）
      const ttlSeconds = Math.ceil(timeoutMs / 1000) + QUEUE_TTL_BUFFER_SECONDS
      const script = `
      local count = redis.call('INCR', KEYS[1])
      redis.call('EXPIRE', KEYS[1], ARGV[1])
      return count
    `
      const count = await this.client.eval(script, 1, key, String(ttlSeconds))
      logger.database(
        `🚦 Incremented queue count for key ${apiKeyId}: ${count} (TTL: ${ttlSeconds}s)`
      )
      return parseInt(count)
    } catch (error) {
      logger.error(`Failed to increment concurrency queue for ${apiKeyId}:`, error)
      throw error
    }
  }

  /**
   * 减少排队计数（使用 Lua 脚本确保原子性）
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<number>} 减少后的排队数量
   */
  redisClient.decrConcurrencyQueue = async function (apiKeyId) {
    const key = RedisKeys.concurrency.queue(apiKeyId)
    try {
      // 使用 Lua 脚本确保 DECR 和 DEL 原子执行，防止进程崩溃导致计数器残留
      const script = `
      local count = redis.call('DECR', KEYS[1])
      if count <= 0 then
        redis.call('DEL', KEYS[1])
        return 0
      end
      return count
    `
      const count = await this.client.eval(script, 1, key)
      const result = parseInt(count)
      if (result === 0) {
        logger.database(`🚦 Queue count for key ${apiKeyId} is 0, removed key`)
      } else {
        logger.database(`🚦 Decremented queue count for key ${apiKeyId}: ${result}`)
      }
      return result
    } catch (error) {
      logger.error(`Failed to decrement concurrency queue for ${apiKeyId}:`, error)
      throw error
    }
  }

  /**
   * 获取排队计数
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<number>} 当前排队数量
   */
  redisClient.getConcurrencyQueueCount = async function (apiKeyId) {
    const key = RedisKeys.concurrency.queue(apiKeyId)
    try {
      const count = await this.client.get(key)
      return parseInt(count || 0)
    } catch (error) {
      logger.error(`Failed to get concurrency queue count for ${apiKeyId}:`, error)
      return 0
    }
  }

  /**
   * 清空排队计数
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<boolean>} 是否成功清空
   */
  redisClient.clearConcurrencyQueue = async function (apiKeyId) {
    const key = RedisKeys.concurrency.queue(apiKeyId)
    try {
      await this.client.del(key)
      logger.database(`🚦 Cleared queue count for key ${apiKeyId}`)
      return true
    } catch (error) {
      logger.error(`Failed to clear concurrency queue for ${apiKeyId}:`, error)
      return false
    }
  }

  /**
   * 扫描所有排队计数器
   * @returns {Promise<string[]>} API Key ID 列表
   */
  redisClient.scanConcurrencyQueueKeys = async function () {
    const apiKeyIds = []
    let cursor = '0'
    let iterations = 0
    const MAX_ITERATIONS = 1000

    try {
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          RedisKeys.concurrency.queuePattern,
          'COUNT',
          100
        )
        cursor = newCursor
        iterations++

        for (const key of keys) {
          // 排除统计和等待时间相关的键
          if (
            key.startsWith('concurrency:queue:stats:') ||
            key.startsWith('concurrency:queue:wait_times:')
          ) {
            continue
          }
          const apiKeyId = key.replace('concurrency:queue:', '')
          apiKeyIds.push(apiKeyId)
        }

        if (iterations >= MAX_ITERATIONS) {
          logger.warn(
            `🚦 Concurrency queue: SCAN reached max iterations (${MAX_ITERATIONS}), stopping early`,
            { foundQueues: apiKeyIds.length }
          )
          break
        }
      } while (cursor !== '0')

      return apiKeyIds
    } catch (error) {
      logger.error('Failed to scan concurrency queue keys:', error)
      return []
    }
  }

  /**
   * 清理所有排队计数器（用于服务重启）
   * @returns {Promise<number>} 清理的计数器数量
   */
  redisClient.clearAllConcurrencyQueues = async function () {
    let cleared = 0
    let cursor = '0'
    let iterations = 0
    const MAX_ITERATIONS = 1000

    try {
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          RedisKeys.concurrency.queuePattern,
          'COUNT',
          100
        )
        cursor = newCursor
        iterations++

        // 只删除排队计数器，保留统计数据
        const queueKeys = keys.filter(
          (key) =>
            !key.startsWith('concurrency:queue:stats:') &&
            !key.startsWith('concurrency:queue:wait_times:')
        )

        if (queueKeys.length > 0) {
          await this.client.del(...queueKeys)
          cleared += queueKeys.length
        }

        if (iterations >= MAX_ITERATIONS) {
          break
        }
      } while (cursor !== '0')

      if (cleared > 0) {
        logger.info(`🚦 Cleared ${cleared} concurrency queue counter(s) on startup`)
      }
      return cleared
    } catch (error) {
      logger.error('Failed to clear all concurrency queues:', error)
      return 0
    }
  }

  /**
   * 增加排队统计计数（使用 Lua 脚本确保原子性）
   * @param {string} apiKeyId - API Key ID
   * @param {string} field - 统计字段 (entered/success/timeout/cancelled)
   * @returns {Promise<number>} 增加后的计数
   */
  redisClient.incrConcurrencyQueueStats = async function (apiKeyId, field) {
    const key = RedisKeys.concurrency.queueStats(apiKeyId)
    try {
      // 使用 Lua 脚本确保 HINCRBY 和 EXPIRE 原子执行
      // 防止在两者之间崩溃导致统计键没有 TTL（内存泄漏）
      const script = `
      local count = redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
      redis.call('EXPIRE', KEYS[1], ARGV[2])
      return count
    `
      const count = await this.client.eval(script, 1, key, field, String(QUEUE_STATS_TTL_SECONDS))
      return parseInt(count)
    } catch (error) {
      logger.error(`Failed to increment queue stats ${field} for ${apiKeyId}:`, error)
      return 0
    }
  }

  /**
   * 获取排队统计
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<Object>} 统计数据
   */
  redisClient.getConcurrencyQueueStats = async function (apiKeyId) {
    const key = RedisKeys.concurrency.queueStats(apiKeyId)
    try {
      const stats = await this.client.hgetall(key)
      return {
        entered: parseInt(stats?.entered || 0),
        success: parseInt(stats?.success || 0),
        timeout: parseInt(stats?.timeout || 0),
        cancelled: parseInt(stats?.cancelled || 0),
        socket_changed: parseInt(stats?.socket_changed || 0),
        rejected_overload: parseInt(stats?.rejected_overload || 0)
      }
    } catch (error) {
      logger.error(`Failed to get queue stats for ${apiKeyId}:`, error)
      return {
        entered: 0,
        success: 0,
        timeout: 0,
        cancelled: 0,
        socket_changed: 0,
        rejected_overload: 0
      }
    }
  }

  /**
   * 记录排队等待时间（按 API Key 分开存储）
   * @param {string} apiKeyId - API Key ID
   * @param {number} waitTimeMs - 等待时间（毫秒）
   * @returns {Promise<void>}
   */
  redisClient.recordQueueWaitTime = async function (apiKeyId, waitTimeMs) {
    const key = RedisKeys.concurrency.queueWaitTimes(apiKeyId)
    try {
      // 使用 Lua 脚本确保原子性，同时设置 TTL 防止内存泄漏
      const script = `
      redis.call('LPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], 0, ARGV[2])
      redis.call('EXPIRE', KEYS[1], ARGV[3])
      return 1
    `
      await this.client.eval(
        script,
        1,
        key,
        waitTimeMs,
        WAIT_TIME_SAMPLES_PER_KEY - 1,
        WAIT_TIME_TTL_SECONDS
      )
    } catch (error) {
      logger.error(`Failed to record queue wait time for ${apiKeyId}:`, error)
    }
  }

  /**
   * 记录全局排队等待时间
   * @param {number} waitTimeMs - 等待时间（毫秒）
   * @returns {Promise<void>}
   */
  redisClient.recordGlobalQueueWaitTime = async function (waitTimeMs) {
    const key = RedisKeys.concurrency.queueWaitTimesGlobal
    try {
      // 使用 Lua 脚本确保原子性，同时设置 TTL 防止内存泄漏
      const script = `
      redis.call('LPUSH', KEYS[1], ARGV[1])
      redis.call('LTRIM', KEYS[1], 0, ARGV[2])
      redis.call('EXPIRE', KEYS[1], ARGV[3])
      return 1
    `
      await this.client.eval(
        script,
        1,
        key,
        waitTimeMs,
        WAIT_TIME_SAMPLES_GLOBAL - 1,
        WAIT_TIME_TTL_SECONDS
      )
    } catch (error) {
      logger.error('Failed to record global queue wait time:', error)
    }
  }

  /**
   * 获取全局等待时间列表
   * @returns {Promise<number[]>} 等待时间列表
   */
  redisClient.getGlobalQueueWaitTimes = async function () {
    const key = RedisKeys.concurrency.queueWaitTimesGlobal
    try {
      const samples = await this.client.lrange(key, 0, -1)
      return samples.map(Number)
    } catch (error) {
      logger.error('Failed to get global queue wait times:', error)
      return []
    }
  }

  /**
   * 获取指定 API Key 的等待时间列表
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<number[]>} 等待时间列表
   */
  redisClient.getQueueWaitTimes = async function (apiKeyId) {
    const key = RedisKeys.concurrency.queueWaitTimes(apiKeyId)
    try {
      const samples = await this.client.lrange(key, 0, -1)
      return samples.map(Number)
    } catch (error) {
      logger.error(`Failed to get queue wait times for ${apiKeyId}:`, error)
      return []
    }
  }

  /**
   * 扫描所有排队统计键
   * @returns {Promise<string[]>} API Key ID 列表
   */
  redisClient.scanConcurrencyQueueStatsKeys = async function () {
    const apiKeyIds = []
    let cursor = '0'
    let iterations = 0
    const MAX_ITERATIONS = 1000

    try {
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          RedisKeys.concurrency.queueStatsPattern,
          'COUNT',
          100
        )
        cursor = newCursor
        iterations++

        for (const key of keys) {
          const apiKeyId = key.replace('concurrency:queue:stats:', '')
          apiKeyIds.push(apiKeyId)
        }

        if (iterations >= MAX_ITERATIONS) {
          break
        }
      } while (cursor !== '0')

      return apiKeyIds
    } catch (error) {
      logger.error('Failed to scan concurrency queue stats keys:', error)
      return []
    }
  }
}

module.exports = { attach }
