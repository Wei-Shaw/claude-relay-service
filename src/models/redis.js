const Redis = require('ioredis')
const config = require('../../config/config')
const logger = require('../utils/logger')

// 时区辅助函数
// 注意：这个函数的目的是获取某个时间点在目标时区的"本地"表示
// 例如：UTC时间 2025-07-30 01:00:00 在 UTC+8 时区表示为 2025-07-30 09:00:00
function getDateInTimezone(date = new Date()) {
  const offset = config.system.timezoneOffset || 8 // 默认UTC+8

  // 方法：创建一个偏移后的Date对象，使其getUTCXXX方法返回目标时区的值
  // 这样我们可以用getUTCFullYear()等方法获取目标时区的年月日时分秒
  const offsetMs = offset * 3600000 // 时区偏移的毫秒数
  const adjustedTime = new Date(date.getTime() + offsetMs)

  return adjustedTime
}

// 获取配置时区的日期字符串 (YYYY-MM-DD)
function getDateStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)
  // 使用UTC方法获取偏移后的日期部分
  return `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    tzDate.getUTCDate()
  ).padStart(2, '0')}`
}

// 获取配置时区的小时 (0-23)
function getHourInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)
  return tzDate.getUTCHours()
}

// 获取配置时区的 ISO 周（YYYY-Wxx 格式，周一到周日）
function getWeekStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)

  // 获取年份
  const year = tzDate.getUTCFullYear()

  // 计算 ISO 周数（周一为第一天）
  const dateObj = new Date(tzDate)
  const dayOfWeek = dateObj.getUTCDay() || 7 // 将周日(0)转换为7
  const firstThursday = new Date(dateObj)
  firstThursday.setUTCDate(dateObj.getUTCDate() + 4 - dayOfWeek) // 找到这周的周四

  const yearStart = new Date(firstThursday.getUTCFullYear(), 0, 1)
  const weekNumber = Math.ceil(((firstThursday - yearStart) / 86400000 + 1) / 7)

  return `${year}-W${String(weekNumber).padStart(2, '0')}`
}

// 获取基于自定义重置日/时的周期标识符 (YYYY-MM-DDThh 格式)
// resetDay: 1-7 (周一到周日)，默认 1 (周一)
// resetHour: 0-23，默认 0 (00:00)
function getPeriodString(resetDay = 1, resetHour = 0, date = new Date()) {
  const tzDate = getDateInTimezone(date)

  // 当前时区时间的 ISO 星期几 (1=周一 ... 7=周日)
  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  // 计算距上次重置已过的天数
  let daysSinceReset = (currentDay - resetDay + 7) % 7
  // 如果同一天但还没到重置时间，视为上一个周期
  if (daysSinceReset === 0 && currentHour < resetHour) {
    daysSinceReset = 7
  }

  // 回退到周期起始日
  const periodStart = new Date(tzDate)
  periodStart.setUTCDate(tzDate.getUTCDate() - daysSinceReset)
  periodStart.setUTCHours(resetHour, 0, 0, 0)

  const y = periodStart.getUTCFullYear()
  const m = String(periodStart.getUTCMonth() + 1).padStart(2, '0')
  const d = String(periodStart.getUTCDate()).padStart(2, '0')
  const h = String(periodStart.getUTCHours()).padStart(2, '0')

  return `${y}-${m}-${d}T${h}`
}

// 获取下次重置的真实 UTC 时间（用于 402 响应中的 resetAt）
// resetDay: 1-7 (周一到周日)，默认 1 (周一)
// resetHour: 0-23，默认 0 (00:00)
function getNextResetTime(resetDay = 1, resetHour = 0) {
  const offset = config.system.timezoneOffset || 8
  const tzDate = getDateInTimezone(new Date())

  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  let daysUntilReset = (resetDay - currentDay + 7) % 7
  // 如果同一天但已过重置时间，等到下周
  if (daysUntilReset === 0 && currentHour >= resetHour) {
    daysUntilReset = 7
  }

  // 构造时区下的重置时间
  const resetTz = new Date(tzDate)
  resetTz.setUTCDate(tzDate.getUTCDate() + daysUntilReset)
  resetTz.setUTCHours(resetHour, 0, 0, 0)

  // 转换回真实 UTC：减去时区偏移
  const resetUtc = new Date(resetTz.getTime() - offset * 3600000)
  return resetUtc
}

// 获取周期起始日期的 Date 对象（时区下），用于回填时判断日期是否在当前周期内
// 返回 getDateInTimezone 风格的 Date，可用 getUTC* 获取时区本地值
function getPeriodStartDate(resetDay = 1, resetHour = 0, date = new Date()) {
  const tzDate = getDateInTimezone(date)

  const currentDay = tzDate.getUTCDay() || 7
  const currentHour = tzDate.getUTCHours()

  let daysSinceReset = (currentDay - resetDay + 7) % 7
  if (daysSinceReset === 0 && currentHour < resetHour) {
    daysSinceReset = 7
  }

  const periodStart = new Date(tzDate)
  periodStart.setUTCDate(tzDate.getUTCDate() - daysSinceReset)
  periodStart.setUTCHours(resetHour, 0, 0, 0)

  return periodStart
}

