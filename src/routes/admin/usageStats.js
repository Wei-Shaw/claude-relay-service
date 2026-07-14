const express = require('express')
const apiKeyService = require('../../services/apiKeyService')
const ccrAccountService = require('../../services/account/ccrAccountService')
const claudeAccountService = require('../../services/account/claudeAccountService')
const claudeConsoleAccountService = require('../../services/account/claudeConsoleAccountService')
const geminiAccountService = require('../../services/account/geminiAccountService')
const geminiApiAccountService = require('../../services/account/geminiApiAccountService')
const openaiAccountService = require('../../services/account/openaiAccountService')
const openaiResponsesAccountService = require('../../services/account/openaiResponsesAccountService')
const droidAccountService = require('../../services/account/droidAccountService')
const bedrockAccountService = require('../../services/account/bedrockAccountService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const CostCalculator = require('../../utils/costCalculator')
const pricingService = require('../../services/pricingService')

const router = express.Router()

// 辅助函数：通过索引获取数据，回退到 SCAN
// keyPattern 支持占位符：{id}、{keyId}+{model}、{accountId}+{model}
async function getUsageDataByIndex(indexKey, keyPattern, scanPattern) {
  const members = await redis.client.smembers(indexKey)
  if (members && members.length > 0) {
    const keys = members.map((id) => {
      // 检查是否是 keymodel 格式 (keyId:model)
      if (keyPattern.includes('{keyId}') && keyPattern.includes('{model}')) {
        const [keyId, ...modelParts] = id.split(':')
        const model = modelParts.join(':')
        return keyPattern.replace('{keyId}', keyId).replace('{model}', model)
      }
      // 检查是否是 accountId:model 格式
      if (keyPattern.includes('{accountId}') && keyPattern.includes('{model}')) {
        const [accountId, ...modelParts] = id.split(':')
        const model = modelParts.join(':')
        return keyPattern.replace('{accountId}', accountId).replace('{model}', model)
      }
      return keyPattern.replace('{id}', id)
    })
    const dataList = await redis.batchHgetallChunked(keys)
    const result = []
    keys.forEach((key, i) => {
      if (dataList[i] && Object.keys(dataList[i]).length > 0) {
        result.push({ key, data: dataList[i] })
      }
    })
    return result
  }
  // 索引为空，检查空标记
  const emptyMarker = await redis.client.get(`${indexKey}:empty`)
  if (emptyMarker === '1') {
    return []
  }
  // 回退到 SCAN（兼容历史数据）
  const keys = await redis.scanKeys(scanPattern)
  if (keys.length === 0) {
    // 设置空标记，1小时过期
    await redis.client.setex(`${indexKey}:empty`, 3600, '1')
    return []
  }
  // 建立索引
  const ids = keys.map((k) => {
    if (keyPattern.includes('{keyId}') && keyPattern.includes('{model}')) {
      // keymodel 格式：usage:{keyId}:model:daily:{model}:{date} 或 hourly
      const match =
        k.match(/usage:([^:]+):model:daily:(.+):\d{4}-\d{2}-\d{2}$/) ||
        k.match(/usage:([^:]+):model:hourly:(.+):\d{4}-\d{2}-\d{2}:\d{2}$/)
      if (match) {
        return `${match[1]}:${match[2]}`
      }
    }
    if (keyPattern.includes('{accountId}') && keyPattern.includes('{model}')) {
      // account_usage:model:daily 或 hourly
      const match =
        k.match(/account_usage:model:daily:([^:]+):(.+):\d{4}-\d{2}-\d{2}$/) ||
        k.match(/account_usage:model:hourly:([^:]+):(.+):\d{4}-\d{2}-\d{2}:\d{2}$/)
      if (match) {
        return `${match[1]}:${match[2]}`
      }
    }
    // 通用格式：根据 keyPattern 中 {id} 的位置提取 id
    const patternParts = keyPattern.split(':')
    const idIndex = patternParts.findIndex((p) => p === '{id}')
    if (idIndex !== -1) {
      const parts = k.split(':')
      return parts[idIndex]
    }
    // 回退：提取最后一个 : 前的 id
    const parts = k.split(':')
    return parts[parts.length - 2]
  })
  const validIds = ids.filter(Boolean)
  if (validIds.length > 0) {
    await redis.client.sadd(indexKey, ...validIds)
  }
  const dataList = await redis.batchHgetallChunked(keys)
  const result = []
  keys.forEach((key, i) => {
    if (dataList[i] && Object.keys(dataList[i]).length > 0) {
      result.push({ key, data: dataList[i] })
    }
  })
  return result
}

const accountTypeNames = {
  claude: 'Claude官方',
  'claude-official': 'Claude官方',
  'claude-console': 'Claude Console',
  ccr: 'Claude Console Relay',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  gemini: 'Gemini',
  'gemini-api': 'Gemini API',
  droid: 'Droid',
  bedrock: 'AWS Bedrock',
  unknown: '未知渠道'
}

const resolveAccountByPlatform = async (accountId, platform) => {
  const serviceMap = {
    claude: claudeAccountService,
    'claude-console': claudeConsoleAccountService,
    gemini: geminiAccountService,
    'gemini-api': geminiApiAccountService,
    openai: openaiAccountService,
    'openai-responses': openaiResponsesAccountService,
    droid: droidAccountService,
    ccr: ccrAccountService,
    bedrock: bedrockAccountService
  }

  if (platform && serviceMap[platform]) {
    try {
      const account = await serviceMap[platform].getAccount(accountId)
      if (account) {
        return { ...account, platform }
      }
    } catch (error) {
      logger.debug(`⚠️ Failed to get account ${accountId} from ${platform}: ${error.message}`)
    }
  }

  for (const [platformName, service] of Object.entries(serviceMap)) {
    try {
      const account = await service.getAccount(accountId)
      if (account) {
        return { ...account, platform: platformName }
      }
    } catch (error) {
      logger.debug(`⚠️ Failed to get account ${accountId} from ${platformName}: ${error.message}`)
    }
  }

  return null
}

function normalizeAccountUsageInfo(accountId, provider, account) {
  const isActive =
    typeof account.isActive === 'boolean'
      ? account.isActive
      : typeof account.isActive === 'string'
        ? account.isActive === 'true'
        : Boolean(account.isActive)

  return {
    id: account.id || accountId,
    provider,
    name: account.name || '',
    email: account.email || '',
    status: account.status || (isActive ? 'active' : 'inactive'),
    isActive,
    createdAt: account.createdAt || ''
  }
}

async function resolveAccountForUsage(accountId) {
  const serviceMap = [
    ['claude', claudeAccountService],
    ['claude-console', claudeConsoleAccountService],
    ['gemini', geminiAccountService],
    ['gemini-api', geminiApiAccountService],
    ['openai', openaiAccountService],
    ['openai-responses', openaiResponsesAccountService],
    ['droid', droidAccountService],
    ['ccr', ccrAccountService]
  ]

  for (const [provider, service] of serviceMap) {
    try {
      const account = await service.getAccount(accountId)
      if (account) {
        return normalizeAccountUsageInfo(accountId, provider, account)
      }
    } catch (error) {
      logger.debug(`⚠️ Failed to get account ${accountId} from ${provider}: ${error.message}`)
    }
  }

  try {
    const bedrockResult = await bedrockAccountService.getAccount(accountId)
    if (bedrockResult.success && bedrockResult.data) {
      return normalizeAccountUsageInfo(accountId, 'bedrock', bedrockResult.data)
    }
  } catch (error) {
    logger.debug(`⚠️ Failed to get account ${accountId} from bedrock: ${error.message}`)
  }

  return null
}

const getApiKeyName = async (keyId) => {
  try {
    const keyData = await redis.getApiKey(keyId)
    return keyData?.name || keyData?.label || keyId
  } catch (error) {
    logger.debug(`⚠️ Failed to get API key name for ${keyId}: ${error.message}`)
    return keyId
  }
}

// 📊 账户使用统计

// 获取所有账户的使用统计
router.get('/accounts/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const accountsStats = await redis.getAllAccountsUsageStats()

    return res.json({
      success: true,
      data: accountsStats,
      summary: {
        totalAccounts: accountsStats.length,
        activeToday: accountsStats.filter((account) => account.daily.requests > 0).length,
        totalDailyTokens: accountsStats.reduce(
          (sum, account) => sum + (account.daily.allTokens || 0),
          0
        ),
        totalDailyRequests: accountsStats.reduce(
          (sum, account) => sum + (account.daily.requests || 0),
          0
        )
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get accounts usage stats:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get accounts usage stats',
      message: error.message
    })
  }
})

// 获取单个账户的使用统计
router.get('/accounts/:accountId/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const accountInfo = await resolveAccountForUsage(accountId)
    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      })
    }

    const accountStats = await redis.getAccountUsageStats(accountId, {
      accountType: accountInfo.provider,
      createdAt: accountInfo.createdAt
    })

    return res.json({
      success: true,
      data: {
        ...accountStats,
        accountInfo
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage stats:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get account usage stats',
      message: error.message
    })
  }
})

