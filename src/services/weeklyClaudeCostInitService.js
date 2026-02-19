const redis = require('../models/redis')
const logger = require('../utils/logger')
const pricingService = require('./pricingService')
const serviceRatesService = require('./serviceRatesService')
const { isOpusModel } = require('../utils/modelHelper')

function pad2(n) {
  return String(n).padStart(2, '0')
}

// 生成配置时区下的 YYYY-MM-DD 字符串。
// 注意：入参 date 必须是 redis.getDateInTimezone() 生成的“时区偏移后”的 Date。
function formatTzDateYmd(tzDate) {
  return `${tzDate.getUTCFullYear()}-${pad2(tzDate.getUTCMonth() + 1)}-${pad2(tzDate.getUTCDate())}`
}

class WeeklyClaudeCostInitService {
  _getCurrentWeekDatesInTimezone() {
    const tzNow = redis.getDateInTimezone(new Date())
    const tzToday = new Date(tzNow)
    tzToday.setUTCHours(0, 0, 0, 0)

    // ISO 周：周一=1 ... 周日=7
    const isoDay = tzToday.getUTCDay() || 7
    const tzMonday = new Date(tzToday)
    tzMonday.setUTCDate(tzToday.getUTCDate() - (isoDay - 1))

    const dates = []
    for (let d = new Date(tzMonday); d <= tzToday; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(formatTzDateYmd(d))
    }
    return dates
  }

  _buildWeeklyOpusKey(keyId, weekString) {
    return `usage:opus:weekly:${keyId}:${weekString}`
  }

