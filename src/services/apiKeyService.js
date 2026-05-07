const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const config = require('../../config/config')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const serviceRatesService = require('./serviceRatesService')
const requestDetailService = require('./requestDetailService')
const { isClaudeFamilyModel } = require('../utils/modelHelper')
const { finalizeRequestDetailMeta } = require('../utils/requestDetailHelper')
const requestBodyRuleService = require('./requestBodyRuleService')

const ACCOUNT_TYPE_CONFIG = {
  claude: { prefix: 'claude:account:' },
  'claude-console': { prefix: 'claude_console_account:' },
  openai: { prefix: 'openai:account:' },
  'openai-responses': { prefix: 'openai_responses_account:' },
  'azure-openai': { prefix: 'azure_openai:account:' },
  gemini: { prefix: 'gemini_account:' },
  'gemini-api': { prefix: 'gemini_api_account:' },
  droid: { prefix: 'droid:account:' }
}

const ACCOUNT_TYPE_PRIORITY = [
  'openai',
  'openai-responses',
  'azure-openai',
  'claude',
  'claude-console',
  'gemini',
  'gemini-api',
  'droid'
]

const ACCOUNT_CATEGORY_MAP = {
  claude: 'claude',
  'claude-console': 'claude',
  openai: 'openai',
  'openai-responses': 'openai',
  'azure-openai': 'openai',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  droid: 'droid'
}

/**
 * 规范化权限数据，兼容旧格式（字符串）和新格式（数组）
 * @param {string|array} permissions - 权限数据
 * @returns {array} - 权限数组，空数组表示全部服务
 */
function normalizePermissions(permissions) {
  if (!permissions) {
    return [] // 空 = 全部服务
  }
  if (Array.isArray(permissions)) {
    return permissions
  }
  // 尝试解析 JSON 字符串（新格式存储）
  if (typeof permissions === 'string') {
    if (permissions.startsWith('[')) {
      try {
        const parsed = JSON.parse(permissions)
        if (Array.isArray(parsed)) {
          return parsed
        }
      } catch (e) {
        // 解析失败，继续处理为普通字符串
      }
    }
    // 旧格式 'all' 转为空数组
    if (permissions === 'all') {
      return []
    }
    // 兼容逗号分隔格式（修复历史错误数据，如 "claude,openai"）
    if (permissions.includes(',')) {
      return permissions
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    }
    // 旧单个字符串转为数组
    return [permissions]
  }
  return []
}

/**
 * 检查是否有访问特定服务的权限
 * @param {string|array} permissions - 权限数据
 * @param {string} service - 服务名称（claude/gemini/openai/droid）
 * @returns {boolean} - 是否有权限
 */
function hasPermission(permissions, service) {
  const perms = normalizePermissions(permissions)
  return perms.length === 0 || perms.includes(service) // 空数组 = 全部服务
}

function normalizeAccountTypeKey(type) {
  if (!type) {
    return null
  }
  const lower = String(type).toLowerCase()
  if (lower === 'claude_console') {
    return 'claude-console'
  }
  if (lower === 'openai_responses' || lower === 'openai-response' || lower === 'openai-responses') {
    return 'openai-responses'
  }
  if (lower === 'azure_openai' || lower === 'azureopenai' || lower === 'azure-openai') {
    return 'azure-openai'
  }
  if (lower === 'gemini_api' || lower === 'gemini-api') {
    return 'gemini-api'
  }
  return lower
}

function sanitizeAccountIdForType(accountId, accountType) {
  if (!accountId || typeof accountId !== 'string') {
    return accountId
  }
  if (accountType === 'openai-responses') {
    return accountId.replace(/^responses:/, '')
  }
  if (accountType === 'gemini-api') {
    return accountId.replace(/^api:/, '')
  }
  return accountId
}

function parseBooleanWithDefault(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return value === 'true'
  }

  return Boolean(value)
}