// 并发队列相关常量
const QUEUE_STATS_TTL_SECONDS = 86400 * 7 // 统计计数保留 7 天
const WAIT_TIME_TTL_SECONDS = 86400 // 等待时间样本保留 1 天（滚动窗口，无需长期保留）
// 等待时间样本数配置（提高统计置信度）
// - 每 API Key 从 100 提高到 500：提供更稳定的 P99 估计
// - 全局从 500 提高到 2000：支持更高精度的 P99.9 分析
// - 内存开销约 12-20KB（Redis quicklist 每元素 1-10 字节），可接受
// 详见 design.md Decision 5: 等待时间统计样本数
const WAIT_TIME_SAMPLES_PER_KEY = 500 // 每个 API Key 保留的等待时间样本数
const WAIT_TIME_SAMPLES_GLOBAL = 2000 // 全局保留的等待时间样本数
const QUEUE_TTL_BUFFER_SECONDS = 30 // 排队计数器TTL缓冲时间

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

  // 🔄 自动迁移 usage 索引（启动时调用）
  async migrateUsageIndex() {
    const migrationKey = 'system:migration:usage_index_v2' // v2: 添加 keymodel 迁移
    const migrated = await this.client.get(migrationKey)
    if (migrated) {
      logger.debug('📊 Usage index migration already completed')
      return
    }

    logger.info('📊 Starting usage index migration...')
    const stats = { daily: 0, hourly: 0, modelDaily: 0, modelHourly: 0 }

    try {
      // 迁移 usage:daily
      let cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:daily:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            pipeline.sadd(`usage:daily:index:${match[2]}`, match[1])
            pipeline.expire(`usage:daily:index:${match[2]}`, 86400 * 32)
            stats.daily++
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 迁移 usage:hourly
      cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:hourly:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
          if (match) {
            pipeline.sadd(`usage:hourly:index:${match[2]}`, match[1])
            pipeline.expire(`usage:hourly:index:${match[2]}`, 86400 * 7)
            stats.hourly++
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 迁移 usage:model:daily
      cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:model:daily:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:model:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            pipeline.sadd(`usage:model:daily:index:${match[2]}`, match[1])
            pipeline.expire(`usage:model:daily:index:${match[2]}`, 86400 * 32)
            stats.modelDaily++
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 迁移 usage:model:hourly
      cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:model:hourly:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:model:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
          if (match) {
            pipeline.sadd(`usage:model:hourly:index:${match[2]}`, match[1])
            pipeline.expire(`usage:model:hourly:index:${match[2]}`, 86400 * 7)
            stats.modelHourly++
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 迁移 usage:keymodel:daily (usage:{keyId}:model:daily:{model}:{date})
      cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:*:model:daily:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          // usage:{keyId}:model:daily:{model}:{date}
          const match = key.match(/^usage:([^:]+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            const [, keyId, model, date] = match
            pipeline.sadd(`usage:keymodel:daily:index:${date}`, `${keyId}:${model}`)
            pipeline.expire(`usage:keymodel:daily:index:${date}`, 86400 * 32)
            stats.keymodelDaily = (stats.keymodelDaily || 0) + 1
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 迁移 usage:keymodel:hourly (usage:{keyId}:model:hourly:{model}:{hour})
      cursor = '0'
      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:*:model:hourly:*',
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          // usage:{keyId}:model:hourly:{model}:{hour}
          const match = key.match(/^usage:([^:]+):model:hourly:(.+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
          if (match) {
            const [, keyId, model, hour] = match
            pipeline.sadd(`usage:keymodel:hourly:index:${hour}`, `${keyId}:${model}`)
            pipeline.expire(`usage:keymodel:hourly:index:${hour}`, 86400 * 7)
            stats.keymodelHourly = (stats.keymodelHourly || 0) + 1
          }
        }
        if (keys.length > 0) {
          await pipeline.exec()
        }
      } while (cursor !== '0')

      // 标记迁移完成
      await this.client.set(migrationKey, Date.now().toString())
      logger.info(
        `📊 Usage index migration completed: daily=${stats.daily}, hourly=${stats.hourly}, modelDaily=${stats.modelDaily}, modelHourly=${stats.modelHourly}, keymodelDaily=${stats.keymodelDaily || 0}, keymodelHourly=${stats.keymodelHourly || 0}`
      )
    } catch (error) {
      logger.error('📊 Usage index migration failed:', error)
    }
  }

  // 🔄 自动迁移 alltime 模型统计（启动时调用）
  async migrateAlltimeModelStats() {
    const migrationKey = 'system:migration:alltime_model_stats_v1'
    const migrated = await this.client.get(migrationKey)
    if (migrated) {
      logger.debug('📊 Alltime model stats migration already completed')
      return
    }

    logger.info('📊 Starting alltime model stats migration...')
    const stats = { keys: 0, models: 0 }

    try {
      // 扫描所有月度模型统计数据并聚合到 alltime
      // 格式: usage:{keyId}:model:monthly:{model}:{month}
      let cursor = '0'
      const aggregatedData = new Map() // keyId:model -> {inputTokens, outputTokens, ...}

      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          'usage:*:model:monthly:*:*',
          'COUNT',
          500
        )
        cursor = newCursor

        for (const key of keys) {
          // usage:{keyId}:model:monthly:{model}:{month}
          const match = key.match(/^usage:([^:]+):model:monthly:(.+):(\d{4}-\d{2})$/)
          if (match) {
            const [, keyId, model] = match
            const aggregateKey = `${keyId}:${model}`

            // 获取该月的数据
            const data = await this.client.hgetall(key)
            if (data && Object.keys(data).length > 0) {
              if (!aggregatedData.has(aggregateKey)) {
                aggregatedData.set(aggregateKey, {
                  keyId,
                  model,
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreateTokens: 0,
                  cacheReadTokens: 0,
                  requests: 0
                })
              }

              const agg = aggregatedData.get(aggregateKey)
              agg.inputTokens += parseInt(data.inputTokens) || 0
              agg.outputTokens += parseInt(data.outputTokens) || 0
              agg.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              agg.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
              agg.requests += parseInt(data.requests) || 0
              stats.keys++
            }
          }
        }
      } while (cursor !== '0')

      // 写入聚合后的 alltime 数据
      const pipeline = this.client.pipeline()
      for (const [, agg] of aggregatedData) {
        const alltimeKey = `usage:${agg.keyId}:model:alltime:${agg.model}`
        pipeline.hset(alltimeKey, {
          inputTokens: agg.inputTokens.toString(),
          outputTokens: agg.outputTokens.toString(),
          cacheCreateTokens: agg.cacheCreateTokens.toString(),
          cacheReadTokens: agg.cacheReadTokens.toString(),
          requests: agg.requests.toString()
        })
        stats.models++
      }

      if (stats.models > 0) {
        await pipeline.exec()
      }

      // 标记迁移完成
      await this.client.set(migrationKey, Date.now().toString())
      logger.info(
        `📊 Alltime model stats migration completed: scanned ${stats.keys} monthly keys, created ${stats.models} alltime keys`
      )
    } catch (error) {
      logger.error('📊 Alltime model stats migration failed:', error)
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

  // 🔑 API Key 相关操作
  async setApiKey(keyId, keyData, hashedKey = null) {
    const key = `apikey:${keyId}`
    const client = this.getClientSafe()

    // 维护哈希映射表（用于快速查找）
    // hashedKey参数是实际的哈希值，用于建立映射
    if (hashedKey) {
      await client.hset('apikey:hash_map', hashedKey, keyId)
    }

    await client.hset(key, keyData)
    await client.expire(key, 86400 * 365) // 1年过期
  }

  async getApiKey(keyId) {
    const key = `apikey:${keyId}`
    return await this.client.hgetall(key)
  }

  async deleteApiKey(keyId) {
    const key = `apikey:${keyId}`

    // 获取要删除的API Key哈希值，以便从映射表中移除
    const keyData = await this.client.hgetall(key)
    if (keyData && keyData.apiKey) {
      // keyData.apiKey现在存储的是哈希值，直接从映射表删除
      await this.client.hdel('apikey:hash_map', keyData.apiKey)
    }

    return await this.client.del(key)
  }

  async getAllApiKeys() {
    const keys = await this.scanKeys('apikey:*')
    const apiKeys = []
    const dataList = await this.batchHgetallChunked(keys)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // 过滤掉hash_map，它不是真正的API Key
      if (key === 'apikey:hash_map') {
        continue
      }

      const keyData = dataList[i]
      if (keyData && Object.keys(keyData).length > 0) {
        apiKeys.push({ id: key.replace('apikey:', ''), ...keyData })
      }
    }
    return apiKeys
  }

  /**
   * 使用 SCAN 获取所有 API Key ID（避免 KEYS 命令阻塞）
   * @returns {Promise<string[]>} API Key ID 列表（已去重）
   */
  async scanApiKeyIds() {
    const keyIds = new Set()
    let cursor = '0'
    // 排除索引 key 的前缀
    const excludePrefixes = [
      'apikey:hash_map',
      'apikey:idx:',
      'apikey:set:',
      'apikey:tags:',
      'apikey:index:'
    ]

    do {
      const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', 'apikey:*', 'COUNT', 100)
      cursor = newCursor

      for (const key of keys) {
        // 只接受 apikey:<uuid> 形态，排除索引 key
        if (excludePrefixes.some((prefix) => key.startsWith(prefix))) {
          continue
        }
        // 确保是 apikey:<id> 格式（只有一个冒号）
        if (key.split(':').length !== 2) {
          continue
        }
        keyIds.add(key.replace('apikey:', ''))
      }
    } while (cursor !== '0')

    return [...keyIds]
  }

  // 添加标签到全局标签集合
  async addTag(tagName) {
    await this.client.sadd('apikey:tags:all', tagName)
  }

  // 从全局标签集合删除标签
  async removeTag(tagName) {
    await this.client.srem('apikey:tags:all', tagName)
  }

  // 获取全局标签集合
  async getGlobalTags() {
    return await this.client.smembers('apikey:tags:all')
  }

  /**
   * 使用索引获取所有 API Key 的标签（优化版本）
   * 优先级：索引就绪时用 apikey:tags:all > apikey:idx:all + pipeline > SCAN
   * @returns {Promise<string[]>} 去重排序后的标签列表
   */
  async scanAllApiKeyTags() {
    // 检查索引是否就绪（非重建中且版本号正确）
    const isIndexReady = await this._checkIndexReady()

    if (isIndexReady) {
      // 方案1：直接读取索引服务维护的标签集合
      const cachedTags = await this.client.smembers('apikey:tags:all')
      if (cachedTags && cachedTags.length > 0) {
        // 保持 trim 一致性
        return cachedTags
          .map((t) => (t ? t.trim() : ''))
          .filter((t) => t)
          .sort()
      }

      // 方案2：使用索引的 key ID 列表 + pipeline
      const indexedKeyIds = await this.client.smembers('apikey:idx:all')
      if (indexedKeyIds && indexedKeyIds.length > 0) {
        return this._extractTagsFromKeyIds(indexedKeyIds)
      }
    }

    // 方案3：回退到 SCAN（索引未就绪或重建中）
    return this._scanTagsFallback()
  }

  /**
   * 检查索引是否就绪
   */
  async _checkIndexReady() {
    try {
      const version = await this.client.get('apikey:index:version')
      // 版本号 >= 2 表示索引就绪
      return parseInt(version) >= 2
    } catch {
      return false
    }
  }

  async _extractTagsFromKeyIds(keyIds) {
    const tagSet = new Set()
    const pipeline = this.client.pipeline()
    for (const keyId of keyIds) {
      pipeline.hmget(`apikey:${keyId}`, 'tags', 'isDeleted')
    }

    const results = await pipeline.exec()
    if (!results) {
      return []
    }

    for (const result of results) {
      if (!result) {
        continue
      }
      const [err, values] = result
      if (err || !values) {
        continue
      }
      const [tags, isDeleted] = values
      if (isDeleted === 'true' || !tags) {
        continue
      }

      try {
        const parsed = JSON.parse(tags)
        if (Array.isArray(parsed)) {
          for (const tag of parsed) {
            if (tag && typeof tag === 'string' && tag.trim()) {
              tagSet.add(tag.trim())
            }
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
    return Array.from(tagSet).sort()
  }

  async _scanTagsFallback() {
    const tagSet = new Set()
    let cursor = '0'

    do {
      const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', 'apikey:*', 'COUNT', 100)
      cursor = newCursor

      const validKeys = keys.filter((k) => k !== 'apikey:hash_map' && k.split(':').length === 2)
      if (validKeys.length === 0) {
        continue
      }

      const pipeline = this.client.pipeline()
      for (const key of validKeys) {
        pipeline.hmget(key, 'tags', 'isDeleted')
      }

      const results = await pipeline.exec()
      if (!results) {
        continue
      }

      for (const result of results) {
        if (!result) {
          continue
        }
        const [err, values] = result
        if (err || !values) {
          continue
        }
        const [tags, isDeleted] = values
        if (isDeleted === 'true' || !tags) {
          continue
        }

        try {
          const parsed = JSON.parse(tags)
          if (Array.isArray(parsed)) {
            for (const tag of parsed) {
              if (tag && typeof tag === 'string' && tag.trim()) {
                tagSet.add(tag.trim())
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    } while (cursor !== '0')

    return Array.from(tagSet).sort()
  }

  /**
   * 批量获取 API Key 数据（使用 Pipeline 优化）
   * @param {string[]} keyIds - API Key ID 列表
   * @returns {Promise<Object[]>} API Key 数据列表
   */
  async batchGetApiKeys(keyIds) {
    if (!keyIds || keyIds.length === 0) {
      return []
    }

    const pipeline = this.client.pipeline()
    for (const keyId of keyIds) {
      pipeline.hgetall(`apikey:${keyId}`)
    }

    const results = await pipeline.exec()
    const apiKeys = []

    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i]
      if (!err && data && Object.keys(data).length > 0) {
        apiKeys.push({ id: keyIds[i], ...this._parseApiKeyData(data) })
      }
    }

    return apiKeys
  }

  /**
   * 解析 API Key 数据，将字符串转换为正确的类型
   * @param {Object} data - 原始数据
   * @returns {Object} 解析后的数据
   */
  _parseApiKeyData(data) {
    if (!data) {
      return data
    }

    const parsed = { ...data }

    // 布尔字段
    const boolFields = ['isActive', 'enableModelRestriction', 'isDeleted', 'allow1mContext']
    for (const field of boolFields) {
      if (parsed[field] !== undefined) {
        parsed[field] = parsed[field] === 'true'
      }
    }

    // 数字字段
    const numFields = [
      'tokenLimit',
      'dailyCostLimit',
      'totalCostLimit',
      'rateLimitRequests',
      'rateLimitTokens',
      'rateLimitWindow',
      'rateLimitCost',
      'maxConcurrency',
      'activationDuration'
    ]
    for (const field of numFields) {
      if (parsed[field] !== undefined && parsed[field] !== '') {
        parsed[field] = parseFloat(parsed[field]) || 0
      }
    }

    // 数组字段（JSON 解析）
    const arrayFields = ['tags', 'restrictedModels', 'allowedClients']
    for (const field of arrayFields) {
      if (parsed[field]) {
        try {
          parsed[field] = JSON.parse(parsed[field])
        } catch (e) {
          parsed[field] = []
        }
      }
    }

    // 对象字段（JSON 解析）
    const objectFields = ['serviceRates']
    for (const field of objectFields) {
      if (parsed[field]) {
        try {
          parsed[field] = JSON.parse(parsed[field])
        } catch (e) {
          parsed[field] = {}
        }
      }
    }

    return parsed
  }

  /**
   * 获取 API Keys 分页数据（不含费用，用于优化列表加载）
   * @param {Object} options - 分页和筛选选项
   * @returns {Promise<{items: Object[], pagination: Object, availableTags: string[]}>}
   */
  async getApiKeysPaginated(options = {}) {
    const {
      page = 1,
      pageSize = 20,
      searchMode = 'apiKey',
      search = '',
      tag = '',
      isActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      excludeDeleted = true, // 默认排除已删除的 API Keys
      modelFilter = []
    } = options

    // 尝试使用索引查询（性能优化）
    const apiKeyIndexService = require('../services/apiKeyIndexService')
    const indexReady = await apiKeyIndexService.isIndexReady()

    // 索引路径支持的条件：
    // - 无模型筛选（需要查询使用记录）
    // - 非 bindingAccount 搜索模式（索引不支持）
    // - 非 status/expiresAt 排序（索引不支持）
    // - 无搜索关键词（索引只搜 name，旧逻辑搜 name+owner，不一致）
    const canUseIndex =
      indexReady &&
      modelFilter.length === 0 &&
      searchMode !== 'bindingAccount' &&
      !['status', 'expiresAt'].includes(sortBy) &&
      !search

    if (canUseIndex) {
      // 使用索引查询
      try {
        return await apiKeyIndexService.queryWithIndex({
          page,
          pageSize,
          sortBy,
          sortOrder,
          isActive: isActive === '' ? undefined : isActive === 'true' || isActive === true,
          tag,
          excludeDeleted
        })
      } catch (error) {
        logger.warn('⚠️ 索引查询失败，降级到全量扫描:', error.message)
      }
    }

    // 降级：使用 SCAN 获取所有 apikey:* 的 ID 列表（避免阻塞）
    const keyIds = await this.scanApiKeyIds()

    // 2. 使用 Pipeline 批量获取基础数据
    const apiKeys = await this.batchGetApiKeys(keyIds)

    // 3. 应用筛选条件
    let filteredKeys = apiKeys

    // 排除已删除的 API Keys（默认行为）
    if (excludeDeleted) {
      filteredKeys = filteredKeys.filter((k) => !k.isDeleted)
    }

    // 状态筛选
    if (isActive !== '' && isActive !== undefined && isActive !== null) {
      const activeValue = isActive === 'true' || isActive === true
      filteredKeys = filteredKeys.filter((k) => k.isActive === activeValue)
    }

    // 标签筛选
    if (tag) {
      filteredKeys = filteredKeys.filter((k) => {
        const tags = Array.isArray(k.tags) ? k.tags : []
        return tags.includes(tag)
      })
    }

    // 搜索
    if (search) {
      const lowerSearch = search.toLowerCase().trim()
      if (searchMode === 'apiKey') {
        // apiKey 模式：搜索名称和拥有者
        filteredKeys = filteredKeys.filter(
          (k) =>
            (k.name && k.name.toLowerCase().includes(lowerSearch)) ||
            (k.ownerDisplayName && k.ownerDisplayName.toLowerCase().includes(lowerSearch))
        )
      } else if (searchMode === 'bindingAccount') {
        // bindingAccount 模式：直接在Redis层处理，避免路由层加载10000条
        const accountNameCacheService = require('../services/accountNameCacheService')
        filteredKeys = accountNameCacheService.searchByBindingAccount(filteredKeys, lowerSearch)
      }
    }

    // 模型筛选
    if (modelFilter.length > 0) {
      const keyIdsWithModels = await this.getKeyIdsWithModels(
        filteredKeys.map((k) => k.id),
        modelFilter
      )
      filteredKeys = filteredKeys.filter((k) => keyIdsWithModels.has(k.id))
    }

    // 4. 排序
    filteredKeys.sort((a, b) => {
      // status 排序实际上使用 isActive 字段（API Key 没有 status 字段）
      const effectiveSortBy = sortBy === 'status' ? 'isActive' : sortBy
      let aVal = a[effectiveSortBy]
      let bVal = b[effectiveSortBy]

      // 日期字段转时间戳
      if (['createdAt', 'expiresAt', 'lastUsedAt'].includes(effectiveSortBy)) {
        aVal = aVal ? new Date(aVal).getTime() : 0
        bVal = bVal ? new Date(bVal).getTime() : 0
      }

      // 布尔字段转数字
      if (effectiveSortBy === 'isActive') {
        aVal = aVal ? 1 : 0
        bVal = bVal ? 1 : 0
      }

      // 字符串字段
      if (sortBy === 'name') {
        aVal = (aVal || '').toLowerCase()
        bVal = (bVal || '').toLowerCase()
      }

      if (aVal < bVal) {
        return sortOrder === 'asc' ? -1 : 1
      }
      if (aVal > bVal) {
        return sortOrder === 'asc' ? 1 : -1
      }
      return 0
    })

    // 5. 收集所有可用标签（在分页之前）
    const allTags = new Set()
    for (const key of apiKeys) {
      const tags = Array.isArray(key.tags) ? key.tags : []
      tags.forEach((t) => allTags.add(t))
    }
    const availableTags = [...allTags].sort()

    // 6. 分页
    const total = filteredKeys.length
    const totalPages = Math.ceil(total / pageSize) || 1
    const validPage = Math.min(Math.max(1, page), totalPages)
    const start = (validPage - 1) * pageSize
    const items = filteredKeys.slice(start, start + pageSize)

    return {
      items,
      pagination: {
        page: validPage,
        pageSize,
        total,
        totalPages
      },
      availableTags
    }
  }

  // 🔍 通过哈希值查找API Key（性能优化）
  async findApiKeyByHash(hashedKey) {
    // 使用反向映射表：hash -> keyId
    let keyId = await this.client.hget('apikey:hash_map', hashedKey)

    // 回退：查旧结构 apikey_hash:*（启动回填未完成时兼容）
    if (!keyId) {
      const oldData = await this.client.hgetall(`apikey_hash:${hashedKey}`)
      if (oldData && oldData.id) {
        keyId = oldData.id
        // 回填到 hash_map
        await this.client.hset('apikey:hash_map', hashedKey, keyId)
      }
    }

    if (!keyId) {
      return null
    }

    const keyData = await this.client.hgetall(`apikey:${keyId}`)
    if (keyData && Object.keys(keyData).length > 0) {
      return { id: keyId, ...keyData }
    }

    // 如果数据不存在，清理映射表
    await this.client.hdel('apikey:hash_map', hashedKey)
    return null
  }

  // 📊 使用统计相关操作（支持缓存token统计和模型信息）
  // 标准化模型名称，用于统计聚合
  _normalizeModelName(model) {
    if (!model || model === 'unknown') {
      return model
    }

    // 对于Bedrock模型，去掉区域前缀进行统一
    if (model.includes('.anthropic.') || model.includes('.claude')) {
      // 匹配所有AWS区域格式：region.anthropic.model-name-v1:0 -> claude-model-name
      // 支持所有AWS区域格式，如：us-east-1, eu-west-1, ap-southeast-1, ca-central-1等
      let normalized = model.replace(/^[a-z0-9-]+\./, '') // 去掉任何区域前缀（更通用）
      normalized = normalized.replace('anthropic.', '') // 去掉anthropic前缀
      normalized = normalized.replace(/-v\d+:\d+$/, '') // 去掉版本后缀（如-v1:0, -v2:1等）
      return normalized
    }

    // 对于其他模型，去掉常见的版本后缀
    return model.replace(/-v\d+:\d+$|:latest$/, '')
  }

  async incrementTokenUsage(
    keyId,
    tokens,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    ephemeral5mTokens = 0, // 新增：5分钟缓存 tokens
    ephemeral1hTokens = 0, // 新增：1小时缓存 tokens
    isLongContextRequest = false, // 新增：是否为 1M 上下文请求（超过200k）
    realCost = 0, // 真实费用（官方API费用）
    ratedCost = 0 // 计费费用（应用倍率后）
  ) {
    const key = `usage:${keyId}`
    const now = new Date()
    const today = getDateStringInTimezone(now)
    const tzDate = getDateInTimezone(now)
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const currentHour = `${today}:${String(getHourInTimezone(now)).padStart(2, '0')}` // 新增小时级别

    const daily = `usage:daily:${keyId}:${today}`
    const monthly = `usage:monthly:${keyId}:${currentMonth}`
    const hourly = `usage:hourly:${keyId}:${currentHour}` // 新增小时级别key

    // 标准化模型名用于统计聚合
    const normalizedModel = this._normalizeModelName(model)

    // 按模型统计的键
    const modelDaily = `usage:model:daily:${normalizedModel}:${today}`
    const modelMonthly = `usage:model:monthly:${normalizedModel}:${currentMonth}`
    const modelHourly = `usage:model:hourly:${normalizedModel}:${currentHour}` // 新增模型小时级别

    // API Key级别的模型统计
    const keyModelDaily = `usage:${keyId}:model:daily:${normalizedModel}:${today}`
    const keyModelMonthly = `usage:${keyId}:model:monthly:${normalizedModel}:${currentMonth}`
    const keyModelHourly = `usage:${keyId}:model:hourly:${normalizedModel}:${currentHour}` // 新增API Key模型小时级别

    // 新增：系统级分钟统计
    const minuteTimestamp = Math.floor(now.getTime() / 60000)
    const systemMinuteKey = `system:metrics:minute:${minuteTimestamp}`

    // 智能处理输入输出token分配
    const finalInputTokens = inputTokens || 0
    const finalOutputTokens = outputTokens || (finalInputTokens > 0 ? 0 : tokens)
    const finalCacheCreateTokens = cacheCreateTokens || 0
    const finalCacheReadTokens = cacheReadTokens || 0

    // 重新计算真实的总token数（包括缓存token）
    const totalTokens =
      finalInputTokens + finalOutputTokens + finalCacheCreateTokens + finalCacheReadTokens
    // 核心token（不包括缓存）- 用于与历史数据兼容
    const coreTokens = finalInputTokens + finalOutputTokens

    // 使用Pipeline优化性能
    const pipeline = this.client.pipeline()

    // 现有的统计保持不变
    // 核心token统计（保持向后兼容）
    pipeline.hincrby(key, 'totalTokens', coreTokens)
    pipeline.hincrby(key, 'totalInputTokens', finalInputTokens)
    pipeline.hincrby(key, 'totalOutputTokens', finalOutputTokens)
    // 缓存token统计（新增）
    pipeline.hincrby(key, 'totalCacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(key, 'totalCacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(key, 'totalAllTokens', totalTokens) // 包含所有类型的总token
    // 详细缓存类型统计（新增）
    pipeline.hincrby(key, 'totalEphemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(key, 'totalEphemeral1hTokens', ephemeral1hTokens)
    // 1M 上下文请求统计（新增）
    if (isLongContextRequest) {
      pipeline.hincrby(key, 'totalLongContextInputTokens', finalInputTokens)
      pipeline.hincrby(key, 'totalLongContextOutputTokens', finalOutputTokens)
      pipeline.hincrby(key, 'totalLongContextRequests', 1)
    }
    // 请求计数
    pipeline.hincrby(key, 'totalRequests', 1)

    // 每日统计
    pipeline.hincrby(daily, 'tokens', coreTokens)
    pipeline.hincrby(daily, 'inputTokens', finalInputTokens)
    pipeline.hincrby(daily, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(daily, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(daily, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(daily, 'allTokens', totalTokens)
    pipeline.hincrby(daily, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(daily, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(daily, 'ephemeral1hTokens', ephemeral1hTokens)
    // 1M 上下文请求统计
    if (isLongContextRequest) {
      pipeline.hincrby(daily, 'longContextInputTokens', finalInputTokens)
      pipeline.hincrby(daily, 'longContextOutputTokens', finalOutputTokens)
      pipeline.hincrby(daily, 'longContextRequests', 1)
    }

    // 每月统计
    pipeline.hincrby(monthly, 'tokens', coreTokens)
    pipeline.hincrby(monthly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(monthly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(monthly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(monthly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(monthly, 'allTokens', totalTokens)
    pipeline.hincrby(monthly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(monthly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(monthly, 'ephemeral1hTokens', ephemeral1hTokens)

    // 按模型统计 - 每日
    pipeline.hincrby(modelDaily, 'inputTokens', finalInputTokens)
    pipeline.hincrby(modelDaily, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(modelDaily, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(modelDaily, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(modelDaily, 'allTokens', totalTokens)
    pipeline.hincrby(modelDaily, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(modelDaily, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(modelDaily, 'ephemeral1hTokens', ephemeral1hTokens)

    // 按模型统计 - 每月
    pipeline.hincrby(modelMonthly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(modelMonthly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(modelMonthly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(modelMonthly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(modelMonthly, 'allTokens', totalTokens)
    pipeline.hincrby(modelMonthly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(modelMonthly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(modelMonthly, 'ephemeral1hTokens', ephemeral1hTokens)

    // API Key级别的模型统计 - 每日
    pipeline.hincrby(keyModelDaily, 'inputTokens', finalInputTokens)
    pipeline.hincrby(keyModelDaily, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(keyModelDaily, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(keyModelDaily, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(keyModelDaily, 'allTokens', totalTokens)
    pipeline.hincrby(keyModelDaily, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(keyModelDaily, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(keyModelDaily, 'ephemeral1hTokens', ephemeral1hTokens)
    // 费用统计（使用整数存储，单位：微美元，1美元=1000000微美元）
    if (realCost > 0) {
      pipeline.hincrby(keyModelDaily, 'realCostMicro', Math.round(realCost * 1000000))
    }
    if (ratedCost > 0) {
      pipeline.hincrby(keyModelDaily, 'ratedCostMicro', Math.round(ratedCost * 1000000))
    }

    // API Key级别的模型统计 - 每月
    pipeline.hincrby(keyModelMonthly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(keyModelMonthly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(keyModelMonthly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(keyModelMonthly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(keyModelMonthly, 'allTokens', totalTokens)
    pipeline.hincrby(keyModelMonthly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(keyModelMonthly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(keyModelMonthly, 'ephemeral1hTokens', ephemeral1hTokens)
    // 费用统计
    if (realCost > 0) {
      pipeline.hincrby(keyModelMonthly, 'realCostMicro', Math.round(realCost * 1000000))
    }
    if (ratedCost > 0) {
      pipeline.hincrby(keyModelMonthly, 'ratedCostMicro', Math.round(ratedCost * 1000000))
    }

    // API Key级别的模型统计 - 所有时间（无 TTL）
    const keyModelAlltime = `usage:${keyId}:model:alltime:${normalizedModel}`
    pipeline.hincrby(keyModelAlltime, 'inputTokens', finalInputTokens)
    pipeline.hincrby(keyModelAlltime, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(keyModelAlltime, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(keyModelAlltime, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(keyModelAlltime, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(keyModelAlltime, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(keyModelAlltime, 'ephemeral1hTokens', ephemeral1hTokens)
    // 费用统计
    if (realCost > 0) {
      pipeline.hincrby(keyModelAlltime, 'realCostMicro', Math.round(realCost * 1000000))
    }
    if (ratedCost > 0) {
      pipeline.hincrby(keyModelAlltime, 'ratedCostMicro', Math.round(ratedCost * 1000000))
    }

    // 小时级别统计
    pipeline.hincrby(hourly, 'tokens', coreTokens)
    pipeline.hincrby(hourly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(hourly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(hourly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(hourly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(hourly, 'allTokens', totalTokens)
    pipeline.hincrby(hourly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(hourly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(hourly, 'ephemeral1hTokens', ephemeral1hTokens)

    // 按模型统计 - 每小时
    pipeline.hincrby(modelHourly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(modelHourly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(modelHourly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(modelHourly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(modelHourly, 'allTokens', totalTokens)
    pipeline.hincrby(modelHourly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(modelHourly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(modelHourly, 'ephemeral1hTokens', ephemeral1hTokens)

    // API Key级别的模型统计 - 每小时
    pipeline.hincrby(keyModelHourly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(keyModelHourly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(keyModelHourly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(keyModelHourly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(keyModelHourly, 'allTokens', totalTokens)
    pipeline.hincrby(keyModelHourly, 'requests', 1)
    // 详细缓存类型统计
    pipeline.hincrby(keyModelHourly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(keyModelHourly, 'ephemeral1hTokens', ephemeral1hTokens)
    // 费用统计
    if (realCost > 0) {
      pipeline.hincrby(keyModelHourly, 'realCostMicro', Math.round(realCost * 1000000))
    }
    if (ratedCost > 0) {
      pipeline.hincrby(keyModelHourly, 'ratedCostMicro', Math.round(ratedCost * 1000000))
    }

    // 新增：系统级分钟统计
    pipeline.hincrby(systemMinuteKey, 'requests', 1)
    pipeline.hincrby(systemMinuteKey, 'totalTokens', totalTokens)
    pipeline.hincrby(systemMinuteKey, 'inputTokens', finalInputTokens)
    pipeline.hincrby(systemMinuteKey, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(systemMinuteKey, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(systemMinuteKey, 'cacheReadTokens', finalCacheReadTokens)

    // 设置过期时间
    pipeline.expire(daily, 86400 * 32) // 32天过期
    pipeline.expire(monthly, 86400 * 365) // 1年过期
    pipeline.expire(hourly, 86400 * 7) // 小时统计7天过期
    pipeline.expire(modelDaily, 86400 * 32) // 模型每日统计32天过期
    pipeline.expire(modelMonthly, 86400 * 365) // 模型每月统计1年过期
    pipeline.expire(modelHourly, 86400 * 7) // 模型小时统计7天过期
    pipeline.expire(keyModelDaily, 86400 * 32) // API Key模型每日统计32天过期
    pipeline.expire(keyModelMonthly, 86400 * 365) // API Key模型每月统计1年过期
    pipeline.expire(keyModelHourly, 86400 * 7) // API Key模型小时统计7天过期

    // 系统级分钟统计的过期时间（窗口时间的2倍，默认5分钟）
    const configLocal = require('../../config/config')
    const metricsWindow = configLocal.system?.metricsWindow || 5
    pipeline.expire(systemMinuteKey, metricsWindow * 60 * 2)

    // 添加索引（用于快速查询，避免 SCAN）
    pipeline.sadd(`usage:daily:index:${today}`, keyId)
    pipeline.sadd(`usage:hourly:index:${currentHour}`, keyId)
    pipeline.sadd(`usage:model:daily:index:${today}`, normalizedModel)
    pipeline.sadd(`usage:model:hourly:index:${currentHour}`, normalizedModel)
    pipeline.sadd(`usage:model:monthly:index:${currentMonth}`, normalizedModel)
    pipeline.sadd('usage:model:monthly:months', currentMonth) // 全局月份索引
    pipeline.sadd(`usage:keymodel:daily:index:${today}`, `${keyId}:${normalizedModel}`)
    pipeline.sadd(`usage:keymodel:hourly:index:${currentHour}`, `${keyId}:${normalizedModel}`)
    // 清理空标记（有新数据时）
    pipeline.del(`usage:daily:index:${today}:empty`)
    pipeline.del(`usage:hourly:index:${currentHour}:empty`)
    pipeline.del(`usage:model:daily:index:${today}:empty`)
    pipeline.del(`usage:model:hourly:index:${currentHour}:empty`)
    pipeline.del(`usage:model:monthly:index:${currentMonth}:empty`)
    pipeline.del(`usage:keymodel:daily:index:${today}:empty`)
    pipeline.del(`usage:keymodel:hourly:index:${currentHour}:empty`)
    // 索引过期时间
    pipeline.expire(`usage:daily:index:${today}`, 86400 * 32)
    pipeline.expire(`usage:hourly:index:${currentHour}`, 86400 * 7)
    pipeline.expire(`usage:model:daily:index:${today}`, 86400 * 32)
    pipeline.expire(`usage:model:hourly:index:${currentHour}`, 86400 * 7)
    pipeline.expire(`usage:model:monthly:index:${currentMonth}`, 86400 * 365)
    pipeline.expire(`usage:keymodel:daily:index:${today}`, 86400 * 32)
    pipeline.expire(`usage:keymodel:hourly:index:${currentHour}`, 86400 * 7)

    // 全局预聚合统计
    const globalDaily = `usage:global:daily:${today}`
    const globalMonthly = `usage:global:monthly:${currentMonth}`
    pipeline.hincrby('usage:global:total', 'requests', 1)
    pipeline.hincrby('usage:global:total', 'inputTokens', finalInputTokens)
    pipeline.hincrby('usage:global:total', 'outputTokens', finalOutputTokens)
    pipeline.hincrby('usage:global:total', 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby('usage:global:total', 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby('usage:global:total', 'allTokens', totalTokens)
    pipeline.hincrby('usage:global:total', 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby('usage:global:total', 'ephemeral1hTokens', ephemeral1hTokens)
    pipeline.hincrby(globalDaily, 'requests', 1)
    pipeline.hincrby(globalDaily, 'inputTokens', finalInputTokens)
    pipeline.hincrby(globalDaily, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(globalDaily, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(globalDaily, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(globalDaily, 'allTokens', totalTokens)
    pipeline.hincrby(globalDaily, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(globalDaily, 'ephemeral1hTokens', ephemeral1hTokens)
    pipeline.hincrby(globalMonthly, 'requests', 1)
    pipeline.hincrby(globalMonthly, 'inputTokens', finalInputTokens)
    pipeline.hincrby(globalMonthly, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(globalMonthly, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(globalMonthly, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(globalMonthly, 'allTokens', totalTokens)
    pipeline.hincrby(globalMonthly, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(globalMonthly, 'ephemeral1hTokens', ephemeral1hTokens)
    pipeline.expire(globalDaily, 86400 * 32)
    pipeline.expire(globalMonthly, 86400 * 365)

    // 执行Pipeline
    await pipeline.exec()
  }

  // 📊 记录账户级别的使用统计
  async incrementAccountUsage(
    accountId,
    totalTokens,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    ephemeral5mTokens = 0,
    ephemeral1hTokens = 0,
    model = 'unknown',
    isLongContextRequest = false
  ) {
    const now = new Date()
    const today = getDateStringInTimezone(now)
    const tzDate = getDateInTimezone(now)
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const currentHour = `${today}:${String(getHourInTimezone(now)).padStart(2, '0')}`

    // 账户级别统计的键
    const accountKey = `account_usage:${accountId}`
    const accountDaily = `account_usage:daily:${accountId}:${today}`
    const accountMonthly = `account_usage:monthly:${accountId}:${currentMonth}`
    const accountHourly = `account_usage:hourly:${accountId}:${currentHour}`

    // 标准化模型名用于统计聚合
    const normalizedModel = this._normalizeModelName(model)

    // 账户按模型统计的键
    const accountModelDaily = `account_usage:model:daily:${accountId}:${normalizedModel}:${today}`
    const accountModelMonthly = `account_usage:model:monthly:${accountId}:${normalizedModel}:${currentMonth}`
    const accountModelHourly = `account_usage:model:hourly:${accountId}:${normalizedModel}:${currentHour}`

    // 处理token分配
    const finalInputTokens = inputTokens || 0
    const finalOutputTokens = outputTokens || 0
    const finalCacheCreateTokens = cacheCreateTokens || 0
    const finalCacheReadTokens = cacheReadTokens || 0
    const finalEphemeral5mTokens = ephemeral5mTokens || 0
    const finalEphemeral1hTokens = ephemeral1hTokens || 0
    const actualTotalTokens =
      finalInputTokens + finalOutputTokens + finalCacheCreateTokens + finalCacheReadTokens
    const coreTokens = finalInputTokens + finalOutputTokens

    // 构建统计操作数组
    const operations = [
      // 账户总体统计
      this.client.hincrby(accountKey, 'totalTokens', coreTokens),
      this.client.hincrby(accountKey, 'totalInputTokens', finalInputTokens),
      this.client.hincrby(accountKey, 'totalOutputTokens', finalOutputTokens),
      this.client.hincrby(accountKey, 'totalCacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountKey, 'totalCacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountKey, 'totalEphemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountKey, 'totalEphemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountKey, 'totalAllTokens', actualTotalTokens),
      this.client.hincrby(accountKey, 'totalRequests', 1),

      // 账户每日统计
      this.client.hincrby(accountDaily, 'tokens', coreTokens),
      this.client.hincrby(accountDaily, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountDaily, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountDaily, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountDaily, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountDaily, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountDaily, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountDaily, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountDaily, 'requests', 1),

      // 账户每月统计
      this.client.hincrby(accountMonthly, 'tokens', coreTokens),
      this.client.hincrby(accountMonthly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountMonthly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountMonthly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountMonthly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountMonthly, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountMonthly, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountMonthly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountMonthly, 'requests', 1),

      // 账户每小时统计
      this.client.hincrby(accountHourly, 'tokens', coreTokens),
      this.client.hincrby(accountHourly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountHourly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountHourly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountHourly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountHourly, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountHourly, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountHourly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountHourly, 'requests', 1),

      // 添加模型级别的数据到hourly键中，以支持会话窗口的统计
      this.client.hincrby(accountHourly, `model:${normalizedModel}:inputTokens`, finalInputTokens),
      this.client.hincrby(
        accountHourly,
        `model:${normalizedModel}:outputTokens`,
        finalOutputTokens
      ),
      this.client.hincrby(
        accountHourly,
        `model:${normalizedModel}:cacheCreateTokens`,
        finalCacheCreateTokens
      ),
      this.client.hincrby(
        accountHourly,
        `model:${normalizedModel}:cacheReadTokens`,
        finalCacheReadTokens
      ),
      this.client.hincrby(
        accountHourly,
        `model:${normalizedModel}:ephemeral5mTokens`,
        finalEphemeral5mTokens
      ),
      this.client.hincrby(
        accountHourly,
        `model:${normalizedModel}:ephemeral1hTokens`,
        finalEphemeral1hTokens
      ),
      this.client.hincrby(accountHourly, `model:${normalizedModel}:allTokens`, actualTotalTokens),
      this.client.hincrby(accountHourly, `model:${normalizedModel}:requests`, 1),

      // 账户按模型统计 - 每日
      this.client.hincrby(accountModelDaily, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelDaily, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelDaily, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelDaily, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelDaily, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountModelDaily, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountModelDaily, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelDaily, 'requests', 1),

      // 账户按模型统计 - 每月
      this.client.hincrby(accountModelMonthly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelMonthly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelMonthly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelMonthly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelMonthly, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountModelMonthly, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountModelMonthly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelMonthly, 'requests', 1),

      // 账户按模型统计 - 每小时
      this.client.hincrby(accountModelHourly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelHourly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelHourly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelHourly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelHourly, 'ephemeral5mTokens', finalEphemeral5mTokens),
      this.client.hincrby(accountModelHourly, 'ephemeral1hTokens', finalEphemeral1hTokens),
      this.client.hincrby(accountModelHourly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelHourly, 'requests', 1),

      // 设置过期时间
      this.client.expire(accountDaily, 86400 * 32), // 32天过期
      this.client.expire(accountMonthly, 86400 * 365), // 1年过期
      this.client.expire(accountHourly, 86400 * 7), // 7天过期
      this.client.expire(accountModelDaily, 86400 * 32), // 32天过期
      this.client.expire(accountModelMonthly, 86400 * 365), // 1年过期
      this.client.expire(accountModelHourly, 86400 * 7), // 7天过期

      // 添加索引
      this.client.sadd(`account_usage:hourly:index:${currentHour}`, accountId),
      this.client.sadd(
        `account_usage:model:hourly:index:${currentHour}`,
        `${accountId}:${normalizedModel}`
      ),
      this.client.expire(`account_usage:hourly:index:${currentHour}`, 86400 * 7),
      this.client.expire(`account_usage:model:hourly:index:${currentHour}`, 86400 * 7),
      // daily 索引
      this.client.sadd(`account_usage:daily:index:${today}`, accountId),
      this.client.sadd(
        `account_usage:model:daily:index:${today}`,
        `${accountId}:${normalizedModel}`
      ),
      this.client.expire(`account_usage:daily:index:${today}`, 86400 * 32),
      this.client.expire(`account_usage:model:daily:index:${today}`, 86400 * 32),
      // 清理空标记
      this.client.del(`account_usage:hourly:index:${currentHour}:empty`),
      this.client.del(`account_usage:model:hourly:index:${currentHour}:empty`),
      this.client.del(`account_usage:daily:index:${today}:empty`),
      this.client.del(`account_usage:model:daily:index:${today}:empty`)
    ]

    // 如果是 1M 上下文请求，添加额外的统计
    if (isLongContextRequest) {
      operations.push(
        this.client.hincrby(accountKey, 'totalLongContextInputTokens', finalInputTokens),
        this.client.hincrby(accountKey, 'totalLongContextOutputTokens', finalOutputTokens),
        this.client.hincrby(accountKey, 'totalLongContextRequests', 1),
        this.client.hincrby(accountDaily, 'longContextInputTokens', finalInputTokens),
        this.client.hincrby(accountDaily, 'longContextOutputTokens', finalOutputTokens),
        this.client.hincrby(accountDaily, 'longContextRequests', 1)
      )
    }

    await Promise.all(operations)
  }

  /**
   * 获取使用了指定模型的 Key IDs（OR 逻辑）
   * 使用 EXISTS + pipeline 批量检查 alltime 键，避免 KEYS 全量扫描
   * 支持分批处理和 fallback 到 SCAN 模式
   */
  async getKeyIdsWithModels(keyIds, models) {
    if (!keyIds.length || !models.length) {
      return new Set()
    }

    const client = this.getClientSafe()
    const result = new Set()
    const BATCH_SIZE = 1000

    // 构建所有需要检查的 key
    const checkKeys = []
    const keyIdMap = new Map()

    for (const keyId of keyIds) {
      for (const model of models) {
        const key = `usage:${keyId}:model:alltime:${model}`
        checkKeys.push(key)
        keyIdMap.set(key, keyId)
      }
    }

    // 分批 EXISTS 检查（避免单个 pipeline 过大）
    for (let i = 0; i < checkKeys.length; i += BATCH_SIZE) {
      const batch = checkKeys.slice(i, i + BATCH_SIZE)
      const pipeline = client.pipeline()
      for (const key of batch) {
        pipeline.exists(key)
      }
      const results = await pipeline.exec()

      for (let j = 0; j < batch.length; j++) {
        const [err, exists] = results[j]
        if (!err && exists) {
          result.add(keyIdMap.get(batch[j]))
        }
      }
    }

    // Fallback: 如果 alltime 键全部不存在，回退到 SCAN 模式
    if (result.size === 0 && keyIds.length > 0) {
      // 多抽样检查：抽取最多 3 个 keyId 检查是否有 alltime 数据
      const sampleIndices = new Set()
      sampleIndices.add(0) // 始终包含第一个
      if (keyIds.length > 1) {
        sampleIndices.add(keyIds.length - 1)
      } // 包含最后一个
      if (keyIds.length > 2) {
        sampleIndices.add(Math.floor(keyIds.length / 2))
      } // 包含中间一个

      let hasAnyAlltimeData = false
      for (const idx of sampleIndices) {
        const samplePattern = `usage:${keyIds[idx]}:model:alltime:*`
        const sampleKeys = await this.scanKeys(samplePattern)
        if (sampleKeys.length > 0) {
          hasAnyAlltimeData = true
          break
        }
      }

      if (!hasAnyAlltimeData) {
        // alltime 数据不存在，回退到旧扫描逻辑
        logger.warn('⚠️ alltime 模型数据不存在，回退到 SCAN 模式（建议运行迁移脚本）')
        for (const keyId of keyIds) {
          for (const model of models) {
            const pattern = `usage:${keyId}:model:*:${model}:*`
            const keys = await this.scanKeys(pattern)
            if (keys.length > 0) {
              result.add(keyId)
              break
            }
          }
        }
      }
    }

    return result
  }

  /**
   * 获取所有被使用过的模型列表
   */
  async getAllUsedModels() {
    const client = this.getClientSafe()
    const models = new Set()

    // 扫描所有模型使用记录
    const pattern = 'usage:*:model:daily:*'
    let cursor = '0'
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
      cursor = nextCursor
      for (const key of keys) {
        // 从 key 中提取模型名: usage:{keyId}:model:daily:{model}:{date}
        const match = key.match(/usage:[^:]+:model:daily:([^:]+):/)
        if (match) {
          models.add(match[1])
        }
      }
    } while (cursor !== '0')

    return [...models].sort()
  }

  async getUsageStats(keyId) {
    const totalKey = `usage:${keyId}`
    const today = getDateStringInTimezone()
    const dailyKey = `usage:daily:${keyId}:${today}`
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const monthlyKey = `usage:monthly:${keyId}:${currentMonth}`

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(totalKey),
      this.client.hgetall(dailyKey),
      this.client.hgetall(monthlyKey)
    ])

    // 获取API Key的创建时间来计算平均值
    const keyData = await this.client.hgetall(`apikey:${keyId}`)
    const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date()
    const now = new Date()
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)))

    const totalTokens = parseInt(total.totalTokens) || 0
    const totalRequests = parseInt(total.totalRequests) || 0

    // 计算平均RPM (requests per minute) 和 TPM (tokens per minute)
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)
    const avgRPM = totalRequests / totalMinutes
    const avgTPM = totalTokens / totalMinutes

    // 处理旧数据兼容性（支持缓存token）
    const handleLegacyData = (data) => {
      // 优先使用total*字段（存储时使用的字段）
      const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0
      const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
      const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
      const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0

      // 新增缓存token字段
      const cacheCreateTokens =
        parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
      const cacheReadTokens =
        parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
      const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0

      const totalFromSeparate = inputTokens + outputTokens
      // 计算实际的总tokens（包含所有类型）
      const actualAllTokens =
        allTokens || inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      if (totalFromSeparate === 0 && tokens > 0) {
        // 旧数据：没有输入输出分离
        return {
          tokens, // 保持兼容性，但统一使用allTokens
          inputTokens: Math.round(tokens * 0.3), // 假设30%为输入
          outputTokens: Math.round(tokens * 0.7), // 假设70%为输出
          cacheCreateTokens: 0, // 旧数据没有缓存token
          cacheReadTokens: 0,
          allTokens: tokens, // 对于旧数据，allTokens等于tokens
          requests
        }
      } else {
        // 新数据或无数据 - 统一使用allTokens作为tokens的值
        return {
          tokens: actualAllTokens, // 统一使用allTokens作为总数
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          allTokens: actualAllTokens,
          requests
        }
      }
    }

    const totalData = handleLegacyData(total)
    const dailyData = handleLegacyData(daily)
    const monthlyData = handleLegacyData(monthly)

    return {
      total: totalData,
      daily: dailyData,
      monthly: monthlyData,
      averages: {
        rpm: Math.round(avgRPM * 100) / 100, // 保留2位小数
        tpm: Math.round(avgTPM * 100) / 100,
        dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
        dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
      }
    }
  }

  async addUsageRecord(keyId, record, maxRecords = 200) {
    const listKey = `usage:records:${keyId}`
    const client = this.getClientSafe()

    try {
      await client
        .multi()
        .lpush(listKey, JSON.stringify(record))
        .ltrim(listKey, 0, Math.max(0, maxRecords - 1))
        .expire(listKey, 86400 * 90) // 默认保留90天
        .exec()
    } catch (error) {
      logger.error(`❌ Failed to append usage record for key ${keyId}:`, error)
    }
  }

  async getUsageRecords(keyId, limit = 50) {
    const listKey = `usage:records:${keyId}`
    const client = this.getClient()

    if (!client) {
      return []
    }

    try {
      const rawRecords = await client.lrange(listKey, 0, Math.max(0, limit - 1))
      return rawRecords
        .map((entry) => {
          try {
            return JSON.parse(entry)
          } catch (error) {
            logger.warn('⚠️ Failed to parse usage record entry:', error)
            return null
          }
        })
        .filter(Boolean)
    } catch (error) {
      logger.error(`❌ Failed to load usage records for key ${keyId}:`, error)
      return []
    }
  }

  // 💰 获取当日费用
  async getDailyCost(keyId) {
    const today = getDateStringInTimezone()
    const costKey = `usage:cost:daily:${keyId}:${today}`
    const cost = await this.client.get(costKey)
    const result = parseFloat(cost || 0)
    logger.debug(
      `💰 Getting daily cost for ${keyId}, date: ${today}, key: ${costKey}, value: ${cost}, result: ${result}`
    )
    return result
  }

  // 💰 增加当日费用（支持倍率成本和真实成本分开记录）
  // amount: 倍率后的成本（用于限额校验）
  // realAmount: 真实成本（用于对账），如果不传则等于 amount
  async incrementDailyCost(keyId, amount, realAmount = null) {
    const today = getDateStringInTimezone()
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const currentHour = `${today}:${String(getHourInTimezone(new Date())).padStart(2, '0')}`

    const dailyKey = `usage:cost:daily:${keyId}:${today}`
    const monthlyKey = `usage:cost:monthly:${keyId}:${currentMonth}`
    const hourlyKey = `usage:cost:hourly:${keyId}:${currentHour}`
    const totalKey = `usage:cost:total:${keyId}` // 总费用键 - 永不过期，持续累加

    // 真实成本键（用于对账）
    const realTotalKey = `usage:cost:real:total:${keyId}`
    const realDailyKey = `usage:cost:real:daily:${keyId}:${today}`
    const actualRealAmount = realAmount !== null ? realAmount : amount

    logger.debug(
      `💰 Incrementing cost for ${keyId}, rated: $${amount}, real: $${actualRealAmount}, date: ${today}`
    )

    const results = await Promise.all([
      this.client.incrbyfloat(dailyKey, amount),
      this.client.incrbyfloat(monthlyKey, amount),
      this.client.incrbyfloat(hourlyKey, amount),
      this.client.incrbyfloat(totalKey, amount), // 倍率后总费用（用于限额）
      this.client.incrbyfloat(realTotalKey, actualRealAmount), // 真实总费用（用于对账）
      this.client.incrbyfloat(realDailyKey, actualRealAmount), // 真实每日费用
      // 设置过期时间（注意：totalKey 和 realTotalKey 不设置过期时间，保持永久累计）
      this.client.expire(dailyKey, 86400 * 30), // 30天
      this.client.expire(monthlyKey, 86400 * 90), // 90天
      this.client.expire(hourlyKey, 86400 * 7), // 7天
      this.client.expire(realDailyKey, 86400 * 30) // 30天
    ])

    logger.debug(`💰 Cost incremented successfully, new daily total: $${results[0]}`)
  }

  // 💰 获取费用统计（包含倍率成本和真实成本）
  async getCostStats(keyId) {
    const today = getDateStringInTimezone()
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const currentHour = `${today}:${String(getHourInTimezone(new Date())).padStart(2, '0')}`

    const [daily, monthly, hourly, total, realTotal, realDaily] = await Promise.all([
      this.client.get(`usage:cost:daily:${keyId}:${today}`),
      this.client.get(`usage:cost:monthly:${keyId}:${currentMonth}`),
      this.client.get(`usage:cost:hourly:${keyId}:${currentHour}`),
      this.client.get(`usage:cost:total:${keyId}`),
      this.client.get(`usage:cost:real:total:${keyId}`),
      this.client.get(`usage:cost:real:daily:${keyId}:${today}`)
    ])

    return {
      daily: parseFloat(daily || 0),
      monthly: parseFloat(monthly || 0),
      hourly: parseFloat(hourly || 0),
      total: parseFloat(total || 0),
      realTotal: parseFloat(realTotal || 0),
      realDaily: parseFloat(realDaily || 0)
    }
  }

  // 💰 获取本周 Opus 费用（支持自定义重置周期）
  async getWeeklyOpusCost(keyId, resetDay = 1, resetHour = 0) {
    const periodStr = getPeriodString(resetDay, resetHour)
    const costKey = `usage:opus:weekly:${keyId}:${periodStr}`
    const cost = await this.client.get(costKey)
    const result = parseFloat(cost || 0)
    logger.debug(
      `💰 Getting weekly Opus cost for ${keyId}, period: ${periodStr}, key: ${costKey}, value: ${cost}, result: ${result}`
    )
    return result
  }

  // 💰 增加本周 Opus 费用（支持倍率成本和真实成本，支持自定义重置周期）
  // amount: 倍率后的成本（用于限额校验）
  // realAmount: 真实成本（用于对账），如果不传则等于 amount
  async incrementWeeklyOpusCost(keyId, amount, realAmount = null, resetDay = 1, resetHour = 0) {
    const periodStr = getPeriodString(resetDay, resetHour)
    const weeklyKey = `usage:opus:weekly:${keyId}:${periodStr}`
    const totalKey = `usage:opus:total:${keyId}`
    const realWeeklyKey = `usage:opus:real:weekly:${keyId}:${periodStr}`
    const realTotalKey = `usage:opus:real:total:${keyId}`
    const actualRealAmount = realAmount !== null ? realAmount : amount

    logger.debug(
      `💰 Incrementing weekly Opus cost for ${keyId}, period: ${periodStr}, rated: $${amount}, real: $${actualRealAmount}`
    )

    // 使用 pipeline 批量执行，提高性能
    const pipeline = this.client.pipeline()
    pipeline.incrbyfloat(weeklyKey, amount)
    pipeline.incrbyfloat(totalKey, amount)
    pipeline.incrbyfloat(realWeeklyKey, actualRealAmount)
    pipeline.incrbyfloat(realTotalKey, actualRealAmount)
    // 设置周费用键的过期时间为 2 周
    pipeline.expire(weeklyKey, 14 * 24 * 3600)
    pipeline.expire(realWeeklyKey, 14 * 24 * 3600)

    const results = await pipeline.exec()
    logger.debug(`💰 Opus cost incremented successfully, new weekly total: $${results[0][1]}`)
  }

  // 💰 覆盖设置本周 Opus 费用（用于启动回填/迁移，支持自定义周期标识）
  async setWeeklyOpusCost(keyId, amount, periodString = null, resetDay = 1, resetHour = 0) {
    const currentPeriod = periodString || getPeriodString(resetDay, resetHour)
    const weeklyKey = `usage:opus:weekly:${keyId}:${currentPeriod}`

    await this.client.set(weeklyKey, String(amount || 0))
    // 保留 2 周，足够覆盖"当前周期 + 上周期"查看/回填
    await this.client.expire(weeklyKey, 14 * 24 * 3600)
  }

  // 💰 计算账户的每日费用（基于模型使用，使用索引集合替代 KEYS）
  async getAccountDailyCost(accountId) {
    const CostCalculator = require('../utils/costCalculator')
    const today = getDateStringInTimezone()

    // 使用索引集合替代 KEYS 命令
    const indexKey = `account_usage:model:daily:index:${today}`
    const allEntries = await this.client.smembers(indexKey)

    // 过滤出当前账户的条目（格式：accountId:model）
    const accountPrefix = `${accountId}:`
    const accountModels = allEntries
      .filter((entry) => entry.startsWith(accountPrefix))
      .map((entry) => entry.substring(accountPrefix.length))

    if (accountModels.length === 0) {
      return 0
    }

    // Pipeline 批量获取所有模型数据
    const pipeline = this.client.pipeline()
    for (const model of accountModels) {
      pipeline.hgetall(`account_usage:model:daily:${accountId}:${model}:${today}`)
    }
    const results = await pipeline.exec()

    let totalCost = 0
    for (let i = 0; i < accountModels.length; i++) {
      const model = accountModels[i]
      const [err, modelUsage] = results[i]

      if (!err && modelUsage && (modelUsage.inputTokens || modelUsage.outputTokens)) {
        const usage = {
          input_tokens: parseInt(modelUsage.inputTokens || 0),
          output_tokens: parseInt(modelUsage.outputTokens || 0),
          cache_creation_input_tokens: parseInt(modelUsage.cacheCreateTokens || 0),
          cache_read_input_tokens: parseInt(modelUsage.cacheReadTokens || 0)
        }

        // 添加 cache_creation 子对象以支持精确 ephemeral 定价
        const eph5m = parseInt(modelUsage.ephemeral5mTokens) || 0
        const eph1h = parseInt(modelUsage.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }

        const costResult = CostCalculator.calculateCost(usage, model)
        totalCost += costResult.costs.total

        logger.debug(
          `💰 Account ${accountId} daily cost for model ${model}: $${costResult.costs.total}`
        )
      }
    }

    logger.debug(`💰 Account ${accountId} total daily cost: $${totalCost}`)
    return totalCost
  }

  // 💰 批量计算多个账户的每日费用
  async batchGetAccountDailyCost(accountIds) {
    if (!accountIds || accountIds.length === 0) {
      return new Map()
    }

    const CostCalculator = require('../utils/costCalculator')
    const today = getDateStringInTimezone()

    // 一次获取索引
    const indexKey = `account_usage:model:daily:index:${today}`
    const allEntries = await this.client.smembers(indexKey)

    // 按 accountId 分组
    const accountIdSet = new Set(accountIds)
    const entriesByAccount = new Map()
    for (const entry of allEntries) {
      const colonIndex = entry.indexOf(':')
      if (colonIndex === -1) {
        continue
      }
      const accountId = entry.substring(0, colonIndex)
      const model = entry.substring(colonIndex + 1)
      if (accountIdSet.has(accountId)) {
        if (!entriesByAccount.has(accountId)) {
          entriesByAccount.set(accountId, [])
        }
        entriesByAccount.get(accountId).push(model)
      }
    }

    const costMap = new Map(accountIds.map((id) => [id, 0]))

    // 如果索引为空，回退到 KEYS 命令（兼容旧数据）
    if (allEntries.length === 0) {
      logger.debug('💰 Daily cost index empty, falling back to KEYS for batch cost calculation')
      for (const accountId of accountIds) {
        try {
          const cost = await this.getAccountDailyCostFallback(accountId, today, CostCalculator)
          costMap.set(accountId, cost)
        } catch {
          // 忽略单个账户的错误
        }
      }
      return costMap
    }

    // Pipeline 批量获取所有模型数据
    const pipeline = this.client.pipeline()
    const queryOrder = []
    for (const [accountId, models] of entriesByAccount) {
      for (const model of models) {
        pipeline.hgetall(`account_usage:model:daily:${accountId}:${model}:${today}`)
        queryOrder.push({ accountId, model })
      }
    }

    if (queryOrder.length === 0) {
      return costMap
    }

    const results = await pipeline.exec()

    for (let i = 0; i < queryOrder.length; i++) {
      const { accountId, model } = queryOrder[i]
      const [err, modelUsage] = results[i]

      if (!err && modelUsage && (modelUsage.inputTokens || modelUsage.outputTokens)) {
        const usage = {
          input_tokens: parseInt(modelUsage.inputTokens || 0),
          output_tokens: parseInt(modelUsage.outputTokens || 0),
          cache_creation_input_tokens: parseInt(modelUsage.cacheCreateTokens || 0),
          cache_read_input_tokens: parseInt(modelUsage.cacheReadTokens || 0)
        }

        // 添加 cache_creation 子对象以支持精确 ephemeral 定价
        const eph5m = parseInt(modelUsage.ephemeral5mTokens) || 0
        const eph1h = parseInt(modelUsage.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }

        const costResult = CostCalculator.calculateCost(usage, model)
        costMap.set(accountId, costMap.get(accountId) + costResult.costs.total)
      }
    }

    return costMap
  }

  // 💰 回退方法：计算单个账户的每日费用（使用 scanKeys 替代 keys）
  async getAccountDailyCostFallback(accountId, today, CostCalculator) {
    const pattern = `account_usage:model:daily:${accountId}:*:${today}`
    const modelKeys = await this.scanKeys(pattern)

    if (!modelKeys || modelKeys.length === 0) {
      return 0
    }

    let totalCost = 0
    const pipeline = this.client.pipeline()
    for (const key of modelKeys) {
      pipeline.hgetall(key)
    }
    const results = await pipeline.exec()

    for (let i = 0; i < modelKeys.length; i++) {
      const key = modelKeys[i]
      const [err, modelUsage] = results[i]
      if (err || !modelUsage) {
        continue
      }

      const parts = key.split(':')
      const model = parts[4]

      if (modelUsage.inputTokens || modelUsage.outputTokens) {
        const usage = {
          input_tokens: parseInt(modelUsage.inputTokens || 0),
          output_tokens: parseInt(modelUsage.outputTokens || 0),
          cache_creation_input_tokens: parseInt(modelUsage.cacheCreateTokens || 0),
          cache_read_input_tokens: parseInt(modelUsage.cacheReadTokens || 0)
        }

        // 添加 cache_creation 子对象以支持精确 ephemeral 定价
        const eph5m = parseInt(modelUsage.ephemeral5mTokens) || 0
        const eph1h = parseInt(modelUsage.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }

        const costResult = CostCalculator.calculateCost(usage, model)
        totalCost += costResult.costs.total
      }
    }

    return totalCost
  }

  // 📊 获取账户使用统计
  async getAccountUsageStats(accountId, accountType = null) {
    const accountKey = `account_usage:${accountId}`
    const today = getDateStringInTimezone()
    const accountDailyKey = `account_usage:daily:${accountId}:${today}`
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const accountMonthlyKey = `account_usage:monthly:${accountId}:${currentMonth}`

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(accountKey),
      this.client.hgetall(accountDailyKey),
      this.client.hgetall(accountMonthlyKey)
    ])

    // 获取账户创建时间来计算平均值 - 支持不同类型的账号
    let accountData = {}
    if (accountType === 'droid') {
      accountData = await this.client.hgetall(`droid:account:${accountId}`)
    } else if (accountType === 'openai') {
      accountData = await this.client.hgetall(`openai:account:${accountId}`)
    } else if (accountType === 'openai-responses') {
      accountData = await this.client.hgetall(`openai_responses_account:${accountId}`)
    } else {
      // 尝试多个前缀（优先 claude:account:）
      accountData = await this.client.hgetall(`claude:account:${accountId}`)
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(`claude_account:${accountId}`)
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(`openai:account:${accountId}`)
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(`openai_responses_account:${accountId}`)
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(`openai_account:${accountId}`)
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(`droid:account:${accountId}`)
      }
    }
    const createdAt = accountData.createdAt ? new Date(accountData.createdAt) : new Date()
    const now = new Date()
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)))

    const totalTokens = parseInt(total.totalTokens) || 0
    const totalRequests = parseInt(total.totalRequests) || 0

    // 计算平均RPM和TPM
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)
    const avgRPM = totalRequests / totalMinutes
    const avgTPM = totalTokens / totalMinutes

    // 处理账户统计数据
    const handleAccountData = (data) => {
      const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0
      const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
      const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
      const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0
      const cacheCreateTokens =
        parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
      const cacheReadTokens =
        parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
      const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0

      const actualAllTokens =
        allTokens || inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      return {
        tokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        allTokens: actualAllTokens,
        requests
      }
    }

    const totalData = handleAccountData(total)
    const dailyData = handleAccountData(daily)
    const monthlyData = handleAccountData(monthly)

    // 获取每日费用（基于模型使用）
    const dailyCost = await this.getAccountDailyCost(accountId)

    return {
      accountId,
      total: totalData,
      daily: {
        ...dailyData,
        cost: dailyCost
      },
      monthly: monthlyData,
      averages: {
        rpm: Math.round(avgRPM * 100) / 100,
        tpm: Math.round(avgTPM * 100) / 100,
        dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
        dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
      }
    }
  }

  // 📈 获取所有账户的使用统计
  async getAllAccountsUsageStats() {
    try {
      // 使用 getAllIdsByIndex 获取账户 ID（自动处理索引/SCAN 回退）
      const accountIds = await this.getAllIdsByIndex(
        'claude:account:index',
        'claude:account:*',
        /^claude:account:(.+)$/
      )

      if (accountIds.length === 0) {
        return []
      }

      const accountStats = []

      for (const accountId of accountIds) {
        const accountKey = `claude:account:${accountId}`
        const accountData = await this.client.hgetall(accountKey)

        if (accountData && accountData.name) {
          const stats = await this.getAccountUsageStats(accountId)
          accountStats.push({
            id: accountId,
            name: accountData.name,
            email: accountData.email || '',
            status: accountData.status || 'unknown',
            isActive: accountData.isActive === 'true',
            ...stats
          })
        }
      }

      // 按当日token使用量排序
      accountStats.sort((a, b) => (b.daily.allTokens || 0) - (a.daily.allTokens || 0))

      return accountStats
    } catch (error) {
      logger.error('❌ Failed to get all accounts usage stats:', error)
      return []
    }
  }

  // 🧹 清空所有API Key的使用统计数据（使用 scanKeys + batchDelChunked 优化）
  async resetAllUsageStats() {
    const client = this.getClientSafe()
    const stats = {
      deletedKeys: 0,
      deletedDailyKeys: 0,
      deletedMonthlyKeys: 0,
      resetApiKeys: 0
    }

    try {
      // 1. 获取所有 API Key ID（使用 scanKeys）
      const apiKeyKeys = await this.scanKeys('apikey:*')
      const apiKeyIds = apiKeyKeys
        .filter((k) => k !== 'apikey:hash_map' && k.split(':').length === 2)
        .map((k) => k.replace('apikey:', ''))

      // 2. 批量删除总体使用统计
      const usageKeys = apiKeyIds.map((id) => `usage:${id}`)
      stats.deletedKeys = await this.batchDelChunked(usageKeys)

      // 3. 使用 scanKeys 获取并批量删除 daily 统计
      const dailyKeys = await this.scanKeys('usage:daily:*')
      stats.deletedDailyKeys = await this.batchDelChunked(dailyKeys)

      // 4. 使用 scanKeys 获取并批量删除 monthly 统计
      const monthlyKeys = await this.scanKeys('usage:monthly:*')
      stats.deletedMonthlyKeys = await this.batchDelChunked(monthlyKeys)

      // 5. 批量重置 lastUsedAt（仅对存在的 key 操作，避免重建空 hash）
      const BATCH_SIZE = 500
      for (let i = 0; i < apiKeyIds.length; i += BATCH_SIZE) {
        const batch = apiKeyIds.slice(i, i + BATCH_SIZE)
        const existsPipeline = client.pipeline()
        for (const keyId of batch) {
          existsPipeline.exists(`apikey:${keyId}`)
        }
        const existsResults = await existsPipeline.exec()

        const updatePipeline = client.pipeline()
        let updateCount = 0
        for (let j = 0; j < batch.length; j++) {
          const [err, exists] = existsResults[j]
          if (!err && exists) {
            updatePipeline.hset(`apikey:${batch[j]}`, 'lastUsedAt', '')
            updateCount++
          }
        }
        if (updateCount > 0) {
          await updatePipeline.exec()
          stats.resetApiKeys += updateCount
        }
      }

      // 6. 清理所有 usage 相关键（使用 scanKeys + batchDelChunked）
      const allUsageKeys = await this.scanKeys('usage:*')
      const additionalDeleted = await this.batchDelChunked(allUsageKeys)
      stats.deletedKeys += additionalDeleted

      return stats
    } catch (error) {
      throw new Error(`Failed to reset usage stats: ${error.message}`)
    }
  }

  // 🏢 Claude 账户管理
  async setClaudeAccount(accountId, accountData) {
    const key = `claude:account:${accountId}`
    await this.client.hset(key, accountData)
    await this.client.sadd('claude:account:index', accountId)
    await this.client.del('claude:account:index:empty')
  }

  async getClaudeAccount(accountId) {
    const key = `claude:account:${accountId}`
    return await this.client.hgetall(key)
  }

  async getAllClaudeAccounts() {
    const accountIds = await this.getAllIdsByIndex(
      'claude:account:index',
      'claude:account:*',
      /^claude:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => `claude:account:${id}`)
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }

  async deleteClaudeAccount(accountId) {
    const key = `claude:account:${accountId}`
    await this.client.srem('claude:account:index', accountId)
    return await this.client.del(key)
  }

  // 🤖 Droid 账户相关操作
  async setDroidAccount(accountId, accountData) {
    const key = `droid:account:${accountId}`
    await this.client.hset(key, accountData)
    await this.client.sadd('droid:account:index', accountId)
    await this.client.del('droid:account:index:empty')
  }

  async getDroidAccount(accountId) {
    const key = `droid:account:${accountId}`
    return await this.client.hgetall(key)
  }

  async getAllDroidAccounts() {
    const accountIds = await this.getAllIdsByIndex(
      'droid:account:index',
      'droid:account:*',
      /^droid:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => `droid:account:${id}`)
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }

  async deleteDroidAccount(accountId) {
    const key = `droid:account:${accountId}`
    // 从索引中移除
    await this.client.srem('droid:account:index', accountId)
    return await this.client.del(key)
  }

  async setOpenAiAccount(accountId, accountData) {
    const key = `openai:account:${accountId}`
    await this.client.hset(key, accountData)
    await this.client.sadd('openai:account:index', accountId)
    await this.client.del('openai:account:index:empty')
  }
  async getOpenAiAccount(accountId) {
    const key = `openai:account:${accountId}`
    return await this.client.hgetall(key)
  }
  async deleteOpenAiAccount(accountId) {
    const key = `openai:account:${accountId}`
    await this.client.srem('openai:account:index', accountId)
    return await this.client.del(key)
  }

  async getAllOpenAIAccounts() {
    const accountIds = await this.getAllIdsByIndex(
      'openai:account:index',
      'openai:account:*',
      /^openai:account:(.+)$/
    )
    if (accountIds.length === 0) {
      return []
    }

    const keys = accountIds.map((id) => `openai:account:${id}`)
    const pipeline = this.client.pipeline()
    keys.forEach((key) => pipeline.hgetall(key))
    const results = await pipeline.exec()

    const accounts = []
    results.forEach(([err, accountData], index) => {
      if (!err && accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: accountIds[index], ...accountData })
      }
    })
    return accounts
  }

  // 🔐 会话管理（用于管理员登录等）
  async setSession(sessionId, sessionData, ttl = 86400) {
    const key = `session:${sessionId}`
    await this.client.hset(key, sessionData)
    await this.client.expire(key, ttl)
  }

  async getSession(sessionId) {
    const key = `session:${sessionId}`
    return await this.client.hgetall(key)
  }

  async deleteSession(sessionId) {
    const key = `session:${sessionId}`
    return await this.client.del(key)
  }

  // 🗝️ API Key哈希索引管理（兼容旧结构 apikey_hash:* 和新结构 apikey:hash_map）
  async setApiKeyHash(hashedKey, keyData, ttl = 0) {
    // 写入旧结构（兼容）
    const key = `apikey_hash:${hashedKey}`
    await this.client.hset(key, keyData)
    if (ttl > 0) {
      await this.client.expire(key, ttl)
    }
    // 同时写入新结构 hash_map（认证使用此结构）
    if (keyData.id) {
      await this.client.hset('apikey:hash_map', hashedKey, keyData.id)
    }
  }

  async getApiKeyHash(hashedKey) {
    const key = `apikey_hash:${hashedKey}`
    return await this.client.hgetall(key)
  }

  async deleteApiKeyHash(hashedKey) {
    // 同时清理旧结构和新结构，确保 Key 轮换/删除后旧 Key 失效
    const oldKey = `apikey_hash:${hashedKey}`
    await this.client.del(oldKey)
    // 从新的 hash_map 中移除（认证使用此结构）
    await this.client.hdel('apikey:hash_map', hashedKey)
  }

  // 🔗 OAuth会话管理
  async setOAuthSession(sessionId, sessionData, ttl = 600) {
    // 10分钟过期
    const key = `oauth:${sessionId}`

    // 序列化复杂对象，特别是 proxy 配置
    const serializedData = {}
    for (const [dataKey, value] of Object.entries(sessionData)) {
      if (typeof value === 'object' && value !== null) {
        serializedData[dataKey] = JSON.stringify(value)
      } else {
        serializedData[dataKey] = value
      }
    }

    await this.client.hset(key, serializedData)
    await this.client.expire(key, ttl)
  }

  async getOAuthSession(sessionId) {
    const key = `oauth:${sessionId}`
    const data = await this.client.hgetall(key)

    // 反序列化 proxy 字段
    if (data.proxy) {
      try {
        data.proxy = JSON.parse(data.proxy)
      } catch (error) {
        // 如果解析失败，设置为 null
        data.proxy = null
      }
    }

    return data
  }

  async deleteOAuthSession(sessionId) {
    const key = `oauth:${sessionId}`
    return await this.client.del(key)
  }

  // 💰 账户余额缓存（API 查询结果）
  async setAccountBalance(platform, accountId, balanceData, ttl = 3600) {
    const key = `account_balance:${platform}:${accountId}`

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
    const key = `account_balance:${platform}:${accountId}`
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
  async setLocalBalance(platform, accountId, statisticsData, ttl = 300) {
    const key = `account_balance_local:${platform}:${accountId}`

    await this.client.hset(key, {
      estimatedBalance: JSON.stringify(statisticsData || {}),
      lastCalculated: new Date().toISOString()
    })
    await this.client.expire(key, ttl)
  }

  async getLocalBalance(platform, accountId) {
    const key = `account_balance_local:${platform}:${accountId}`
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
    const key = `account_balance:${platform}:${accountId}`
    const localKey = `account_balance_local:${platform}:${accountId}`
    await this.client.del(key, localKey)
  }

  // 🧩 账户余额脚本配置
  async setBalanceScriptConfig(platform, accountId, scriptConfig) {
    const key = `account_balance_script:${platform}:${accountId}`
    await this.client.set(key, JSON.stringify(scriptConfig || {}))
  }

  async getBalanceScriptConfig(platform, accountId) {
    const key = `account_balance_script:${platform}:${accountId}`
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
    const key = `account_balance_script:${platform}:${accountId}`
    return await this.client.del(key)
  }

  // 📈 系统统计（使用 scanKeys 替代 keys）
  async getSystemStats() {
    const keys = await Promise.all([
      this.scanKeys('apikey:*'),
      this.scanKeys('claude:account:*'),
      this.scanKeys('usage:*')
    ])

    // 过滤 apikey 索引键，只统计实际的 apikey
    const apiKeyCount = keys[0].filter(
      (k) => k !== 'apikey:hash_map' && k.split(':').length === 2
    ).length

    return {
      totalApiKeys: apiKeyCount,
      totalClaudeAccounts: keys[1].length,
      totalUsageRecords: keys[2].length
    }
  }

  // 🔍 通过索引获取 key 列表（替代 SCAN）
  async getKeysByIndex(indexKey, keyPattern) {
    const members = await this.client.smembers(indexKey)
    if (!members || members.length === 0) {
      return []
    }
    return members.map((id) => keyPattern.replace('{id}', id))
  }

  // 🔍 批量通过索引获取数据
  async getDataByIndex(indexKey, keyPattern) {
    const keys = await this.getKeysByIndex(indexKey, keyPattern)
    if (keys.length === 0) {
      return []
    }
    return await this.batchHgetallChunked(keys)
  }

  // 📊 获取今日系统统计
  async getTodayStats() {
    try {
      const today = getDateStringInTimezone()
      // 优先使用索引查询，回退到 SCAN
      let dailyKeys = []
      const indexKey = `usage:daily:index:${today}`
      const indexMembers = await this.client.smembers(indexKey)
      if (indexMembers && indexMembers.length > 0) {
        dailyKeys = indexMembers.map((keyId) => `usage:daily:${keyId}:${today}`)
      } else {
        // 回退到 SCAN（兼容历史数据）
        dailyKeys = await this.scanKeys(`usage:daily:*:${today}`)
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
      const allApiKeys = await this.scanKeys('apikey:*')
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
  async getSystemAverages() {
    try {
      const allApiKeys = await this.scanKeys('apikey:*')
      let totalRequests = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let oldestCreatedAt = new Date()

      // 批量获取所有usage数据和key数据，提高性能
      const usageKeys = allApiKeys.map((key) => `usage:${key.replace('apikey:', '')}`)
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
  async getRealtimeSystemMetrics() {
    try {
      const configLocal = require('../../config/config')
      const windowMinutes = configLocal.system.metricsWindow || 5

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
        const minuteKey = `system:metrics:minute:${currentMinute - i}`
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

  // 🔗 会话sticky映射管理
  async setSessionAccountMapping(sessionHash, accountId, ttl = null) {
    const appConfig = require('../../config/config')
    // 从配置读取TTL（小时），转换为秒，默认1小时
    const defaultTTL = ttl !== null ? ttl : (appConfig.session?.stickyTtlHours || 1) * 60 * 60
    const key = `sticky_session:${sessionHash}`
    await this.client.set(key, accountId, 'EX', defaultTTL)
  }

  async getSessionAccountMapping(sessionHash) {
    const key = `sticky_session:${sessionHash}`
    return await this.client.get(key)
  }

  // 🚀 智能会话TTL续期：剩余时间少于阈值时自动续期
  async extendSessionAccountMappingTTL(sessionHash) {
    const appConfig = require('../../config/config')
    const key = `sticky_session:${sessionHash}`

    // 📊 从配置获取参数
    const ttlHours = appConfig.session?.stickyTtlHours || 1 // 小时，默认1小时
    const thresholdMinutes = appConfig.session?.renewalThresholdMinutes || 0 // 分钟，默认0（不续期）

    // 如果阈值为0，不执行续期
    if (thresholdMinutes === 0) {
      return true
    }

    const fullTTL = ttlHours * 60 * 60 // 转换为秒
    const renewalThreshold = thresholdMinutes * 60 // 转换为秒

    try {
      // 获取当前剩余TTL（秒）
      const remainingTTL = await this.client.ttl(key)

      // 键不存在或已过期
      if (remainingTTL === -2) {
        return false
      }

      // 键存在但没有TTL（永不过期，不需要处理）
      if (remainingTTL === -1) {
        return true
      }

      // 🎯 智能续期策略：仅在剩余时间少于阈值时才续期
      if (remainingTTL < renewalThreshold) {
        await this.client.expire(key, fullTTL)
        logger.debug(
          `🔄 Renewed sticky session TTL: ${sessionHash} (was ${Math.round(
            remainingTTL / 60
          )}min, renewed to ${ttlHours}h)`
        )
        return true
      }

      // 剩余时间充足，无需续期
      logger.debug(
        `✅ Sticky session TTL sufficient: ${sessionHash} (remaining ${Math.round(
          remainingTTL / 60
        )}min)`
      )
      return true
    } catch (error) {
      logger.error('❌ Failed to extend session TTL:', error)
      return false
    }
  }

  async deleteSessionAccountMapping(sessionHash) {
    const key = `sticky_session:${sessionHash}`
    return await this.client.del(key)
  }

  // 🧹 清理过期数据（使用 scanKeys 替代 keys）
  async cleanup() {
    try {
      const patterns = ['usage:daily:*', 'ratelimit:*', 'session:*', 'sticky_session:*', 'oauth:*']

      for (const pattern of patterns) {
        const keys = await this.scanKeys(pattern)
        const pipeline = this.client.pipeline()

        for (const key of keys) {
          const ttl = await this.client.ttl(key)
          if (ttl === -1) {
            // 没有设置过期时间的键
            if (key.startsWith('oauth:')) {
              pipeline.expire(key, 600) // OAuth会话设置10分钟过期
            } else {
              pipeline.expire(key, 86400) // 其他设置1天过期
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

  // 获取并发配置
  _getConcurrencyConfig() {
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
  async incrConcurrency(apiKeyId, requestId, leaseSeconds = null) {
    if (!requestId) {
      throw new Error('Request ID is required for concurrency tracking')
    }

    try {
      const { leaseSeconds: defaultLeaseSeconds, cleanupGraceSeconds } =
        this._getConcurrencyConfig()
      const lease = leaseSeconds || defaultLeaseSeconds
      const key = `concurrency:${apiKeyId}`
      const now = Date.now()
      const expireAt = now + lease * 1000
      const ttl = Math.max((lease + cleanupGraceSeconds) * 1000, 60000)

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
  async refreshConcurrencyLease(apiKeyId, requestId, leaseSeconds = null) {
    if (!requestId) {
      return 0
    }

    try {
      const { leaseSeconds: defaultLeaseSeconds, cleanupGraceSeconds } =
        this._getConcurrencyConfig()
      const lease = leaseSeconds || defaultLeaseSeconds
      const key = `concurrency:${apiKeyId}`
      const now = Date.now()
      const expireAt = now + lease * 1000
      const ttl = Math.max((lease + cleanupGraceSeconds) * 1000, 60000)

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
  async decrConcurrency(apiKeyId, requestId) {
    try {
      const key = `concurrency:${apiKeyId}`
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
  async getConcurrency(apiKeyId) {
    try {
      const key = `concurrency:${apiKeyId}`
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
  async incrConsoleAccountConcurrency(accountId, requestId, leaseSeconds = null) {
    if (!requestId) {
      throw new Error('Request ID is required for console account concurrency tracking')
    }
    // 使用特殊的 key 前缀区分 Console 账户并发
    const compositeKey = `console_account:${accountId}`
    return await this.incrConcurrency(compositeKey, requestId, leaseSeconds)
  }

  // 刷新 Console 账户并发租约
  async refreshConsoleAccountConcurrencyLease(accountId, requestId, leaseSeconds = null) {
    if (!requestId) {
      return 0
    }
    const compositeKey = `console_account:${accountId}`
    return await this.refreshConcurrencyLease(compositeKey, requestId, leaseSeconds)
  }

  // 减少 Console 账户并发计数
  async decrConsoleAccountConcurrency(accountId, requestId) {
    const compositeKey = `console_account:${accountId}`
    return await this.decrConcurrency(compositeKey, requestId)
  }

  // 获取 Console 账户当前并发数
  async getConsoleAccountConcurrency(accountId) {
    const compositeKey = `console_account:${accountId}`
    return await this.getConcurrency(compositeKey)
  }

  // 🔧 并发管理方法（用于管理员手动清理）

  /**
   * 获取所有并发状态（使用 scanKeys 替代 keys）
   * @returns {Promise<Array>} 并发状态列表
   */
  async getAllConcurrencyStatus() {
    try {
      const client = this.getClientSafe()
      const keys = await this.scanKeys('concurrency:*')
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

  /**
   * 获取特定 API Key 的并发状态详情
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<Object>} 并发状态详情
   */
  async getConcurrencyStatus(apiKeyId) {
    try {
      const client = this.getClientSafe()
      const key = `concurrency:${apiKeyId}`
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

  /**
   * 强制清理特定 API Key 的并发计数（忽略租约）
   * @param {string} apiKeyId - API Key ID
   * @returns {Promise<Object>} 清理结果
   */
  async forceClearConcurrency(apiKeyId) {
    try {
      const client = this.getClientSafe()
      const key = `concurrency:${apiKeyId}`

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

  /**
   * 强制清理所有并发计数（使用 scanKeys 替代 keys）
   * @returns {Promise<Object>} 清理结果
   */
  async forceClearAllConcurrency() {
    try {
      const client = this.getClientSafe()
      const keys = await this.scanKeys('concurrency:*')

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

  /**
   * 清理过期的并发条目（不影响活跃请求，使用 scanKeys 替代 keys）
   * @param {string} apiKeyId - API Key ID（可选，不传则清理所有）
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupExpiredConcurrency(apiKeyId = null) {
    try {
      const client = this.getClientSafe()
      const now = Date.now()
      let keys

      if (apiKeyId) {
        keys = [`concurrency:${apiKeyId}`]
      } else {
        keys = await this.scanKeys('concurrency:*')
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

  // 📊 获取账户会话窗口内的使用统计（包含模型细分）
  async getAccountSessionWindowUsage(accountId, windowStart, windowEnd) {
    try {
      if (!windowStart || !windowEnd) {
        return {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreateTokens: 0,
          totalCacheReadTokens: 0,
          totalAllTokens: 0,
          totalRequests: 0,
          modelUsage: {}
        }
      }

      const startDate = new Date(windowStart)
      const endDate = new Date(windowEnd)

      // 添加日志以调试时间窗口
      logger.debug(`📊 Getting session window usage for account ${accountId}`)
      logger.debug(`   Window: ${windowStart} to ${windowEnd}`)
      logger.debug(`   Start UTC: ${startDate.toISOString()}, End UTC: ${endDate.toISOString()}`)

      // 获取窗口内所有可能的小时键
      // 重要：需要使用配置的时区来构建键名，因为数据存储时使用的是配置时区
      const hourlyKeys = []
      const currentHour = new Date(startDate)
      currentHour.setMinutes(0)
      currentHour.setSeconds(0)
      currentHour.setMilliseconds(0)

      while (currentHour <= endDate) {
        // 使用时区转换函数来获取正确的日期和小时
        const tzDateStr = getDateStringInTimezone(currentHour)
        const tzHour = String(getHourInTimezone(currentHour)).padStart(2, '0')
        const key = `account_usage:hourly:${accountId}:${tzDateStr}:${tzHour}`

        logger.debug(`   Adding hourly key: ${key}`)
        hourlyKeys.push(key)
        currentHour.setHours(currentHour.getHours() + 1)
      }

      // 批量获取所有小时的数据
      const pipeline = this.client.pipeline()
      for (const key of hourlyKeys) {
        pipeline.hgetall(key)
      }
      const results = await pipeline.exec()

      // 聚合所有数据
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let totalCacheCreateTokens = 0
      let totalCacheReadTokens = 0
      let totalAllTokens = 0
      let totalRequests = 0
      const modelUsage = {}

      logger.debug(`   Processing ${results.length} hourly results`)

      for (const [error, data] of results) {
        if (error || !data || Object.keys(data).length === 0) {
          continue
        }

        // 处理总计数据
        const hourInputTokens = parseInt(data.inputTokens || 0)
        const hourOutputTokens = parseInt(data.outputTokens || 0)
        const hourCacheCreateTokens = parseInt(data.cacheCreateTokens || 0)
        const hourCacheReadTokens = parseInt(data.cacheReadTokens || 0)
        const hourAllTokens = parseInt(data.allTokens || 0)
        const hourRequests = parseInt(data.requests || 0)

        totalInputTokens += hourInputTokens
        totalOutputTokens += hourOutputTokens
        totalCacheCreateTokens += hourCacheCreateTokens
        totalCacheReadTokens += hourCacheReadTokens
        totalAllTokens += hourAllTokens
        totalRequests += hourRequests

        if (hourAllTokens > 0) {
          logger.debug(`   Hour data: allTokens=${hourAllTokens}, requests=${hourRequests}`)
        }

        // 处理每个模型的数据
        for (const [key, value] of Object.entries(data)) {
          // 查找模型相关的键（格式: model:{modelName}:{metric}）
          if (key.startsWith('model:')) {
            const parts = key.split(':')
            if (parts.length >= 3) {
              const modelName = parts[1]
              const metric = parts.slice(2).join(':')

              if (!modelUsage[modelName]) {
                modelUsage[modelName] = {
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreateTokens: 0,
                  cacheReadTokens: 0,
                  ephemeral5mTokens: 0,
                  ephemeral1hTokens: 0,
                  allTokens: 0,
                  requests: 0
                }
              }

              if (metric === 'inputTokens') {
                modelUsage[modelName].inputTokens += parseInt(value || 0)
              } else if (metric === 'outputTokens') {
                modelUsage[modelName].outputTokens += parseInt(value || 0)
              } else if (metric === 'cacheCreateTokens') {
                modelUsage[modelName].cacheCreateTokens += parseInt(value || 0)
              } else if (metric === 'cacheReadTokens') {
                modelUsage[modelName].cacheReadTokens += parseInt(value || 0)
              } else if (metric === 'ephemeral5mTokens') {
                modelUsage[modelName].ephemeral5mTokens += parseInt(value || 0)
              } else if (metric === 'ephemeral1hTokens') {
                modelUsage[modelName].ephemeral1hTokens += parseInt(value || 0)
              } else if (metric === 'allTokens') {
                modelUsage[modelName].allTokens += parseInt(value || 0)
              } else if (metric === 'requests') {
                modelUsage[modelName].requests += parseInt(value || 0)
              }
            }
          }
        }
      }

      logger.debug(`📊 Session window usage summary:`)
      logger.debug(`   Total allTokens: ${totalAllTokens}`)
      logger.debug(`   Total requests: ${totalRequests}`)
      logger.debug(`   Input: ${totalInputTokens}, Output: ${totalOutputTokens}`)
      logger.debug(
        `   Cache Create: ${totalCacheCreateTokens}, Cache Read: ${totalCacheReadTokens}`
      )

      return {
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreateTokens,
        totalCacheReadTokens,
        totalAllTokens,
        totalRequests,
        modelUsage
      }
    } catch (error) {
      logger.error(`❌ Failed to get session window usage for account ${accountId}:`, error)
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreateTokens: 0,
        totalCacheReadTokens: 0,
        totalAllTokens: 0,
        totalRequests: 0,
        modelUsage: {}
      }
    }
  }
}

const redisClient = new RedisClient()

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

// 导出时区辅助函数
redisClient.getDateInTimezone = getDateInTimezone
redisClient.getDateStringInTimezone = getDateStringInTimezone
redisClient.getHourInTimezone = getHourInTimezone
redisClient.getWeekStringInTimezone = getWeekStringInTimezone
redisClient.getPeriodString = getPeriodString
redisClient.getNextResetTime = getNextResetTime
redisClient.getPeriodStartDate = getPeriodStartDate

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
  const lockKey = `user_msg_queue_lock:${accountId}`
  const lastTimeKey = `user_msg_queue_last:${accountId}`

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
  const lockKey = `user_msg_queue_lock:${accountId}`
  const lastTimeKey = `user_msg_queue_last:${accountId}`

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
  const lockKey = `user_msg_queue_lock:${accountId}`

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
  const lockKey = `user_msg_queue_lock:${accountId}`
  const lastTimeKey = `user_msg_queue_last:${accountId}`

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
        'user_msg_queue_lock:*',
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

// ============================================
// 🚦 API Key 并发请求排队方法
// ============================================

/**
 * 增加排队计数（使用 Lua 脚本确保原子性）
 * @param {string} apiKeyId - API Key ID
 * @param {number} [timeoutMs=60000] - 排队超时时间（毫秒），用于计算 TTL
 * @returns {Promise<number>} 增加后的排队数量
 */
redisClient.incrConcurrencyQueue = async function (apiKeyId, timeoutMs = 60000) {
  const key = `concurrency:queue:${apiKeyId}`
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
  const key = `concurrency:queue:${apiKeyId}`
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
  const key = `concurrency:queue:${apiKeyId}`
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
  const key = `concurrency:queue:${apiKeyId}`
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
        'concurrency:queue:*',
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
        'concurrency:queue:*',
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
  const key = `concurrency:queue:stats:${apiKeyId}`
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
  const key = `concurrency:queue:stats:${apiKeyId}`
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
  const key = `concurrency:queue:wait_times:${apiKeyId}`
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
  const key = 'concurrency:queue:wait_times:global'
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
  const key = 'concurrency:queue:wait_times:global'
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
  const key = `concurrency:queue:wait_times:${apiKeyId}`
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
        'concurrency:queue:stats:*',
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

// ============================================================================
// 账户测试历史相关操作
// ============================================================================

const ACCOUNT_TEST_HISTORY_MAX = 5 // 保留最近5次测试记录
const ACCOUNT_TEST_HISTORY_TTL = 86400 * 30 // 30天过期
const ACCOUNT_TEST_CONFIG_TTL = 86400 * 365 // 测试配置保留1年（用户通常长期使用）

/**
 * 保存账户测试结果
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型 (claude/gemini/openai等)
 * @param {Object} testResult - 测试结果对象
 * @param {boolean} testResult.success - 是否成功
 * @param {string} testResult.message - 测试消息/响应
 * @param {number} testResult.latencyMs - 延迟毫秒数
 * @param {string} testResult.error - 错误信息（如有）
 * @param {string} testResult.timestamp - 测试时间戳
 */
redisClient.saveAccountTestResult = async function (accountId, platform, testResult) {
  const key = `account:test_history:${platform}:${accountId}`
  try {
    const record = JSON.stringify({
      ...testResult,
      timestamp: testResult.timestamp || new Date().toISOString()
    })

    // 使用 LPUSH + LTRIM 保持最近5条记录
    const client = this.getClientSafe()
    await client.lpush(key, record)
    await client.ltrim(key, 0, ACCOUNT_TEST_HISTORY_MAX - 1)
    await client.expire(key, ACCOUNT_TEST_HISTORY_TTL)

    logger.debug(`📝 Saved test result for ${platform} account ${accountId}`)
  } catch (error) {
    logger.error(`Failed to save test result for ${accountId}:`, error)
  }
}

/**
 * 获取账户测试历史
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 * @returns {Promise<Array>} 测试历史记录数组（最新在前）
 */
redisClient.getAccountTestHistory = async function (accountId, platform) {
  const key = `account:test_history:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    const records = await client.lrange(key, 0, -1)
    return records.map((r) => JSON.parse(r))
  } catch (error) {
    logger.error(`Failed to get test history for ${accountId}:`, error)
    return []
  }
}

/**
 * 获取账户最新测试结果
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 * @returns {Promise<Object|null>} 最新测试结果
 */
redisClient.getAccountLatestTestResult = async function (accountId, platform) {
  const key = `account:test_history:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    const record = await client.lindex(key, 0)
    return record ? JSON.parse(record) : null
  } catch (error) {
    logger.error(`Failed to get latest test result for ${accountId}:`, error)
    return null
  }
}

/**
 * 批量获取多个账户的测试历史
 * @param {Array<{accountId: string, platform: string}>} accounts - 账户列表
 * @returns {Promise<Object>} 以 accountId 为 key 的测试历史映射
 */
redisClient.getAccountsTestHistory = async function (accounts) {
  const result = {}
  try {
    const client = this.getClientSafe()
    const pipeline = client.pipeline()

    for (const { accountId, platform } of accounts) {
      const key = `account:test_history:${platform}:${accountId}`
      pipeline.lrange(key, 0, -1)
    }

    const responses = await pipeline.exec()

    accounts.forEach(({ accountId }, index) => {
      const [err, records] = responses[index]
      if (!err && records) {
        result[accountId] = records.map((r) => JSON.parse(r))
      } else {
        result[accountId] = []
      }
    })
  } catch (error) {
    logger.error('Failed to get batch test history:', error)
  }
  return result
}

/**
 * 保存定时测试配置
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 * @param {Object} config - 配置对象
 * @param {boolean} config.enabled - 是否启用定时测试
 * @param {string} config.cronExpression - Cron 表达式 (如 "0 8 * * *" 表示每天8点)
 * @param {string} config.model - 测试使用的模型
 */
redisClient.saveAccountTestConfig = async function (accountId, platform, testConfig) {
  const key = `account:test_config:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    await client.hset(key, {
      enabled: testConfig.enabled ? 'true' : 'false',
      cronExpression: testConfig.cronExpression || '0 8 * * *', // 默认每天早上8点
      model: testConfig.model || 'claude-sonnet-4-5-20250929', // 默认模型
      updatedAt: new Date().toISOString()
    })
    // 设置过期时间（1年）
    await client.expire(key, ACCOUNT_TEST_CONFIG_TTL)
  } catch (error) {
    logger.error(`Failed to save test config for ${accountId}:`, error)
  }
}

/**
 * 获取定时测试配置
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 * @returns {Promise<Object|null>} 配置对象
 */
redisClient.getAccountTestConfig = async function (accountId, platform) {
  const key = `account:test_config:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    const testConfig = await client.hgetall(key)
    if (!testConfig || Object.keys(testConfig).length === 0) {
      return null
    }
    // 向后兼容：如果存在旧的 testHour 字段，转换为 cron 表达式
    let { cronExpression } = testConfig
    if (!cronExpression && testConfig.testHour) {
      const hour = parseInt(testConfig.testHour, 10)
      cronExpression = `0 ${hour} * * *`
    }
    return {
      enabled: testConfig.enabled === 'true',
      cronExpression: cronExpression || '0 8 * * *',
      model: testConfig.model || 'claude-sonnet-4-5-20250929',
      updatedAt: testConfig.updatedAt
    }
  } catch (error) {
    logger.error(`Failed to get test config for ${accountId}:`, error)
    return null
  }
}

/**
 * 获取所有启用定时测试的账户
 * @param {string} platform - 平台类型
 * @returns {Promise<Array>} 账户ID列表及 cron 配置
 */
redisClient.getEnabledTestAccounts = async function (platform) {
  const accountIds = []
  let cursor = '0'

  try {
    const client = this.getClientSafe()
    do {
      const [newCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `account:test_config:${platform}:*`,
        'COUNT',
        100
      )
      cursor = newCursor

      for (const key of keys) {
        const testConfig = await client.hgetall(key)
        if (testConfig && testConfig.enabled === 'true') {
          const accountId = key.replace(`account:test_config:${platform}:`, '')
          // 向后兼容：如果存在旧的 testHour 字段，转换为 cron 表达式
          let { cronExpression } = testConfig
          if (!cronExpression && testConfig.testHour) {
            const hour = parseInt(testConfig.testHour, 10)
            cronExpression = `0 ${hour} * * *`
          }
          accountIds.push({
            accountId,
            cronExpression: cronExpression || '0 8 * * *',
            model: testConfig.model || 'claude-sonnet-4-5-20250929'
          })
        }
      }
    } while (cursor !== '0')

    return accountIds
  } catch (error) {
    logger.error(`Failed to get enabled test accounts for ${platform}:`, error)
    return []
  }
}

/**
 * 保存账户上次测试时间（用于调度器判断是否需要测试）
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 */
redisClient.setAccountLastTestTime = async function (accountId, platform) {
  const key = `account:last_test:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    await client.set(key, Date.now().toString(), 'EX', 86400 * 7) // 7天过期
  } catch (error) {
    logger.error(`Failed to set last test time for ${accountId}:`, error)
  }
}

/**
 * 获取账户上次测试时间
 * @param {string} accountId - 账户ID
 * @param {string} platform - 平台类型
 * @returns {Promise<number|null>} 上次测试时间戳
 */
redisClient.getAccountLastTestTime = async function (accountId, platform) {
  const key = `account:last_test:${platform}:${accountId}`
  try {
    const client = this.getClientSafe()
    const timestamp = await client.get(key)
    return timestamp ? parseInt(timestamp, 10) : null
  } catch (error) {
    logger.error(`Failed to get last test time for ${accountId}:`, error)
    return null
  }
}

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
    pipeline.hgetall(`usage:${keyId}`)
    pipeline.hgetall(`usage:daily:${keyId}:${today}`)
    pipeline.hgetall(`usage:monthly:${keyId}:${currentMonth}`)
    // cost stats (4 get)
    pipeline.get(`usage:cost:daily:${keyId}:${today}`)
    pipeline.get(`usage:cost:monthly:${keyId}:${currentMonth}`)
    pipeline.get(`usage:cost:hourly:${keyId}:${currentHour}`)
    pipeline.get(`usage:cost:total:${keyId}`)
    // concurrency (1 zcard)
    pipeline.zcard(`concurrency:${keyId}`)
    // weekly opus cost (1 get)
    pipeline.get(`usage:opus:weekly:${keyId}:${currentWeek}`)
    // rate limit (4 get)
    pipeline.get(`rate_limit:requests:${keyId}`)
    pipeline.get(`rate_limit:tokens:${keyId}`)
    pipeline.get(`rate_limit:cost:${keyId}`)
    pipeline.get(`rate_limit:window_start:${keyId}`)
    // apikey data for createdAt (1 hgetall)
    pipeline.hgetall(`apikey:${keyId}`)
  }

  const results = await pipeline.exec()
  const statsMap = new Map()
  const FIELDS_PER_KEY = 14

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
        total: parseFloat(costTotal || 0)
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
  const emptyMarker = await client.get(`${indexKey}:empty`)
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
    await client.setex(`${indexKey}:empty`, 3600, '1')
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
  await client.del(`${indexKey}:empty`)
}

/**
 * 从索引移除
 */
redisClient.removeFromIndex = async function (indexKey, id) {
  const client = this.getClientSafe()
  await client.srem(indexKey, id)
}

// ============================================
// 数据迁移相关
// ============================================

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
  keyIds.forEach((id) => pipeline.hgetall(`usage:${id}`))
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
  await this.client.hset('usage:global:total', total)

  // 迁移月份索引（从现有的 usage:model:monthly:* key 中提取月份）
  const monthlyKeys = await this.client.keys('usage:model:monthly:*')
  const months = new Set()
  for (const key of monthlyKeys) {
    const match = key.match(/:(\d{4}-\d{2})$/)
    if (match) {
      months.add(match[1])
    }
  }
  if (months.size > 0) {
    await this.client.sadd('usage:model:monthly:months', ...months)
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
  const monthlyKeys = await this.client.keys('usage:model:monthly:*')
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
  const existingMonths = await this.client.smembers('usage:model:monthly:months')
  const existingSet = new Set(existingMonths)

  // 找出缺失的月份
  const missingMonths = [...allMonths].filter((m) => !existingSet.has(m))

  if (missingMonths.length > 0) {
    await this.client.sadd('usage:model:monthly:months', ...missingMonths)
    logger.info(
      `📅 补充月份索引: ${missingMonths.length} 个月份 (${missingMonths.sort().join(', ')})`
    )
  }
}

// 检查是否需要迁移
redisClient.needsGlobalStatsMigration = async function () {
  const exists = await this.client.exists('usage:global:total')
  return exists === 0
}

// 获取已迁移版本
redisClient.getMigratedVersion = async function () {
  return (await this.client.get('system:migrated:version')) || '0.0.0'
}

// 设置已迁移版本
redisClient.setMigratedVersion = async function (version) {
  await this.client.set('system:migrated:version', version)
}

// 获取全局统计（用于 dashboard 快速查询）
redisClient.getGlobalStats = async function () {
  const stats = await this.client.hgetall('usage:global:total')
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
  keyIds.forEach((id) => pipeline.hget(`apikey:${id}`, 'isActive'))
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

  const keys = await this.scanKeys('system:metrics:minute:*')
  if (!keys || keys.length === 0) {
    logger.info('📊 没有需要清理的系统分钟统计数据')
    return { cleaned: 0 }
  }

  // 计算当前分钟时间戳和保留窗口
  const metricsWindow = config.system?.metricsWindow || 5
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

module.exports = redisClient
