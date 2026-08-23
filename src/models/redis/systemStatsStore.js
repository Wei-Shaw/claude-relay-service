// ============================================================================
// 系统统计 / 实时指标 / 索引查询聚合（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 内部互调用(getKeysByIndex/getSystemAverages)及跨域 this.scanKeys/batchHgetallChunked
// 均经同一单例解析。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys } = require('../../constants/redisKeys')
const { getDateStringInTimezone } = require('../../utils/timezone')

function attach(redisClient) {
  // 📈 系统统计（使用 scanKeys 替代 keys）
  redisClient.getSystemStats = async function () {
    const keys = await Promise.all([
      this.scanKeys(RedisKeys.apiKey.allPattern),
      this.scanKeys(RedisKeys.accounts.claudePattern),
      this.scanKeys(RedisKeys.usage.allPattern)
    ])

    // 过滤 apikey 索引键，只统计实际的 apikey
    const apiKeyCount = keys[0].filter(
      (k) => k !== RedisKeys.apiKey.hashMap && k.split(':').length === 2
    ).length

    return {
      totalApiKeys: apiKeyCount,
      totalClaudeAccounts: keys[1].length,
      totalUsageRecords: keys[2].length
    }
  }

  // 🔍 通过索引获取 key 列表（替代 SCAN）
  redisClient.getKeysByIndex = async function (indexKey, keyPattern) {
    const members = await this.client.smembers(indexKey)
    if (!members || members.length === 0) {
      return []
    }
    return members.map((id) => keyPattern.replace('{id}', id))
  }

  // 🔍 批量通过索引获取数据
  redisClient.getDataByIndex = async function (indexKey, keyPattern) {
    const keys = await this.getKeysByIndex(indexKey, keyPattern)
    if (keys.length === 0) {
      return []
    }
    return await this.batchHgetallChunked(keys)
  }

  // 📊 获取今日系统统计
  redisClient.getTodayStats = async function () {
    try {
      const today = getDateStringInTimezone()
      // 优先使用索引查询，回退到 SCAN
      let dailyKeys = []
      const indexKey = RedisKeys.usage.dailyIndex(today)
      const indexMembers = await this.client.smembers(indexKey)
      if (indexMembers && indexMembers.length > 0) {
        dailyKeys = indexMembers.map((keyId) => RedisKeys.usage.daily(keyId, today))
      } else {
        // 回退到 SCAN（兼容历史数据）
        dailyKeys = await this.scanKeys(RedisKeys.usage.dailyDateScan(today))
      }

      let totalRequestsToday = 0
      let totalTokensToday = 0
      let totalInputTokensToday = 0
      let totalOutputTokensToday = 0
      let totalCacheCreateTokensToday = 0
      let totalCacheReadTokensToday = 0

      // 批量获取所有今日数据，提高性能
      if (dailyKeys.length > 0) {
        const results = await this.batchHgetallChunked(dailyKeys)

        for (const dailyData of results) {
          if (!dailyData) {
            continue
          }

          totalRequestsToday += parseInt(dailyData.requests) || 0
          const currentDayTokens = parseInt(dailyData.tokens) || 0
          totalTokensToday += currentDayTokens

          // 处理旧数据兼容性：如果有总token但没有输入输出分离，则使用总token作为输出token
          const inputTokens = parseInt(dailyData.inputTokens) || 0
          const outputTokens = parseInt(dailyData.outputTokens) || 0
          const cacheCreateTokens = parseInt(dailyData.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(dailyData.cacheReadTokens) || 0
          const totalTokensFromSeparate = inputTokens + outputTokens

          if (totalTokensFromSeparate === 0 && currentDayTokens > 0) {
            // 旧数据：没有输入输出分离，假设70%为输出，30%为输入（基于一般对话比例）
            totalOutputTokensToday += Math.round(currentDayTokens * 0.7)
            totalInputTokensToday += Math.round(currentDayTokens * 0.3)
          } else {
            // 新数据：使用实际的输入输出分离
            totalInputTokensToday += inputTokens
            totalOutputTokensToday += outputTokens
          }

          // 添加cache token统计
          totalCacheCreateTokensToday += cacheCreateTokens
          totalCacheReadTokensToday += cacheReadTokens
        }
      }

      // 获取今日创建的API Key数量（批量优化）
      const allApiKeys = await this.scanKeys(RedisKeys.apiKey.allPattern)
      let apiKeysCreatedToday = 0

      if (allApiKeys.length > 0) {
        const pipeline = this.client.pipeline()
        allApiKeys.forEach((key) => pipeline.hget(key, 'createdAt'))
        const results = await pipeline.exec()

        for (const [error, createdAt] of results) {
          if (!error && createdAt && createdAt.startsWith(today)) {
            apiKeysCreatedToday++
          }
        }
      }

      return {
        requestsToday: totalRequestsToday,
        tokensToday: totalTokensToday,
        inputTokensToday: totalInputTokensToday,
        outputTokensToday: totalOutputTokensToday,
        cacheCreateTokensToday: totalCacheCreateTokensToday,
        cacheReadTokensToday: totalCacheReadTokensToday,
        apiKeysCreatedToday
      }
    } catch (error) {
      console.error('Error getting today stats:', error)
      return {
        requestsToday: 0,
        tokensToday: 0,
        inputTokensToday: 0,
        outputTokensToday: 0,
        cacheCreateTokensToday: 0,
        cacheReadTokensToday: 0,
        apiKeysCreatedToday: 0
      }
    }
  }

  // 📈 获取系统总的平均RPM和TPM
  redisClient.getSystemAverages = async function () {
    try {
      const allApiKeys = await this.scanKeys(RedisKeys.apiKey.allPattern)
      let totalRequests = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let oldestCreatedAt = new Date()

      // 批量获取所有usage数据和key数据，提高性能
      const usageKeys = allApiKeys.map((key) => RedisKeys.usage.total(key.replace('apikey:', '')))
      const pipeline = this.client.pipeline()

      // 添加所有usage查询
      usageKeys.forEach((key) => pipeline.hgetall(key))
      // 添加所有key数据查询
      allApiKeys.forEach((key) => pipeline.hgetall(key))

      const results = await pipeline.exec()
      const usageResults = results.slice(0, usageKeys.length)
      const keyResults = results.slice(usageKeys.length)

      for (let i = 0; i < allApiKeys.length; i++) {
        const totalData = usageResults[i][1] || {}
        const keyData = keyResults[i][1] || {}

        totalRequests += parseInt(totalData.totalRequests) || 0
        totalTokens += parseInt(totalData.totalTokens) || 0
        totalInputTokens += parseInt(totalData.totalInputTokens) || 0
        totalOutputTokens += parseInt(totalData.totalOutputTokens) || 0

        const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date()
        if (createdAt < oldestCreatedAt) {
          oldestCreatedAt = createdAt
        }
      }

      const now = new Date()
      // 保持与个人API Key计算一致的算法：按天计算然后转换为分钟
      const daysSinceOldest = Math.max(
        1,
        Math.ceil((now - oldestCreatedAt) / (1000 * 60 * 60 * 24))
      )
      const totalMinutes = daysSinceOldest * 24 * 60

      return {
        systemRPM: Math.round((totalRequests / totalMinutes) * 100) / 100,
        systemTPM: Math.round((totalTokens / totalMinutes) * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        totalTokens
      }
    } catch (error) {
      console.error('Error getting system averages:', error)
      return {
        systemRPM: 0,
        systemTPM: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0
      }
    }
  }

  // 📊 获取实时系统指标（基于滑动窗口）
  redisClient.getRealtimeSystemMetrics = async function () {
    try {
      const configLocal = require('../../../config/config')
      const windowMinutes = configLocal.system.metricsWindow // config.js 单一权威源，必已定义

      const now = new Date()
      const currentMinute = Math.floor(now.getTime() / 60000)

      // 调试：打印当前时间和分钟时间戳
      logger.debug(
        `🔍 Realtime metrics - Current time: ${now.toISOString()}, Minute timestamp: ${currentMinute}`
      )

      // 使用Pipeline批量获取窗口内的所有分钟数据
      const pipeline = this.client.pipeline()
      const minuteKeys = []
      for (let i = 0; i < windowMinutes; i++) {
        const minuteKey = RedisKeys.system.metricsMinute(currentMinute - i)
        minuteKeys.push(minuteKey)
        pipeline.hgetall(minuteKey)
      }

      logger.debug(`🔍 Realtime metrics - Checking keys: ${minuteKeys.join(', ')}`)

      const results = await pipeline.exec()

      // 聚合计算
      let totalRequests = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let totalCacheCreateTokens = 0
      let totalCacheReadTokens = 0
      let validDataCount = 0

      results.forEach(([err, data], index) => {
        if (!err && data && Object.keys(data).length > 0) {
          validDataCount++
          totalRequests += parseInt(data.requests || 0)
          totalTokens += parseInt(data.totalTokens || 0)
          totalInputTokens += parseInt(data.inputTokens || 0)
          totalOutputTokens += parseInt(data.outputTokens || 0)
          totalCacheCreateTokens += parseInt(data.cacheCreateTokens || 0)
          totalCacheReadTokens += parseInt(data.cacheReadTokens || 0)

          logger.debug(`🔍 Realtime metrics - Key ${minuteKeys[index]} data:`, {
            requests: data.requests,
            totalTokens: data.totalTokens
          })
        }
      })

      logger.debug(
        `🔍 Realtime metrics - Valid data count: ${validDataCount}/${windowMinutes}, Total requests: ${totalRequests}, Total tokens: ${totalTokens}`
      )

      // 计算平均值（每分钟）
      const realtimeRPM =
        windowMinutes > 0 ? Math.round((totalRequests / windowMinutes) * 100) / 100 : 0
      const realtimeTPM =
        windowMinutes > 0 ? Math.round((totalTokens / windowMinutes) * 100) / 100 : 0

      const result = {
        realtimeRPM,
        realtimeTPM,
        windowMinutes,
        totalRequests,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreateTokens,
        totalCacheReadTokens
      }

      logger.debug('🔍 Realtime metrics - Final result:', result)

      return result
    } catch (error) {
      console.error('Error getting realtime system metrics:', error)
      // 如果出错，返回历史平均值作为降级方案
      const historicalMetrics = await this.getSystemAverages()
      return {
        realtimeRPM: historicalMetrics.systemRPM,
        realtimeTPM: historicalMetrics.systemTPM,
        windowMinutes: 0, // 标识使用了历史数据
        totalRequests: 0,
        totalTokens: historicalMetrics.totalTokens,
        totalInputTokens: historicalMetrics.totalInputTokens,
        totalOutputTokens: historicalMetrics.totalOutputTokens,
        totalCacheCreateTokens: 0,
        totalCacheReadTokens: 0
      }
    }
  }
}

module.exports = { attach }
