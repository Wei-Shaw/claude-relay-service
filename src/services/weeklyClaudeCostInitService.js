const redis = require('../models/redis')
const logger = require('../utils/logger')
const pricingService = require('./pricingService')
const serviceRatesService = require('./serviceRatesService')
const { isClaudeFamilyModel } = require('../utils/modelHelper')

function pad2(n) {
  return String(n).padStart(2, '0')
}

// 生成配置时区下的 YYYY-MM-DD 字符串。
// 注意：入参 date 必须是 redis.getDateInTimezone() 生成的"时区偏移后"的 Date。
function formatTzDateYmd(tzDate) {
  return `${tzDate.getUTCFullYear()}-${pad2(tzDate.getUTCMonth() + 1)}-${pad2(tzDate.getUTCDate())}`
}

// 推断账户类型的辅助函数（与运行时 recordOpusCost 一致，只统计 claude-official/claude-console/ccr）
const OPUS_ACCOUNT_TYPES = ['claude-official', 'claude-console', 'ccr']

function inferAccountType(keyData) {
  if (keyData?.ccrAccountId) {
    return 'ccr'
  }
  if (keyData?.claudeConsoleAccountId) {
    return 'claude-console'
  }
  if (keyData?.claudeAccountId) {
    return 'claude-official'
  }
  // bedrock/azure/gemini 等不计入周费用
  return null
}

function toInt(v) {
  const n = parseInt(v || '0', 10)
  return Number.isFinite(n) ? n : 0
}

