const express = require('express')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('../services/apiKeyService')
const CostCalculator = require('../utils/costCalculator')
const claudeAccountService = require('../services/claudeAccountService')
const openaiAccountService = require('../services/openaiAccountService')

const router = express.Router()

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
      logger.security(`🔒 Invalid API key in get-key-id: ${validation.error} from ${clientIP}`)
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
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
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
        permissions: keyData.permissions || 'all',
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
        logger.security(`🔒 Invalid API key format in user stats query from ${req.ip || 'unknown'}`)
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
      logger.security(`🔒 Missing API key or ID in user stats query from ${req.ip || 'unknown'}`)
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

    // 计算总费用 - 使用与模型统计相同的逻辑（按模型分别计算）
    let totalCost = 0
    let formattedCost = '$0.000000'

    try {
      const client = redis.getClientSafe()

      // 获取所有月度模型统计（与model-stats接口相同的逻辑）
      const allModelKeys = await client.keys(`usage:${keyId}:model:monthly:*:*`)
      const modelUsageMap = new Map()

      for (const key of allModelKeys) {
        const modelMatch = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/)
        if (!modelMatch) {
          continue
        }

        const model = modelMatch[1]
        const data = await client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          if (!modelUsageMap.has(model)) {
            modelUsageMap.set(model, {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0
            })
          }

          const modelUsage = modelUsageMap.get(model)
          modelUsage.inputTokens += parseInt(data.inputTokens) || 0
          modelUsage.outputTokens += parseInt(data.outputTokens) || 0
          modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        }
      }

      // 按模型计算费用并汇总
      for (const [model, usage] of modelUsageMap) {
        const usageData = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreateTokens,
          cache_read_input_tokens: usage.cacheReadTokens
        }

        const costResult = CostCalculator.calculateCost(usageData, model)
        totalCost += costResult.costs.total
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

        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022')
        totalCost = costResult.costs.total
      }

      formattedCost = CostCalculator.formatCost(totalCost)
    } catch (error) {
      logger.warn(`Failed to calculate detailed cost for key ${keyId}:`, error)
      // 回退到简单计算
      if (fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
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
        // 当前使用量
        currentWindowRequests,
        currentWindowTokens,
        currentWindowCost, // 新增：当前窗口费用
        currentDailyCost,
        currentTotalCost: totalCost,
        weeklyOpusCost: (await redis.getWeeklyOpusCost(keyId)) || 0, // 当前 Opus 周费用
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
      }
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
          totalCost: costStats.total
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

    const client = redis.getClientSafe()
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

        const keys = await client.keys(pattern)

        for (const key of keys) {
          const match = key.match(
            period === 'daily'
              ? /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
              : /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
          )

          if (!match) {
            continue
          }

          const model = match[1]
          const data = await client.hgetall(key)

          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(model)) {
              modelUsageMap.set(model, {
                requests: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0,
                allTokens: 0
              })
            }

            const modelUsage = modelUsageMap.get(model)
            modelUsage.requests += parseInt(data.requests) || 0
            modelUsage.inputTokens += parseInt(data.inputTokens) || 0
            modelUsage.outputTokens += parseInt(data.outputTokens) || 0
            modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
            modelUsage.allTokens += parseInt(data.allTokens) || 0
          }
        }
      })
    )

    // 转换为数组并计算费用
    const modelStats = []
    for (const [model, usage] of modelUsageMap) {
      const usageData = {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_creation_input_tokens: usage.cacheCreateTokens,
        cache_read_input_tokens: usage.cacheReadTokens
      }

      const costData = CostCalculator.calculateCost(usageData, model)

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
        pricing: costData.pricing
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

// 🧪 API Key 端点测试接口 - 测试API Key是否能正常访问服务
router.post('/api-key/test', async (req, res) => {
  const axios = require('axios')
  const config = require('../../config/config')

  try {
    const { apiKey, model = 'claude-sonnet-4-5-20250929' } = req.body

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    // 基本格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    // 首先验证API Key是否有效（不触发激活）
    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    logger.api(`🧪 API Key test started for: ${validation.keyData.name} (${validation.keyData.id})`)

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 发送测试开始事件
    res.write(`data: ${JSON.stringify({ type: 'test_start', message: 'Test started' })}\n\n`)

    // 构建测试请求，模拟 Claude CLI 客户端
    const port = config.server.port || 3000
    const baseURL = `http://127.0.0.1:${port}`

    const testPayload = {
      model,
      messages: [
        {
          role: 'user',
          content: 'hi'
        }
      ],
      system: [
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude."
        }
      ],
      max_tokens: 32000,
      temperature: 1,
      stream: true
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'claude-cli/2.0.52 (external, cli)',
      'x-api-key': apiKey,
      'anthropic-version': config.claude.apiVersion || '2023-06-01'
    }

    // 向自身服务发起测试请求
    // 使用 validateStatus 允许所有状态码通过，以便我们可以处理流式错误响应
    const response = await axios.post(`${baseURL}/api/v1/messages`, testPayload, {
      headers,
      responseType: 'stream',
      timeout: 60000, // 60秒超时
      validateStatus: () => true // 接受所有状态码，自行处理错误
    })

    // 检查响应状态码，如果不是2xx，尝试读取错误信息
    if (response.status >= 400) {
      logger.error(
        `🧪 API Key test received error status ${response.status} for: ${validation.keyData.name}`
      )

      // 尝试从流中读取错误信息
      let errorBody = ''
      for await (const chunk of response.data) {
        errorBody += chunk.toString()
      }

      let errorMessage = `HTTP ${response.status}`
      try {
        // 尝试解析SSE格式的错误
        const lines = errorBody.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim()
            if (dataStr && dataStr !== '[DONE]') {
              const data = JSON.parse(dataStr)
              if (data.error?.message) {
                errorMessage = data.error.message
                break
              } else if (data.message) {
                errorMessage = data.message
                break
              } else if (typeof data.error === 'string') {
                errorMessage = data.error
                break
              }
            }
          }
        }
        // 如果不是SSE格式，尝试直接解析JSON
        if (errorMessage === `HTTP ${response.status}`) {
          const jsonError = JSON.parse(errorBody)
          errorMessage =
            jsonError.error?.message || jsonError.message || jsonError.error || errorMessage
        }
      } catch {
        // 解析失败，使用原始错误体或默认消息
        if (errorBody && errorBody.length < 500) {
          errorMessage = errorBody
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      res.write(
        `data: ${JSON.stringify({ type: 'test_complete', success: false, error: errorMessage })}\n\n`
      )
      res.end()
      return
    }

    let receivedContent = ''
    let testSuccess = false
    let upstreamError = null

    // 处理流式响应
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.substring(6).trim()
          if (dataStr === '[DONE]') {
            continue
          }

          try {
            const data = JSON.parse(dataStr)

            // 检查上游返回的错误事件
            if (data.type === 'error' || data.error) {
              let errorMsg = 'Unknown upstream error'

              // 优先从 data.error 提取（如果是对象，获取其 message）
              if (typeof data.error === 'object' && data.error?.message) {
                errorMsg = data.error.message
              } else if (typeof data.error === 'string' && data.error !== 'Claude API error') {
                // 如果 error 是字符串且不是通用错误，直接使用
                errorMsg = data.error
              } else if (data.details) {
                // 尝试从 details 字段解析详细错误（claudeRelayService 格式）
                try {
                  const details =
                    typeof data.details === 'string' ? JSON.parse(data.details) : data.details
                  if (details.error?.message) {
                    errorMsg = details.error.message
                  } else if (details.message) {
                    errorMsg = details.message
                  }
                } catch {
                  // details 不是有效 JSON，尝试直接使用
                  if (typeof data.details === 'string' && data.details.length < 500) {
                    errorMsg = data.details
                  }
                }
              } else if (data.message) {
                errorMsg = data.message
              }

              // 添加状态码信息（如果有）
              if (data.status && errorMsg !== 'Unknown upstream error') {
                errorMsg = `[${data.status}] ${errorMsg}`
              }

              upstreamError = errorMsg
              logger.error(`🧪 Upstream error in test for: ${validation.keyData.name}:`, errorMsg)
              res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
              continue
            }

            // 提取文本内容
            if (data.type === 'content_block_delta' && data.delta?.text) {
              receivedContent += data.delta.text
              res.write(`data: ${JSON.stringify({ type: 'content', text: data.delta.text })}\n\n`)
            }

            // 消息结束
            if (data.type === 'message_stop') {
              testSuccess = true
              res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    })

    response.data.on('end', () => {
      // 如果有上游错误，标记为失败
      if (upstreamError) {
        testSuccess = false
      }

      logger.api(
        `🧪 API Key test completed for: ${validation.keyData.name}, success: ${testSuccess}, content length: ${receivedContent.length}${upstreamError ? `, error: ${upstreamError}` : ''}`
      )
      res.write(
        `data: ${JSON.stringify({
          type: 'test_complete',
          success: testSuccess,
          contentLength: receivedContent.length,
          error: upstreamError || undefined
        })}\n\n`
      )
      res.end()
    })

    response.data.on('error', (err) => {
      logger.error(`🧪 API Key test stream error for: ${validation.keyData.name}`, err)

      // 如果已经捕获了上游错误，优先使用那个
      let errorMsg = upstreamError || err.message || 'Stream error'

      // 如果错误消息是通用的 "Claude API error: xxx"，提供更友好的提示
      if (errorMsg.startsWith('Claude API error:') && upstreamError) {
        errorMsg = upstreamError
      }

      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
      res.write(
        `data: ${JSON.stringify({ type: 'test_complete', success: false, error: errorMsg })}\n\n`
      )
      res.end()
    })

    // 处理客户端断开连接
    req.on('close', () => {
      if (!res.writableEnded) {
        response.data.destroy()
      }
    })
  } catch (error) {
    logger.error('❌ API Key test failed:', error)

    // 如果还未发送响应头，返回JSON错误
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Test failed',
        message: error.response?.data?.error?.message || error.message || 'Internal server error'
      })
    }

    // 如果已经是SSE流，发送错误事件
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: error.response?.data?.error?.message || error.message || 'Test failed' })}\n\n`
    )
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
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
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
    const client = redis.getClientSafe()
    // 使用与管理页面相同的时区处理逻辑
    const tzDate = redis.getDateInTimezone()
    const today = redis.getDateStringInTimezone()
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`

    const pattern =
      period === 'daily'
        ? `usage:${keyId}:model:daily:*:${today}`
        : `usage:${keyId}:model:monthly:*:${currentMonth}`

    const keys = await client.keys(pattern)
    const modelStats = []

    for (const key of keys) {
      const match = key.match(
        period === 'daily'
          ? /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
          : /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
      )

      if (!match) {
        continue
      }

      const model = match[1]
      const data = await client.hgetall(key)

      if (data && Object.keys(data).length > 0) {
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        }

        const costData = CostCalculator.calculateCost(usage, model)

        modelStats.push({
          model,
          requests: parseInt(data.requests) || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          allTokens: parseInt(data.allTokens) || 0,
          costs: costData.costs,
          formatted: costData.formatted,
          pricing: costData.pricing
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

module.exports = router