// 获取账号近30天使用历史
router.get('/accounts/:accountId/usage-history', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { platform = 'claude', days = 30 } = req.query

    const allowedPlatforms = [
      'claude',
      'claude-console',
      'openai',
      'openai-responses',
      'gemini',
      'gemini-api',
      'droid',
      'bedrock'
    ]
    if (!allowedPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported account platform'
      })
    }

    const accountTypeMap = {
      openai: 'openai',
      'openai-responses': 'openai-responses',
      'gemini-api': 'gemini-api',
      droid: 'droid',
      bedrock: 'bedrock'
    }

    const fallbackModelMap = {
      claude: 'claude-3-5-sonnet-20241022',
      'claude-console': 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini-2024-07-18',
      'openai-responses': 'gpt-4o-mini-2024-07-18',
      gemini: 'gemini-1.5-flash',
      'gemini-api': 'gemini-2.0-flash',
      droid: 'unknown',
      bedrock: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
    }

    // 获取账户信息以获取创建时间
    let accountData = null
    let accountCreatedAt = null

    try {
      switch (platform) {
        case 'claude':
          accountData = await claudeAccountService.getAccount(accountId)
          break
        case 'claude-console':
          accountData = await claudeConsoleAccountService.getAccount(accountId)
          break
        case 'openai':
          accountData = await openaiAccountService.getAccount(accountId)
          break
        case 'openai-responses':
          accountData = await openaiResponsesAccountService.getAccount(accountId)
          break
        case 'gemini':
          accountData = await geminiAccountService.getAccount(accountId)
          break
        case 'gemini-api': {
          accountData = await geminiApiAccountService.getAccount(accountId)
          break
        }
        case 'droid':
          accountData = await droidAccountService.getAccount(accountId)
          break
        case 'bedrock': {
          const result = await bedrockAccountService.getAccount(accountId)
          accountData = result?.success ? result.data : null
          break
        }
      }

      if (accountData && accountData.createdAt) {
        accountCreatedAt = new Date(accountData.createdAt)
      }
    } catch (error) {
      logger.warn(`Failed to get account data for avgDailyCost calculation: ${error.message}`)
    }

    const fallbackModel = fallbackModelMap[platform] || 'unknown'
    const daysCount = Math.min(Math.max(parseInt(days, 10) || 30, 1), 60)

    // 获取概览统计数据
    const accountUsageStats = await redis.getAccountUsageStats(
      accountId,
      accountTypeMap[platform] || null
    )

    const history = []
    let totalCost = 0
    let totalRequests = 0
    let totalTokens = 0

    let highestCostDay = null
    let highestRequestDay = null

    const sumModelCostsForDay = async (dateKey) => {
      const modelPattern = `account_usage:model:daily:${accountId}:*:${dateKey}`
      const modelResults = await redis.scanAndGetAllChunked(modelPattern)
      let summedCost = 0

      if (modelResults.length === 0) {
        return summedCost
      }

      for (const { key: modelKey, data: modelData } of modelResults) {
        const modelParts = modelKey.split(':')
        const modelName = modelParts[4] || 'unknown'
        if (!modelData || Object.keys(modelData).length === 0) {
          continue
        }

        const usage = {
          input_tokens: parseInt(modelData.inputTokens) || 0,
          output_tokens: parseInt(modelData.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
        }

        // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
        const eph5m = parseInt(modelData.ephemeral5mTokens) || 0
        const eph1h = parseInt(modelData.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }

        const costResult = CostCalculator.calculateCost(usage, modelName)
        summedCost += costResult.costs.total
      }

      return summedCost
    }

    const today = new Date()

    for (let offset = daysCount - 1; offset >= 0; offset--) {
      const date = new Date(today)
      date.setDate(date.getDate() - offset)

      const tzDate = redis.getDateInTimezone(date)
      const dateKey = redis.getDateStringInTimezone(date)
      const monthLabel = String(tzDate.getUTCMonth() + 1).padStart(2, '0')
      const dayLabel = String(tzDate.getUTCDate()).padStart(2, '0')
      const label = `${monthLabel}/${dayLabel}`

      const client = redis.getClientSafe()
      const dailyKey = `account_usage:daily:${accountId}:${dateKey}`
      const dailyData = await client.hgetall(dailyKey)

      const inputTokens = parseInt(dailyData?.inputTokens) || 0
      const outputTokens = parseInt(dailyData?.outputTokens) || 0
      const cacheCreateTokens = parseInt(dailyData?.cacheCreateTokens) || 0
      const cacheReadTokens = parseInt(dailyData?.cacheReadTokens) || 0
      const allTokens =
        parseInt(dailyData?.allTokens) ||
        inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
      const requests = parseInt(dailyData?.requests) || 0

      let cost = await sumModelCostsForDay(dateKey)

      if (cost === 0 && allTokens > 0) {
        const fallbackUsage = {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreateTokens,
          cache_read_input_tokens: cacheReadTokens
        }
        // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
        const fbEph5m = parseInt(dailyData?.ephemeral5mTokens) || 0
        const fbEph1h = parseInt(dailyData?.ephemeral1hTokens) || 0
        if (fbEph5m > 0 || fbEph1h > 0) {
          fallbackUsage.cache_creation = {
            ephemeral_5m_input_tokens: fbEph5m,
            ephemeral_1h_input_tokens: fbEph1h
          }
        }
        const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
        cost = fallbackResult.costs.total
      }

      const normalizedCost = Math.round(cost * 1_000_000) / 1_000_000

      totalCost += normalizedCost
      totalRequests += requests
      totalTokens += allTokens

      if (!highestCostDay || normalizedCost > highestCostDay.cost) {
        highestCostDay = {
          date: dateKey,
          label,
          cost: normalizedCost,
          formattedCost: CostCalculator.formatCost(normalizedCost)
        }
      }

      if (!highestRequestDay || requests > highestRequestDay.requests) {
        highestRequestDay = {
          date: dateKey,
          label,
          requests
        }
      }

      history.push({
        date: dateKey,
        label,
        cost: normalizedCost,
        formattedCost: CostCalculator.formatCost(normalizedCost),
        requests,
        tokens: allTokens
      })
    }

    // 计算实际使用天数（从账户创建到现在）
    let actualDaysForAvg = daysCount
    if (accountCreatedAt) {
      const now = new Date()
      const diffTime = Math.abs(now - accountCreatedAt)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      // 使用实际使用天数，但不超过请求的天数范围
      actualDaysForAvg = Math.min(diffDays, daysCount)
      // 至少为1天，避免除零
      actualDaysForAvg = Math.max(actualDaysForAvg, 1)
    }

    // 使用实际天数计算日均值
    const avgDailyCost = actualDaysForAvg > 0 ? totalCost / actualDaysForAvg : 0
    const avgDailyRequests = actualDaysForAvg > 0 ? totalRequests / actualDaysForAvg : 0
    const avgDailyTokens = actualDaysForAvg > 0 ? totalTokens / actualDaysForAvg : 0

    const todayData = history.length > 0 ? history[history.length - 1] : null

    return res.json({
      success: true,
      data: {
        history,
        summary: {
          days: daysCount,
          actualDaysUsed: actualDaysForAvg, // 实际使用的天数（用于计算日均值）
          accountCreatedAt: accountCreatedAt ? accountCreatedAt.toISOString() : null,
          totalCost,
          totalCostFormatted: CostCalculator.formatCost(totalCost),
          totalRequests,
          totalTokens,
          avgDailyCost,
          avgDailyCostFormatted: CostCalculator.formatCost(avgDailyCost),
          avgDailyRequests,
          avgDailyTokens,
          today: todayData
            ? {
                date: todayData.date,
                cost: todayData.cost,
                costFormatted: todayData.formattedCost,
                requests: todayData.requests,
                tokens: todayData.tokens
              }
            : null,
          highestCostDay,
          highestRequestDay
        },
        overview: accountUsageStats,
        generatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage history:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get account usage history',
      message: error.message
    })
  }
})

// 📊 使用趋势和成本分析

// 获取使用趋势数据
router.get('/usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { days = 7, granularity = 'day', startDate, endDate } = req.query

    const trendData = []

    if (granularity === 'hour') {
      // 小时粒度统计
      let startTime, endTime

      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }

      // 确保时间范围不超过24小时
      const timeDiff = endTime - startTime
      if (timeDiff > 24 * 60 * 60 * 1000) {
        return res.status(400).json({
          error: '小时粒度查询时间范围不能超过24小时'
        })
      }

      // 收集所有小时的元数据和涉及的日期
      const hourInfos = []
      const dateSet = new Set()
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        dateSet.add(dateStr)

        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const month = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const day = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourStr = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        hourInfos.push({
          hourKey,
          dateStr,
          isoTime: currentHour.toISOString(),
          label: `${month}/${day} ${hourStr}:00`
        })

        currentHour.setHours(currentHour.getHours() + 1)
      }

      // 使用索引获取数据，按小时批量查询
      const modelDataMap = new Map()
      const usageDataMap = new Map()

      // 并行获取所有小时的数据
      const fetchPromises = hourInfos.map(async (hourInfo) => {
        const [modelResults, usageResults] = await Promise.all([
          getUsageDataByIndex(
            `usage:model:hourly:index:${hourInfo.hourKey}`,
            `usage:model:hourly:{id}:${hourInfo.hourKey}`,
            `usage:model:hourly:*:${hourInfo.hourKey}`
          ),
          getUsageDataByIndex(
            `usage:hourly:index:${hourInfo.hourKey}`,
            `usage:hourly:{id}:${hourInfo.hourKey}`,
            `usage:hourly:*:${hourInfo.hourKey}`
          )
        ])
        return { modelResults, usageResults }
      })

      const allResults = await Promise.all(fetchPromises)
      allResults.forEach(({ modelResults, usageResults }) => {
        modelResults.forEach(({ key, data }) => modelDataMap.set(key, data))
        usageResults.forEach(({ key, data }) => usageDataMap.set(key, data))
      })

      // 按 hourKey 分组
      const modelKeysByHour = new Map()
      const usageKeysByHour = new Map()
      for (const key of modelDataMap.keys()) {
        const match = key.match(/usage:model:hourly:.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const hourKey = match[1]
          if (!modelKeysByHour.has(hourKey)) {
            modelKeysByHour.set(hourKey, [])
          }
          modelKeysByHour.get(hourKey).push(key)
        }
      }
      for (const key of usageDataMap.keys()) {
        const match = key.match(/usage:hourly:.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const hourKey = match[1]
          if (!usageKeysByHour.has(hourKey)) {
            usageKeysByHour.set(hourKey, [])
          }
          usageKeysByHour.get(hourKey).push(key)
        }
      }

      // 处理每个小时的数据
      for (const hourInfo of hourInfos) {
        const modelKeys = modelKeysByHour.get(hourInfo.hourKey) || []
        const usageKeys = usageKeysByHour.get(hourInfo.hourKey) || []

        let hourInputTokens = 0
        let hourOutputTokens = 0
        let hourRequests = 0
        let hourCacheCreateTokens = 0
        let hourCacheReadTokens = 0
        let hourCost = 0

        // 处理模型级别数据
        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]
          const data = modelDataMap.get(modelKey)
          if (!data || Object.keys(data).length === 0) {
            continue
          }

          const modelInputTokens = parseInt(data.inputTokens) || 0
          const modelOutputTokens = parseInt(data.outputTokens) || 0
          const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const modelRequests = parseInt(data.requests) || 0

          hourInputTokens += modelInputTokens
          hourOutputTokens += modelOutputTokens
          hourCacheCreateTokens += modelCacheCreateTokens
          hourCacheReadTokens += modelCacheReadTokens
          hourRequests += modelRequests

          const modelUsage = {
            input_tokens: modelInputTokens,
            output_tokens: modelOutputTokens,
            cache_creation_input_tokens: modelCacheCreateTokens,
            cache_read_input_tokens: modelCacheReadTokens
          }
          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          const mEph5m = parseInt(data.ephemeral5mTokens) || 0
          const mEph1h = parseInt(data.ephemeral1hTokens) || 0
          if (mEph5m > 0 || mEph1h > 0) {
            modelUsage.cache_creation = {
              ephemeral_5m_input_tokens: mEph5m,
              ephemeral_1h_input_tokens: mEph1h
            }
          }
          const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
          hourCost += modelCostResult.costs.total
        }

        // 如果没有模型级别的数据，尝试API Key级别的数据
        if (modelKeys.length === 0) {
          let hourEph5m = 0
          let hourEph1h = 0
          for (const key of usageKeys) {
            const data = usageDataMap.get(key)
            if (data) {
              hourInputTokens += parseInt(data.inputTokens) || 0
              hourOutputTokens += parseInt(data.outputTokens) || 0
              hourRequests += parseInt(data.requests) || 0
              hourCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              hourCacheReadTokens += parseInt(data.cacheReadTokens) || 0
              hourEph5m += parseInt(data.ephemeral5mTokens) || 0
              hourEph1h += parseInt(data.ephemeral1hTokens) || 0
            }
          }

          const usage = {
            input_tokens: hourInputTokens,
            output_tokens: hourOutputTokens,
            cache_creation_input_tokens: hourCacheCreateTokens,
            cache_read_input_tokens: hourCacheReadTokens
          }
          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          if (hourEph5m > 0 || hourEph1h > 0) {
            usage.cache_creation = {
              ephemeral_5m_input_tokens: hourEph5m,
              ephemeral_1h_input_tokens: hourEph1h
            }
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          hourCost = costResult.costs.total
        }

        trendData.push({
          hour: hourInfo.isoTime,
          label: hourInfo.label,
          inputTokens: hourInputTokens,
          outputTokens: hourOutputTokens,
          requests: hourRequests,
          cacheCreateTokens: hourCacheCreateTokens,
          cacheReadTokens: hourCacheReadTokens,
          totalTokens:
            hourInputTokens + hourOutputTokens + hourCacheCreateTokens + hourCacheReadTokens,
          cost: hourCost
        })
      }
    } else {
      // 天粒度统计（按日期集合扫描）
      const daysCount = parseInt(days) || 7
      const today = new Date()

      // 收集所有天的元数据
      const dayInfos = []
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        dayInfos.push({ dateStr })
      }

      // 使用索引获取数据，按日期批量查询
      const modelDataMap = new Map()
      const usageDataMap = new Map()

      const fetchPromises = dayInfos.map(async (dayInfo) => {
        const [modelResults, usageResults] = await Promise.all([
          getUsageDataByIndex(
            `usage:model:daily:index:${dayInfo.dateStr}`,
            `usage:model:daily:{id}:${dayInfo.dateStr}`,
            `usage:model:daily:*:${dayInfo.dateStr}`
          ),
          getUsageDataByIndex(
            `usage:daily:index:${dayInfo.dateStr}`,
            `usage:daily:{id}:${dayInfo.dateStr}`,
            `usage:daily:*:${dayInfo.dateStr}`
          )
        ])
        return { modelResults, usageResults }
      })

      const allResults = await Promise.all(fetchPromises)
      allResults.forEach(({ modelResults, usageResults }) => {
        modelResults.forEach(({ key, data }) => modelDataMap.set(key, data))
        usageResults.forEach(({ key, data }) => usageDataMap.set(key, data))
      })

      // 按 dateStr 分组
      const modelKeysByDate = new Map()
      const usageKeysByDate = new Map()
      for (const key of modelDataMap.keys()) {
        const match = key.match(/usage:model:daily:.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const dateStr = match[1]
          if (!modelKeysByDate.has(dateStr)) {
            modelKeysByDate.set(dateStr, [])
          }
          modelKeysByDate.get(dateStr).push(key)
        }
      }
      for (const key of usageDataMap.keys()) {
        const match = key.match(/usage:daily:.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const dateStr = match[1]
          if (!usageKeysByDate.has(dateStr)) {
            usageKeysByDate.set(dateStr, [])
          }
          usageKeysByDate.get(dateStr).push(key)
        }
      }

      // 处理每天的数据
      for (const dayInfo of dayInfos) {
        const modelKeys = modelKeysByDate.get(dayInfo.dateStr) || []
        const usageKeys = usageKeysByDate.get(dayInfo.dateStr) || []

        let dayInputTokens = 0
        let dayOutputTokens = 0
        let dayRequests = 0
        let dayCacheCreateTokens = 0
        let dayCacheReadTokens = 0
        let dayCost = 0

        // 处理模型级别数据
        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]
          const data = modelDataMap.get(modelKey)
          if (!data || Object.keys(data).length === 0) {
            continue
          }

          const modelInputTokens = parseInt(data.inputTokens) || 0
          const modelOutputTokens = parseInt(data.outputTokens) || 0
          const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const modelEphemeral5mTokens = parseInt(data.ephemeral5mTokens) || 0
          const modelEphemeral1hTokens = parseInt(data.ephemeral1hTokens) || 0
          const modelRequests = parseInt(data.requests) || 0

          dayInputTokens += modelInputTokens
          dayOutputTokens += modelOutputTokens
          dayCacheCreateTokens += modelCacheCreateTokens
          dayCacheReadTokens += modelCacheReadTokens
          dayRequests += modelRequests

          const modelUsage = {
            input_tokens: modelInputTokens,
            output_tokens: modelOutputTokens,
            cache_creation_input_tokens: modelCacheCreateTokens,
            cache_read_input_tokens: modelCacheReadTokens
          }

          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          if (modelEphemeral5mTokens > 0 || modelEphemeral1hTokens > 0) {
            modelUsage.cache_creation = {
              ephemeral_5m_input_tokens: modelEphemeral5mTokens,
              ephemeral_1h_input_tokens: modelEphemeral1hTokens
            }
          }

          const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
          dayCost += modelCostResult.costs.total
        }

        // 如果没有模型级别的数据，回退到原始方法
        if (modelKeys.length === 0 && usageKeys.length > 0) {
          let dayEph5m = 0
          let dayEph1h = 0
          for (const key of usageKeys) {
            const data = usageDataMap.get(key)
            if (data) {
              dayInputTokens += parseInt(data.inputTokens) || 0
              dayOutputTokens += parseInt(data.outputTokens) || 0
              dayRequests += parseInt(data.requests) || 0
              dayCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              dayCacheReadTokens += parseInt(data.cacheReadTokens) || 0
              dayEph5m += parseInt(data.ephemeral5mTokens) || 0
              dayEph1h += parseInt(data.ephemeral1hTokens) || 0
            }
          }

          const usage = {
            input_tokens: dayInputTokens,
            output_tokens: dayOutputTokens,
            cache_creation_input_tokens: dayCacheCreateTokens,
            cache_read_input_tokens: dayCacheReadTokens
          }
          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          if (dayEph5m > 0 || dayEph1h > 0) {
            usage.cache_creation = {
              ephemeral_5m_input_tokens: dayEph5m,
              ephemeral_1h_input_tokens: dayEph1h
            }
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          dayCost = costResult.costs.total
        }

        trendData.push({
          date: dayInfo.dateStr,
          inputTokens: dayInputTokens,
          outputTokens: dayOutputTokens,
          requests: dayRequests,
          cacheCreateTokens: dayCacheCreateTokens,
          cacheReadTokens: dayCacheReadTokens,
          totalTokens: dayInputTokens + dayOutputTokens + dayCacheCreateTokens + dayCacheReadTokens,
          cost: dayCost,
          formattedCost: CostCalculator.formatCost(dayCost)
        })
      }
    }

    // 按日期正序排列
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }

    return res.json({ success: true, data: trendData, granularity })
  } catch (error) {
    logger.error('❌ Failed to get usage trend:', error)
    return res.status(500).json({ error: 'Failed to get usage trend', message: error.message })
  }
})

