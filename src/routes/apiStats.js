const express = require('express')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('../services/apiKeyService')
const CostCalculator = require('../utils/costCalculator')
const claudeAccountService = require('../services/account/claudeAccountService')
const openaiAccountService = require('../services/account/openaiAccountService')
const serviceRatesService = require('../services/serviceRatesService')
const {
  createClaudeTestPayload,
  extractErrorMessage,
  sanitizeErrorMsg
} = require('../utils/testPayloadHelper')
const modelsConfig = require('../../config/models')
const { getSafeMessage } = require('../utils/errorSanitizer')

const router = express.Router()

// 📋 获取可用模型列表（公开接口）
router.get('/models', (req, res) => {
  const { service } = req.query

  if (service) {
    // 返回指定服务的模型
    const models = modelsConfig.getModelsByService(service)
    return res.json({
      success: true,
      data: models
    })
  }

  // 返回所有模型（按服务分组 + 平台维度）
  res.json({
    success: true,
    data: {
      claude: modelsConfig.CLAUDE_MODELS,
      gemini: modelsConfig.GEMINI_MODELS,
      openai: modelsConfig.OPENAI_MODELS,
      other: modelsConfig.OTHER_MODELS,
      all: modelsConfig.getAllModels(),
      platforms: modelsConfig.PLATFORM_TEST_MODELS
    }
  })
})

// 🏠 重定向页面请求到新版 admin-spa
router.get('/', (req, res) => {
  res.redirect(301, '/admin-next/api-stats')
})

