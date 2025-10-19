const express = require('express')
const apiKeyService = require('../services/apiKeyService')
const claudeAccountService = require('../services/claudeAccountService')
const claudeConsoleAccountService = require('../services/claudeConsoleAccountService')
const bedrockAccountService = require('../services/bedrockAccountService')
const ccrAccountService = require('../services/ccrAccountService')
const geminiAccountService = require('../services/geminiAccountService')
const droidAccountService = require('../services/droidAccountService')
const openaiAccountService = require('../services/openaiAccountService')
const openaiResponsesAccountService = require('../services/openaiResponsesAccountService')
const azureOpenaiAccountService = require('../services/azureOpenaiAccountService')
const accountGroupService = require('../services/accountGroupService')
const redis = require('../models/redis')
const { authenticateAdmin } = require('../middleware/auth')
const logger = require('../utils/logger')
const oauthHelper = require('../utils/oauthHelper')
const {
  startDeviceAuthorization,
  pollDeviceAuthorization,
  WorkOSDeviceAuthError
} = require('../utils/workosOAuthHelper')
const CostCalculator = require('../utils/costCalculator')
const pricingService = require('../services/pricingService')
const claudeCodeHeadersService = require('../services/claudeCodeHeadersService')
const webhookNotifier = require('../utils/webhookNotifier')
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const config = require('../../config/config')
const ProxyHelper = require('../utils/proxyHelper')

const router = express.Router()

// 🛠️ 工具函数：处理可为空的时间字段
function normalizeNullableDate(value) {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value
}

// 🛠️ 工具函数：映射前端字段名到后端字段名
/**
 * 映射前端的 expiresAt 字段到后端的 subscriptionExpiresAt 字段
 * @param {Object} updates - 更新对象
 * @param {string} accountType - 账户类型 (如 'Claude', 'OpenAI' 等)
 * @param {string} accountId - 账户 ID
 * @returns {Object} 映射后的更新对象
 */
function mapExpiryField(updates, accountType, accountId) {
  const mappedUpdates = { ...updates }
  if ('expiresAt' in mappedUpdates) {
    mappedUpdates.subscriptionExpiresAt = mappedUpdates.expiresAt
    delete mappedUpdates.expiresAt
    logger.info(
      `Mapping expiresAt to subscriptionExpiresAt for ${accountType} account ${accountId}`
    )
  }
  return mappedUpdates
}

/**
 * 格式化账户数据，确保前端获取正确的过期时间字段
 * 将 subscriptionExpiresAt（订阅过期时间）映射到 expiresAt 供前端使用
 * 保留原始的 tokenExpiresAt（OAuth token过期时间）供内部使用
 * @param {Object} account - 账户对象
 * @returns {Object} 格式化后的账户对象
 */
function formatAccountExpiry(account) {
  if (!account || typeof account !== 'object') {
    return account
  }

  const rawSubscription = Object.prototype.hasOwnProperty.call(account, 'subscriptionExpiresAt')
    ? account.subscriptionExpiresAt
    : null

  const rawToken = Object.prototype.hasOwnProperty.call(account, 'tokenExpiresAt')
    ? account.tokenExpiresAt
    : account.expiresAt

  const subscriptionExpiresAt = normalizeNullableDate(rawSubscription)
  const tokenExpiresAt = normalizeNullableDate(rawToken)

  return {
    ...account,
    subscriptionExpiresAt,
    tokenExpiresAt,
    expiresAt: subscriptionExpiresAt
  }
}

// 👥 用户管理

// 获取所有用户列表（用于API Key分配）
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const userService = require('../services/userService')

    // Extract query parameters for filtering
    const { role, isActive } = req.query
    const options = { limit: 1000 }

    // Apply role filter if provided
    if (role) {
      options.role = role
    }

    // Apply isActive filter if provided, otherwise default to active users only
    if (isActive !== undefined) {
      options.isActive = isActive === 'true'
    } else {
      options.isActive = true // Default to active users for backwards compatibility
    }

    const result = await userService.getAllUsers(options)

    // Extract users array from the paginated result
    const allUsers = result.users || []

    // Map to the format needed for the dropdown
    const activeUsers = allUsers.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      role: user.role
    }))

    // 添加Admin选项作为第一个
    const usersWithAdmin = [
      {
        id: 'admin',
        username: 'admin',
        displayName: 'Admin',
        email: '',
        role: 'admin'
      },
      ...activeUsers
    ]

    return res.json({
      success: true,
      data: usersWithAdmin
    })
  } catch (error) {
    logger.error('❌ Failed to get users list:', error)
    return res.status(500).json({
      error: 'Failed to get users list',
      message: error.message
    })
  }
})

// 🔑 API Keys 管理

// 调试：获取API Key费用详情
router.get('/api-keys/:keyId/cost-debug', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const costStats = await redis.getCostStats(keyId)
    const dailyCost = await redis.getDailyCost(keyId)
    const today = redis.getDateStringInTimezone()
    const client = redis.getClientSafe()

    // 获取所有相关的Redis键
    const costKeys = await client.keys(`usage:cost:*:${keyId}:*`)
    const keyValues = {}

    for (const key of costKeys) {
      keyValues[key] = await client.get(key)
    }

    return res.json({
      keyId,
      today,
      dailyCost,
      costStats,
      redisKeys: keyValues,
      timezone: config.system.timezoneOffset || 8
    })
  } catch (error) {
    logger.error('❌ Failed to get cost debug info:', error)
    return res.status(500).json({ error: 'Failed to get cost debug info', message: error.message })
  }
})

// 获取所有API Keys
router.get('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate } = req.query // all, 7days, monthly, custom
    const apiKeys = await apiKeyService.getAllApiKeys()

    // 获取用户服务来补充owner信息
    const userService = require('../services/userService')

    // 根据时间范围计算查询模式
    const now = new Date()
    const searchPatterns = []

    if (timeRange === 'custom' && startDate && endDate) {
      // 自定义日期范围
      const redisClient = require('../models/redis')
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

      // 生成日期范围内每天的搜索模式
      const currentDate = new Date(start)
      while (currentDate <= end) {
        const tzDate = redisClient.getDateInTimezone(currentDate)
        const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
          2,
          '0'
        )}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
        searchPatterns.push(`usage:daily:*:${dateStr}`)
        currentDate.setDate(currentDate.getDate() + 1)
      }
    } else if (timeRange === 'today') {
      // 今日 - 使用时区日期
      const redisClient = require('../models/redis')
      const tzDate = redisClient.getDateInTimezone(now)
      const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
        2,
        '0'
      )}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
      searchPatterns.push(`usage:daily:*:${dateStr}`)
    } else if (timeRange === '7days') {
      // 最近7天
      const redisClient = require('../models/redis')
      for (let i = 0; i < 7; i++) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const tzDate = redisClient.getDateInTimezone(date)
        const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
          2,
          '0'
        )}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
        searchPatterns.push(`usage:daily:*:${dateStr}`)
      }
    } else if (timeRange === 'monthly') {
      // 本月
      const redisClient = require('../models/redis')
      const tzDate = redisClient.getDateInTimezone(now)
      const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
        2,
        '0'
      )}`
      searchPatterns.push(`usage:monthly:*:${currentMonth}`)
    }

    // 为每个API Key计算准确的费用和统计数据
    for (const apiKey of apiKeys) {
      const client = redis.getClientSafe()

      if (timeRange === 'all') {
        // 全部时间：保持原有逻辑
        if (apiKey.usage && apiKey.usage.total) {
          // 使用与展开模型统计相同的数据源
          // 获取所有时间的模型统计数据
          const monthlyKeys = await client.keys(`usage:${apiKey.id}:model:monthly:*:*`)
          const modelStatsMap = new Map()

          // 汇总所有月份的数据
          for (const key of monthlyKeys) {
            const match = key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/)
            if (!match) {
              continue
            }

            const model = match[1]
            const data = await client.hgetall(key)

            if (data && Object.keys(data).length > 0) {
              if (!modelStatsMap.has(model)) {
                modelStatsMap.set(model, {
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreateTokens: 0,
                  cacheReadTokens: 0
                })
              }

              const stats = modelStatsMap.get(model)
              stats.inputTokens +=
                parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
              stats.outputTokens +=
                parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
              stats.cacheCreateTokens +=
                parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
              stats.cacheReadTokens +=
                parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
            }
          }

          let totalCost = 0

          // 计算每个模型的费用
          for (const [model, stats] of modelStatsMap) {
            const usage = {
              input_tokens: stats.inputTokens,
              output_tokens: stats.outputTokens,
              cache_creation_input_tokens: stats.cacheCreateTokens,
              cache_read_input_tokens: stats.cacheReadTokens
            }

            const costResult = CostCalculator.calculateCost(usage, model)
            totalCost += costResult.costs.total
          }

          // 如果没有详细的模型数据，使用总量数据和默认模型计算
          if (modelStatsMap.size === 0) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
            }

            const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
            totalCost = costResult.costs.total
          }

          // 添加格式化的费用到响应数据
          apiKey.usage.total.cost = totalCost
          apiKey.usage.total.formattedCost = CostCalculator.formatCost(totalCost)
        }
      } else {
        // 7天、本月或自定义日期范围：重新计算统计数据
        const tempUsage = {
          requests: 0,
          tokens: 0,
          allTokens: 0, // 添加allTokens字段
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0
        }

        // 获取指定时间范围的统计数据
        for (const pattern of searchPatterns) {
          const keys = await client.keys(pattern.replace('*', apiKey.id))

          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data && Object.keys(data).length > 0) {
              // 使用与 redis.js incrementTokenUsage 中相同的字段名
              tempUsage.requests += parseInt(data.totalRequests) || parseInt(data.requests) || 0
              tempUsage.tokens += parseInt(data.totalTokens) || parseInt(data.tokens) || 0
              tempUsage.allTokens += parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0 // 读取包含所有Token的字段
              tempUsage.inputTokens +=
                parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
              tempUsage.outputTokens +=
                parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
              tempUsage.cacheCreateTokens +=
                parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
              tempUsage.cacheReadTokens +=
                parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
            }
          }
        }

        // 计算指定时间范围的费用
        let totalCost = 0
        const redisClient = require('../models/redis')
        const tzToday = redisClient.getDateStringInTimezone(now)
        const tzDate = redisClient.getDateInTimezone(now)
        const tzMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
          2,
          '0'
        )}`

        let modelKeys = []
        if (timeRange === 'custom' && startDate && endDate) {
          // 自定义日期范围：获取范围内所有日期的模型统计
          const start = new Date(startDate)
          const end = new Date(endDate)
          const currentDate = new Date(start)

          while (currentDate <= end) {
            const tzDateForKey = redisClient.getDateInTimezone(currentDate)
            const dateStr = `${tzDateForKey.getUTCFullYear()}-${String(
              tzDateForKey.getUTCMonth() + 1
            ).padStart(2, '0')}-${String(tzDateForKey.getUTCDate()).padStart(2, '0')}`
            const dayKeys = await client.keys(`usage:${apiKey.id}:model:daily:*:${dateStr}`)
            modelKeys = modelKeys.concat(dayKeys)
            currentDate.setDate(currentDate.getDate() + 1)
          }
        } else {
          modelKeys =
            timeRange === 'today'
              ? await client.keys(`usage:${apiKey.id}:model:daily:*:${tzToday}`)
              : timeRange === '7days'
                ? await client.keys(`usage:${apiKey.id}:model:daily:*:*`)
                : await client.keys(`usage:${apiKey.id}:model:monthly:*:${tzMonth}`)
        }

        const modelStatsMap = new Map()

        // 过滤和汇总相应时间范围的模型数据
        for (const key of modelKeys) {
          if (timeRange === '7days') {
            // 检查是否在最近7天内
            const dateMatch = key.match(/\d{4}-\d{2}-\d{2}$/)
            if (dateMatch) {
              const keyDate = new Date(dateMatch[0])
              const daysDiff = Math.floor((now - keyDate) / (1000 * 60 * 60 * 24))
              if (daysDiff > 6) {
                continue
              }
            }
          } else if (timeRange === 'today' || timeRange === 'custom') {
            // today和custom选项已经在查询时过滤了，不需要额外处理
          }

          const modelMatch = key.match(
            /usage:.+:model:(?:daily|monthly):(.+):\d{4}-\d{2}(?:-\d{2})?$/
          )
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]
          const data = await client.hgetall(key)

          if (data && Object.keys(data).length > 0) {
            if (!modelStatsMap.has(model)) {
              modelStatsMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              })
            }

            const stats = modelStatsMap.get(model)
            stats.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
            stats.outputTokens +=
              parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
            stats.cacheCreateTokens +=
              parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
            stats.cacheReadTokens +=
              parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
          }
        }

        // 计算费用
        for (const [model, stats] of modelStatsMap) {
          const usage = {
            input_tokens: stats.inputTokens,
            output_tokens: stats.outputTokens,
            cache_creation_input_tokens: stats.cacheCreateTokens,
            cache_read_input_tokens: stats.cacheReadTokens
          }

          const costResult = CostCalculator.calculateCost(usage, model)
          totalCost += costResult.costs.total
        }

        // 如果没有模型数据，使用临时统计数据计算
        if (modelStatsMap.size === 0 && tempUsage.tokens > 0) {
          const usage = {
            input_tokens: tempUsage.inputTokens,
            output_tokens: tempUsage.outputTokens,
            cache_creation_input_tokens: tempUsage.cacheCreateTokens,
            cache_read_input_tokens: tempUsage.cacheReadTokens
          }

          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
          totalCost = costResult.costs.total
        }

        // 使用从Redis读取的allTokens，如果没有则计算
        const allTokens =
          tempUsage.allTokens ||
          tempUsage.inputTokens +
            tempUsage.outputTokens +
            tempUsage.cacheCreateTokens +
            tempUsage.cacheReadTokens

        // 更新API Key的usage数据为指定时间范围的数据
        apiKey.usage[timeRange] = {
          ...tempUsage,
          tokens: allTokens, // 使用包含所有Token的总数
          allTokens,
          cost: totalCost,
          formattedCost: CostCalculator.formatCost(totalCost)
        }

        // 为了保持兼容性，也更新total字段
        apiKey.usage.total = apiKey.usage[timeRange]
      }
    }

    // 为每个API Key添加owner的displayName
    for (const apiKey of apiKeys) {
      // 如果API Key有关联的用户ID，获取用户信息
      if (apiKey.userId) {
        try {
          const user = await userService.getUserById(apiKey.userId, false)
          if (user) {
            apiKey.ownerDisplayName = user.displayName || user.username || 'Unknown User'
          } else {
            apiKey.ownerDisplayName = 'Unknown User'
          }
        } catch (error) {
          logger.debug(`无法获取用户 ${apiKey.userId} 的信息:`, error)
          apiKey.ownerDisplayName = 'Unknown User'
        }
      } else {
        // 如果没有userId，使用createdBy字段或默认为Admin
        apiKey.ownerDisplayName =
          apiKey.createdBy === 'admin' ? 'Admin' : apiKey.createdBy || 'Admin'
      }
    }

    return res.json({ success: true, data: apiKeys })
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error)
    return res.status(500).json({ error: 'Failed to get API keys', message: error.message })
  }
})

// 获取支持的客户端列表（使用新的验证器）
router.get('/supported-clients', authenticateAdmin, async (req, res) => {
  try {
    // 使用新的 ClientValidator 获取所有可用客户端
    const ClientValidator = require('../validators/clientValidator')
    const availableClients = ClientValidator.getAvailableClients()

    // 格式化返回数据
    const clients = availableClients.map((client) => ({
      id: client.id,
      name: client.name,
      description: client.description,
      icon: client.icon
    }))

    logger.info(`📱 Returning ${clients.length} supported clients`)
    return res.json({ success: true, data: clients })
  } catch (error) {
    logger.error('❌ Failed to get supported clients:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get supported clients', message: error.message })
  }
})

// 获取已存在的标签列表
router.get('/api-keys/tags', authenticateAdmin, async (req, res) => {
  try {
    const apiKeys = await apiKeyService.getAllApiKeys()
    const tagSet = new Set()

    // 收集所有API Keys的标签
    for (const apiKey of apiKeys) {
      if (apiKey.tags && Array.isArray(apiKey.tags)) {
        apiKey.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim())
          }
        })
      }
    }

    // 转换为数组并排序
    const tags = Array.from(tagSet).sort()

    logger.info(`📋 Retrieved ${tags.length} unique tags from API keys`)
    return res.json({ success: true, data: tags })
  } catch (error) {
    logger.error('❌ Failed to get API key tags:', error)
    return res.status(500).json({ error: 'Failed to get API key tags', message: error.message })
  }
})

// 创建新的API Key
router.post('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays, // 新增：激活后有效天数
      activationUnit, // 新增：激活时间单位 (hours/days)
      expirationMode, // 新增：过期模式
      icon // 新增：图标
    } = req.body

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' })
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' })
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res
        .status(400)
        .json({ error: 'Description must be a string with less than 500 characters' })
    }

    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
    }

    if (
      concurrencyLimit !== undefined &&
      concurrencyLimit !== null &&
      concurrencyLimit !== '' &&
      (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
    }

    if (
      rateLimitWindow !== undefined &&
      rateLimitWindow !== null &&
      rateLimitWindow !== '' &&
      (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 1)
    ) {
      return res
        .status(400)
        .json({ error: 'Rate limit window must be a positive integer (minutes)' })
    }

    if (
      rateLimitRequests !== undefined &&
      rateLimitRequests !== null &&
      rateLimitRequests !== '' &&
      (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 1)
    ) {
      return res.status(400).json({ error: 'Rate limit requests must be a positive integer' })
    }

    // 验证模型限制字段
    if (enableModelRestriction !== undefined && typeof enableModelRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
    }

    if (restrictedModels !== undefined && !Array.isArray(restrictedModels)) {
      return res.status(400).json({ error: 'Restricted models must be an array' })
    }

    // 验证客户端限制字段
    if (enableClientRestriction !== undefined && typeof enableClientRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
    }

    if (allowedClients !== undefined && !Array.isArray(allowedClients)) {
      return res.status(400).json({ error: 'Allowed clients must be an array' })
    }

    // 验证标签字段
    if (tags !== undefined && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' })
    }

    if (tags && tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
      return res.status(400).json({ error: 'All tags must be non-empty strings' })
    }

    if (
      totalCostLimit !== undefined &&
      totalCostLimit !== null &&
      totalCostLimit !== '' &&
      (Number.isNaN(Number(totalCostLimit)) || Number(totalCostLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
    }

    // 验证激活相关字段
    if (expirationMode && !['fixed', 'activation'].includes(expirationMode)) {
      return res
        .status(400)
        .json({ error: 'Expiration mode must be either "fixed" or "activation"' })
    }

    if (expirationMode === 'activation') {
      // 验证激活时间单位
      if (!activationUnit || !['hours', 'days'].includes(activationUnit)) {
        return res.status(400).json({
          error: 'Activation unit must be either "hours" or "days" when using activation mode'
        })
      }

      // 验证激活时间数值
      if (
        !activationDays ||
        !Number.isInteger(Number(activationDays)) ||
        Number(activationDays) < 1
      ) {
        const unitText = activationUnit === 'hours' ? 'hours' : 'days'
        return res.status(400).json({
          error: `Activation ${unitText} must be a positive integer when using activation mode`
        })
      }
      // 激活模式下不应该设置固定过期时间
      if (expiresAt) {
        return res
          .status(400)
          .json({ error: 'Cannot set fixed expiration date when using activation mode' })
      }
    }

    // 验证服务权限字段
    if (
      permissions !== undefined &&
      permissions !== null &&
      permissions !== '' &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)
    ) {
      return res.status(400).json({
        error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all'
      })
    }

    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    })

    logger.success(`🔑 Admin created new API key: ${name}`)
    return res.json({ success: true, data: newKey })
  } catch (error) {
    logger.error('❌ Failed to create API key:', error)
    return res.status(500).json({ error: 'Failed to create API key', message: error.message })
  }
})