// 获取单个API Key的模型统计
router.get('/api-keys/:keyId/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const { period = 'monthly', startDate, endDate } = req.query

    logger.info(
      `📊 Getting model stats for API key: ${keyId}, period: ${period}, startDate: ${startDate}, endDate: ${endDate}`
    )

    const _client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`

    let searchPatterns = []

    if (period === 'custom' && startDate && endDate) {
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
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = redis.getDateStringInTimezone(d)
        searchPatterns.push(`usage:${keyId}:model:daily:*:${dateStr}`)
      }

      logger.info(
        `📊 Custom date range patterns: ${searchPatterns.length} days from ${startDate} to ${endDate}`
      )
    } else {
      // 原有的预设期间逻辑
      const pattern =
        period === 'daily'
          ? `usage:${keyId}:model:daily:*:${today}`
          : `usage:${keyId}:model:monthly:*:${currentMonth}`
      searchPatterns = [pattern]
      logger.info(`📊 Preset period pattern: ${pattern}`)
    }

    // 汇总所有匹配的数据
    const modelStatsMap = new Map()
    const modelStats = [] // 定义结果数组

    if (period === 'custom' && startDate && endDate) {
      // 自定义日期范围，使用索引
      const start = new Date(startDate)
      const end = new Date(endDate)
      const fetchPromises = []
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = redis.getDateStringInTimezone(d)
        fetchPromises.push(
          getUsageDataByIndex(
            `usage:keymodel:daily:index:${dateStr}`,
            `usage:{keyId}:model:daily:{model}:${dateStr}`,
            `usage:*:model:daily:*:${dateStr}`
          )
        )
      }
      const allResults = await Promise.all(fetchPromises)
      for (const results of allResults) {
        for (const { key, data } of results) {
          // 过滤出属于该 keyId 的记录
          if (!key.startsWith(`usage:${keyId}:model:`)) {
            continue
          }
          const match = key.match(/usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!match) {
            continue
          }
          const model = match[1]
          if (!modelStatsMap.has(model)) {
            modelStatsMap.set(model, {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0,
              ephemeral5mTokens: 0,
              ephemeral1hTokens: 0,
              allTokens: 0,
              realCostMicro: 0,
              ratedCostMicro: 0,
              hasStoredCost: false
            })
          }
          const stats = modelStatsMap.get(model)
          stats.requests += parseInt(data.requests) || 0
          stats.inputTokens += parseInt(data.inputTokens) || 0
          stats.outputTokens += parseInt(data.outputTokens) || 0
          stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          stats.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
          stats.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
          stats.allTokens += parseInt(data.allTokens) || 0
          if ('realCostMicro' in data || 'ratedCostMicro' in data) {
            stats.realCostMicro += parseInt(data.realCostMicro) || 0
            stats.ratedCostMicro += parseInt(data.ratedCostMicro) || 0
            stats.hasStoredCost = true
          }
        }
      }
    } else {
      // 预设期间，使用索引
      let results
      if (period === 'daily') {
        results = await getUsageDataByIndex(
          `usage:keymodel:daily:index:${today}`,
          `usage:{keyId}:model:daily:{model}:${today}`,
          `usage:*:model:daily:*:${today}`
        )
      } else {
        // monthly - 需要月度 keymodel 索引，暂时回退到 SCAN
        const pattern = `usage:${keyId}:model:monthly:*:${currentMonth}`
        results = await redis.scanAndGetAllChunked(pattern)
      }
      for (const { key, data } of results) {
        if (!key.startsWith(`usage:${keyId}:model:`)) {
          continue
        }
        const match =
          key.match(/usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/) ||
          key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/)
        if (!match) {
          continue
        }
        const model = match[1]
        if (!modelStatsMap.has(model)) {
          modelStatsMap.set(model, {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            ephemeral5mTokens: 0,
            ephemeral1hTokens: 0,
            allTokens: 0,
            realCostMicro: 0,
            ratedCostMicro: 0,
            hasStoredCost: false
          })
        }
        const stats = modelStatsMap.get(model)
        stats.requests += parseInt(data.requests) || 0
        stats.inputTokens += parseInt(data.inputTokens) || 0
        stats.outputTokens += parseInt(data.outputTokens) || 0
        stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
        stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        stats.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
        stats.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
        stats.allTokens += parseInt(data.allTokens) || 0
        if ('realCostMicro' in data || 'ratedCostMicro' in data) {
          stats.realCostMicro += parseInt(data.realCostMicro) || 0
          stats.ratedCostMicro += parseInt(data.ratedCostMicro) || 0
          stats.hasStoredCost = true
        }
      }
    }

    // 将汇总的数据转换为最终结果
    for (const [model, stats] of modelStatsMap) {
      logger.info(`📊 Model ${model} aggregated data:`, stats)

      let costData
      if (stats.hasStoredCost) {
        // 使用请求时已计算并存储的费用（精确，包含 1M 上下文、Fast Mode 等特殊计费）
        const ratedCost = stats.ratedCostMicro / 1000000
        const realCost = stats.realCostMicro / 1000000
        costData = {
          costs: { total: ratedCost, real: realCost },
          formatted: { total: CostCalculator.formatCost(ratedCost) },
          pricing: null,
          usingDynamicPricing: false,
          usingStoredCost: true
        }
      } else {
        // Legacy fallback：旧数据没有存储费用，从 token 重算
        const usage = {
          input_tokens: stats.inputTokens,
          output_tokens: stats.outputTokens,
          cache_creation_input_tokens: stats.cacheCreateTokens,
          cache_read_input_tokens: stats.cacheReadTokens
        }

        if (stats.ephemeral5mTokens > 0 || stats.ephemeral1hTokens > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: stats.ephemeral5mTokens,
            ephemeral_1h_input_tokens: stats.ephemeral1hTokens
          }
        }

        costData = CostCalculator.calculateCost(usage, model)
      }

      modelStats.push({
        model,
        requests: stats.requests,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheCreateTokens: stats.cacheCreateTokens,
        cacheReadTokens: stats.cacheReadTokens,
        allTokens: stats.allTokens,
        // 添加费用信息
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing,
        usingDynamicPricing: costData.usingDynamicPricing
      })
    }

    // 如果没有找到模型级别的详细数据，尝试从汇总数据中生成展示
    if (modelStats.length === 0) {
      logger.info(
        `📊 No detailed model stats found, trying to get aggregate data for API key ${keyId}`
      )

      // 尝试从API Keys列表中获取usage数据作为备选方案
      try {
        const apiKeys = await apiKeyService.getAllApiKeysFast()
        const targetApiKey = apiKeys.find((key) => key.id === keyId)

        if (targetApiKey && targetApiKey.usage) {
          logger.info(
            `📊 Found API key usage data from getAllApiKeys for ${keyId}:`,
            targetApiKey.usage
          )

          // 从汇总数据创建展示条目
          let usageData
          if (period === 'custom' || period === 'daily') {
            // 对于自定义或日统计，使用daily数据或total数据
            usageData = targetApiKey.usage.daily || targetApiKey.usage.total
          } else {
            // 对于月统计，使用monthly数据或total数据
            usageData = targetApiKey.usage.monthly || targetApiKey.usage.total
          }

          if (usageData && usageData.allTokens > 0) {
            const usage = {
              input_tokens: usageData.inputTokens || 0,
              output_tokens: usageData.outputTokens || 0,
              cache_creation_input_tokens: usageData.cacheCreateTokens || 0,
              cache_read_input_tokens: usageData.cacheReadTokens || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const histEph5m = usageData.ephemeral5mTokens || 0
            const histEph1h = usageData.ephemeral1hTokens || 0
            if (histEph5m > 0 || histEph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: histEph5m,
                ephemeral_1h_input_tokens: histEph1h
              }
            }

            // 对于汇总数据，使用默认模型计算费用
            const costData = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')

            modelStats.push({
              model: '总体使用 (历史数据)',
              requests: usageData.requests || 0,
              inputTokens: usageData.inputTokens || 0,
              outputTokens: usageData.outputTokens || 0,
              cacheCreateTokens: usageData.cacheCreateTokens || 0,
              cacheReadTokens: usageData.cacheReadTokens || 0,
              allTokens: usageData.allTokens || 0,
              // 添加费用信息
              costs: costData.costs,
              formatted: costData.formatted,
              pricing: costData.pricing,
              usingDynamicPricing: costData.usingDynamicPricing
            })

            logger.info('📊 Generated display data from API key usage stats')
          } else {
            logger.info(`📊 No usage data found for period ${period} in API key data`)
          }
        } else {
          logger.info(`📊 API key ${keyId} not found or has no usage data`)
        }
      } catch (error) {
        logger.error('❌ Error fetching API key usage data:', error)
      }
    }

    // 按总token数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens)

    logger.info(`📊 Returning ${modelStats.length} model stats for API key ${keyId}:`, modelStats)

    return res.json({ success: true, data: modelStats })
  } catch (error) {
    logger.error('❌ Failed to get API key model stats:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get API key model stats', message: error.message })
  }
})

// 获取按账号分组的使用趋势
router.get('/account-usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { granularity = 'day', group = 'claude', days = 7, startDate, endDate } = req.query

    const allowedGroups = ['claude', 'openai', 'gemini', 'droid', 'bedrock']
    if (!allowedGroups.includes(group)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account group'
      })
    }

    const groupLabels = {
      claude: 'Claude账户',
      openai: 'OpenAI账户',
      gemini: 'Gemini账户',
      droid: 'Droid账户',
      bedrock: 'Bedrock账户'
    }

    // 拉取各平台账号列表
    let accounts = []
    if (group === 'claude') {
      const [claudeAccounts, claudeConsoleAccounts] = await Promise.all([
        claudeAccountService.getAllAccounts(),
        claudeConsoleAccountService.getAllAccounts()
      ])

      accounts = [
        ...claudeAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || account.email || `Claude账号 ${shortId}`,
            platform: 'claude'
          }
        }),
        ...claudeConsoleAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || `Console账号 ${shortId}`,
            platform: 'claude-console'
          }
        })
      ]
    } else if (group === 'openai') {
      const [openaiAccounts, openaiResponsesAccounts] = await Promise.all([
        openaiAccountService.getAllAccounts(),
        openaiResponsesAccountService.getAllAccounts(true)
      ])

      accounts = [
        ...openaiAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || account.email || `OpenAI账号 ${shortId}`,
            platform: 'openai'
          }
        }),
        ...openaiResponsesAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || `Responses账号 ${shortId}`,
            platform: 'openai-responses'
          }
        })
      ]
    } else if (group === 'gemini') {
      const [geminiAccounts, geminiApiAccounts] = await Promise.all([
        geminiAccountService.getAllAccounts(),
        geminiApiAccountService.getAllAccounts(true)
      ])

      accounts = [
        ...geminiAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || account.email || `Gemini账号 ${shortId}`,
            platform: 'gemini'
          }
        }),
        ...geminiApiAccounts.map((account) => {
          const id = String(account.id || '')
          const shortId = id ? id.slice(0, 8) : '未知'
          return {
            id,
            name: account.name || `Gemini-API账号 ${shortId}`,
            platform: 'gemini-api'
          }
        })
      ]
    } else if (group === 'droid') {
      const droidAccounts = await droidAccountService.getAllAccounts()
      accounts = droidAccounts.map((account) => {
        const id = String(account.id || '')
        const shortId = id ? id.slice(0, 8) : '未知'
        return {
          id,
          name: account.name || account.ownerEmail || account.ownerName || `Droid账号 ${shortId}`,
          platform: 'droid'
        }
      })
    } else if (group === 'bedrock') {
      const result = await bedrockAccountService.getAllAccounts()
      const bedrockAccounts = result?.success ? result.data : []
      accounts = bedrockAccounts.map((account) => {
        const id = String(account.id || '')
        const shortId = id ? id.slice(0, 8) : '未知'
        return {
          id,
          name: account.name || `Bedrock账号 ${shortId}`,
          platform: 'bedrock'
        }
      })
    }

    if (!accounts || accounts.length === 0) {
      return res.json({
        success: true,
        data: [],
        granularity,
        group,
        groupLabel: groupLabels[group],
        topAccounts: [],
        totalAccounts: 0
      })
    }

    const accountMap = new Map()
    const accountIdSet = new Set()
    for (const account of accounts) {
      accountMap.set(account.id, {
        name: account.name,
        platform: account.platform
      })
      accountIdSet.add(account.id)
    }

    const fallbackModelByGroup = {
      claude: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini-2024-07-18',
      gemini: 'gemini-1.5-flash'
    }
    const fallbackModel = fallbackModelByGroup[group] || 'unknown'

    const trendData = []
    const accountCostTotals = new Map()

    if (granularity === 'hour') {
      let startTime
      let endTime

      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }

      // 收集所有小时的元数据和涉及的日期
      const hourInfos = []
      const dateSet = new Set()
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        dateSet.add(dateStr)

        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        hourInfos.push({
          hourKey,
          dateStr,
          isoTime: currentHour.toISOString(),
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`
        })

        currentHour.setHours(currentHour.getHours() + 1)
      }

      // 按小时获取 account_usage 数据（避免全库扫描）
      const _dates = [...dateSet]
      const usageDataMap = new Map()
      const modelDataMap = new Map()

      // 并行获取每个小时的数据
      const fetchPromises = hourInfos.map(async (hourInfo) => {
        const [usageResults, modelResults] = await Promise.all([
          getUsageDataByIndex(
            `account_usage:hourly:index:${hourInfo.hourKey}`,
            `account_usage:hourly:{id}:${hourInfo.hourKey}`,
            `account_usage:hourly:*:${hourInfo.hourKey}`
          ),
          getUsageDataByIndex(
            `account_usage:model:hourly:index:${hourInfo.hourKey}`,
            `account_usage:model:hourly:{accountId}:{model}:${hourInfo.hourKey}`,
            `account_usage:model:hourly:*:${hourInfo.hourKey}`
          )
        ])
        return { usageResults, modelResults }
      })

      const allResults = await Promise.all(fetchPromises)
      allResults.forEach(({ usageResults, modelResults }) => {
        usageResults.forEach(({ key, data }) => usageDataMap.set(key, data))
        modelResults.forEach(({ key, data }) => modelDataMap.set(key, data))
      })

      // 按 hourKey 分组
      const usageKeysByHour = new Map()
      const modelKeysByHour = new Map()
      for (const key of usageDataMap.keys()) {
        const match = key.match(/account_usage:hourly:.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const hourKey = match[1]
          if (!usageKeysByHour.has(hourKey)) {
            usageKeysByHour.set(hourKey, [])
          }
          usageKeysByHour.get(hourKey).push(key)
        }
      }
      for (const key of modelDataMap.keys()) {
        const match = key.match(/account_usage:model:hourly:(.+?):.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const accountId = match[1]
          const hourKey = match[2]
          const mapKey = `${accountId}:${hourKey}`
          if (!modelKeysByHour.has(mapKey)) {
            modelKeysByHour.set(mapKey, [])
          }
          modelKeysByHour.get(mapKey).push(key)
        }
      }

      // 处理每个小时的数据
      for (const hourInfo of hourInfos) {
        const usageKeys = usageKeysByHour.get(hourInfo.hourKey) || []

        const hourData = {
          hour: hourInfo.isoTime,
          label: hourInfo.label,
          accounts: {}
        }

        for (const key of usageKeys) {
          const match = key.match(/account_usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const accountId = match[1]
          if (!accountIdSet.has(accountId)) {
            continue
          }

          const data = usageDataMap.get(key)
          if (!data) {
            continue
          }

          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const allTokens =
            parseInt(data.allTokens) ||
            inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
          const requests = parseInt(data.requests) || 0

          // 计算模型费用（从预加载的数据中）
          let cost = 0
          const modelKeys = modelKeysByHour.get(`${accountId}:${hourInfo.hourKey}`) || []
          for (const modelKey of modelKeys) {
            const modelData = modelDataMap.get(modelKey)
            if (!modelData) {
              continue
            }

            const parts = modelKey.split(':')
            if (parts.length < 5) {
              continue
            }

            const modelName = parts[4]
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const eph5m = parseInt(modelData.ephemeral5mTokens) || 0
            const eph1h = parseInt(modelData.ephemeral1hTokens) || 0
            if (eph5m > 0 || eph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: eph5m,
                ephemeral_1h_input_tokens: eph1h
              }
            }

            const costResult = CostCalculator.calculateCost(usage, modelName)
            cost += costResult.costs.total
          }

          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
            }
            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const fbEph5m = parseInt(data.ephemeral5mTokens) || 0
            const fbEph1h = parseInt(data.ephemeral1hTokens) || 0
            if (fbEph5m > 0 || fbEph1h > 0) {
              fallbackUsage.cache_creation = {
                ephemeral_5m_input_tokens: fbEph5m,
                ephemeral_1h_input_tokens: fbEph1h
              }
            }
            const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
            cost = fallbackResult.costs.total
          }

          const formattedCost = CostCalculator.formatCost(cost)
          const accountInfo = accountMap.get(accountId)

          hourData.accounts[accountId] = {
            name: accountInfo ? accountInfo.name : `账号 ${accountId.slice(0, 8)}`,
            cost,
            formattedCost,
            requests
          }

          accountCostTotals.set(accountId, (accountCostTotals.get(accountId) || 0) + cost)
        }

        trendData.push(hourData)
      }
    } else {
      const daysCount = parseInt(days) || 7
      const today = new Date()

      // 收集所有天的元数据
      const dayInfos = []
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        dayInfos.push({ dateStr })
      }

      // 使用索引获取数据
      const usagePromises = dayInfos.map((d) =>
        getUsageDataByIndex(
          `account_usage:daily:index:${d.dateStr}`,
          `account_usage:daily:{id}:${d.dateStr}`,
          `account_usage:daily:*:${d.dateStr}`
        )
      )
      const modelPromises = dayInfos.map((d) =>
        getUsageDataByIndex(
          `account_usage:model:daily:index:${d.dateStr}`,
          `account_usage:model:daily:{accountId}:{model}:${d.dateStr}`,
          `account_usage:model:daily:*:${d.dateStr}`
        )
      )
      const [usageResultsArr, modelResultsArr] = await Promise.all([
        Promise.all(usagePromises),
        Promise.all(modelPromises)
      ])

      const usageDataMap = new Map()
      const modelDataMap = new Map()
      for (const results of usageResultsArr) {
        for (const { key, data } of results) {
          usageDataMap.set(key, data)
        }
      }
      for (const results of modelResultsArr) {
        for (const { key, data } of results) {
          modelDataMap.set(key, data)
        }
      }

      // 按 dateStr 分组
      const usageKeysByDate = new Map()
      const modelKeysByDate = new Map()
      for (const key of usageDataMap.keys()) {
        const match = key.match(/account_usage:daily:.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const dateStr = match[1]
          if (!usageKeysByDate.has(dateStr)) {
            usageKeysByDate.set(dateStr, [])
          }
          usageKeysByDate.get(dateStr).push(key)
        }
      }
      for (const key of modelDataMap.keys()) {
        const match = key.match(/account_usage:model:daily:(.+?):.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const accountId = match[1]
          const dateStr = match[2]
          const mapKey = `${accountId}:${dateStr}`
          if (!modelKeysByDate.has(mapKey)) {
            modelKeysByDate.set(mapKey, [])
          }
          modelKeysByDate.get(mapKey).push(key)
        }
      }

      // 处理每天的数据
      for (const dayInfo of dayInfos) {
        const usageKeys = usageKeysByDate.get(dayInfo.dateStr) || []

        const dayData = {
          date: dayInfo.dateStr,
          accounts: {}
        }

        for (const key of usageKeys) {
          const match = key.match(/account_usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const accountId = match[1]
          if (!accountIdSet.has(accountId)) {
            continue
          }

          const data = usageDataMap.get(key)
          if (!data) {
            continue
          }

          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const allTokens =
            parseInt(data.allTokens) ||
            inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
          const requests = parseInt(data.requests) || 0

          // 计算模型费用（从预加载的数据中）
          let cost = 0
          const modelKeys = modelKeysByDate.get(`${accountId}:${dayInfo.dateStr}`) || []
          for (const modelKey of modelKeys) {
            const modelData = modelDataMap.get(modelKey)
            if (!modelData) {
              continue
            }

            const parts = modelKey.split(':')
            if (parts.length < 5) {
              continue
            }

            const modelName = parts[4]
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const eph5m = parseInt(modelData.ephemeral5mTokens) || 0
            const eph1h = parseInt(modelData.ephemeral1hTokens) || 0
            if (eph5m > 0 || eph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: eph5m,
                ephemeral_1h_input_tokens: eph1h
              }
            }

            const costResult = CostCalculator.calculateCost(usage, modelName)
            cost += costResult.costs.total
          }

          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
            }
            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const fbEph5m = parseInt(data.ephemeral5mTokens) || 0
            const fbEph1h = parseInt(data.ephemeral1hTokens) || 0
            if (fbEph5m > 0 || fbEph1h > 0) {
              fallbackUsage.cache_creation = {
                ephemeral_5m_input_tokens: fbEph5m,
                ephemeral_1h_input_tokens: fbEph1h
              }
            }
            const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
            cost = fallbackResult.costs.total
          }

          const formattedCost = CostCalculator.formatCost(cost)
          const accountInfo = accountMap.get(accountId)

          dayData.accounts[accountId] = {
            name: accountInfo ? accountInfo.name : `账号 ${accountId.slice(0, 8)}`,
            cost,
            formattedCost,
            requests
          }

          accountCostTotals.set(accountId, (accountCostTotals.get(accountId) || 0) + cost)
        }

        trendData.push(dayData)
      }
    }

    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }

    const topAccounts = Array.from(accountCostTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([accountId]) => accountId)

    return res.json({
      success: true,
      data: trendData,
      granularity,
      group,
      groupLabel: groupLabels[group],
      topAccounts,
      totalAccounts: accountCostTotals.size
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage trend:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get account usage trend', message: error.message })
  }
})