// 🔑 获取 API Key 对应的 ID
router.post('/api/get-key-id', async (req, res) => {
  try {
    const { apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    // 基本API Key格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    // 验证API Key（使用不触发激活的验证方法）
    const validation = await apiKeyService.validateApiKeyForStats(apiKey)

    if (!validation.valid) {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      logger.security(`Invalid API key in get-key-id: ${validation.error} from ${clientIP}`)
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    const { keyData } = validation

    return res.json({
      success: true,
      data: {
        id: keyData.id
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get API key ID:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key ID'
    })
  }
})

// 📊 用户API Key统计查询接口 - 安全的自查询接口
router.post('/api/user-stats', async (req, res) => {
  try {
    const { apiKey, apiId } = req.body

    let keyData
    let keyId

    if (apiId) {
      // 通过 apiId 查询
      if (
        typeof apiId !== 'string' ||
        !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      ) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        })
      }

      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId)

      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        })
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        const keyName = keyData.name || 'Unknown'
        return res.status(403).json({
          error: 'API key is disabled',
          message: `API Key "${keyName}" 已被禁用`,
          keyName
        })
      }

      // 检查是否过期
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        const keyName = keyData.name || 'Unknown'
        return res.status(403).json({
          error: 'API key has expired',
          message: `API Key "${keyName}" 已过期`,
          keyName
        })
      }

      keyId = apiId

      // 获取使用统计
      const usage = await redis.getUsageStats(keyId)

      // 获取当日费用统计
      const dailyCost = await redis.getDailyCost(keyId)
      const costStats = await redis.getCostStats(keyId)

      // 处理数据格式，与 validateApiKey 返回的格式保持一致
      // 解析限制模型数据
      let restrictedModels = []
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : []
      } catch (e) {
        restrictedModels = []
      }

      // 解析允许的客户端数据
      let allowedClients = []
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : []
      } catch (e) {
        allowedClients = []
      }

      // 格式化 keyData
      keyData = {
        ...keyData,
        tokenLimit: parseInt(keyData.tokenLimit) || 0,
        concurrencyLimit: parseInt(keyData.concurrencyLimit) || 0,
        rateLimitWindow: parseInt(keyData.rateLimitWindow) || 0,
        rateLimitRequests: parseInt(keyData.rateLimitRequests) || 0,
        dailyCostLimit: parseFloat(keyData.dailyCostLimit) || 0,
        totalCostLimit: parseFloat(keyData.totalCostLimit) || 0,
        dailyCost: dailyCost || 0,
        totalCost: costStats.total || 0,
        enableModelRestriction: keyData.enableModelRestriction === 'true',
        restrictedModels,
        enableClientRestriction: keyData.enableClientRestriction === 'true',
        allowedClients,
        permissions: keyData.permissions,
        // 添加激活相关字段
        expirationMode: keyData.expirationMode || 'fixed',
        isActivated: keyData.isActivated === 'true',
        activationDays: parseInt(keyData.activationDays || 0),
        activatedAt: keyData.activatedAt || null,
        usage // 使用完整的 usage 数据，而不是只有 total
      }
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
        logger.security(`Invalid API key format in user stats query from ${req.ip || 'unknown'}`)
        return res.status(400).json({
          error: 'Invalid API key format',
          message: 'API key format is invalid'
        })
      }

      // 验证API Key（使用不触发激活的验证方法）
      const validation = await apiKeyService.validateApiKeyForStats(apiKey)

      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
        logger.security(
          `🔒 Invalid API key in user stats query: ${validation.error} from ${clientIP}`
        )
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        })
      }

      const { keyData: validatedKeyData } = validation
      keyData = validatedKeyData
      keyId = keyData.id
    } else {
      logger.security(`Missing API key or ID in user stats query from ${req.ip || 'unknown'}`)
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      })
    }

    // 记录合法查询
    logger.api(
      `📊 User stats query from key: ${keyData.name} (${keyId}) from ${req.ip || 'unknown'}`
    )

    // 获取验证结果中的完整keyData（包含isActive状态和cost信息）
    const fullKeyData = keyData

    // 🔧 FIX: 使用 allTimeCost 而不是扫描月度键
    // 计算总费用 - 优先使用持久化的总费用计数器
    let totalCost = 0
    let formattedCost = '$0.000000'

    try {
      const client = redis.getClientSafe()

      // 读取累积的总费用（没有 TTL 的持久键）
      const totalCostKey = `usage:cost:total:${keyId}`
      const allTimeCost = parseFloat((await client.get(totalCostKey)) || '0')

      if (allTimeCost > 0) {
        totalCost = allTimeCost
        formattedCost = CostCalculator.formatCost(allTimeCost)
        logger.debug(`📊 使用 allTimeCost 计算用户统计: ${allTimeCost}`)
      } else {
        // Fallback: 如果 allTimeCost 为空（旧键），尝试月度键
        const allModelResults = await redis.scanAndGetAllChunked(`usage:${keyId}:model:monthly:*:*`)
        const modelUsageMap = new Map()

        for (const { key, data } of allModelResults) {
          const modelMatch = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]

          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(model)) {
              modelUsageMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0,
                ephemeral5mTokens: 0,
                ephemeral1hTokens: 0,
                realCostMicro: 0,
                ratedCostMicro: 0,
                hasStoredCost: false
              })
            }

            const modelUsage = modelUsageMap.get(model)
            modelUsage.inputTokens += parseInt(data.inputTokens) || 0
            modelUsage.outputTokens += parseInt(data.outputTokens) || 0
            modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
            modelUsage.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
            modelUsage.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
            if ('realCostMicro' in data || 'ratedCostMicro' in data) {
              modelUsage.realCostMicro += parseInt(data.realCostMicro) || 0
              modelUsage.ratedCostMicro += parseInt(data.ratedCostMicro) || 0
              modelUsage.hasStoredCost = true
            }
          }
        }

        // 按模型计算费用并汇总
        for (const [model, usage] of modelUsageMap) {
          if (usage.hasStoredCost) {
            // 使用请求时已存储的费用（精确）
            totalCost += usage.ratedCostMicro / 1000000
          } else {
            // Legacy fallback：旧数据没有存储费用，从 token 重算
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
            totalCost += costResult.costs.total
          }
        }

        // 如果没有模型级别的详细数据，回退到总体数据计算
        if (modelUsageMap.size === 0 && fullKeyData.usage?.total?.allTokens > 0) {
          const usage = fullKeyData.usage.total
          const costUsage = {
            input_tokens: usage.inputTokens || 0,
            output_tokens: usage.outputTokens || 0,
            cache_creation_input_tokens: usage.cacheCreateTokens || 0,
            cache_read_input_tokens: usage.cacheReadTokens || 0
          }

          // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
          if (usage.ephemeral5mTokens > 0 || usage.ephemeral1hTokens > 0) {
            costUsage.cache_creation = {
              ephemeral_5m_input_tokens: usage.ephemeral5mTokens,
              ephemeral_1h_input_tokens: usage.ephemeral1hTokens
            }
          }

          const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022')
          totalCost = costResult.costs.total
        }

        formattedCost = CostCalculator.formatCost(totalCost)
      }
    } catch (error) {
      logger.warn(`Failed to calculate cost for key ${keyId}:`, error)
      // 回退到简单计算
      if (fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
        }

        // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
        if (usage.ephemeral5mTokens > 0 || usage.ephemeral1hTokens > 0) {
          costUsage.cache_creation = {
            ephemeral_5m_input_tokens: usage.ephemeral5mTokens,
            ephemeral_1h_input_tokens: usage.ephemeral1hTokens
          }
        }

        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022')
        totalCost = costResult.costs.total
        formattedCost = costResult.formatted.total
      }
    }

    // 获取当前使用量
    let currentWindowRequests = 0
    let currentWindowTokens = 0
    let currentWindowCost = 0 // 新增：当前窗口费用
    let currentDailyCost = 0
    let windowStartTime = null
    let windowEndTime = null
    let windowRemainingSeconds = null

    try {
      // 获取当前时间窗口的请求次数、Token使用量和费用
      if (fullKeyData.rateLimitWindow > 0) {
        const client = redis.getClientSafe()
        const requestCountKey = `rate_limit:requests:${keyId}`
        const tokenCountKey = `rate_limit:tokens:${keyId}`
        const costCountKey = `rate_limit:cost:${keyId}` // 新增：费用计数key
        const windowStartKey = `rate_limit:window_start:${keyId}`

        currentWindowRequests = parseInt((await client.get(requestCountKey)) || '0')
        currentWindowTokens = parseInt((await client.get(tokenCountKey)) || '0')
        currentWindowCost = parseFloat((await client.get(costCountKey)) || '0') // 新增：获取当前窗口费用

        // 获取窗口开始时间和计算剩余时间
        const windowStart = await client.get(windowStartKey)
        if (windowStart) {
          const now = Date.now()
          windowStartTime = parseInt(windowStart)
          const windowDuration = fullKeyData.rateLimitWindow * 60 * 1000 // 转换为毫秒
          windowEndTime = windowStartTime + windowDuration

          // 如果窗口还有效
          if (now < windowEndTime) {
            windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
          } else {
            // 窗口已过期，下次请求会重置
            windowStartTime = null
            windowEndTime = null
            windowRemainingSeconds = 0
            // 重置计数为0，因为窗口已过期
            currentWindowRequests = 0
            currentWindowTokens = 0
            currentWindowCost = 0 // 新增：重置窗口费用
          }
        }
      }

      // 获取当日费用
      currentDailyCost = (await redis.getDailyCost(keyId)) || 0
    } catch (error) {
      logger.warn(`Failed to get current usage for key ${keyId}:`, error)
    }

    const boundAccountDetails = {}

    const accountDetailTasks = []

    if (fullKeyData.claudeAccountId) {
      accountDetailTasks.push(
        (async () => {
          try {
            const overview = await claudeAccountService.getAccountOverview(
              fullKeyData.claudeAccountId
            )

            if (overview && overview.accountType === 'dedicated') {
              boundAccountDetails.claude = overview
            }
          } catch (error) {
            logger.warn(`⚠️ Failed to load Claude account overview for key ${keyId}:`, error)
          }
        })()
      )
    }

    if (fullKeyData.openaiAccountId) {
      accountDetailTasks.push(
        (async () => {
          try {
            const overview = await openaiAccountService.getAccountOverview(
              fullKeyData.openaiAccountId
            )

            if (overview && overview.accountType === 'dedicated') {
              boundAccountDetails.openai = overview
            }
          } catch (error) {
            logger.warn(`⚠️ Failed to load OpenAI account overview for key ${keyId}:`, error)
          }
        })()
      )
    }

    if (accountDetailTasks.length > 0) {
      await Promise.allSettled(accountDetailTasks)
    }

    // 构建响应数据（只返回该API Key自己的信息，确保不泄露其他信息）
    const responseData = {
      id: keyId,
      name: fullKeyData.name,
      description: fullKeyData.description || keyData.description || '',
      isActive: true, // 如果能通过validateApiKey验证，说明一定是激活的
      createdAt: fullKeyData.createdAt || keyData.createdAt,
      expiresAt: fullKeyData.expiresAt || keyData.expiresAt,
      // 添加激活相关字段
      expirationMode: fullKeyData.expirationMode || 'fixed',
      isActivated: fullKeyData.isActivated === true || fullKeyData.isActivated === 'true',
      activationDays: parseInt(fullKeyData.activationDays || 0),
      activatedAt: fullKeyData.activatedAt || null,
      permissions: fullKeyData.permissions,

      // 使用统计（使用验证结果中的完整数据）
      usage: {
        total: {
          ...(fullKeyData.usage?.total || {
            requests: 0,
            tokens: 0,
            allTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0
          }),
          cost: totalCost,
          formattedCost
        }
      },

      // 限制信息（显示配置和当前使用量）
      limits: {
        tokenLimit: fullKeyData.tokenLimit || 0,
        concurrencyLimit: fullKeyData.concurrencyLimit || 0,
        rateLimitWindow: fullKeyData.rateLimitWindow || 0,
        rateLimitRequests: fullKeyData.rateLimitRequests || 0,
        rateLimitCost: parseFloat(fullKeyData.rateLimitCost) || 0, // 新增：费用限制
        dailyCostLimit: fullKeyData.dailyCostLimit || 0,
        totalCostLimit: fullKeyData.totalCostLimit || 0,
        weeklyOpusCostLimit: parseFloat(fullKeyData.weeklyOpusCostLimit) || 0, // Opus 周费用限制
        weeklyResetDay: parseInt(fullKeyData.weeklyResetDay) || 1, // 周费用重置日 (1-7)
        weeklyResetHour: parseInt(fullKeyData.weeklyResetHour) || 0, // 周费用重置时 (0-23)
        // 当前使用量
        currentWindowRequests,
        currentWindowTokens,
        currentWindowCost, // 新增：当前窗口费用
        currentDailyCost,
        currentTotalCost: totalCost,
        weeklyOpusCost:
          (await redis.getWeeklyOpusCost(
            keyId,
            parseInt(fullKeyData.weeklyResetDay) || 1,
            parseInt(fullKeyData.weeklyResetHour) || 0
          )) || 0, // 当前 Opus 周费用
        // 时间窗口信息
        windowStartTime,
        windowEndTime,
        windowRemainingSeconds
      },

      // 绑定的账户信息（只显示ID，不显示敏感信息）
      accounts: {
        claudeAccountId:
          fullKeyData.claudeAccountId && fullKeyData.claudeAccountId !== ''
            ? fullKeyData.claudeAccountId
            : null,
        geminiAccountId:
          fullKeyData.geminiAccountId && fullKeyData.geminiAccountId !== ''
            ? fullKeyData.geminiAccountId
            : null,
        openaiAccountId:
          fullKeyData.openaiAccountId && fullKeyData.openaiAccountId !== ''
            ? fullKeyData.openaiAccountId
            : null,
        details: Object.keys(boundAccountDetails).length > 0 ? boundAccountDetails : null
      },

      // 模型和客户端限制信息
      restrictions: {
        enableModelRestriction: fullKeyData.enableModelRestriction || false,
        restrictedModels: fullKeyData.restrictedModels || [],
        enableClientRestriction: fullKeyData.enableClientRestriction || false,
        allowedClients: fullKeyData.allowedClients || []
      },

      // Key 级别的服务倍率
      serviceRates: (() => {
        try {
          return fullKeyData.serviceRates
            ? typeof fullKeyData.serviceRates === 'string'
              ? JSON.parse(fullKeyData.serviceRates)
              : fullKeyData.serviceRates
            : {}
        } catch (e) {
          return {}
        }
      })()
    }

    return res.json({
      success: true,
      data: responseData
    })
  } catch (error) {
    logger.error('❌ Failed to process user stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key statistics'
    })
  }
})

