// ============================================================================
// 用量统计（token/账户用量、用量记录、模型聚合、会话窗口用量；从 redis.js 按域抽出）
// 经 attach(redisClient) 挂到同一个 RedisClient 单例上，this 绑定与原文件一致。
// 跨域 this 调用(getAccountDailyCost/getAllIdsByIndex/scanKeys/batchDelChunked/getClient)
// 均经同一单例解析。私有 _normalizeModelName 仅本域使用，一并迁出。
// ============================================================================
const logger = require('../../utils/logger')
const { RedisKeys, TTL, LIMITS } = require('../../constants/redisKeys')
const { normalizeKeyTokenStats, normalizeAccountTokenStats } = require('../../compat/tokenStats')
const {
  getDateInTimezone,
  getDateStringInTimezone,
  getHourInTimezone
} = require('../../utils/timezone')

function attach(redisClient) {
  // 📊 使用统计相关操作（支持缓存token统计和模型信息）
  // 标准化模型名称，用于统计聚合
  redisClient._normalizeModelName = function (model) {
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

  redisClient.incrementTokenUsage = async function (
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
    const key = RedisKeys.usage.total(keyId)
    const now = new Date()
    const today = getDateStringInTimezone(now)
    const tzDate = getDateInTimezone(now)
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const currentHour = `${today}:${String(getHourInTimezone(now)).padStart(2, '0')}` // 新增小时级别

    const daily = RedisKeys.usage.daily(keyId, today)
    const monthly = RedisKeys.usage.monthly(keyId, currentMonth)
    const hourly = RedisKeys.usage.hourly(keyId, currentHour) // 新增小时级别key

    // 标准化模型名用于统计聚合
    const normalizedModel = this._normalizeModelName(model)

    // 按模型统计的键
    const modelDaily = RedisKeys.usage.modelDaily(normalizedModel, today)
    const modelMonthly = RedisKeys.usage.modelMonthly(normalizedModel, currentMonth)
    const modelHourly = RedisKeys.usage.modelHourly(normalizedModel, currentHour) // 新增模型小时级别

    // API Key级别的模型统计
    const keyModelDaily = RedisKeys.usage.keyModelDaily(keyId, normalizedModel, today)
    const keyModelMonthly = RedisKeys.usage.keyModelMonthly(keyId, normalizedModel, currentMonth)
    const keyModelHourly = RedisKeys.usage.keyModelHourly(keyId, normalizedModel, currentHour) // 新增API Key模型小时级别

    // 新增：系统级分钟统计
    const minuteTimestamp = Math.floor(now.getTime() / 60000)
    const systemMinuteKey = RedisKeys.system.metricsMinute(minuteTimestamp)

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
    const keyModelAlltime = RedisKeys.usage.keyModelAlltime(keyId, normalizedModel)
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
    pipeline.expire(daily, TTL.usageDaily) // 32天过期
    pipeline.expire(monthly, TTL.usageMonthly) // 1年过期
    pipeline.expire(hourly, TTL.usageHourly) // 小时统计7天过期
    pipeline.expire(modelDaily, TTL.usageDaily) // 模型每日统计32天过期
    pipeline.expire(modelMonthly, TTL.usageMonthly) // 模型每月统计1年过期
    pipeline.expire(modelHourly, TTL.usageHourly) // 模型小时统计7天过期
    pipeline.expire(keyModelDaily, TTL.usageDaily) // API Key模型每日统计32天过期
    pipeline.expire(keyModelMonthly, TTL.usageMonthly) // API Key模型每月统计1年过期
    pipeline.expire(keyModelHourly, TTL.usageHourly) // API Key模型小时统计7天过期

    // 系统级分钟统计的过期时间（窗口时间的2倍，默认5分钟）
    pipeline.expire(systemMinuteKey, TTL.systemMetrics())

    // 添加索引（用于快速查询，避免 SCAN）
    pipeline.sadd(RedisKeys.usage.dailyIndex(today), keyId)
    pipeline.sadd(RedisKeys.usage.hourlyIndex(currentHour), keyId)
    pipeline.sadd(RedisKeys.usage.modelDailyIndex(today), normalizedModel)
    pipeline.sadd(RedisKeys.usage.modelHourlyIndex(currentHour), normalizedModel)
    pipeline.sadd(RedisKeys.usage.modelMonthlyIndex(currentMonth), normalizedModel)
    pipeline.sadd(RedisKeys.usage.modelMonthlyMonths, currentMonth) // 全局月份索引
    pipeline.sadd(RedisKeys.usage.keymodelDailyIndex(today), `${keyId}:${normalizedModel}`)
    pipeline.sadd(RedisKeys.usage.keymodelHourlyIndex(currentHour), `${keyId}:${normalizedModel}`)
    // 清理空标记（有新数据时）
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.dailyIndex(today)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.hourlyIndex(currentHour)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.modelDailyIndex(today)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.modelHourlyIndex(currentHour)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.modelMonthlyIndex(currentMonth)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.keymodelDailyIndex(today)))
    pipeline.del(RedisKeys.emptyMarker(RedisKeys.usage.keymodelHourlyIndex(currentHour)))
    // 索引过期时间
    pipeline.expire(RedisKeys.usage.dailyIndex(today), TTL.usageDaily)
    pipeline.expire(RedisKeys.usage.hourlyIndex(currentHour), TTL.usageHourly)
    pipeline.expire(RedisKeys.usage.modelDailyIndex(today), TTL.usageDaily)
    pipeline.expire(RedisKeys.usage.modelHourlyIndex(currentHour), TTL.usageHourly)
    pipeline.expire(RedisKeys.usage.modelMonthlyIndex(currentMonth), TTL.usageMonthly)
    pipeline.expire(RedisKeys.usage.keymodelDailyIndex(today), TTL.usageDaily)
    pipeline.expire(RedisKeys.usage.keymodelHourlyIndex(currentHour), TTL.usageHourly)

    // 全局预聚合统计
    const globalDaily = RedisKeys.usage.globalDaily(today)
    const globalMonthly = RedisKeys.usage.globalMonthly(currentMonth)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'requests', 1)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'inputTokens', finalInputTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'outputTokens', finalOutputTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'cacheCreateTokens', finalCacheCreateTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'cacheReadTokens', finalCacheReadTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'allTokens', totalTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'ephemeral5mTokens', ephemeral5mTokens)
    pipeline.hincrby(RedisKeys.usage.globalTotal, 'ephemeral1hTokens', ephemeral1hTokens)
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
    pipeline.expire(globalDaily, TTL.usageDaily)
    pipeline.expire(globalMonthly, TTL.usageMonthly)

    // 执行Pipeline
    await pipeline.exec()
  }

  // 📊 记录账户级别的使用统计
  redisClient.incrementAccountUsage = async function (
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
    const accountKey = RedisKeys.accountUsage.total(accountId)
    const accountDaily = RedisKeys.accountUsage.daily(accountId, today)
    const accountMonthly = RedisKeys.accountUsage.monthly(accountId, currentMonth)
    const accountHourly = RedisKeys.accountUsage.hourly(accountId, currentHour)

    // 标准化模型名用于统计聚合
    const normalizedModel = this._normalizeModelName(model)

    // 账户按模型统计的键
    const accountModelDaily = RedisKeys.accountUsage.modelDaily(accountId, normalizedModel, today)
    const accountModelMonthly = RedisKeys.accountUsage.modelMonthly(
      accountId,
      normalizedModel,
      currentMonth
    )
    const accountModelHourly = RedisKeys.accountUsage.modelHourly(
      accountId,
      normalizedModel,
      currentHour
    )

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
      this.client.expire(accountDaily, TTL.usageDaily), // 32天过期
      this.client.expire(accountMonthly, TTL.usageMonthly), // 1年过期
      this.client.expire(accountHourly, TTL.usageHourly), // 7天过期
      this.client.expire(accountModelDaily, TTL.usageDaily), // 32天过期
      this.client.expire(accountModelMonthly, TTL.usageMonthly), // 1年过期
      this.client.expire(accountModelHourly, TTL.usageHourly), // 7天过期

      // 添加索引
      this.client.sadd(RedisKeys.accountUsage.hourlyIndex(currentHour), accountId),
      this.client.sadd(
        RedisKeys.accountUsage.modelHourlyIndex(currentHour),
        `${accountId}:${normalizedModel}`
      ),
      this.client.expire(RedisKeys.accountUsage.hourlyIndex(currentHour), TTL.usageHourly),
      this.client.expire(RedisKeys.accountUsage.modelHourlyIndex(currentHour), TTL.usageHourly),
      // daily 索引
      this.client.sadd(RedisKeys.accountUsage.dailyIndex(today), accountId),
      this.client.sadd(
        RedisKeys.accountUsage.modelDailyIndex(today),
        `${accountId}:${normalizedModel}`
      ),
      this.client.expire(RedisKeys.accountUsage.dailyIndex(today), TTL.usageDaily),
      this.client.expire(RedisKeys.accountUsage.modelDailyIndex(today), TTL.usageDaily),
      // 清理空标记
      this.client.del(RedisKeys.emptyMarker(RedisKeys.accountUsage.hourlyIndex(currentHour))),
      this.client.del(RedisKeys.emptyMarker(RedisKeys.accountUsage.modelHourlyIndex(currentHour))),
      this.client.del(RedisKeys.emptyMarker(RedisKeys.accountUsage.dailyIndex(today))),
      this.client.del(RedisKeys.emptyMarker(RedisKeys.accountUsage.modelDailyIndex(today)))
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

  redisClient.getKeyIdsWithModels = async function (keyIds, models) {
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
        const key = RedisKeys.usage.keyModelAlltime(keyId, model)
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
        const samplePattern = RedisKeys.usage.keyAlltimePattern(keyIds[idx])
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
            const pattern = RedisKeys.usage.keyModelAnyPattern(keyId, model)
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

  redisClient.getAllUsedModels = async function () {
    const client = this.getClientSafe()
    const models = new Set()

    // 扫描所有模型使用记录
    const pattern = RedisKeys.usage.crossModelDailyPattern
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

  redisClient.getUsageStats = async function (keyId) {
    const totalKey = RedisKeys.usage.total(keyId)
    const today = getDateStringInTimezone()
    const dailyKey = RedisKeys.usage.daily(keyId, today)
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const monthlyKey = RedisKeys.usage.monthly(keyId, currentMonth)

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(totalKey),
      this.client.hgetall(dailyKey),
      this.client.hgetall(monthlyKey)
    ])

    // 获取API Key的创建时间来计算平均值
    const keyData = await this.client.hgetall(RedisKeys.apiKey.byId(keyId))
    const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date()
    const now = new Date()
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)))

    const totalTokens = parseInt(total.totalTokens) || 0
    const totalRequests = parseInt(total.totalRequests) || 0

    // 计算平均RPM (requests per minute) 和 TPM (tokens per minute)
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)
    const avgRPM = totalRequests / totalMinutes
    const avgTPM = totalTokens / totalMinutes

    const totalData = normalizeKeyTokenStats(total)
    const dailyData = normalizeKeyTokenStats(daily)
    const monthlyData = normalizeKeyTokenStats(monthly)

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

  redisClient.addUsageRecord = async function (keyId, record, maxRecords = LIMITS.usageRecords) {
    const listKey = RedisKeys.usage.records(keyId)
    const client = this.getClientSafe()

    try {
      await client
        .multi()
        .lpush(listKey, JSON.stringify(record))
        .ltrim(listKey, 0, Math.max(0, maxRecords - 1))
        .expire(listKey, TTL.usageRecords) // 默认保留90天
        .exec()
    } catch (error) {
      logger.error(`❌ Failed to append usage record for key ${keyId}:`, error)
    }
  }

  redisClient.getUsageRecords = async function (keyId, limit = 50) {
    const listKey = RedisKeys.usage.records(keyId)
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

  // 📊 获取账户使用统计
  redisClient.getAccountUsageStats = async function (accountId, accountType = null) {
    const accountKey = RedisKeys.accountUsage.total(accountId)
    const today = getDateStringInTimezone()
    const accountDailyKey = RedisKeys.accountUsage.daily(accountId, today)
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`
    const accountMonthlyKey = RedisKeys.accountUsage.monthly(accountId, currentMonth)

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(accountKey),
      this.client.hgetall(accountDailyKey),
      this.client.hgetall(accountMonthlyKey)
    ])

    // 获取账户创建时间来计算平均值 - 支持不同类型的账号
    let accountData = {}
    if (accountType === 'droid') {
      accountData = await this.client.hgetall(RedisKeys.accounts.droid(accountId))
    } else if (accountType === 'openai') {
      accountData = await this.client.hgetall(RedisKeys.accounts.openai(accountId))
    } else if (accountType === 'openai-responses') {
      accountData = await this.client.hgetall(RedisKeys.accounts.openaiResponses(accountId))
    } else {
      // 尝试多个前缀（优先 claude:account:）
      accountData = await this.client.hgetall(RedisKeys.accounts.claude(accountId))
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(RedisKeys.accounts.claudeUnderscore(accountId))
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(RedisKeys.accounts.openai(accountId))
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(RedisKeys.accounts.openaiResponses(accountId))
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(RedisKeys.accounts.openaiUnderscore(accountId))
      }
      if (!accountData.createdAt) {
        accountData = await this.client.hgetall(RedisKeys.accounts.droid(accountId))
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

    const totalData = normalizeAccountTokenStats(total)
    const dailyData = normalizeAccountTokenStats(daily)
    const monthlyData = normalizeAccountTokenStats(monthly)

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
  redisClient.getAllAccountsUsageStats = async function () {
    try {
      // 使用 getAllIdsByIndex 获取账户 ID（自动处理索引/SCAN 回退）
      const accountIds = await this.getAllIdsByIndex(
        RedisKeys.accounts.claudeIndex,
        RedisKeys.accounts.claudePattern,
        /^claude:account:(.+)$/
      )

      if (accountIds.length === 0) {
        return []
      }

      const accountStats = []

      for (const accountId of accountIds) {
        const accountKey = RedisKeys.accounts.claude(accountId)
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
  redisClient.resetAllUsageStats = async function () {
    const client = this.getClientSafe()
    const stats = {
      deletedKeys: 0,
      deletedDailyKeys: 0,
      deletedMonthlyKeys: 0,
      resetApiKeys: 0
    }

    try {
      // 1. 获取所有 API Key ID（使用 scanKeys）
      const apiKeyKeys = await this.scanKeys(RedisKeys.apiKey.allPattern)
      const apiKeyIds = apiKeyKeys
        .filter((k) => k !== RedisKeys.apiKey.hashMap && k.split(':').length === 2)
        .map((k) => k.replace('apikey:', ''))

      // 2. 批量删除总体使用统计
      const usageKeys = apiKeyIds.map((id) => RedisKeys.usage.total(id))
      stats.deletedKeys = await this.batchDelChunked(usageKeys)

      // 3. 使用 scanKeys 获取并批量删除 daily 统计
      const dailyKeys = await this.scanKeys(RedisKeys.usage.dailyPattern)
      stats.deletedDailyKeys = await this.batchDelChunked(dailyKeys)

      // 4. 使用 scanKeys 获取并批量删除 monthly 统计
      const monthlyKeys = await this.scanKeys(RedisKeys.usage.monthlyPattern)
      stats.deletedMonthlyKeys = await this.batchDelChunked(monthlyKeys)

      // 5. 批量重置 lastUsedAt（仅对存在的 key 操作，避免重建空 hash）
      const BATCH_SIZE = 500
      for (let i = 0; i < apiKeyIds.length; i += BATCH_SIZE) {
        const batch = apiKeyIds.slice(i, i + BATCH_SIZE)
        const existsPipeline = client.pipeline()
        for (const keyId of batch) {
          existsPipeline.exists(RedisKeys.apiKey.byId(keyId))
        }
        const existsResults = await existsPipeline.exec()

        const updatePipeline = client.pipeline()
        let updateCount = 0
        for (let j = 0; j < batch.length; j++) {
          const [err, exists] = existsResults[j]
          if (!err && exists) {
            updatePipeline.hset(RedisKeys.apiKey.byId(batch[j]), 'lastUsedAt', '')
            updateCount++
          }
        }
        if (updateCount > 0) {
          await updatePipeline.exec()
          stats.resetApiKeys += updateCount
        }
      }

      // 6. 清理所有 usage 相关键（使用 scanKeys + batchDelChunked）
      const allUsageKeys = await this.scanKeys(RedisKeys.usage.allPattern)
      const additionalDeleted = await this.batchDelChunked(allUsageKeys)
      stats.deletedKeys += additionalDeleted

      return stats
    } catch (error) {
      throw new Error(`Failed to reset usage stats: ${error.message}`)
    }
  }

  // 📊 获取账户会话窗口内的使用统计（包含模型细分）
  redisClient.getAccountSessionWindowUsage = async function (accountId, windowStart, windowEnd) {
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
        const key = RedisKeys.accountUsage.hourly(accountId, `${tzDateStr}:${tzHour}`)

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

module.exports = { attach }
