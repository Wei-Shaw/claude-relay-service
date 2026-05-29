/**
 * 费用排序索引服务
 *
 * 为 API Keys 提供按费用排序的功能，使用 Redis Sorted Set 预计算排序索引
 * 支持 today/7days/30days/all 四种固定时间范围的预计算索引
 * 支持 custom 时间范围的实时计算
 *
 * 设计原则：
 * - 只计算未删除的 API Key
 * - 使用原子操作避免竞态条件
 * - 提供增量更新接口供 API Key 创建/删除时调用
 */

const redis = require('../models/redis')
const logger = require('../utils/logger')
const usageStatsService = require('./usageStatsService')

// ============================================================================
// 常量配置
// ============================================================================

/** 时间范围更新间隔配置（省资源模式） */
const UPDATE_INTERVALS = {
  today: 10 * 60 * 1000, // 10分钟
  '7days': 30 * 60 * 1000, // 30分钟
  '30days': 60 * 60 * 1000, // 1小时
  all: 2 * 60 * 60 * 1000 // 2小时
}

/** 支持的时间范围列表 */
const VALID_TIME_RANGES = ['today', '7days', '30days', 'all']

/** 分布式锁超时时间（秒） */
const LOCK_TTL = 300

/** 批处理大小 */
const BATCH_SIZE = 100

// ============================================================================
// Redis Key 生成器（集中管理 key 格式）
// ============================================================================

const RedisKeys = {
  /** 费用排序索引 Sorted Set */
  rankKey: (timeRange) => `cost_rank:${timeRange}`,

  /** 临时索引 key（用于原子替换） */
  tempRankKey: (timeRange) => `cost_rank:${timeRange}:temp:${Date.now()}`,

  /** 索引元数据 Hash */
  metaKey: (timeRange) => `cost_rank_meta:${timeRange}`,

  /** 更新锁 */
  lockKey: (timeRange) => `cost_rank_lock:${timeRange}`,

  /** 每日费用 */
  dailyCost: (keyId, date) => `usage:cost:daily:${keyId}:${date}`,

  /** 总费用 */
  totalCost: (keyId) => `usage:cost:total:${keyId}`
}

// ============================================================================
// CostRankService 类
// ============================================================================

class CostRankService {
  constructor() {
    this.timers = {}
    this.isInitialized = false
  }

  // --------------------------------------------------------------------------
  // 生命周期管理
  // --------------------------------------------------------------------------

  /**
   * 初始化服务：启动定时任务
   * 幂等设计：多次调用只会初始化一次
   */
  async initialize() {
    // 先清理可能存在的旧定时器（支持热重载）
    this._clearAllTimers()

    if (this.isInitialized) {
      logger.warn('CostRankService already initialized, re-initializing...')
    }

    logger.info('🔄 Initializing CostRankService...')

    try {
      if (usageStatsService.shouldReadPostgres()) {
        this.isInitialized = true
        logger.success('CostRankService initialized in PostgreSQL read mode')
        return
      }

      // 启动时立即更新所有索引（异步，不阻塞启动）
      this.updateAllRanks().catch((err) => {
        logger.error('Failed to initialize cost ranks:', err)
      })

      // 设置定时更新
      for (const [timeRange, interval] of Object.entries(UPDATE_INTERVALS)) {
        this.timers[timeRange] = setInterval(() => {
          this.updateRank(timeRange).catch((err) => {
            logger.error(`Failed to update cost rank for ${timeRange}:`, err)
          })
        }, interval)
      }

      this.isInitialized = true
      logger.success('CostRankService initialized')
    } catch (error) {
      logger.error('❌ Failed to initialize CostRankService:', error)
      throw error
    }
  }

  /**
   * 关闭服务：清理定时器
   */
  shutdown() {
    this._clearAllTimers()
    this.isInitialized = false
    logger.info('CostRankService shutdown')
  }