// 📊 批量查询统计数据接口
router.post('/api/batch-stats', async (req, res) => {
  try {
    const { apiIds } = req.body

    // 验证输入
    if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'API IDs array is required'
      })
    }

    // 限制最多查询 30 个
    if (apiIds.length > 30) {
      return res.status(400).json({
        error: 'Too many keys',
        message: 'Maximum 30 API keys can be queried at once'
      })
    }

    // 验证所有 ID 格式
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
    const invalidIds = apiIds.filter((id) => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: 'Invalid API ID format',
        message: `Invalid API IDs: ${invalidIds.join(', ')}`
      })
    }

    const individualStats = []
    const aggregated = {
      totalKeys: apiIds.length,
      activeKeys: 0,
      usage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      },
      dailyUsage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      },
      monthlyUsage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      }
    }

    // 并行查询所有 API Key 数据（复用单key查询逻辑）
    const results = await Promise.allSettled(
      apiIds.map(async (apiId) => {
        const keyData = await redis.getApiKey(apiId)

        if (!keyData || Object.keys(keyData).length === 0) {
          return { error: 'Not found', apiId }
        }

        // 检查是否激活
        if (keyData.isActive !== 'true') {
          return { error: 'Disabled', apiId }
        }

        // 检查是否过期
        if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
          return { error: 'Expired', apiId }
        }

        // 复用单key查询的逻辑：获取使用统计
        const usage = await redis.getUsageStats(apiId)

        // 获取费用统计（与单key查询一致）
        const costStats = await redis.getCostStats(apiId)

        return {
          apiId,
          name: keyData.name,
          description: keyData.description || '',
          isActive: true,
          createdAt: keyData.createdAt,
          usage: usage.total || {},
          dailyStats: {
            ...usage.daily,
            cost: costStats.daily
          },
          monthlyStats: {
            ...usage.monthly,
            cost: costStats.monthly
          },
          totalCost: costStats.total,
          serviceRates: (() => {
            try {
              return keyData.serviceRates
                ? typeof keyData.serviceRates === 'string'
                  ? JSON.parse(keyData.serviceRates)
                  : keyData.serviceRates
                : {}
            } catch (e) {
              return {}
            }
          })()
        }
      })
    )

    // 处理结果并聚合
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value && !result.value.error) {
        const stats = result.value
        aggregated.activeKeys++

        // 聚合总使用量
        if (stats.usage) {
          aggregated.usage.requests += stats.usage.requests || 0
          aggregated.usage.inputTokens += stats.usage.inputTokens || 0
          aggregated.usage.outputTokens += stats.usage.outputTokens || 0
          aggregated.usage.cacheCreateTokens += stats.usage.cacheCreateTokens || 0
          aggregated.usage.cacheReadTokens += stats.usage.cacheReadTokens || 0
          aggregated.usage.allTokens += stats.usage.allTokens || 0
        }

        // 聚合总费用
        aggregated.usage.cost += stats.totalCost || 0

        // 聚合今日使用量
        aggregated.dailyUsage.requests += stats.dailyStats.requests || 0
        aggregated.dailyUsage.inputTokens += stats.dailyStats.inputTokens || 0
        aggregated.dailyUsage.outputTokens += stats.dailyStats.outputTokens || 0
        aggregated.dailyUsage.cacheCreateTokens += stats.dailyStats.cacheCreateTokens || 0
        aggregated.dailyUsage.cacheReadTokens += stats.dailyStats.cacheReadTokens || 0
        aggregated.dailyUsage.allTokens += stats.dailyStats.allTokens || 0
        aggregated.dailyUsage.cost += stats.dailyStats.cost || 0

        // 聚合本月使用量
        aggregated.monthlyUsage.requests += stats.monthlyStats.requests || 0
        aggregated.monthlyUsage.inputTokens += stats.monthlyStats.inputTokens || 0
        aggregated.monthlyUsage.outputTokens += stats.monthlyStats.outputTokens || 0
        aggregated.monthlyUsage.cacheCreateTokens += stats.monthlyStats.cacheCreateTokens || 0
        aggregated.monthlyUsage.cacheReadTokens += stats.monthlyStats.cacheReadTokens || 0
        aggregated.monthlyUsage.allTokens += stats.monthlyStats.allTokens || 0
        aggregated.monthlyUsage.cost += stats.monthlyStats.cost || 0

        // 添加到个体统计
        individualStats.push({
          apiId: stats.apiId,
          name: stats.name,
          isActive: true,
          usage: stats.usage,
          dailyUsage: {
            ...stats.dailyStats,
            formattedCost: CostCalculator.formatCost(stats.dailyStats.cost || 0)
          },
          monthlyUsage: {
            ...stats.monthlyStats,
            formattedCost: CostCalculator.formatCost(stats.monthlyStats.cost || 0)
          }
        })
      }
    })

    // 格式化费用显示
    aggregated.usage.formattedCost = CostCalculator.formatCost(aggregated.usage.cost)
    aggregated.dailyUsage.formattedCost = CostCalculator.formatCost(aggregated.dailyUsage.cost)
    aggregated.monthlyUsage.formattedCost = CostCalculator.formatCost(aggregated.monthlyUsage.cost)

    logger.api(`📊 Batch stats query for ${apiIds.length} keys from ${req.ip || 'unknown'}`)

    return res.json({
      success: true,
      data: {
        aggregated,
        individual: individualStats
      }
    })
  } catch (error) {
    logger.error('❌ Failed to process batch stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve batch statistics'
    })
  }
})

