const express = require('express')
const apiKeyService = require('../../services/apiKeyService')
const claudeAccountService = require('../../services/claudeAccountService')
const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
const bedrockAccountService = require('../../services/bedrockAccountService')
const ccrAccountService = require('../../services/ccrAccountService')
const geminiAccountService = require('../../services/geminiAccountService')
const droidAccountService = require('../../services/droidAccountService')
const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const CostCalculator = require('../../utils/costCalculator')
const config = require('../../../config/config')

const router = express.Router()

// 📊 系统统计

// 获取系统概览
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const [
      ,
      apiKeys,
      claudeAccounts,
      claudeConsoleAccounts,
      geminiAccounts,
      bedrockAccountsResult,
      openaiAccounts,
      ccrAccounts,
      openaiResponsesAccounts,
      droidAccounts,
      todayStats,
      systemAverages,
      realtimeMetrics
    ] = await Promise.all([
      redis.getSystemStats(),
      apiKeyService.getAllApiKeys(),
      claudeAccountService.getAllAccounts(),
      claudeConsoleAccountService.getAllAccounts(),
      geminiAccountService.getAllAccounts(),
      bedrockAccountService.getAllAccounts(),
      redis.getAllOpenAIAccounts(),
      ccrAccountService.getAllAccounts(),
      openaiResponsesAccountService.getAllAccounts(true),
      droidAccountService.getAllAccounts(),
      redis.getTodayStats(),
      redis.getSystemAverages(),
      redis.getRealtimeSystemMetrics()
    ])

    // 处理Bedrock账户数据
    const bedrockAccounts = bedrockAccountsResult.success ? bedrockAccountsResult.data : []
    const normalizeBoolean = (value) => value === true || value === 'true'
    const isRateLimitedFlag = (status) => {
      if (!status) {
        return false
      }
      if (typeof status === 'string') {
        return status === 'limited'
      }
      if (typeof status === 'object') {
        return status.isRateLimited === true
      }
      return false
    }

    const normalDroidAccounts = droidAccounts.filter(
      (acc) =>
        normalizeBoolean(acc.isActive) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        normalizeBoolean(acc.schedulable) &&
        !isRateLimitedFlag(acc.rateLimitStatus)
    ).length
    const abnormalDroidAccounts = droidAccounts.filter(
      (acc) =>
        !normalizeBoolean(acc.isActive) || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedDroidAccounts = droidAccounts.filter(
      (acc) =>
        !normalizeBoolean(acc.schedulable) &&
        normalizeBoolean(acc.isActive) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedDroidAccounts = droidAccounts.filter((acc) =>
      isRateLimitedFlag(acc.rateLimitStatus)
    ).length

    // 计算使用统计（统一使用allTokens）
    const totalTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.allTokens || 0),
      0
    )
    const totalRequestsUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.requests || 0),
      0
    )
    const totalInputTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.inputTokens || 0),
      0
    )
    const totalOutputTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.outputTokens || 0),
      0
    )
    const totalCacheCreateTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.cacheCreateTokens || 0),
      0
    )
    const totalCacheReadTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.cacheReadTokens || 0),
      0
    )
    const totalAllTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.allTokens || 0),
      0
    )

    const activeApiKeys = apiKeys.filter((key) => key.isActive).length

    // Claude账户统计 - 根据账户管理页面的判断逻辑
    const normalClaudeAccounts = claudeAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalClaudeAccounts = claudeAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedClaudeAccounts = claudeAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedClaudeAccounts = claudeAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    // Claude Console账户统计
    const normalClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    // Gemini账户统计
    const normalGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(
          acc.rateLimitStatus === 'limited' ||
          (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
        )
    ).length
    const abnormalGeminiAccounts = geminiAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.rateLimitStatus === 'limited' ||
        (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length

    // Bedrock账户统计
    const normalBedrockAccounts = bedrockAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalBedrockAccounts = bedrockAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedBedrockAccounts = bedrockAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedBedrockAccounts = bedrockAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    // OpenAI账户统计
    // 注意：OpenAI账户的isActive和schedulable是字符串类型，默认值为'true'
    const normalOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== 'false' &&
        acc.schedulable !== false && // 包括'true'、true和undefined
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        acc.isActive === 'false' ||
        acc.isActive === false ||
        acc.status === 'blocked' ||
        acc.status === 'unauthorized'
    ).length
    const pausedOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        (acc.schedulable === 'false' || acc.schedulable === false) &&
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedOpenAIAccounts = openaiAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    // CCR账户统计
    const normalCcrAccounts = ccrAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalCcrAccounts = ccrAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedCcrAccounts = ccrAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedCcrAccounts = ccrAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    // OpenAI-Responses账户统计
    // 注意：OpenAI-Responses账户的isActive和schedulable也是字符串类型
    const normalOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== 'false' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        acc.isActive === 'false' ||
        acc.isActive === false ||
        acc.status === 'blocked' ||
        acc.status === 'unauthorized'
    ).length
    const pausedOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        (acc.schedulable === 'false' || acc.schedulable === false) &&
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const dashboard = {
      overview: {
        totalApiKeys: apiKeys.length,
        activeApiKeys,
        // 总账户统计（所有平台）
        totalAccounts:
          claudeAccounts.length +
          claudeConsoleAccounts.length +
          geminiAccounts.length +
          bedrockAccounts.length +
          openaiAccounts.length +
          openaiResponsesAccounts.length +
          ccrAccounts.length,
        normalAccounts:
          normalClaudeAccounts +
          normalClaudeConsoleAccounts +
          normalGeminiAccounts +
          normalBedrockAccounts +
          normalOpenAIAccounts +
          normalOpenAIResponsesAccounts +
          normalCcrAccounts,
        abnormalAccounts:
          abnormalClaudeAccounts +
          abnormalClaudeConsoleAccounts +
          abnormalGeminiAccounts +
          abnormalBedrockAccounts +
          abnormalOpenAIAccounts +
          abnormalOpenAIResponsesAccounts +
          abnormalCcrAccounts +
          abnormalDroidAccounts,
        pausedAccounts:
          pausedClaudeAccounts +
          pausedClaudeConsoleAccounts +
          pausedGeminiAccounts +
          pausedBedrockAccounts +
          pausedOpenAIAccounts +
          pausedOpenAIResponsesAccounts +
          pausedCcrAccounts +
          pausedDroidAccounts,
        rateLimitedAccounts:
          rateLimitedClaudeAccounts +
          rateLimitedClaudeConsoleAccounts +
          rateLimitedGeminiAccounts +
          rateLimitedBedrockAccounts +
          rateLimitedOpenAIAccounts +
          rateLimitedOpenAIResponsesAccounts +
          rateLimitedCcrAccounts +
          rateLimitedDroidAccounts,
        // 各平台详细统计
        accountsByPlatform: {
          claude: {
            total: claudeAccounts.length,
            normal: normalClaudeAccounts,
            abnormal: abnormalClaudeAccounts,
            paused: pausedClaudeAccounts,
            rateLimited: rateLimitedClaudeAccounts
          },
          'claude-console': {
            total: claudeConsoleAccounts.length,
            normal: normalClaudeConsoleAccounts,
            abnormal: abnormalClaudeConsoleAccounts,
            paused: pausedClaudeConsoleAccounts,
            rateLimited: rateLimitedClaudeConsoleAccounts
          },
          gemini: {
            total: geminiAccounts.length,
            normal: normalGeminiAccounts,
            abnormal: abnormalGeminiAccounts,
            paused: pausedGeminiAccounts,
            rateLimited: rateLimitedGeminiAccounts
          },
          bedrock: {
            total: bedrockAccounts.length,
            normal: normalBedrockAccounts,
            abnormal: abnormalBedrockAccounts,
            paused: pausedBedrockAccounts,
            rateLimited: rateLimitedBedrockAccounts
          },
          openai: {
            total: openaiAccounts.length,
            normal: normalOpenAIAccounts,
            abnormal: abnormalOpenAIAccounts,
            paused: pausedOpenAIAccounts,
            rateLimited: rateLimitedOpenAIAccounts
          },
          ccr: {
            total: ccrAccounts.length,
            normal: normalCcrAccounts,
            abnormal: abnormalCcrAccounts,
            paused: pausedCcrAccounts,
            rateLimited: rateLimitedCcrAccounts
          },
          'openai-responses': {
            total: openaiResponsesAccounts.length,
            normal: normalOpenAIResponsesAccounts,
            abnormal: abnormalOpenAIResponsesAccounts,
            paused: pausedOpenAIResponsesAccounts,
            rateLimited: rateLimitedOpenAIResponsesAccounts
          },
          droid: {
            total: droidAccounts.length,
            normal: normalDroidAccounts,
            abnormal: abnormalDroidAccounts,
            paused: pausedDroidAccounts,
            rateLimited: rateLimitedDroidAccounts
          }
        },
        // 保留旧字段以兼容
        activeAccounts:
          normalClaudeAccounts +
          normalClaudeConsoleAccounts +
          normalGeminiAccounts +
          normalBedrockAccounts +
          normalOpenAIAccounts +
          normalOpenAIResponsesAccounts +
          normalCcrAccounts +
          normalDroidAccounts,
        totalClaudeAccounts: claudeAccounts.length + claudeConsoleAccounts.length,
        activeClaudeAccounts: normalClaudeAccounts + normalClaudeConsoleAccounts,
        rateLimitedClaudeAccounts: rateLimitedClaudeAccounts + rateLimitedClaudeConsoleAccounts,
        totalGeminiAccounts: geminiAccounts.length,
        activeGeminiAccounts: normalGeminiAccounts,
        rateLimitedGeminiAccounts,
        totalTokensUsed,
        totalRequestsUsed,
        totalInputTokensUsed,
        totalOutputTokensUsed,
        totalCacheCreateTokensUsed,
        totalCacheReadTokensUsed,
        totalAllTokensUsed
      },
      recentActivity: {
        apiKeysCreatedToday: todayStats.apiKeysCreatedToday,
        requestsToday: todayStats.requestsToday,
        tokensToday: todayStats.tokensToday,
        inputTokensToday: todayStats.inputTokensToday,
        outputTokensToday: todayStats.outputTokensToday,
        cacheCreateTokensToday: todayStats.cacheCreateTokensToday || 0,
        cacheReadTokensToday: todayStats.cacheReadTokensToday || 0
      },
      systemAverages: {
        rpm: systemAverages.systemRPM,
        tpm: systemAverages.systemTPM
      },
      realtimeMetrics: {
        rpm: realtimeMetrics.realtimeRPM,
        tpm: realtimeMetrics.realtimeTPM,
        windowMinutes: realtimeMetrics.windowMinutes,
        isHistorical: realtimeMetrics.windowMinutes === 0 // 标识是否使用了历史数据
      },
      systemHealth: {
        redisConnected: redis.isConnected,
        claudeAccountsHealthy: normalClaudeAccounts + normalClaudeConsoleAccounts > 0,
        geminiAccountsHealthy: normalGeminiAccounts > 0,
        droidAccountsHealthy: normalDroidAccounts > 0,
        uptime: process.uptime()
      },
      systemTimezone: config.system.timezoneOffset || 8
    }

    return res.json({ success: true, data: dashboard })
  } catch (error) {
    logger.error('❌ Failed to get dashboard data:', error)
    return res.status(500).json({ error: 'Failed to get dashboard data', message: error.message })
  }
})

