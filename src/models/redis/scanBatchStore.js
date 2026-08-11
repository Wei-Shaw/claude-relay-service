// ============================================================================
// SCAN / 批量读写 / 索引辅助方法（从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// ============================================================================
const { RedisKeys, TTL } = require('../../constants/redisKeys')
const {
  getDateInTimezone,
  getDateStringInTimezone,
  getHourInTimezone,
  getWeekStringInTimezone
} = require('../../utils/timezone')

function attach(redisClient) {
  /**
   * 使用 SCAN 获取匹配模式的所有 keys（避免 KEYS 命令阻塞 Redis）
   * @param {string} pattern - 匹配模式，如 'usage:model:daily:*:2025-01-01'
   * @param {number} batchSize - 每次 SCAN 的数量，默认 200
   * @returns {Promise<string[]>} 匹配的 key 列表
   */
  redisClient.scanKeys = async function (pattern, batchSize = 200) {
    const keys = []
    let cursor = '0'
    const client = this.getClientSafe()

    do {
      const [newCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize)
      cursor = newCursor
      keys.push(...batch)
    } while (cursor !== '0')

    // 去重（SCAN 可能返回重复 key）
    return [...new Set(keys)]
  }

  /**
   * 批量 HGETALL（使用 Pipeline 减少网络往返）
   * @param {string[]} keys - 要获取的 key 列表
   * @returns {Promise<Object[]>} 每个 key 对应的数据，失败的返回 null
   */
  redisClient.batchHgetall = async function (keys) {
    if (!keys || keys.length === 0) {
      return []
    }

    const client = this.getClientSafe()
    const pipeline = client.pipeline()
    keys.forEach((k) => pipeline.hgetall(k))
    const results = await pipeline.exec()

    return results.map(([err, data]) => (err ? null : data))
  }

  /**
   * 使用 SCAN + Pipeline 获取匹配模式的所有数据
   * @param {string} pattern - 匹配模式
   * @param {number} batchSize - SCAN 批次大小
   * @returns {Promise<{key: string, data: Object}[]>} key 和数据的数组
   */
  redisClient.scanAndGetAll = async function (pattern, batchSize = 200) {
    const keys = await this.scanKeys(pattern, batchSize)
    if (keys.length === 0) {
      return []
    }

    const dataList = await this.batchHgetall(keys)
    return keys.map((key, i) => ({ key, data: dataList[i] })).filter((item) => item.data !== null)
  }

  /**
   * 批量获取多个 API Key 的使用统计、费用、并发等数据
   * @param {string[]} keyIds - API Key ID 列表
   * @returns {Promise<Map<string, Object>>} keyId -> 统计数据的映射
   */
  redisClient.batchGetApiKeyStats = async function (keyIds) {
    if (!keyIds || keyIds.length === 0) {
      return new Map()
    }

    const client = this.getClientSafe()
    const today = getDateStringInTimezone()
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    const currentWeek = getWeekStringInTimezone()
    const currentHour = `${today}:${String(getHourInTimezone(new Date())).padStart(2, '0')}`

    const pipeline = client.pipeline()

    // 为每个 keyId 添加所有需要的查询
    for (const keyId of keyIds) {
      // usage stats (3 hgetall)
      pipeline.hgetall(RedisKeys.usage.total(keyId))
      pipeline.hgetall(RedisKeys.usage.daily(keyId, today))
      pipeline.hgetall(RedisKeys.usage.monthly(keyId, currentMonth))
      // cost stats (5 get)
      pipeline.get(RedisKeys.usage.costDaily(keyId, today))
      pipeline.get(RedisKeys.usage.costMonthly(keyId, currentMonth))
      pipeline.get(RedisKeys.usage.costHourly(keyId, currentHour))
      pipeline.get(RedisKeys.usage.costTotal(keyId))
      pipeline.get(RedisKeys.usage.costRealTotal(keyId))
      // concurrency (1 zcard)
      pipeline.zcard(RedisKeys.concurrency.byKey(keyId))
      // weekly opus cost (1 get)
      pipeline.get(RedisKeys.usage.opusWeekly(keyId, currentWeek))
      // rate limit (4 get)
      pipeline.get(RedisKeys.rateLimit.requests(keyId))
      pipeline.get(RedisKeys.rateLimit.tokens(keyId))
      pipeline.get(RedisKeys.rateLimit.cost(keyId))
      pipeline.get(RedisKeys.rateLimit.windowStart(keyId))
      // apikey data for createdAt (1 hgetall)
      pipeline.hgetall(RedisKeys.apiKey.byId(keyId))
    }

    const results = await pipeline.exec()
    const statsMap = new Map()
    const FIELDS_PER_KEY = 15

    for (let i = 0; i < keyIds.length; i++) {
      const keyId = keyIds[i]
      const offset = i * FIELDS_PER_KEY

      const [
        [, usageTotal],
        [, usageDaily],
        [, usageMonthly],
        [, costDaily],
        [, costMonthly],
        [, costHourly],
        [, costTotal],
        [, costRealTotal],
        [, concurrency],
        [, weeklyOpusCost],
        [, rateLimitRequests],
        [, rateLimitTokens],
        [, rateLimitCost],
        [, rateLimitWindowStart],
        [, keyData]
      ] = results.slice(offset, offset + FIELDS_PER_KEY)

      statsMap.set(keyId, {
        usageTotal: usageTotal || {},
        usageDaily: usageDaily || {},
        usageMonthly: usageMonthly || {},
        costStats: {
          daily: parseFloat(costDaily || 0),
          monthly: parseFloat(costMonthly || 0),
          hourly: parseFloat(costHourly || 0),
          total: parseFloat(costTotal || 0),
          realTotal: parseFloat(costRealTotal || 0)
        },
        concurrency: concurrency || 0,
        dailyCost: parseFloat(costDaily || 0),
        weeklyOpusCost: parseFloat(weeklyOpusCost || 0),
        rateLimit: {
          requests: parseInt(rateLimitRequests || 0),
          tokens: parseInt(rateLimitTokens || 0),
          cost: parseFloat(rateLimitCost || 0),
          windowStart: rateLimitWindowStart ? parseInt(rateLimitWindowStart) : null
        },
        createdAt: keyData?.createdAt || null
      })
    }

    return statsMap
  }

  /**
   * 分批 HGETALL（避免单次 pipeline 体积过大导致内存峰值）
   * @param {string[]} keys - 要获取的 key 列表
   * @param {number} chunkSize - 每批大小，默认 500
   * @returns {Promise<Object[]>} 每个 key 对应的数据，失败的返回 null
   */
  redisClient.batchHgetallChunked = async function (keys, chunkSize = 500) {
    if (!keys || keys.length === 0) {
      return []
    }
    if (keys.length <= chunkSize) {
      return this.batchHgetall(keys)
    }

    const results = []
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize)
      const chunkResults = await this.batchHgetall(chunk)
      results.push(...chunkResults)
    }
    return results
  }

  /**
   * 分批 GET（避免单次 pipeline 体积过大）
   * @param {string[]} keys - 要获取的 key 列表
   * @param {number} chunkSize - 每批大小，默认 500
   * @returns {Promise<(string|null)[]>} 每个 key 对应的值
   */
  redisClient.batchGetChunked = async function (keys, chunkSize = 500) {
    if (!keys || keys.length === 0) {
      return []
    }

    const client = this.getClientSafe()
    if (keys.length <= chunkSize) {
      const pipeline = client.pipeline()
      keys.forEach((k) => pipeline.get(k))
      const results = await pipeline.exec()
      return results.map(([err, val]) => (err ? null : val))
    }

    const results = []
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize)
      const pipeline = client.pipeline()
      chunk.forEach((k) => pipeline.get(k))
      const chunkResults = await pipeline.exec()
      results.push(...chunkResults.map(([err, val]) => (err ? null : val)))
    }
    return results
  }

  /**
   * SCAN + 分批处理（边扫描边处理，避免全量 keys 堆内存）
   * @param {string} pattern - 匹配模式
   * @param {Function} processor - 处理函数 (keys: string[], dataList: Object[]) => void
   * @param {Object} options - 配置选项
   * @param {number} options.scanBatchSize - SCAN 每次返回数量，默认 200
   * @param {number} options.processBatchSize - 处理批次大小，默认 500
   * @param {string} options.fetchType - 获取类型：'hgetall' | 'get' | 'none'，默认 'hgetall'
   */
  redisClient.scanAndProcess = async function (pattern, processor, options = {}) {
    const { scanBatchSize = 200, processBatchSize = 500, fetchType = 'hgetall' } = options
    const client = this.getClientSafe()

    let cursor = '0'
    let pendingKeys = []
    const processedKeys = new Set() // 全程去重

    const processBatch = async (keys) => {
      if (keys.length === 0) {
        return
      }

      // 过滤已处理的 key
      const uniqueKeys = keys.filter((k) => !processedKeys.has(k))
      if (uniqueKeys.length === 0) {
        return
      }

      uniqueKeys.forEach((k) => processedKeys.add(k))

      let dataList = []
      if (fetchType === 'hgetall') {
        dataList = await this.batchHgetall(uniqueKeys)
      } else if (fetchType === 'get') {
        const pipeline = client.pipeline()
        uniqueKeys.forEach((k) => pipeline.get(k))
        const results = await pipeline.exec()
        dataList = results.map(([err, val]) => (err ? null : val))
      } else {
        dataList = uniqueKeys.map(() => null) // fetchType === 'none'
      }

      await processor(uniqueKeys, dataList)
    }

    do {
      const [newCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', scanBatchSize)
      cursor = newCursor
      pendingKeys.push(...batch)

      // 达到处理批次大小时处理
      while (pendingKeys.length >= processBatchSize) {
        const toProcess = pendingKeys.slice(0, processBatchSize)
        pendingKeys = pendingKeys.slice(processBatchSize)
        await processBatch(toProcess)
      }
    } while (cursor !== '0')

    // 处理剩余的 keys
    if (pendingKeys.length > 0) {
      await processBatch(pendingKeys)
    }
  }

  /**
   * SCAN + 分批获取所有数据（返回结果，适合需要聚合的场景）
   * @param {string} pattern - 匹配模式
   * @param {Object} options - 配置选项
   * @returns {Promise<{key: string, data: Object}[]>} key 和数据的数组
   */
  redisClient.scanAndGetAllChunked = async function (pattern, options = {}) {
    const results = []
    await this.scanAndProcess(
      pattern,
      (keys, dataList) => {
        keys.forEach((key, i) => {
          if (dataList[i] !== null) {
            results.push({ key, data: dataList[i] })
          }
        })
      },
      { ...options, fetchType: 'hgetall' }
    )
    return results
  }

  /**
   * 分批删除 keys（避免大量 DEL 阻塞）
   * @param {string[]} keys - 要删除的 key 列表
   * @param {number} chunkSize - 每批大小，默认 500
   * @returns {Promise<number>} 删除的 key 数量
   */
  redisClient.batchDelChunked = async function (keys, chunkSize = 500) {
    if (!keys || keys.length === 0) {
      return 0
    }

    const client = this.getClientSafe()
    let deleted = 0

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize)
      const pipeline = client.pipeline()
      chunk.forEach((k) => pipeline.del(k))
      const results = await pipeline.exec()
      deleted += results.filter(([err, val]) => !err && val > 0).length
    }

    return deleted
  }

  /**
   * 通用索引辅助函数：获取所有 ID（优先索引，回退 SCAN）
   * @param {string} indexKey - 索引 Set 的 key
   * @param {string} scanPattern - SCAN 的 pattern
   * @param {RegExp} extractRegex - 从 key 中提取 ID 的正则
   * @returns {Promise<string[]>} ID 列表
   */
  redisClient.getAllIdsByIndex = async function (indexKey, scanPattern, extractRegex) {
    const client = this.getClientSafe()
    // 检查是否已标记为空（避免重复 SCAN）
    const emptyMarker = await client.get(RedisKeys.emptyMarker(indexKey))
    if (emptyMarker === '1') {
      return []
    }
    let ids = await client.smembers(indexKey)
    if (ids && ids.length > 0) {
      return ids
    }
    // 回退到 SCAN（仅首次）
    const keys = await this.scanKeys(scanPattern)
    if (keys.length === 0) {
      // 标记为空，避免重复 SCAN（1小时过期，允许新数据写入后重新检测）
      await client.setex(RedisKeys.emptyMarker(indexKey), TTL.emptyMarker, '1')
      return []
    }
    ids = keys
      .map((k) => {
        const match = k.match(extractRegex)
        return match ? match[1] : null
      })
      .filter(Boolean)
    // 建立索引
    if (ids.length > 0) {
      await client.sadd(indexKey, ...ids)
    }
    return ids
  }

  /**
   * 添加到索引
   */
  redisClient.addToIndex = async function (indexKey, id) {
    const client = this.getClientSafe()
    await client.sadd(indexKey, id)
    // 清除空标记（如果存在）
    await client.del(RedisKeys.emptyMarker(indexKey))
  }

  /**
   * 从索引移除
   */
  redisClient.removeFromIndex = async function (indexKey, id) {
    const client = this.getClientSafe()
    await client.srem(indexKey, id)
  }
}

module.exports = { attach }