// 📊 批量模型统计查询接口
router.post('/api/batch-model-stats', async (req, res) => {
  try {
    const { apiIds, period = 'daily' } = req.body

    // 验证输入
    if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'API IDs array is required'
      })
    }

    // 限制最多查询 30 个
    if (apiIds.length > 30) {
      return res.status(400).json({
        error: 'Too many keys',
        message: 'Maximum 30 API keys can be queried at once'
      })
    }

    const _client = redis.getClientSafe()
    const tzDate = redis.getDateInTimezone()
    const today = redis.getDateStringInTimezone()
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`

    const modelUsageMap = new Map()

    // 并行查询所有 API Key 的模型统计
    await Promise.all(
      apiIds.map(async (apiId) => {
        const pattern =
          period === 'daily'
            ? `usage:${apiId}:model:daily:*:${today}`
            : `usage:${apiId}:model:monthly:*:${currentMonth}`

        const results = await redis.scanAndGetAllChunked(pattern)

        for (const { key, data } of results) {
          const match = key.match(
            period === 'daily'
              ? /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
              : /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
          )

          if (!match) {
            continue
          }

          const model = match[1]

          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(model)) {
              modelUsageMap.set(model, {
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

            const modelUsage = modelUsageMap.get(model)
            modelUsage.requests += parseInt(data.requests) || 0
            modelUsage.inputTokens += parseInt(data.inputTokens) || 0
            modelUsage.outputTokens += parseInt(data.outputTokens) || 0
            modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
            modelUsage.ephemeral5mTokens += parseInt(data.ephemeral5mTokens) || 0
            modelUsage.ephemeral1hTokens += parseInt(data.ephemeral1hTokens) || 0
            modelUsage.allTokens += parseInt(data.allTokens) || 0
            modelUsage.realCostMicro += parseInt(data.realCostMicro) || 0
            modelUsage.ratedCostMicro += parseInt(data.ratedCostMicro) || 0
            // 检查 Redis 数据是否包含成本字段
            if ('realCostMicro' in data || 'ratedCostMicro' in data) {
              modelUsage.hasStoredCost = true
            }
          }
        }
      })
    )

    // 转换为数组并处理费用
    const modelStats = []
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

      // 优先使用存储的费用，否则回退到重新计算
      const { hasStoredCost } = usage
      const costData = CostCalculator.calculateCost(usageData, model)

      // 如果有存储的费用，覆盖计算的费用
      if (hasStoredCost) {
        costData.costs.real = (usage.realCostMicro || 0) / 1000000
        costData.costs.rated = (usage.ratedCostMicro || 0) / 1000000
        costData.costs.total = costData.costs.real // 保持兼容
        costData.formatted.total = `$${costData.costs.real.toFixed(6)}`
      }

      modelStats.push({
        model,
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreateTokens: usage.cacheCreateTokens,
        cacheReadTokens: usage.cacheReadTokens,
        allTokens: usage.allTokens,
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing,
        isLegacy: !hasStoredCost
      })
    }

    // 按总 token 数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens)

    logger.api(`📊 Batch model stats query for ${apiIds.length} keys, period: ${period}`)

    return res.json({
      success: true,
      data: modelStats,
      period
    })
  } catch (error) {
    logger.error('❌ Failed to process batch model stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve batch model statistics'
    })
  }
})

// maxTokens 白名单
const ALLOWED_MAX_TOKENS = [100, 500, 1000, 2000, 4096]
const sanitizeMaxTokens = (value) =>
  ALLOWED_MAX_TOKENS.includes(Number(value)) ? Number(value) : 1000

// 🧪 API Key 端点测试接口 - 测试API Key是否能正常访问服务
router.post('/api-key/test', async (req, res) => {
  const config = require('../../config/config')
  const { sendStreamTestRequest } = require('../utils/testPayloadHelper')

  try {
    const { apiKey, model = 'claude-sonnet-4-5-20250929', prompt = 'hi' } = req.body
    const maxTokens = sanitizeMaxTokens(req.body.maxTokens)

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    logger.api(`🧪 API Key test started for: ${validation.keyData.name} (${validation.keyData.id})`)

    const port = config.server.port || 3000
    const apiUrl = `http://127.0.0.1:${port}/api/v1/messages?beta=true`

    await sendStreamTestRequest({
      apiUrl,
      authorization: apiKey,
      responseStream: res,
      payload: createClaudeTestPayload(model, { stream: true, prompt, maxTokens }),
      timeout: 60000,
      extraHeaders: {
        'x-api-key': apiKey,
        'x-app': 'claude-code',
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14'
      },
      sanitize: false
    })
  } catch (error) {
    logger.error('❌ API Key test failed:', error)

    const errorMsg = error.message || 'An unexpected error occurred'
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Test failed',
        message: errorMsg
      })
    }

    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
    res.end()
  }
})