// 批量创建API Keys
router.post('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const {
      baseName,
      count,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    } = req.body

    // 输入验证
    if (!baseName || typeof baseName !== 'string' || baseName.trim().length === 0) {
      return res.status(400).json({ error: 'Base name is required and must be a non-empty string' })
    }

    if (!count || !Number.isInteger(count) || count < 2 || count > 500) {
      return res.status(400).json({ error: 'Count must be an integer between 2 and 500' })
    }

    if (baseName.length > 90) {
      return res
        .status(400)
        .json({ error: 'Base name must be less than 90 characters to allow for numbering' })
    }

    if (
      permissions !== undefined &&
      permissions !== null &&
      permissions !== '' &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)
    ) {
      return res.status(400).json({
        error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all'
      })
    }

    // 生成批量API Keys
    const createdKeys = []
    const errors = []

    for (let i = 1; i <= count; i++) {
      try {
        const name = `${baseName}_${i}`
        const newKey = await apiKeyService.generateApiKey({
          name,
          description,
          tokenLimit,
          expiresAt,
          claudeAccountId,
          claudeConsoleAccountId,
          geminiAccountId,
          openaiAccountId,
          bedrockAccountId,
          droidAccountId,
          permissions,
          concurrencyLimit,
          rateLimitWindow,
          rateLimitRequests,
          rateLimitCost,
          enableModelRestriction,
          restrictedModels,
          enableClientRestriction,
          allowedClients,
          dailyCostLimit,
          totalCostLimit,
          weeklyOpusCostLimit,
          tags,
          activationDays,
          activationUnit,
          expirationMode,
          icon
        })

        // 保留原始 API Key 供返回
        createdKeys.push({
          ...newKey,
          apiKey: newKey.apiKey
        })
      } catch (error) {
        errors.push({
          index: i,
          name: `${baseName}_${i}`,
          error: error.message
        })
      }
    }

    // 如果有部分失败，返回部分成功的结果
    if (errors.length > 0 && createdKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create any API keys',
        errors
      })
    }

    // 返回创建的keys（包含完整的apiKey）
    return res.json({
      success: true,
      data: createdKeys,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        requested: count,
        created: createdKeys.length,
        failed: errors.length
      }
    })
  } catch (error) {
    logger.error('Failed to batch create API keys:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to batch create API keys',
      message: error.message
    })
  }
})

// 批量编辑API Keys
router.put('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds, updates } = req.body

    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'keyIds must be a non-empty array'
      })
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'updates must be an object'
      })
    }

    if (
      updates.permissions !== undefined &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(updates.permissions)
    ) {
      return res.status(400).json({
        error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all'
      })
    }

    logger.info(
      `🔄 Admin batch editing ${keyIds.length} API keys with updates: ${JSON.stringify(updates)}`
    )
    logger.info(`🔍 Debug: keyIds received: ${JSON.stringify(keyIds)}`)

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: []
    }

    // 处理每个API Key
    for (const keyId of keyIds) {
      try {
        // 获取当前API Key信息
        const currentKey = await redis.getApiKey(keyId)
        if (!currentKey || Object.keys(currentKey).length === 0) {
          results.failedCount++
          results.errors.push(`API key ${keyId} not found`)
          continue
        }

        // 构建最终更新数据
        const finalUpdates = {}

        // 处理普通字段
        if (updates.name) {
          finalUpdates.name = updates.name
        }
        if (updates.tokenLimit !== undefined) {
          finalUpdates.tokenLimit = updates.tokenLimit
        }
        if (updates.rateLimitCost !== undefined) {
          finalUpdates.rateLimitCost = updates.rateLimitCost
        }
        if (updates.concurrencyLimit !== undefined) {
          finalUpdates.concurrencyLimit = updates.concurrencyLimit
        }
        if (updates.rateLimitWindow !== undefined) {
          finalUpdates.rateLimitWindow = updates.rateLimitWindow
        }
        if (updates.rateLimitRequests !== undefined) {
          finalUpdates.rateLimitRequests = updates.rateLimitRequests
        }
        if (updates.dailyCostLimit !== undefined) {
          finalUpdates.dailyCostLimit = updates.dailyCostLimit
        }
        if (updates.totalCostLimit !== undefined) {
          finalUpdates.totalCostLimit = updates.totalCostLimit
        }
        if (updates.weeklyOpusCostLimit !== undefined) {
          finalUpdates.weeklyOpusCostLimit = updates.weeklyOpusCostLimit
        }
        if (updates.permissions !== undefined) {
          finalUpdates.permissions = updates.permissions
        }
        if (updates.isActive !== undefined) {
          finalUpdates.isActive = updates.isActive
        }
        if (updates.monthlyLimit !== undefined) {
          finalUpdates.monthlyLimit = updates.monthlyLimit
        }
        if (updates.priority !== undefined) {
          finalUpdates.priority = updates.priority
        }
        if (updates.enabled !== undefined) {
          finalUpdates.enabled = updates.enabled
        }

        // 处理账户绑定
        if (updates.claudeAccountId !== undefined) {
          finalUpdates.claudeAccountId = updates.claudeAccountId
        }
        if (updates.claudeConsoleAccountId !== undefined) {
          finalUpdates.claudeConsoleAccountId = updates.claudeConsoleAccountId
        }
        if (updates.geminiAccountId !== undefined) {
          finalUpdates.geminiAccountId = updates.geminiAccountId
        }
        if (updates.openaiAccountId !== undefined) {
          finalUpdates.openaiAccountId = updates.openaiAccountId
        }
        if (updates.bedrockAccountId !== undefined) {
          finalUpdates.bedrockAccountId = updates.bedrockAccountId
        }
        if (updates.droidAccountId !== undefined) {
          finalUpdates.droidAccountId = updates.droidAccountId || ''
        }

        // 处理标签操作
        if (updates.tags !== undefined) {
          if (updates.tagOperation) {
            const currentTags = currentKey.tags ? JSON.parse(currentKey.tags) : []
            const operationTags = updates.tags

            switch (updates.tagOperation) {
              case 'replace': {
                finalUpdates.tags = operationTags
                break
              }
              case 'add': {
                const newTags = [...currentTags]
                operationTags.forEach((tag) => {
                  if (!newTags.includes(tag)) {
                    newTags.push(tag)
                  }
                })
                finalUpdates.tags = newTags
                break
              }
              case 'remove': {
                finalUpdates.tags = currentTags.filter((tag) => !operationTags.includes(tag))
                break
              }
            }
          } else {
            // 如果没有指定操作类型，默认为替换
            finalUpdates.tags = updates.tags
          }
        }

        // 执行更新
        await apiKeyService.updateApiKey(keyId, finalUpdates)
        results.successCount++
        logger.success(`✅ Batch edit: API key ${keyId} updated successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push(`Failed to update key ${keyId}: ${error.message}`)
        logger.error(`❌ Batch edit failed for key ${keyId}:`, error)
      }
    }

    // 记录批量编辑结果
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch edit completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch edit completed with no successful updates: ${results.failedCount} failed`
      )
    }

    return res.json({
      success: true,
      message: `批量编辑完成`,
      data: results
    })
  } catch (error) {
    logger.error('❌ Failed to batch edit API keys:', error)
    return res.status(500).json({
      error: 'Batch edit failed',
      message: error.message
    })
  }
})

// 更新API Key
router.put('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const {
      name, // 添加名称字段
      tokenLimit,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      isActive,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      expiresAt,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      ownerId // 新增：所有者ID字段
    } = req.body

    // 只允许更新指定字段
    const updates = {}

    // 处理名称字段
    if (name !== undefined && name !== null && name !== '') {
      const trimmedName = name.toString().trim()
      if (trimmedName.length === 0) {
        return res.status(400).json({ error: 'API Key name cannot be empty' })
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'API Key name must be less than 100 characters' })
      }
      updates.name = trimmedName
    }

    if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== '') {
      if (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0) {
        return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
      }
      updates.tokenLimit = Number(tokenLimit)
    }

    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '') {
      if (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0) {
        return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
      }
      updates.concurrencyLimit = Number(concurrencyLimit)
    }

    if (rateLimitWindow !== undefined && rateLimitWindow !== null && rateLimitWindow !== '') {
      if (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 0) {
        return res
          .status(400)
          .json({ error: 'Rate limit window must be a non-negative integer (minutes)' })
      }
      updates.rateLimitWindow = Number(rateLimitWindow)
    }

    if (rateLimitRequests !== undefined && rateLimitRequests !== null && rateLimitRequests !== '') {
      if (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 0) {
        return res.status(400).json({ error: 'Rate limit requests must be a non-negative integer' })
      }
      updates.rateLimitRequests = Number(rateLimitRequests)
    }

    if (rateLimitCost !== undefined && rateLimitCost !== null && rateLimitCost !== '') {
      const cost = Number(rateLimitCost)
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({ error: 'Rate limit cost must be a non-negative number' })
      }
      updates.rateLimitCost = cost
    }

    if (claudeAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.claudeAccountId = claudeAccountId || ''
    }

    if (claudeConsoleAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.claudeConsoleAccountId = claudeConsoleAccountId || ''
    }

    if (geminiAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.geminiAccountId = geminiAccountId || ''
    }

    if (openaiAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.openaiAccountId = openaiAccountId || ''
    }

    if (bedrockAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.bedrockAccountId = bedrockAccountId || ''
    }

    if (droidAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.droidAccountId = droidAccountId || ''
    }

    if (permissions !== undefined) {
      // 验证权限值
      if (!['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)) {
        return res.status(400).json({
          error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all'
        })
      }
      updates.permissions = permissions
    }

    // 处理模型限制字段
    if (enableModelRestriction !== undefined) {
      if (typeof enableModelRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
      }
      updates.enableModelRestriction = enableModelRestriction
    }

    if (restrictedModels !== undefined) {
      if (!Array.isArray(restrictedModels)) {
        return res.status(400).json({ error: 'Restricted models must be an array' })
      }
      updates.restrictedModels = restrictedModels
    }

    // 处理客户端限制字段
    if (enableClientRestriction !== undefined) {
      if (typeof enableClientRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
      }
      updates.enableClientRestriction = enableClientRestriction
    }

    if (allowedClients !== undefined) {
      if (!Array.isArray(allowedClients)) {
        return res.status(400).json({ error: 'Allowed clients must be an array' })
      }
      updates.allowedClients = allowedClients
    }

    // 处理过期时间字段
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        // null 表示永不过期
        updates.expiresAt = null
        updates.isActive = true
      } else {
        // 验证日期格式
        const expireDate = new Date(expiresAt)
        if (isNaN(expireDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date format' })
        }
        updates.expiresAt = expiresAt
        updates.isActive = expireDate > new Date() // 如果过期时间在当前时间之后，则设置为激活状态
      }
    }

    // 处理每日费用限制
    if (dailyCostLimit !== undefined && dailyCostLimit !== null && dailyCostLimit !== '') {
      const costLimit = Number(dailyCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Daily cost limit must be a non-negative number' })
      }
      updates.dailyCostLimit = costLimit
    }

    if (totalCostLimit !== undefined && totalCostLimit !== null && totalCostLimit !== '') {
      const costLimit = Number(totalCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
      }
      updates.totalCostLimit = costLimit
    }

    // 处理 Opus 周费用限制
    if (
      weeklyOpusCostLimit !== undefined &&
      weeklyOpusCostLimit !== null &&
      weeklyOpusCostLimit !== ''
    ) {
      const costLimit = Number(weeklyOpusCostLimit)
      // 明确验证非负数（0 表示禁用，负数无意义）
      if (isNaN(costLimit) || costLimit < 0) {
        return res
          .status(400)
          .json({ error: 'Weekly Opus cost limit must be a non-negative number' })
      }
      updates.weeklyOpusCostLimit = costLimit
    }

    // 处理标签
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' })
      }
      if (tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
        return res.status(400).json({ error: 'All tags must be non-empty strings' })
      }
      updates.tags = tags
    }

    // 处理活跃/禁用状态状态, 放在过期处理后，以确保后续增加禁用key功能
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' })
      }
      updates.isActive = isActive
    }

    // 处理所有者变更
    if (ownerId !== undefined) {
      const userService = require('../services/userService')

      if (ownerId === 'admin') {
        // 分配给Admin
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      } else if (ownerId) {
        // 分配给用户
        try {
          const user = await userService.getUserById(ownerId, false)
          if (!user) {
            return res.status(400).json({ error: 'Invalid owner: User not found' })
          }
          if (!user.isActive) {
            return res.status(400).json({ error: 'Cannot assign to inactive user' })
          }

          // 设置新的所有者信息
          updates.userId = ownerId
          updates.userUsername = user.username
          updates.createdBy = user.username

          // 管理员重新分配时，不检查用户的API Key数量限制
          logger.info(`🔄 Admin reassigning API key ${keyId} to user ${user.username}`)
        } catch (error) {
          logger.error('Error fetching user for owner reassignment:', error)
          return res.status(400).json({ error: 'Invalid owner ID' })
        }
      } else {
        // 清空所有者（分配给Admin）
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      }
    }

    await apiKeyService.updateApiKey(keyId, updates)

    logger.success(`📝 Admin updated API key: ${keyId}`)
    return res.json({ success: true, message: 'API key updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update API key:', error)
    return res.status(500).json({ error: 'Failed to update API key', message: error.message })
  }
})

// 修改API Key过期时间（包括手动激活功能）
router.patch('/api-keys/:keyId/expiration', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const { expiresAt, activateNow } = req.body

    // 获取当前API Key信息
    const keyData = await redis.getApiKey(keyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }

    const updates = {}

    // 如果是激活操作（用于未激活的key）
    if (activateNow === true) {
      if (keyData.expirationMode === 'activation' && keyData.isActivated !== 'true') {
        const now = new Date()
        const activationDays = parseInt(keyData.activationDays || 30)
        const newExpiresAt = new Date(now.getTime() + activationDays * 24 * 60 * 60 * 1000)

        updates.isActivated = 'true'
        updates.activatedAt = now.toISOString()
        updates.expiresAt = newExpiresAt.toISOString()

        logger.success(
          `🔓 API key manually activated by admin: ${keyId} (${
            keyData.name
          }), expires at ${newExpiresAt.toISOString()}`
        )
      } else {
        return res.status(400).json({
          error: 'Cannot activate',
          message: 'Key is either already activated or not in activation mode'
        })
      }
    }

    // 如果提供了新的过期时间（但不是激活操作）
    if (expiresAt !== undefined && activateNow !== true) {
      // 验证过期时间格式
      if (expiresAt && isNaN(Date.parse(expiresAt))) {
        return res.status(400).json({ error: 'Invalid expiration date format' })
      }

      // 如果设置了过期时间，确保key是激活状态
      if (expiresAt) {
        updates.expiresAt = new Date(expiresAt).toISOString()
        // 如果之前是未激活状态，现在激活它
        if (keyData.isActivated !== 'true') {
          updates.isActivated = 'true'
          updates.activatedAt = new Date().toISOString()
        }
      } else {
        // 清除过期时间（永不过期）
        updates.expiresAt = ''
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' })
    }

    // 更新API Key
    await apiKeyService.updateApiKey(keyId, updates)

    logger.success(`📝 Updated API key expiration: ${keyId} (${keyData.name})`)
    return res.json({
      success: true,
      message: 'API key expiration updated successfully',
      updates
    })
  } catch (error) {
    logger.error('❌ Failed to update API key expiration:', error)
    return res.status(500).json({
      error: 'Failed to update API key expiration',
      message: error.message
    })
  }
})

// 批量删除API Keys（必须在 :keyId 路由之前定义）
router.delete('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds } = req.body

    // 调试信息
    logger.info(`🐛 Batch delete request body: ${JSON.stringify(req.body)}`)
    logger.info(`🐛 keyIds type: ${typeof keyIds}, value: ${JSON.stringify(keyIds)}`)

    // 参数验证
    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      logger.warn(
        `🚨 Invalid keyIds: ${JSON.stringify({
          keyIds,
          type: typeof keyIds,
          isArray: Array.isArray(keyIds)
        })}`
      )
      return res.status(400).json({
        error: 'Invalid request',
        message: 'keyIds 必须是一个非空数组'
      })
    }

    if (keyIds.length > 100) {
      return res.status(400).json({
        error: 'Too many keys',
        message: '每次最多只能删除100个API Keys'
      })
    }

    // 验证keyIds格式
    const invalidKeys = keyIds.filter((id) => !id || typeof id !== 'string')
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: 'Invalid key IDs',
        message: '包含无效的API Key ID'
      })
    }

    logger.info(
      `🗑️ Admin attempting batch delete of ${keyIds.length} API keys: ${JSON.stringify(keyIds)}`
    )

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: []
    }

    // 逐个删除，记录成功和失败情况
    for (const keyId of keyIds) {
      try {
        // 检查API Key是否存在
        const apiKey = await redis.getApiKey(keyId)
        if (!apiKey || Object.keys(apiKey).length === 0) {
          results.failedCount++
          results.errors.push({ keyId, error: 'API Key 不存在' })
          continue
        }

        // 执行删除
        await apiKeyService.deleteApiKey(keyId)
        results.successCount++

        logger.success(`✅ Batch delete: API key ${keyId} deleted successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push({
          keyId,
          error: error.message || '删除失败'
        })

        logger.error(`❌ Batch delete failed for key ${keyId}:`, error)
      }
    }

    // 记录批量删除结果
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch delete completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch delete completed with no successful deletions: ${results.failedCount} failed`
      )
    }

    return res.json({
      success: true,
      message: `批量删除完成`,
      data: results
    })
  } catch (error) {
    logger.error('❌ Failed to batch delete API keys:', error)
    return res.status(500).json({
      error: 'Batch delete failed',
      message: error.message
    })
  }
})

