const Redis = require('ioredis')
const config = require('../../config/config')
const logger = require('../utils/logger')
const {
  getDateInTimezone,
  getDateStringInTimezone,
  getHourInTimezone,
  getWeekStringInTimezone,
  getPeriodString,
  getNextResetTime,
  getPeriodStartDate
} = require('../utils/timezone')
const { RedisKeys, TTL } = require('../constants/redisKeys')

class RedisClient {
  constructor() {
    this.client = null
    this.isConnected = false
  }

  async connect() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        lazyConnect: config.redis.lazyConnect,
        tls: config.redis.enableTLS ? {} : false
      })

      this.client.on('connect', () => {
        this.isConnected = true
        logger.info('🔗 Redis connected successfully')
      })

      this.client.on('error', (err) => {
        this.isConnected = false
        logger.error('❌ Redis connection error:', err)
      })

      this.client.on('close', () => {
        this.isConnected = false
        logger.warn('⚠️  Redis connection closed')
      })

      // 只有在 lazyConnect 模式下才需要手动调用 connect()
      // 如果 Redis 已经连接或正在连接中，则跳过
      if (
        this.client.status !== 'connecting' &&
        this.client.status !== 'connect' &&
        this.client.status !== 'ready'
      ) {
        await this.client.connect()
      } else {
        // 等待 ready 状态
        await new Promise((resolve, reject) => {
          if (this.client.status === 'ready') {
            resolve()
          } else {
            this.client.once('ready', resolve)
            this.client.once('error', reject)
          }
        })
      }
      return this.client
    } catch (error) {
      logger.error('💥 Failed to connect to Redis:', error)
      throw error
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit()
      this.isConnected = false
      logger.info('👋 Redis disconnected')
    }
  }

  getClient() {
    if (!this.client || !this.isConnected) {
      logger.warn('⚠️ Redis client is not connected')
      return null
    }
    return this.client
  }

  // 安全获取客户端（用于关键操作）
  getClientSafe() {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected')
    }
    return this.client
  }

  /**
   * 使用 SCAN 获取所有 API Key ID（避免 KEYS 命令阻塞）
   * @returns {Promise<string[]>} API Key ID 列表（已去重）
   */

  /**
   * 获取所有 API Key 的标签（去重排序）。
   * 不走 tags:all 快路径：tags:all 是派生缓存，若漂移成"缺真标签"会被静默当完整结果返回
   * （scard 只能滤掉多余的死标签、滤不出缺失的真标签，且非空就不再回退）。
   * 故索引就绪时按 idx:all 的 keyId 现算 live key 真实 tags（_extractTagsFromKeyIds 过滤 isDeleted），
   * 不依赖 tags:all 完整性（只信 idx:all 成员，由漂移检测维护）；未就绪 / 空则全量 SCAN（最权威）。
   * @returns {Promise<string[]>} 去重排序后的标签列表
   */

  /**
   * 检查索引是否就绪
   */

  /**
   * 批量获取 API Key 数据（使用 Pipeline 优化）
   * @param {string[]} keyIds - API Key ID 列表
   * @returns {Promise<Object[]>} API Key 数据列表
   */

  /**
   * 解析 API Key 数据，将字符串转换为正确的类型
   * @param {Object} data - 原始数据
   * @returns {Object} 解析后的数据
   */

  /**
   * 获取 API Keys 分页数据（不含费用，用于优化列表加载）
   * @param {Object} options - 分页和筛选选项
   * @returns {Promise<{items: Object[], pagination: Object, availableTags: string[]}>}
   */

  /**
   * 获取使用了指定模型的 Key IDs（OR 逻辑）
   * 使用 EXISTS + pipeline 批量检查 alltime 键，避免 KEYS 全量扫描
   * 支持分批处理和 fallback 到 SCAN 模式
   */

  /**
   * 获取所有被使用过的模型列表
   */

  // 账户 CRUD（Claude/Droid/OpenAI）— 已抽出至 ./redis/accountStore.js
  // attach 在单例创建后调用（见文件末尾装配区）

  // 💰 账户余额缓存（API 查询结果）
  async setAccountBalance(platform, accountId, balanceData, ttl = TTL.accountBalance) {
    const key = RedisKeys.account.balance(platform, accountId)

    const payload = {
      balance:
        balanceData && balanceData.balance !== null && balanceData.balance !== undefined
          ? String(balanceData.balance)
          : '',
      currency: balanceData?.currency || 'USD',
      lastRefreshAt: balanceData?.lastRefreshAt || new Date().toISOString(),
      queryMethod: balanceData?.queryMethod || 'api',
      status: balanceData?.status || 'success',
      errorMessage: balanceData?.errorMessage || balanceData?.error || '',
      rawData: balanceData?.rawData ? JSON.stringify(balanceData.rawData) : '',
      quota: balanceData?.quota ? JSON.stringify(balanceData.quota) : ''
    }

    await this.client.hset(key, payload)
    await this.client.expire(key, ttl)
  }

  async getAccountBalance(platform, accountId) {
    const key = RedisKeys.account.balance(platform, accountId)
    const [data, ttlSeconds] = await Promise.all([this.client.hgetall(key), this.client.ttl(key)])

    if (!data || Object.keys(data).length === 0) {
      return null
    }

    let rawData = null
    if (data.rawData) {
      try {
        rawData = JSON.parse(data.rawData)
      } catch (error) {
        rawData = null
      }
    }

    let quota = null
    if (data.quota) {
      try {
        quota = JSON.parse(data.quota)
      } catch (error) {
        quota = null
      }
    }

    return {
      balance: data.balance ? parseFloat(data.balance) : null,
      currency: data.currency || 'USD',
      lastRefreshAt: data.lastRefreshAt || null,
      queryMethod: data.queryMethod || null,
      status: data.status || null,
      errorMessage: data.errorMessage || '',
      rawData,
      quota,
      ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : null
    }
  }

  // 📊 账户余额缓存（本地统计）
  async setLocalBalance(platform, accountId, statisticsData, ttl = TTL.accountBalanceLocal) {
    const key = RedisKeys.account.balanceLocal(platform, accountId)

    await this.client.hset(key, {
      estimatedBalance: JSON.stringify(statisticsData || {}),
      lastCalculated: new Date().toISOString()
    })
    await this.client.expire(key, ttl)
  }

  async getLocalBalance(platform, accountId) {
    const key = RedisKeys.account.balanceLocal(platform, accountId)
    const data = await this.client.hgetall(key)

    if (!data || !data.estimatedBalance) {
      return null
    }

    try {
      return JSON.parse(data.estimatedBalance)
    } catch (error) {
      return null
    }
  }

  async deleteAccountBalance(platform, accountId) {
    const key = RedisKeys.account.balance(platform, accountId)
    const localKey = RedisKeys.account.balanceLocal(platform, accountId)
    await this.client.del(key, localKey)
  }

  // 🧩 账户余额脚本配置
  async setBalanceScriptConfig(platform, accountId, scriptConfig) {
    const key = RedisKeys.account.balanceScript(platform, accountId)
    await this.client.set(key, JSON.stringify(scriptConfig || {}))
  }

  async getBalanceScriptConfig(platform, accountId) {
    const key = RedisKeys.account.balanceScript(platform, accountId)
    const raw = await this.client.get(key)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch (error) {
      return null
    }
  }

  async deleteBalanceScriptConfig(platform, accountId) {
    const key = RedisKeys.account.balanceScript(platform, accountId)
    return await this.client.del(key)
  }

  // 🧹 清理过期数据（使用 scanKeys 替代 keys）
  async cleanup() {
    try {
      const patterns = [
        RedisKeys.usage.dailyPattern,
        RedisKeys.rateLimit.pattern,
        RedisKeys.session.adminPattern,
        RedisKeys.session.stickyPattern,
        RedisKeys.session.oauthPattern
      ]

      for (const pattern of patterns) {
        const keys = await this.scanKeys(pattern)
        const pipeline = this.client.pipeline()

        for (const key of keys) {
          const ttl = await this.client.ttl(key)
          if (ttl === -1) {
            // 没有设置过期时间的键
            if (key.startsWith('oauth:')) {
              pipeline.expire(key, TTL.oauthSession) // OAuth会话设置10分钟过期
            } else {
              pipeline.expire(key, TTL.oauthCleanupOther) // 其他设置1天过期
            }
          }
        }

        await pipeline.exec()
      }

      logger.info('🧹 Redis cleanup completed')
    } catch (error) {
      logger.error('❌ Redis cleanup failed:', error)
    }
  }

  // 🔧 并发管理方法（用于管理员手动清理）

  /**
   * 获取所有并发状态（使用 scanKeys 替代 keys）
   * @returns {Promise<Array>} 并发状态列表
   */

  /**
   * 获取特定 API Key 的并发状态详情
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<Object>} 并发状态详情
   */

  /**
   * 强制清理特定 API Key 的并发计数（忽略租约）
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<Object>} 清理结果
   */

  /**
   * 强制清理所有并发计数（使用 scanKeys 替代 keys）
   * @returns {Promise<Object>} 清理结果
   */

  /**
   * 清理过期的并发条目（不影响活跃请求，使用 scanKeys 替代 keys）
   * @param {string} apiKeyId - API Key ID（可选，不传则清理所有）
   * @returns {Promise<Object>} 清理结果
   */

  // 🔧 Basic Redis operations wrapper methods for convenience
  async get(key) {
    const client = this.getClientSafe()
    return await client.get(key)
  }

  async set(key, value, ...args) {
    const client = this.getClientSafe()
    return await client.set(key, value, ...args)
  }

  async setex(key, ttl, value) {
    const client = this.getClientSafe()
    return await client.setex(key, ttl, value)
  }

  async del(...keys) {
    const client = this.getClientSafe()
    return await client.del(...keys)
  }

  async keys(pattern) {
    const client = this.getClientSafe()
    return await client.keys(pattern)
  }
}

