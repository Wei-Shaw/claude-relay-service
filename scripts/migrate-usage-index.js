/**
 * 历史数据索引迁移脚本
 * 为现有的 usage 数据建立索引，加速查询
 */
const Redis = require('ioredis')
const config = require('../config/config')

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db || 0
})

async function migrate() {
  console.log('开始迁移历史数据索引...')
  console.log('Redis DB:', config.redis.db || 0)

  const stats = {
    dailyIndex: 0,
    hourlyIndex: 0,
    modelDailyIndex: 0,
    modelHourlyIndex: 0
  }

  // 1. 迁移 usage:daily:{keyId}:{date} 索引
  console.log('\n1. 迁移 usage:daily 索引...')
  let cursor = '0'
  do {
    const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'usage:daily:*', 'COUNT', 500)
    cursor = newCursor

    const pipeline = redis.pipeline()
    for (const key of keys) {
      // usage:daily:{keyId}:{date}
      const match = key.match(/^usage:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
      if (match) {
        const [, keyId, date] = match
        pipeline.sadd(`usage:daily:index:${date}`, keyId)
        pipeline.expire(`usage:daily:index:${date}`, 86400 * 32)
        stats.dailyIndex++
      }
    }
    if (keys.length > 0) {
      await pipeline.exec()
    }
  } while (cursor !== '0')
  console.log(`  已处理 ${stats.dailyIndex} 条`)

  // 2. 迁移 usage:hourly:{keyId}:{date}:{hour} 索引
  console.log('\n2. 迁移 usage:hourly 索引...')
  cursor = '0'
  do {
    const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'usage:hourly:*', 'COUNT', 500)
    cursor = newCursor

    const pipeline = redis.pipeline()
    for (const key of keys) {
      // usage:hourly:{keyId}:{date}:{hour}
      const match = key.match(/^usage:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
      if (match) {
        const [, keyId, hourKey] = match
        pipeline.sadd(`usage:hourly:index:${hourKey}`, keyId)
        pipeline.expire(`usage:hourly:index:${hourKey}`, 86400 * 7)
        stats.hourlyIndex++
      }
    }
    if (keys.length > 0) {
      await pipeline.exec()
    }
  } while (cursor !== '0')
  console.log(`  已处理 ${stats.hourlyIndex} 条`)

  // 3. 迁移 usage:model:daily:{model}:{date} 索引
  console.log('\n3. 迁移 usage:model:daily 索引...')
  cursor = '0'
  do {
    const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'usage:model:daily:*', 'COUNT', 500)
    cursor = newCursor

    const pipeline = redis.pipeline()
    for (const key of keys) {
      // usage:model:daily:{model}:{date}
      const match = key.match(/^usage:model:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
      if (match) {
        const [, model, date] = match
        pipeline.sadd(`usage:model:daily:index:${date}`, model)
        pipeline.expire(`usage:model:daily:index:${date}`, 86400 * 32)
        stats.modelDailyIndex++
      }
    }
    if (keys.length > 0) {
      await pipeline.exec()
    }
  } while (cursor !== '0')
  console.log(`  已处理 ${stats.modelDailyIndex} 条`)

  // 4. 迁移 usage:model:hourly:{model}:{date}:{hour} 索引
  console.log('\n4. 迁移 usage:model:hourly 索引...')
  cursor = '0'
  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      'usage:model:hourly:*',
      'COUNT',
      500
    )
    cursor = newCursor

    const pipeline = redis.pipeline()
    for (const key of keys) {
      // usage:model:hourly:{model}:{date}:{hour}
      const match = key.match(/^usage:model:hourly:([^:]+):(\d{4}-\d{2}-\d{2}:\d{2})$/)
      if (match) {
        const [, model, hourKey] = match
        pipeline.sadd(`usage:model:hourly:index:${hourKey}`, model)
        pipeline.expire(`usage:model:hourly:index:${hourKey}`, 86400 * 7)
        stats.modelHourlyIndex++
      }
    }
    if (keys.length > 0) {
      await pipeline.exec()
    }
  } while (cursor !== '0')
  console.log(`  已处理 ${stats.modelHourlyIndex} 条`)

  console.log('\n迁移完成!')
  console.log('统计:', stats)

  redis.disconnect()
}

migrate().catch((err) => {
  console.error('迁移失败:', err)
  redis.disconnect()
  process.exit(1)
})