// 删除单个API Key（必须在批量删除路由之后定义）
router.delete('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params

    await apiKeyService.deleteApiKey(keyId, req.admin.username, 'admin')

    logger.success(`🗑️ Admin deleted API key: ${keyId}`)
    return res.json({ success: true, message: 'API key deleted successfully' })
  } catch (error) {
    logger.error('❌ Failed to delete API key:', error)
    return res.status(500).json({ error: 'Failed to delete API key', message: error.message })
  }
})

// 📋 获取已删除的API Keys
router.get('/api-keys/deleted', authenticateAdmin, async (req, res) => {
  try {
    const deletedApiKeys = await apiKeyService.getAllApiKeys(true) // Include deleted
    const onlyDeleted = deletedApiKeys.filter((key) => key.isDeleted === 'true')

    // Add additional metadata for deleted keys
    const enrichedKeys = onlyDeleted.map((key) => ({
      ...key,
      isDeleted: key.isDeleted === 'true',
      deletedAt: key.deletedAt,
      deletedBy: key.deletedBy,
      deletedByType: key.deletedByType,
      canRestore: true // 已删除的API Key可以恢复
    }))

    logger.success(`📋 Admin retrieved ${enrichedKeys.length} deleted API keys`)
    return res.json({ success: true, apiKeys: enrichedKeys, total: enrichedKeys.length })
  } catch (error) {
    logger.error('❌ Failed to get deleted API keys:', error)
    return res
      .status(500)
      .json({ error: 'Failed to retrieve deleted API keys', message: error.message })
  }
})

// 🔄 恢复已删除的API Key
router.post('/api-keys/:keyId/restore', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的恢复方法
    const result = await apiKeyService.restoreApiKey(keyId, adminUsername, 'admin')

    if (result.success) {
      logger.success(`✅ Admin ${adminUsername} restored API key: ${keyId}`)
      return res.json({
        success: true,
        message: 'API Key 已成功恢复',
        apiKey: result.apiKey
      })
    } else {
      return res.status(400).json({
        success: false,
        error: 'Failed to restore API key'
      })
    }
  } catch (error) {
    logger.error('❌ Failed to restore API key:', error)

    // 根据错误类型返回适当的响应
    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    } else if (error.message === 'API key is not deleted') {
      return res.status(400).json({
        success: false,
        error: '该 API Key 未被删除，无需恢复'
      })
    }

    return res.status(500).json({
      success: false,
      error: '恢复 API Key 失败',
      message: error.message
    })
  }
})

// 🗑️ 彻底删除API Key（物理删除）
router.delete('/api-keys/:keyId/permanent', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的彻底删除方法
    const result = await apiKeyService.permanentDeleteApiKey(keyId)

    if (result.success) {
      logger.success(`🗑️ Admin ${adminUsername} permanently deleted API key: ${keyId}`)
      return res.json({
        success: true,
        message: 'API Key 已彻底删除'
      })
    }
  } catch (error) {
    logger.error('❌ Failed to permanently delete API key:', error)

    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    } else if (error.message === '只能彻底删除已经删除的API Key') {
      return res.status(400).json({
        success: false,
        error: '只能彻底删除已经删除的API Key'
      })
    }

    return res.status(500).json({
      success: false,
      error: '彻底删除 API Key 失败',
      message: error.message
    })
  }
})

// 🧹 清空所有已删除的API Keys
router.delete('/api-keys/deleted/clear-all', authenticateAdmin, async (req, res) => {
  try {
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的清空方法
    const result = await apiKeyService.clearAllDeletedApiKeys()

    logger.success(
      `🧹 Admin ${adminUsername} cleared deleted API keys: ${result.successCount}/${result.total}`
    )

    return res.json({
      success: true,
      message: `成功清空 ${result.successCount} 个已删除的 API Keys`,
      details: {
        total: result.total,
        successCount: result.successCount,
        failedCount: result.failedCount,
        errors: result.errors
      }
    })
  } catch (error) {
    logger.error('❌ Failed to clear all deleted API keys:', error)
    return res.status(500).json({
      success: false,
      error: '清空已删除的 API Keys 失败',
      message: error.message
    })
  }
})

// 👥 账户分组管理

// 创建账户分组
router.post('/account-groups', authenticateAdmin, async (req, res) => {
  try {
    const { name, platform, description } = req.body

    const group = await accountGroupService.createGroup({
      name,
      platform,
      description
    })

    return res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to create account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

// 获取所有分组
router.get('/account-groups', authenticateAdmin, async (req, res) => {
  try {
    const { platform } = req.query
    const groups = await accountGroupService.getAllGroups(platform)
    return res.json({ success: true, data: groups })
  } catch (error) {
    logger.error('❌ Failed to get account groups:', error)
    return res.status(500).json({ error: error.message })
  }
})

// 获取分组详情
router.get('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const group = await accountGroupService.getGroup(groupId)

    if (!group) {
      return res.status(404).json({ error: '分组不存在' })
    }

    return res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to get account group:', error)
    return res.status(500).json({ error: error.message })
  }
})

// 更新分组
router.put('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const updates = req.body

    const updatedGroup = await accountGroupService.updateGroup(groupId, updates)
    return res.json({ success: true, data: updatedGroup })
  } catch (error) {
    logger.error('❌ Failed to update account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

// 删除分组
router.delete('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    await accountGroupService.deleteGroup(groupId)
    return res.json({ success: true, message: '分组删除成功' })
  } catch (error) {
    logger.error('❌ Failed to delete account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

// 获取分组成员
router.get('/account-groups/:groupId/members', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const group = await accountGroupService.getGroup(groupId)

    if (!group) {
      return res.status(404).json({ error: '分组不存在' })
    }

    const memberIds = await accountGroupService.getGroupMembers(groupId)

    // 获取成员详细信息
    const members = []
    for (const memberId of memberIds) {
      // 根据分组平台优先查找对应账户
      let account = null
      switch (group.platform) {
        case 'droid':
          account = await droidAccountService.getAccount(memberId)
          break
        case 'gemini':
          account = await geminiAccountService.getAccount(memberId)
          break
        case 'openai':
          account = await openaiAccountService.getAccount(memberId)
          break
        case 'claude':
        default:
          account = await claudeAccountService.getAccount(memberId)
          if (!account) {
            account = await claudeConsoleAccountService.getAccount(memberId)
          }
          break
      }

      // 兼容旧数据：若按平台未找到，则继续尝试其他平台
      if (!account) {
        account = await claudeAccountService.getAccount(memberId)
      }
      if (!account) {
        account = await claudeConsoleAccountService.getAccount(memberId)
      }
      if (!account) {
        account = await geminiAccountService.getAccount(memberId)
      }
      if (!account) {
        account = await openaiAccountService.getAccount(memberId)
      }
      if (!account && group.platform !== 'droid') {
        account = await droidAccountService.getAccount(memberId)
      }

      if (account) {
        members.push(account)
      }
    }

    return res.json({ success: true, data: members })
  } catch (error) {
    logger.error('❌ Failed to get group members:', error)
    return res.status(500).json({ error: error.message })
  }
})

// 🏢 Claude 账户管理

// 生成OAuth授权URL
router.post('/claude-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body // 接收代理配置
    const oauthParams = await oauthHelper.generateOAuthParams()

    // 将codeVerifier和state临时存储到Redis，用于后续验证
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      codeVerifier: oauthParams.codeVerifier,
      state: oauthParams.state,
      codeChallenge: oauthParams.codeChallenge,
      proxy: proxy || null, // 存储代理配置
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    })

    logger.success('🔗 Generated OAuth authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: oauthParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL',
          '5. 在添加账户表单中粘贴完整的回调 URL 和授权码'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate OAuth URL:', error)
    return res.status(500).json({ error: 'Failed to generate OAuth URL', message: error.message })
  }
})

// 验证授权码并获取token
router.post('/claude-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body

    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }

    // 从Redis获取OAuth会话信息
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    // 统一处理授权码输入（可能是直接的code或完整的回调URL）
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode

    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }

    // 交换访问令牌
    const tokenData = await oauthHelper.exchangeCodeForTokens(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy // 传递代理配置
    )

    // 清理OAuth会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('🎉 Successfully exchanged authorization code for tokens')
    return res.json({
      success: true,
      data: {
        claudeAiOauth: tokenData
      }
    })
  } catch (error) {
    logger.error('❌ Failed to exchange authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      // 不记录完整的授权码，只记录长度和前几个字符
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange authorization code', message: error.message })
  }
})

// 生成Claude setup-token授权URL
router.post('/claude-accounts/generate-setup-token-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body // 接收代理配置
    const setupTokenParams = await oauthHelper.generateSetupTokenParams()

    // 将codeVerifier和state临时存储到Redis，用于后续验证
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      type: 'setup-token', // 标记为setup-token类型
      codeVerifier: setupTokenParams.codeVerifier,
      state: setupTokenParams.state,
      codeChallenge: setupTokenParams.codeChallenge,
      proxy: proxy || null, // 存储代理配置
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10分钟过期
    })

    logger.success('🔗 Generated Setup Token authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: setupTokenParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Claude 账户并授权 Claude Code',
          '3. 完成授权后，从返回页面复制 Authorization Code',
          '4. 在添加账户表单中粘贴 Authorization Code'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Setup Token URL:', error)
    return res
      .status(500)
      .json({ error: 'Failed to generate Setup Token URL', message: error.message })
  }
})

// 验证setup-token授权码并获取token
router.post('/claude-accounts/exchange-setup-token-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body

    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }

    // 从Redis获取OAuth会话信息
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    // 检查是否是setup-token类型
    if (oauthSession.type !== 'setup-token') {
      return res.status(400).json({ error: 'Invalid session type for setup token exchange' })
    }

    // 检查会话是否过期
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    // 统一处理授权码输入（可能是直接的code或完整的回调URL）
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode

    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }

    // 交换Setup Token
    const tokenData = await oauthHelper.exchangeSetupTokenCode(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy // 传递代理配置
    )

    // 清理OAuth会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('🎉 Successfully exchanged setup token authorization code for tokens')
    return res.json({
      success: true,
      data: {
        claudeAiOauth: tokenData
      }
    })
  } catch (error) {
    logger.error('❌ Failed to exchange setup token authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      // 不记录完整的授权码，只记录长度和前几个字符
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange setup token authorization code', message: error.message })
  }
})

// 获取所有Claude账户
router.get('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await claudeAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'claude') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          // 获取会话窗口使用统计（仅对有活跃窗口的账户）
          let sessionWindowUsage = null
          if (account.sessionWindow && account.sessionWindow.hasActiveWindow) {
            const windowUsage = await redis.getAccountSessionWindowUsage(
              account.id,
              account.sessionWindow.windowStart,
              account.sessionWindow.windowEnd
            )

            // 计算会话窗口的总费用
            let totalCost = 0
            const modelCosts = {}

            for (const [modelName, usage] of Object.entries(windowUsage.modelUsage)) {
              const usageData = {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                cache_creation_input_tokens: usage.cacheCreateTokens,
                cache_read_input_tokens: usage.cacheReadTokens
              }

              logger.debug(`💰 Calculating cost for model ${modelName}:`, JSON.stringify(usageData))
              const costResult = CostCalculator.calculateCost(usageData, modelName)
              logger.debug(`💰 Cost result for ${modelName}: total=${costResult.costs.total}`)

              modelCosts[modelName] = {
                ...usage,
                cost: costResult.costs.total
              }
              totalCost += costResult.costs.total
            }

            sessionWindowUsage = {
              totalTokens: windowUsage.totalAllTokens,
              totalRequests: windowUsage.totalRequests,
              totalCost,
              modelUsage: modelCosts
            }
          }

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            // 转换schedulable为布尔值
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages,
              sessionWindow: sessionWindowUsage
            }
          }
        } catch (statsError) {
          logger.warn(`⚠️ Failed to get usage stats for account ${account.id}:`, statsError.message)
          // 如果获取统计失败，返回空统计
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Claude accounts:', error)
    return res.status(500).json({ error: 'Failed to get Claude accounts', message: error.message })
  }
})

// 批量获取 Claude 账户的 OAuth Usage 数据
router.get('/claude-accounts/usage', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await redis.getAllClaudeAccounts()
    const now = Date.now()
    const usageCacheTtlMs = 300 * 1000

    // 批量并发获取所有活跃 OAuth 账户的 Usage
    const usagePromises = accounts.map(async (account) => {
      // 检查是否为 OAuth 账户：scopes 包含 OAuth 相关权限
      const scopes = account.scopes && account.scopes.trim() ? account.scopes.split(' ') : []
      const isOAuth = scopes.includes('user:profile') && scopes.includes('user:inference')

      // 仅为 OAuth 授权的活跃账户调用 usage API
      if (
        isOAuth &&
        account.isActive === 'true' &&
        account.accessToken &&
        account.status === 'active'
      ) {
        // 若快照在 300 秒内更新，直接使用缓存避免频繁请求
        const cachedUsage = claudeAccountService.buildClaudeUsageSnapshot(account)
        const lastUpdatedAt = account.claudeUsageUpdatedAt
          ? new Date(account.claudeUsageUpdatedAt).getTime()
          : 0
        const isCacheFresh = cachedUsage && lastUpdatedAt && now - lastUpdatedAt < usageCacheTtlMs
        if (isCacheFresh) {
          return {
            accountId: account.id,
            claudeUsage: cachedUsage
          }
        }

        try {
          const usageData = await claudeAccountService.fetchOAuthUsage(account.id)
          if (usageData) {
            await claudeAccountService.updateClaudeUsageSnapshot(account.id, usageData)
          }
          // 重新读取更新后的数据
          const updatedAccount = await redis.getClaudeAccount(account.id)
          return {
            accountId: account.id,
            claudeUsage: claudeAccountService.buildClaudeUsageSnapshot(updatedAccount)
          }
        } catch (error) {
          logger.debug(`Failed to fetch OAuth usage for ${account.id}:`, error.message)
          return { accountId: account.id, claudeUsage: null }
        }
      }
      // Setup Token 账户不调用 usage API，直接返回 null
      return { accountId: account.id, claudeUsage: null }
    })

    const results = await Promise.allSettled(usagePromises)

    // 转换为 { accountId: usage } 映射
    const usageMap = {}
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        usageMap[result.value.accountId] = result.value.claudeUsage
      }
    })

    res.json({ success: true, data: usageMap })
  } catch (error) {
    logger.error('❌ Failed to fetch Claude accounts usage:', error)
    res.status(500).json({ error: 'Failed to fetch usage data', message: error.message })
  }
})

// 创建新的Claude账户
router.post('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType,
      platform = 'claude',
      priority,
      groupId,
      groupIds,
      autoStopOnWarning,
      useUnifiedUserAgent,
      useUnifiedClientId,
      unifiedClientId,
      expiresAt,
      extInfo
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId或groupIds
    if (accountType === 'group' && !groupId && (!groupIds || groupIds.length === 0)) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }

    // 验证priority的有效性
    if (
      priority !== undefined &&
      (typeof priority !== 'number' || priority < 1 || priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }

    const newAccount = await claudeAccountService.createAccount({
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType: accountType || 'shared', // 默认为共享类型
      platform,
      priority: priority || 50, // 默认优先级为50
      autoStopOnWarning: autoStopOnWarning === true, // 默认为false
      useUnifiedUserAgent: useUnifiedUserAgent === true, // 默认为false
      useUnifiedClientId: useUnifiedClientId === true, // 默认为false
      unifiedClientId: unifiedClientId || '', // 统一的客户端标识
      expiresAt: expiresAt || null, // 账户订阅到期时间
      extInfo: extInfo || null
    })

    // 如果是分组类型，将账户添加到分组
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        // 使用多分组设置
        await accountGroupService.setAccountGroups(newAccount.id, groupIds, newAccount.platform)
      } else if (groupId) {
        // 兼容单分组模式
        await accountGroupService.addAccountToGroup(newAccount.id, groupId, newAccount.platform)
      }
    }

    logger.success(`🏢 Admin created new Claude account: ${name} (${accountType || 'shared'})`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Claude account', message: error.message })
  }
})

// 更新Claude账户
router.put('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【修改】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt（提前到参数验证之前）
    const mappedUpdates = mapExpiryField(updates, 'Claude', accountId)

    // 验证priority的有效性
    if (
      mappedUpdates.priority !== undefined &&
      (typeof mappedUpdates.priority !== 'number' ||
        mappedUpdates.priority < 1 ||
        mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId或groupIds
    if (
      mappedUpdates.accountType === 'group' &&
      !mappedUpdates.groupId &&
      (!mappedUpdates.groupIds || mappedUpdates.groupIds.length === 0)
    ) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await claudeAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        await accountGroupService.removeAccountFromAllGroups(accountId)
      }

      // 如果新类型是分组，添加到新分组
      if (mappedUpdates.accountType === 'group') {
        // 处理多分组/单分组的兼容性
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 使用多分组设置
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'claude')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 兼容单分组模式
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'claude')
        }
      }
    }

    await claudeAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated Claude account: ${accountId}`)
    return res.json({ success: true, message: 'Claude account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Claude account', message: error.message })
  }
})

// 删除Claude账户
router.delete('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'claude')

    // 获取账户信息以检查是否在分组中
    const account = await claudeAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await claudeAccountService.deleteAccount(accountId)

    let message = 'Claude账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Claude account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Claude account', message: error.message })
  }
})

// 更新单个Claude账户的Profile信息
router.post('/claude-accounts/:accountId/update-profile', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const profileInfo = await claudeAccountService.fetchAndUpdateAccountProfile(accountId)

    logger.success(`✅ Updated profile for Claude account: ${accountId}`)
    return res.json({
      success: true,
      message: 'Account profile updated successfully',
      data: profileInfo
    })
  } catch (error) {
    logger.error('❌ Failed to update account profile:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update account profile', message: error.message })
  }
})

// 批量更新所有Claude账户的Profile信息
router.post('/claude-accounts/update-all-profiles', authenticateAdmin, async (req, res) => {
  try {
    const result = await claudeAccountService.updateAllAccountProfiles()

    logger.success('✅ Batch profile update completed')
    return res.json({
      success: true,
      message: 'Batch profile update completed',
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to update all account profiles:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update all account profiles', message: error.message })
  }
})

// 刷新Claude账户token
router.post('/claude-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await claudeAccountService.refreshAccountToken(accountId)

    logger.success(`🔄 Admin refreshed token for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Claude account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 重置Claude账户状态（清除所有异常状态）
