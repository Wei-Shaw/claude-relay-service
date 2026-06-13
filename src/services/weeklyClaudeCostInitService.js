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
  // bedrock/azure/gemini 等不计入 Opus 周费用
  return null
}

// 用于全模型周费用回填：覆盖所有 account 类型（按 Claude 优先，其次 OpenAI/Gemini/Bedrock/Droid）
// serviceRatesService.getService 接受 null accountType 时会按 model fallback，所以推断不到也没关系
function inferAnyAccountType(keyData) {
  if (!keyData) {
    return null
  }
  if (keyData.ccrAccountId) {
    return 'ccr'
  }
  if (keyData.claudeConsoleAccountId) {
    return 'claude-console'
  }
  if (keyData.claudeAccountId) {
    return 'claude-official'
  }
  if (keyData.azureOpenaiAccountId) {
    return 'azure-openai'
  }
  if (keyData.openaiAccountId) {
    return 'openai'
  }
  if (keyData.geminiAccountId) {
    return 'gemini'
  }
  if (keyData.bedrockAccountId) {
    return 'bedrock'
  }
  if (keyData.droidAccountId) {
    return 'droid'
  }
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

  _buildWeeklyKey(keyId, periodString) {
    return `usage:weekly:${keyId}:${periodString}`
  }

  /**
   * 启动回填：从"按日/按模型"统计中反算费用，根据每个 API Key 的
   * weeklyResetDay/weeklyResetHour 计算周期，双写两个 bucket：
   *   - `usage:opus:weekly:*`：仅 Claude 模型 + claude-official/claude-console/ccr 账户
   *   - `usage:weekly:*`：全模型 + 全账户类型
   *
   * 说明：
   * - 回填最近 8 天数据（覆盖任意重置配置的完整 7 天周期）
   * - 会加分布式锁，避免多实例重复跑
   * - 会写 done 标记：同一天内重启默认不重复回填
   * - done 标记 key 名已升级（init:weekly_cost），旧标记会被忽略，第一次启动会重新回填一次以确保两个 bucket 都填上
   */
  async backfillCurrentWeekClaudeCosts() {
    const client = redis.getClientSafe()
    if (!client) {
      logger.warn('⚠️ 周费用回填跳过：Redis client 不可用')
      return { success: false, reason: 'redis_unavailable' }
    }

    if (!pricingService || !pricingService.pricingData) {
      logger.warn('⚠️ 周费用回填跳过：pricing service 未初始化')
      return { success: false, reason: 'pricing_uninitialized' }
    }

    const todayStr = redis.getDateStringInTimezone()
    const doneKey = `init:weekly_cost:${todayStr}:done`

    try {
      const alreadyDone = await client.get(doneKey)
      if (alreadyDone) {
        logger.info(`ℹ️ 周费用回填已完成（${todayStr}），跳过`)
        return { success: true, skipped: true }
      }
    } catch (e) {
      // 尽力而为：读取失败不阻断启动回填流程。
    }

    const lockKey = `lock:init:weekly_cost:${todayStr}`
    const lockValue = `${process.pid}:${Date.now()}`
    const lockTtlMs = 15 * 60 * 1000

    const lockAcquired = await redis.setAccountLock(lockKey, lockValue, lockTtlMs)
    if (!lockAcquired) {
      logger.info(`ℹ️ 周费用回填已在运行（${todayStr}），跳过`)
      return { success: true, skipped: true, reason: 'locked' }
    }

    const startedAt = Date.now()
    try {
      logger.info(`💰 开始回填周费用（${todayStr}）...`)

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

      // 两个独立累加桶：
      // - opusCostByKeyDate：仅 Claude 模型 + claude-official/claude-console/ccr 账户（保留运行时 recordOpusCost 逻辑）
      // - allCostByKeyDate：全模型 + 全账户类型（对应运行时 recordWeeklyCost）
      const opusCostByKeyDate = new Map()
      const allCostByKeyDate = new Map()
      let scannedKeys = 0
      let matchedClaudeEntries = 0
      let totalEntries = 0

      for (const dateStr of dates) {
        let cursor = '0'
        const pattern = `usage:*:model:daily:*:${dateStr}`

        do {
          const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
          cursor = nextCursor
          scannedKeys += keys.length

          // 不在准备阶段过滤 model，全部进入处理（Opus 桶在后面按需累加）
          const entries = []
          for (const usageKey of keys) {
            const match = usageKey.match(/^usage:([^:]+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
            if (!match) {
              continue
            }
            entries.push({ usageKey, keyId: match[1], model: match[2], dateStr })
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
            totalEntries++

            const keyData = keyDataCache.get(entry.keyId)
            const isClaudeModel = isClaudeFamilyModel(entry.model)

            // ----- Opus bucket：保留运行时 recordOpusCost 的过滤条件 -----
            const opusAccountType = inferAccountType(keyData)
            if (isClaudeModel && opusAccountType && OPUS_ACCOUNT_TYPES.includes(opusAccountType)) {
              matchedClaudeEntries++
              const opusService = serviceRatesService.getService(opusAccountType, entry.model)

              let globalRate = globalRateCache.get(opusService)
              if (globalRate === undefined) {
                globalRate = await serviceRatesService.getServiceRate(opusService)
                globalRateCache.set(opusService, globalRate)
              }

              let keyRates = {}
              try {
                keyRates = JSON.parse(keyData?.serviceRates || '{}')
              } catch (e) {
                keyRates = {}
              }
              const keyRate = keyRates[opusService] ?? 1.0
              const opusRatedCost = realCost * globalRate * keyRate

              if (!opusCostByKeyDate.has(entry.keyId)) {
                opusCostByKeyDate.set(entry.keyId, new Map())
              }
              const opusDateMap = opusCostByKeyDate.get(entry.keyId)
              opusDateMap.set(entry.dateStr, (opusDateMap.get(entry.dateStr) || 0) + opusRatedCost)
            }

            // ----- 全模型 bucket：所有模型 + 所有账户类型 -----
            const anyAccountType = inferAnyAccountType(keyData)
            const anyService = serviceRatesService.getService(anyAccountType, entry.model)

            let anyRatedCost = realCost
            if (anyService) {
              let anyGlobalRate = globalRateCache.get(anyService)
              if (anyGlobalRate === undefined) {
                anyGlobalRate = await serviceRatesService.getServiceRate(anyService)
                globalRateCache.set(anyService, anyGlobalRate)
              }

              let anyKeyRates = {}
              try {
                anyKeyRates = JSON.parse(keyData?.serviceRates || '{}')
              } catch (e) {
                anyKeyRates = {}
              }
              const anyKeyRate = anyKeyRates[anyService] ?? 1.0
              anyRatedCost = realCost * anyGlobalRate * anyKeyRate
            }

            if (!allCostByKeyDate.has(entry.keyId)) {
              allCostByKeyDate.set(entry.keyId, new Map())
            }
            const allDateMap = allCostByKeyDate.get(entry.keyId)
            allDateMap.set(entry.dateStr, (allDateMap.get(entry.dateStr) || 0) + anyRatedCost)
          }
        } while (cursor !== '0')
      }

      // 为每个 API Key 按其重置配置计算当前周期费用，双写两个 bucket
      const ttlSeconds = 14 * 24 * 3600
      let filledOpus = 0
      let filledAll = 0
      for (let i = 0; i < keyIds.length; i += batchSize) {
        const batch = keyIds.slice(i, i + batchSize)
        const pipeline = client.pipeline()
        for (const keyId of batch) {
          const keyData = keyDataCache.get(keyId)
          const resetDay = parseInt(keyData?.weeklyResetDay || 1)
          const resetHour = parseInt(keyData?.weeklyResetHour || 0)

          const periodStart = redis.getPeriodStartDate(resetDay, resetHour)
          const periodStartDateStr = formatTzDateYmd(periodStart)
          const periodString = redis.getPeriodString(resetDay, resetHour)

          // Opus bucket
          let opusPeriodCost = 0
          const opusDateMap = opusCostByKeyDate.get(keyId)
          if (opusDateMap) {
            for (const [dateStr, cost] of opusDateMap) {
              if (dateStr >= periodStartDateStr) {
                opusPeriodCost += cost
              }
            }
          }
          if (opusPeriodCost > 0) {
            filledOpus++
          }
          const opusKey = this._buildWeeklyOpusKey(keyId, periodString)
          pipeline.set(opusKey, String(opusPeriodCost))
          pipeline.expire(opusKey, ttlSeconds)

          // 全模型 bucket
          let allPeriodCost = 0
          const allDateMap = allCostByKeyDate.get(keyId)
          if (allDateMap) {
            for (const [dateStr, cost] of allDateMap) {
              if (dateStr >= periodStartDateStr) {
                allPeriodCost += cost
              }
            }
          }
          if (allPeriodCost > 0) {
            filledAll++
          }
          const weeklyKey = this._buildWeeklyKey(keyId, periodString)
          pipeline.set(weeklyKey, String(allPeriodCost))
          pipeline.expire(weeklyKey, ttlSeconds)
        }
        await pipeline.exec()
      }

      // 写入 done 标记（保留 2 天，每天重新回填一次）
      await client.set(doneKey, new Date().toISOString(), 'EX', 2 * 24 * 3600)

      const durationMs = Date.now() - startedAt
      logger.info(
        `✅ 周费用回填完成（${todayStr}）：keys=${keyIds.length}, scanned=${scannedKeys}, entries=${totalEntries}, matchedClaude=${matchedClaudeEntries}, filledOpus=${filledOpus}, filledAll=${filledAll}（${durationMs}ms）`
      )

      return {
        success: true,
        todayStr,
        keyCount: keyIds.length,
        scannedKeys,
        totalEntries,
        matchedClaudeEntries,
        filledOpus,
        filledAll,
        durationMs
      }
    } catch (error) {
      logger.error(`❌ 周费用回填失败（${todayStr}）：`, error)
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

      const periodStart = redis.getPeriodStartDate(resetDay, resetHour)
      const periodStartDateStr = formatTzDateYmd(periodStart)
      const periodString = redis.getPeriodString(resetDay, resetHour)

      const opusAccountType = inferAccountType(keyData)
      const anyAccountType = inferAnyAccountType(keyData)
      const opusEligible = opusAccountType && OPUS_ACCOUNT_TYPES.includes(opusAccountType)

      // 扫描最近 8 天的每日使用数据
      const dates = this._getLast7DaysInTimezone()
      const globalRateCache = new Map()
      let opusCost = 0
      let allCost = 0

      let keyRates = {}
      try {
        keyRates = JSON.parse(keyData.serviceRates || '{}')
      } catch (e) {
        keyRates = {}
      }

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

          // 不过滤 model，全部进入处理
          const pipeline = client.pipeline()
          const models = []
          for (const usageKey of keys) {
            const match = usageKey.match(/^usage:[^:]+:model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
            if (!match) {
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

            const isClaudeModel = isClaudeFamilyModel(model)

            // Opus bucket：保留现有过滤
            if (opusEligible && isClaudeModel) {
              const opusService = serviceRatesService.getService(opusAccountType, model)
              let globalRate = globalRateCache.get(opusService)
              if (globalRate === undefined) {
                globalRate = await serviceRatesService.getServiceRate(opusService)
                globalRateCache.set(opusService, globalRate)
              }
              const keyRate = keyRates[opusService] ?? 1.0
              opusCost += realCost * globalRate * keyRate
            }

            // 全模型 bucket：所有模型
            const anyService = serviceRatesService.getService(anyAccountType, model)
            if (anyService) {
              let anyGlobalRate = globalRateCache.get(anyService)
              if (anyGlobalRate === undefined) {
                anyGlobalRate = await serviceRatesService.getServiceRate(anyService)
                globalRateCache.set(anyService, anyGlobalRate)
              }
              const anyKeyRate = keyRates[anyService] ?? 1.0
              allCost += realCost * anyGlobalRate * anyKeyRate
            } else {
              allCost += realCost
            }
          }
        } while (cursor !== '0')
      }

      // 双写两个 bucket（即使 cost=0 也要写，确保旧值被覆盖）
      await redis.setWeeklyOpusCost(keyId, opusCost, periodString)
      await redis.setWeeklyCost(keyId, allCost, periodString)
      logger.info(
        `💰 单 Key 回填完成 (${keyId})：period=${periodString}, opus=$${opusCost.toFixed(6)}, all=$${allCost.toFixed(6)}`
      )

      return { success: true, opusCost, allCost, periodString }
    } catch (error) {
      logger.error(`❌ 单 Key 回填失败 (${keyId})：`, error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = new WeeklyClaudeCostInitService()
