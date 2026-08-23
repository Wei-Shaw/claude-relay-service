const redis = require('../models/redis')
const CostCalculator = require('../utils/costCalculator')
const logger = require('../utils/logger')

const { RedisKeys, TTL } = require('../constants/redisKeys')

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
      // [audit] concern 2：重建缺失费用用的是当前价格，可能与请求发生时的价格有出入（仅补缺失不覆盖）
      logger.warn(
        '💰 [audit] 费用初始化将按【当前价格】重建缺失的历史费用，重建值可能与请求当时价格有出入'
      )

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
          pipeline.hget(RedisKeys.apiKey.byId(keyId), 'isDeleted')
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
      let reconstructedCount = 0

      // 优化6: 并行处理 + 并发限制
      await this.parallelLimit(
        apiKeyIds,
        async (apiKeyId) => {
          try {
            // 必须先把 await 结果落到局部变量再累加：a += await f() 会在 await 之前
            // 就读取 a 的当前值，20 并发下各 worker 的累加会互相覆盖（lost update），
            // 导致汇总数严重少算（逐条日志准确、汇总偏小就是这个坑）
            const reconstructed = (await this.initializeApiKeyCosts(apiKeyId, client)) || 0
            reconstructedCount += reconstructed
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
        `💰 Cost initialization completed! Processed: ${processedCount}, Errors: ${errorCount}, Reconstructed@currentPrice: ${reconstructedCount}`
      )
      if (reconstructedCount > 0) {
        logger.warn(
          `💰 [audit] 本次按当前价格重建了 ${reconstructedCount} 条缺失费用，如对历史价格敏感请核对`
        )
      }
      return { processed: processedCount, errors: errorCount, reconstructed: reconstructedCount }
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
      return 0
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
    // TTL 必须与 redis.js incrementDailyCost 保持一致，且 ≥ 用量日 TTL（32 天），否则启动会反复全量重算
    for (const [date, cost] of dailyCosts) {
      const key = RedisKeys.usage.costDaily(apiKeyId, date)
      pipeline.set(key, cost.toString(), 'EX', TTL.costDaily, 'NX')
    }

    // 写入每月费用（只补缺失）
    // TTL 必须 ≥ 用量月 TTL（365 天），与 redis.js incrementDailyCost 保持一致
    for (const [month, cost] of monthlyCosts) {
      const key = RedisKeys.usage.costMonthly(apiKeyId, month)
      pipeline.set(key, cost.toString(), 'EX', TTL.costMonthly, 'NX')
    }

    // 写入每小时费用（只补缺失）
    for (const [hour, cost] of hourlyCosts) {
      const key = RedisKeys.usage.costHourly(apiKeyId, hour)
      pipeline.set(key, cost.toString(), 'EX', TTL.costHourly, 'NX')
    }

    // 计算总费用
    let totalCost = 0
    for (const cost of dailyCosts.values()) {
      totalCost += cost
    }

    // 写入总费用（只补缺失）
    if (totalCost > 0) {
      const totalKey = RedisKeys.usage.costTotal(apiKeyId)
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

    // NX set 按入队顺序排在最前（日→月→时），统计实际命中（即真正按当前价格重建）的条目数
    const nxSetCount = dailyCosts.size + monthlyCosts.size + hourlyCosts.size
    const results = await pipeline.exec()

    let reconstructed = 0
    for (let i = 0; i < nxSetCount && i < results.length; i++) {
      // ioredis：NX 命中返回 'OK'，键已存在返回 null
      if (results[i] && results[i][1] === 'OK') {
        reconstructed++
      }
    }

    if (reconstructed > 0) {
      logger.warn(
        `💰 [audit] 按当前价格为 API Key ${apiKeyId} 重建了 ${reconstructed} 条缺失费用（可能与请求当时价格有出入）`
      )
    }

    logger.debug(
      `💰 Initialized costs for API Key ${apiKeyId}: Daily entries: ${dailyCosts.size}, Total cost: $${totalCost.toFixed(2)}, reconstructed: ${reconstructed}`
    )
    return reconstructed
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
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          RedisKeys.usage.costPattern,
          'COUNT',
          100
        )
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

            // 与 initializeAllCosts 保持同一口径：只检查"存在且未软删除"的 Key。
            // 否则永久删除残留的 usage 孤儿键（permanentDeleteApiKey 漏删 usage:${keyId}:model:*）
            // 会把检测打成"缺费用"，而修复路径又永远不补这些 Key，导致启动反复全量重算。
            const [keyExists, isDeleted] = await Promise.all([
              client.exists(RedisKeys.apiKey.byId(keyId)),
              client.hget(RedisKeys.apiKey.byId(keyId), 'isDeleted')
            ])
            if (!keyExists || isDeleted === 'true') {
              continue
            }

            const costKey = RedisKeys.usage.costDaily(keyId, date)
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