const redisClient = new RedisClient()

// 分布式锁 + 用户消息队列 — 已抽出至 ./redis/lockQueueStore.js（attach 挂同一单例）
require('./redis/lockQueueStore').attach(redisClient)

// 导出时区辅助函数 — 注入系统配置时区偏移，避免各调用点漏传 offset 退回硬编码 +8
const tzOffset = config.system.timezoneOffset
redisClient.getDateInTimezone = (date) => getDateInTimezone(date, tzOffset)
redisClient.getDateStringInTimezone = (date) => getDateStringInTimezone(date, tzOffset)
redisClient.getHourInTimezone = (date) => getHourInTimezone(date, tzOffset)
redisClient.getWeekStringInTimezone = (date) => getWeekStringInTimezone(date, tzOffset)
redisClient.getPeriodString = (resetDay, resetHour, date) =>
  getPeriodString(resetDay, resetHour, date, tzOffset)
redisClient.getNextResetTime = (resetDay, resetHour) =>
  getNextResetTime(resetDay, resetHour, tzOffset)
redisClient.getPeriodStartDate = (resetDay, resetHour, date) =>
  getPeriodStartDate(resetDay, resetHour, date, tzOffset)

// ============================================
// 🚦 API Key 并发请求排队 — 已抽出至 ./redis/concurrencyQueueStore.js（attach 挂同一单例）
// ============================================
require('./redis/concurrencyQueueStore').attach(redisClient)