// 🧪 Gemini API Key 端点测试接口
router.post('/api-key/test-gemini', async (req, res) => {
  const config = require('../../config/config')
  const { createGeminiTestPayload } = require('../utils/testPayloadHelper')

  try {
    const { apiKey, model = 'gemini-2.5-pro', prompt = 'hi' } = req.body
    const maxTokens = sanitizeMaxTokens(req.body.maxTokens)

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    // 检查 Gemini 权限
    if (!apiKeyService.hasPermission(validation.keyData.permissions, 'gemini')) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'This API key does not have Gemini permission'
      })
    }

    logger.api(
      `🧪 Gemini API Key test started for: ${validation.keyData.name} (${validation.keyData.id})`
    )

    const port = config.server.port || 3000
    const apiUrl = `http://127.0.0.1:${port}/gemini/v1/models/${model}:streamGenerateContent?alt=sse`

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })

    res.write(`data: ${JSON.stringify({ type: 'test_start', message: 'Test started' })}\n\n`)

    const axios = require('axios')
    const payload = createGeminiTestPayload(model, { prompt, maxTokens })

    try {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        timeout: 60000,
        responseType: 'stream',
        validateStatus: () => true
      })

      if (response.status !== 200) {
        const chunks = []
        response.data.on('data', (chunk) => chunks.push(chunk))
        response.data.on('end', () => {
          const errorData = Buffer.concat(chunks).toString()
          let errorMsg = `API Error: ${response.status}`
          try {
            const json = JSON.parse(errorData)
            errorMsg = extractErrorMessage(json, errorMsg)
          } catch {
            if (errorData.length < 200) {
              errorMsg = errorData || errorMsg
            }
          }
          res.write(
            `data: ${JSON.stringify({ type: 'test_complete', success: false, error: sanitizeErrorMsg(errorMsg) })}\n\n`
          )
          res.end()
        })
        return
      }

      let buffer = ''
      response.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue
          }
          const jsonStr = line.substring(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') {
            continue
          }

          try {
            const data = JSON.parse(jsonStr)
            // Gemini 格式: candidates[0].content.parts[0].text
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              res.write(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
            }
          } catch {
            // ignore
          }
        }
      })

      response.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'test_complete', success: true })}\n\n`)
        res.end()
      })

      response.data.on('error', (err) => {
        res.write(
          `data: ${JSON.stringify({ type: 'test_complete', success: false, error: getSafeMessage(err) })}\n\n`
        )
        res.end()
      })
    } catch (axiosError) {
      res.write(
        `data: ${JSON.stringify({ type: 'test_complete', success: false, error: getSafeMessage(axiosError) })}\n\n`
      )
      res.end()
    }
  } catch (error) {
    logger.error('❌ Gemini API Key test failed:', error)

    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Test failed',
        message: getSafeMessage(error)
      })
    }

    res.write(`data: ${JSON.stringify({ type: 'error', error: getSafeMessage(error) })}\n\n`)
    res.end()
  }
})

// 🧪 OpenAI/Codex API Key 端点测试接口
router.post('/api-key/test-openai', async (req, res) => {
  const config = require('../../config/config')
  const { createOpenAITestPayload } = require('../utils/testPayloadHelper')

  try {
    const { apiKey, model = 'gpt-5', prompt = 'hi' } = req.body
    const maxTokens = sanitizeMaxTokens(req.body.maxTokens)

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    // 检查 OpenAI 权限
    if (!apiKeyService.hasPermission(validation.keyData.permissions, 'openai')) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'This API key does not have OpenAI permission'
      })
    }

    logger.api(
      `🧪 OpenAI API Key test started for: ${validation.keyData.name} (${validation.keyData.id})`
    )

    const port = config.server.port || 3000
    const apiUrl = `http://127.0.0.1:${port}/openai/responses`

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })

    res.write(`data: ${JSON.stringify({ type: 'test_start', message: 'Test started' })}\n\n`)

    const axios = require('axios')
    const payload = createOpenAITestPayload(model, { prompt, maxTokens })

    try {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'User-Agent': 'codex_cli_rs/1.0.0'
        },
        timeout: 60000,
        responseType: 'stream',
        validateStatus: () => true
      })

      if (response.status !== 200) {
        const chunks = []
        response.data.on('data', (chunk) => chunks.push(chunk))
        response.data.on('end', () => {
          const errorData = Buffer.concat(chunks).toString()
          let errorMsg = `API Error: ${response.status}`
          try {
            const json = JSON.parse(errorData)
            errorMsg = extractErrorMessage(json, errorMsg)
          } catch {
            if (errorData.length < 200) {
              errorMsg = errorData || errorMsg
            }
          }
          res.write(
            `data: ${JSON.stringify({ type: 'test_complete', success: false, error: sanitizeErrorMsg(errorMsg) })}\n\n`
          )
          res.end()
        })
        return
      }

      let buffer = ''
      response.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue
          }
          const jsonStr = line.substring(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') {
            continue
          }

          try {
            const data = JSON.parse(jsonStr)
            // OpenAI Responses 格式: output[].content[].text 或 delta
            if (data.type === 'response.output_text.delta' && data.delta) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: data.delta })}\n\n`)
            } else if (data.type === 'response.content_part.delta' && data.delta?.text) {
              res.write(`data: ${JSON.stringify({ type: 'content', text: data.delta.text })}\n\n`)
            }
          } catch {
            // ignore
          }
        }
      })

      response.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'test_complete', success: true })}\n\n`)
        res.end()
      })

      response.data.on('error', (err) => {
        res.write(
          `data: ${JSON.stringify({ type: 'test_complete', success: false, error: getSafeMessage(err) })}\n\n`
        )
        res.end()
      })
    } catch (axiosError) {
      res.write(
        `data: ${JSON.stringify({ type: 'test_complete', success: false, error: getSafeMessage(axiosError) })}\n\n`
      )
      res.end()
    }
  } catch (error) {
    logger.error('❌ OpenAI API Key test failed:', error)

    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Test failed',
        message: getSafeMessage(error)
      })
    }

    res.write(`data: ${JSON.stringify({ type: 'error', error: getSafeMessage(error) })}\n\n`)
    res.end()
  }
})