  /**
   * 清理所有定时器
   * @private
   */
  _clearAllTimers() {
    for (const timer of Object.values(this.timers)) {
      clearInterval(timer)
    }
    this.timers = {}
  }

  // --------------------------------------------------------------------------
  // 索引更新（全量）
  // --------------------------------------------------------------------------

  /**
   * 更新所有时间范围的索引
   */
  async updateAllRanks() {
    for (const timeRange of VALID_TIME_RANGES) {
      try {
        await this.updateRank(timeRange)
      } catch (error) {
        logger.error(`Failed to update rank for ${timeRange}:`, error)
      }
    }
  }

  /**
   * 更新指定时间范围的排序索引
   * @param {string} timeRange - 时间范围
   */
  async updateRank(timeRange) {
    if (usageStatsService.shouldReadPostgres()) {
      logger.debug(`Skipping Redis cost rank update for ${timeRange} in PostgreSQL read mode`)
      return
    }

    const client = redis.getClient()
    if (!client) {
      logger.warn('Redis client not available, skipping cost rank update')
      return
    }

    const lockKey = RedisKeys.lockKey(timeRange)
    const rankKey = RedisKeys.rankKey(timeRange)
    const metaKey = RedisKeys.metaKey(timeRange)

    // 获取分布式锁
    const acquired = await client.set(lockKey, '1', 'NX', 'EX', LOCK_TTL)
    if (!acquired) {
      logger.debug(`Skipping ${timeRange} rank update - another update in progress`)
      return
    }

    const startTime = Date.now()

    try {
      // 标记为更新中
      await client.hset(metaKey, 'status', 'updating')

      // 1. 获取所有未删除的 API Key IDs
      const keyIds = await this._getActiveApiKeyIds()

      if (keyIds.length === 0) {
        // 无数据时清空索引
        await client.del(rankKey)
        await this._updateMeta(client, metaKey, startTime, 0)
        return
      }

      // 2. 计算日期范围
      const dateRange = this._getDateRange(timeRange)

      // 3. 分批计算费用
      const costs = await this._calculateCostsInBatches(keyIds, dateRange)

      // 4. 原子更新索引（使用临时 key + RENAME 避免竞态条件）
      await this._atomicUpdateIndex(client, rankKey, costs)

      // 5. 更新元数据
      await this._updateMeta(client, metaKey, startTime, keyIds.length)

      logger.info(
        `📊 Updated cost rank for ${timeRange}: ${keyIds.length} keys in ${Date.now() - startTime}ms`
      )
    } catch (error) {
      await client.hset(metaKey, 'status', 'failed')
      logger.error(`Failed to update cost rank for ${timeRange}:`, error)
      throw error
    } finally {
      await client.del(lockKey)
    }
  }

  /**
   * 原子更新索引（避免竞态条件）
   * @private
   */
  async _atomicUpdateIndex(client, rankKey, costs) {
    if (costs.size === 0) {
      await client.del(rankKey)
      return
    }

    // 使用临时 key 构建新索引
    const tempKey = `${rankKey}:temp:${Date.now()}`

    try {
      // 构建 ZADD 参数
      const members = []
      costs.forEach((cost, keyId) => {
        members.push(cost, keyId)
      })

      // 写入临时 key
      await client.zadd(tempKey, ...members)

      // 原子替换（RENAME 是原子操作）
      await client.rename(tempKey, rankKey)
    } catch (error) {
      // 清理临时 key
      await client.del(tempKey).catch(() => {})
      throw error
    }
  }

  /**
   * 更新元数据
   * @private
   */
  async _updateMeta(client, metaKey, startTime, keyCount) {
    await client.hmset(metaKey, {
      lastUpdate: new Date().toISOString(),
      keyCount: keyCount.toString(),
      status: 'ready',
      updateDuration: (Date.now() - startTime).toString()
    })
  }

  // --------------------------------------------------------------------------
  // 索引增量更新（供外部调用）
  // --------------------------------------------------------------------------