class WeeklyClaudeCostInitService {
  // 获取最近 7 天的日期字符串数组（覆盖任意重置配置的完整周期）
  _getLast7DaysInTimezone() {
    const tzNow = redis.getDateInTimezone(new Date())
    const tzToday = new Date(tzNow)
    tzToday.setUTCHours(0, 0, 0, 0)

    const dates = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date(tzToday)
      d.setUTCDate(tzToday.getUTCDate() - i)
      dates.push(formatTzDateYmd(d))
    }
    return dates
  }

  _buildWeeklyOpusKey(keyId, periodString) {
    return `usage:opus:weekly:${keyId}:${periodString}`
  }

  /**
   * 启动回填：从"按日/按模型"统计中反算 Claude 模型费用，
   * 根据每个 API Key 的 weeklyResetDay/weeklyResetHour 计算周期，
   * 写入 `usage:opus:weekly:*`，保证周限额在重启后不归零。
   *
   * 说明：
   * - 回填最近 8 天数据（覆盖任意重置配置的完整 7 天周期）
   * - 会加分布式锁，避免多实例重复跑
   * - 会写 done 标记：同一天内重启默认不重复回填
   */
  async backfillCurrentWeekClaudeCosts() {
    const client = redis.getClientSafe()
    if (!client) {
      logger.warn('⚠️ Claude 周费用回填跳过：Redis client 不可用')
      return { success: false, reason: 'redis_unavailable' }
    }

    if (!pricingService || !pricingService.pricingData) {
      logger.warn('⚠️ Claude 周费用回填跳过：pricing service 未初始化')
      return { success: false, reason: 'pricing_uninitialized' }
    }

    const todayStr = redis.getDateStringInTimezone()
    const doneKey = `init:weekly_opus_cost:${todayStr}:done`

    try {
      const alreadyDone = await client.get(doneKey)
      if (alreadyDone) {
        logger.info(`ℹ️ Claude 周费用回填已完成（${todayStr}），跳过`)
        return { success: true, skipped: true }
      }
    } catch (e) {
      // 尽力而为：读取失败不阻断启动回填流程。
    }

    const lockKey = `lock:init:weekly_opus_cost:${todayStr}`
    const lockValue = `${process.pid}:${Date.now()}`
    const lockTtlMs = 15 * 60 * 1000

    const lockAcquired = await redis.setAccountLock(lockKey, lockValue, lockTtlMs)
    if (!lockAcquired) {
      logger.info(`ℹ️ Claude 周费用回填已在运行（${todayStr}），跳过`)
      return { success: true, skipped: true, reason: 'locked' }
    }

    const startedAt = Date.now()
    try {
      logger.info(`💰 开始回填 Claude 周费用（${todayStr}）...`)

      const keyIds = await redis.scanApiKeyIds()
      const dates = this._getLast7DaysInTimezone()

      // 预加载所有 API Key 数据和全局倍率
      const keyDataCache = new Map()
      const globalRateCache = new Map()
      const batchSize = 500
      for (let i = 0; i < keyIds.length; i += batchSize) {
        const batch = keyIds.slice(i, i + batchSize)
        const pipeline = client.pipeline()
        for (const keyId of batch) {
          pipeline.hgetall(`apikey:${keyId}`)
        }
        const results = await pipeline.exec()
        for (let j = 0; j < batch.length; j++) {
          const [, data] = results[j] || []
          if (data && Object.keys(data).length > 0) {
            keyDataCache.set(batch[j], data)
          }
        }
      }
      logger.info(`💰 预加载 ${keyDataCache.size} 个 API Key 数据`)

      // 收集每个 key 每天的费用: Map<keyId, Map<dateStr, ratedCost>>
      const costByKeyDate = new Map()
      let scannedKeys = 0
      let matchedClaudeKeys = 0

      for (const dateStr of dates) {
        let cursor = '0'
        const pattern = `usage:*:model:daily:*:${dateStr}`

        do {
          const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
          cursor = nextCursor
          scannedKeys += keys.length

          const entries = []
          for (const usageKey of keys) {
            const match = usageKey.match(/^usage:([^:]+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
            if (!match) {
              continue
            }
            const keyId = match[1]
            const model = match[2]
            if (!isClaudeFamilyModel(model)) {
              continue
            }
            matchedClaudeKeys++
            entries.push({ usageKey, keyId, model, dateStr })
          }

          if (entries.length === 0) {
            continue
          }

          const pipeline = client.pipeline()
          for (const entry of entries) {
            pipeline.hgetall(entry.usageKey)
          }
          const results = await pipeline.exec()

          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            const [, data] = results[i] || []
            if (!data || Object.keys(data).length === 0) {
              continue
            }

            const inputTokens = toInt(data.totalInputTokens || data.inputTokens)
            const outputTokens = toInt(data.totalOutputTokens || data.outputTokens)
            const cacheReadTokens = toInt(data.totalCacheReadTokens || data.cacheReadTokens)
            const cacheCreateTokens = toInt(data.totalCacheCreateTokens || data.cacheCreateTokens)
            const ephemeral5mTokens = toInt(data.ephemeral5mTokens)
            const ephemeral1hTokens = toInt(data.ephemeral1hTokens)

            const cacheCreationTotal =
              ephemeral5mTokens > 0 || ephemeral1hTokens > 0
                ? ephemeral5mTokens + ephemeral1hTokens
                : cacheCreateTokens

            const usage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreationTotal,
              cache_read_input_tokens: cacheReadTokens
            }

            if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: ephemeral5mTokens,
                ephemeral_1h_input_tokens: ephemeral1hTokens
              }
            }

            const costInfo = pricingService.calculateCost(usage, entry.model)
            const realCost = costInfo && costInfo.totalCost ? costInfo.totalCost : 0
            if (realCost <= 0) {
              continue
            }

            const keyData = keyDataCache.get(entry.keyId)
            const accountType = inferAccountType(keyData)

            if (!accountType || !OPUS_ACCOUNT_TYPES.includes(accountType)) {
              continue
            }

            const service = serviceRatesService.getService(accountType, entry.model)

            let globalRate = globalRateCache.get(service)
            if (globalRate === undefined) {
              globalRate = await serviceRatesService.getServiceRate(service)
              globalRateCache.set(service, globalRate)
            }

            let keyRates = {}
            try {
              keyRates = JSON.parse(keyData?.serviceRates || '{}')
            } catch (e) {
              keyRates = {}
            }
            const keyRate = keyRates[service] ?? 1.0
            const ratedCost = realCost * globalRate * keyRate

            // 按 keyId+dateStr 累加
            if (!costByKeyDate.has(entry.keyId)) {
              costByKeyDate.set(entry.keyId, new Map())
            }
            const dateMap = costByKeyDate.get(entry.keyId)
            dateMap.set(entry.dateStr, (dateMap.get(entry.dateStr) || 0) + ratedCost)
          }
        } while (cursor !== '0')
      }

      // 为每个 API Key 按其重置配置计算当前周期费用
      const ttlSeconds = 14 * 24 * 3600
      let filledCount = 0
      for (let i = 0; i < keyIds.length; i += batchSize) {
        const batch = keyIds.slice(i, i + batchSize)
        const pipeline = client.pipeline()
        for (const keyId of batch) {
          const keyData = keyDataCache.get(keyId)
          const resetDay = parseInt(keyData?.weeklyResetDay || 1)
          const resetHour = parseInt(keyData?.weeklyResetHour || 0)

          // 获取当前周期的起始日期
          const periodStart = redis.getPeriodStartDate(resetDay, resetHour)
          const periodStartDateStr = formatTzDateYmd(periodStart)
          const periodString = redis.getPeriodString(resetDay, resetHour)

          // 汇总该 key 在当前周期内的费用
          const dateMap = costByKeyDate.get(keyId)
          let periodCost = 0
          if (dateMap) {
            for (const [dateStr, cost] of dateMap) {
              if (dateStr >= periodStartDateStr) {
                periodCost += cost
              }
            }
          }

          if (periodCost > 0) {
            filledCount++
          }

          const weeklyKey = this._buildWeeklyOpusKey(keyId, periodString)
          pipeline.set(weeklyKey, String(periodCost))
          pipeline.expire(weeklyKey, ttlSeconds)
        }
        await pipeline.exec()
      }

      // 写入 done 标记（保留 2 天，每天重新回填一次）
      await client.set(doneKey, new Date().toISOString(), 'EX', 2 * 24 * 3600)

      const durationMs = Date.now() - startedAt
      logger.info(
        `✅ Claude 周费用回填完成（${todayStr}）：keys=${keyIds.length}, scanned=${scannedKeys}, matchedClaude=${matchedClaudeKeys}, filled=${filledCount}（${durationMs}ms）`
      )

      return {
        success: true,
        todayStr,
        keyCount: keyIds.length,
        scannedKeys,
        matchedClaudeKeys,
        filledKeys: filledCount,
        durationMs
      }
    } catch (error) {
      logger.error(`❌ Claude 周费用回填失败（${todayStr}）：`, error)
      return { success: false, error: error.message }
    } finally {
      await redis.releaseAccountLock(lockKey, lockValue)
    }
  }

  /**
   * 为单个 API Key 回填当前周期费用（重置配置变更后触发）
   */
  async backfillSingleKey(keyId) {
    const client = redis.getClientSafe()
    if (!client) {
      logger.warn(`⚠️ 单 Key 回填跳过 (${keyId})：Redis client 不可用`)
      return { success: false, reason: 'redis_unavailable' }
    }

    if (!pricingService || !pricingService.pricingData) {
      try {
        await pricingService.initialize()
      } catch (e) {
        logger.warn(`⚠️ 单 Key 回填跳过 (${keyId})：pricing service 未初始化`)
        return { success: false, reason: 'pricing_uninitialized' }
      }
    }

    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        return { success: false, reason: 'key_not_found' }
      }

      const resetDay = parseInt(keyData.weeklyResetDay || 1)
      const resetHour = parseInt(keyData.weeklyResetHour || 0)

      const accountType = inferAccountType(keyData)
      if (!accountType || !OPUS_ACCOUNT_TYPES.includes(accountType)) {
        // 非 Claude 账户，写入 0 即可
        const periodString = redis.getPeriodString(resetDay, resetHour)
        await redis.setWeeklyOpusCost(keyId, 0, periodString)
        return { success: true, cost: 0, reason: 'non_claude_account' }
      }

      const periodStart = redis.getPeriodStartDate(resetDay, resetHour)
      const periodStartDateStr = formatTzDateYmd(periodStart)
      const periodString = redis.getPeriodString(resetDay, resetHour)

      // 扫描最近 8 天的每日使用数据
      const dates = this._getLast7DaysInTimezone()
      const globalRateCache = new Map()
      let totalCost = 0

      for (const dateStr of dates) {
        if (dateStr < periodStartDateStr) {
          continue
        }

        let cursor = '0'
        const pattern = `usage:${keyId}:model:daily:*:${dateStr}`

        do {
          const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
          cursor = nextCursor

          if (keys.length === 0) {
            continue
          }

          const pipeline = client.pipeline()
          const models = []
          for (const usageKey of keys) {
            const match = usageKey.match(/^usage:[^:]+:model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
            if (!match || !isClaudeFamilyModel(match[1])) {
              continue
            }
            models.push(match[1])
            pipeline.hgetall(usageKey)
          }

          if (models.length === 0) {
            continue
          }

          const results = await pipeline.exec()

          for (let i = 0; i < models.length; i++) {
            const model = models[i]
            const [, data] = results[i] || []
            if (!data || Object.keys(data).length === 0) {
              continue
            }

            const inputTokens = toInt(data.totalInputTokens || data.inputTokens)
            const outputTokens = toInt(data.totalOutputTokens || data.outputTokens)
            const cacheReadTokens = toInt(data.totalCacheReadTokens || data.cacheReadTokens)
            const cacheCreateTokens = toInt(data.totalCacheCreateTokens || data.cacheCreateTokens)
            const ephemeral5mTokens = toInt(data.ephemeral5mTokens)
            const ephemeral1hTokens = toInt(data.ephemeral1hTokens)

            const cacheCreationTotal =
              ephemeral5mTokens > 0 || ephemeral1hTokens > 0
                ? ephemeral5mTokens + ephemeral1hTokens
                : cacheCreateTokens

            const usage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreationTotal,
              cache_read_input_tokens: cacheReadTokens
            }

            if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: ephemeral5mTokens,
                ephemeral_1h_input_tokens: ephemeral1hTokens
              }
            }

            const costInfo = pricingService.calculateCost(usage, model)
            const realCost = costInfo && costInfo.totalCost ? costInfo.totalCost : 0
            if (realCost <= 0) {
              continue
            }

            const service = serviceRatesService.getService(accountType, model)

            let globalRate = globalRateCache.get(service)
            if (globalRate === undefined) {
              globalRate = await serviceRatesService.getServiceRate(service)
              globalRateCache.set(service, globalRate)
            }

            let keyRates = {}
            try {
              keyRates = JSON.parse(keyData.serviceRates || '{}')
            } catch (e) {
              keyRates = {}
            }
            const keyRate = keyRates[service] ?? 1.0
            totalCost += realCost * globalRate * keyRate
          }
        } while (cursor !== '0')
      }

      await redis.setWeeklyOpusCost(keyId, totalCost, periodString)
      logger.info(
        `💰 单 Key 回填完成 (${keyId})：period=${periodString}, cost=$${totalCost.toFixed(6)}`
      )

      return { success: true, cost: totalCost, periodString }
    } catch (error) {
      logger.error(`❌ 单 Key 回填失败 (${keyId})：`, error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = new WeeklyClaudeCostInitService()
