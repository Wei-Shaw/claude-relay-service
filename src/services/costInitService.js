const redis = require('../models/redis')
const CostCalculator = require('../utils/costCalculator')
const logger = require('../utils/logger')

// HMGET 需要的字段
const USAGE_FIELDS = [
  'totalInputTokens',
  'inputTokens',
  'totalOutputTokens',
  'outputTokens',
  'totalCacheCreateTokens',
  'cacheCreateTokens',
  'totalCacheReadTokens',
  'cacheReadTokens',
  'ephemeral5mTokens',
  'ephemeral1hTokens',
  'totalEphemeral5mTokens',
  'totalEphemeral1hTokens'
]

class CostInitService {
  /**
   * 带并发限制的并行执行
   */
  async parallelLimit(items, fn, concurrency = 20) {
    let index = 0
    const results = []

    async function worker() {
      while (index < items.length) {
        const currentIndex = index++
        try {
          results[currentIndex] = await fn(items[currentIndex], currentIndex)
        } catch (error) {
          results[currentIndex] = { error }
        }
      }
    }

    await Promise.all(Array(Math.min(concurrency, items.length)).fill().map(worker))
    return results
  }

  /**
   * 使用 SCAN 获取匹配的 keys（带去重）
   */
  async scanKeysWithDedup(client, pattern, count = 500) {
    const seen = new Set()
    const allKeys = []
    let cursor = '0'

    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count)
      cursor = newCursor