router.post('/claude-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await claudeAccountService.resetAccountStatus(accountId)

    logger.success(`✅ Admin reset status for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Claude account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换Claude账户调度状态
router.put(
  '/claude-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const accounts = await claudeAccountService.getAllAccounts()
      const account = accounts.find((acc) => acc.id === accountId)

      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }

      const newSchedulable = !account.schedulable
      await claudeAccountService.updateAccount(accountId, { schedulable: newSchedulable })

      // 如果账号被禁用，发送webhook通知
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || account.claudeAiOauth?.email || 'Claude Account',
          platform: 'claude-oauth',
          status: 'disabled',
          errorCode: 'CLAUDE_OAUTH_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }

      logger.success(
        `🔄 Admin toggled Claude account schedulable status: ${accountId} -> ${
          newSchedulable ? 'schedulable' : 'not schedulable'
        }`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Claude account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 🎮 Claude Console 账户管理

// 获取所有Claude Console账户
router.get('/claude-console-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await claudeConsoleAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'claude-console') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            // 转换schedulable为布尔值
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Claude Console account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              // 转换schedulable为布尔值
              schedulable: account.schedulable === 'true' || account.schedulable === true,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for Claude Console account ${account.id}:`,
              groupError.message
            )
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Claude Console accounts:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get Claude Console accounts', message: error.message })
  }
})

// 创建新的Claude Console账户
router.post('/claude-console-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      apiUrl,
      apiKey,
      priority,
      supportedModels,
      userAgent,
      rateLimitDuration,
      proxy,
      accountType,
      groupId,
      dailyQuota,
      quotaResetTime
    } = req.body

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({ error: 'Name, API URL and API Key are required' })
    }

    // 验证priority的有效性（1-100）
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId
    if (accountType === 'group' && !groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    const newAccount = await claudeConsoleAccountService.createAccount({
      name,
      description,
      apiUrl,
      apiKey,
      priority: priority || 50,
      supportedModels: supportedModels || [],
      userAgent,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      proxy,
      accountType: accountType || 'shared',
      dailyQuota: dailyQuota || 0,
      quotaResetTime: quotaResetTime || '00:00'
    })

    // 如果是分组类型，将账户添加到分组（CCR 归属 Claude 平台分组）
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, groupId, 'claude')
    }

    logger.success(`🎮 Admin created Claude Console account: ${name}`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Claude Console account', message: error.message })
  }
})

// 更新Claude Console账户
router.put('/claude-console-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Claude Console', accountId)

    // 验证priority的有效性（1-100）
    if (
      mappedUpdates.priority !== undefined &&
      (mappedUpdates.priority < 1 || mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId
    if (mappedUpdates.accountType === 'group' && !mappedUpdates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await claudeConsoleAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'claude')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'claude')
        }
      }
    }

    await claudeConsoleAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated Claude Console account: ${accountId}`)
    return res.json({ success: true, message: 'Claude Console account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Claude Console account', message: error.message })
  }
})

// 删除Claude Console账户
router.delete('/claude-console-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'claude-console')

    // 获取账户信息以检查是否在分组中
    const account = await claudeConsoleAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await claudeConsoleAccountService.deleteAccount(accountId)

    let message = 'Claude Console账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(
      `🗑️ Admin deleted Claude Console account: ${accountId}, unbound ${unboundCount} keys`
    )
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Claude Console account', message: error.message })
  }
})

// 切换Claude Console账户状态
router.put('/claude-console-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await claudeConsoleAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newStatus = !account.isActive
    await claudeConsoleAccountService.updateAccount(accountId, { isActive: newStatus })

    logger.success(
      `🔄 Admin toggled Claude Console account status: ${accountId} -> ${
        newStatus ? 'active' : 'inactive'
      }`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle Claude Console account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换Claude Console账户调度状态
router.put(
  '/claude-console-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }

      const newSchedulable = !account.schedulable
      await claudeConsoleAccountService.updateAccount(accountId, { schedulable: newSchedulable })

      // 如果账号被禁用，发送webhook通知
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'disabled',
          errorCode: 'CLAUDE_CONSOLE_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }

      logger.success(
        `🔄 Admin toggled Claude Console account schedulable status: ${accountId} -> ${
          newSchedulable ? 'schedulable' : 'not schedulable'
        }`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Claude Console account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 获取Claude Console账户的使用统计
router.get('/claude-console-accounts/:accountId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const usageStats = await claudeConsoleAccountService.getAccountUsageStats(accountId)

    if (!usageStats) {
      return res.status(404).json({ error: 'Account not found' })
    }

    return res.json(usageStats)
  } catch (error) {
    logger.error('❌ Failed to get Claude Console account usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 手动重置Claude Console账户的每日使用量
router.post(
  '/claude-console-accounts/:accountId/reset-usage',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      await claudeConsoleAccountService.resetDailyUsage(accountId)

      logger.success(`✅ Admin manually reset daily usage for Claude Console account: ${accountId}`)
      return res.json({ success: true, message: 'Daily usage reset successfully' })
    } catch (error) {
      logger.error('❌ Failed to reset Claude Console account daily usage:', error)
      return res.status(500).json({ error: 'Failed to reset daily usage', message: error.message })
    }
  }
)

// 重置Claude Console账户状态（清除所有异常状态）
router.post(
  '/claude-console-accounts/:accountId/reset-status',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const result = await claudeConsoleAccountService.resetAccountStatus(accountId)
      logger.success(`✅ Admin reset status for Claude Console account: ${accountId}`)
      return res.json({ success: true, data: result })
    } catch (error) {
      logger.error('❌ Failed to reset Claude Console account status:', error)
      return res.status(500).json({ error: 'Failed to reset status', message: error.message })
    }
  }
)

// 手动重置所有Claude Console账户的每日使用量
router.post('/claude-console-accounts/reset-all-usage', authenticateAdmin, async (req, res) => {
  try {
    await claudeConsoleAccountService.resetAllDailyUsage()

    logger.success('✅ Admin manually reset daily usage for all Claude Console accounts')
    return res.json({ success: true, message: 'All daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset all Claude Console accounts daily usage:', error)
    return res
      .status(500)
      .json({ error: 'Failed to reset all daily usage', message: error.message })
  }
})

// 🔧 CCR 账户管理

// 获取所有CCR账户
router.get('/ccr-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await ccrAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'ccr') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id)
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            // 转换schedulable为布尔值
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for CCR account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              // 转换schedulable为布尔值
              schedulable: account.schedulable === 'true' || account.schedulable === true,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for CCR account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get CCR accounts:', error)
    return res.status(500).json({ error: 'Failed to get CCR accounts', message: error.message })
  }
})

// 创建新的CCR账户
router.post('/ccr-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      apiUrl,
      apiKey,
      priority,
      supportedModels,
      userAgent,
      rateLimitDuration,
      proxy,
      accountType,
      groupId,
      dailyQuota,
      quotaResetTime
    } = req.body

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({ error: 'Name, API URL and API Key are required' })
    }

    // 验证priority的有效性（1-100）
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId
    if (accountType === 'group' && !groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    const newAccount = await ccrAccountService.createAccount({
      name,
      description,
      apiUrl,
      apiKey,
      priority: priority || 50,
      supportedModels: supportedModels || [],
      userAgent,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      proxy,
      accountType: accountType || 'shared',
      dailyQuota: dailyQuota || 0,
      quotaResetTime: quotaResetTime || '00:00'
    })

    // 如果是分组类型，将账户添加到分组
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, groupId)
    }

    logger.success(`🔧 Admin created CCR account: ${name}`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create CCR account:', error)
    return res.status(500).json({ error: 'Failed to create CCR account', message: error.message })
  }
})

// 更新CCR账户
router.put('/ccr-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'CCR', accountId)

    // 验证priority的有效性（1-100）
    if (
      mappedUpdates.priority !== undefined &&
      (mappedUpdates.priority < 1 || mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId
    if (mappedUpdates.accountType === 'group' && !mappedUpdates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await ccrAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'claude')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'claude')
        }
      }
    }

    await ccrAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated CCR account: ${accountId}`)
    return res.json({ success: true, message: 'CCR account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update CCR account:', error)
    return res.status(500).json({ error: 'Failed to update CCR account', message: error.message })
  }
})

// 删除CCR账户
router.delete('/ccr-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 尝试自动解绑（CCR账户实际上不会绑定API Key，但保持代码一致性）
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'ccr')

    // 获取账户信息以检查是否在分组中
    const account = await ccrAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await ccrAccountService.deleteAccount(accountId)

    let message = 'CCR账号已成功删除'
    if (unboundCount > 0) {
      // 理论上不会发生，但保持消息格式一致
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted CCR account: ${accountId}`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete CCR account:', error)
    return res.status(500).json({ error: 'Failed to delete CCR account', message: error.message })
  }
})

// 切换CCR账户状态
router.put('/ccr-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newStatus = !account.isActive
    await ccrAccountService.updateAccount(accountId, { isActive: newStatus })

    logger.success(
      `🔄 Admin toggled CCR account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换CCR账户调度状态
router.put('/ccr-accounts/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newSchedulable = !account.schedulable
    await ccrAccountService.updateAccount(accountId, { schedulable: newSchedulable })

    // 如果账号被禁用，发送webhook通知
    if (!newSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'CCR Account',
        platform: 'ccr',
        status: 'disabled',
        errorCode: 'CCR_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled CCR account schedulable status: ${accountId} -> ${
        newSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )
    return res.json({ success: true, schedulable: newSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取CCR账户的使用统计
router.get('/ccr-accounts/:accountId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const usageStats = await ccrAccountService.getAccountUsageStats(accountId)

    if (!usageStats) {
      return res.status(404).json({ error: 'Account not found' })
    }

    return res.json(usageStats)
  } catch (error) {
    logger.error('❌ Failed to get CCR account usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 手动重置CCR账户的每日使用量
router.post('/ccr-accounts/:accountId/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    await ccrAccountService.resetDailyUsage(accountId)

    logger.success(`✅ Admin manually reset daily usage for CCR account: ${accountId}`)
    return res.json({ success: true, message: 'Daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account daily usage:', error)
    return res.status(500).json({ error: 'Failed to reset daily usage', message: error.message })
  }
})

// 重置CCR账户状态（清除所有异常状态）
router.post('/ccr-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await ccrAccountService.resetAccountStatus(accountId)
    logger.success(`✅ Admin reset status for CCR account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置所有CCR账户的每日使用量
router.post('/ccr-accounts/reset-all-usage', authenticateAdmin, async (req, res) => {
  try {
    await ccrAccountService.resetAllDailyUsage()

    logger.success('✅ Admin manually reset daily usage for all CCR accounts')
    return res.json({ success: true, message: 'All daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset all CCR accounts daily usage:', error)
    return res
      .status(500)
      .json({ error: 'Failed to reset all daily usage', message: error.message })
  }
})

// ☁️ Bedrock 账户管理

// 获取所有Bedrock账户
router.get('/bedrock-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to get Bedrock accounts', message: result.error })
    }

    let accounts = result.data

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'bedrock') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Bedrock account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Bedrock accounts:', error)
    return res.status(500).json({ error: 'Failed to get Bedrock accounts', message: error.message })
  }
})

// 创建新的Bedrock账户
router.post('/bedrock-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      region,
      awsCredentials,
      defaultModel,
      priority,
      accountType,
      credentialType
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    // 验证priority的有效性（1-100）
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }

    // 验证credentialType的有效性
    if (credentialType && !['default', 'access_key', 'bearer_token'].includes(credentialType)) {
      return res.status(400).json({
        error: 'Invalid credential type. Must be "default", "access_key", or "bearer_token"'
      })
    }

    const result = await bedrockAccountService.createAccount({
      name,
      description: description || '',
      region: region || 'us-east-1',
      awsCredentials,
      defaultModel,
      priority: priority || 50,
      accountType: accountType || 'shared',
      credentialType: credentialType || 'default'
    })

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to create Bedrock account', message: result.error })
    }

    logger.success(`☁️ Admin created Bedrock account: ${name}`)
    const formattedAccount = formatAccountExpiry(result.data)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Bedrock account', message: error.message })
  }
})

// 更新Bedrock账户
router.put('/bedrock-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Bedrock', accountId)

    // 验证priority的有效性（1-100）
    if (
      mappedUpdates.priority !== undefined &&
      (mappedUpdates.priority < 1 || mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (mappedUpdates.accountType && !['shared', 'dedicated'].includes(mappedUpdates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }

    // 验证credentialType的有效性
    if (
      mappedUpdates.credentialType &&
      !['default', 'access_key', 'bearer_token'].includes(mappedUpdates.credentialType)
    ) {
      return res.status(400).json({
        error: 'Invalid credential type. Must be "default", "access_key", or "bearer_token"'
      })
    }

    const result = await bedrockAccountService.updateAccount(accountId, mappedUpdates)

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to update Bedrock account', message: result.error })
    }

    logger.success(`📝 Admin updated Bedrock account: ${accountId}`)
    return res.json({ success: true, message: 'Bedrock account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Bedrock account', message: error.message })
  }
})

// 删除Bedrock账户
router.delete('/bedrock-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'bedrock')

    const result = await bedrockAccountService.deleteAccount(accountId)

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to delete Bedrock account', message: result.error })
    }

    let message = 'Bedrock账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Bedrock account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Bedrock account', message: error.message })
  }
})

// 切换Bedrock账户状态
router.put('/bedrock-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const accountResult = await bedrockAccountService.getAccount(accountId)
    if (!accountResult.success) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newStatus = !accountResult.data.isActive
    const updateResult = await bedrockAccountService.updateAccount(accountId, {
      isActive: newStatus
    })

    if (!updateResult.success) {
      return res
        .status(500)
        .json({ error: 'Failed to toggle account status', message: updateResult.error })
    }

    logger.success(
      `🔄 Admin toggled Bedrock account status: ${accountId} -> ${
        newStatus ? 'active' : 'inactive'
      }`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle Bedrock account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换Bedrock账户调度状态
router.put(
  '/bedrock-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const accountResult = await bedrockAccountService.getAccount(accountId)
      if (!accountResult.success) {
        return res.status(404).json({ error: 'Account not found' })
      }

      const newSchedulable = !accountResult.data.schedulable
      const updateResult = await bedrockAccountService.updateAccount(accountId, {
        schedulable: newSchedulable
      })

      if (!updateResult.success) {
        return res
          .status(500)
          .json({ error: 'Failed to toggle schedulable status', message: updateResult.error })
      }

      // 如果账号被禁用，发送webhook通知
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: accountResult.data.id,
          accountName: accountResult.data.name || 'Bedrock Account',
          platform: 'bedrock',
          status: 'disabled',
          errorCode: 'BEDROCK_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }

      logger.success(
        `🔄 Admin toggled Bedrock account schedulable status: ${accountId} -> ${
          newSchedulable ? 'schedulable' : 'not schedulable'
        }`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Bedrock account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 测试Bedrock账户连接
router.post('/bedrock-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await bedrockAccountService.testAccount(accountId)

    if (!result.success) {
      return res.status(500).json({ error: 'Account test failed', message: result.error })
    }

    logger.success(`🧪 Admin tested Bedrock account: ${accountId} - ${result.data.status}`)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    logger.error('❌ Failed to test Bedrock account:', error)
    return res.status(500).json({ error: 'Failed to test Bedrock account', message: error.message })
  }
})

// 🤖 Gemini 账户管理

// 生成 Gemini OAuth 授权 URL
router.post('/gemini-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { state, proxy } = req.body // 接收代理配置

    // 使用新的 codeassist.google.com 回调地址
    const redirectUri = 'https://codeassist.google.com/authcode'

    logger.info(`Generating Gemini OAuth URL with redirect_uri: ${redirectUri}`)

    const {
      authUrl,
      state: authState,
      codeVerifier,
      redirectUri: finalRedirectUri
    } = await geminiAccountService.generateAuthUrl(state, redirectUri, proxy)

    // 创建 OAuth 会话，包含 codeVerifier 和代理配置
    const sessionId = authState
    await redis.setOAuthSession(sessionId, {
      state: authState,
      type: 'gemini',
      redirectUri: finalRedirectUri,
      codeVerifier, // 保存 PKCE code verifier
      proxy: proxy || null, // 保存代理配置
      createdAt: new Date().toISOString()
    })

    logger.info(`Generated Gemini OAuth URL with session: ${sessionId}`)
    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Gemini auth URL:', error)
    return res.status(500).json({ error: 'Failed to generate auth URL', message: error.message })
  }
})

// 轮询 Gemini OAuth 授权状态
router.post('/gemini-accounts/poll-auth-status', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    const result = await geminiAccountService.pollAuthorizationStatus(sessionId)

    if (result.success) {
      logger.success(`✅ Gemini OAuth authorization successful for session: ${sessionId}`)
      return res.json({ success: true, data: { tokens: result.tokens } })
    } else {
      return res.json({ success: false, error: result.error })
    }
  } catch (error) {
    logger.error('❌ Failed to poll Gemini auth status:', error)
    return res.status(500).json({ error: 'Failed to poll auth status', message: error.message })
  }
})

// 交换 Gemini 授权码
router.post('/gemini-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId, proxy: requestProxy } = req.body

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' })
    }

    let redirectUri = 'https://codeassist.google.com/authcode'
    let codeVerifier = null
    let proxyConfig = null

    // 如果提供了 sessionId，从 OAuth 会话中获取信息
    if (sessionId) {
      const sessionData = await redis.getOAuthSession(sessionId)
      if (sessionData) {
        const {
          redirectUri: sessionRedirectUri,
          codeVerifier: sessionCodeVerifier,
          proxy
        } = sessionData
        redirectUri = sessionRedirectUri || redirectUri
        codeVerifier = sessionCodeVerifier
        proxyConfig = proxy // 获取代理配置
        logger.info(
          `Using session redirect_uri: ${redirectUri}, has codeVerifier: ${!!codeVerifier}, has proxy from session: ${!!proxyConfig}`
        )
      }
    }

    // 如果请求体中直接提供了代理配置，优先使用它
    if (requestProxy) {
      proxyConfig = requestProxy
      logger.info(
        `Using proxy from request body: ${proxyConfig ? JSON.stringify(proxyConfig) : 'none'}`
      )
    }

    const tokens = await geminiAccountService.exchangeCodeForTokens(
      code,
      redirectUri,
      codeVerifier,
      proxyConfig // 传递代理配置
    )

    // 清理 OAuth 会话
    if (sessionId) {
      await redis.deleteOAuthSession(sessionId)
    }

    logger.success('✅ Successfully exchanged Gemini authorization code')
    return res.json({ success: true, data: { tokens } })
  } catch (error) {
    logger.error('❌ Failed to exchange Gemini authorization code:', error)
    return res.status(500).json({ error: 'Failed to exchange code', message: error.message })
  }
})

// 获取所有 Gemini 账户
router.get('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await geminiAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'gemini') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息（与Claude账户相同的逻辑）
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Gemini account ${account.id}:`,
            statsError.message
          )
          // 如果获取统计失败，返回空统计
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Gemini accounts:', error)
    return res.status(500).json({ error: 'Failed to get accounts', message: error.message })
  }
})

// 创建新的 Gemini 账户
router.post('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body

    // 输入验证
    if (!accountData.name) {
      return res.status(400).json({ error: 'Account name is required' })
    }

    // 验证accountType的有效性
    if (
      accountData.accountType &&
      !['shared', 'dedicated', 'group'].includes(accountData.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId
    if (accountData.accountType === 'group' && !accountData.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    const newAccount = await geminiAccountService.createAccount(accountData)

    // 如果是分组类型，将账户添加到分组
    if (accountData.accountType === 'group' && accountData.groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, accountData.groupId, 'gemini')
    }

    logger.success(`🏢 Admin created new Gemini account: ${accountData.name}`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Gemini account:', error)
    return res.status(500).json({ error: 'Failed to create account', message: error.message })
  }
})

// 更新 Gemini 账户
router.put('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // 验证accountType的有效性
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId
    if (updates.accountType === 'group' && !updates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await geminiAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Gemini', accountId)

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'gemini')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'gemini')
        }
      }
    }

    const updatedAccount = await geminiAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated Gemini account: ${accountId}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update Gemini account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 Gemini 账户
router.delete('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'gemini')

    // 获取账户信息以检查是否在分组中
    const account = await geminiAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await geminiAccountService.deleteAccount(accountId)

    let message = 'Gemini账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Gemini account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete Gemini account:', error)
    return res.status(500).json({ error: 'Failed to delete account', message: error.message })
  }
})