// 获取按API Key分组的使用趋势
router.get('/api-keys-usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { granularity = 'day', days = 7, startDate, endDate } = req.query

    logger.info(`📊 Getting API keys usage trend, granularity: ${granularity}, days: ${days}`)

    const trendData = []

    // 获取所有API Keys（只需要 id 和 name，过滤已删除的）
    const apiKeyIds = await redis.scanApiKeyIds()
    const apiKeyBasicData = await redis.batchGetApiKeys(apiKeyIds)
    const apiKeyMap = new Map(
      apiKeyBasicData.filter((key) => !key.isDeleted).map((key) => [key.id, key])
    )

    if (granularity === 'hour') {
      // 小时粒度统计
      let endTime, startTime

      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }

      // 收集所有小时的元数据和涉及的日期
      const hourInfos = []
      const dateSet = new Set()
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        dateSet.add(dateStr)

        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        hourInfos.push({
          hourKey,
          dateStr,
          isoTime: currentHour.toISOString(),
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`
        })

        currentHour.setHours(currentHour.getHours() + 1)
      }

      // 使用索引获取数据，按小时批量查询
      const _dates = [...dateSet]
      const usageDataMap = new Map()
      const modelDataMap = new Map()

      const fetchPromises = hourInfos.map(async (hourInfo) => {
        const [usageResults, modelResults] = await Promise.all([
          getUsageDataByIndex(
            `usage:hourly:index:${hourInfo.hourKey}`,
            `usage:hourly:{id}:${hourInfo.hourKey}`,
            `usage:hourly:*:${hourInfo.hourKey}`
          ),
          getUsageDataByIndex(
            `usage:keymodel:hourly:index:${hourInfo.hourKey}`,
            `usage:{keyId}:model:hourly:{model}:${hourInfo.hourKey}`,
            `usage:*:model:hourly:*:${hourInfo.hourKey}`
          )
        ])
        return { usageResults, modelResults }
      })

      const allResults = await Promise.all(fetchPromises)
      allResults.forEach(({ usageResults, modelResults }) => {
        usageResults.forEach(({ key, data }) => usageDataMap.set(key, data))
        modelResults.forEach(({ key, data }) => modelDataMap.set(key, data))
      })

      // 按 hourKey 分组 keys
      const usageKeysByHour = new Map()
      const modelKeysByHour = new Map()
      for (const key of usageDataMap.keys()) {
        const match = key.match(/usage:hourly:.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const hourKey = match[1]
          if (!usageKeysByHour.has(hourKey)) {
            usageKeysByHour.set(hourKey, [])
          }
          usageKeysByHour.get(hourKey).push(key)
        }
      }
      for (const key of modelDataMap.keys()) {
        const match = key.match(/usage:.+?:model:hourly:.+?:(\d{4}-\d{2}-\d{2}:\d{2})/)
        if (match) {
          const hourKey = match[1]
          if (!modelKeysByHour.has(hourKey)) {
            modelKeysByHour.set(hourKey, [])
          }
          modelKeysByHour.get(hourKey).push(key)
        }
      }

      // 处理每个小时的数据
      for (const hourInfo of hourInfos) {
        const hourUsageKeys = usageKeysByHour.get(hourInfo.hourKey) || []
        const hourModelKeys = modelKeysByHour.get(hourInfo.hourKey) || []

        const hourData = {
          hour: hourInfo.isoTime,
          label: hourInfo.label,
          apiKeys: {}
        }

        // 处理 usage 数据
        const apiKeyDataMap = new Map()
        for (const key of hourUsageKeys) {
          const match = key.match(/usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const data = usageDataMap.get(key)
          if (!data || !apiKeyMap.has(apiKeyId)) {
            continue
          }

          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0

          apiKeyDataMap.set(apiKeyId, {
            name: apiKeyMap.get(apiKeyId).name,
            tokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens,
            requests: parseInt(data.requests) || 0,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            ephemeral5mTokens: parseInt(data.ephemeral5mTokens) || 0,
            ephemeral1hTokens: parseInt(data.ephemeral1hTokens) || 0
          })
        }

        // 处理 model 数据计算费用
        const apiKeyCostMap = new Map()
        for (const modelKey of hourModelKeys) {
          const match = modelKey.match(/usage:(.+?):model:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const model = match[2]
          const modelData = modelDataMap.get(modelKey)
          if (!modelData || !apiKeyDataMap.has(apiKeyId)) {
            continue
          }

          // 优先使用已存储的费用
          const hasStoredCost = 'realCostMicro' in modelData || 'ratedCostMicro' in modelData
          let modelCost = 0

          if (hasStoredCost) {
            modelCost = (parseInt(modelData.ratedCostMicro) || 0) / 1000000
          } else {
            // Legacy fallback：旧数据没有存储费用，从 token 重算
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const eph5m = parseInt(modelData.ephemeral5mTokens) || 0
            const eph1h = parseInt(modelData.ephemeral1hTokens) || 0
            if (eph5m > 0 || eph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: eph5m,
                ephemeral_1h_input_tokens: eph1h
              }
            }

            const costResult = CostCalculator.calculateCost(usage, model)
            modelCost = costResult.costs.total
          }

          const currentCost = apiKeyCostMap.get(apiKeyId) || 0
          apiKeyCostMap.set(apiKeyId, currentCost + modelCost)
        }

        // 组合数据
        for (const [apiKeyId, data] of apiKeyDataMap) {
          let cost = apiKeyCostMap.get(apiKeyId) || 0
          let formattedCost = CostCalculator.formatCost(cost)

          // 降级方案
          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            if (data.ephemeral5mTokens > 0 || data.ephemeral1hTokens > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: data.ephemeral5mTokens,
                ephemeral_1h_input_tokens: data.ephemeral1hTokens
              }
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            cost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }

          hourData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost,
            formattedCost
          }
        }

        trendData.push(hourData)
      }
    } else {
      // 天粒度统计（按日期集合扫描）
      const daysCount = parseInt(days) || 7
      const today = new Date()

      // 收集所有天的元数据
      const dayInfos = []
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        dayInfos.push({ dateStr })
      }

      // 使用索引获取数据，按日期批量查询
      const usageDataMap = new Map()
      const modelDataMap = new Map()

      const fetchPromises = dayInfos.map(async (dayInfo) => {
        const [usageResults, modelResults] = await Promise.all([
          getUsageDataByIndex(
            `usage:daily:index:${dayInfo.dateStr}`,
            `usage:daily:{id}:${dayInfo.dateStr}`,
            `usage:daily:*:${dayInfo.dateStr}`
          ),
          getUsageDataByIndex(
            `usage:keymodel:daily:index:${dayInfo.dateStr}`,
            `usage:{keyId}:model:daily:{model}:${dayInfo.dateStr}`,
            `usage:*:model:daily:*:${dayInfo.dateStr}`
          )
        ])
        return { usageResults, modelResults }
      })

      const allResults = await Promise.all(fetchPromises)
      allResults.forEach(({ usageResults, modelResults }) => {
        usageResults.forEach(({ key, data }) => usageDataMap.set(key, data))
        modelResults.forEach(({ key, data }) => modelDataMap.set(key, data))
      })

      // 按 dateStr 分组 keys
      const usageKeysByDate = new Map()
      const modelKeysByDate = new Map()
      for (const key of usageDataMap.keys()) {
        const match = key.match(/usage:daily:.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const dateStr = match[1]
          if (!usageKeysByDate.has(dateStr)) {
            usageKeysByDate.set(dateStr, [])
          }
          usageKeysByDate.get(dateStr).push(key)
        }
      }
      for (const key of modelDataMap.keys()) {
        const match = key.match(/usage:.+?:model:daily:.+?:(\d{4}-\d{2}-\d{2})/)
        if (match) {
          const dateStr = match[1]
          if (!modelKeysByDate.has(dateStr)) {
            modelKeysByDate.set(dateStr, [])
          }
          modelKeysByDate.get(dateStr).push(key)
        }
      }

      // 处理每天的数据
      for (const dayInfo of dayInfos) {
        const dayUsageKeys = usageKeysByDate.get(dayInfo.dateStr) || []
        const dayModelKeys = modelKeysByDate.get(dayInfo.dateStr) || []

        const dayData = {
          date: dayInfo.dateStr,
          apiKeys: {}
        }

        // 处理 usage 数据
        const apiKeyDataMap = new Map()
        for (const key of dayUsageKeys) {
          const match = key.match(/usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const data = usageDataMap.get(key)
          if (!data || !apiKeyMap.has(apiKeyId)) {
            continue
          }

          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0

          apiKeyDataMap.set(apiKeyId, {
            name: apiKeyMap.get(apiKeyId).name,
            tokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens,
            requests: parseInt(data.requests) || 0,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            ephemeral5mTokens: parseInt(data.ephemeral5mTokens) || 0,
            ephemeral1hTokens: parseInt(data.ephemeral1hTokens) || 0
          })
        }

        // 处理 model 数据计算费用
        const apiKeyCostMap = new Map()
        for (const modelKey of dayModelKeys) {
          const match = modelKey.match(/usage:(.+?):model:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const model = match[2]
          const modelData = modelDataMap.get(modelKey)
          if (!modelData || !apiKeyDataMap.has(apiKeyId)) {
            continue
          }

          // 优先使用已存储的费用
          const hasStoredCost = 'realCostMicro' in modelData || 'ratedCostMicro' in modelData
          let modelCost = 0

          if (hasStoredCost) {
            modelCost = (parseInt(modelData.ratedCostMicro) || 0) / 1000000
          } else {
            // Legacy fallback：旧数据没有存储费用，从 token 重算
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const eph5m = parseInt(modelData.ephemeral5mTokens) || 0
            const eph1h = parseInt(modelData.ephemeral1hTokens) || 0
            if (eph5m > 0 || eph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: eph5m,
                ephemeral_1h_input_tokens: eph1h
              }
            }

            const costResult = CostCalculator.calculateCost(usage, model)
            modelCost = costResult.costs.total
          }

          const currentCost = apiKeyCostMap.get(apiKeyId) || 0
          apiKeyCostMap.set(apiKeyId, currentCost + modelCost)
        }

        // 组合数据
        for (const [apiKeyId, data] of apiKeyDataMap) {
          let cost = apiKeyCostMap.get(apiKeyId) || 0
          let formattedCost = CostCalculator.formatCost(cost)

          // 降级方案
          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            if (data.ephemeral5mTokens > 0 || data.ephemeral1hTokens > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: data.ephemeral5mTokens,
                ephemeral_1h_input_tokens: data.ephemeral1hTokens
              }
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            cost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }

          dayData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost,
            formattedCost
          }
        }

        trendData.push(dayData)
      }
    }

    // 按时间正序排列
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }

    // 计算每个API Key的总token数，用于排序
    const apiKeyTotals = new Map()
    for (const point of trendData) {
      for (const [apiKeyId, data] of Object.entries(point.apiKeys)) {
        apiKeyTotals.set(apiKeyId, (apiKeyTotals.get(apiKeyId) || 0) + data.tokens)
      }
    }

    // 获取前10个使用量最多的API Key
    const topApiKeys = Array.from(apiKeyTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([apiKeyId]) => apiKeyId)

    return res.json({
      success: true,
      data: trendData,
      granularity,
      topApiKeys,
      totalApiKeys: apiKeyTotals.size
    })
  } catch (error) {
    logger.error('❌ Failed to get API keys usage trend:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get API keys usage trend', message: error.message })
  }
})

// 计算总体使用费用
router.get('/usage-costs', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query // all, today, monthly, 7days

    logger.info(`💰 Calculating usage costs for period: ${period}`)

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

    const totalCosts = {
      inputCost: 0,
      outputCost: 0,
      cacheCreateCost: 0,
      cacheReadCost: 0,
      totalCost: 0
    }

    const modelCosts = {}

    // 按模型统计费用
    const _client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`

    let _pattern
    if (period === 'today') {
      _pattern = `usage:model:daily:*:${today}`
    } else if (period === 'monthly') {
      _pattern = `usage:model:monthly:*:${currentMonth}`
    } else if (period === '7days') {
      // 最近7天：汇总daily数据（使用 SCAN + Pipeline 优化）
      const modelUsageMap = new Map()

      // 收集最近7天的所有日期
      const dateStrs = []
      for (let i = 0; i < 7; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const currentTzDate = redis.getDateInTimezone(date)
        const dateStr = `${currentTzDate.getUTCFullYear()}-${String(
          currentTzDate.getUTCMonth() + 1
        ).padStart(2, '0')}-${String(currentTzDate.getUTCDate()).padStart(2, '0')}`
        dateStrs.push(dateStr)
      }

      // 使用索引获取数据
      const fetchPromises = dateStrs.map((dateStr) =>
        getUsageDataByIndex(
          `usage:model:daily:index:${dateStr}`,
          `usage:model:daily:{id}:${dateStr}`,
          `usage:model:daily:*:${dateStr}`
        )
      )
      const allResults = await Promise.all(fetchPromises)
      const allData = allResults.flat()

      // 处理数据
      for (const { key, data } of allData) {
        if (!data) {
          continue
        }

        const modelMatch = key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
        if (!modelMatch) {
          continue
        }

        const rawModel = modelMatch[1]
        const normalizedModel = normalizeModelName(rawModel)

        if (!modelUsageMap.has(normalizedModel)) {
          modelUsageMap.set(normalizedModel, {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            ephemeral5mTokens: 0,
            ephemeral1hTokens: 0
          })
        }

        const modelUsage = modelUsageMap.get(normalizedModel)
        modelUsage.inputTokens += parseInt(data.inputTokens) || 0
        modelUsage.outputTokens += parseInt(data.outputTokens) || 0
        modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
        modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        modelUsage.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
        modelUsage.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
      }

      // 计算7天统计的费用
      logger.info(`💰 Processing ${modelUsageMap.size} unique models for 7days cost calculation`)

      for (const [model, usage] of modelUsageMap) {
        const usageData = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreateTokens,
          cache_read_input_tokens: usage.cacheReadTokens
        }

        // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
        if (usage.ephemeral5mTokens > 0 || usage.ephemeral1hTokens > 0) {
          usageData.cache_creation = {
            ephemeral_5m_input_tokens: usage.ephemeral5mTokens,
            ephemeral_1h_input_tokens: usage.ephemeral1hTokens
          }
        }

        const costResult = CostCalculator.calculateCost(usageData, model)
        totalCosts.inputCost += costResult.costs.input
        totalCosts.outputCost += costResult.costs.output
        totalCosts.cacheCreateCost += costResult.costs.cacheWrite
        totalCosts.cacheReadCost += costResult.costs.cacheRead
        totalCosts.totalCost += costResult.costs.total

        logger.info(
          `💰 Model ${model} (7days): ${
            usage.inputTokens + usage.outputTokens + usage.cacheCreateTokens + usage.cacheReadTokens
          } tokens, cost: ${costResult.formatted.total}`
        )

        // 记录模型费用
        modelCosts[model] = {
          model,
          requests: 0, // 7天汇总数据没有请求数统计
          usage: usageData,
          costs: costResult.costs,
          formatted: costResult.formatted,
          usingDynamicPricing: costResult.usingDynamicPricing
        }
      }

      // 返回7天统计结果
      return res.json({
        success: true,
        data: {
          period,
          totalCosts: {
            ...totalCosts,
            formatted: {
              inputCost: CostCalculator.formatCost(totalCosts.inputCost),
              outputCost: CostCalculator.formatCost(totalCosts.outputCost),
              cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
              cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
              totalCost: CostCalculator.formatCost(totalCosts.totalCost)
            }
          },
          modelCosts: Object.values(modelCosts)
        }
      })
    } else {
      // 全部时间，使用月份索引
      const months = await redis.client.smembers('usage:model:monthly:months')
      const allData = []
      if (months && months.length > 0) {
        const fetchPromises = months.map((month) =>
          getUsageDataByIndex(
            `usage:model:monthly:index:${month}`,
            `usage:model:monthly:{id}:${month}`,
            `usage:model:monthly:*:${month}`
          )
        )
        const results = await Promise.all(fetchPromises)
        results.forEach((r) => allData.push(...r))
      }
      logger.info(`💰 Total period calculation: found ${allData.length} monthly model keys`)

      if (allData.length > 0) {
        const modelUsageMap = new Map()

        for (const { key, data } of allData) {
          if (!data) {
            continue
          }

          const modelMatch = key.match(/usage:model:monthly:(.+):(\d{4}-\d{2})$/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]

          if (!modelUsageMap.has(model)) {
            modelUsageMap.set(model, {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0,
              ephemeral5mTokens: 0,
              ephemeral1hTokens: 0
            })
          }

          const modelUsage = modelUsageMap.get(model)
          modelUsage.inputTokens += parseInt(data.inputTokens) || 0
          modelUsage.outputTokens += parseInt(data.outputTokens) || 0
          modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          modelUsage.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
          modelUsage.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
        }

        // 使用模型级别的数据计算费用
        logger.info(`💰 Processing ${modelUsageMap.size} unique models for total cost calculation`)

        for (const [model, usage] of modelUsageMap) {
          const usageData = {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_creation_input_tokens: usage.cacheCreateTokens,
            cache_read_input_tokens: usage.cacheReadTokens
          }

          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          if (usage.ephemeral5mTokens > 0 || usage.ephemeral1hTokens > 0) {
            usageData.cache_creation = {
              ephemeral_5m_input_tokens: usage.ephemeral5mTokens,
              ephemeral_1h_input_tokens: usage.ephemeral1hTokens
            }
          }

          const costResult = CostCalculator.calculateCost(usageData, model)
          totalCosts.inputCost += costResult.costs.input
          totalCosts.outputCost += costResult.costs.output
          totalCosts.cacheCreateCost += costResult.costs.cacheWrite
          totalCosts.cacheReadCost += costResult.costs.cacheRead
          totalCosts.totalCost += costResult.costs.total

          logger.info(
            `💰 Model ${model}: ${
              usage.inputTokens +
              usage.outputTokens +
              usage.cacheCreateTokens +
              usage.cacheReadTokens
            } tokens, cost: ${costResult.formatted.total}`
          )

          // 记录模型费用
          modelCosts[model] = {
            model,
            requests: 0, // 历史汇总数据没有请求数
            usage: usageData,
            costs: costResult.costs,
            formatted: costResult.formatted,
            usingDynamicPricing: costResult.usingDynamicPricing
          }
        }
      } else {
        // 如果没有详细的模型统计数据，回退到API Key汇总数据（延迟加载）
        logger.warn('No detailed model statistics found, falling back to API Key aggregated data')
        const apiKeys = await apiKeyService.getAllApiKeysFast()

        for (const apiKey of apiKeys) {
          if (apiKey.usage && apiKey.usage.total) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
            }

            // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
            const totalEph5m = apiKey.usage.total.ephemeral5mTokens || 0
            const totalEph1h = apiKey.usage.total.ephemeral1hTokens || 0
            if (totalEph5m > 0 || totalEph1h > 0) {
              usage.cache_creation = {
                ephemeral_5m_input_tokens: totalEph5m,
                ephemeral_1h_input_tokens: totalEph1h
              }
            }

            // 使用加权平均价格计算（基于当前活跃模型的价格分布）
            const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
            totalCosts.inputCost += costResult.costs.input
            totalCosts.outputCost += costResult.costs.output
            totalCosts.cacheCreateCost += costResult.costs.cacheWrite
            totalCosts.cacheReadCost += costResult.costs.cacheRead
            totalCosts.totalCost += costResult.costs.total
          }
        }
      }

      return res.json({
        success: true,
        data: {
          period,
          totalCosts: {
            ...totalCosts,
            formatted: {
              inputCost: CostCalculator.formatCost(totalCosts.inputCost),
              outputCost: CostCalculator.formatCost(totalCosts.outputCost),
              cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
              cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
              totalCost: CostCalculator.formatCost(totalCosts.totalCost)
            }
          },
          modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
          pricingServiceStatus: pricingService.getStatus()
        }
      })
    }

    // 对于今日或本月，使用索引查询
    let allData
    if (period === 'today') {
      const results = await getUsageDataByIndex(
        `usage:model:daily:index:${today}`,
        `usage:model:daily:{id}:${today}`,
        `usage:model:daily:*:${today}`
      )
      allData = results
    } else {
      // 本月 - 使用月度索引
      const results = await getUsageDataByIndex(
        `usage:model:monthly:index:${currentMonth}`,
        `usage:model:monthly:{id}:${currentMonth}`,
        `usage:model:monthly:*:${currentMonth}`
      )
      allData = results
    }
    const regex =
      period === 'today'
        ? /usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
        : /usage:model:monthly:(.+):\d{4}-\d{2}$/

    for (const { key, data } of allData) {
      if (!data) {
        continue
      }

      const match = key.match(regex)
      if (!match) {
        continue
      }

      const model = match[1]
      const usage = {
        input_tokens: parseInt(data.inputTokens) || 0,
        output_tokens: parseInt(data.outputTokens) || 0,
        cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
        cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
      }

      // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
      const eph5m = parseInt(data.ephemeral5mTokens) || 0
      const eph1h = parseInt(data.ephemeral1hTokens) || 0
      if (eph5m > 0 || eph1h > 0) {
        usage.cache_creation = {
          ephemeral_5m_input_tokens: eph5m,
          ephemeral_1h_input_tokens: eph1h
        }
      }

      const costResult = CostCalculator.calculateCost(usage, model)

      // 累加总费用
      totalCosts.inputCost += costResult.costs.input
      totalCosts.outputCost += costResult.costs.output
      totalCosts.cacheCreateCost += costResult.costs.cacheWrite
      totalCosts.cacheReadCost += costResult.costs.cacheRead
      totalCosts.totalCost += costResult.costs.total

      // 记录模型费用
      modelCosts[model] = {
        model,
        requests: parseInt(data.requests) || 0,
        usage,
        costs: costResult.costs,
        formatted: costResult.formatted,
        usingDynamicPricing: costResult.usingDynamicPricing
      }
    }

    return res.json({
      success: true,
      data: {
        period,
        totalCosts: {
          ...totalCosts,
          formatted: {
            inputCost: CostCalculator.formatCost(totalCosts.inputCost),
            outputCost: CostCalculator.formatCost(totalCosts.outputCost),
            cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
            cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
            totalCost: CostCalculator.formatCost(totalCosts.totalCost)
          }
        },
        modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
        pricingServiceStatus: pricingService.getStatus()
      }
    })
  } catch (error) {
    logger.error('❌ Failed to calculate usage costs:', error)
    return res
      .status(500)
      .json({ error: 'Failed to calculate usage costs', message: error.message })
  }
})