  /**
   * 添加 API Key 到所有索引（创建 API Key 时调用）
   * @param {string} keyId - API Key ID
   */
  async addKeyToIndexes(keyId) {
    if (usageStatsService.shouldReadPostgres()) {
      return
    }

    const client = redis.getClient()
    if (!client) {
      return
    }

    try {
      const pipeline = client.pipeline()

      // 将新 Key 添加到所有索引，初始分数为 0
      for (const timeRange of VALID_TIME_RANGES) {
        pipeline.zadd(RedisKeys.rankKey(timeRange), 0, keyId)
      }

      await pipeline.exec()
      logger.debug(`Added key ${keyId} to cost rank indexes`)
    } catch (error) {
      logger.error(`Failed to add key ${keyId} to cost rank indexes:`, error)
    }
  }

  /**
   * 从所有索引中移除 API Key（删除 API Key 时调用）
   * @param {string} keyId - API Key ID
   */
  async removeKeyFromIndexes(keyId) {
    if (usageStatsService.shouldReadPostgres()) {
      return
    }

    const client = redis.getClient()
    if (!client) {
      return
    }

    try {
      const pipeline = client.pipeline()

      // 从所有索引中移除
      for (const timeRange of VALID_TIME_RANGES) {
        pipeline.zrem(RedisKeys.rankKey(timeRange), keyId)
      }

      await pipeline.exec()
      logger.debug(`Removed key ${keyId} from cost rank indexes`)
    } catch (error) {
      logger.error(`Failed to remove key ${keyId} from cost rank indexes:`, error)
    }
  }

  // --------------------------------------------------------------------------
  // 查询接口
  // --------------------------------------------------------------------------

  /**
   * 获取排序后的 keyId 列表
   * @param {string} timeRange - 时间范围
   * @param {string} sortOrder - 排序方向 'asc' | 'desc'
   * @param {number} offset - 偏移量
   * @param {number} limit - 限制数量，-1 表示全部
   * @returns {Promise<string[]>} keyId 列表
   */
  async getSortedKeyIds(timeRange, sortOrder = 'desc', offset = 0, limit = -1) {
    if (usageStatsService.shouldReadPostgres()) {
      const keyIds = await this._getActiveApiKeyIds()
      const costs = await usageStatsService.getBatchKeyCosts(timeRange, keyIds)
      const sorted = [...costs.entries()]
        .sort((a, b) => (sortOrder === 'asc' ? a[1] - b[1] : b[1] - a[1]))
        .map(([keyId]) => keyId)

      if (limit === -1) {
        return sorted.slice(offset)
      }

      return sorted.slice(offset, offset + limit)
    }

    const client = redis.getClient()
    if (!client) {
      throw new Error('Redis client not available')
    }

    const rankKey = RedisKeys.rankKey(timeRange)
    const end = limit === -1 ? -1 : offset + limit - 1

    if (sortOrder === 'desc') {
      return await client.zrevrange(rankKey, offset, end)
    } else {
      return await client.zrange(rankKey, offset, end)
    }
  }

  /**
   * 获取 Key 的费用分数
   * @param {string} timeRange - 时间范围
   * @param {string} keyId - API Key ID
   * @returns {Promise<number>} 费用
   */
  async getKeyCost(timeRange, keyId) {
    if (usageStatsService.shouldReadPostgres()) {
      const costs = await usageStatsService.getBatchKeyCosts(timeRange, [keyId])
      return costs.get(keyId) || 0
    }

    const client = redis.getClient()
    if (!client) {
      return 0
    }

    const score = await client.zscore(RedisKeys.rankKey(timeRange), keyId)
    return score ? parseFloat(score) : 0
  }

