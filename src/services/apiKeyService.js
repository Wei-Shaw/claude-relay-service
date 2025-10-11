const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const config = require('../../config/config')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class ApiKeyService {
  constructor() {
    this.prefix = config.security.apiKeyPrefix
  }

  // 🔑 生成新的API Key
  async generateApiKey(options = {}) {
    const {
      name = 'Unnamed Key',
      description = '',
      tokenLimit = 0, // 默认为0，不再使用token限制
      expiresAt = null,
      claudeAccountId = null,
      claudeConsoleAccountId = null,
      geminiAccountId = null,
      openaiAccountId = null,
      azureOpenaiAccountId = null,
      bedrockAccountId = null, // 添加 Bedrock 账号ID支持
      droidAccountId = null,
      permissions = 'all', // 可选值：'claude'、'gemini'、'openai'、'droid' 或 'all'
      isActive = true,
      concurrencyLimit = 0,
      rateLimitWindow = null,
      rateLimitRequests = null,
      rateLimitCost = null, // 新增：速率限制费用字段
      enableModelRestriction = false,
      restrictedModels = [],
      enableClientRestriction = false,
      allowedClients = [],
      dailyCostLimit = 0,
      totalCostLimit = 0,
      weeklyOpusCostLimit = 0,
      dailyOpusCostLimit = 0,
      tags = [],
      activationDays = 0, // 新增：激活后有效天数（0表示不使用此功能）
      activationUnit = 'days', // 新增：激活时间单位 'hours' 或 'days'
      expirationMode = 'fixed', // 新增：过期模式 'fixed'(固定时间) 或 'activation'(首次使用后激活)
      icon = '' // 新增：图标（base64编码）
    } = options

    // 生成简单的API Key (64字符十六进制)
    const apiKey = `${this.prefix}${this._generateSecretKey()}`
    const keyId = uuidv4()
    const hashedKey = this._hashApiKey(apiKey)

    const keyData = {
      id: keyId,
      name,
      description,
      apiKey: hashedKey,
      tokenLimit: String(tokenLimit ?? 0),
      concurrencyLimit: String(concurrencyLimit ?? 0),
      rateLimitWindow: String(rateLimitWindow ?? 0),
      rateLimitRequests: String(rateLimitRequests ?? 0),
      rateLimitCost: String(rateLimitCost ?? 0), // 新增：速率限制费用字段
      isActive: String(isActive),
      claudeAccountId: claudeAccountId || '',
      claudeConsoleAccountId: claudeConsoleAccountId || '',
      geminiAccountId: geminiAccountId || '',
      openaiAccountId: openaiAccountId || '',
      azureOpenaiAccountId: azureOpenaiAccountId || '',
      bedrockAccountId: bedrockAccountId || '', // 添加 Bedrock 账号ID
      droidAccountId: droidAccountId || '',
      permissions: permissions || 'all',
      enableModelRestriction: String(enableModelRestriction),
      restrictedModels: JSON.stringify(restrictedModels || []),
      enableClientRestriction: String(enableClientRestriction || false),
      allowedClients: JSON.stringify(allowedClients || []),
      dailyCostLimit: String(dailyCostLimit || 0),
      totalCostLimit: String(totalCostLimit || 0),
      weeklyOpusCostLimit: String(weeklyOpusCostLimit || 0),
      dailyOpusCostLimit: String(dailyOpusCostLimit || 0),
      tags: JSON.stringify(tags || []),
      activationDays: String(activationDays || 0), // 新增：激活后有效天数
      activationUnit: activationUnit || 'days', // 新增：激活时间单位
      expirationMode: expirationMode || 'fixed', // 新增：过期模式
      isActivated: expirationMode === 'fixed' ? 'true' : 'false', // 根据模式决定激活状态
      activatedAt: expirationMode === 'fixed' ? new Date().toISOString() : '', // 激活时间
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      expiresAt: expirationMode === 'fixed' ? expiresAt || '' : '', // 固定模式才设置过期时间
      createdBy: options.createdBy || 'admin',
      userId: options.userId || '',
      userUsername: options.userUsername || '',
      icon: icon || '' // 新增：图标（base64编码）
    }

    // 保存API Key数据并建立哈希映射
    await redis.setApiKey(keyId, keyData, hashedKey)

    logger.success(`🔑 Generated new API key: ${name} (${keyId})`)

    return {
      id: keyId,
      apiKey, // 只在创建时返回完整的key
      name: keyData.name,
      description: keyData.description,
      tokenLimit: parseInt(keyData.tokenLimit),
      concurrencyLimit: parseInt(keyData.concurrencyLimit),
      rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
      rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
      rateLimitCost: parseFloat(keyData.rateLimitCost || 0), // 新增：速率限制费用字段
      isActive: keyData.isActive === 'true',
      claudeAccountId: keyData.claudeAccountId,
      claudeConsoleAccountId: keyData.claudeConsoleAccountId,
      geminiAccountId: keyData.geminiAccountId,
      openaiAccountId: keyData.openaiAccountId,
      azureOpenaiAccountId: keyData.azureOpenaiAccountId,
      bedrockAccountId: keyData.bedrockAccountId, // 添加 Bedrock 账号ID
      droidAccountId: keyData.droidAccountId,
      permissions: keyData.permissions,
      enableModelRestriction: keyData.enableModelRestriction === 'true',
      restrictedModels: JSON.parse(keyData.restrictedModels),
      enableClientRestriction: keyData.enableClientRestriction === 'true',
      allowedClients: JSON.parse(keyData.allowedClients || '[]'),
      dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
      totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
      weeklyOpusCostLimit: parseFloat(keyData.weeklyOpusCostLimit || 0),
      dailyOpusCostLimit: parseFloat(keyData.dailyOpusCostLimit || 0),
      tags: JSON.parse(keyData.tags || '[]'),
      activationDays: parseInt(keyData.activationDays || 0),
      activationUnit: keyData.activationUnit || 'days',
      expirationMode: keyData.expirationMode || 'fixed',
      isActivated: keyData.isActivated === 'true',
      activatedAt: keyData.activatedAt,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      createdBy: keyData.createdBy
    }
  }

  // 🔍 验证API Key
  async validateApiKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith(this.prefix)) {
        return { valid: false, error: 'Invalid API key format' }
      }

      // 计算API Key的哈希值
      const hashedKey = this._hashApiKey(apiKey)

      // 通过哈希值直接查找API Key（性能优化）
      const keyData = await redis.findApiKeyByHash(hashedKey)

      if (!keyData) {
        return { valid: false, error: 'API key not found' }
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return { valid: false, error: 'API key is disabled' }
      }

      // 处理激活逻辑（仅在 activation 模式下）
      if (keyData.expirationMode === 'activation' && keyData.isActivated !== 'true') {
        // 首次使用，需要激活
        const now = new Date()
        const activationPeriod = parseInt(keyData.activationDays || 30) // 默认30
        const activationUnit = keyData.activationUnit || 'days' // 默认天

        // 根据单位计算过期时间
        let milliseconds
        if (activationUnit === 'hours') {
          milliseconds = activationPeriod * 60 * 60 * 1000 // 小时转毫秒
        } else {
          milliseconds = activationPeriod * 24 * 60 * 60 * 1000 // 天转毫秒
        }

        const expiresAt = new Date(now.getTime() + milliseconds)

        // 更新激活状态和过期时间
        keyData.isActivated = 'true'
        keyData.activatedAt = now.toISOString()
        keyData.expiresAt = expiresAt.toISOString()
        keyData.lastUsedAt = now.toISOString()

        // 保存到Redis
        await redis.setApiKey(keyData.id, keyData)

        logger.success(
          `🔓 API key activated: ${keyData.id} (${
            keyData.name
          }), will expire in ${activationPeriod} ${activationUnit} at ${expiresAt.toISOString()}`
        )
      }

      // 检查是否过期
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        return { valid: false, error: 'API key has expired' }
      }

      // 如果API Key属于某个用户，检查用户是否被禁用
      if (keyData.userId) {
        try {
          const userService = require('./userService')
          const user = await userService.getUserById(keyData.userId, false)
          if (!user || !user.isActive) {
            return { valid: false, error: 'User account is disabled' }
          }
        } catch (error) {
          logger.error('❌ Error checking user status during API key validation:', error)
          return { valid: false, error: 'Unable to validate user status' }
        }
      }

      // 获取使用统计（供返回数据使用）
      const usage = await redis.getUsageStats(keyData.id)

      // 获取费用统计
      const [dailyCost, costStats, weeklyOpusCost, dailyOpusCost] = await Promise.all([
        redis.getDailyCost(keyData.id),
        redis.getCostStats(keyData.id),
        redis.getWeeklyOpusCost(keyData.id),
        redis.getDailyOpusCost(keyData.id)
      ])
      const totalCost = costStats?.total || 0

      // 更新最后使用时间（优化：只在实际API调用时更新，而不是验证时）
      // 注意：lastUsedAt的更新已移至recordUsage方法中

      logger.api(`🔓 API key validated successfully: ${keyData.id}`)

      // 解析限制模型数据
      let restrictedModels = []
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : []
      } catch (e) {
        restrictedModels = []
      }

      // 解析允许的客户端
      let allowedClients = []
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : []
      } catch (e) {
        allowedClients = []
      }

      // 解析标签
      let tags = []
      try {
        tags = keyData.tags ? JSON.parse(keyData.tags) : []
      } catch (e) {
        tags = []
      }

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          description: keyData.description,
          createdAt: keyData.createdAt,
          expiresAt: keyData.expiresAt,
          claudeAccountId: keyData.claudeAccountId,
          claudeConsoleAccountId: keyData.claudeConsoleAccountId,
          geminiAccountId: keyData.geminiAccountId,
          openaiAccountId: keyData.openaiAccountId,
          azureOpenaiAccountId: keyData.azureOpenaiAccountId,
          bedrockAccountId: keyData.bedrockAccountId, // 添加 Bedrock 账号ID
          droidAccountId: keyData.droidAccountId,
          permissions: keyData.permissions || 'all',
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
          rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
          rateLimitCost: parseFloat(keyData.rateLimitCost || 0), // 新增：速率限制费用字段
          enableModelRestriction: keyData.enableModelRestriction === 'true',
          restrictedModels,
          enableClientRestriction: keyData.enableClientRestriction === 'true',
          allowedClients,
          dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
          totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
          weeklyOpusCostLimit: parseFloat(keyData.weeklyOpusCostLimit || 0),
          dailyOpusCostLimit: parseFloat(keyData.dailyOpusCostLimit || 0),
          dailyCost: dailyCost || 0,
          totalCost,
          weeklyOpusCost: weeklyOpusCost || 0,
          dailyOpusCost: dailyOpusCost || 0,
          tags,
          usage
        }
      }
    } catch (error) {
      logger.error('❌ API key validation error:', error)
      return { valid: false, error: 'Internal validation error' }
    }
  }

  // 🔍 验证API Key（仅用于统计查询，不触发激活）
  async validateApiKeyForStats(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith(this.prefix)) {
        return { valid: false, error: 'Invalid API key format' }
      }

      // 计算API Key的哈希值
      const hashedKey = this._hashApiKey(apiKey)

      // 通过哈希值直接查找API Key（性能优化）
      const keyData = await redis.findApiKeyByHash(hashedKey)

      if (!keyData) {
        return { valid: false, error: 'API key not found' }
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return { valid: false, error: 'API key is disabled' }
      }

      // 注意：这里不处理激活逻辑，保持 API Key 的未激活状态

      // 检查是否过期（仅对已激活的 Key 检查）
      if (
        keyData.isActivated === 'true' &&
        keyData.expiresAt &&
        new Date() > new Date(keyData.expiresAt)
      ) {
        return { valid: false, error: 'API key has expired' }
      }

      // 如果API Key属于某个用户，检查用户是否被禁用
      if (keyData.userId) {
        try {
          const userService = require('./userService')
          const user = await userService.getUserById(keyData.userId, false)
          if (!user || !user.isActive) {
            return { valid: false, error: 'User account is disabled' }
          }
        } catch (userError) {
          // 如果用户服务出错，记录但不影响API Key验证
          logger.warn(`Failed to check user status for API key ${keyData.id}:`, userError)
        }
      }

      // 获取当日费用
      const [dailyCost, costStats, weeklyOpusCost, dailyOpusCost] = await Promise.all([
        redis.getDailyCost(keyData.id),
        redis.getCostStats(keyData.id),
        redis.getWeeklyOpusCost(keyData.id),
        redis.getDailyOpusCost(keyData.id)
      ])

      // 获取使用统计
      const usage = await redis.getUsageStats(keyData.id)

      // 解析限制模型数据
      let restrictedModels = []
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : []
      } catch (e) {
        restrictedModels = []
      }

      // 解析允许的客户端
      let allowedClients = []
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : []
      } catch (e) {
        allowedClients = []
      }

      // 解析标签
      let tags = []
      try {
        tags = keyData.tags ? JSON.parse(keyData.tags) : []
      } catch (e) {
        tags = []
      }

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          description: keyData.description,
          createdAt: keyData.createdAt,
          expiresAt: keyData.expiresAt,
          // 添加激活相关字段
          expirationMode: keyData.expirationMode || 'fixed',
          isActivated: keyData.isActivated === 'true',
          activationDays: parseInt(keyData.activationDays || 0),
          activationUnit: keyData.activationUnit || 'days',
          activatedAt: keyData.activatedAt || null,
          claudeAccountId: keyData.claudeAccountId,
          claudeConsoleAccountId: keyData.claudeConsoleAccountId,
          geminiAccountId: keyData.geminiAccountId,
          openaiAccountId: keyData.openaiAccountId,
          azureOpenaiAccountId: keyData.azureOpenaiAccountId,
          bedrockAccountId: keyData.bedrockAccountId,
          droidAccountId: keyData.droidAccountId,
          permissions: keyData.permissions || 'all',
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
          rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
          rateLimitCost: parseFloat(keyData.rateLimitCost || 0),
          enableModelRestriction: keyData.enableModelRestriction === 'true',
          restrictedModels,
          enableClientRestriction: keyData.enableClientRestriction === 'true',
          allowedClients,
          dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
          totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
          weeklyOpusCostLimit: parseFloat(keyData.weeklyOpusCostLimit || 0),
          dailyOpusCostLimit: parseFloat(keyData.dailyOpusCostLimit || 0),
          dailyCost: dailyCost || 0,
          totalCost: costStats?.total || 0,
          weeklyOpusCost: weeklyOpusCost || 0,
          dailyOpusCost: dailyOpusCost || 0,
          tags,
          usage
        }
      }
    } catch (error) {
      logger.error('❌ API key validation error (stats):', error)
      return { valid: false, error: 'Internal validation error' }
    }
  }

  // 📋 获取所有API Keys
  async getAllApiKeys(includeDeleted = false) {
    try {
      let apiKeys = await redis.getAllApiKeys()
      const client = redis.getClientSafe()

      // 默认过滤掉已删除的API Keys
      if (!includeDeleted) {
        apiKeys = apiKeys.filter((key) => key.isDeleted !== 'true')
      }

      // 为每个key添加使用统计和当前并发数
      for (const key of apiKeys) {
        key.usage = await redis.getUsageStats(key.id)
        const costStats = await redis.getCostStats(key.id)
        // Add cost information to usage object for frontend compatibility
        if (key.usage && costStats) {
          key.usage.total = key.usage.total || {}
          key.usage.total.cost = costStats.total
          key.usage.totalCost = costStats.total
        }
        key.totalCost = costStats ? costStats.total : 0
        key.tokenLimit = parseInt(key.tokenLimit)
        key.concurrencyLimit = parseInt(key.concurrencyLimit || 0)
        key.rateLimitWindow = parseInt(key.rateLimitWindow || 0)
        key.rateLimitRequests = parseInt(key.rateLimitRequests || 0)
        key.rateLimitCost = parseFloat(key.rateLimitCost || 0) // 新增：速率限制费用字段
        key.currentConcurrency = await redis.getConcurrency(key.id)
        key.isActive = key.isActive === 'true'
        key.enableModelRestriction = key.enableModelRestriction === 'true'
        key.enableClientRestriction = key.enableClientRestriction === 'true'
        key.permissions = key.permissions || 'all' // 兼容旧数据
        key.dailyCostLimit = parseFloat(key.dailyCostLimit || 0)
        key.totalCostLimit = parseFloat(key.totalCostLimit || 0)
        key.weeklyOpusCostLimit = parseFloat(key.weeklyOpusCostLimit || 0)
        key.dailyOpusCostLimit = parseFloat(key.dailyOpusCostLimit || 0)
        key.dailyCost = (await redis.getDailyCost(key.id)) || 0
        key.weeklyOpusCost = (await redis.getWeeklyOpusCost(key.id)) || 0
        key.dailyOpusCost = (await redis.getDailyOpusCost(key.id)) || 0
        key.activationDays = parseInt(key.activationDays || 0)
        key.activationUnit = key.activationUnit || 'days'
        key.expirationMode = key.expirationMode || 'fixed'
        key.isActivated = key.isActivated === 'true'
        key.activatedAt = key.activatedAt || null

        // 获取当前时间窗口的请求次数、Token使用量和费用
        if (key.rateLimitWindow > 0) {
          const requestCountKey = `rate_limit:requests:${key.id}`
          const tokenCountKey = `rate_limit:tokens:${key.id}`
          const costCountKey = `rate_limit:cost:${key.id}` // 新增：费用计数器
          const windowStartKey = `rate_limit:window_start:${key.id}`

          key.currentWindowRequests = parseInt((await client.get(requestCountKey)) || '0')
          key.currentWindowTokens = parseInt((await client.get(tokenCountKey)) || '0')
          key.currentWindowCost = parseFloat((await client.get(costCountKey)) || '0') // 新增：当前窗口费用

          // 获取窗口开始时间和计算剩余时间
          const windowStart = await client.get(windowStartKey)
          if (windowStart) {
            const now = Date.now()
            const windowStartTime = parseInt(windowStart)
            const windowDuration = key.rateLimitWindow * 60 * 1000 // 转换为毫秒
            const windowEndTime = windowStartTime + windowDuration

            // 如果窗口还有效
            if (now < windowEndTime) {
              key.windowStartTime = windowStartTime
              key.windowEndTime = windowEndTime
              key.windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
            } else {
              // 窗口已过期，下次请求会重置
              key.windowStartTime = null
              key.windowEndTime = null
              key.windowRemainingSeconds = 0
              // 重置计数为0，因为窗口已过期
              key.currentWindowRequests = 0
              key.currentWindowTokens = 0
              key.currentWindowCost = 0 // 新增：重置费用
            }
          } else {
            // 窗口还未开始（没有任何请求）
            key.windowStartTime = null
            key.windowEndTime = null
            key.windowRemainingSeconds = null
          }
        } else {
          key.currentWindowRequests = 0
          key.currentWindowTokens = 0
          key.currentWindowCost = 0 // 新增：重置费用
          key.windowStartTime = null
          key.windowEndTime = null
          key.windowRemainingSeconds = null
        }

        try {
          key.restrictedModels = key.restrictedModels ? JSON.parse(key.restrictedModels) : []
        } catch (e) {
          key.restrictedModels = []
        }
        try {
          key.allowedClients = key.allowedClients ? JSON.parse(key.allowedClients) : []
        } catch (e) {
          key.allowedClients = []
        }
        try {
          key.tags = key.tags ? JSON.parse(key.tags) : []
        } catch (e) {
          key.tags = []
        }
        // 不暴露已弃用字段
        if (Object.prototype.hasOwnProperty.call(key, 'ccrAccountId')) {
          delete key.ccrAccountId
        }
        delete key.apiKey // 不返回哈希后的key
      }

      return apiKeys
    } catch (error) {
      logger.error('❌ Failed to get API keys:', error)
      throw error
    }
  }

  // 📝 更新API Key
  async updateApiKey(keyId, updates) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 允许更新的字段
      const allowedUpdates = [
        'name',
        'description',
        'tokenLimit',
        'concurrencyLimit',
        'rateLimitWindow',
        'rateLimitRequests',
        'rateLimitCost', // 新增：速率限制费用字段
        'isActive',
        'claudeAccountId',
        'claudeConsoleAccountId',
        'geminiAccountId',
        'openaiAccountId',
        'azureOpenaiAccountId',
        'bedrockAccountId', // 添加 Bedrock 账号ID
        'droidAccountId',
        'permissions',
        'expiresAt',
        'activationDays', // 新增：激活后有效天数
        'activationUnit', // 新增：激活时间单位
        'expirationMode', // 新增：过期模式
        'isActivated', // 新增：是否已激活
        'activatedAt', // 新增：激活时间
        'enableModelRestriction',
        'restrictedModels',
        'enableClientRestriction',
        'allowedClients',
        'dailyCostLimit',
        'totalCostLimit',
        'weeklyOpusCostLimit',
        'dailyOpusCostLimit',
        'tags',
        'userId', // 新增：用户ID（所有者变更）
        'userUsername', // 新增：用户名（所有者变更）
        'createdBy' // 新增：创建者（所有者变更）
      ]
      const updatedData = { ...keyData }

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          if (field === 'restrictedModels' || field === 'allowedClients' || field === 'tags') {
            // 特殊处理数组字段
            updatedData[field] = JSON.stringify(value || [])
          } else if (
            field === 'enableModelRestriction' ||
            field === 'enableClientRestriction' ||
            field === 'isActivated'
          ) {
            // 布尔值转字符串
            updatedData[field] = String(value)
          } else if (field === 'expiresAt' || field === 'activatedAt') {
            // 日期字段保持原样，不要toString()
            updatedData[field] = value || ''
          } else {
            updatedData[field] = (value !== null && value !== undefined ? value : '').toString()
          }
        }
      }

      updatedData.updatedAt = new Date().toISOString()

      // 更新时不需要重新建立哈希映射，因为API Key本身没有变化
      await redis.setApiKey(keyId, updatedData)

      logger.success(`📝 Updated API key: ${keyId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to update API key:', error)
      throw error
    }
  }

  // 🗑️ 软删除API Key (保留使用统计)
  async deleteApiKey(keyId, deletedBy = 'system', deletedByType = 'system') {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 标记为已删除，保留所有数据和统计信息
      const updatedData = {
        ...keyData,
        isDeleted: 'true',
        deletedAt: new Date().toISOString(),
        deletedBy,
        deletedByType, // 'user', 'admin', 'system'
        isActive: 'false' // 同时禁用
      }

      await redis.setApiKey(keyId, updatedData)

      // 从哈希映射中移除（这样就不能再使用这个key进行API调用）
      if (keyData.apiKey) {
        await redis.deleteApiKeyHash(keyData.apiKey)
      }

      logger.success(`🗑️ Soft deleted API key: ${keyId} by ${deletedBy} (${deletedByType})`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to delete API key:', error)
      throw error
    }
  }

  // 🔄 恢复已删除的API Key
  async restoreApiKey(keyId, restoredBy = 'system', restoredByType = 'system') {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 检查是否确实是已删除的key
      if (keyData.isDeleted !== 'true') {
        throw new Error('API key is not deleted')
      }

      // 准备更新的数据
      const updatedData = { ...keyData }
      updatedData.isActive = 'true'
      updatedData.restoredAt = new Date().toISOString()
      updatedData.restoredBy = restoredBy
      updatedData.restoredByType = restoredByType

      // 从更新的数据中移除删除相关的字段
      delete updatedData.isDeleted
      delete updatedData.deletedAt
      delete updatedData.deletedBy
      delete updatedData.deletedByType

      // 保存更新后的数据
      await redis.setApiKey(keyId, updatedData)

      // 使用Redis的hdel命令删除不需要的字段
      const keyName = `apikey:${keyId}`
      await redis.client.hdel(keyName, 'isDeleted', 'deletedAt', 'deletedBy', 'deletedByType')

      // 重新建立哈希映射（恢复API Key的使用能力）
      if (keyData.apiKey) {
        await redis.setApiKeyHash(keyData.apiKey, {
          id: keyId,
          name: keyData.name,
          isActive: 'true'
        })
      }

      logger.success(`✅ Restored API key: ${keyId} by ${restoredBy} (${restoredByType})`)

      return { success: true, apiKey: updatedData }
    } catch (error) {
      logger.error('❌ Failed to restore API key:', error)
      throw error
    }
  }

  // 🗑️ 彻底删除API Key（物理删除）
  async permanentDeleteApiKey(keyId) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 确保只能彻底删除已经软删除的key
      if (keyData.isDeleted !== 'true') {
        throw new Error('只能彻底删除已经删除的API Key')
      }

      // 删除所有相关的使用统计数据
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      // 删除每日统计
      await redis.client.del(`usage:daily:${today}:${keyId}`)
      await redis.client.del(`usage:daily:${yesterday}:${keyId}`)

      // 删除月度统计
      const currentMonth = today.substring(0, 7)
      await redis.client.del(`usage:monthly:${currentMonth}:${keyId}`)

      // 删除所有相关的统计键（通过模式匹配）
      const usageKeys = await redis.client.keys(`usage:*:${keyId}*`)
      if (usageKeys.length > 0) {
        await redis.client.del(...usageKeys)
      }

      // 删除API Key本身
      await redis.deleteApiKey(keyId)

      logger.success(`🗑️ Permanently deleted API key: ${keyId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to permanently delete API key:', error)
      throw error
    }
  }

  // 🧹 清空所有已删除的API Keys
  async clearAllDeletedApiKeys() {
    try {
      const allKeys = await this.getAllApiKeys(true)
      const deletedKeys = allKeys.filter((key) => key.isDeleted === 'true')

      let successCount = 0
      let failedCount = 0
      const errors = []

      for (const key of deletedKeys) {
        try {
          await this.permanentDeleteApiKey(key.id)
          successCount++
        } catch (error) {
          failedCount++
          errors.push({
            keyId: key.id,
            keyName: key.name,
            error: error.message
          })
        }
      }

      logger.success(`🧹 Cleared deleted API keys: ${successCount} success, ${failedCount} failed`)

      return {
        success: true,
        total: deletedKeys.length,
        successCount,
        failedCount,
        errors
      }
    } catch (error) {
      logger.error('❌ Failed to clear all deleted API keys:', error)
      throw error
    }
  }

  // 📊 记录使用情况（支持缓存token和账户级别统计）
  async recordUsage(
    keyId,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    accountId = null
  ) {
    try {
      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      // 计算费用
      const CostCalculator = require('../utils/costCalculator')
      const costInfo = CostCalculator.calculateCost(
        {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreateTokens,
          cache_read_input_tokens: cacheReadTokens
        },
        model
      )

      // 检查是否为 1M 上下文请求
      let isLongContextRequest = false
      if (model && model.includes('[1m]')) {
        const totalInputTokens = inputTokens + cacheCreateTokens + cacheReadTokens
        isLongContextRequest = totalInputTokens > 200000
      }

      // 记录API Key级别的使用统计
      await redis.incrementTokenUsage(
        keyId,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        0, // ephemeral5mTokens - 暂时为0，后续处理
        0, // ephemeral1hTokens - 暂时为0，后续处理
        isLongContextRequest
      )

      // 记录费用统计
      if (costInfo.costs.total > 0) {
        await redis.incrementDailyCost(keyId, costInfo.costs.total)
        logger.database(
          `💰 Recorded cost for ${keyId}: $${costInfo.costs.total.toFixed(6)}, model: ${model}`
        )
      } else {
        logger.debug(`💰 No cost recorded for ${keyId} - zero cost for model: ${model}`)
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间
        keyData.lastUsedAt = new Date().toISOString()
        await redis.setApiKey(keyId, keyData)

        // 记录账户级别的使用统计（只统计实际处理请求的账户）
        if (accountId) {
          await redis.incrementAccountUsage(
            accountId,
            totalTokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            isLongContextRequest
          )
          logger.database(
            `📊 Recorded account usage: ${accountId} - ${totalTokens} tokens (API Key: ${keyId})`
          )
        } else {
          logger.debug(
            '⚠️ No accountId provided for usage recording, skipping account-level statistics'
          )
        }
      }

      // 记录单次请求的使用详情
      const usageCost = costInfo && costInfo.costs ? costInfo.costs.total || 0 : 0
      await redis.addUsageRecord(keyId, {
        timestamp: new Date().toISOString(),
        model,
        accountId: accountId || null,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        totalTokens,
        cost: Number(usageCost.toFixed(6)),
        costBreakdown: costInfo && costInfo.costs ? costInfo.costs : undefined
      })

      const logParts = [`Model: ${model}`, `Input: ${inputTokens}`, `Output: ${outputTokens}`]
      if (cacheCreateTokens > 0) {
        logParts.push(`Cache Create: ${cacheCreateTokens}`)
      }
      if (cacheReadTokens > 0) {
        logParts.push(`Cache Read: ${cacheReadTokens}`)
      }
      logParts.push(`Total: ${totalTokens} tokens`)

      logger.database(`📊 Recorded usage: ${keyId} - ${logParts.join(', ')}`)
    } catch (error) {
      logger.error('❌ Failed to record usage:', error)
    }
  }

  // 📊 记录 Opus 模型费用（仅限 claude 和 claude-console 账户）
  async recordOpusCost(keyId, cost, model, accountType) {
    try {
      // 判断是否为 Opus 模型
      if (!model || !model.toLowerCase().includes('claude-opus')) {
        return // 不是 Opus 模型，直接返回
      }

      // 判断是否为 claude、claude-console 或 ccr 账户
      if (
        !accountType ||
        (accountType !== 'claude' && accountType !== 'claude-console' && accountType !== 'ccr')
      ) {
        logger.debug(`⚠️ Skipping Opus cost recording for non-Claude account type: ${accountType}`)
        return // 不是 claude 账户，直接返回
      }

      // 记录 Opus 周费用和日费用
      await Promise.all([
        redis.incrementWeeklyOpusCost(keyId, cost),
        redis.incrementDailyOpusCost(keyId, cost)
      ])
      logger.database(
        `💰 Recorded Opus cost for ${keyId}: $${cost.toFixed(
          6
        )}, model: ${model}, account type: ${accountType}`
      )
    } catch (error) {
      logger.error('❌ Failed to record Opus cost:', error)
    }
  }

  // 📊 记录使用情况（新版本，支持详细的缓存类型）
  async recordUsageWithDetails(
    keyId,
    usageObject,
    model = 'unknown',
    accountId = null,
    accountType = null
  ) {
    try {
      // 提取 token 数量
      const inputTokens = usageObject.input_tokens || 0
      const outputTokens = usageObject.output_tokens || 0
      const cacheCreateTokens = usageObject.cache_creation_input_tokens || 0
      const cacheReadTokens = usageObject.cache_read_input_tokens || 0

      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      // 计算费用（支持详细的缓存类型）- 添加错误处理
      let costInfo = { totalCost: 0, ephemeral5mCost: 0, ephemeral1hCost: 0 }
      try {
        const pricingService = require('./pricingService')
        // 确保 pricingService 已初始化
        if (!pricingService.pricingData) {
          logger.warn('⚠️ PricingService not initialized, initializing now...')
          await pricingService.initialize()
        }
        costInfo = pricingService.calculateCost(usageObject, model)

        // 验证计算结果
        if (!costInfo || typeof costInfo.totalCost !== 'number') {
          logger.error(`❌ Invalid cost calculation result for model ${model}:`, costInfo)
          // 使用 CostCalculator 作为后备
          const CostCalculator = require('../utils/costCalculator')
          const fallbackCost = CostCalculator.calculateCost(usageObject, model)
          if (fallbackCost && fallbackCost.costs && fallbackCost.costs.total > 0) {
            logger.warn(
              `⚠️ Using fallback cost calculation for ${model}: $${fallbackCost.costs.total}`
            )
            costInfo = {
              totalCost: fallbackCost.costs.total,
              ephemeral5mCost: 0,
              ephemeral1hCost: 0
            }
          } else {
            costInfo = { totalCost: 0, ephemeral5mCost: 0, ephemeral1hCost: 0 }
          }
        }
      } catch (pricingError) {
        logger.error(`❌ Failed to calculate cost for model ${model}:`, pricingError)
        logger.error(`   Usage object:`, JSON.stringify(usageObject))
        // 使用 CostCalculator 作为后备
        try {
          const CostCalculator = require('../utils/costCalculator')
          const fallbackCost = CostCalculator.calculateCost(usageObject, model)
          if (fallbackCost && fallbackCost.costs && fallbackCost.costs.total > 0) {
            logger.warn(
              `⚠️ Using fallback cost calculation for ${model}: $${fallbackCost.costs.total}`
            )
            costInfo = {
              totalCost: fallbackCost.costs.total,
              ephemeral5mCost: 0,
              ephemeral1hCost: 0
            }
          }
        } catch (fallbackError) {
          logger.error(`❌ Fallback cost calculation also failed:`, fallbackError)
        }
      }

      // 提取详细的缓存创建数据
      let ephemeral5mTokens = 0
      let ephemeral1hTokens = 0

      if (usageObject.cache_creation && typeof usageObject.cache_creation === 'object') {
        ephemeral5mTokens = usageObject.cache_creation.ephemeral_5m_input_tokens || 0
        ephemeral1hTokens = usageObject.cache_creation.ephemeral_1h_input_tokens || 0
      }

      // 记录API Key级别的使用统计 - 这个必须执行
      await redis.incrementTokenUsage(
        keyId,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        ephemeral5mTokens, // 传递5分钟缓存 tokens
        ephemeral1hTokens, // 传递1小时缓存 tokens
        costInfo.isLongContextRequest || false // 传递 1M 上下文请求标记
      )

      // 记录费用统计
      if (costInfo.totalCost > 0) {
        await redis.incrementDailyCost(keyId, costInfo.totalCost)
        logger.database(
          `💰 Recorded cost for ${keyId}: $${costInfo.totalCost.toFixed(6)}, model: ${model}`
        )

        // 记录 Opus 周费用（如果适用）
        await this.recordOpusCost(keyId, costInfo.totalCost, model, accountType)

        // 记录详细的缓存费用（如果有）
        if (costInfo.ephemeral5mCost > 0 || costInfo.ephemeral1hCost > 0) {
          logger.database(
            `💰 Cache costs - 5m: $${costInfo.ephemeral5mCost.toFixed(
              6
            )}, 1h: $${costInfo.ephemeral1hCost.toFixed(6)}`
          )
        }
      } else {
        // 如果有 token 使用但费用为 0，记录警告
        if (totalTokens > 0) {
          logger.warn(
            `⚠️ No cost recorded for ${keyId} - zero cost for model: ${model} (tokens: ${totalTokens})`
          )
          logger.warn(`   This may indicate a pricing issue or model not found in pricing data`)
        } else {
          logger.debug(`💰 No cost recorded for ${keyId} - zero tokens for model: ${model}`)
        }
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间
        keyData.lastUsedAt = new Date().toISOString()
        await redis.setApiKey(keyId, keyData)

        // 记录账户级别的使用统计（只统计实际处理请求的账户）
        if (accountId) {
          await redis.incrementAccountUsage(
            accountId,
            totalTokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            costInfo.isLongContextRequest || false
          )
          logger.database(
            `📊 Recorded account usage: ${accountId} - ${totalTokens} tokens (API Key: ${keyId})`
          )
        } else {
          logger.debug(
            '⚠️ No accountId provided for usage recording, skipping account-level statistics'
          )
        }
      }

      const usageRecord = {
        timestamp: new Date().toISOString(),
        model,
        accountId: accountId || null,
        accountType: accountType || null,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        ephemeral5mTokens,
        ephemeral1hTokens,
        totalTokens,
        cost: Number((costInfo.totalCost || 0).toFixed(6)),
        costBreakdown: {
          input: costInfo.inputCost || 0,
          output: costInfo.outputCost || 0,
          cacheCreate: costInfo.cacheCreateCost || 0,
          cacheRead: costInfo.cacheReadCost || 0,
          ephemeral5m: costInfo.ephemeral5mCost || 0,
          ephemeral1h: costInfo.ephemeral1hCost || 0
        },
        isLongContext: costInfo.isLongContextRequest || false
      }

      await redis.addUsageRecord(keyId, usageRecord)

      const logParts = [`Model: ${model}`, `Input: ${inputTokens}`, `Output: ${outputTokens}`]
      if (cacheCreateTokens > 0) {
        logParts.push(`Cache Create: ${cacheCreateTokens}`)

        // 如果有详细的缓存创建数据，也记录它们
        if (usageObject.cache_creation) {
          const { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens } =
            usageObject.cache_creation
          if (ephemeral_5m_input_tokens > 0) {
            logParts.push(`5m: ${ephemeral_5m_input_tokens}`)
          }
          if (ephemeral_1h_input_tokens > 0) {
            logParts.push(`1h: ${ephemeral_1h_input_tokens}`)
          }
        }
      }
      if (cacheReadTokens > 0) {
        logParts.push(`Cache Read: ${cacheReadTokens}`)
      }
      logParts.push(`Total: ${totalTokens} tokens`)

      logger.database(`📊 Recorded usage: ${keyId} - ${logParts.join(', ')}`)
    } catch (error) {
      logger.error('❌ Failed to record usage:', error)
    }
  }

  // 🔐 生成密钥
  _generateSecretKey() {
    return crypto.randomBytes(32).toString('hex')
  }

  // 🔒 哈希API Key
  _hashApiKey(apiKey) {
    return crypto
      .createHash('sha256')
      .update(apiKey + config.security.encryptionKey)
      .digest('hex')
  }

  // 📈 获取使用统计
  async getUsageStats(keyId, options = {}) {
    const usageStats = await redis.getUsageStats(keyId)

    // options 可能是字符串（兼容旧接口），仅当为对象时才解析
    const optionObject =
      options && typeof options === 'object' && !Array.isArray(options) ? options : {}

    if (optionObject.includeRecords === false) {
      return usageStats
    }

    const recordLimit = optionObject.recordLimit || 20
    const recentRecords = await redis.getUsageRecords(keyId, recordLimit)

    return {
      ...usageStats,
      recentRecords
    }
  }

  // 📊 获取账户使用统计
  async getAccountUsageStats(accountId) {
    return await redis.getAccountUsageStats(accountId)
  }

  // 📈 获取所有账户使用统计
  async getAllAccountsUsageStats() {
    return await redis.getAllAccountsUsageStats()
  }

  // === 用户相关方法 ===

  // 🔑 创建API Key（支持用户）
  async createApiKey(options = {}) {
    return await this.generateApiKey(options)
  }

  // 👤 获取用户的API Keys
  async getUserApiKeys(userId, includeDeleted = false) {
    try {
      const allKeys = await redis.getAllApiKeys()
      let userKeys = allKeys.filter((key) => key.userId === userId)

      // 默认过滤掉已删除的API Keys
      if (!includeDeleted) {
        userKeys = userKeys.filter((key) => key.isDeleted !== 'true')
      }

      // Populate usage stats for each user's API key (same as getAllApiKeys does)
      const userKeysWithUsage = []
      for (const key of userKeys) {
        const usage = await redis.getUsageStats(key.id)
        const dailyCost = (await redis.getDailyCost(key.id)) || 0
        const costStats = await redis.getCostStats(key.id)

        userKeysWithUsage.push({
          id: key.id,
          name: key.name,
          description: key.description,
          key: key.apiKey ? `${this.prefix}****${key.apiKey.slice(-4)}` : null, // 只显示前缀和后4位
          tokenLimit: parseInt(key.tokenLimit || 0),
          isActive: key.isActive === 'true',
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          usage,
          dailyCost,
          totalCost: costStats.total,
          dailyCostLimit: parseFloat(key.dailyCostLimit || 0),
          totalCostLimit: parseFloat(key.totalCostLimit || 0),
          userId: key.userId,
          userUsername: key.userUsername,
          createdBy: key.createdBy,
          droidAccountId: key.droidAccountId,
          // Include deletion fields for deleted keys
          isDeleted: key.isDeleted,
          deletedAt: key.deletedAt,
          deletedBy: key.deletedBy,
          deletedByType: key.deletedByType
        })
      }

      return userKeysWithUsage
    } catch (error) {
      logger.error('❌ Failed to get user API keys:', error)
      return []
    }
  }

  // 🔍 通过ID获取API Key（检查权限）
  async getApiKeyById(keyId, userId = null) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData) {
        return null
      }

      // 如果指定了用户ID，检查权限
      if (userId && keyData.userId !== userId) {
        return null
      }

      return {
        id: keyData.id,
        name: keyData.name,
        description: keyData.description,
        key: keyData.apiKey,
        tokenLimit: parseInt(keyData.tokenLimit || 0),
        isActive: keyData.isActive === 'true',
        createdAt: keyData.createdAt,
        lastUsedAt: keyData.lastUsedAt,
        expiresAt: keyData.expiresAt,
        userId: keyData.userId,
        userUsername: keyData.userUsername,
        createdBy: keyData.createdBy,
        permissions: keyData.permissions,
        dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
        totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
        droidAccountId: keyData.droidAccountId
      }
    } catch (error) {
      logger.error('❌ Failed to get API key by ID:', error)
      return null
    }
  }

  // 🔄 重新生成API Key
  async regenerateApiKey(keyId) {
    try {
      const existingKey = await redis.getApiKey(keyId)
      if (!existingKey) {
        throw new Error('API key not found')
      }

      // 生成新的key
      const newApiKey = `${this.prefix}${this._generateSecretKey()}`
      const newHashedKey = this._hashApiKey(newApiKey)

      // 删除旧的哈希映射
      const oldHashedKey = existingKey.apiKey
      await redis.deleteApiKeyHash(oldHashedKey)

      // 更新key数据
      const updatedKeyData = {
        ...existingKey,
        apiKey: newHashedKey,
        updatedAt: new Date().toISOString()
      }

      // 保存新数据并建立新的哈希映射
      await redis.setApiKey(keyId, updatedKeyData, newHashedKey)

      logger.info(`🔄 Regenerated API key: ${existingKey.name} (${keyId})`)

      return {
        id: keyId,
        name: existingKey.name,
        key: newApiKey, // 返回完整的新key
        updatedAt: updatedKeyData.updatedAt
      }
    } catch (error) {
      logger.error('❌ Failed to regenerate API key:', error)
      throw error
    }
  }

  // 🗑️ 硬删除API Key (完全移除)
  async hardDeleteApiKey(keyId) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData) {
        throw new Error('API key not found')
      }

      // 删除key数据和哈希映射
      await redis.deleteApiKey(keyId)
      await redis.deleteApiKeyHash(keyData.apiKey)

      logger.info(`🗑️ Deleted API key: ${keyData.name} (${keyId})`)
      return true
    } catch (error) {
      logger.error('❌ Failed to delete API key:', error)
      throw error
    }
  }

  // 🚫 禁用用户的所有API Keys
  async disableUserApiKeys(userId) {
    try {
      const userKeys = await this.getUserApiKeys(userId)
      let disabledCount = 0

      for (const key of userKeys) {
        if (key.isActive) {
          await this.updateApiKey(key.id, { isActive: false })
          disabledCount++
        }
      }

      logger.info(`🚫 Disabled ${disabledCount} API keys for user: ${userId}`)
      return { count: disabledCount }
    } catch (error) {
      logger.error('❌ Failed to disable user API keys:', error)
      throw error
    }
  }

  // 📊 获取聚合使用统计（支持多个API Key）
  async getAggregatedUsageStats(keyIds, options = {}) {
    try {
      if (!Array.isArray(keyIds)) {
        keyIds = [keyIds]
      }

      const { period: _period = 'week', model: _model } = options
      const stats = {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        dailyStats: [],
        modelStats: []
      }

      // 汇总所有API Key的统计数据
      for (const keyId of keyIds) {
        const keyStats = await redis.getUsageStats(keyId)
        const costStats = await redis.getCostStats(keyId)
        if (keyStats && keyStats.total) {
          stats.totalRequests += keyStats.total.requests || 0
          stats.totalInputTokens += keyStats.total.inputTokens || 0
          stats.totalOutputTokens += keyStats.total.outputTokens || 0
          stats.totalCost += costStats?.total || 0
        }
      }

      // TODO: 实现日期范围和模型统计
      // 这里可以根据需要添加更详细的统计逻辑

      return stats
    } catch (error) {
      logger.error('❌ Failed to get usage stats:', error)
      return {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        dailyStats: [],
        modelStats: []
      }
    }
  }

  // 🔓 解绑账号从所有API Keys
  async unbindAccountFromAllKeys(accountId, accountType) {
    try {
      // 账号类型与字段的映射关系
      const fieldMap = {
        claude: 'claudeAccountId',
        'claude-console': 'claudeConsoleAccountId',
        gemini: 'geminiAccountId',
        openai: 'openaiAccountId',
        'openai-responses': 'openaiAccountId', // 特殊处理，带 responses: 前缀
        azure_openai: 'azureOpenaiAccountId',
        bedrock: 'bedrockAccountId',
        droid: 'droidAccountId',
        ccr: null // CCR 账号没有对应的 API Key 字段
      }

      const field = fieldMap[accountType]
      if (!field) {
        logger.info(`账号类型 ${accountType} 不需要解绑 API Key`)
        return 0
      }

      // 获取所有API Keys
      const allKeys = await this.getAllApiKeys()

      // 筛选绑定到此账号的 API Keys
      let boundKeys = []
      if (accountType === 'openai-responses') {
        // OpenAI-Responses 特殊处理：查找 openaiAccountId 字段中带 responses: 前缀的
        boundKeys = allKeys.filter((key) => key.openaiAccountId === `responses:${accountId}`)
      } else {
        // 其他账号类型正常匹配
        boundKeys = allKeys.filter((key) => key[field] === accountId)
      }

      // 批量解绑
      for (const key of boundKeys) {
        const updates = {}
        if (accountType === 'openai-responses') {
          updates.openaiAccountId = null
        } else if (accountType === 'claude-console') {
          updates.claudeConsoleAccountId = null
        } else {
          updates[field] = null
        }

        await this.updateApiKey(key.id, updates)
        logger.info(
          `✅ 自动解绑 API Key ${key.id} (${key.name}) 从 ${accountType} 账号 ${accountId}`
        )
      }

      if (boundKeys.length > 0) {
        logger.success(
          `🔓 成功解绑 ${boundKeys.length} 个 API Key 从 ${accountType} 账号 ${accountId}`
        )
      }

      return boundKeys.length
    } catch (error) {
      logger.error(`❌ 解绑 API Keys 失败 (${accountType} 账号 ${accountId}):`, error)
      return 0
    }
  }

  // 🧹 清理过期的API Keys
  async cleanupExpiredKeys() {
    try {
      const apiKeys = await redis.getAllApiKeys()
      const now = new Date()
      let cleanedCount = 0

      for (const key of apiKeys) {
        // 检查是否已过期且仍处于激活状态
        if (key.expiresAt && new Date(key.expiresAt) < now && key.isActive === 'true') {
          // 将过期的 API Key 标记为禁用状态，而不是直接删除
          await this.updateApiKey(key.id, { isActive: false })
          logger.info(`🔒 API Key ${key.id} (${key.name}) has expired and been disabled`)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        logger.success(`🧹 Disabled ${cleanedCount} expired API keys`)
      }

      return cleanedCount
    } catch (error) {
      logger.error('❌ Failed to cleanup expired keys:', error)
      return 0
    }
  }
}

// 导出实例和单独的方法
const apiKeyService = new ApiKeyService()

// 为了方便其他服务调用，导出 recordUsage 方法
apiKeyService.recordUsageMetrics = apiKeyService.recordUsage.bind(apiKeyService)

module.exports = apiKeyService