// ============================================================================
// 账户测试历史相关操作 — 已抽出至 ./redis/accountTestStore.js（attach 挂同一单例）
// ============================================================================
require('./redis/accountTestStore').attach(redisClient)

// ============================================================================
// SCAN/批量/索引辅助 — 已抽出至 ./redis/scanBatchStore.js（attach 挂同一单例）
// ============================================================================
require('./redis/scanBatchStore').attach(redisClient)

// ============================================
// 全局统计/数据迁移/系统指标 — 已抽出至 ./redis/globalStatsStore.js（attach 挂同一单例）
// ============================================
require('./redis/globalStatsStore').attach(redisClient)

// ============== 代理池相关方法 ==============
// 已按域抽出至 ./redis/proxyStore.js；attach 挂到同一单例（this 绑定不变）。
require('./redis/proxyStore').attach(redisClient)

// ============================================================================
// 账户 CRUD（Claude/Droid/OpenAI）— 已抽出至 ./redis/accountStore.js（attach 挂同一单例）
// ============================================================================
require('./redis/accountStore').attach(redisClient)

// 会话/OAuth/会话映射 — 已抽出至 ./redis/sessionStore.js
require('./redis/sessionStore').attach(redisClient)

// 系统统计/实时指标 — 已抽出至 ./redis/systemStatsStore.js
require('./redis/systemStatsStore').attach(redisClient)

// API Key/Console 并发控制 — 已抽出至 ./redis/concurrencyStore.js
require('./redis/concurrencyStore').attach(redisClient)

// 成本统计 — 已抽出至 ./redis/costStatsStore.js
require('./redis/costStatsStore').attach(redisClient)

// 用量统计 — 已抽出至 ./redis/usageStatsStore.js
require('./redis/usageStatsStore').attach(redisClient)

// API Key CRUD/标签/分页 — 已抽出至 ./redis/apiKeyStore.js
require('./redis/apiKeyStore').attach(redisClient)

// 启动期数据迁移 — 已抽出至 ./redis/migrationStore.js
require('./redis/migrationStore').attach(redisClient)

module.exports = redisClient