  /**
   * 批量获取多个 Key 的费用分数
   * @param {string} timeRange - 时间范围
   * @param {string[]} keyIds - API Key ID 列表
   * @returns {Promise<Map<string, number>>} keyId -> cost
   */
  async getBatchKeyCosts(timeRange, keyIds) {
    if (usageStatsService.shouldReadPostgres()) {
      return usageStatsService.getBatchKeyCosts(timeRange, keyIds)
    }

    const client = redis.getClient()
    if (!client || keyIds.length === 0) {
      return new Map()
    }

    const rankKey = RedisKeys.rankKey(timeRange)
    const costs = new Map()

    const pipeline = client.pipeline()
    keyIds.forEach((keyId) => {
      pipeline.zscore(rankKey, keyId)
    })
    const results = await pipeline.exec()

    keyIds.forEach((keyId, index) => {
      const [err, score] = results[index]
      costs.set(keyId, err || !score ? 0 : parseFloat(score))
    })

    return costs
  }

  /**
   * 获取所有排序索引的状态
   * @returns {Promise<Object>} 各时间范围的状态
   */
  async getRankStatus() {
    if (usageStatsService.shouldReadPostgres()) {
      const keyIds = await this._getActiveApiKeyIds()
      const status = {}
      for (const timeRange of VALID_TIME_RANGES) {
        status[timeRange] = {
          lastUpdate: null,
          keyCount: keyIds.length,
          status: 'postgres',
          updateDuration: 0
        }
      }
      return status
    }

    const client = redis.getClient()
    if (!client) {
      return {}
    }

    // 使用 Pipeline 批量获取
    const pipeline = client.pipeline()
    for (const timeRange of VALID_TIME_RANGES) {
      pipeline.hgetall(RedisKeys.metaKey(timeRange))
    }
    const results = await pipeline.exec()

    const status = {}
    VALID_TIME_RANGES.forEach((timeRange, i) => {
      const [err, meta] = results[i]
      if (err || !meta) {
        status[timeRange] = {
          lastUpdate: null,
          keyCount: 0,
          status: 'unknown',
          updateDuration: 0
        }
      } else {
        status[timeRange] = {
          lastUpdate: meta.lastUpdate || null,
          keyCount: parseInt(meta.keyCount || 0),
          status: meta.status || 'unknown',
          updateDuration: parseInt(meta.updateDuration || 0)
        }
      }
    })

    return status
  }

  /**
   * 强制刷新指定时间范围的索引
   * @param {string} timeRange - 时间范围，不传则刷新全部
   */
  async forceRefresh(timeRange = null) {
    if (usageStatsService.shouldReadPostgres()) {
      logger.info(
        timeRange
          ? `PostgreSQL cost rank for ${timeRange} is query-time, refresh skipped`
          : 'PostgreSQL cost rank is query-time, refresh skipped'
      )
      return
    }

    if (timeRange) {
      await this.updateRank(timeRange)
    } else {
      await this.updateAllRanks()
    }
  }

  // --------------------------------------------------------------------------
  // Custom 时间范围实时计算
  // --------------------------------------------------------------------------

  /**
   * 计算 custom 时间范围的费用（实时计算，排除已删除的 Key）
   * @param {string} startDate - 开始日期 YYYY-MM-DD
   * @param {string} endDate - 结束日期 YYYY-MM-DD
   * @returns {Promise<Map<string, number>>} keyId -> cost
   */
  async calculateCustomRangeCosts(startDate, endDate) {
    if (usageStatsService.shouldReadPostgres()) {
      const keyIds = await this._getActiveApiKeyIds()
      return usageStatsService.calculateCustomRangeCosts(keyIds, startDate, endDate)
    }

    const client = redis.getClient()
    if (!client) {
      throw new Error('Redis client not available')
    }

    logger.info(`📊 Calculating custom range costs: ${startDate} to ${endDate}`)
    const startTime = Date.now()

    // 1. 获取所有未删除的 API Key IDs
    const keyIds = await this._getActiveApiKeyIds()

    if (keyIds.length === 0) {
      return new Map()
    }

    // 2. 分批计算费用
    const costs = await this._calculateCostsInBatches(keyIds, { startDate, endDate })

    const duration = Date.now() - startTime
    logger.info(`📊 Custom range costs calculated: ${keyIds.length} keys in ${duration}ms`)

    return costs
  }