  /**
   * 启动回填：把"本周（周一到今天）Claude 全模型"周费用从按日/按模型统计里反算出来，
   * 写入 `usage:opus:weekly:*`，保证周限额在重启后不归零。
   *
   * 说明：
   * - 只回填本周，不做历史回填（符合"只要本周数据"诉求）
   * - 会加分布式锁，避免多实例重复跑
   * - 会写 done 标记：同一周内重启默认不重复回填（需要时可手动删掉 done key）
   */
  async backfillCurrentWeekClaudeCosts() {
    const client = redis.getClientSafe()
    if (!client) {
      logger.warn('⚠️ 本周 Claude 周费用回填跳过：Redis client 不可用')
      return { success: false, reason: 'redis_unavailable' }
    }

    if (!pricingService || !pricingService.pricingData) {
      logger.warn('⚠️ 本周 Claude 周费用回填跳过：pricing service 未初始化')
      return { success: false, reason: 'pricing_uninitialized' }
    }

    const weekString = redis.getWeekStringInTimezone()
    const doneKey = `init:weekly_opus_cost:${weekString}:done`

    try {
      const alreadyDone = await client.get(doneKey)
      if (alreadyDone) {
        logger.info(`ℹ️ 本周 Claude 周费用回填已完成（${weekString}），跳过`)
        return { success: true, skipped: true }
      }
    } catch (e) {
      // 尽力而为：读取失败不阻断启动回填流程。
    }

    const lockKey = `lock:init:weekly_opus_cost:${weekString}`
    const lockValue = `${process.pid}:${Date.now()}`
    const lockTtlMs = 15 * 60 * 1000

    const lockAcquired = await redis.setAccountLock(lockKey, lockValue, lockTtlMs)
    if (!lockAcquired) {
      logger.info(`ℹ️ 本周 Claude 周费用回填已在运行（${weekString}），跳过`)
      return { success: true, skipped: true, reason: 'locked' }
    }

    const startedAt = Date.now()
    try {
      logger.info(`💰 开始回填本周 Claude 周费用：${weekString}（仅本周）...`)

      const keyIds = await redis.scanApiKeyIds()
      const dates = this._getCurrentWeekDatesInTimezone()

      // 预加载所有 API Key 数据和全局倍率（避免循环内重复查询）
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

      // 推断账户类型的辅助函数（与运行时 recordOpusCost 一致，只统计 claude-official/claude-console/ccr）
      const OPUS_ACCOUNT_TYPES = ['claude-official', 'claude-console', 'ccr']
      const inferAccountType = (keyData) => {
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

      const costByKeyId = new Map()
      let scannedKeys = 0
      let matchedClaudeKeys = 0

      const toInt = (v) => {
        const n = parseInt(v || '0', 10)
        return Number.isFinite(n) ? n : 0
      }

      // 扫描“按日 + 按模型”的使用统计 key，并反算 Claude 系列模型的费用。
      for (const dateStr of dates) {
        let cursor = '0'
        const pattern = `usage:*:model:daily:*:${dateStr}`

        do {
          const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
          cursor = nextCursor
          scannedKeys += keys.length

          const entries = []
          for (const usageKey of keys) {
            // usage:{keyId}:model:daily:{model}:{YYYY-MM-DD}
            const match = usageKey.match(/^usage:([^:]+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
            if (!match) {
              continue
            }
            const keyId = match[1]
            const model = match[2]
            if (!isOpusModel(model)) {
              continue
            }
            matchedClaudeKeys++
            entries.push({ usageKey, keyId, model })
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

            // 应用倍率：全局倍率 × Key 倍率（使用缓存数据）
            const keyData = keyDataCache.get(entry.keyId)
            const accountType = inferAccountType(keyData)

            // 与运行时 recordOpusCost 一致：只统计 claude-official/claude-console/ccr 账户
            if (!accountType || !OPUS_ACCOUNT_TYPES.includes(accountType)) {
              continue
            }

            const service = serviceRatesService.getService(accountType, entry.model)

            // 获取全局倍率（带缓存）
            let globalRate = globalRateCache.get(service)
            if (globalRate === undefined) {
              globalRate = await serviceRatesService.getServiceRate(service)
              globalRateCache.set(service, globalRate)
            }

            // 获取 Key 倍率
            let keyRates = {}
            try {
              keyRates = JSON.parse(keyData?.serviceRates || '{}')
            } catch (e) {
              keyRates = {}
            }
            const keyRate = keyRates[service] ?? 1.0
            const ratedCost = realCost * globalRate * keyRate

            costByKeyId.set(entry.keyId, (costByKeyId.get(entry.keyId) || 0) + ratedCost)
          }
        } while (cursor !== '0')
      }

      // 为所有 API Key 写入本周 opus:weekly key
      const ttlSeconds = 14 * 24 * 3600
      for (let i = 0; i < keyIds.length; i += batchSize) {
        const batch = keyIds.slice(i, i + batchSize)
        const pipeline = client.pipeline()
        for (const keyId of batch) {
          const weeklyKey = this._buildWeeklyOpusKey(keyId, weekString)
          const cost = costByKeyId.get(keyId) || 0
          pipeline.set(weeklyKey, String(cost))
          pipeline.expire(weeklyKey, ttlSeconds)
        }
        await pipeline.exec()
      }

      // 写入 done 标记（保留略长于 1 周，避免同一周内重启重复回填）。
      await client.set(doneKey, new Date().toISOString(), 'EX', 10 * 24 * 3600)

      const durationMs = Date.now() - startedAt
      logger.info(
        `✅ 本周 Claude 周费用回填完成（${weekString}）：keys=${keyIds.length}, scanned=${scannedKeys}, matchedClaude=${matchedClaudeKeys}, filled=${costByKeyId.size}（${durationMs}ms）`
      )

      return {
        success: true,
        weekString,
        keyCount: keyIds.length,
        scannedKeys,
        matchedClaudeKeys,
        filledKeys: costByKeyId.size,
        durationMs
      }
    } catch (error) {
      logger.error(`❌ 本周 Claude 周费用回填失败（${weekString}）：`, error)
      return { success: false, error: error.message }
    } finally {
      await redis.releaseAccountLock(lockKey, lockValue)
    }
  }
}

module.exports = new WeeklyClaudeCostInitService()