      for (const key of keys) {
        if (!seen.has(key)) {
          seen.add(key)
          allKeys.push(key)
        }
      }
    } while (cursor !== '0')

    return allKeys
  }

  /**
   * 初始化所有API Key的费用数据
   * 扫描历史使用记录并计算费用
   */
  async initializeAllCosts() {
    try {
      logger.info('💰 Starting cost initialization for all API Keys...')

      // 用 scanApiKeyIds 获取 ID，然后过滤已删除的
      const allKeyIds = await redis.scanApiKeyIds()
      const client = redis.getClientSafe()

      // 批量检查 isDeleted 状态，过滤已删除的 key
      const FILTER_BATCH = 100
      const apiKeyIds = []

      for (let i = 0; i < allKeyIds.length; i += FILTER_BATCH) {
        const batch = allKeyIds.slice(i, i + FILTER_BATCH)
        const pipeline = client.pipeline()

        for (const keyId of batch) {
          pipeline.hget(`apikey:${keyId}`, 'isDeleted')
        }

        const results = await pipeline.exec()

        for (let j = 0; j < results.length; j++) {
          const [err, isDeleted] = results[j]
          if (!err && isDeleted !== 'true') {
            apiKeyIds.push(batch[j])
          }
        }
      }

      logger.info(
        `💰 Found ${apiKeyIds.length} active API Keys to process (filtered ${allKeyIds.length - apiKeyIds.length} deleted)`
      )

      let processedCount = 0
      let errorCount = 0

      // 优化6: 并行处理 + 并发限制
      await this.parallelLimit(
        apiKeyIds,
        async (apiKeyId) => {
          try {
            await this.initializeApiKeyCosts(apiKeyId, client)
            processedCount++

            if (processedCount % 100 === 0) {
              logger.info(`💰 Processed ${processedCount}/${apiKeyIds.length} API Keys...`)
            }
          } catch (error) {
            errorCount++
            logger.error(`❌ Failed to initialize costs for API Key ${apiKeyId}:`, error)
          }
        },
        20 // 并发数
      )

      logger.success(
        `💰 Cost initialization completed! Processed: ${processedCount}, Errors: ${errorCount}`
      )
      return { processed: processedCount, errors: errorCount }
    } catch (error) {
      logger.error('❌ Failed to initialize costs:', error)
      throw error
    }
  }

  /**
   * 初始化单个API Key的费用数据
   */
  async initializeApiKeyCosts(apiKeyId, client) {
    // 优化4: 使用 SCAN 获取 keys（带去重）
    const modelKeys = await this.scanKeysWithDedup(client, `usage:${apiKeyId}:model:*:*:*`)

    if (modelKeys.length === 0) {
      return
    }

    // 优化5: 使用 Pipeline + HMGET 批量获取数据
    const BATCH_SIZE = 100
    const allData = []

    for (let i = 0; i < modelKeys.length; i += BATCH_SIZE) {
      const batch = modelKeys.slice(i, i + BATCH_SIZE)
      const pipeline = client.pipeline()

      for (const key of batch) {
        pipeline.hmget(key, ...USAGE_FIELDS)
      }

      const results = await pipeline.exec()

      for (let j = 0; j < results.length; j++) {
        const [err, values] = results[j]
        if (err) {
          continue
        }

        // 将数组转换为对象
        const data = {}
        let hasData = false
        for (let k = 0; k < USAGE_FIELDS.length; k++) {
          if (values[k] !== null) {
            data[USAGE_FIELDS[k]] = values[k]
            hasData = true
          }
        }

        if (hasData) {
          allData.push({ key: batch[j], data })
        }
      }
    }

    // 按日期分组统计
    const dailyCosts = new Map()
    const monthlyCosts = new Map()
    const hourlyCosts = new Map()

    for (const { key, data } of allData) {
      const match = key.match(
        /usage:(.+):model:(daily|monthly|hourly):(.+):(\d{4}-\d{2}(?:-\d{2})?(?::\d{2})?)$/
      )
      if (!match) {
        continue
      }

      const [, , period, model, dateStr] = match

      const usage = {
        input_tokens: parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0,
        output_tokens: parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0,
        cache_creation_input_tokens:
          parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0,
        cache_read_input_tokens:
          parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
      }

      // 添加 cache_creation 子对象以支持精确 ephemeral 定价
      const eph5m = parseInt(data.totalEphemeral5mTokens) || parseInt(data.ephemeral5mTokens) || 0
      const eph1h = parseInt(data.totalEphemeral1hTokens) || parseInt(data.ephemeral1hTokens) || 0
      if (eph5m > 0 || eph1h > 0) {
        usage.cache_creation = {
          ephemeral_5m_input_tokens: eph5m,
          ephemeral_1h_input_tokens: eph1h
        }
      }

      const costResult = CostCalculator.calculateCost(usage, model)
      const cost = costResult.costs.total

      if (period === 'daily') {
        dailyCosts.set(dateStr, (dailyCosts.get(dateStr) || 0) + cost)
      } else if (period === 'monthly') {
        monthlyCosts.set(dateStr, (monthlyCosts.get(dateStr) || 0) + cost)
      } else if (period === 'hourly') {
        hourlyCosts.set(dateStr, (hourlyCosts.get(dateStr) || 0) + cost)
      }
    }

    // 使用 SET NX EX 只补缺失的键，不覆盖已存在的
    const pipeline = client.pipeline()

    // 写入每日费用（只补缺失）
    for (const [date, cost] of dailyCosts) {
      const key = `usage:cost:daily:${apiKeyId}:${date}`
      pipeline.set(key, cost.toString(), 'EX', 86400 * 30, 'NX')
    }

    // 写入每月费用（只补缺失）
    for (const [month, cost] of monthlyCosts) {
      const key = `usage:cost:monthly:${apiKeyId}:${month}`
      pipeline.set(key, cost.toString(), 'EX', 86400 * 90, 'NX')
    }

    // 写入每小时费用（只补缺失）
    for (const [hour, cost] of hourlyCosts) {
      const key = `usage:cost:hourly:${apiKeyId}:${hour}`
      pipeline.set(key, cost.toString(), 'EX', 86400 * 7, 'NX')
    }

    // 计算总费用
    let totalCost = 0
    for (const cost of dailyCosts.values()) {
      totalCost += cost
    }

    // 写入总费用（只补缺失）
    if (totalCost > 0) {
      const totalKey = `usage:cost:total:${apiKeyId}`
      const existingTotal = await client.get(totalKey)

      if (!existingTotal || parseFloat(existingTotal) === 0) {
        pipeline.set(totalKey, totalCost.toString())
        logger.info(`💰 Initialized total cost for API Key ${apiKeyId}: $${totalCost.toFixed(6)}`)
      } else {
        const existing = parseFloat(existingTotal)
        if (totalCost > existing * 1.1) {
          logger.warn(
            `💰 Total cost mismatch for API Key ${apiKeyId}: existing=$${existing.toFixed(6)}, calculated=$${totalCost.toFixed(6)} (from last 30 days). Keeping existing value.`
          )
        }
      }
    }

    await pipeline.exec()

    logger.debug(
      `💰 Initialized costs for API Key ${apiKeyId}: Daily entries: ${dailyCosts.size}, Total cost: $${totalCost.toFixed(2)}`
    )
  }

  /**
   * 检查是否需要初始化费用数据
   * 使用 SCAN 代替 KEYS，正确处理 cursor
   */
  async needsInitialization() {
    try {
      const client = redis.getClientSafe()

      // 正确循环 SCAN 检查是否有任何费用数据
      let cursor = '0'
      let hasCostData = false

      do {
        const [newCursor, keys] = await client.scan(cursor, 'MATCH', 'usage:cost:*', 'COUNT', 100)
        cursor = newCursor
        if (keys.length > 0) {
          hasCostData = true
          break
        }
      } while (cursor !== '0')

      if (!hasCostData) {
        logger.info('💰 No cost data found, initialization needed')
        return true
      }

      // 抽样检查使用数据是否有对应的费用数据
      cursor = '0'
      let samplesChecked = 0
      const maxSamples = 10

      do {
        const [newCursor, usageKeys] = await client.scan(
          cursor,
          'MATCH',
          'usage:*:model:daily:*:*',
          'COUNT',
          100
        )
        cursor = newCursor

        for (const usageKey of usageKeys) {
          if (samplesChecked >= maxSamples) {
            break
          }

          const match = usageKey.match(/usage:(.+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            const [, keyId, , date] = match
            const costKey = `usage:cost:daily:${keyId}:${date}`
            const hasCost = await client.exists(costKey)

            if (!hasCost) {
              logger.info(
                `💰 Found usage without cost data for key ${keyId} on ${date}, initialization needed`
              )
              return true
            }
            samplesChecked++
          }
        }

        if (samplesChecked >= maxSamples) {
          break
        }
      } while (cursor !== '0')

      logger.info('💰 Cost data appears to be up to date')
      return false
    } catch (error) {
      logger.error('❌ Failed to check initialization status:', error)
      return false
    }
  }
}

module.exports = new CostInitService()
