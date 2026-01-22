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
    // 先检查是否有全局预聚合数据
    const globalStats = await redis.getGlobalStats()

    // 根据是否有全局统计决定查询策略
    let apiKeys = null
    let apiKeyCount = null

    const [
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

    // 有全局统计时只获取计数，否则拉全量
    if (globalStats) {
      apiKeyCount = await redis.getApiKeyCount()
    } else {
      apiKeys = await apiKeyService.getAllApiKeysFast()
    }

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

    // 通用账户统计函数 - 单次遍历完成所有统计
    const countAccountStats = (accounts, opts = {}) => {
      const { isStringType = false, checkGeminiRateLimit = false } = opts
      let normal = 0,
        abnormal = 0,
        paused = 0,
        rateLimited = 0

      for (const acc of accounts) {
        const isActive = isStringType
          ? acc.isActive === 'true' ||
            acc.isActive === true ||
            (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)
          : acc.isActive
        const isBlocked = acc.status === 'blocked' || acc.status === 'unauthorized'
        const isSchedulable = isStringType
          ? acc.schedulable !== 'false' && acc.schedulable !== false
          : acc.schedulable !== false
        const isRateLimited = checkGeminiRateLimit
          ? acc.rateLimitStatus === 'limited' ||
            (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
          : acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited

        if (!isActive || isBlocked) {
          abnormal++
        } else if (!isSchedulable) {
          paused++
        } else if (isRateLimited) {
          rateLimited++
        } else {
          normal++
        }
      }
      return { normal, abnormal, paused, rateLimited }
    }

    // Droid 账户统计（特殊逻辑）
    let normalDroidAccounts = 0,
      abnormalDroidAccounts = 0,
      pausedDroidAccounts = 0,
      rateLimitedDroidAccounts = 0
    for (const acc of droidAccounts) {
      const isActive = normalizeBoolean(acc.isActive)
      const isBlocked = acc.status === 'blocked' || acc.status === 'unauthorized'
      const isSchedulable = normalizeBoolean(acc.schedulable)
      const isRateLimited = isRateLimitedFlag(acc.rateLimitStatus)

      if (!isActive || isBlocked) {
        abnormalDroidAccounts++
      } else if (!isSchedulable) {
        pausedDroidAccounts++
      } else if (isRateLimited) {
        rateLimitedDroidAccounts++
      } else {
        normalDroidAccounts++
      }
    }

    // 计算使用统计
    let totalTokensUsed = 0,
      totalRequestsUsed = 0,
      totalInputTokensUsed = 0,
      totalOutputTokensUsed = 0,
      totalCacheCreateTokensUsed = 0,
      totalCacheReadTokensUsed = 0,
      totalAllTokensUsed = 0,
      activeApiKeys = 0,
      totalApiKeys = 0

    if (globalStats) {
      // 使用预聚合数据（快速路径）
      totalRequestsUsed = globalStats.requests
      totalInputTokensUsed = globalStats.inputTokens
      totalOutputTokensUsed = globalStats.outputTokens
      totalCacheCreateTokensUsed = globalStats.cacheCreateTokens
      totalCacheReadTokensUsed = globalStats.cacheReadTokens
      totalAllTokensUsed = globalStats.allTokens
      totalTokensUsed = totalAllTokensUsed
      totalApiKeys = apiKeyCount.total
      activeApiKeys = apiKeyCount.active
    } else {
      // 回退到遍历（兼容旧数据）
      totalApiKeys = apiKeys.length
      for (const key of apiKeys) {
        const usage = key.usage?.total
        if (usage) {
          totalTokensUsed += usage.allTokens || 0
          totalRequestsUsed += usage.requests || 0
          totalInputTokensUsed += usage.inputTokens || 0
          totalOutputTokensUsed += usage.outputTokens || 0
          totalCacheCreateTokensUsed += usage.cacheCreateTokens || 0
          totalCacheReadTokensUsed += usage.cacheReadTokens || 0
          totalAllTokensUsed += usage.allTokens || 0
        }
        if (key.isActive) {
          activeApiKeys++
        }
      }
    }

    // 各平台账户统计（单次遍历）
    const claudeStats = countAccountStats(claudeAccounts)
    const claudeConsoleStats = countAccountStats(claudeConsoleAccounts)
    const geminiStats = countAccountStats(geminiAccounts, { checkGeminiRateLimit: true })
    const bedrockStats = countAccountStats(bedrockAccounts)
    const openaiStats = countAccountStats(openaiAccounts, { isStringType: true })
    const ccrStats = countAccountStats(ccrAccounts)
    const openaiResponsesStats = countAccountStats(openaiResponsesAccounts, { isStringType: true })

    const dashboard = {
      overview: {
        totalApiKeys,
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
          claudeStats.normal +
          claudeConsoleStats.normal +
          geminiStats.normal +
          bedrockStats.normal +
          openaiStats.normal +
          openaiResponsesStats.normal +
          ccrStats.normal,
        abnormalAccounts:
          claudeStats.abnormal +
          claudeConsoleStats.abnormal +
          geminiStats.abnormal +
          bedrockStats.abnormal +
          openaiStats.abnormal +
          openaiResponsesStats.abnormal +
          ccrStats.abnormal +
          abnormalDroidAccounts,
        pausedAccounts:
          claudeStats.paused +
          claudeConsoleStats.paused +
          geminiStats.paused +
          bedrockStats.paused +
          openaiStats.paused +
          openaiResponsesStats.paused +
          ccrStats.paused +
          pausedDroidAccounts,
        rateLimitedAccounts:
          claudeStats.rateLimited +
          claudeConsoleStats.rateLimited +
          geminiStats.rateLimited +
          bedrockStats.rateLimited +
          openaiStats.rateLimited +
          openaiResponsesStats.rateLimited +
          ccrStats.rateLimited +
          rateLimitedDroidAccounts,
        // 各平台详细统计
        accountsByPlatform: {
          claude: {
            total: claudeAccounts.length,
            normal: claudeStats.normal,
            abnormal: claudeStats.abnormal,
            paused: claudeStats.paused,
            rateLimited: claudeStats.rateLimited
          },
          'claude-console': {
            total: claudeConsoleAccounts.length,
            normal: claudeConsoleStats.normal,
            abnormal: claudeConsoleStats.abnormal,
            paused: claudeConsoleStats.paused,
            rateLimited: claudeConsoleStats.rateLimited
          },
          gemini: {
            total: geminiAccounts.length,
            normal: geminiStats.normal,
            abnormal: geminiStats.abnormal,
            paused: geminiStats.paused,
            rateLimited: geminiStats.rateLimited
          },
          bedrock: {
            total: bedrockAccounts.length,
            normal: bedrockStats.normal,
            abnormal: bedrockStats.abnormal,
            paused: bedrockStats.paused,
            rateLimited: bedrockStats.rateLimited
          },
          openai: {
            total: openaiAccounts.length,
            normal: openaiStats.normal,
            abnormal: openaiStats.abnormal,
            paused: openaiStats.paused,
            rateLimited: openaiStats.rateLimited
          },
          ccr: {
            total: ccrAccounts.length,
            normal: ccrStats.normal,
            abnormal: ccrStats.abnormal,
            paused: ccrStats.paused,
            rateLimited: ccrStats.rateLimited
          },
          'openai-responses': {
            total: openaiResponsesAccounts.length,
            normal: openaiResponsesStats.normal,
            abnormal: openaiResponsesStats.abnormal,
            paused: openaiResponsesStats.paused,
            rateLimited: openaiResponsesStats.rateLimited
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
          claudeStats.normal +
          claudeConsoleStats.normal +
          geminiStats.normal +
          bedrockStats.normal +
          openaiStats.normal +
          openaiResponsesStats.normal +
          ccrStats.normal +
          normalDroidAccounts,
        totalClaudeAccounts: claudeAccounts.length + claudeConsoleAccounts.length,
        activeClaudeAccounts: claudeStats.normal + claudeConsoleStats.normal,
        rateLimitedClaudeAccounts: claudeStats.rateLimited + claudeConsoleStats.rateLimited,
        totalGeminiAccounts: geminiAccounts.length,
        activeGeminiAccounts: geminiStats.normal,
        rateLimitedGeminiAccounts: geminiStats.rateLimited,
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
        claudeAccountsHealthy: claudeStats.normal + claudeConsoleStats.normal > 0,
        geminiAccountsHealthy: geminiStats.normal > 0,
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
    const apiKeys = await apiKeyService.getAllApiKeysFast()

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

    // 收集所有需要扫描的日期
    const datePatterns = []

    if (startDate && endDate) {
      // 自定义日期范围
      const start = new Date(startDate)
      const end = new Date(endDate)

      if (start > end) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' })
      }

      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      if (daysDiff > 365) {
        return res.status(400).json({ error: 'Date range cannot exceed 365 days' })
      }

      const currentDate = new Date(start)
      while (currentDate <= end) {
        const dateStr = redis.getDateStringInTimezone(currentDate)
        datePatterns.push({ dateStr, pattern: `usage:model:daily:*:${dateStr}` })
        currentDate.setDate(currentDate.getDate() + 1)
      }

      logger.info(`📊 Generated ${datePatterns.length} search patterns for date range`)
    } else {
      // 使用默认的period
      const pattern =
        period === 'daily'
          ? `usage:model:daily:*:${today}`
          : `usage:model:monthly:*:${currentMonth}`
      datePatterns.push({ dateStr: period === 'daily' ? today : currentMonth, pattern })
    }

    // 按日期集合扫描，串行避免并行触发多次全库 SCAN
    const allResults = []
    for (const { pattern } of datePatterns) {
      const results = await redis.scanAndGetAllChunked(pattern)
      allResults.push(...results)
    }

    logger.info(`📊 Found ${allResults.length} matching keys in total`)

    // 模型名标准化函数（与redis.js保持一致）
    const normalizeModelName = (model) => {
      if (!model || model === 'unknown') {
        return model
      }

      // 对于Bedrock模型，去掉区域前缀进行统一
      if (model.includes('.anthropic.') || model.includes('.claude')) {
        let normalized = model.replace(/^[a-z0-9-]+\./, '')
        normalized = normalized.replace('anthropic.', '')
        normalized = normalized.replace(/-v\d+:\d+$/, '')
        return normalized
      }

      return model.replace(/-v\d+:\d+$|:latest$/, '')
    }

    // 聚合相同模型的数据
    const modelStatsMap = new Map()

    for (const { key, data } of allResults) {
      // 支持 daily 和 monthly 两种格式
      const match =
        key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/) ||
        key.match(/usage:model:monthly:(.+):\d{4}-\d{2}$/)

      if (!match) {
        logger.warn(`📊 Pattern mismatch for key: ${key}`)
        continue
      }

      const rawModel = match[1]
      const normalizedModel = normalizeModelName(rawModel)

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