// 刷新 Gemini 账户 token
router.post('/gemini-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await geminiAccountService.refreshAccountToken(accountId)

    logger.success(`🔄 Admin refreshed token for Gemini account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Gemini account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 切换 Gemini 账户调度状态
router.put(
  '/gemini-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const account = await geminiAccountService.getAccount(accountId)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }

      // 现在 account.schedulable 已经是布尔值了，直接取反即可
      const newSchedulable = !account.schedulable

      await geminiAccountService.updateAccount(accountId, { schedulable: String(newSchedulable) })

      // 验证更新是否成功，重新获取账户信息
      const updatedAccount = await geminiAccountService.getAccount(accountId)
      const actualSchedulable = updatedAccount ? updatedAccount.schedulable : newSchedulable

      // 如果账号被禁用，发送webhook通知
      if (!actualSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.accountName || 'Gemini Account',
          platform: 'gemini',
          status: 'disabled',
          errorCode: 'GEMINI_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }

      logger.success(
        `🔄 Admin toggled Gemini account schedulable status: ${accountId} -> ${
          actualSchedulable ? 'schedulable' : 'not schedulable'
        }`
      )

      // 返回实际的数据库值，确保前端状态与后端一致
      return res.json({ success: true, schedulable: actualSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Gemini account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

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
    const accountStats = await redis.getAccountUsageStats(accountId)

    // 获取账户基本信息
    const accountData = await claudeAccountService.getAccount(accountId)
    if (!accountData) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      })
    }

    return res.json({
      success: true,
      data: {
        ...accountStats,
        accountInfo: {
          name: accountData.name,
          email: accountData.email,
          status: accountData.status,
          isActive: accountData.isActive,
          createdAt: accountData.createdAt
        }
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
      'droid'
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
      droid: 'droid'
    }

    const fallbackModelMap = {
      claude: 'claude-3-5-sonnet-20241022',
      'claude-console': 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini-2024-07-18',
      'openai-responses': 'gpt-4o-mini-2024-07-18',
      gemini: 'gemini-1.5-flash',
      droid: 'unknown'
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
        case 'droid':
          accountData = await droidAccountService.getAccount(accountId)
          break
      }

      if (accountData && accountData.createdAt) {
        accountCreatedAt = new Date(accountData.createdAt)
      }
    } catch (error) {
      logger.warn(`Failed to get account data for avgDailyCost calculation: ${error.message}`)
    }

    const client = redis.getClientSafe()
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
      const modelKeys = await client.keys(modelPattern)
      let summedCost = 0

      if (modelKeys.length === 0) {
        return summedCost
      }

      for (const modelKey of modelKeys) {
        const modelParts = modelKey.split(':')
        const modelName = modelParts[4] || 'unknown'
        const modelData = await client.hgetall(modelKey)
        if (!modelData || Object.keys(modelData).length === 0) {
          continue
        }

        const usage = {
          input_tokens: parseInt(modelData.inputTokens) || 0,
          output_tokens: parseInt(modelData.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
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

// 获取使用趋势数据
router.get('/usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { days = 7, granularity = 'day', startDate, endDate } = req.query
    const client = redis.getClientSafe()

    const trendData = []

    if (granularity === 'hour') {
      // 小时粒度统计
      let startTime, endTime

      if (startDate && endDate) {
        // 使用自定义时间范围
        startTime = new Date(startDate)
        endTime = new Date(endDate)

        // 调试日志
        logger.info('📊 Usage trend hour granularity - received times:')
        logger.info(`  startDate (raw): ${startDate}`)
        logger.info(`  endDate (raw): ${endDate}`)
        logger.info(`  startTime (parsed): ${startTime.toISOString()}`)
        logger.info(`  endTime (parsed): ${endTime.toISOString()}`)
        logger.info(`  System timezone offset: ${config.system.timezoneOffset || 8}`)
      } else {
        // 默认最近24小时
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

      // 按小时遍历
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        // 注意：前端发送的时间已经是UTC时间，不需要再次转换
        // 直接从currentHour生成对应系统时区的日期和小时
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        // 获取当前小时的模型统计数据
        const modelPattern = `usage:model:hourly:*:${hourKey}`
        const modelKeys = await client.keys(modelPattern)

        let hourInputTokens = 0
        let hourOutputTokens = 0
        let hourRequests = 0
        let hourCacheCreateTokens = 0
        let hourCacheReadTokens = 0
        let hourCost = 0

        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:hourly:(.+):\d{4}-\d{2}-\d{2}:\d{2}$/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]
          const data = await client.hgetall(modelKey)

          if (data && Object.keys(data).length > 0) {
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
            const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
            hourCost += modelCostResult.costs.total
          }
        }

        // 如果没有模型级别的数据，尝试API Key级别的数据
        if (modelKeys.length === 0) {
          const pattern = `usage:hourly:*:${hourKey}`
          const keys = await client.keys(pattern)

          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data) {
              hourInputTokens += parseInt(data.inputTokens) || 0
              hourOutputTokens += parseInt(data.outputTokens) || 0
              hourRequests += parseInt(data.requests) || 0
              hourCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              hourCacheReadTokens += parseInt(data.cacheReadTokens) || 0
            }
          }

          const usage = {
            input_tokens: hourInputTokens,
            output_tokens: hourOutputTokens,
            cache_creation_input_tokens: hourCacheCreateTokens,
            cache_read_input_tokens: hourCacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          hourCost = costResult.costs.total
        }

        // 格式化时间标签 - 使用系统时区的显示
        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const month = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const day = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourStr = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        trendData.push({
          // 对于小时粒度，只返回hour字段，不返回date字段
          hour: currentHour.toISOString(), // 保留原始ISO时间用于排序
          label: `${month}/${day} ${hourStr}:00`, // 添加格式化的标签
          inputTokens: hourInputTokens,
          outputTokens: hourOutputTokens,
          requests: hourRequests,
          cacheCreateTokens: hourCacheCreateTokens,
          cacheReadTokens: hourCacheReadTokens,
          totalTokens:
            hourInputTokens + hourOutputTokens + hourCacheCreateTokens + hourCacheReadTokens,
          cost: hourCost
        })

        // 移到下一个小时
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      // 天粒度统计（保持原有逻辑）
      const daysCount = parseInt(days) || 7
      const today = new Date()

      // 获取过去N天的数据
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)

        // 汇总当天所有API Key的使用数据
        const pattern = `usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)

        let dayInputTokens = 0
        let dayOutputTokens = 0
        let dayRequests = 0
        let dayCacheCreateTokens = 0
        let dayCacheReadTokens = 0
        let dayCost = 0

        // 按模型统计使用量
        // const modelUsageMap = new Map();

        // 获取当天所有模型的使用数据
        const modelPattern = `usage:model:daily:*:${dateStr}`
        const modelKeys = await client.keys(modelPattern)

        for (const modelKey of modelKeys) {
          // 解析模型名称
          const modelMatch = modelKey.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!modelMatch) {
            continue
          }

          const model = modelMatch[1]
          const data = await client.hgetall(modelKey)

          if (data && Object.keys(data).length > 0) {
            const modelInputTokens = parseInt(data.inputTokens) || 0
            const modelOutputTokens = parseInt(data.outputTokens) || 0
            const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const modelRequests = parseInt(data.requests) || 0

            // 累加总数
            dayInputTokens += modelInputTokens
            dayOutputTokens += modelOutputTokens
            dayCacheCreateTokens += modelCacheCreateTokens
            dayCacheReadTokens += modelCacheReadTokens
            dayRequests += modelRequests

            // 按模型计算费用
            const modelUsage = {
              input_tokens: modelInputTokens,
              output_tokens: modelOutputTokens,
              cache_creation_input_tokens: modelCacheCreateTokens,
              cache_read_input_tokens: modelCacheReadTokens
            }
            const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
            dayCost += modelCostResult.costs.total
          }
        }

        // 如果没有模型级别的数据，回退到原始方法
        if (modelKeys.length === 0 && keys.length > 0) {
          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data) {
              dayInputTokens += parseInt(data.inputTokens) || 0
              dayOutputTokens += parseInt(data.outputTokens) || 0
              dayRequests += parseInt(data.requests) || 0
              dayCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              dayCacheReadTokens += parseInt(data.cacheReadTokens) || 0
            }
          }

          // 使用默认模型价格计算
          const usage = {
            input_tokens: dayInputTokens,
            output_tokens: dayOutputTokens,
            cache_creation_input_tokens: dayCacheCreateTokens,
            cache_read_input_tokens: dayCacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          dayCost = costResult.costs.total
        }

        trendData.push({
          date: dateStr,
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

    const client = redis.getClientSafe()
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

    for (const pattern of searchPatterns) {
      const keys = await client.keys(pattern)
      logger.info(`📊 Pattern ${pattern} found ${keys.length} keys`)

      for (const key of keys) {
        const match =
          key.match(/usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/) ||
          key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/)

        if (!match) {
          logger.warn(`📊 Pattern mismatch for key: ${key}`)
          continue
        }

        const model = match[1]
        const data = await client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          // 累加同一模型的数据
          if (!modelStatsMap.has(model)) {
            modelStatsMap.set(model, {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0,
              allTokens: 0
            })
          }

          const stats = modelStatsMap.get(model)
          stats.requests += parseInt(data.requests) || 0
          stats.inputTokens += parseInt(data.inputTokens) || 0
          stats.outputTokens += parseInt(data.outputTokens) || 0
          stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          stats.allTokens += parseInt(data.allTokens) || 0
        }
      }
    }

    // 将汇总的数据转换为最终结果
    for (const [model, stats] of modelStatsMap) {
      logger.info(`📊 Model ${model} aggregated data:`, stats)

      const usage = {
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        cache_creation_input_tokens: stats.cacheCreateTokens,
        cache_read_input_tokens: stats.cacheReadTokens
      }

      // 使用CostCalculator计算费用
      const costData = CostCalculator.calculateCost(usage, model)

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
        const apiKeys = await apiKeyService.getAllApiKeys()
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

    const allowedGroups = ['claude', 'openai', 'gemini', 'droid']
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
      droid: 'Droid账户'
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
      const geminiAccounts = await geminiAccountService.getAllAccounts()
      accounts = geminiAccounts.map((account) => {
        const id = String(account.id || '')
        const shortId = id ? id.slice(0, 8) : '未知'
        return {
          id,
          name: account.name || account.email || `Gemini账号 ${shortId}`,
          platform: 'gemini'
        }
      })
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

    const client = redis.getClientSafe()
    const trendData = []
    const accountCostTotals = new Map()

    const sumModelCosts = async (accountId, period, timeKey) => {
      const modelPattern = `account_usage:model:${period}:${accountId}:*:${timeKey}`
      const modelKeys = await client.keys(modelPattern)
      let totalCost = 0

      for (const modelKey of modelKeys) {
        const modelData = await client.hgetall(modelKey)
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

        const costResult = CostCalculator.calculateCost(usage, modelName)
        totalCost += costResult.costs.total
      }

      return totalCost
    }

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

      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        const hourData = {
          hour: currentHour.toISOString(),
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`,
          accounts: {}
        }

        const pattern = `account_usage:hourly:*:${hourKey}`
        const keys = await client.keys(pattern)

        for (const key of keys) {
          const match = key.match(/account_usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const accountId = match[1]
          if (!accountIdSet.has(accountId)) {
            continue
          }

          const data = await client.hgetall(key)
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

          let cost = await sumModelCosts(accountId, 'hourly', hourKey)

          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
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
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      const daysCount = parseInt(days) || 7
      const today = new Date()

      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)

        const dayData = {
          date: dateStr,
          accounts: {}
        }

        const pattern = `account_usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)

        for (const key of keys) {
          const match = key.match(/account_usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const accountId = match[1]
          if (!accountIdSet.has(accountId)) {
            continue
          }

          const data = await client.hgetall(key)
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

          let cost = await sumModelCosts(accountId, 'daily', dateStr)

          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
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

    const client = redis.getClientSafe()
    const trendData = []

    // 获取所有API Keys
    const apiKeys = await apiKeyService.getAllApiKeys()
    const apiKeyMap = new Map(apiKeys.map((key) => [key.id, key]))

    if (granularity === 'hour') {
      // 小时粒度统计
      let endTime, startTime

      if (startDate && endDate) {
        // 自定义时间范围
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        // 默认近24小时
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }

      // 按小时遍历
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)

      while (currentHour <= endTime) {
        // 使用时区转换后的时间来生成键
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`

        // 获取这个小时所有API Key的数据
        const pattern = `usage:hourly:*:${hourKey}`
        const keys = await client.keys(pattern)

        // 格式化时间标签
        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')

        const hourData = {
          hour: currentHour.toISOString(), // 使用原始时间，不进行时区转换
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`, // 添加格式化的标签
          apiKeys: {}
        }

        // 先收集基础数据
        const apiKeyDataMap = new Map()
        for (const key of keys) {
          const match = key.match(/usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const data = await client.hgetall(key)

          if (data && apiKeyMap.has(apiKeyId)) {
            const inputTokens = parseInt(data.inputTokens) || 0
            const outputTokens = parseInt(data.outputTokens) || 0
            const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

            apiKeyDataMap.set(apiKeyId, {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0,
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            })
          }
        }

        // 获取该小时的模型级别数据来计算准确费用
        const modelPattern = `usage:*:model:hourly:*:${hourKey}`
        const modelKeys = await client.keys(modelPattern)
        const apiKeyCostMap = new Map()

        for (const modelKey of modelKeys) {
          const match = modelKey.match(/usage:(.+?):model:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const model = match[2]
          const modelData = await client.hgetall(modelKey)

          if (modelData && apiKeyDataMap.has(apiKeyId)) {
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            const costResult = CostCalculator.calculateCost(usage, model)
            const currentCost = apiKeyCostMap.get(apiKeyId) || 0
            apiKeyCostMap.set(apiKeyId, currentCost + costResult.costs.total)
          }
        }

        // 组合数据
        for (const [apiKeyId, data] of apiKeyDataMap) {
          const cost = apiKeyCostMap.get(apiKeyId) || 0

          // 如果没有模型级别数据，使用默认模型计算（降级方案）
          let finalCost = cost
          let formattedCost = CostCalculator.formatCost(cost)

          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            finalCost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }

          hourData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost: finalCost,
            formattedCost
          }
        }

        trendData.push(hourData)
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      // 天粒度统计
      const daysCount = parseInt(days) || 7
      const today = new Date()

      // 获取过去N天的数据
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)

        // 获取这一天所有API Key的数据
        const pattern = `usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)

        const dayData = {
          date: dateStr,
          apiKeys: {}
        }

        // 先收集基础数据
        const apiKeyDataMap = new Map()
        for (const key of keys) {
          const match = key.match(/usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const data = await client.hgetall(key)

          if (data && apiKeyMap.has(apiKeyId)) {
            const inputTokens = parseInt(data.inputTokens) || 0
            const outputTokens = parseInt(data.outputTokens) || 0
            const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

            apiKeyDataMap.set(apiKeyId, {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0,
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            })
          }
        }

        // 获取该天的模型级别数据来计算准确费用
        const modelPattern = `usage:*:model:daily:*:${dateStr}`
        const modelKeys = await client.keys(modelPattern)
        const apiKeyCostMap = new Map()

        for (const modelKey of modelKeys) {
          const match = modelKey.match(/usage:(.+?):model:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }

          const apiKeyId = match[1]
          const model = match[2]
          const modelData = await client.hgetall(modelKey)

          if (modelData && apiKeyDataMap.has(apiKeyId)) {
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }

            const costResult = CostCalculator.calculateCost(usage, model)
            const currentCost = apiKeyCostMap.get(apiKeyId) || 0
            apiKeyCostMap.set(apiKeyId, currentCost + costResult.costs.total)
          }
        }

        // 组合数据
        for (const [apiKeyId, data] of apiKeyDataMap) {
          const cost = apiKeyCostMap.get(apiKeyId) || 0

          // 如果没有模型级别数据，使用默认模型计算（降级方案）
          let finalCost = cost
          let formattedCost = CostCalculator.formatCost(cost)

          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            finalCost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }

          dayData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost: finalCost,
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

    // 获取所有API Keys的使用统计
    const apiKeys = await apiKeyService.getAllApiKeys()

    const totalCosts = {
      inputCost: 0,
      outputCost: 0,
      cacheCreateCost: 0,
      cacheReadCost: 0,
      totalCost: 0
    }

    const modelCosts = {}

    // 按模型统计费用
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`

    let pattern
    if (period === 'today') {
      pattern = `usage:model:daily:*:${today}`
    } else if (period === 'monthly') {
      pattern = `usage:model:monthly:*:${currentMonth}`
    } else if (period === '7days') {
      // 最近7天：汇总daily数据
      const modelUsageMap = new Map()

      // 获取最近7天的所有daily统计数据
      for (let i = 0; i < 7; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const currentTzDate = redis.getDateInTimezone(date)
        const dateStr = `${currentTzDate.getUTCFullYear()}-${String(
          currentTzDate.getUTCMonth() + 1
        ).padStart(2, '0')}-${String(currentTzDate.getUTCDate()).padStart(2, '0')}`
        const dayPattern = `usage:model:daily:*:${dateStr}`

        const dayKeys = await client.keys(dayPattern)

        for (const key of dayKeys) {
          const modelMatch = key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!modelMatch) {
            continue
          }

          const rawModel = modelMatch[1]
          const normalizedModel = normalizeModelName(rawModel)
          const data = await client.hgetall(key)

          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(normalizedModel)) {
              modelUsageMap.set(normalizedModel, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              })
            }

            const modelUsage = modelUsageMap.get(normalizedModel)
            modelUsage.inputTokens += parseInt(data.inputTokens) || 0
            modelUsage.outputTokens += parseInt(data.outputTokens) || 0
            modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          }
        }
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
      // 全部时间，先尝试从Redis获取所有历史模型统计数据（只使用monthly数据避免重复计算）
      const allModelKeys = await client.keys('usage:model:monthly:*:*')
      logger.info(`💰 Total period calculation: found ${allModelKeys.length} monthly model keys`)

      if (allModelKeys.length > 0) {
        // 如果有详细的模型统计数据，使用模型级别的计算
        const modelUsageMap = new Map()

        for (const key of allModelKeys) {
          // 解析模型名称（只处理monthly数据）
          const modelMatch = key.match(/usage:model:monthly:(.+):(\d{4}-\d{2})$/)
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

        // 使用模型级别的数据计算费用
        logger.info(`💰 Processing ${modelUsageMap.size} unique models for total cost calculation`)

        for (const [model, usage] of modelUsageMap) {
          const usageData = {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_creation_input_tokens: usage.cacheCreateTokens,
            cache_read_input_tokens: usage.cacheReadTokens
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
        // 如果没有详细的模型统计数据，回退到API Key汇总数据
        logger.warn('No detailed model statistics found, falling back to API Key aggregated data')

        for (const apiKey of apiKeys) {
          if (apiKey.usage && apiKey.usage.total) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
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

    // 对于今日或本月，从Redis获取详细的模型统计
    const keys = await client.keys(pattern)

    for (const key of keys) {
      const match = key.match(
        period === 'today'
          ? /usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
          : /usage:model:monthly:(.+):\d{4}-\d{2}$/
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

// 📋 获取所有账号的 Claude Code headers 信息
router.get('/claude-code-headers', authenticateAdmin, async (req, res) => {
  try {
    const allHeaders = await claudeCodeHeadersService.getAllAccountHeaders()

    // 获取所有 Claude 账号信息
    const accounts = await claudeAccountService.getAllAccounts()
    const accountMap = {}
    accounts.forEach((account) => {
      accountMap[account.id] = account.name
    })

    // 格式化输出
    const formattedData = Object.entries(allHeaders).map(([accountId, data]) => ({
      accountId,
      accountName: accountMap[accountId] || 'Unknown',
      version: data.version,
      userAgent: data.headers['user-agent'],
      updatedAt: data.updatedAt,
      headers: data.headers
    }))

    return res.json({
      success: true,
      data: formattedData
    })
  } catch (error) {
    logger.error('❌ Failed to get Claude Code headers:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get Claude Code headers', message: error.message })
  }
})

// 🗑️ 清除指定账号的 Claude Code headers
router.delete('/claude-code-headers/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    await claudeCodeHeadersService.clearAccountHeaders(accountId)

    return res.json({
      success: true,
      message: `Claude Code headers cleared for account ${accountId}`
    })
  } catch (error) {
    logger.error('❌ Failed to clear Claude Code headers:', error)
    return res
      .status(500)
      .json({ error: 'Failed to clear Claude Code headers', message: error.message })
  }
})

// 🔄 版本检查
router.get('/check-updates', authenticateAdmin, async (req, res) => {
  // 读取当前版本
  const versionPath = path.join(__dirname, '../../VERSION')
  let currentVersion = '1.0.0'
  try {
    currentVersion = fs.readFileSync(versionPath, 'utf8').trim()
  } catch (err) {
    logger.warn('⚠️ Could not read VERSION file:', err.message)
  }

  try {
    // 从缓存获取
    const cacheKey = 'version_check_cache'
    const cached = await redis.getClient().get(cacheKey)

    if (cached && !req.query.force) {
      const cachedData = JSON.parse(cached)
      const cacheAge = Date.now() - cachedData.timestamp

      // 缓存有效期1小时
      if (cacheAge < 3600000) {
        // 实时计算 hasUpdate，不使用缓存的值
        const hasUpdate = compareVersions(currentVersion, cachedData.latest) < 0

        return res.json({
          success: true,
          data: {
            current: currentVersion,
            latest: cachedData.latest,
            hasUpdate, // 实时计算，不用缓存
            releaseInfo: cachedData.releaseInfo,
            cached: true
          }
        })
      }
    }

    // 请求 GitHub API
    const githubRepo = 'wei-shaw/claude-relay-service'
    const response = await axios.get(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Relay-Service'
      },
      timeout: 10000
    })

    const release = response.data
    const latestVersion = release.tag_name.replace(/^v/, '')

    // 比较版本
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0

    const releaseInfo = {
      name: release.name,
      body: release.body,
      publishedAt: release.published_at,
      htmlUrl: release.html_url
    }

    // 缓存结果（不缓存 hasUpdate，因为它应该实时计算）
    await redis.getClient().set(
      cacheKey,
      JSON.stringify({
        latest: latestVersion,
        releaseInfo,
        timestamp: Date.now()
      }),
      'EX',
      3600
    ) // 1小时过期

    return res.json({
      success: true,
      data: {
        current: currentVersion,
        latest: latestVersion,
        hasUpdate,
        releaseInfo,
        cached: false
      }
    })
  } catch (error) {
    // 改进错误日志记录
    const errorDetails = {
      message: error.message || 'Unknown error',
      code: error.code,
      response: error.response
        ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          }
        : null,
      request: error.request ? 'Request was made but no response received' : null
    }

    logger.error('❌ Failed to check for updates:', errorDetails.message)

    // 处理 404 错误 - 仓库或版本不存在
    if (error.response && error.response.status === 404) {
      return res.json({
        success: true,
        data: {
          current: currentVersion,
          latest: currentVersion,
          hasUpdate: false,
          releaseInfo: {
            name: 'No releases found',
            body: 'The GitHub repository has no releases yet.',
            publishedAt: new Date().toISOString(),
            htmlUrl: '#'
          },
          warning: 'GitHub repository has no releases'
        }
      })
    }

    // 如果是网络错误，尝试返回缓存的数据
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      const cacheKey = 'version_check_cache'
      const cached = await redis.getClient().get(cacheKey)

      if (cached) {
        const cachedData = JSON.parse(cached)
        // 实时计算 hasUpdate
        const hasUpdate = compareVersions(currentVersion, cachedData.latest) < 0

        return res.json({
          success: true,
          data: {
            current: currentVersion,
            latest: cachedData.latest,
            hasUpdate, // 实时计算
            releaseInfo: cachedData.releaseInfo,
            cached: true,
            warning: 'Using cached data due to network error'
          }
        })
      }
    }

    // 其他错误返回当前版本信息
    return res.json({
      success: true,
      data: {
        current: currentVersion,
        latest: currentVersion,
        hasUpdate: false,
        releaseInfo: {
          name: 'Update check failed',
          body: `Unable to check for updates: ${error.message || 'Unknown error'}`,
          publishedAt: new Date().toISOString(),
          htmlUrl: '#'
        },
        error: true,
        warning: error.message || 'Failed to check for updates'
      }
    })
  }
})