function parseOpenAIResponsesPayloadRules(rawRules) {
  if (rawRules === undefined || rawRules === null || rawRules === '') {
    return []
  }

  let parsedRules = rawRules
  if (typeof rawRules === 'string') {
    try {
      parsedRules = JSON.parse(rawRules)
    } catch (error) {
      return []
    }
  }

  if (!Array.isArray(parsedRules)) {
    return []
  }

  return parsedRules.map((rule) => requestBodyRuleService.normalizeRule(rule)).filter(Boolean)
}

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
      permissions = [], // 数组格式，空数组表示全部服务，如 ['claude', 'gemini']
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
      tags = [],
      activationDays = 0, // 新增：激活后有效天数（0表示不使用此功能）
      activationUnit = 'days', // 新增：激活时间单位 'hours' 或 'days'
      expirationMode = 'fixed', // 新增：过期模式 'fixed'(固定时间) 或 'activation'(首次使用后激活)
      icon = '', // 新增：图标（base64编码）
      serviceRates = {}, // API Key 级别服务倍率覆盖
      weeklyResetDay = 1, // 周费用重置日 (1=周一 ... 7=周日)
      weeklyResetHour = 0, // 周费用重置时 (0-23)
      enableOpenAIResponsesCodexAdaptation = true,
      enableOpenAIResponsesPayloadRules = false,
      openaiResponsesPayloadRules = []
    } = options

    const payloadRulesValidation = requestBodyRuleService.validateAndNormalizeRules(
      openaiResponsesPayloadRules
    )
    if (!payloadRulesValidation.valid) {
      throw new Error(payloadRulesValidation.error)
    }

    // 生成简单的API Key (64字符十六进制)
    const apiKey = `${this.prefix}${this._generateSecretKey()}`
    const keyId = uuidv4()
    const hashedKey = this._hashApiKey(apiKey)

    // 处理 permissions
    const _permissionsValue = permissions

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
      permissions: JSON.stringify(normalizePermissions(permissions)),
      enableModelRestriction: String(enableModelRestriction),
      restrictedModels: JSON.stringify(restrictedModels || []),
      enableClientRestriction: String(enableClientRestriction || false),
      allowedClients: JSON.stringify(allowedClients || []),
      dailyCostLimit: String(dailyCostLimit || 0),
      totalCostLimit: String(totalCostLimit || 0),
      weeklyOpusCostLimit: String(weeklyOpusCostLimit || 0),
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
      icon: icon || '', // 新增：图标（base64编码）
      serviceRates: JSON.stringify(serviceRates || {}), // API Key 级别服务倍率
      weeklyResetDay: String(weeklyResetDay || 1), // 周费用重置日 (1-7)
      weeklyResetHour: String(weeklyResetHour || 0), // 周费用重置时 (0-23)
      enableOpenAIResponsesCodexAdaptation: String(enableOpenAIResponsesCodexAdaptation !== false),
      enableOpenAIResponsesPayloadRules: String(enableOpenAIResponsesPayloadRules === true),
      openaiResponsesPayloadRules: JSON.stringify(payloadRulesValidation.rules)
    }

    // 保存API Key数据并建立哈希映射
    await redis.setApiKey(keyId, keyData, hashedKey)

    // 同步添加到费用排序索引
    try {
      const costRankService = require('./costRankService')
      await costRankService.addKeyToIndexes(keyId)
    } catch (err) {
      logger.warn(`Failed to add key ${keyId} to cost rank indexes:`, err.message)
    }

    // 同步添加到 API Key 索引（用于分页查询优化）
    try {
      const apiKeyIndexService = require('./apiKeyIndexService')
      await apiKeyIndexService.addToIndex({
        id: keyId,
        name: keyData.name,
        createdAt: keyData.createdAt,
        lastUsedAt: keyData.lastUsedAt,
        isActive: keyData.isActive === 'true',
        isDeleted: false,
        tags: JSON.parse(keyData.tags || '[]')
      })
    } catch (err) {
      logger.warn(`Failed to add key ${keyId} to API Key index:`, err.message)
    }

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
      permissions: normalizePermissions(keyData.permissions),
      enableModelRestriction: keyData.enableModelRestriction === 'true',
      restrictedModels: JSON.parse(keyData.restrictedModels),
      enableClientRestriction: keyData.enableClientRestriction === 'true',
      allowedClients: JSON.parse(keyData.allowedClients || '[]'),
      dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
      totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
      weeklyOpusCostLimit: parseFloat(keyData.weeklyOpusCostLimit || 0),
      tags: JSON.parse(keyData.tags || '[]'),
      activationDays: parseInt(keyData.activationDays || 0),
      activationUnit: keyData.activationUnit || 'days',
      expirationMode: keyData.expirationMode || 'fixed',
      isActivated: keyData.isActivated === 'true',
      activatedAt: keyData.activatedAt,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      createdBy: keyData.createdBy,
      serviceRates: JSON.parse(keyData.serviceRates || '{}'), // API Key 级别服务倍率
      enableOpenAIResponsesCodexAdaptation: parseBooleanWithDefault(
        keyData.enableOpenAIResponsesCodexAdaptation,
        true
      ),
      enableOpenAIResponsesPayloadRules: parseBooleanWithDefault(
        keyData.enableOpenAIResponsesPayloadRules,
        false
      ),
      openaiResponsesPayloadRules: parseOpenAIResponsesPayloadRules(
        keyData.openaiResponsesPayloadRules
      )
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
        // ⚠️ 警告：映射表查找失败，可能是竞态条件或映射表损坏
        logger.warn(
          `⚠️ API key not found in hash map: ${hashedKey.substring(0, 16)}... (possible race condition or corrupted hash map)`
        )
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

      // 按需获取费用统计（仅在有限制时查询，减少 Redis 调用）
      const dailyCostLimit = parseFloat(keyData.dailyCostLimit || 0)
      const totalCostLimit = parseFloat(keyData.totalCostLimit || 0)
      const weeklyOpusCostLimit = parseFloat(keyData.weeklyOpusCostLimit || 0)

      const costQueries = []
      if (dailyCostLimit > 0) {
        costQueries.push(redis.getDailyCost(keyData.id).then((v) => ({ dailyCost: v || 0 })))
      }
      if (totalCostLimit > 0) {
        costQueries.push(redis.getCostStats(keyData.id).then((v) => ({ totalCost: v?.total || 0 })))
      }
      if (weeklyOpusCostLimit > 0) {
        const resetDay = parseInt(keyData.weeklyResetDay || 1)
        const resetHour = parseInt(keyData.weeklyResetHour || 0)
        costQueries.push(
          redis
            .getWeeklyOpusCost(keyData.id, resetDay, resetHour)
            .then((v) => ({ weeklyOpusCost: v || 0 }))
        )
      }

      const costData =
        costQueries.length > 0 ? Object.assign({}, ...(await Promise.all(costQueries))) : {}

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

      // 解析 serviceRates
      let serviceRates = {}
      try {
        serviceRates = keyData.serviceRates ? JSON.parse(keyData.serviceRates) : {}
      } catch (e) {
        // 解析失败使用默认值
      }

      const openaiResponsesPayloadRules = parseOpenAIResponsesPayloadRules(
        keyData.openaiResponsesPayloadRules
      )
      const enableOpenAIResponsesCodexAdaptation = parseBooleanWithDefault(
        keyData.enableOpenAIResponsesCodexAdaptation,
        true
      )
      const enableOpenAIResponsesPayloadRules = parseBooleanWithDefault(
        keyData.enableOpenAIResponsesPayloadRules,
        false
      )

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
          permissions: normalizePermissions(keyData.permissions),
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
          rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
          rateLimitCost: parseFloat(keyData.rateLimitCost || 0), // 新增：速率限制费用字段
          enableModelRestriction: keyData.enableModelRestriction === 'true',
          restrictedModels,
          enableClientRestriction: keyData.enableClientRestriction === 'true',
          allowedClients,
          dailyCostLimit,
          totalCostLimit,
          weeklyOpusCostLimit,
          dailyCost: costData.dailyCost || 0,
          totalCost: costData.totalCost || 0,
          weeklyOpusCost: costData.weeklyOpusCost || 0,
          weeklyResetDay: parseInt(keyData.weeklyResetDay || 1),
          weeklyResetHour: parseInt(keyData.weeklyResetHour || 0),
          tags,
          serviceRates,
          enableOpenAIResponsesCodexAdaptation,
          enableOpenAIResponsesPayloadRules,
          openaiResponsesPayloadRules
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
        const keyName = keyData.name || 'Unknown'
        return { valid: false, error: `API Key "${keyName}" 已被禁用`, keyName }
      }

      // 注意：这里不处理激活逻辑，保持 API Key 的未激活状态

      // 检查是否过期（仅对已激活的 Key 检查）
      if (
        keyData.isActivated === 'true' &&
        keyData.expiresAt &&
        new Date() > new Date(keyData.expiresAt)
      ) {
        const keyName = keyData.name || 'Unknown'
        return { valid: false, error: `API Key "${keyName}" 已过期`, keyName }
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
      const [dailyCost, costStats] = await Promise.all([
        redis.getDailyCost(keyData.id),
        redis.getCostStats(keyData.id)
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

      const openaiResponsesPayloadRules = parseOpenAIResponsesPayloadRules(
        keyData.openaiResponsesPayloadRules
      )
      const enableOpenAIResponsesCodexAdaptation = parseBooleanWithDefault(
        keyData.enableOpenAIResponsesCodexAdaptation,
        true
      )
      const enableOpenAIResponsesPayloadRules = parseBooleanWithDefault(
        keyData.enableOpenAIResponsesPayloadRules,
        false
      )

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
          permissions: normalizePermissions(keyData.permissions),
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
          dailyCost: dailyCost || 0,
          totalCost: costStats?.total || 0,
          weeklyOpusCost:
            (await redis.getWeeklyOpusCost(
              keyData.id,
              parseInt(keyData.weeklyResetDay || 1),
              parseInt(keyData.weeklyResetHour || 0)
            )) || 0,
          tags,
          usage,
          enableOpenAIResponsesCodexAdaptation,
          enableOpenAIResponsesPayloadRules,
          openaiResponsesPayloadRules
        }
      }
    } catch (error) {
      logger.error('❌ API key validation error (stats):', error)
      return { valid: false, error: 'Internal validation error' }
    }
  }

  // 🏷️ 获取所有标签（合并索引和全局集合）
  async getAllTags() {
    const indexTags = await redis.scanAllApiKeyTags()
    const globalTags = await redis.getGlobalTags()
    // 过滤空值和空格
    return [
      ...new Set([...indexTags, ...globalTags].map((t) => (t ? t.trim() : '')).filter((t) => t))
    ].sort()
  }

  // 🏷️ 创建新标签
  async createTag(tagName) {
    const existingTags = await this.getAllTags()
    if (existingTags.includes(tagName)) {
      return { success: false, error: '标签已存在' }
    }
    await redis.addTag(tagName)
    return { success: true }
  }

  // 🏷️ 获取标签详情（含使用数量）
  async getTagsWithCount() {
    const apiKeys = await redis.getAllApiKeys()
    const tagCounts = new Map()

    // 统计 API Key 上的标签（trim 后统计）
    for (const key of apiKeys) {
      if (key.isDeleted === 'true') {
        continue
      }
      let tags = []
      try {
        const parsed = key.tags ? JSON.parse(key.tags) : []
        tags = Array.isArray(parsed) ? parsed : []
      } catch {
        tags = []
      }
      for (const tag of tags) {
        if (typeof tag === 'string') {
          const trimmed = tag.trim()
          if (trimmed) {
            tagCounts.set(trimmed, (tagCounts.get(trimmed) || 0) + 1)
          }
        }
      }
    }

    // 直接获取全局标签集合（避免重复扫描）
    const globalTags = await redis.getGlobalTags()
    for (const tag of globalTags) {
      const trimmed = tag ? tag.trim() : ''
      if (trimmed && !tagCounts.has(trimmed)) {
        tagCounts.set(trimmed, 0)
      }
    }

    return Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }

  // 🏷️ 从所有 API Key 中移除指定标签
  async removeTagFromAllKeys(tagName) {
    const normalizedName = (tagName || '').trim()
    if (!normalizedName) {
      return { affectedCount: 0 }
    }

    const apiKeys = await redis.getAllApiKeys()
    let affectedCount = 0

    for (const key of apiKeys) {
      if (key.isDeleted === 'true') {
        continue
      }
      let tags = []
      try {
        const parsed = key.tags ? JSON.parse(key.tags) : []
        tags = Array.isArray(parsed) ? parsed : []
      } catch {
        tags = []
      }

      // 匹配时 trim 比较，过滤非字符串
      const strTags = tags.filter((t) => typeof t === 'string')
      if (strTags.some((t) => t.trim() === normalizedName)) {
        const newTags = strTags.filter((t) => t.trim() !== normalizedName)
        await this.updateApiKey(key.id, { tags: newTags })
        affectedCount++
      }
    }

    // 同时从全局标签集合删除
    await redis.removeTag(normalizedName)
    await redis.removeTag(tagName) // 也删除原始值（可能带空格）

    return { affectedCount }
  }

  // 🏷️ 重命名标签
  async renameTag(oldName, newName) {
    if (!newName || !newName.trim()) {
      return { affectedCount: 0, error: '新标签名不能为空' }
    }

    const normalizedOld = (oldName || '').trim()
    const normalizedNew = newName.trim()

    if (!normalizedOld) {
      return { affectedCount: 0, error: '旧标签名不能为空' }
    }

    const apiKeys = await redis.getAllApiKeys()
    let affectedCount = 0
    let foundInKeys = false

    for (const key of apiKeys) {
      if (key.isDeleted === 'true') {
        continue
      }
      let tags = []
      try {
        const parsed = key.tags ? JSON.parse(key.tags) : []
        tags = Array.isArray(parsed) ? parsed : []
      } catch {
        tags = []
      }

      // 匹配时 trim 比较，过滤非字符串
      const strTags = tags.filter((t) => typeof t === 'string')
      if (strTags.some((t) => t.trim() === normalizedOld)) {
        foundInKeys = true
        const newTags = [
          ...new Set(strTags.map((t) => (t.trim() === normalizedOld ? normalizedNew : t)))
        ]
        await this.updateApiKey(key.id, { tags: newTags })
        affectedCount++
      }
    }

    // 检查全局集合是否有该标签
    const globalTags = await redis.getGlobalTags()
    const foundInGlobal = globalTags.some(
      (t) => typeof t === 'string' && t.trim() === normalizedOld
    )

    if (!foundInKeys && !foundInGlobal) {
      return { affectedCount: 0, error: '标签不存在' }
    }

    // 同时更新全局标签集合（删旧加新）
    await redis.removeTag(normalizedOld)
    await redis.removeTag(oldName) // 也删除原始值
    await redis.addTag(normalizedNew)

    return { affectedCount }
  }

  // 📋 获取所有API Keys
  async getAllApiKeys(includeDeleted = false) {
    try {
      let apiKeys = await redis.getAllApiKeys()
      const client = redis.getClientSafe()
      const accountInfoCache = new Map()

      // 默认过滤掉已删除的API Keys
      if (!includeDeleted) {
        apiKeys = apiKeys.filter((key) => key.isDeleted !== 'true')
      }

      // 为每个key添加使用统计和当前并发数
      for (const key of apiKeys) {
        key.usage = await redis.getUsageStats(key.id)
        const costStats = await redis.getCostStats(key.id)
        // 为前端兼容性：把费用信息同步到 usage 对象里
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
        key.enableOpenAIResponsesCodexAdaptation = parseBooleanWithDefault(
          key.enableOpenAIResponsesCodexAdaptation,
          true
        )
        key.enableOpenAIResponsesPayloadRules = parseBooleanWithDefault(
          key.enableOpenAIResponsesPayloadRules,
          false
        )
        key.permissions = normalizePermissions(key.permissions)
        key.dailyCostLimit = parseFloat(key.dailyCostLimit || 0)
        key.totalCostLimit = parseFloat(key.totalCostLimit || 0)
        key.weeklyOpusCostLimit = parseFloat(key.weeklyOpusCostLimit || 0)
        key.dailyCost = (await redis.getDailyCost(key.id)) || 0
        key.weeklyOpusCost =
          (await redis.getWeeklyOpusCost(
            key.id,
            parseInt(key.weeklyResetDay || 1),
            parseInt(key.weeklyResetHour || 0)
          )) || 0
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
        key.openaiResponsesPayloadRules = parseOpenAIResponsesPayloadRules(
          key.openaiResponsesPayloadRules
        )
        // 不暴露已弃用字段
        if (Object.prototype.hasOwnProperty.call(key, 'ccrAccountId')) {
          delete key.ccrAccountId
        }

        let lastUsageRecord = null
        try {
          const usageRecords = await redis.getUsageRecords(key.id, 1)
          if (Array.isArray(usageRecords) && usageRecords.length > 0) {
            lastUsageRecord = usageRecords[0]
          }
        } catch (error) {
          logger.debug(`加载 API Key ${key.id} 的使用记录失败:`, error)
        }

        if (lastUsageRecord && (lastUsageRecord.accountId || lastUsageRecord.accountType)) {
          const resolvedAccount = await this._resolveLastUsageAccount(
            key,
            lastUsageRecord,
            accountInfoCache,
            client
          )

          if (resolvedAccount) {
            key.lastUsage = {
              accountId: resolvedAccount.accountId,
              rawAccountId: lastUsageRecord.accountId || resolvedAccount.accountId,
              accountType: resolvedAccount.accountType,
              accountCategory: resolvedAccount.accountCategory,
              accountName: resolvedAccount.accountName,
              recordedAt: lastUsageRecord.timestamp || key.lastUsedAt || null
            }
          } else {
            key.lastUsage = {
              accountId: null,
              rawAccountId: lastUsageRecord.accountId || null,
              accountType: 'deleted',
              accountCategory: 'deleted',
              accountName: '已删除',
              recordedAt: lastUsageRecord.timestamp || key.lastUsedAt || null
            }
          }
        } else {
          key.lastUsage = null
        }

        delete key.apiKey // 不返回哈希后的key
      }

      return apiKeys
    } catch (error) {
      logger.error('❌ Failed to get API keys:', error)
      throw error
    }
  }

  /**
   * 🚀 快速获取所有 API Keys（使用 Pipeline 批量操作，性能优化版）
   * 适用于 dashboard、usage-costs 等需要大量 API Key 数据的场景
   * @param {boolean} includeDeleted - 是否包含已删除的 API Keys
   * @returns {Promise<Array>} API Keys 列表
   */
  async getAllApiKeysFast(includeDeleted = false) {
    try {
      // 1. 使用 SCAN 获取所有 API Key IDs
      const keyIds = await redis.scanApiKeyIds()
      if (keyIds.length === 0) {
        return []
      }

      // 2. 批量获取基础数据
      let apiKeys = await redis.batchGetApiKeys(keyIds)

      // 3. 过滤已删除的
      if (!includeDeleted) {
        apiKeys = apiKeys.filter((key) => !key.isDeleted)
      }

      // 4. 批量获取统计数据（单次 Pipeline）
      const activeKeyIds = apiKeys.map((k) => k.id)
      const statsMap = await redis.batchGetApiKeyStats(activeKeyIds)

      // 5. 合并数据
      for (const key of apiKeys) {
        const stats = statsMap.get(key.id) || {}

        // 处理 usage 数据
        const usageTotal = stats.usageTotal || {}
        const usageDaily = stats.usageDaily || {}
        const usageMonthly = stats.usageMonthly || {}

        // 计算平均 RPM/TPM
        const createdAt = stats.createdAt ? new Date(stats.createdAt) : new Date()
        const daysSinceCreated = Math.max(
          1,
          Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        )
        const totalMinutes = daysSinceCreated * 24 * 60
        // 兼容旧数据格式：优先读 totalXxx，fallback 到 xxx
        const totalRequests = parseInt(usageTotal.totalRequests || usageTotal.requests) || 0
        const totalTokens = parseInt(usageTotal.totalTokens || usageTotal.tokens) || 0
        let inputTokens = parseInt(usageTotal.totalInputTokens || usageTotal.inputTokens) || 0
        let outputTokens = parseInt(usageTotal.totalOutputTokens || usageTotal.outputTokens) || 0
        let cacheCreateTokens =
          parseInt(usageTotal.totalCacheCreateTokens || usageTotal.cacheCreateTokens) || 0
        let cacheReadTokens =
          parseInt(usageTotal.totalCacheReadTokens || usageTotal.cacheReadTokens) || 0

        // 旧数据兼容：没有 input/output 分离时做 30/70 拆分
        const totalFromSeparate = inputTokens + outputTokens
        if (totalFromSeparate === 0 && totalTokens > 0) {
          inputTokens = Math.round(totalTokens * 0.3)
          outputTokens = Math.round(totalTokens * 0.7)
          cacheCreateTokens = 0
          cacheReadTokens = 0
        }

        // allTokens：优先读存储值，否则计算，最后 fallback 到 totalTokens
        const allTokens =
          parseInt(usageTotal.totalAllTokens || usageTotal.allTokens) ||
          inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens ||
          totalTokens

        key.usage = {
          total: {
            requests: totalRequests,
            tokens: allTokens, // 与 getUsageStats 语义一致：包含 cache 的总 tokens
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            allTokens,
            cost: stats.costStats?.total || 0
          },
          daily: {
            requests: parseInt(usageDaily.totalRequests || usageDaily.requests) || 0,
            tokens: parseInt(usageDaily.totalTokens || usageDaily.tokens) || 0
          },
          monthly: {
            requests: parseInt(usageMonthly.totalRequests || usageMonthly.requests) || 0,
            tokens: parseInt(usageMonthly.totalTokens || usageMonthly.tokens) || 0
          },
          averages: {
            rpm: Math.round((totalRequests / totalMinutes) * 100) / 100,
            tpm: Math.round((totalTokens / totalMinutes) * 100) / 100
          },
          totalCost: stats.costStats?.total || 0
        }

        // 费用统计
        key.totalCost = stats.costStats?.total || 0
        key.dailyCost = stats.dailyCost || 0
        key.weeklyOpusCost = stats.weeklyOpusCost || 0

        // 并发
        key.currentConcurrency = stats.concurrency || 0

        // 类型转换
        key.tokenLimit = parseInt(key.tokenLimit) || 0
        key.concurrencyLimit = parseInt(key.concurrencyLimit) || 0
        key.rateLimitWindow = parseInt(key.rateLimitWindow) || 0
        key.rateLimitRequests = parseInt(key.rateLimitRequests) || 0
        key.rateLimitCost = parseFloat(key.rateLimitCost) || 0
        key.dailyCostLimit = parseFloat(key.dailyCostLimit) || 0
        key.totalCostLimit = parseFloat(key.totalCostLimit) || 0
        key.weeklyOpusCostLimit = parseFloat(key.weeklyOpusCostLimit) || 0
        key.activationDays = parseInt(key.activationDays) || 0
        key.isActive = key.isActive === 'true' || key.isActive === true
        key.enableModelRestriction =
          key.enableModelRestriction === 'true' || key.enableModelRestriction === true
        key.enableClientRestriction =
          key.enableClientRestriction === 'true' || key.enableClientRestriction === true
        key.enableOpenAIResponsesCodexAdaptation = parseBooleanWithDefault(
          key.enableOpenAIResponsesCodexAdaptation,
          true
        )
        key.enableOpenAIResponsesPayloadRules = parseBooleanWithDefault(
          key.enableOpenAIResponsesPayloadRules,
          false
        )
        key.isActivated = key.isActivated === 'true' || key.isActivated === true
        key.permissions = key.permissions || 'all'
        key.activationUnit = key.activationUnit || 'days'
        key.expirationMode = key.expirationMode || 'fixed'
        key.activatedAt = key.activatedAt || null

        // Rate limit 窗口数据
        if (key.rateLimitWindow > 0) {
          const rl = stats.rateLimit || {}
          key.currentWindowRequests = rl.requests || 0
          key.currentWindowTokens = rl.tokens || 0
          key.currentWindowCost = rl.cost || 0

          if (rl.windowStart) {
            const now = Date.now()
            const windowDuration = key.rateLimitWindow * 60 * 1000
            const windowEndTime = rl.windowStart + windowDuration

            if (now < windowEndTime) {
              key.windowStartTime = rl.windowStart
              key.windowEndTime = windowEndTime
              key.windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
            } else {
              key.windowStartTime = null
              key.windowEndTime = null
              key.windowRemainingSeconds = 0
              key.currentWindowRequests = 0
              key.currentWindowTokens = 0
              key.currentWindowCost = 0
            }
          } else {
            key.windowStartTime = null
            key.windowEndTime = null
            key.windowRemainingSeconds = null
          }
        } else {
          key.currentWindowRequests = 0
          key.currentWindowTokens = 0
          key.currentWindowCost = 0
          key.windowStartTime = null
          key.windowEndTime = null
          key.windowRemainingSeconds = null
        }

        // JSON 字段解析（兼容已解析的数组和未解析的字符串）
        if (Array.isArray(key.restrictedModels)) {
          // 已解析，保持不变
        } else if (key.restrictedModels) {
          try {
            key.restrictedModels = JSON.parse(key.restrictedModels)
          } catch {
            key.restrictedModels = []
          }
        } else {
          key.restrictedModels = []
        }
        if (Array.isArray(key.allowedClients)) {
          // 已解析，保持不变
        } else if (key.allowedClients) {
          try {
            key.allowedClients = JSON.parse(key.allowedClients)
          } catch {
            key.allowedClients = []
          }
        } else {
          key.allowedClients = []
        }
        if (Array.isArray(key.tags)) {
          // 已解析，保持不变
        } else if (key.tags) {
          try {
            key.tags = JSON.parse(key.tags)
          } catch {
            key.tags = []
          }
        } else {
          key.tags = []
        }
        if (Array.isArray(key.openaiResponsesPayloadRules)) {
          // 已解析，保持不变
        } else if (key.openaiResponsesPayloadRules) {
          key.openaiResponsesPayloadRules = parseOpenAIResponsesPayloadRules(
            key.openaiResponsesPayloadRules
          )
        } else {
          key.openaiResponsesPayloadRules = []
        }

        // 生成掩码key后再清理敏感字段
        if (key.apiKey) {
          key.maskedKey = `${this.prefix}****${key.apiKey.slice(-4)}`
        }
        delete key.apiKey
        delete key.ccrAccountId

        // 不获取 lastUsage（太慢），设为 null
        key.lastUsage = null
      }

      return apiKeys
    } catch (error) {
      logger.error('❌ Failed to get API keys (fast):', error)
      throw error
    }
  }

  /**
   * 获取所有 API Keys 的轻量版本（仅绑定字段，用于计算绑定数）
   * @returns {Promise<Array>} 包含绑定字段的 API Keys 列表
   */
  async getAllApiKeysLite() {
    try {
      const client = redis.getClientSafe()
      const keyIds = await redis.scanApiKeyIds()

      if (keyIds.length === 0) {
        return []
      }

      // Pipeline 只获取绑定相关字段
      const pipeline = client.pipeline()
      for (const keyId of keyIds) {
        pipeline.hmget(
          `apikey:${keyId}`,
          'claudeAccountId',
          'geminiAccountId',
          'openaiAccountId',
          'droidAccountId',
          'isDeleted'
        )
      }
      const results = await pipeline.exec()

      return keyIds
        .map((id, i) => {
          const [err, fields] = results[i]
          if (err) {
            return null
          }
          return {
            id,
            claudeAccountId: fields[0] || null,
            geminiAccountId: fields[1] || null,
            openaiAccountId: fields[2] || null,
            droidAccountId: fields[3] || null,
            isDeleted: fields[4] === 'true'
          }
        })
        .filter((k) => k && !k.isDeleted)
    } catch (error) {
      logger.error('❌ Failed to get API keys (lite):', error)
      return []
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
        'tags',
        'userId', // 新增：用户ID（所有者变更）
        'userUsername', // 新增：用户名（所有者变更）
        'createdBy', // 新增：创建者（所有者变更）
        'serviceRates', // API Key 级别服务倍率
        'weeklyResetDay', // 周费用重置日 (1-7)
        'weeklyResetHour', // 周费用重置时 (0-23)
        'enableOpenAIResponsesCodexAdaptation',
        'enableOpenAIResponsesPayloadRules',
        'openaiResponsesPayloadRules'
      ]
      const updatedData = { ...keyData }

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          if (
            field === 'restrictedModels' ||
            field === 'allowedClients' ||
            field === 'tags' ||
            field === 'serviceRates' ||
            field === 'openaiResponsesPayloadRules'
          ) {
            // 特殊处理数组/对象字段
            updatedData[field] = JSON.stringify(value || (field === 'serviceRates' ? {} : []))
          } else if (field === 'permissions') {
            // 权限字段：规范化后JSON序列化，与createApiKey保持一致
            updatedData[field] = JSON.stringify(normalizePermissions(value))
          } else if (
            field === 'enableModelRestriction' ||
            field === 'enableClientRestriction' ||
            field === 'isActivated' ||
            field === 'enableOpenAIResponsesCodexAdaptation' ||
            field === 'enableOpenAIResponsesPayloadRules'
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

      // 传递hashedKey以确保映射表一致性
      // keyData.apiKey 存储的就是 hashedKey（见generateApiKey第123行）
      await redis.setApiKey(keyId, updatedData, keyData.apiKey)

      // 同步更新 API Key 索引
      try {
        const apiKeyIndexService = require('./apiKeyIndexService')
        await apiKeyIndexService.updateIndex(keyId, updates, {
          name: keyData.name,
          isActive: keyData.isActive === 'true',
          isDeleted: keyData.isDeleted === 'true',
          tags: JSON.parse(keyData.tags || '[]')
        })
      } catch (err) {
        logger.warn(`Failed to update API Key index for ${keyId}:`, err.message)
      }

      logger.success(`📝 Updated API key: ${keyId}, hashMap updated`)

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

      // 从费用排序索引中移除
      try {
        const costRankService = require('./costRankService')
        await costRankService.removeKeyFromIndexes(keyId)
      } catch (err) {
        logger.warn(`Failed to remove key ${keyId} from cost rank indexes:`, err.message)
      }

      // 更新 API Key 索引（标记为已删除）
      try {
        const apiKeyIndexService = require('./apiKeyIndexService')
        await apiKeyIndexService.updateIndex(
          keyId,
          { isDeleted: true, isActive: false },
          {
            name: keyData.name,
            isActive: keyData.isActive === 'true',
            isDeleted: false,
            tags: JSON.parse(keyData.tags || '[]')
          }
        )
      } catch (err) {
        logger.warn(`Failed to update API Key index for deleted key ${keyId}:`, err.message)
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

      // 重新添加到费用排序索引
      try {
        const costRankService = require('./costRankService')
        await costRankService.addKeyToIndexes(keyId)
      } catch (err) {
        logger.warn(`Failed to add restored key ${keyId} to cost rank indexes:`, err.message)
      }

      // 更新 API Key 索引（恢复为活跃状态）
      try {
        const apiKeyIndexService = require('./apiKeyIndexService')
        await apiKeyIndexService.updateIndex(
          keyId,
          { isDeleted: false, isActive: true },
          {
            name: keyData.name,
            isActive: false,
            isDeleted: true,
            tags: JSON.parse(keyData.tags || '[]')
          }
        )
      } catch (err) {
        logger.warn(`Failed to update API Key index for restored key ${keyId}:`, err.message)
      }

      logger.success(`Restored API key: ${keyId} by ${restoredBy} (${restoredByType})`)

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
      const usageKeys = await redis.scanKeys(`usage:*:${keyId}*`)
      if (usageKeys.length > 0) {
        await redis.batchDelChunked(usageKeys)
      }

      // 从 API Key 索引中移除
      try {
        const apiKeyIndexService = require('./apiKeyIndexService')
        await apiKeyIndexService.removeFromIndex(keyId, {
          name: keyData.name,
          tags: JSON.parse(keyData.tags || '[]')
        })
      } catch (err) {
        logger.warn(`Failed to remove key ${keyId} from API Key index:`, err.message)
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
      const allKeys = await this.getAllApiKeysFast(true)
      const deletedKeys = allKeys.filter((key) => key.isDeleted === true)

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

  // 📊 记录使用情况（支持缓存token和账户级别统计，应用服务倍率）
  async recordUsage(
    keyId,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    accountId = null,
    accountType = null,
    serviceTier = null,
    requestMeta = null
  ) {
    try {
      const finalizedRequestMeta = finalizeRequestDetailMeta(requestMeta)
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
        model,
        serviceTier
      )

      // 检查是否为 1M 上下文请求
      let isLongContextRequest = false
      if (model && model.includes('[1m]')) {
        const totalInputTokens = inputTokens + cacheCreateTokens + cacheReadTokens
        isLongContextRequest = totalInputTokens > 200000
      }

      // 计算费用（应用服务倍率）
      const realCost = costInfo.costs.total
      let ratedCost = realCost
      if (realCost > 0) {
        const service = serviceRatesService.getService(accountType, model)
        ratedCost = await this.calculateRatedCost(keyId, service, realCost)
      }

      // 记录API Key级别的使用统计（包含费用）
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
        isLongContextRequest,
        realCost,
        ratedCost
      )

      // 记录费用统计到每日/每月汇总
      if (realCost > 0) {
        await redis.incrementDailyCost(keyId, ratedCost, realCost)
        logger.database(
          `💰 Recorded cost for ${keyId}: rated=$${ratedCost.toFixed(6)}, real=$${realCost.toFixed(6)}, model: ${model}`
        )

        // 记录 Opus 周费用（如果适用）
        await this.recordOpusCost(keyId, ratedCost, realCost, model, accountType)
      } else {
        logger.debug(`💰 No cost recorded for ${keyId} - zero cost for model: ${model}`)
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间
        const lastUsedAt = new Date().toISOString()
        keyData.lastUsedAt = lastUsedAt
        await redis.setApiKey(keyId, keyData)

        // 同步更新 lastUsedAt 索引
        try {
          const apiKeyIndexService = require('./apiKeyIndexService')
          await apiKeyIndexService.updateLastUsedAt(keyId, lastUsedAt)
        } catch (err) {
          // 索引更新失败不影响主流程
        }

        // 记录账户级别的使用统计（只统计实际处理请求的账户）
        if (accountId) {
          await redis.incrementAccountUsage(
            accountId,
            totalTokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            0, // ephemeral5mTokens - recordUsage 不含详细缓存数据
            0, // ephemeral1hTokens - recordUsage 不含详细缓存数据
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

      // 记录单次请求的使用详情（同时保存真实成本和倍率成本）
      const usageRecord = {
        timestamp: new Date().toISOString(),
        model,
        accountId: accountId || null,
        accountType: accountType || null,
        requestId: finalizedRequestMeta?.requestId || null,
        endpoint: finalizedRequestMeta?.endpoint || null,
        method: finalizedRequestMeta?.method || null,
        statusCode: finalizedRequestMeta?.statusCode || null,
        stream: finalizedRequestMeta?.stream === true,
        durationMs: finalizedRequestMeta?.durationMs ?? null,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        totalTokens,
        cost: Number(ratedCost.toFixed(6)),
        realCost: Number(realCost.toFixed(6)),
        costBreakdown: costInfo?.costs || undefined,
        realCostBreakdown: costInfo?.costs || undefined,
        isLongContext: isLongContextRequest
      }

      await redis.addUsageRecord(keyId, usageRecord)
      this._captureRequestDetail(keyId, usageRecord, finalizedRequestMeta).catch((captureError) => {
        logger.warn(`⚠️ Failed to schedule request detail capture: ${captureError.message}`)
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

      return { realCost, ratedCost }
    } catch (error) {
      logger.error('❌ Failed to record usage:', error)
      return { realCost: 0, ratedCost: 0 }
    }
  }

  // 📊 记录 Opus 模型费用（仅限 claude 和 claude-console 账户，支持自定义重置周期）
  // ratedCost: 倍率后的成本（用于限额校验）
  // realCost: 真实成本（用于对账），如果不传则等于 ratedCost
  async recordOpusCost(keyId, ratedCost, realCost, model, accountType) {
    try {
      // 判断是否为 Claude 系列模型（包含 Bedrock 格式等）
      if (!isClaudeFamilyModel(model)) {
        return
      }

      // 判断是否为 claude-official、claude-console 或 ccr 账户
      const opusAccountTypes = ['claude-official', 'claude-console', 'ccr']
      if (!accountType || !opusAccountTypes.includes(accountType)) {
        logger.debug(`⚠️ Skipping Opus cost recording for non-Claude account type: ${accountType}`)
        return // 不是 claude 账户，直接返回
      }

      // 获取 key 的重置配置
      const keyData = await redis.getApiKey(keyId)
      const resetDay = parseInt(keyData?.weeklyResetDay || 1)
      const resetHour = parseInt(keyData?.weeklyResetHour || 0)

      // 记录 Opus 周费用（倍率成本和真实成本）
      await redis.incrementWeeklyOpusCost(keyId, ratedCost, realCost, resetDay, resetHour)
      logger.database(
        `💰 Recorded Opus weekly cost for ${keyId}: rated=$${ratedCost.toFixed(6)}, real=$${realCost.toFixed(6)}, model: ${model}`
      )
    } catch (error) {
      logger.error('❌ Failed to record Opus weekly cost:', error)
    }
  }

  // 📊 记录使用情况（新版本，支持详细的缓存类型）
  async recordUsageWithDetails(
    keyId,
    usageObject,
    model = 'unknown',
    accountId = null,
    accountType = null,
    requestMeta = null
  ) {
    try {
      const finalizedRequestMeta = finalizeRequestDetailMeta(requestMeta)
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

      // 计算费用（应用服务倍率）- 需要在 incrementTokenUsage 之前计算
      const realCostWithDetails = costInfo.totalCost || 0
      let ratedCostWithDetails = realCostWithDetails
      if (realCostWithDetails > 0) {
        const service = serviceRatesService.getService(accountType, model)
        ratedCostWithDetails = await this.calculateRatedCost(keyId, service, realCostWithDetails)
      }

      // 记录API Key级别的使用统计（包含费用）
      await redis.incrementTokenUsage(
        keyId,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        ephemeral5mTokens,
        ephemeral1hTokens,
        costInfo.isLongContextRequest || false,
        realCostWithDetails,
        ratedCostWithDetails
      )

      // 记录费用到每日/每月汇总
      if (realCostWithDetails > 0) {
        // 记录倍率成本和真实成本
        await redis.incrementDailyCost(keyId, ratedCostWithDetails, realCostWithDetails)
        logger.database(
          `💰 Recorded cost for ${keyId}: rated=$${ratedCostWithDetails.toFixed(6)}, real=$${realCostWithDetails.toFixed(6)}, model: ${model}`
        )

        // 记录 Opus 周费用（如果适用，也应用倍率）
        await this.recordOpusCost(
          keyId,
          ratedCostWithDetails,
          realCostWithDetails,
          model,
          accountType
        )

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
        const lastUsedAt = new Date().toISOString()
        keyData.lastUsedAt = lastUsedAt
        await redis.setApiKey(keyId, keyData)

        // 同步更新 lastUsedAt 索引
        try {
          const apiKeyIndexService = require('./apiKeyIndexService')
          await apiKeyIndexService.updateLastUsedAt(keyId, lastUsedAt)
        } catch (err) {
          // 索引更新失败不影响主流程
        }

        // 记录账户级别的使用统计（只统计实际处理请求的账户）
        if (accountId) {
          await redis.incrementAccountUsage(
            accountId,
            totalTokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            ephemeral5mTokens,
            ephemeral1hTokens,
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
        requestId: finalizedRequestMeta?.requestId || null,
        endpoint: finalizedRequestMeta?.endpoint || null,
        method: finalizedRequestMeta?.method || null,
        statusCode: finalizedRequestMeta?.statusCode || null,
        stream: finalizedRequestMeta?.stream === true,
        durationMs: finalizedRequestMeta?.durationMs ?? null,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        ephemeral5mTokens,
        ephemeral1hTokens,
        totalTokens,
        cost: Number(ratedCostWithDetails.toFixed(6)),
        realCost: Number(realCostWithDetails.toFixed(6)),
        realCostBreakdown: {
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
      this._captureRequestDetail(keyId, usageRecord, finalizedRequestMeta).catch((captureError) => {
        logger.warn(`⚠️ Failed to schedule request detail capture: ${captureError.message}`)
      })

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

      // 🔔 发布计费事件到消息队列（异步非阻塞）
      this._publishBillingEvent({
        keyId,
        keyName: keyData?.name,
        userId: keyData?.userId,
        model,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        ephemeral5mTokens,
        ephemeral1hTokens,
        totalTokens,
        cost: costInfo.totalCost || 0,
        costBreakdown: {
          input: costInfo.inputCost || 0,
          output: costInfo.outputCost || 0,
          cacheCreate: costInfo.cacheCreateCost || 0,
          cacheRead: costInfo.cacheReadCost || 0,
          ephemeral5m: costInfo.ephemeral5mCost || 0,
          ephemeral1h: costInfo.ephemeral1hCost || 0
        },
        accountId,
        accountType,
        isLongContext: costInfo.isLongContextRequest || false,
        requestTimestamp: usageRecord.timestamp
      }).catch((err) => {
        // 发布失败不影响主流程，只记录错误
        logger.warn('⚠️ Failed to publish billing event:', err.message)
      })

      return { realCost: realCostWithDetails, ratedCost: ratedCostWithDetails }
    } catch (error) {
      logger.error('❌ Failed to record usage:', error)
      return { realCost: 0, ratedCost: 0 }
    }
  }

  async _captureRequestDetail(keyId, usageRecord, requestMeta = null) {
    if (!usageRecord) {
      return
    }

    await requestDetailService.captureRequestDetail({
      requestId: requestMeta?.requestId || usageRecord.requestId || null,
      timestamp: usageRecord.timestamp,
      requestStartedAt: requestMeta?.requestStartedAt || null,
      endpoint: requestMeta?.endpoint || usageRecord.endpoint || null,
      method: requestMeta?.method || usageRecord.method || null,
      statusCode: requestMeta?.statusCode ?? usageRecord.statusCode ?? 200,
      stream: requestMeta?.stream === true || usageRecord.stream === true,
      durationMs: requestMeta?.durationMs ?? usageRecord.durationMs ?? null,
      requestBody: requestMeta?.requestBody,
      apiKeyId: keyId,
      accountId: usageRecord.accountId || null,
      accountType: usageRecord.accountType || null,
      model: usageRecord.model || 'unknown',
      inputTokens: usageRecord.inputTokens || 0,
      outputTokens: usageRecord.outputTokens || 0,
      cacheReadTokens: usageRecord.cacheReadTokens || 0,
      cacheCreateTokens: usageRecord.cacheCreateTokens || 0,
      totalTokens: usageRecord.totalTokens || 0,
      cost: usageRecord.cost || 0,
      realCost: usageRecord.realCost || usageRecord.cost || 0,
      costBreakdown: usageRecord.costBreakdown || null,
      realCostBreakdown: usageRecord.realCostBreakdown || usageRecord.costBreakdown || null,
      isLongContextRequest:
        usageRecord.isLongContext === true || usageRecord.isLongContextRequest === true
    })
  }

  async _fetchAccountInfo(accountId, accountType, cache, client) {
    if (!client || !accountId || !accountType) {
      return null
    }

    const cacheKey = `${accountType}:${accountId}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }

    const accountConfig = ACCOUNT_TYPE_CONFIG[accountType]
    if (!accountConfig) {
      cache.set(cacheKey, null)
      return null
    }

    const redisKey = `${accountConfig.prefix}${accountId}`
    let accountData = null
    try {
      accountData = await client.hgetall(redisKey)
    } catch (error) {
      logger.debug(`加载账号信息失败 ${redisKey}:`, error)
    }

    if (accountData && Object.keys(accountData).length > 0) {
      const displayName =
        accountData.name ||
        accountData.displayName ||
        accountData.email ||
        accountData.username ||
        accountData.description ||
        accountId

      const info = { id: accountId, name: displayName }
      cache.set(cacheKey, info)
      return info
    }

    cache.set(cacheKey, null)
    return null
  }

  async _resolveAccountByUsageRecord(usageRecord, cache, client) {
    if (!usageRecord || !client) {
      return null
    }

    const rawAccountId = usageRecord.accountId || null
    const rawAccountType = normalizeAccountTypeKey(usageRecord.accountType)
    const modelName = usageRecord.model || usageRecord.actualModel || usageRecord.service || null

    if (!rawAccountId && !rawAccountType) {
      return null
    }

    const candidateIds = new Set()
    if (rawAccountId) {
      candidateIds.add(rawAccountId)
      if (typeof rawAccountId === 'string' && rawAccountId.startsWith('responses:')) {
        candidateIds.add(rawAccountId.replace(/^responses:/, ''))
      }
      if (typeof rawAccountId === 'string' && rawAccountId.startsWith('api:')) {
        candidateIds.add(rawAccountId.replace(/^api:/, ''))
      }
    }

    if (candidateIds.size === 0) {
      return null
    }

    const typeCandidates = []
    const pushType = (type) => {
      const normalized = normalizeAccountTypeKey(type)
      if (normalized && ACCOUNT_TYPE_CONFIG[normalized] && !typeCandidates.includes(normalized)) {
        typeCandidates.push(normalized)
      }
    }

    pushType(rawAccountType)

    if (modelName) {
      const lowerModel = modelName.toLowerCase()
      if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
        pushType('openai')
        pushType('openai-responses')
        pushType('azure-openai')
      } else if (lowerModel.includes('gemini')) {
        pushType('gemini')
        pushType('gemini-api')
      } else if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
        pushType('claude')
        pushType('claude-console')
      } else if (lowerModel.includes('droid')) {
        pushType('droid')
      }
    }

    ACCOUNT_TYPE_PRIORITY.forEach(pushType)

    for (const type of typeCandidates) {
      const accountConfig = ACCOUNT_TYPE_CONFIG[type]
      if (!accountConfig) {
        continue
      }

      for (const candidateId of candidateIds) {
        const normalizedId = sanitizeAccountIdForType(candidateId, type)
        const accountInfo = await this._fetchAccountInfo(normalizedId, type, cache, client)
        if (accountInfo) {
          return {
            accountId: normalizedId,
            accountName: accountInfo.name,
            accountType: type,
            accountCategory: ACCOUNT_CATEGORY_MAP[type] || 'other',
            rawAccountId: rawAccountId || normalizedId
          }
        }
      }
    }

    return null
  }

  async _resolveLastUsageAccount(apiKey, usageRecord, cache, client) {
    return await this._resolveAccountByUsageRecord(usageRecord, cache, client)
  }

  // 🔔 发布计费事件（内部方法）
  async _publishBillingEvent(eventData) {
    try {
      const billingEventPublisher = require('./billingEventPublisher')
      await billingEventPublisher.publishBillingEvent(eventData)
    } catch (error) {
      // 静默失败，不影响主流程
      logger.debug('Failed to publish billing event:', error.message)
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

    // API 兼容：同时输出 costBreakdown 和 realCostBreakdown
    const compatibleRecords = recentRecords.map((record) => {
      const breakdown = record.realCostBreakdown || record.costBreakdown
      return {
        ...record,
        costBreakdown: breakdown,
        realCostBreakdown: breakdown
      }
    })

    return {
      ...usageStats,
      recentRecords: compatibleRecords
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
      const allKeys = await this.getAllApiKeysFast(includeDeleted)
      let userKeys = allKeys.filter((key) => key.userId === userId)

      // 默认过滤掉已删除的API Keys（Fast版本返回布尔值）
      if (!includeDeleted) {
        userKeys = userKeys.filter((key) => !key.isDeleted)
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
          key: key.maskedKey || null, // Fast版本已提供maskedKey
          tokenLimit: parseInt(key.tokenLimit || 0),
          isActive: key.isActive === true, // Fast版本返回布尔值
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
        permissions: normalizePermissions(keyData.permissions),
        dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
        totalCostLimit: parseFloat(keyData.totalCostLimit || 0),
        // 所有平台账户绑定字段
        claudeAccountId: keyData.claudeAccountId,
        claudeConsoleAccountId: keyData.claudeConsoleAccountId,
        geminiAccountId: keyData.geminiAccountId,
        openaiAccountId: keyData.openaiAccountId,
        bedrockAccountId: keyData.bedrockAccountId,
        droidAccountId: keyData.droidAccountId,
        azureOpenaiAccountId: keyData.azureOpenaiAccountId,
        ccrAccountId: keyData.ccrAccountId,
        enableOpenAIResponsesCodexAdaptation: parseBooleanWithDefault(
          keyData.enableOpenAIResponsesCodexAdaptation,
          true
        ),
        enableOpenAIResponsesPayloadRules: parseBooleanWithDefault(
          keyData.enableOpenAIResponsesPayloadRules,
          false
        ),
        openaiResponsesPayloadRules: parseOpenAIResponsesPayloadRules(
          keyData.openaiResponsesPayloadRules
        )
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
        'gemini-api': 'geminiAccountId', // 特殊处理，带 api: 前缀
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
      const allKeys = await this.getAllApiKeysFast()

      // 筛选绑定到此账号的 API Keys
      let boundKeys = []
      if (accountType === 'openai-responses') {
        // OpenAI-Responses 特殊处理：查找 openaiAccountId 字段中带 responses: 前缀的
        boundKeys = allKeys.filter((key) => key.openaiAccountId === `responses:${accountId}`)
      } else if (accountType === 'gemini-api') {
        // Gemini-API 特殊处理：查找 geminiAccountId 字段中带 api: 前缀的
        boundKeys = allKeys.filter((key) => key.geminiAccountId === `api:${accountId}`)
      } else {
        // 其他账号类型正常匹配
        boundKeys = allKeys.filter((key) => key[field] === accountId)
      }

      // 批量解绑
      for (const key of boundKeys) {
        const updates = {}
        if (accountType === 'openai-responses') {
          updates.openaiAccountId = null
        } else if (accountType === 'gemini-api') {
          updates.geminiAccountId = null
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
      const apiKeys = await this.getAllApiKeysFast()
      const now = new Date()
      let cleanedCount = 0

      for (const key of apiKeys) {
        // 检查是否已过期且仍处于激活状态（Fast版本返回布尔值）
        if (key.expiresAt && new Date(key.expiresAt) < now && key.isActive === true) {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 服务倍率和费用限制相关方法
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 计算应用倍率后的费用
   * 公式：消费计费 = 真实消费 × 全局倍率 × Key 倍率
   * @param {string} keyId - API Key ID
   * @param {string} service - 服务类型
   * @param {number} realCost - 真实成本（USD）
   * @returns {Promise<number>} 应用倍率后的费用
   */
  async calculateRatedCost(keyId, service, realCost) {
    try {
      // 获取全局倍率
      const globalRate = await serviceRatesService.getServiceRate(service)

      // 获取 Key 倍率
      const keyData = await redis.getApiKey(keyId)
      let keyRates = {}
      try {
        keyRates = JSON.parse(keyData?.serviceRates || '{}')
      } catch (e) {
        keyRates = {}
      }
      const keyRate = keyRates[service] ?? 1.0

      // 相乘计算
      return realCost * globalRate * keyRate
    } catch (error) {
      logger.error('❌ Failed to calculate rated cost:', error)
      // 出错时返回原始费用
      return realCost
    }
  }

  /**
   * 增加 API Key 费用限制（用于核销额度卡）
   * @param {string} keyId - API Key ID
   * @param {number} amount - 要增加的金额（USD）
   * @returns {Promise<Object>} { success: boolean, newTotalCostLimit: number }
   */
  async addTotalCostLimit(keyId, amount) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      const currentLimit = parseFloat(keyData.totalCostLimit || 0)
      const newLimit = currentLimit + amount

      await redis.client.hset(`apikey:${keyId}`, 'totalCostLimit', String(newLimit))

      logger.success(`💰 Added $${amount} to key ${keyId}, new limit: $${newLimit}`)

      return { success: true, previousLimit: currentLimit, newTotalCostLimit: newLimit }
    } catch (error) {
      logger.error('❌ Failed to add total cost limit:', error)
      throw error
    }
  }

  /**
   * 减少 API Key 费用限制（用于撤销核销）
   * @param {string} keyId - API Key ID
   * @param {number} amount - 要减少的金额（USD）
   * @returns {Promise<Object>} { success: boolean, newTotalCostLimit: number, actualDeducted: number }
   */
  async deductTotalCostLimit(keyId, amount) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      const currentLimit = parseFloat(keyData.totalCostLimit || 0)
      const costStats = await redis.getCostStats(keyId)
      const currentUsed = costStats?.total || 0

      // 不能扣到比已使用的还少
      const minLimit = currentUsed
      const actualDeducted = Math.min(amount, currentLimit - minLimit)
      const newLimit = Math.max(currentLimit - amount, minLimit)

      await redis.client.hset(`apikey:${keyId}`, 'totalCostLimit', String(newLimit))

      logger.success(`💸 Deducted $${actualDeducted} from key ${keyId}, new limit: $${newLimit}`)

      return {
        success: true,
        previousLimit: currentLimit,
        newTotalCostLimit: newLimit,
        actualDeducted
      }
    } catch (error) {
      logger.error('❌ Failed to deduct total cost limit:', error)
      throw error
    }
  }

  /**
   * 延长 API Key 有效期（用于核销时间卡）
   * @param {string} keyId - API Key ID
   * @param {number} amount - 时间数量
   * @param {string} unit - 时间单位 'hours' | 'days' | 'months'
   * @returns {Promise<Object>} { success: boolean, newExpiresAt: string }
   */
  async extendExpiry(keyId, amount, unit = 'days') {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 计算新的过期时间
      let baseDate = keyData.expiresAt ? new Date(keyData.expiresAt) : new Date()
      // 如果已过期，从当前时间开始计算
      if (baseDate < new Date()) {
        baseDate = new Date()
      }

      let milliseconds
      switch (unit) {
        case 'hours':
          milliseconds = amount * 60 * 60 * 1000
          break
        case 'months':
          // 简化处理：1个月 = 30天
          milliseconds = amount * 30 * 24 * 60 * 60 * 1000
          break
        case 'days':
        default:
          milliseconds = amount * 24 * 60 * 60 * 1000
      }

      const newExpiresAt = new Date(baseDate.getTime() + milliseconds).toISOString()

      await this.updateApiKey(keyId, { expiresAt: newExpiresAt })

      logger.success(
        `⏰ Extended key ${keyId} expiry by ${amount} ${unit}, new expiry: ${newExpiresAt}`
      )

      return { success: true, previousExpiresAt: keyData.expiresAt, newExpiresAt }
    } catch (error) {
      logger.error('❌ Failed to extend expiry:', error)
      throw error
    }
  }
}

// 导出实例和单独的方法
const apiKeyService = new ApiKeyService()

// 为了方便其他服务调用，导出 recordUsage 方法
apiKeyService.recordUsageMetrics = apiKeyService.recordUsage.bind(apiKeyService)

// 导出权限辅助函数供路由使用
apiKeyService.hasPermission = hasPermission
apiKeyService.normalizePermissions = normalizePermissions

module.exports = apiKeyService