// 获取 API Key 的请求记��时间线
router.get('/api-keys/:keyId/usage-records', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const {
      page = 1,
      pageSize = 50,
      startDate,
      endDate,
      model,
      accountId,
      sortOrder = 'desc'
    } = req.query

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1)
    const pageSizeNumber = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const normalizedSortOrder = sortOrder === 'asc' ? 'asc' : 'desc'

    const startTime = startDate ? new Date(startDate) : null
    const endTime = endDate ? new Date(endDate) : null

    if (
      (startDate && Number.isNaN(startTime?.getTime())) ||
      (endDate && Number.isNaN(endTime?.getTime()))
    ) {
      return res.status(400).json({ success: false, error: 'Invalid date range' })
    }

    if (startTime && endTime && startTime > endTime) {
      return res
        .status(400)
        .json({ success: false, error: 'Start date must be before or equal to end date' })
    }

    const apiKeyInfo = await redis.getApiKey(keyId)
    if (!apiKeyInfo || Object.keys(apiKeyInfo).length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' })
    }

    const rawRecords = await redis.getUsageRecords(keyId, 5000)

    const accountServices = [
      { type: 'claude', getter: (id) => claudeAccountService.getAccount(id) },
      { type: 'claude-console', getter: (id) => claudeConsoleAccountService.getAccount(id) },
      { type: 'ccr', getter: (id) => ccrAccountService.getAccount(id) },
      { type: 'openai', getter: (id) => openaiAccountService.getAccount(id) },
      { type: 'openai-responses', getter: (id) => openaiResponsesAccountService.getAccount(id) },
      { type: 'gemini', getter: (id) => geminiAccountService.getAccount(id) },
      { type: 'gemini-api', getter: (id) => geminiApiAccountService.getAccount(id) },
      { type: 'droid', getter: (id) => droidAccountService.getAccount(id) }
    ]

    const accountCache = new Map()
    const resolveAccountInfo = async (id, type) => {
      if (!id) {
        return null
      }

      const cacheKey = `${type || 'any'}:${id}`
      if (accountCache.has(cacheKey)) {
        return accountCache.get(cacheKey)
      }

      let servicesToTry = type
        ? accountServices.filter((svc) => svc.type === type)
        : accountServices

      // 若渠道改名或传入未知类型，回退尝试全量服务，避免漏解析历史账号
      if (!servicesToTry.length) {
        servicesToTry = accountServices
      }

      for (const service of servicesToTry) {
        try {
          const account = await service.getter(id)
          if (account) {
            const info = {
              id,
              name: account.name || account.email || id,
              type: service.type,
              status: account.status || account.isActive
            }
            accountCache.set(cacheKey, info)
            return info
          }
        } catch (error) {
          logger.debug(`⚠️ Failed to resolve account ${id} via ${service.type}: ${error.message}`)
        }
      }

      accountCache.set(cacheKey, null)
      return null
    }

    const toUsageObject = (record) => {
      const usage = {
        input_tokens: record.inputTokens || 0,
        output_tokens: record.outputTokens || 0,
        cache_creation_input_tokens: record.cacheCreateTokens || 0,
        cache_read_input_tokens: record.cacheReadTokens || 0,
        cache_creation: record.cacheCreation || record.cache_creation || null
      }
      // 如果没有 cache_creation 但有独立存储的 ephemeral 字段，构建子对象
      if (!usage.cache_creation) {
        const eph5m = parseInt(record.ephemeral5mTokens) || 0
        const eph1h = parseInt(record.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }
      }
      return usage
    }

    const withinRange = (record) => {
      if (!record.timestamp) {
        return false
      }
      const ts = new Date(record.timestamp)
      if (Number.isNaN(ts.getTime())) {
        return false
      }
      if (startTime && ts < startTime) {
        return false
      }
      if (endTime && ts > endTime) {
        return false
      }
      return true
    }

    const filteredRecords = rawRecords.filter((record) => {
      if (!withinRange(record)) {
        return false
      }
      if (model && record.model !== model) {
        return false
      }
      if (accountId && record.accountId !== accountId) {
        return false
      }
      return true
    })

    filteredRecords.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime()
      const bTime = new Date(b.timestamp).getTime()
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0
      }
      return normalizedSortOrder === 'asc' ? aTime - bTime : bTime - aTime
    })

    const summary = {
      totalRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0
    }

    const modelSet = new Set()
    const accountOptionMap = new Map()
    let earliestTimestamp = null
    let latestTimestamp = null

    for (const record of filteredRecords) {
      const usage = toUsageObject(record)
      const costData = CostCalculator.calculateCost(usage, record.model || 'unknown')
      const computedCost =
        typeof record.cost === 'number' ? record.cost : costData?.costs?.total || 0
      const totalTokens =
        record.totalTokens ||
        usage.input_tokens +
          usage.output_tokens +
          usage.cache_creation_input_tokens +
          usage.cache_read_input_tokens

      summary.totalRequests += 1
      summary.inputTokens += usage.input_tokens
      summary.outputTokens += usage.output_tokens
      summary.cacheCreateTokens += usage.cache_creation_input_tokens
      summary.cacheReadTokens += usage.cache_read_input_tokens
      summary.totalTokens += totalTokens
      summary.totalCost += computedCost

      if (record.model) {
        modelSet.add(record.model)
      }

      if (record.accountId) {
        const normalizedType = record.accountType || 'unknown'
        if (!accountOptionMap.has(record.accountId)) {
          accountOptionMap.set(record.accountId, {
            id: record.accountId,
            accountTypes: new Set([normalizedType])
          })
        } else {
          accountOptionMap.get(record.accountId).accountTypes.add(normalizedType)
        }
      }

      if (record.timestamp) {
        const ts = new Date(record.timestamp)
        if (!Number.isNaN(ts.getTime())) {
          if (!earliestTimestamp || ts < earliestTimestamp) {
            earliestTimestamp = ts
          }
          if (!latestTimestamp || ts > latestTimestamp) {
            latestTimestamp = ts
          }
        }
      }
    }

    const totalRecords = filteredRecords.length
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / pageSizeNumber) : 0
    const safePage = totalPages > 0 ? Math.min(pageNumber, totalPages) : 1
    const startIndex = (safePage - 1) * pageSizeNumber
    const pageRecords =
      totalRecords === 0 ? [] : filteredRecords.slice(startIndex, startIndex + pageSizeNumber)

    const enrichedRecords = []
    for (const record of pageRecords) {
      const usage = toUsageObject(record)
      const costData = CostCalculator.calculateCost(usage, record.model || 'unknown')
      const computedCost =
        typeof record.cost === 'number' ? record.cost : costData?.costs?.total || 0
      const realCost =
        typeof record.realCost === 'number' ? record.realCost : costData?.costs?.total || 0
      const totalTokens =
        record.totalTokens ||
        usage.input_tokens +
          usage.output_tokens +
          usage.cache_creation_input_tokens +
          usage.cache_read_input_tokens

      const accountInfo = await resolveAccountInfo(record.accountId, record.accountType)
      const resolvedAccountType = accountInfo?.type || record.accountType || 'unknown'

      enrichedRecords.push({
        timestamp: record.timestamp,
        model: record.model || 'unknown',
        accountId: record.accountId || null,
        accountName: accountInfo?.name || null,
        accountStatus: accountInfo?.status ?? null,
        accountType: resolvedAccountType,
        accountTypeName: accountTypeNames[resolvedAccountType] || '未知渠道',
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreateTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        ephemeral5mTokens: record.ephemeral5mTokens || 0,
        ephemeral1hTokens: record.ephemeral1hTokens || 0,
        totalTokens,
        isLongContextRequest: record.isLongContext || record.isLongContextRequest || false,
        cost: Number(computedCost.toFixed(6)),
        costFormatted: CostCalculator.formatCost(computedCost),
        realCost: Number(realCost.toFixed(6)),
        realCostFormatted: CostCalculator.formatCost(realCost),
        costBreakdown: record.realCostBreakdown ||
          record.costBreakdown || {
            input: costData?.costs?.input || 0,
            output: costData?.costs?.output || 0,
            cacheCreate: costData?.costs?.cacheWrite || 0,
            cacheRead: costData?.costs?.cacheRead || 0,
            total: costData?.costs?.total || computedCost
          },
        responseTime: record.responseTime || null
      })
    }

    const accountOptions = []
    for (const option of accountOptionMap.values()) {
      const types = Array.from(option.accountTypes || [])

      // 优先按历史出现的 accountType 解析，若失败则回退全量解析
      let resolvedInfo = null
      for (const type of types) {
        resolvedInfo = await resolveAccountInfo(option.id, type)
        if (resolvedInfo && resolvedInfo.name) {
          break
        }
      }
      if (!resolvedInfo) {
        resolvedInfo = await resolveAccountInfo(option.id)
      }

      const chosenType = resolvedInfo?.type || types[0] || 'unknown'
      const chosenTypeName = accountTypeNames[chosenType] || '未知渠道'

      if (!resolvedInfo) {
        logger.warn(`⚠️ 保留无法解析的账户筛选项: ${option.id}, types=${types.join(',') || 'none'}`)
      }

      accountOptions.push({
        id: option.id,
        name: resolvedInfo?.name || option.id,
        accountType: chosenType,
        accountTypeName: chosenTypeName,
        rawTypes: types
      })
    }

    return res.json({
      success: true,
      data: {
        records: enrichedRecords,
        pagination: {
          currentPage: safePage,
          pageSize: pageSizeNumber,
          totalRecords,
          totalPages,
          hasNextPage: totalPages > 0 && safePage < totalPages,
          hasPreviousPage: totalPages > 0 && safePage > 1
        },
        filters: {
          startDate: startTime ? startTime.toISOString() : null,
          endDate: endTime ? endTime.toISOString() : null,
          model: model || null,
          accountId: accountId || null,
          sortOrder: normalizedSortOrder
        },
        apiKeyInfo: {
          id: keyId,
          name: apiKeyInfo.name || apiKeyInfo.label || keyId
        },
        summary: {
          ...summary,
          totalCost: Number(summary.totalCost.toFixed(6)),
          avgCost:
            summary.totalRequests > 0
              ? Number((summary.totalCost / summary.totalRequests).toFixed(6))
              : 0
        },
        availableFilters: {
          models: Array.from(modelSet),
          accounts: accountOptions,
          dateRange: {
            earliest: earliestTimestamp ? earliestTimestamp.toISOString() : null,
            latest: latestTimestamp ? latestTimestamp.toISOString() : null
          }
        }
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get API key usage records:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get API key usage records', message: error.message })
  }
})