// 获取使用统计
router.get('/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily' } = req.query // daily, monthly

    // 获取基础API Key统计
    const apiKeys = await apiKeyService.getAllApiKeys()

    const stats = apiKeys.map((key) => ({
      keyId: key.id,
      keyName: key.name,
      usage: key.usage
    }))

    return res.json({ success: true, data: { period, stats } })
  } catch (error) {
    logger.error('❌ Failed to get usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 获取按模型的使用统计和费用
router.get('/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query // daily, monthly, 支持自定义时间范围
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`

    logger.info(
      `📊 Getting global model stats, period: ${period}, startDate: ${startDate}, endDate: ${endDate}, today: ${today}, currentMonth: ${currentMonth}`
    )

    const client = redis.getClientSafe()

    // 获取所有模型的统计数据
    let searchPatterns = []

    if (startDate && endDate) {
      // 自定义日期范围，生成多个日期的搜索模式
      const start = new Date(startDate)
      const end = new Date(endDate)

      // 确保日期范围有效
      if (start > end) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' })
      }

      // 限制最大范围为365天
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      if (daysDiff > 365) {
        return res.status(400).json({ error: 'Date range cannot exceed 365 days' })
      }

      // 生成日期范围内所有日期的搜索模式
      const currentDate = new Date(start)
      while (currentDate <= end) {
        const dateStr = redis.getDateStringInTimezone(currentDate)
        searchPatterns.push(`usage:model:daily:*:${dateStr}`)
        currentDate.setDate(currentDate.getDate() + 1)
      }

      logger.info(`📊 Generated ${searchPatterns.length} search patterns for date range`)
    } else {
      // 使用默认的period
      const pattern =
        period === 'daily'
          ? `usage:model:daily:*:${today}`
          : `usage:model:monthly:*:${currentMonth}`
      searchPatterns = [pattern]
    }

    logger.info('📊 Searching patterns:', searchPatterns)

    // 获取所有匹配的keys
    const allKeys = []
    for (const pattern of searchPatterns) {
      const keys = await client.keys(pattern)
      allKeys.push(...keys)
    }

    logger.info(`📊 Found ${allKeys.length} matching keys in total`)

    // 模型名标准化函数（与redis.js保持一致）
    const normalizeModelName = (model) => {
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

    // 聚合相同模型的数据
    const modelStatsMap = new Map()

    for (const key of allKeys) {
      const match = key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)

      if (!match) {
        logger.warn(`📊 Pattern mismatch for key: ${key}`)
        continue
      }

      const rawModel = match[1]
      const normalizedModel = normalizeModelName(rawModel)
      const data = await client.hgetall(key)

      if (data && Object.keys(data).length > 0) {
        const stats = modelStatsMap.get(normalizedModel) || {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          allTokens: 0
        }

        stats.requests += parseInt(data.requests) || 0
        stats.inputTokens += parseInt(data.inputTokens) || 0
        stats.outputTokens += parseInt(data.outputTokens) || 0
        stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
        stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        stats.allTokens += parseInt(data.allTokens) || 0

        modelStatsMap.set(normalizedModel, stats)
      }
    }

    // 转换为数组并计算费用
    const modelStats = []

    for (const [model, stats] of modelStatsMap) {
      const usage = {
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        cache_creation_input_tokens: stats.cacheCreateTokens,
        cache_read_input_tokens: stats.cacheReadTokens
      }

      // 计算费用
      const costData = CostCalculator.calculateCost(usage, model)

      modelStats.push({
        model,
        period: startDate && endDate ? 'custom' : period,
        requests: stats.requests,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreateTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        allTokens: stats.allTokens,
        usage: {
          requests: stats.requests,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          totalTokens:
            usage.input_tokens +
            usage.output_tokens +
            usage.cache_creation_input_tokens +
            usage.cache_read_input_tokens
        },
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing
      })
    }

    // 按总费用排序
    modelStats.sort((a, b) => b.costs.total - a.costs.total)

    logger.info(
      `📊 Returning ${modelStats.length} global model stats for period ${period}:`,
      modelStats
    )

    return res.json({ success: true, data: modelStats })
  } catch (error) {
    logger.error('❌ Failed to get model stats:', error)
    return res.status(500).json({ error: 'Failed to get model stats', message: error.message })
  }
})

// 🔧 系统管理

// 清理过期数据
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const [expiredKeys, errorAccounts] = await Promise.all([
      apiKeyService.cleanupExpiredKeys(),
      claudeAccountService.cleanupErrorAccounts()
    ])

    await redis.cleanup()

    logger.success(
      `🧹 Admin triggered cleanup: ${expiredKeys} expired keys, ${errorAccounts} error accounts`
    )

    return res.json({
      success: true,
      message: 'Cleanup completed',
      data: {
        expiredKeysRemoved: expiredKeys,
        errorAccountsReset: errorAccounts
      }
    })
  } catch (error) {
    logger.error('❌ Cleanup failed:', error)
    return res.status(500).json({ error: 'Cleanup failed', message: error.message })
  }
})

module.exports = router
