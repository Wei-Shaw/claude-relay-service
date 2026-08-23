// ============================================================================
// 全局统计聚合 / 数据迁移 / 系统指标清理（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// ============================================================================
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const { RedisKeys } = require('../../constants/redisKeys')

function attach(redisClient) {
  // 迁移全局统计数据（从 API Key 数据聚合）
  redisClient.migrateGlobalStats = async function () {
    logger.info('🔄 开始迁移全局统计数据...')

    const keyIds = await this.scanApiKeyIds()
    if (!keyIds || keyIds.length === 0) {
      logger.info('📊 没有 API Key 数据需要迁移')
      return { success: true, migrated: 0 }
    }

    const total = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      allTokens: 0
    }

    // 批量获取所有 usage 数据
    const pipeline = this.client.pipeline()
    keyIds.forEach((id) => pipeline.hgetall(RedisKeys.usage.total(id)))
    const results = await pipeline.exec()

    results.forEach(([err, usage]) => {
      if (err || !usage) {
        return
      }
      // 兼容新旧字段格式（带 total 前缀和不带的）
      total.requests += parseInt(usage.totalRequests || usage.requests) || 0
      total.inputTokens += parseInt(usage.totalInputTokens || usage.inputTokens) || 0
      total.outputTokens += parseInt(usage.totalOutputTokens || usage.outputTokens) || 0
      total.cacheCreateTokens +=
        parseInt(usage.totalCacheCreateTokens || usage.cacheCreateTokens) || 0
      total.cacheReadTokens += parseInt(usage.totalCacheReadTokens || usage.cacheReadTokens) || 0
      total.allTokens += parseInt(usage.totalAllTokens || usage.allTokens || usage.totalTokens) || 0
    })

    // 写入全局统计
    await this.client.hset(RedisKeys.usage.globalTotal, total)

    // 迁移月份索引（从现有的 usage:model:monthly:* key 中提取月份）
    const monthlyKeys = await this.client.keys(RedisKeys.usage.modelMonthlyPattern)
    const months = new Set()
    for (const key of monthlyKeys) {
      const match = key.match(/:(\d{4}-\d{2})$/)
      if (match) {
        months.add(match[1])
      }
    }
    if (months.size > 0) {
      await this.client.sadd(RedisKeys.usage.modelMonthlyMonths, ...months)
      logger.info(`📅 迁移月份索引: ${months.size} 个月份 (${[...months].sort().join(', ')})`)
    }

    logger.success(
      `✅ 迁移完成: ${keyIds.length} 个 API Key, ${total.requests} 请求, ${total.allTokens} tokens`
    )
    return { success: true, migrated: keyIds.length, total }
  }

  // 确保月份索引完整（后台检查，补充缺失的月份）
  redisClient.ensureMonthlyMonthsIndex = async function () {
    // 扫描所有月份 key
    const monthlyKeys = await this.client.keys(RedisKeys.usage.modelMonthlyPattern)
    const allMonths = new Set()
    for (const key of monthlyKeys) {
      const match = key.match(/:(\d{4}-\d{2})$/)
      if (match) {
        allMonths.add(match[1])
      }
    }

    if (allMonths.size === 0) {
      return // 没有月份数据
    }

    // 获取索引中已有的月份
    const existingMonths = await this.client.smembers(RedisKeys.usage.modelMonthlyMonths)
    const existingSet = new Set(existingMonths)

    // 找出缺失的月份
    const missingMonths = [...allMonths].filter((m) => !existingSet.has(m))

    if (missingMonths.length > 0) {
      await this.client.sadd(RedisKeys.usage.modelMonthlyMonths, ...missingMonths)
      logger.info(
        `📅 补充月份索引: ${missingMonths.length} 个月份 (${missingMonths.sort().join(', ')})`
      )
    }
  }

  // 检查是否需要迁移
  redisClient.needsGlobalStatsMigration = async function () {
    const exists = await this.client.exists(RedisKeys.usage.globalTotal)
    return exists === 0
  }

  // 获取已迁移版本
  redisClient.getMigratedVersion = async function () {
    return (await this.client.get(RedisKeys.system.migratedVersion)) || '0.0.0'
  }

  // 设置已迁移版本
  redisClient.setMigratedVersion = async function (version) {
    await this.client.set(RedisKeys.system.migratedVersion, version)
  }

  // 获取全局统计（用于 dashboard 快速查询）
  redisClient.getGlobalStats = async function () {
    const stats = await this.client.hgetall(RedisKeys.usage.globalTotal)
    if (!stats || !stats.requests) {
      return null
    }
    return {
      requests: parseInt(stats.requests) || 0,
      inputTokens: parseInt(stats.inputTokens) || 0,
      outputTokens: parseInt(stats.outputTokens) || 0,
      cacheCreateTokens: parseInt(stats.cacheCreateTokens) || 0,
      cacheReadTokens: parseInt(stats.cacheReadTokens) || 0,
      allTokens: parseInt(stats.allTokens) || 0
    }
  }

  // 快速获取 API Key 计数（不拉全量数据）
  redisClient.getApiKeyCount = async function () {
    const keyIds = await this.scanApiKeyIds()
    if (!keyIds || keyIds.length === 0) {
      return { total: 0, active: 0 }
    }

    // 批量获取 isActive 字段
    const pipeline = this.client.pipeline()
    keyIds.forEach((id) => pipeline.hget(RedisKeys.apiKey.byId(id), 'isActive'))
    const results = await pipeline.exec()

    let active = 0
    results.forEach(([err, val]) => {
      if (!err && (val === 'true' || val === true)) {
        active++
      }
    })
    return { total: keyIds.length, active }
  }

  // 清理过期的系统分钟统计数据（启动时调用）
  redisClient.cleanupSystemMetrics = async function () {
    logger.info('🧹 清理过期的系统分钟统计数据...')

    const keys = await this.scanKeys(RedisKeys.system.metricsMinutePattern)
    if (!keys || keys.length === 0) {
      logger.info('📊 没有需要清理的系统分钟统计数据')
      return { cleaned: 0 }
    }

    // 计算当前分钟时间戳和保留窗口
    const { metricsWindow } = config.system // config.js 单一权威源，必已定义
    const currentMinute = Math.floor(Date.now() / 60000)
    const keepAfter = currentMinute - metricsWindow * 2 // 保留窗口的2倍

    // 筛选需要删除的 key
    const toDelete = keys.filter((key) => {
      const match = key.match(/system:metrics:minute:(\d+)/)
      if (!match) {
        return false
      }
      const minute = parseInt(match[1])
      return minute < keepAfter
    })

    if (toDelete.length === 0) {
      logger.info('📊 没有过期的系统分钟统计数据')
      return { cleaned: 0 }
    }

    // 分批删除
    const batchSize = 1000
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize)
      await this.client.del(...batch)
    }

    logger.success(`✅ 清理完成: 删除 ${toDelete.length} 个过期的系统分钟统计 key`)
    return { cleaned: toDelete.length }
  }
}

module.exports = { attach }