// 版本比较函数
function compareVersions(current, latest) {
  const parseVersion = (v) => {
    const parts = v.split('.').map(Number)
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    }
  }

  const currentV = parseVersion(current)
  const latestV = parseVersion(latest)

  if (currentV.major !== latestV.major) {
    return currentV.major - latestV.major
  }
  if (currentV.minor !== latestV.minor) {
    return currentV.minor - latestV.minor
  }
  return currentV.patch - latestV.patch
}

// 🎨 OEM设置管理

// 获取OEM设置（公开接口，用于显示）
router.get('/oem-settings', async (req, res) => {
  try {
    const client = redis.getClient()
    const oemSettings = await client.get('oem:settings')

    // 默认设置
    const defaultSettings = {
      siteName: 'Claude Relay Service',
      siteIcon: '',
      siteIconData: '', // Base64编码的图标数据
      showAdminButton: true, // 是否显示管理后台按钮
      updatedAt: new Date().toISOString()
    }

    let settings = defaultSettings
    if (oemSettings) {
      try {
        settings = { ...defaultSettings, ...JSON.parse(oemSettings) }
      } catch (err) {
        logger.warn('⚠️ Failed to parse OEM settings, using defaults:', err.message)
      }
    }

    // 添加 LDAP 启用状态到响应中
    return res.json({
      success: true,
      data: {
        ...settings,
        ldapEnabled: config.ldap && config.ldap.enabled === true
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get OEM settings:', error)
    return res.status(500).json({ error: 'Failed to get OEM settings', message: error.message })
  }
})

// 更新OEM设置
router.put('/oem-settings', authenticateAdmin, async (req, res) => {
  try {
    const { siteName, siteIcon, siteIconData, showAdminButton } = req.body

    // 验证输入
    if (!siteName || typeof siteName !== 'string' || siteName.trim().length === 0) {
      return res.status(400).json({ error: 'Site name is required' })
    }

    if (siteName.length > 100) {
      return res.status(400).json({ error: 'Site name must be less than 100 characters' })
    }

    // 验证图标数据大小（如果是base64）
    if (siteIconData && siteIconData.length > 500000) {
      // 约375KB
      return res.status(400).json({ error: 'Icon file must be less than 350KB' })
    }

    // 验证图标URL（如果提供）
    if (siteIcon && !siteIconData) {
      // 简单验证URL格式
      try {
        new URL(siteIcon)
      } catch (err) {
        return res.status(400).json({ error: 'Invalid icon URL format' })
      }
    }

    const settings = {
      siteName: siteName.trim(),
      siteIcon: (siteIcon || '').trim(),
      siteIconData: (siteIconData || '').trim(), // Base64数据
      showAdminButton: showAdminButton !== false, // 默认为true
      updatedAt: new Date().toISOString()
    }

    const client = redis.getClient()
    await client.set('oem:settings', JSON.stringify(settings))

    logger.info(`✅ OEM settings updated: ${siteName}`)

    return res.json({
      success: true,
      message: 'OEM settings updated successfully',
      data: settings
    })
  } catch (error) {
    logger.error('❌ Failed to update OEM settings:', error)
    return res.status(500).json({ error: 'Failed to update OEM settings', message: error.message })
  }
})

// 🤖 OpenAI 账户管理

// OpenAI OAuth 配置
const OPENAI_CONFIG = {
  BASE_URL: 'https://auth.openai.com',
  CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  REDIRECT_URI: 'http://localhost:1455/auth/callback',
  SCOPE: 'openid profile email offline_access'
}

// 生成 PKCE 参数
function generateOpenAIPKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('hex')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

  return {
    codeVerifier,
    codeChallenge
  }
}

// 生成 OpenAI OAuth 授权 URL
router.post('/openai-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body

    // 生成 PKCE 参数
    const pkce = generateOpenAIPKCE()

    // 生成随机 state
    const state = crypto.randomBytes(32).toString('hex')

    // 创建会话 ID
    const sessionId = crypto.randomUUID()

    // 将 PKCE 参数和代理配置存储到 Redis
    await redis.setOAuthSession(sessionId, {
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      state,
      proxy: proxy || null,
      platform: 'openai',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })

    // 构建授权 URL 参数
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OPENAI_CONFIG.CLIENT_ID,
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      scope: OPENAI_CONFIG.SCOPE,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true'
    })

    const authUrl = `${OPENAI_CONFIG.BASE_URL}/oauth/authorize?${params.toString()}`

    logger.success('🔗 Generated OpenAI OAuth authorization URL')

    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 OpenAI 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL（包含 code 参数）',
          '5. 在添加账户表单中粘贴完整的回调 URL'
        ]
      }
    })
  } catch (error) {
    logger.error('生成 OpenAI OAuth URL 失败:', error)
    return res.status(500).json({
      success: false,
      message: '生成授权链接失败',
      error: error.message
    })
  }
})

// 交换 OpenAI 授权码
router.post('/openai-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId } = req.body

    if (!code || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      })
    }

    // 从 Redis 获取会话数据
    const sessionData = await redis.getOAuthSession(sessionId)
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: '会话已过期或无效'
      })
    }

    // 准备 token 交换请求
    const tokenData = {
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      client_id: OPENAI_CONFIG.CLIENT_ID,
      code_verifier: sessionData.codeVerifier
    }

    logger.info('Exchanging OpenAI authorization code:', {
      sessionId,
      codeLength: code.length,
      hasCodeVerifier: !!sessionData.codeVerifier
    })

    // 配置代理（如果有）
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }

    // 配置代理（如果有）
    const proxyAgent = ProxyHelper.createProxyAgent(sessionData.proxy)
    if (proxyAgent) {
      axiosConfig.httpAgent = proxyAgent
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
    }

    // 交换 authorization code 获取 tokens
    const tokenResponse = await axios.post(
      `${OPENAI_CONFIG.BASE_URL}/oauth/token`,
      new URLSearchParams(tokenData).toString(),
      axiosConfig
    )

    const { id_token, access_token, refresh_token, expires_in } = tokenResponse.data

    // 解析 ID token 获取用户信息
    const idTokenParts = id_token.split('.')
    if (idTokenParts.length !== 3) {
      throw new Error('Invalid ID token format')
    }

    // 解码 JWT payload
    const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64url').toString())

    // 获取 OpenAI 特定的声明
    const authClaims = payload['https://api.openai.com/auth'] || {}
    const accountId = authClaims.chatgpt_account_id || ''
    const chatgptUserId = authClaims.chatgpt_user_id || authClaims.user_id || ''
    const planType = authClaims.chatgpt_plan_type || ''

    // 获取组织信息
    const organizations = authClaims.organizations || []
    const defaultOrg = organizations.find((org) => org.is_default) || organizations[0] || {}
    const organizationId = defaultOrg.id || ''
    const organizationRole = defaultOrg.role || ''
    const organizationTitle = defaultOrg.title || ''

    // 清理 Redis 会话
    await redis.deleteOAuthSession(sessionId)

    logger.success('✅ OpenAI OAuth token exchange successful')

    return res.json({
      success: true,
      data: {
        tokens: {
          idToken: id_token,
          accessToken: access_token,
          refreshToken: refresh_token,
          expires_in
        },
        accountInfo: {
          accountId,
          chatgptUserId,
          organizationId,
          organizationRole,
          organizationTitle,
          planType,
          email: payload.email || '',
          name: payload.name || '',
          emailVerified: payload.email_verified || false,
          organizations
        }
      }
    })
  } catch (error) {
    logger.error('OpenAI OAuth token exchange failed:', error)
    return res.status(500).json({
      success: false,
      message: '交换授权码失败',
      error: error.message
    })
  }
})

// 获取所有 OpenAI 账户
router.get('/openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiAccountService.getAllAccounts()

    // 缓存账户所属分组，避免重复查询
    const accountGroupCache = new Map()
    const fetchAccountGroups = async (accountId) => {
      if (!accountGroupCache.has(accountId)) {
        const groups = await accountGroupService.getAccountGroups(accountId)
        accountGroupCache.set(accountId, groups || [])
      }
      return accountGroupCache.get(accountId)
    }

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'openai') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await fetchAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await fetchAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              monthly: usageStats.monthly
            }
          }
        } catch (error) {
          logger.debug(`Failed to get usage stats for OpenAI account ${account.id}:`, error)
          const groupInfos = await fetchAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
        }
      })
    )

    logger.info(`获取 OpenAI 账户列表: ${accountsWithStats.length} 个账户`)

    return res.json({
      success: true,
      data: accountsWithStats
    })
  } catch (error) {
    logger.error('获取 OpenAI 账户列表失败:', error)
    return res.status(500).json({
      success: false,
      message: '获取账户列表失败',
      error: error.message
    })
  }
})