// 📊 用户模型统计查询接口 - 安全的自查询接口
router.post('/api/user-model-stats', async (req, res) => {
  try {
    const { apiKey, apiId, period = 'monthly' } = req.body

    let keyData
    let keyId

    if (apiId) {
      // 通过 apiId 查询
      if (
        typeof apiId !== 'string' ||
        !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      ) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        })
      }

      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId)

      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        })
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        const keyName = keyData.name || 'Unknown'
        return res.status(403).json({
          error: 'API key is disabled',
          message: `API Key "${keyName}" 已被禁用`,
          keyName
        })
      }

      keyId = apiId

      // 获取使用统计
      const usage = await redis.getUsageStats(keyId)
      keyData.usage = { total: usage.total }
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      // 验证API Key
      const validation = await apiKeyService.validateApiKey(apiKey)

      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
        logger.security(
          `🔒 Invalid API key in user model stats query: ${validation.error} from ${clientIP}`
        )
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        })
      }

      const { keyData: validatedKeyData } = validation
      keyData = validatedKeyData
      keyId = keyData.id
    } else {
      logger.security(
        `🔒 Missing API key or ID in user model stats query from ${req.ip || 'unknown'}`
      )
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      })
    }

    logger.api(
      `📊 User model stats query from key: ${keyData.name} (${keyId}) for period: ${period}`
    )

    // 重用管理后台的模型统计逻辑，但只返回该API Key的数据
    const _client = redis.getClientSafe()
    // 使用与管理页面相同的时区处理逻辑
    const tzDate = redis.getDateInTimezone()
    const today = redis.getDateStringInTimezone()
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`

    let pattern
    let matchRegex
    if (period === 'daily') {
      pattern = `usage:${keyId}:model:daily:*:${today}`
      matchRegex = /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
    } else if (period === 'alltime') {
      pattern = `usage:${keyId}:model:alltime:*`
      matchRegex = /usage:.+:model:alltime:(.+)$/
    } else {
      // monthly
      pattern = `usage:${keyId}:model:monthly:*:${currentMonth}`
      matchRegex = /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
    }

    const results = await redis.scanAndGetAllChunked(pattern)
    const modelStats = []

    for (const { key, data } of results) {
      const match = key.match(matchRegex)

      if (!match) {
        continue
      }

      const model = match[1]

      if (data && Object.keys(data).length > 0) {
        const ephemeral5m = parseInt(data.ephemeral5mTokens) || 0
        const ephemeral1h = parseInt(data.ephemeral1hTokens) || 0
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        }

        // 如果有 ephemeral 5m/1h 拆分数据，添加 cache_creation 子对象以实现精确计费
        if (ephemeral5m > 0 || ephemeral1h > 0) {
          usage.cache_creation = {
            ephemeral_5m_input_tokens: ephemeral5m,
            ephemeral_1h_input_tokens: ephemeral1h
          }
        }

        // 优先使用存储的费用，否则回退到重新计算
        // 检查字段是否存在（而非 > 0），以支持真正的零成本场景
        const realCostMicro = parseInt(data.realCostMicro) || 0
        const ratedCostMicro = parseInt(data.ratedCostMicro) || 0
        const hasStoredCost = 'realCostMicro' in data || 'ratedCostMicro' in data
        const costData = CostCalculator.calculateCost(usage, model)

        // 如果有存储的费用，覆盖计算的费用
        if (hasStoredCost) {
          costData.costs.real = realCostMicro / 1000000
          costData.costs.rated = ratedCostMicro / 1000000
          costData.costs.total = costData.costs.real
          costData.formatted.total = `$${costData.costs.real.toFixed(6)}`
        }

        // alltime 键不存储 allTokens，需要计算
        const allTokens =
          period === 'alltime'
            ? usage.input_tokens +
              usage.output_tokens +
              usage.cache_creation_input_tokens +
              usage.cache_read_input_tokens
            : parseInt(data.allTokens) || 0

        modelStats.push({
          model,
          requests: parseInt(data.requests) || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          allTokens,
          costs: costData.costs,
          formatted: costData.formatted,
          pricing: costData.pricing,
          isLegacy: !hasStoredCost
        })
      }
    }

    // 如果没有详细的模型数据，不显示历史数据以避免混淆
    // 只有在查询特定时间段时返回空数组，表示该时间段确实没有数据
    if (modelStats.length === 0) {
      logger.info(`📊 No model stats found for key ${keyId} in period ${period}`)
    }

    // 按总token数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens)

    return res.json({
      success: true,
      data: modelStats,
      period
    })
  } catch (error) {
    logger.error('❌ Failed to process user model stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve model statistics'
    })
  }
})

// 📊 获取服务倍率配置（公开接口）
router.get('/service-rates', async (req, res) => {
  try {
    const rates = await serviceRatesService.getRates()
    res.json({
      success: true,
      data: rates
    })
  } catch (error) {
    logger.error('❌ Failed to get service rates:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve service rates'
    })
  }
})

// 🎫 公开的额度卡兑换接口（通过 apiId 验证身份）
router.post('/api/redeem-card', async (req, res) => {
  const quotaCardService = require('../services/quotaCardService')

  try {
    const { apiId, code } = req.body
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
    const hour = new Date().toISOString().slice(0, 13)

    // 防暴力破解：检查失败锁定
    const failKey = `redeem_card:fail:${clientIP}`
    const failCount = parseInt((await redis.client.get(failKey)) || '0')
    if (failCount >= 5) {
      logger.security(`🔒 Card redemption locked for IP: ${clientIP}`)
      return res.status(403).json({
        success: false,
        error: '失败次数过多，请1小时后再试'
      })
    }

    // 防暴力破解：检查 IP 速率限制
    const ipKey = `redeem_card:ip:${clientIP}:${hour}`
    const ipCount = await redis.client.incr(ipKey)
    await redis.client.expire(ipKey, 3600)
    if (ipCount > 10) {
      logger.security(`🚨 Card redemption rate limit for IP: ${clientIP}`)
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试'
      })
    }

    if (!apiId || !code) {
      return res.status(400).json({
        success: false,
        error: '请输入卡号'
      })
    }

    // 验证 apiId 格式
    if (
      typeof apiId !== 'string' ||
      !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
    ) {
      return res.status(400).json({
        success: false,
        error: 'API ID 格式无效'
      })
    }

    // 验证 API Key 存在且有效
    const keyData = await redis.getApiKey(apiId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    }

    if (keyData.isActive !== 'true') {
      return res.status(403).json({
        success: false,
        error: 'API Key 已禁用'
      })
    }

    // 调用兑换服务
    const result = await quotaCardService.redeemCard(code, apiId, null, keyData.name || 'API Stats')

    // 成功时清除失败计数（静默处理，不影响成功响应）
    redis.client.del(failKey).catch(() => {})

    logger.api(`🎫 Card redeemed via API Stats: ${code} -> ${apiId}`)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    // 失败时增加失败计数（静默处理，不影响错误响应）
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
    const failKey = `redeem_card:fail:${clientIP}`
    redis.client
      .incr(failKey)
      .then(() => redis.client.expire(failKey, 3600))
      .catch(() => {})

    logger.error('❌ Failed to redeem card:', error)
    res.status(400).json({
      success: false,
      error: error.message
    })
  }
})

// 📋 公开的兑换记录查询接口（通过 apiId 验证身份）
router.get('/api/redemption-history', async (req, res) => {
  const quotaCardService = require('../services/quotaCardService')

  try {
    const { apiId, limit = 50, offset = 0 } = req.query

    if (!apiId) {
      return res.status(400).json({
        success: false,
        error: '缺少 API ID'
      })
    }

    // 验证 apiId 格式
    if (
      typeof apiId !== 'string' ||
      !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
    ) {
      return res.status(400).json({
        success: false,
        error: 'API ID 格式无效'
      })
    }

    // 验证 API Key 存在
    const keyData = await redis.getApiKey(apiId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    }

    // 获取该 API Key 的兑换记录
    const result = await quotaCardService.getRedemptions({
      apiKeyId: apiId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to get redemption history:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

module.exports = router