  // --------------------------------------------------------------------------
  // 私有辅助方法
  // --------------------------------------------------------------------------

  /**
   * 获取所有未删除的 API Key IDs
   * @private
   * @returns {Promise<string[]>}
   */
  async _getActiveApiKeyIds() {
    // 使用现有的 scanApiKeyIds 获取所有 ID
    const allKeyIds = await redis.scanApiKeyIds()

    if (allKeyIds.length === 0) {
      return []
    }

    // 批量获取 API Key 数据，过滤已删除的
    const allKeys = await redis.batchGetApiKeys(allKeyIds)

    return allKeys.filter((k) => !k.isDeleted).map((k) => k.id)
  }

  /**
   * 分批计算费用
   * @private
   */
  async _calculateCostsInBatches(keyIds, dateRange) {
    const costs = new Map()

    for (let i = 0; i < keyIds.length; i += BATCH_SIZE) {
      const batch = keyIds.slice(i, i + BATCH_SIZE)
      const batchCosts = await this._calculateBatchCosts(batch, dateRange)
      batchCosts.forEach((cost, keyId) => costs.set(keyId, cost))
    }

    return costs
  }

  /**
   * 批量计算费用
   * @private
   */
  async _calculateBatchCosts(keyIds, dateRange) {
    const client = redis.getClient()
    const costs = new Map()

    if (dateRange.useTotal) {
      // 'all' 时间范围：直接读取 total cost
      const pipeline = client.pipeline()
      keyIds.forEach((keyId) => {
        pipeline.get(RedisKeys.totalCost(keyId))
      })
      const results = await pipeline.exec()

      keyIds.forEach((keyId, index) => {
        const [err, value] = results[index]
        costs.set(keyId, err ? 0 : parseFloat(value || 0))
      })
    } else {
      // 特定日期范围：汇总每日费用
      const dates = this._getDatesBetween(dateRange.startDate, dateRange.endDate)

      const pipeline = client.pipeline()
      keyIds.forEach((keyId) => {
        dates.forEach((date) => {
          pipeline.get(RedisKeys.dailyCost(keyId, date))
        })
      })
      const results = await pipeline.exec()

      let resultIndex = 0
      keyIds.forEach((keyId) => {
        let totalCost = 0
        dates.forEach(() => {
          const [err, value] = results[resultIndex++]
          if (!err && value) {
            totalCost += parseFloat(value)
          }
        })
        costs.set(keyId, totalCost)
      })
    }

    return costs
  }

  /**
   * 获取日期范围配置
   * @private
   */
  _getDateRange(timeRange) {
    const now = new Date()
    const today = redis.getDateStringInTimezone(now)

    switch (timeRange) {
      case 'today':
        return { startDate: today, endDate: today }
      case '7days': {
        const d7 = new Date(now)
        d7.setDate(d7.getDate() - 6)
        return { startDate: redis.getDateStringInTimezone(d7), endDate: today }
      }
      case '30days': {
        const d30 = new Date(now)
        d30.setDate(d30.getDate() - 29)
        return { startDate: redis.getDateStringInTimezone(d30), endDate: today }
      }
      case 'all':
        return { useTotal: true }
      default:
        throw new Error(`Invalid time range: ${timeRange}`)
    }
  }

  /**
   * 获取两个日期之间的所有日期
   * @private
   */
  _getDatesBetween(startDate, endDate) {
    const dates = []
    const current = new Date(startDate)
    const end = new Date(endDate)

    while (current <= end) {
      dates.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      )
      current.setDate(current.getDate() + 1)
    }

    return dates
  }
}

module.exports = new CostRankService()