// 创建 OpenAI 账户
router.post('/openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      openaiOauth,
      accountInfo,
      proxy,
      accountType,
      groupId,
      rateLimitDuration,
      priority,
      needsImmediateRefresh, // 是否需要立即刷新
      requireRefreshSuccess // 是否必须刷新成功才能创建
    } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '账户名称不能为空'
      })
    }

    // 准备账户数据
    const accountData = {
      name,
      description: description || '',
      accountType: accountType || 'shared',
      priority: priority || 50,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      openaiOauth: openaiOauth || {},
      accountInfo: accountInfo || {},
      proxy: proxy || null,
      isActive: true,
      schedulable: true
    }

    // 如果需要立即刷新且必须成功（OpenAI 手动模式）
    if (needsImmediateRefresh && requireRefreshSuccess) {
      // 先创建临时账户以测试刷新
      const tempAccount = await openaiAccountService.createAccount(accountData)

      try {
        logger.info(`🔄 测试刷新 OpenAI 账户以获取完整 token 信息`)

        // 尝试刷新 token（会自动使用账户配置的代理）
        await openaiAccountService.refreshAccountToken(tempAccount.id)

        // 刷新成功，获取更新后的账户信息
        const refreshedAccount = await openaiAccountService.getAccount(tempAccount.id)

        // 检查是否获取到了 ID Token
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          // 没有获取到 ID Token，删除账户
          await openaiAccountService.deleteAccount(tempAccount.id)
          throw new Error('无法获取 ID Token，请检查 Refresh Token 是否有效')
        }

        // 如果是分组类型，添加到分组
        if (accountType === 'group' && groupId) {
          await accountGroupService.addAccountToGroup(tempAccount.id, groupId, 'openai')
        }

        // 清除敏感信息后返回
        delete refreshedAccount.idToken
        delete refreshedAccount.accessToken
        delete refreshedAccount.refreshToken

        logger.success(`✅ 创建并验证 OpenAI 账户成功: ${name} (ID: ${tempAccount.id})`)

        return res.json({
          success: true,
          data: refreshedAccount,
          message: '账户创建成功，并已获取完整 token 信息'
        })
      } catch (refreshError) {
        // 刷新失败，删除临时创建的账户
        logger.warn(`❌ 刷新失败，删除临时账户: ${refreshError.message}`)
        await openaiAccountService.deleteAccount(tempAccount.id)

        // 构建详细的错误信息
        const errorResponse = {
          success: false,
          message: '账户创建失败',
          error: refreshError.message
        }

        // 添加更详细的错误信息
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }

        // 提供更友好的错误提示
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }

        return res.status(400).json(errorResponse)
      }
    }

    // 不需要强制刷新的情况（OAuth 模式或其他平台）
    const createdAccount = await openaiAccountService.createAccount(accountData)

    // 如果是分组类型，添加到分组
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(createdAccount.id, groupId, 'openai')
    }

    // 如果需要刷新但不强制成功（OAuth 模式可能已有完整信息）
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${createdAccount.id}`)
        await openaiAccountService.refreshAccountToken(createdAccount.id)
        logger.info(`✅ 刷新成功`)
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户已创建: ${refreshError.message}`)
      }
    }

    logger.success(`✅ 创建 OpenAI 账户成功: ${name} (ID: ${createdAccount.id})`)

    return res.json({
      success: true,
      data: createdAccount
    })
  } catch (error) {
    logger.error('创建 OpenAI 账户失败:', error)
    return res.status(500).json({
      success: false,
      message: '创建账户失败',
      error: error.message
    })
  }
})

// 更新 OpenAI 账户
router.put('/openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'OpenAI', id)

    const { needsImmediateRefresh, requireRefreshSuccess } = mappedUpdates

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId
    if (mappedUpdates.accountType === 'group' && !mappedUpdates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await openaiAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 如果更新了 Refresh Token，需要验证其有效性
    if (mappedUpdates.openaiOauth?.refreshToken && needsImmediateRefresh && requireRefreshSuccess) {
      // 先更新 token 信息
      const tempUpdateData = {}
      if (mappedUpdates.openaiOauth.refreshToken) {
        tempUpdateData.refreshToken = mappedUpdates.openaiOauth.refreshToken
      }
      if (mappedUpdates.openaiOauth.accessToken) {
        tempUpdateData.accessToken = mappedUpdates.openaiOauth.accessToken
      }
      // 更新代理配置（如果有）
      if (mappedUpdates.proxy !== undefined) {
        tempUpdateData.proxy = mappedUpdates.proxy
      }

      // 临时更新账户以测试新的 token
      await openaiAccountService.updateAccount(id, tempUpdateData)

      try {
        logger.info(`🔄 验证更新的 OpenAI token (账户: ${id})`)

        // 尝试刷新 token（会使用账户配置的代理）
        await openaiAccountService.refreshAccountToken(id)

        // 获取刷新后的账户信息
        const refreshedAccount = await openaiAccountService.getAccount(id)

        // 检查是否获取到了 ID Token
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          // 恢复原始 token
          await openaiAccountService.updateAccount(id, {
            refreshToken: currentAccount.refreshToken,
            accessToken: currentAccount.accessToken,
            idToken: currentAccount.idToken
          })

          return res.status(400).json({
            success: false,
            message: '无法获取 ID Token，请检查 Refresh Token 是否有效',
            error: 'Invalid refresh token'
          })
        }

        logger.success(`✅ Token 验证成功，继续更新账户信息`)
      } catch (refreshError) {
        // 刷新失败，恢复原始 token
        logger.warn(`❌ Token 验证失败，恢复原始配置: ${refreshError.message}`)
        await openaiAccountService.updateAccount(id, {
          refreshToken: currentAccount.refreshToken,
          accessToken: currentAccount.accessToken,
          idToken: currentAccount.idToken,
          proxy: currentAccount.proxy
        })

        // 构建详细的错误信息
        const errorResponse = {
          success: false,
          message: '更新失败',
          error: refreshError.message
        }

        // 添加更详细的错误信息
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }

        // 提供更友好的错误提示
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }

        return res.status(400).json(errorResponse)
      }
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从原分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroup = await accountGroupService.getAccountGroup(id)
        if (oldGroup) {
          await accountGroupService.removeAccountFromGroup(id, oldGroup.id)
        }
      }
      // 如果新类型是分组，添加到新分组
      if (mappedUpdates.accountType === 'group' && mappedUpdates.groupId) {
        await accountGroupService.addAccountToGroup(id, mappedUpdates.groupId, 'openai')
      }
    }

    // 准备更新数据
    const updateData = { ...mappedUpdates }

    // 处理敏感数据加密
    if (mappedUpdates.openaiOauth) {
      updateData.openaiOauth = mappedUpdates.openaiOauth
      // 编辑时不允许直接输入 ID Token，只能通过刷新获取
      if (mappedUpdates.openaiOauth.accessToken) {
        updateData.accessToken = mappedUpdates.openaiOauth.accessToken
      }
      if (mappedUpdates.openaiOauth.refreshToken) {
        updateData.refreshToken = mappedUpdates.openaiOauth.refreshToken
      }
      if (mappedUpdates.openaiOauth.expires_in) {
        updateData.expiresAt = new Date(
          Date.now() + mappedUpdates.openaiOauth.expires_in * 1000
        ).toISOString()
      }
    }

    // 更新账户信息
    if (mappedUpdates.accountInfo) {
      updateData.accountId = mappedUpdates.accountInfo.accountId || currentAccount.accountId
      updateData.chatgptUserId =
        mappedUpdates.accountInfo.chatgptUserId || currentAccount.chatgptUserId
      updateData.organizationId =
        mappedUpdates.accountInfo.organizationId || currentAccount.organizationId
      updateData.organizationRole =
        mappedUpdates.accountInfo.organizationRole || currentAccount.organizationRole
      updateData.organizationTitle =
        mappedUpdates.accountInfo.organizationTitle || currentAccount.organizationTitle
      updateData.planType = mappedUpdates.accountInfo.planType || currentAccount.planType
      updateData.email = mappedUpdates.accountInfo.email || currentAccount.email
      updateData.emailVerified =
        mappedUpdates.accountInfo.emailVerified !== undefined
          ? mappedUpdates.accountInfo.emailVerified
          : currentAccount.emailVerified
    }

    const updatedAccount = await openaiAccountService.updateAccount(id, updateData)

    // 如果需要刷新但不强制成功（非关键更新）
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${id}`)
        await openaiAccountService.refreshAccountToken(id)
        logger.info(`✅ 刷新成功`)
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户信息已更新: ${refreshError.message}`)
      }
    }

    logger.success(`📝 Admin updated OpenAI account: ${id}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update OpenAI account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 OpenAI 账户
router.delete('/openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账户不存在'
      })
    }

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai')

    // 如果账户在分组中，从分组中移除
    if (account.accountType === 'group') {
      const group = await accountGroupService.getAccountGroup(id)
      if (group) {
        await accountGroupService.removeAccountFromGroup(id, group.id)
      }
    }

    await openaiAccountService.deleteAccount(id)

    let message = 'OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(
      `✅ 删除 OpenAI 账户成功: ${account.name} (ID: ${id}), unbound ${unboundCount} keys`
    )

    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('删除 OpenAI 账户失败:', error)
    return res.status(500).json({
      success: false,
      message: '删除账户失败',
      error: error.message
    })
  }
})

// 切换 OpenAI 账户状态
router.put('/openai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await redis.getOpenAiAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账户不存在'
      })
    }

    // 切换启用状态
    account.enabled = !account.enabled
    account.updatedAt = new Date().toISOString()

    // TODO: 更新方法
    // await redis.updateOpenAiAccount(id, account)

    logger.success(
      `✅ ${account.enabled ? '启用' : '禁用'} OpenAI 账户: ${account.name} (ID: ${id})`
    )

    return res.json({
      success: true,
      data: account
    })
  } catch (error) {
    logger.error('切换 OpenAI 账户状态失败:', error)
    return res.status(500).json({
      success: false,
      message: '切换账户状态失败',
      error: error.message
    })
  }
})

// 重置 OpenAI 账户状态（清除所有异常状态）
router.post('/openai-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const result = await openaiAccountService.resetAccountStatus(accountId)

    logger.success(`✅ Admin reset status for OpenAI account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换 OpenAI 账户调度状态
router.put(
  '/openai-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const result = await openaiAccountService.toggleSchedulable(accountId)

      // 如果账号被禁用，发送webhook通知
      if (!result.schedulable) {
        // 获取账号信息
        const account = await redis.getOpenAiAccount(accountId)
        if (account) {
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId: account.id,
            accountName: account.name || 'OpenAI Account',
            platform: 'openai',
            status: 'disabled',
            errorCode: 'OPENAI_MANUALLY_DISABLED',
            reason: '账号已被管理员手动禁用调度',
            timestamp: new Date().toISOString()
          })
        }
      }

      return res.json({
        success: result.success,
        schedulable: result.schedulable,
        message: result.schedulable ? '已启用调度' : '已禁用调度'
      })
    } catch (error) {
      logger.error('切换 OpenAI 账户调度状态失败:', error)
      return res.status(500).json({
        success: false,
        message: '切换调度状态失败',
        error: error.message
      })
    }
  }
)

// 🌐 Azure OpenAI 账户管理

// 获取所有 Azure OpenAI 账户
router.get('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await azureOpenaiAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'azure_openai') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息和分组信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (error) {
          logger.debug(`Failed to get usage stats for Azure OpenAI account ${account.id}:`, error)
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.debug(`Failed to get group info for account ${account.id}:`, groupError)
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    res.json({
      success: true,
      data: accountsWithStats
    })
  } catch (error) {
    logger.error('Failed to fetch Azure OpenAI accounts:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts',
      error: error.message
    })
  }
})

// 创建 Azure OpenAI 账户
router.post('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      accountType,
      azureEndpoint,
      apiVersion,
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      groupIds,
      priority,
      isActive,
      schedulable
    } = req.body

    // 验证必填字段
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Account name is required'
      })
    }

    if (!azureEndpoint) {
      return res.status(400).json({
        success: false,
        message: 'Azure endpoint is required'
      })
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API key is required'
      })
    }

    if (!deploymentName) {
      return res.status(400).json({
        success: false,
        message: 'Deployment name is required'
      })
    }

    // 验证 Azure endpoint 格式
    if (!azureEndpoint.match(/^https:\/\/[\w-]+\.openai\.azure\.com$/)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid Azure OpenAI endpoint format. Expected: https://your-resource.openai.azure.com'
      })
    }

    // 测试连接
    try {
      const testUrl = `${azureEndpoint}/openai/deployments/${deploymentName}?api-version=${
        apiVersion || '2024-02-01'
      }`
      await axios.get(testUrl, {
        headers: {
          'api-key': apiKey
        },
        timeout: 5000
      })
    } catch (testError) {
      if (testError.response?.status === 404) {
        logger.warn('Azure OpenAI deployment not found, but continuing with account creation')
      } else if (testError.response?.status === 401) {
        return res.status(400).json({
          success: false,
          message: 'Invalid API key or unauthorized access'
        })
      }
    }

    const account = await azureOpenaiAccountService.createAccount({
      name,
      description,
      accountType: accountType || 'shared',
      azureEndpoint,
      apiVersion: apiVersion || '2024-02-01',
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      priority: priority || 50,
      isActive: isActive !== false,
      schedulable: schedulable !== false
    })

    // 如果是分组类型，将账户添加到分组
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        // 使用多分组设置
        await accountGroupService.setAccountGroups(account.id, groupIds, 'azure_openai')
      } else if (groupId) {
        // 兼容单分组模式
        await accountGroupService.addAccountToGroup(account.id, groupId, 'azure_openai')
      }
    }

    res.json({
      success: true,
      data: account,
      message: 'Azure OpenAI account created successfully'
    })
  } catch (error) {
    logger.error('Failed to create Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    })
  }
})

// 更新 Azure OpenAI 账户
router.put('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Azure OpenAI', id)

    const account = await azureOpenaiAccountService.updateAccount(id, mappedUpdates)

    res.json({
      success: true,
      data: account,
      message: 'Azure OpenAI account updated successfully'
    })
  } catch (error) {
    logger.error('Failed to update Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update account',
      error: error.message
    })
  }
})

// 删除 Azure OpenAI 账户
router.delete('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'azure_openai')

    await azureOpenaiAccountService.deleteAccount(id)

    let message = 'Azure OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Azure OpenAI account: ${id}, unbound ${unboundCount} keys`)

    res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('Failed to delete Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    })
  }
})