// 获取账户的请求记录时间线
router.get('/accounts/:accountId/usage-records', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const {
      platform,
      page = 1,
      pageSize = 50,
      startDate,
      endDate,
      model,
      apiKeyId,
      sortOrder = 'desc'
    } = req.query

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1)
    const pageSizeNumber = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const normalizedSortOrder = sortOrder === 'asc' ? 'asc' : 'desc'

    const startTime = startDate ? new Date(startDate) : null
    const endTime = endDate ? new Date(endDate) : null

    if (
      (startDate && Number.isNaN(startTime?.getTime())) ||
      (endDate && Number.isNaN(endTime?.getTime()))
    ) {
      return res.status(400).json({ success: false, error: 'Invalid date range' })
    }

    if (startTime && endTime && startTime > endTime) {
      return res
        .status(400)
        .json({ success: false, error: 'Start date must be before or equal to end date' })
    }

    const accountInfo = await resolveAccountByPlatform(accountId, platform)
    if (!accountInfo) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }

    const allApiKeys = await apiKeyService.getAllApiKeysFast(true)
    const apiKeyNameCache = new Map(
      allApiKeys.map((key) => [key.id, key.name || key.label || key.id])
    )

    let keysToUse = apiKeyId ? allApiKeys.filter((key) => key.id === apiKeyId) : allApiKeys
    if (apiKeyId && keysToUse.length === 0) {
      keysToUse = [{ id: apiKeyId }]
    }

    const toUsageObject = (record) => {
      const usage = {
        input_tokens: record.inputTokens || 0,
        output_tokens: record.outputTokens || 0,
        cache_creation_input_tokens: record.cacheCreateTokens || 0,
        cache_read_input_tokens: record.cacheReadTokens || 0,
        cache_creation: record.cacheCreation || record.cache_creation || null
      }
      // 如果没有 cache_creation 但有独立存储的 ephemeral 字段，构建子对象
      if (!usage.cache_creation) {
        const eph5m = parseInt(record.ephemeral5mTokens) || 0
        const eph1h = parseInt(record.ephemeral1hTokens) || 0
        if (eph5m > 0 || eph1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: eph5m,
            ephemeral_1h_input_tokens: eph1h
          }
        }
      }
      return usage
    }

    const withinRange = (record) => {
      if (!record.timestamp) {
        return false
      }
      const ts = new Date(record.timestamp)
      if (Number.isNaN(ts.getTime())) {
        return false
      }
      if (startTime && ts < startTime) {
        return false
      }
      if (endTime && ts > endTime) {
        return false
      }
      return true
    }

    const filteredRecords = []
    const modelSet = new Set()
    const apiKeyOptionMap = new Map()
    let earliestTimestamp = null
    let latestTimestamp = null

    const batchSize = 10
    for (let i = 0; i < keysToUse.length; i += batchSize) {
      const batch = keysToUse.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const records = await redis.getUsageRecords(key.id, 5000)
            return { keyId: key.id, records: records || [] }
          } catch (error) {
            logger.debug(`⚠️ Failed to get usage records for key ${key.id}: ${error.message}`)
            return { keyId: key.id, records: [] }
          }
        })
      )

      for (const { keyId, records } of batchResults) {
        const apiKeyName = apiKeyNameCache.get(keyId) || (await getApiKeyName(keyId))
        for (const record of records) {
          if (record.accountId !== accountId) {
            continue
          }
          if (!withinRange(record)) {
            continue
          }
          if (model && record.model !== model) {
            continue
          }

          const accountType = record.accountType || accountInfo.platform || 'unknown'
          const normalizedModel = record.model || 'unknown'

          modelSet.add(normalizedModel)
          apiKeyOptionMap.set(keyId, { id: keyId, name: apiKeyName })

          if (record.timestamp) {
            const ts = new Date(record.timestamp)
            if (!Number.isNaN(ts.getTime())) {
              if (!earliestTimestamp || ts < earliestTimestamp) {
                earliestTimestamp = ts
              }
              if (!latestTimestamp || ts > latestTimestamp) {
                latestTimestamp = ts
              }
            }
          }

          filteredRecords.push({
            ...record,
            model: normalizedModel,
            accountType,
            apiKeyId: keyId,
            apiKeyName
          })
        }
      }
    }

    filteredRecords.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime()
      const bTime = new Date(b.timestamp).getTime()
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0
      }
      return normalizedSortOrder === 'asc' ? aTime - bTime : bTime - aTime
    })

    const summary = {
      totalRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0
    }

    for (const record of filteredRecords) {
      const usage = toUsageObject(record)
      const costData = CostCalculator.calculateCost(usage, record.model || 'unknown')
      const computedCost =
        typeof record.cost === 'number' ? record.cost : costData?.costs?.total || 0
      const totalTokens =
        record.totalTokens ||
        usage.input_tokens +
          usage.output_tokens +
          usage.cache_creation_input_tokens +
          usage.cache_read_input_tokens

      summary.totalRequests += 1
      summary.inputTokens += usage.input_tokens
      summary.outputTokens += usage.output_tokens
      summary.cacheCreateTokens += usage.cache_creation_input_tokens
      summary.cacheReadTokens += usage.cache_read_input_tokens
      summary.totalTokens += totalTokens
      summary.totalCost += computedCost
    }

    const totalRecords = filteredRecords.length
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / pageSizeNumber) : 0
    const safePage = totalPages > 0 ? Math.min(pageNumber, totalPages) : 1
    const startIndex = (safePage - 1) * pageSizeNumber
    const pageRecords =
      totalRecords === 0 ? [] : filteredRecords.slice(startIndex, startIndex + pageSizeNumber)

    const enrichedRecords = []
    for (const record of pageRecords) {
      const usage = toUsageObject(record)
      const costData = CostCalculator.calculateCost(usage, record.model || 'unknown')
      const computedCost =
        typeof record.cost === 'number' ? record.cost : costData?.costs?.total || 0
      const realCost =
        typeof record.realCost === 'number' ? record.realCost : costData?.costs?.total || 0
      const totalTokens =
        record.totalTokens ||
        usage.input_tokens +
          usage.output_tokens +
          usage.cache_creation_input_tokens +
          usage.cache_read_input_tokens

      enrichedRecords.push({
        timestamp: record.timestamp,
        model: record.model || 'unknown',
        apiKeyId: record.apiKeyId,
        apiKeyName: record.apiKeyName,
        accountId,
        accountName: accountInfo.name || accountInfo.email || accountId,
        accountType: record.accountType,
        accountTypeName: accountTypeNames[record.accountType] || '未知渠道',
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreateTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        ephemeral5mTokens: record.ephemeral5mTokens || 0,
        ephemeral1hTokens: record.ephemeral1hTokens || 0,
        totalTokens,
        isLongContextRequest: record.isLongContext || record.isLongContextRequest || false,
        cost: Number(computedCost.toFixed(6)),
        costFormatted: CostCalculator.formatCost(computedCost),
        realCost: Number(realCost.toFixed(6)),
        realCostFormatted: CostCalculator.formatCost(realCost),
        costBreakdown: record.realCostBreakdown ||
          record.costBreakdown || {
            input: costData?.costs?.input || 0,
            output: costData?.costs?.output || 0,
            cacheCreate: costData?.costs?.cacheWrite || 0,
            cacheRead: costData?.costs?.cacheRead || 0,
            total: costData?.costs?.total || computedCost
          },
        responseTime: record.responseTime || null
      })
    }

    return res.json({
      success: true,
      data: {
        records: enrichedRecords,
        pagination: {
          currentPage: safePage,
          pageSize: pageSizeNumber,
          totalRecords,
          totalPages,
          hasNextPage: totalPages > 0 && safePage < totalPages,
          hasPreviousPage: totalPages > 0 && safePage > 1
        },
        filters: {
          startDate: startTime ? startTime.toISOString() : null,
          endDate: endTime ? endTime.toISOString() : null,
          model: model || null,
          apiKeyId: apiKeyId || null,
          platform: accountInfo.platform,
          sortOrder: normalizedSortOrder
        },
        accountInfo: {
          id: accountId,
          name: accountInfo.name || accountInfo.email || accountId,
          platform: accountInfo.platform || platform || 'unknown',
          status: accountInfo.status ?? accountInfo.isActive ?? null
        },
        summary: {
          ...summary,
          totalCost: Number(summary.totalCost.toFixed(6)),
          avgCost:
            summary.totalRequests > 0
              ? Number((summary.totalCost / summary.totalRequests).toFixed(6))
              : 0
        },
        availableFilters: {
          models: Array.from(modelSet),
          apiKeys: Array.from(apiKeyOptionMap.values()),
          dateRange: {
            earliest: earliestTimestamp ? earliestTimestamp.toISOString() : null,
            latest: latestTimestamp ? latestTimestamp.toISOString() : null
          }
        }
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage records:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get account usage records', message: error.message })
  }
})

module.exports = router
