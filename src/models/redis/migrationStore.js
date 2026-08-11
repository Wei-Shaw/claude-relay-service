// ============================================================================
// 启动期数据迁移（usage 索引、alltime 模型统计；从 src/models/redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 由 app.js / bootstrap 在启动时调用 redis.migrateUsageIndex()/migrateAlltimeModelStats()。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL } = require('../../constants/redisKeys')

function attach(redisClient) {
  // 🔄 自动迁移 usage 索引（启动时调用）
  redisClient.migrateUsageIndex = async function () {
    const migrationKey = RedisKeys.system.migrationUsageIndexV2 // v2: 添加 keymodel 迁移
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
          RedisKeys.usage.dailyPattern,
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            pipeline.sadd(RedisKeys.usage.dailyIndex(match[2]), match[1])
            pipeline.expire(RedisKeys.usage.dailyIndex(match[2]), TTL.usageDaily)
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
          RedisKeys.usage.hourlyPattern,
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
          if (match) {
            pipeline.sadd(RedisKeys.usage.hourlyIndex(match[2]), match[1])
            pipeline.expire(RedisKeys.usage.hourlyIndex(match[2]), TTL.usageHourly)
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
          RedisKeys.usage.modelDailyPattern,
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:model:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
          if (match) {
            pipeline.sadd(RedisKeys.usage.modelDailyIndex(match[2]), match[1])
            pipeline.expire(RedisKeys.usage.modelDailyIndex(match[2]), TTL.usageDaily)
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
          RedisKeys.usage.modelHourlyPattern,
          'COUNT',
          500
        )
        cursor = newCursor
        const pipeline = this.client.pipeline()
        for (const key of keys) {
          const match = key.match(/^usage:model:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
          if (match) {
            pipeline.sadd(RedisKeys.usage.modelHourlyIndex(match[2]), match[1])
            pipeline.expire(RedisKeys.usage.modelHourlyIndex(match[2]), TTL.usageHourly)
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
          RedisKeys.usage.crossModelDailyPattern,
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
            pipeline.sadd(RedisKeys.usage.keymodelDailyIndex(date), `${keyId}:${model}`)
            pipeline.expire(RedisKeys.usage.keymodelDailyIndex(date), TTL.usageDaily)
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
          RedisKeys.usage.crossModelHourlyPattern,
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
            pipeline.sadd(RedisKeys.usage.keymodelHourlyIndex(hour), `${keyId}:${model}`)
            pipeline.expire(RedisKeys.usage.keymodelHourlyIndex(hour), TTL.usageHourly)
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
  redisClient.migrateAlltimeModelStats = async function () {
    const migrationKey = RedisKeys.system.migrationAlltimeModelStatsV1
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
          RedisKeys.usage.crossModelMonthlyPattern,
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
        const alltimeKey = RedisKeys.usage.keyModelAlltime(agg.keyId, agg.model)
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
}

module.exports = { attach }