// 切换 Azure OpenAI 账户状态
router.put('/azure-openai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await azureOpenaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    const newStatus = account.isActive === 'true' ? 'false' : 'true'
    await azureOpenaiAccountService.updateAccount(id, { isActive: newStatus })

    res.json({
      success: true,
      message: `Account ${newStatus === 'true' ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus === 'true'
    })
  } catch (error) {
    logger.error('Failed to toggle Azure OpenAI account status:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle account status',
      error: error.message
    })
  }
})

// 切换 Azure OpenAI 账户调度状态
router.put(
  '/azure-openai-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const result = await azureOpenaiAccountService.toggleSchedulable(accountId)

      // 如果账号被禁用，发送webhook通知
      if (!result.schedulable) {
        // 获取账号信息
        const account = await azureOpenaiAccountService.getAccount(accountId)
        if (account) {
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId: account.id,
            accountName: account.name || 'Azure OpenAI Account',
            platform: 'azure-openai',
            status: 'disabled',
            errorCode: 'AZURE_OPENAI_MANUALLY_DISABLED',
            reason: '账号已被管理员手动禁用调度',
            timestamp: new Date().toISOString()
          })
        }
      }

      return res.json({
        success: true,
        schedulable: result.schedulable,
        message: result.schedulable ? '已启用调度' : '已禁用调度'
      })
    } catch (error) {
      logger.error('切换 Azure OpenAI 账户调度状态失败:', error)
      return res.status(500).json({
        success: false,
        message: '切换调度状态失败',
        error: error.message
      })
    }
  }
)

// 健康检查单个 Azure OpenAI 账户
router.post('/azure-openai-accounts/:id/health-check', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const healthResult = await azureOpenaiAccountService.healthCheckAccount(id)

    res.json({
      success: true,
      data: healthResult
    })
  } catch (error) {
    logger.error('Failed to perform health check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform health check',
      error: error.message
    })
  }
})

// 批量健康检查所有 Azure OpenAI 账户
router.post('/azure-openai-accounts/health-check-all', authenticateAdmin, async (req, res) => {
  try {
    const healthResults = await azureOpenaiAccountService.performHealthChecks()

    res.json({
      success: true,
      data: healthResults
    })
  } catch (error) {
    logger.error('Failed to perform batch health check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform batch health check',
      error: error.message
    })
  }
})

// 迁移 API Keys 以支持 Azure OpenAI
router.post('/migrate-api-keys-azure', authenticateAdmin, async (req, res) => {
  try {
    const migratedCount = await azureOpenaiAccountService.migrateApiKeysForAzureSupport()

    res.json({
      success: true,
      message: `Successfully migrated ${migratedCount} API keys for Azure OpenAI support`
    })
  } catch (error) {
    logger.error('Failed to migrate API keys:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to migrate API keys',
      error: error.message
    })
  }
})

// 📋 获取统一Claude Code User-Agent信息
router.get('/claude-code-version', authenticateAdmin, async (req, res) => {
  try {
    const CACHE_KEY = 'claude_code_user_agent:daily'

    // 获取缓存的统一User-Agent
    const unifiedUserAgent = await redis.client.get(CACHE_KEY)
    const ttl = unifiedUserAgent ? await redis.client.ttl(CACHE_KEY) : 0

    res.json({
      success: true,
      userAgent: unifiedUserAgent,
      isActive: !!unifiedUserAgent,
      ttlSeconds: ttl,
      lastUpdated: unifiedUserAgent ? new Date().toISOString() : null
    })
  } catch (error) {
    logger.error('❌ Get unified Claude Code User-Agent error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get User-Agent information',
      error: error.message
    })
  }
})

// 🗑️ 清除统一Claude Code User-Agent缓存
router.post('/claude-code-version/clear', authenticateAdmin, async (req, res) => {
  try {
    const CACHE_KEY = 'claude_code_user_agent:daily'

    // 删除缓存的统一User-Agent
    await redis.client.del(CACHE_KEY)

    logger.info(`🗑️ Admin manually cleared unified Claude Code User-Agent cache`)

    res.json({
      success: true,
      message: 'Unified User-Agent cache cleared successfully'
    })
  } catch (error) {
    logger.error('❌ Clear unified User-Agent cache error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message
    })
  }
})

// ==================== OpenAI-Responses 账户管理 API ====================

// 获取所有 OpenAI-Responses 账户
router.get('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiResponsesAccountService.getAllAccounts(true)

    // 根据查询参数进行筛选
    if (platform && platform !== 'openai-responses') {
      accounts = []
    }

    // 根据分组ID筛选
    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'openai' && group.memberIds && group.memberIds.length > 0) {
        accounts = accounts.filter((account) => group.memberIds.includes(account.id))
      } else {
        accounts = []
      }
    }

    // 处理额度信息、使用统计和绑定的 API Key 数量
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          // 检查是否需要重置额度
          const today = redis.getDateStringInTimezone()
          if (account.lastResetDate !== today) {
            // 今天还没重置过，需要重置
            await openaiResponsesAccountService.updateAccount(account.id, {
              dailyUsage: '0',
              lastResetDate: today,
              quotaStoppedAt: ''
            })
            account.dailyUsage = '0'
            account.lastResetDate = today
            account.quotaStoppedAt = ''
          }

          // 检查并清除过期的限流状态
          await openaiResponsesAccountService.checkAndClearRateLimit(account.id)

          // 获取使用统计信息
          let usageStats
          try {
            usageStats = await redis.getAccountUsageStats(account.id, 'openai-responses')
          } catch (error) {
            logger.debug(
              `Failed to get usage stats for OpenAI-Responses account ${account.id}:`,
              error
            )
            usageStats = {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }

          // 计算绑定的API Key数量（支持 responses: 前缀）
          const allKeys = await redis.getAllApiKeys()
          let boundCount = 0

          for (const key of allKeys) {
            // 检查是否绑定了该账户（包括 responses: 前缀）
            if (
              key.openaiAccountId === account.id ||
              key.openaiAccountId === `responses:${account.id}`
            ) {
              boundCount++
            }
          }

          // 调试日志：检查绑定计数
          if (boundCount > 0) {
            logger.info(`OpenAI-Responses account ${account.id} has ${boundCount} bound API keys`)
          }

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            boundApiKeysCount: boundCount,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              monthly: usageStats.monthly
            }
          }
        } catch (error) {
          logger.error(`Failed to process OpenAI-Responses account ${account.id}:`, error)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            boundApiKeysCount: 0,
            usage: {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
        }
      })
    )

    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get OpenAI-Responses accounts:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 创建 OpenAI-Responses 账户
router.post('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const account = await openaiResponsesAccountService.createAccount(req.body)
    const formattedAccount = formatAccountExpiry(account)
    res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('Failed to create OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 更新 OpenAI-Responses 账户
router.put('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'OpenAI-Responses', id)

    // 验证priority的有效性（1-100）
    if (mappedUpdates.priority !== undefined) {
      const priority = parseInt(mappedUpdates.priority)
      if (isNaN(priority) || priority < 1 || priority > 100) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be a number between 1 and 100'
        })
      }
      mappedUpdates.priority = priority.toString()
    }

    const result = await openaiResponsesAccountService.updateAccount(id, mappedUpdates)

    if (!result.success) {
      return res.status(400).json(result)
    }

    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Failed to update OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 删除 OpenAI-Responses 账户
router.delete('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai-responses')

    // 检查是否在分组中
    const groups = await accountGroupService.getAllGroups()
    for (const group of groups) {
      if (group.platform === 'openai' && group.memberIds && group.memberIds.includes(id)) {
        await accountGroupService.removeMemberFromGroup(group.id, id)
        logger.info(`Removed OpenAI-Responses account ${id} from group ${group.id}`)
      }
    }

    const result = await openaiResponsesAccountService.deleteAccount(id)

    let message = 'OpenAI-Responses账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted OpenAI-Responses account: ${id}, unbound ${unboundCount} keys`)

    res.json({
      success: true,
      ...result,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('Failed to delete OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 切换 OpenAI-Responses 账户调度状态
router.put(
  '/openai-responses-accounts/:id/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await openaiResponsesAccountService.toggleSchedulable(id)

      if (!result.success) {
        return res.status(400).json(result)
      }

      // 仅在停止调度时发送通知
      if (!result.schedulable) {
        await webhookNotifier.sendAccountEvent('account.status_changed', {
          accountId: id,
          platform: 'openai-responses',
          schedulable: result.schedulable,
          changedBy: 'admin',
          action: 'stopped_scheduling'
        })
      }

      res.json(result)
    } catch (error) {
      logger.error('Failed to toggle OpenAI-Responses account schedulable status:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// 切换 OpenAI-Responses 账户激活状态
router.put('/openai-responses-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    const newActiveStatus = account.isActive === 'true' ? 'false' : 'true'
    await openaiResponsesAccountService.updateAccount(id, {
      isActive: newActiveStatus
    })

    res.json({
      success: true,
      isActive: newActiveStatus === 'true'
    })
  } catch (error) {
    logger.error('Failed to toggle OpenAI-Responses account status:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 重置 OpenAI-Responses 账户限流状态
router.post(
  '/openai-responses-accounts/:id/reset-rate-limit',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params

      await openaiResponsesAccountService.updateAccount(id, {
        rateLimitedAt: '',
        rateLimitStatus: '',
        status: 'active',
        errorMessage: ''
      })

      logger.info(`🔄 Admin manually reset rate limit for OpenAI-Responses account ${id}`)

      res.json({
        success: true,
        message: 'Rate limit reset successfully'
      })
    } catch (error) {
      logger.error('Failed to reset OpenAI-Responses account rate limit:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// 重置 OpenAI-Responses 账户状态（清除所有异常状态）
router.post('/openai-responses-accounts/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await openaiResponsesAccountService.resetAccountStatus(id)

    logger.success(`✅ Admin reset status for OpenAI-Responses account: ${id}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI-Responses account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置 OpenAI-Responses 账户的每日使用量
router.post('/openai-responses-accounts/:id/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await openaiResponsesAccountService.updateAccount(id, {
      dailyUsage: '0',
      lastResetDate: redis.getDateStringInTimezone(),
      quotaStoppedAt: ''
    })

    logger.success(`✅ Admin manually reset daily usage for OpenAI-Responses account ${id}`)

    res.json({
      success: true,
      message: 'Daily usage reset successfully'
    })
  } catch (error) {
    logger.error('Failed to reset OpenAI-Responses account usage:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 🤖 Droid 账户管理

// 生成 Droid OAuth 授权链接
router.post('/droid-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body || {}
    const deviceAuth = await startDeviceAuthorization(proxy || null)

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + deviceAuth.expiresIn * 1000).toISOString()

    await redis.setOAuthSession(sessionId, {
      deviceCode: deviceAuth.deviceCode,
      userCode: deviceAuth.userCode,
      verificationUri: deviceAuth.verificationUri,
      verificationUriComplete: deviceAuth.verificationUriComplete,
      interval: deviceAuth.interval,
      proxy: proxy || null,
      createdAt: new Date().toISOString(),
      expiresAt
    })

    logger.success('🤖 生成 Droid 设备码授权信息成功', { sessionId })
    return res.json({
      success: true,
      data: {
        sessionId,
        userCode: deviceAuth.userCode,
        verificationUri: deviceAuth.verificationUri,
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresIn: deviceAuth.expiresIn,
        interval: deviceAuth.interval,
        instructions: [
          '1. 使用下方验证码进入授权页面并确认访问权限。',
          '2. 在授权页面登录 Factory / Droid 账户并点击允许。',
          '3. 回到此处点击“完成授权”完成凭证获取。'
        ]
      }
    })
  } catch (error) {
    const message =
      error instanceof WorkOSDeviceAuthError ? error.message : error.message || '未知错误'
    logger.error('❌ 生成 Droid 设备码授权失败:', message)
    return res.status(500).json({ error: 'Failed to start Droid device authorization', message })
  }
})

// 交换 Droid 授权码
router.post('/droid-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  const { sessionId, proxy } = req.body || {}
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }

    if (oauthSession.expiresAt && new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }

    if (!oauthSession.deviceCode) {
      await redis.deleteOAuthSession(sessionId)
      return res.status(400).json({ error: 'OAuth session missing device code, please retry' })
    }

    const proxyConfig = proxy || oauthSession.proxy || null
    const tokens = await pollDeviceAuthorization(oauthSession.deviceCode, proxyConfig)

    await redis.deleteOAuthSession(sessionId)

    logger.success('🤖 成功获取 Droid 访问令牌', { sessionId })
    return res.json({ success: true, data: { tokens } })
  } catch (error) {
    if (error instanceof WorkOSDeviceAuthError) {
      if (error.code === 'authorization_pending' || error.code === 'slow_down') {
        const oauthSession = await redis.getOAuthSession(sessionId)
        const expiresAt = oauthSession?.expiresAt ? new Date(oauthSession.expiresAt) : null
        const remainingSeconds =
          expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
            ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
            : null

        return res.json({
          success: false,
          pending: true,
          error: error.code,
          message: error.message,
          retryAfter: error.retryAfter || Number(oauthSession?.interval) || 5,
          expiresIn: remainingSeconds
        })
      }

      if (error.code === 'expired_token') {
        await redis.deleteOAuthSession(sessionId)
        return res.status(400).json({
          error: 'Device code expired',
          message: '授权已过期，请重新生成设备码并再次授权'
        })
      }

      logger.error('❌ Droid 授权失败:', error.message)
      return res.status(500).json({
        error: 'Failed to exchange Droid authorization code',
        message: error.message,
        errorCode: error.code
      })
    }

    logger.error('❌ 交换 Droid 授权码失败:', error)
    return res.status(500).json({
      error: 'Failed to exchange Droid authorization code',
      message: error.message
    })
  }
})

// 获取所有 Droid 账户
router.get('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await droidAccountService.getAllAccounts()
    const allApiKeys = await redis.getAllApiKeys()

    // 添加使用统计
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'droid')
          let groupInfos = []
          try {
            groupInfos = await accountGroupService.getAccountGroups(account.id)
          } catch (groupError) {
            logger.debug(`Failed to get group infos for Droid account ${account.id}:`, groupError)
            groupInfos = []
          }

          const groupIds = groupInfos.map((group) => group.id)
          const boundApiKeysCount = allApiKeys.reduce((count, key) => {
            const binding = key.droidAccountId
            if (!binding) {
              return count
            }
            if (binding === account.id) {
              return count + 1
            }
            if (binding.startsWith('group:')) {
              const groupId = binding.substring('group:'.length)
              if (groupIds.includes(groupId)) {
                return count + 1
              }
            }
            return count
          }, 0)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            schedulable: account.schedulable === 'true',
            boundApiKeysCount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (error) {
          logger.warn(`Failed to get stats for Droid account ${account.id}:`, error.message)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            boundApiKeysCount: 0,
            groupInfos: [],
            usage: {
              daily: { tokens: 0, requests: 0 },
              total: { tokens: 0, requests: 0 },
              averages: { rpm: 0, tpm: 0 }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get Droid accounts:', error)
    return res.status(500).json({ error: 'Failed to get Droid accounts', message: error.message })
  }
})

// 创建 Droid 账户
router.post('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { accountType: rawAccountType = 'shared', groupId, groupIds } = req.body

    const normalizedAccountType = rawAccountType || 'shared'

    if (!['shared', 'dedicated', 'group'].includes(normalizedAccountType)) {
      return res.status(400).json({ error: '账户类型必须是 shared、dedicated 或 group' })
    }

    const normalizedGroupIds = Array.isArray(groupIds)
      ? groupIds.filter((id) => typeof id === 'string' && id.trim())
      : []

    if (
      normalizedAccountType === 'group' &&
      normalizedGroupIds.length === 0 &&
      (!groupId || typeof groupId !== 'string' || !groupId.trim())
    ) {
      return res.status(400).json({ error: '分组调度账户必须至少选择一个分组' })
    }

    const accountPayload = {
      ...req.body,
      accountType: normalizedAccountType
    }

    delete accountPayload.groupId
    delete accountPayload.groupIds

    const account = await droidAccountService.createAccount(accountPayload)

    if (normalizedAccountType === 'group') {
      try {
        if (normalizedGroupIds.length > 0) {
          await accountGroupService.setAccountGroups(account.id, normalizedGroupIds, 'droid')
        } else if (typeof groupId === 'string' && groupId.trim()) {
          await accountGroupService.addAccountToGroup(account.id, groupId, 'droid')
        }
      } catch (groupError) {
        logger.error(`Failed to attach Droid account ${account.id} to groups:`, groupError)
        return res.status(500).json({
          error: 'Failed to bind Droid account to groups',
          message: groupError.message
        })
      }
    }

    logger.success(`Created Droid account: ${account.name} (${account.id})`)
    const formattedAccount = formatAccountExpiry(account)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('Failed to create Droid account:', error)
    return res.status(500).json({ error: 'Failed to create Droid account', message: error.message })
  }
})

// 更新 Droid 账户
router.put('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = { ...req.body }

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Droid', id)

    const { accountType: rawAccountType, groupId, groupIds } = mappedUpdates

    if (rawAccountType && !['shared', 'dedicated', 'group'].includes(rawAccountType)) {
      return res.status(400).json({ error: '账户类型必须是 shared、dedicated 或 group' })
    }

    if (
      rawAccountType === 'group' &&
      (!groupId || typeof groupId !== 'string' || !groupId.trim()) &&
      (!Array.isArray(groupIds) || groupIds.length === 0)
    ) {
      return res.status(400).json({ error: '分组调度账户必须至少选择一个分组' })
    }

    const currentAccount = await droidAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Droid account not found' })
    }

    const normalizedGroupIds = Array.isArray(groupIds)
      ? groupIds.filter((gid) => typeof gid === 'string' && gid.trim())
      : []
    const hasGroupIdsField = Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')
    const hasGroupIdField = Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupId')
    const targetAccountType = rawAccountType || currentAccount.accountType || 'shared'

    delete mappedUpdates.groupId
    delete mappedUpdates.groupIds

    if (rawAccountType) {
      mappedUpdates.accountType = targetAccountType
    }

    const account = await droidAccountService.updateAccount(id, mappedUpdates)

    try {
      if (currentAccount.accountType === 'group' && targetAccountType !== 'group') {
        await accountGroupService.removeAccountFromAllGroups(id)
      } else if (targetAccountType === 'group') {
        if (hasGroupIdsField) {
          if (normalizedGroupIds.length > 0) {
            await accountGroupService.setAccountGroups(id, normalizedGroupIds, 'droid')
          } else {
            await accountGroupService.removeAccountFromAllGroups(id)
          }
        } else if (hasGroupIdField && typeof groupId === 'string' && groupId.trim()) {
          await accountGroupService.setAccountGroups(id, [groupId], 'droid')
        }
      }
    } catch (groupError) {
      logger.error(`Failed to update Droid account ${id} groups:`, groupError)
      return res.status(500).json({
        error: 'Failed to update Droid account groups',
        message: groupError.message
      })
    }

    if (targetAccountType === 'group') {
      try {
        account.groupInfos = await accountGroupService.getAccountGroups(id)
      } catch (groupFetchError) {
        logger.debug(`Failed to fetch group infos for Droid account ${id}:`, groupFetchError)
      }
    }

    return res.json({ success: true, data: account })
  } catch (error) {
    logger.error(`Failed to update Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to update Droid account', message: error.message })
  }
})

// 切换 Droid 账户调度状态
router.put('/droid-accounts/:id/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await droidAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ error: 'Droid account not found' })
    }

    const currentSchedulable = account.schedulable === true || account.schedulable === 'true'
    const newSchedulable = !currentSchedulable

    await droidAccountService.updateAccount(id, { schedulable: newSchedulable ? 'true' : 'false' })

    const updatedAccount = await droidAccountService.getAccount(id)
    const actualSchedulable = updatedAccount
      ? updatedAccount.schedulable === true || updatedAccount.schedulable === 'true'
      : newSchedulable

    if (!actualSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'Droid Account',
        platform: 'droid',
        status: 'disabled',
        errorCode: 'DROID_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled Droid account schedulable status: ${id} -> ${
        actualSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )

    return res.json({ success: true, schedulable: actualSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle Droid account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取单个 Droid 账户详细信息
router.get('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // 获取账户基本信息
    const account = await droidAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Droid account not found'
      })
    }

    // 获取使用统计信息
    let usageStats
    try {
      usageStats = await redis.getAccountUsageStats(account.id, 'droid')
    } catch (error) {
      logger.debug(`Failed to get usage stats for Droid account ${account.id}:`, error)
      usageStats = {
        daily: { tokens: 0, requests: 0, allTokens: 0 },
        total: { tokens: 0, requests: 0, allTokens: 0 },
        averages: { rpm: 0, tpm: 0 }
      }
    }

    // 获取分组信息
    let groupInfos = []
    try {
      groupInfos = await accountGroupService.getAccountGroups(account.id)
    } catch (error) {
      logger.debug(`Failed to get group infos for Droid account ${account.id}:`, error)
      groupInfos = []
    }

    // 获取绑定的 API Key 数量
    const allApiKeys = await redis.getAllApiKeys()
    const groupIds = groupInfos.map((group) => group.id)
    const boundApiKeysCount = allApiKeys.reduce((count, key) => {
      const binding = key.droidAccountId
      if (!binding) {
        return count
      }
      if (binding === account.id) {
        return count + 1
      }
      if (binding.startsWith('group:')) {
        const groupId = binding.substring('group:'.length)
        if (groupIds.includes(groupId)) {
          return count + 1
        }
      }
      return count
    }, 0)

    // 获取解密的 API Keys（用于管理界面）
    let decryptedApiKeys = []
    try {
      decryptedApiKeys = await droidAccountService.getDecryptedApiKeyEntries(id)
    } catch (error) {
      logger.debug(`Failed to get decrypted API keys for Droid account ${account.id}:`, error)
      decryptedApiKeys = []
    }

    // 返回完整的账户信息，包含实际的 API Keys
    const accountDetails = {
      ...account,
      // 映射字段：使用 subscriptionExpiresAt 作为前端显示的 expiresAt
      expiresAt: account.subscriptionExpiresAt || null,
      schedulable: account.schedulable === 'true',
      boundApiKeysCount,
      groupInfos,
      // 包含实际的 API Keys（用于管理界面）
      apiKeys: decryptedApiKeys.map((entry) => ({
        key: entry.key,
        id: entry.id,
        usageCount: entry.usageCount || 0,
        lastUsedAt: entry.lastUsedAt || null,
        status: entry.status || 'active', // 使用实际的状态，默认为 active
        errorMessage: entry.errorMessage || '', // 包含错误信息
        createdAt: entry.createdAt || null
      })),
      usage: {
        daily: usageStats.daily,
        total: usageStats.total,
        averages: usageStats.averages
      }
    }

    return res.json({
      success: true,
      data: accountDetails
    })
  } catch (error) {
    logger.error(`Failed to get Droid account ${req.params.id}:`, error)
    return res.status(500).json({
      error: 'Failed to get Droid account',
      message: error.message
    })
  }
})

// 删除 Droid 账户
router.delete('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await droidAccountService.deleteAccount(id)
    return res.json({ success: true, message: 'Droid account deleted successfully' })
  } catch (error) {
    logger.error(`Failed to delete Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to delete Droid account', message: error.message })
  }
})

// 刷新 Droid 账户 token
router.post('/droid-accounts/:id/refresh-token', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await droidAccountService.refreshAccessToken(id)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error(`Failed to refresh Droid account token ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

module.exports = router
