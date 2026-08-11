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
const { normalizePermissions, hasPermission } = require('../compat/permissions')
const { RedisKeys, TTL, LIMITS } = require('../constants/redisKeys')

// tags 来自 Redis 存储，历史坏数据可能不是合法 JSON。索引维护时用它解析：
// 坏数据返回 []，绝不抛错中断状态/名称索引更新（坏的那条标签留待后续重建修正）。
const parseTagsSafe = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

// 提交 Redis MULTI 并逐条校验结果。MULTI/EXEC 非回滚语义：某条命令运行时报错（如 WRONGTYPE）
// 不会中止其它命令，结果数组里该条 err 非空但事务已部分提交。若不检查就会把"部分成功"当成功，
// 静默带回 hash/索引不一致（且 ALL_SET/ACTIVE_SET 缺成员是读侧对账修不了的假阴性）。这里一旦发现
// 任一命令出错就抛出，让调用方按失败处理（surface 出来，而非静默吞掉）。
const execMultiOrThrow = async (multi) => {
  const results = await multi.exec()
  if (!results) {
    throw new Error('Redis MULTI 事务未执行（EXEC 返回空）')
  }
  for (const [err] of results) {
    if (err) {
      throw err
    }
  }
  return results
}

const ACCOUNT_TYPE_CONFIG = {
  claude: { prefix: RedisKeys.accounts.claude('') },
  'claude-console': { prefix: RedisKeys.accounts.claudeConsole('') },
  openai: { prefix: RedisKeys.accounts.openai('') },
  'openai-responses': { prefix: RedisKeys.accounts.openaiResponses('') },
  'azure-openai': { prefix: RedisKeys.accounts.azureOpenai('') },
  gemini: { prefix: RedisKeys.accounts.gemini('') },
  'gemini-api': { prefix: RedisKeys.accounts.geminiApi('') },
  droid: { prefix: RedisKeys.accounts.droid('') },
  grok: { prefix: RedisKeys.accounts.grok('') }
}

const ACCOUNT_TYPE_PRIORITY = [
  'openai',
  'openai-responses',
  'azure-openai',
  'claude',
  'claude-console',
  'gemini',
  'gemini-api',
  'droid',
  'grok'
]

const ACCOUNT_CATEGORY_MAP = {
  claude: 'claude',
  'claude-console': 'claude',
  openai: 'openai',
  'openai-responses': 'openai',
  'azure-openai': 'openai',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  droid: 'droid',
  grok: 'grok'
}

// normalizePermissions / hasPermission 已收拢至 src/compat/permissions.js(见顶部 require)

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
      grokAccountId = null,
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
      grokAccountId: grokAccountId || '',
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

    // hash + hash_map + 主列表索引（ALL/ACTIVE/createdAt/lastUsedAt/name/tags）并入同一 MULTI 写入，
    // 取代原 setApiKey + 事务外 addToIndex 的两段式 best-effort（后者失败会留下"创建成功但主列表看不到"的假阴性）。
    // MULTI 非回滚,WRONGTYPE/OOM 等运行期错误仍可能部分提交,残留漂移由启动检测 + 重建愈合（见 apiKeyIndexService）。
    const apiKeyIndexService = require('./apiKeyIndexService')
    const client = redis.getClientSafe()
    const redisKey = RedisKeys.apiKey.byId(keyId)
    const multi = client.multi()
    if (hashedKey) {
      // 新结构 hash_map（认证主路径）+ 旧结构 apikey_hash:*（hash_map miss 时的回退路径），与 setApiKeyHash 一致，
      // 避免新建/轮换的 key 因只有 hash_map 而在 hash_map 丢失/重建未完成时比其它 key 更易认证失败。
      multi.hset(RedisKeys.apiKey.hashMap, hashedKey, keyId)
      multi.hset(RedisKeys.apiKey.hashLegacy(hashedKey), {
        id: keyId,
        name: keyData.name,
        isActive: keyData.isActive
      })
    }
    multi.hset(redisKey, keyData)
    multi.expire(redisKey, 86400 * 365)
    await apiKeyIndexService.addToIndex(
      {
        id: keyId,
        name: keyData.name,
        createdAt: keyData.createdAt,
        lastUsedAt: keyData.lastUsedAt,
        isActive: keyData.isActive === 'true',
        isDeleted: false,
        tags: parseTagsSafe(keyData.tags)
      },
      multi
    )
    await execMultiOrThrow(multi)

    // 同步添加到费用排序索引（独立子系统，best-effort）
    try {
      const costRankService = require('./costRankService')
      await costRankService.addKeyToIndexes(keyId)
    } catch (err) {
      logger.warn(`Failed to add key ${keyId} to cost rank indexes:`, err)
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
      grokAccountId: keyData.grokAccountId || '',
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

      // 已删除的 Key 一律视为不存在（须在 isActive 之前判断，否则已删且未激活的 key 会先返回 "disabled"、泄漏状态）。
      // 删除/恢复是受控状态机；即使 hash_map 因某些路径被重建，也在认证边界兜底拦截。
      if (keyData.isDeleted === 'true' || keyData.isDeleted === true) {
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

        // 保存到 Redis：hash + LAST_USED_AT 排序索引原子更新（激活会写 lastUsedAt，
        // 排序索引须同步，否则按"最后使用时间"排序时该 key 长期错序）
        await redis.setApiKeyWithLastUsedIndex(keyData.id, keyData)

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
          // 计费模式：消费热路径据此走预付费余额闸门（auth.js），缺省按后付费
          billingMode: keyData.billingMode || 'postpaid',
          claudeAccountId: keyData.claudeAccountId,
          claudeConsoleAccountId: keyData.claudeConsoleAccountId,
          geminiAccountId: keyData.geminiAccountId,
          openaiAccountId: keyData.openaiAccountId,
          azureOpenaiAccountId: keyData.azureOpenaiAccountId,
          bedrockAccountId: keyData.bedrockAccountId, // 添加 Bedrock 账号ID
          droidAccountId: keyData.droidAccountId,
          grokAccountId: keyData.grokAccountId || '',
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

      // key 状态校验（删除→视为不存在 / 禁用 / 过期 / 所属用户停用）抽到共用助手，
      // 保证与支付 token 复核路径（validateKeyActiveById）判据一致、不漂移。
      // 已删除的 Key 一律视为不存在：删除/恢复是受控状态机，这条认证旁路也不得放行（与主认证 validateApiKey 一致）。
      const usable = await this._validateKeyUsableStatus(keyData)
      if (!usable.valid) {
        return usable
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
          grokAccountId: keyData.grokAccountId || '',
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

  // 🏷️ 获取所有标签 = 未删除 key 的标签（scanAllApiKeyTags 已 scard 过滤死标签）∪ 手工创建的标签（0 引用也保留）
  async getAllTags() {
    // 不并回未过滤的 getGlobalTags（tags:all 残留死标签 scard=0，会抵消读侧过滤）；
    // 改并回 getManualTags：手工创建但未挂 key 的标签（Model 2，标签管理里可预创建）持久可见，而死标签仍隐藏。
    const [indexTags, manualTags] = await Promise.all([
      redis.scanAllApiKeyTags(),
      redis.getManualTags()
    ])
    return [
      ...new Set([...indexTags, ...manualTags].map((t) => (t ? t.trim() : '')).filter((t) => t))
    ].sort()
  }

  // 🏷️ 创建新标签
  async createTag(tagName) {
    const existingTags = await this.getAllTags()
    if (existingTags.includes(tagName)) {
      return { success: false, error: '标签已存在' }
    }
    // 登记到手工标签集合（而非 tags:all）：tags:all 由 key 派生 + 重建重造，会被清掉；手工集合持久保留，0 引用也可见
    await redis.addManualTag(tagName)
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

    // 手工创建但未挂 key 的标签以 count=0 并入（与 getAllTags 语义一致，标签管理里可见）；
    // 不并回 getGlobalTags（tags:all 残留的死标签会以 count=0 带回，抵消读侧过滤）。
    const manualTags = await redis.getManualTags()
    for (const tag of manualTags) {
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

    // 同时从全局标签集合 + 手工标签集合删除（删除标签是显式意图，手工登记一并清掉）
    await redis.removeTag(normalizedName)
    await redis.removeTag(tagName) // 也删除原始值（可能带空格）
    await redis.removeManualTag(normalizedName)
    await redis.removeManualTag(tagName)

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

    // 存在性以"手工标签集合"为准（tags:all 可能残留死标签、不可信）：挂在 key 上 或 手工登记过 即存在
    const manualTags = await redis.getManualTags()
    const foundInManual = manualTags.some(
      (t) => typeof t === 'string' && t.trim() === normalizedOld
    )

    if (!foundInKeys && !foundInManual) {
      return { affectedCount: 0, error: '标签不存在' }
    }

    // 清掉旧标签在 tags:all 的残留（新标签若挂在 key 上，由 updateApiKey 的 updateIndex 维护 tags:all）
    await redis.removeTag(normalizedOld)
    await redis.removeTag(oldName) // 也删除原始值
    // 手工标签随之改名：旧的若是手工登记，删旧登新，保证重命名后仍持久可见
    if (foundInManual) {
      await redis.removeManualTag(normalizedOld)
      await redis.removeManualTag(oldName)
      await redis.addManualTag(normalizedNew)
    }

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
          const requestCountKey = RedisKeys.rateLimit.requests(key.id)
          const tokenCountKey = RedisKeys.rateLimit.tokens(key.id)
          const costCountKey = RedisKeys.rateLimit.cost(key.id) // 新增：费用计数器
          const windowStartKey = RedisKeys.rateLimit.windowStart(key.id)

          key.currentWindowRequests = parseInt((await client.get(requestCountKey)) || '0')
          key.currentWindowTokens = parseInt((await client.get(tokenCountKey)) || '0')
          key.currentWindowCost = parseFloat((await client.get(costCountKey)) || '0') // 新增：当前窗口费用

          // 获取窗口开始时间和计算剩余时间
          const windowStart = await client.get(windowStartKey)
          if (windowStart) {
            const now = Date.now()
            const windowStartTime = parseInt(windowStart)
            const windowDuration = TTL.rateLimitWindowMs(key.rateLimitWindow) // 转换为毫秒
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

      return await this._enrichApiKeysWithStats(apiKeys)
    } catch (error) {
      logger.error('❌ Failed to get API keys (fast):', error)
      throw error
    }
  }

  // 给一批 API Key 合并使用统计（只对传入的 key 计算，供分页等场景复用）
  async _enrichApiKeysWithStats(apiKeys) {
    try {
      if (apiKeys.length === 0) {
        return apiKeys
      }

      const keyIds = apiKeys.map((k) => k.id)
      const statsMap = await redis.batchGetApiKeyStats(keyIds)

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
        let ephemeral5mTokens =
          parseInt(usageTotal.totalEphemeral5mTokens || usageTotal.ephemeral5mTokens) || 0
        let ephemeral1hTokens =
          parseInt(usageTotal.totalEphemeral1hTokens || usageTotal.ephemeral1hTokens) || 0

        // 旧数据兼容：没有 input/output 分离时做 30/70 拆分
        const totalFromSeparate = inputTokens + outputTokens
        if (totalFromSeparate === 0 && totalTokens > 0) {
          inputTokens = Math.round(totalTokens * 0.3)
          outputTokens = Math.round(totalTokens * 0.7)
          cacheCreateTokens = 0
          cacheReadTokens = 0
          ephemeral5mTokens = 0
          ephemeral1hTokens = 0
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
            ephemeral5mTokens,
            ephemeral1hTokens,
            allTokens,
            cost: stats.costStats?.total || 0,
            realCost: stats.costStats?.realTotal || 0
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
            const windowDuration = TTL.rateLimitWindowMs(key.rateLimitWindow)
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
      logger.error('❌ Failed to enrich API keys with stats:', error)
      throw error
    }
  }

  // 分页获取已删除的 API Keys（按删除时间倒序）
  // 优先走 deletedAt 有序索引（只读当前页，复杂度与 pageSize 相关）；索引未就绪时降级为全量扫描
  async getDeletedApiKeysPaginated({ page = 1, pageSize = 20, search = '' } = {}) {
    try {
      const keyword = (search || '').trim()

      // 有搜索词时，deletedAt 索引（按删除时间排序）无法做名称过滤，走全量扫描过滤
      // （与主列表 getApiKeysPaginated 在 search 时关闭索引的策略一致；搜索为低频操作）
      if (keyword) {
        return await this._getDeletedApiKeysByScan({ page, pageSize, search: keyword })
      }

      const apiKeyIndexService = require('./apiKeyIndexService')
      if (await apiKeyIndexService.isIndexReady()) {
        try {
          const result = await apiKeyIndexService.queryDeletedWithIndex({ page, pageSize })
          // 只对当前页的 key 计算使用统计
          await this._enrichApiKeysWithStats(result.items)
          return result
        } catch (error) {
          logger.warn('⚠️ 已删除 API Key 索引查询失败，降级到全量扫描:', error)
        }
      }

      return await this._getDeletedApiKeysByScan({ page, pageSize })
    } catch (error) {
      logger.error('❌ Failed to get deleted API keys (paginated):', error)
      throw error
    }
  }

  // 降级路径：全量扫描 + 内存筛选/排序/切片（仅在 deletedAt 索引未就绪时使用）
  async _getDeletedApiKeysByScan({ page = 1, pageSize = 20, search = '' } = {}) {
    const keyIds = await redis.scanApiKeyIds()
    if (keyIds.length === 0) {
      return { items: [], pagination: { page: 1, pageSize, total: 0, totalPages: 0 } }
    }

    const allKeys = await redis.batchGetApiKeys(keyIds)
    let deletedKeys = allKeys.filter((key) => key.isDeleted === true)

    // 按名称过滤（搜索）
    const keyword = (search || '').trim().toLowerCase()
    if (keyword) {
      deletedKeys = deletedKeys.filter((key) => (key.name || '').toLowerCase().includes(keyword))
    }

    // 按删除时间倒序，最近删除的排在前面
    deletedKeys.sort((a, b) => {
      const at = a.deletedAt ? new Date(a.deletedAt).getTime() : 0
      const bt = b.deletedAt ? new Date(b.deletedAt).getTime() : 0
      return bt - at
    })

    const total = deletedKeys.length
    const totalPages = Math.ceil(total / pageSize)
    const validPage = totalPages > 0 ? Math.min(Math.max(1, page), totalPages) : 1
    const start = (validPage - 1) * pageSize
    const pageKeys = deletedKeys.slice(start, start + pageSize)

    // 只对当前页的 key 计算使用统计
    await this._enrichApiKeysWithStats(pageKeys)

    return {
      items: pageKeys,
      pagination: { page: validPage, pageSize, total, totalPages }
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
          RedisKeys.apiKey.byId(keyId),
          'claudeAccountId',
          'geminiAccountId',
          'openaiAccountId',
          'droidAccountId',
          'grokAccountId',
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
            grokAccountId: fields[4] || null,
            isDeleted: fields[5] === 'true'
          }
        })
        .filter((k) => k && !k.isDeleted)
    } catch (error) {
      logger.error('❌ Failed to get API keys (lite):', error)
      return []
    }
  }

  // 📝 更新API Key
  async updateApiKey(keyId, updates, options = {}) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 已删除的 Key 不允许走普通更新：否则会把它重新写回 hash_map 认证映射，等于绕过恢复接口复活。
      // 复活必须走专门的 restoreApiKey（受控状态机）。
      if (keyData.isDeleted === 'true' || keyData.isDeleted === true) {
        throw new Error('Cannot update a deleted API key; restore it first')
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
        'grokAccountId',
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

      // 禁用/激活变更：写前对比，写后记流水
      let isActiveChange = null
      if (Object.prototype.hasOwnProperty.call(updates, 'isActive')) {
        const prevActive = keyData.isActive === 'true' || keyData.isActive === true
        const nextActive = updates.isActive === true || updates.isActive === 'true'
        if (prevActive !== nextActive) {
          isActiveChange = { prevActive, nextActive }
        }
      }

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

      // hash + hash_map + 主列表索引随更新并入同一 MULTI 写入，取代事务外 best-effort（避免"改名/启用禁用/标签更新后索引与 hash 不一致"）。
      // MULTI 非回滚,残留漂移由启动检测 + 重建愈合。
      // keyData.apiKey 存的就是 hashedKey（见 generateApiKey）
      const apiKeyIndexService = require('./apiKeyIndexService')
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.byId(keyId)
      const multi = client.multi()
      if (keyData.apiKey) {
        multi.hset(RedisKeys.apiKey.hashMap, keyData.apiKey, keyId)
      }
      multi.hset(redisKey, updatedData)
      multi.expire(redisKey, 86400 * 365)
      const removedTags = await apiKeyIndexService.updateIndex(
        keyId,
        updates,
        {
          name: keyData.name,
          isActive: keyData.isActive === 'true',
          isDeleted: keyData.isDeleted === 'true',
          tags: parseTagsSafe(keyData.tags)
        },
        multi
      )
      await execMultiOrThrow(multi)

      // tags:all 空集合清理（事务提交后 best-effort）：被移除的标签若已无 key 引用，从可选标签列表剔除
      if (Array.isArray(removedTags) && removedTags.length > 0) {
        for (const tag of removedTags) {
          try {
            const count = await client.scard(RedisKeys.apiKey.tag(tag))
            if (count === 0) {
              await client.srem(apiKeyIndexService.INDEX_KEYS.TAGS_ALL, tag)
            }
          } catch (err) {
            logger.warn(`Failed to prune empty tag ${tag} from tags:all:`, err)
          }
        }
      }

      // 禁用/激活流水：主写成功后追加，失败只记日志不回滚主写
      // recordIsActiveHistory=false 用于「改过期时间顺带改 isActive」等非显式禁用/激活路径，避免污染流水
      if (isActiveChange && options.recordIsActiveHistory !== false) {
        await this.appendChangeHistory(keyId, {
          action: isActiveChange.nextActive ? 'enable' : 'disable',
          operator: options.operator || 'system',
          operatorType: options.operatorType || (options.operator ? 'admin' : 'system'),
          before: { isActive: isActiveChange.prevActive },
          after: { isActive: isActiveChange.nextActive }
        })
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

      // hash 标记为已删除 + 加入 deletedAt 有序索引 + 清理新旧两套认证结构（禁止再用于 API 调用），并入同一 MULTI。
      // 取代两段式 best-effort,避免"旧认证结构残留被回填导致已删 Key 复活"。MULTI 非回滚,残留漂移由重建愈合。
      const apiKeyIndexService = require('./apiKeyIndexService')
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.byId(keyId)
      const multi = client.multi()
      multi.hset(redisKey, updatedData)
      multi.expire(redisKey, 86400 * 365)
      multi.zadd(
        apiKeyIndexService.INDEX_KEYS.DELETED_AT,
        new Date(updatedData.deletedAt).getTime(),
        keyId
      )
      // 状态集合随 hash 在同一 MULTI 维护：移出 ACTIVE、移入 DELETED，避免"软删后仍出现在主列表"（残留漂移由重建愈合）
      multi.srem(apiKeyIndexService.INDEX_KEYS.ACTIVE_SET, keyId)
      multi.sadd(apiKeyIndexService.INDEX_KEYS.DELETED_SET, keyId)
      // 标签索引也随软删移除：标签语义是"未删除 key 的标签"（见 redis.js _extractTagsFromKeyIds 过滤 isDeleted），
      // 否则只挂在已删 key 上的死标签会长期留在 tags:all 下拉里；恢复时再加回。
      const deletedTags = parseTagsSafe(keyData.tags)
      for (const tag of deletedTags) {
        if (tag && typeof tag === 'string') {
          multi.srem(RedisKeys.apiKey.tag(tag), keyId)
        }
      }
      if (keyData.apiKey) {
        // 旧结构 apikey_hash:* 与新结构 hash_map 都要删：findApiKeyByHash 在 hash_map miss 时会回退读旧结构并回填
        multi.del(RedisKeys.apiKey.hashLegacy(keyData.apiKey))
        multi.hdel(RedisKeys.apiKey.hashMap, keyData.apiKey)
      }
      await execMultiOrThrow(multi)

      // 标签集合若因移除变空，从 tags:all 下拉裁剪（best-effort，失败不影响删除）
      for (const tag of deletedTags) {
        if (!tag || typeof tag !== 'string') {
          continue
        }
        try {
          const remaining = await client.scard(RedisKeys.apiKey.tag(tag))
          if (remaining === 0) {
            await client.srem(apiKeyIndexService.INDEX_KEYS.TAGS_ALL, tag)
          }
        } catch (err) {
          logger.warn(`清理空标签 ${tag} 失败（不影响删除）:`, err)
        }
      }

      // 从费用排序索引中移除（尽力维护，失败不影响回收站正确性）
      try {
        const costRankService = require('./costRankService')
        await costRankService.removeKeyFromIndexes(keyId)
      } catch (err) {
        logger.warn(`Failed to remove key ${keyId} from cost rank indexes:`, err)
      }

      // 注：ACTIVE/DELETED 状态集合已在上面同一 MULTI 维护；删除不改名称/标签，无需再调 updateIndex

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

      // 写回 hash + 删除删除标记字段 + 从 deletedAt 有序索引移除，并入同一 MULTI。
      // 目的:让已恢复的 key 不再残留在回收站索引里被当成可恢复项展示（MULTI 非回滚,残留漂移由重建愈合）。
      const apiKeyIndexService = require('./apiKeyIndexService')
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.byId(keyId)
      const multi = client.multi()
      multi.hset(redisKey, updatedData)
      multi.hdel(redisKey, 'isDeleted', 'deletedAt', 'deletedBy', 'deletedByType')
      multi.expire(redisKey, 86400 * 365)
      multi.zrem(apiKeyIndexService.INDEX_KEYS.DELETED_AT, keyId)
      // 状态集合随 hash 在同一 MULTI 维护：移入 ACTIVE、移出 DELETED，避免"恢复后仍从主列表消失"的假阴性（残留漂移由重建愈合）
      multi.sadd(apiKeyIndexService.INDEX_KEYS.ACTIVE_SET, keyId)
      multi.srem(apiKeyIndexService.INDEX_KEYS.DELETED_SET, keyId)
      // 标签索引随恢复加回（软删时已移除），恢复后该 key 重新计入主列表标签下拉
      const restoredTags = parseTagsSafe(keyData.tags)
      for (const tag of restoredTags) {
        if (tag && typeof tag === 'string') {
          multi.sadd(RedisKeys.apiKey.tag(tag), keyId)
          multi.sadd(apiKeyIndexService.INDEX_KEYS.TAGS_ALL, tag)
        }
      }
      // 认证结构（旧 apikey_hash:* + 新 hash_map）也并入同一事务，
      // 否则恢复状态已提交、但 setApiKeyHash 失败时会半成功：Key 显示已恢复却仍不可认证 / 只重建了一半
      if (keyData.apiKey) {
        multi.hset(RedisKeys.apiKey.hashLegacy(keyData.apiKey), {
          id: keyId,
          name: keyData.name,
          isActive: 'true'
        })
        multi.hset(RedisKeys.apiKey.hashMap, keyData.apiKey, keyId)
      }
      await execMultiOrThrow(multi)

      // 重新添加到费用排序索引
      try {
        const costRankService = require('./costRankService')
        await costRankService.addKeyToIndexes(keyId)
      } catch (err) {
        logger.warn(`Failed to add restored key ${keyId} to cost rank indexes:`, err)
      }

      // 注：ACTIVE/DELETED 状态集合已在上面同一 MULTI 维护；恢复不改名称/标签，无需再调 updateIndex

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

      // 删除该 Key 的所有使用/费用统计键。真实键有三种形态，必须都覆盖，否则残留孤儿会留下死数据
      // （其中模型用量键还会让启动对账反复全量重算）：
      //   1) keyId 在前：usage:${keyId}:model:daily|monthly|hourly|alltime:*
      //   2) keyId 在后：usage:daily|monthly|hourly:${keyId}:*、usage:cost:*:${keyId}、usage:opus:weekly:${keyId}:*
      //   3) 精确键：usage:${keyId}（总用量 hash，无 TTL，两个模式都匹配不到，必须单独删）
      // （原先的 usage:daily:${date}:${keyId} 顺序写反，删不到任何键，已移除）
      const usageKeys = [
        RedisKeys.usage.total(keyId),
        ...(await redis.scanKeys(`usage:${keyId}:*`)),
        ...(await redis.scanKeys(`usage:*:${keyId}*`))
      ]
      if (usageKeys.length > 0) {
        await redis.batchDelChunked([...new Set(usageKeys)])
      }

      // 清理"键名不含 keyId、成员含 keyId"的索引集合（上面三种删除模式都碰不到）：
      //   usage:daily:index、usage:hourly:index 成员=keyId
      //   usage:keymodel:daily:index、usage:keymodel:hourly:index 成员=${keyId}:${model}
      // 不清理则已删 keyId 残留到 TTL 到期，统计/后台读取会对它构造空查询。
      // 直接按 TTL 窗口枚举索引键（日 32 天/小时 7 天，留 buffer），避免全 keyspace 扫描（批量删时会雪崩）。
      // 提取该 Key 用过的模型名（用于删 usage:keymodel:*:index 里的 ${keyId}:${model} 成员）：
      // - 模型名可能含冒号（_normalizeModelName 只剥离 -vN:M / :latest 尾缀，其余冒号保留），
      //   用 (.+) 取完整名避免截断；非 alltime 键尾部带日期/小时，剥掉它得到模型名
      // - alltime 可能缺失（见 redis.js 的 fallback：旧数据未迁移），故 4 种周期都提取取并集，
      //   既兜住带冒号模型，也兜住无 alltime 的历史数据
      const usedModels = new Set()
      for (const k of usageKeys) {
        const m = k.match(/^usage:[^:]+:model:(daily|monthly|hourly|alltime):(.+)$/)
        if (!m) {
          continue
        }
        let model = m[2]
        if (m[1] !== 'alltime') {
          model = model.replace(/:\d{4}-\d{2}(?:-\d{2})?(?::\d{2})?$/, '')
        }
        usedModels.add(model)
      }
      const dayMs = 86400000
      const nowTs = Date.now()
      const idxPipeline = redis.client.pipeline()
      for (let i = 0; i <= 33; i++) {
        const date = redis.getDateStringInTimezone(new Date(nowTs - i * dayMs))
        idxPipeline.srem(RedisKeys.usage.dailyIndex(date), keyId)
        for (const model of usedModels) {
          idxPipeline.srem(RedisKeys.usage.keymodelDailyIndex(date), `${keyId}:${model}`)
        }
      }
      for (let i = 0; i <= 8; i++) {
        const date = redis.getDateStringInTimezone(new Date(nowTs - i * dayMs))
        for (let h = 0; h < 24; h++) {
          const hour = `${date}:${String(h).padStart(2, '0')}`
          idxPipeline.srem(RedisKeys.usage.hourlyIndex(hour), keyId)
          for (const model of usedModels) {
            idxPipeline.srem(RedisKeys.usage.keymodelHourlyIndex(hour), `${keyId}:${model}`)
          }
        }
      }
      await idxPipeline.exec()

      // 删 hash + 从 hash_map 移除 + 从 deletedAt 有序索引移除，并入同一 MULTI。
      // 目的:不让已彻底删除的 key 以僵尸索引项让回收站总数/页数虚高、末页出现空页（MULTI 非回滚,残留漂移由重建愈合）。
      const apiKeyIndexService = require('./apiKeyIndexService')
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.byId(keyId)
      const multi = client.multi()
      if (keyData.apiKey) {
        // 同删旧结构 apikey_hash:*，避免 findApiKeyByHash 回退命中后回填出已删 Key 的映射、并留下孤儿键
        multi.del(RedisKeys.apiKey.hashLegacy(keyData.apiKey))
        multi.hdel(RedisKeys.apiKey.hashMap, keyData.apiKey)
      }
      multi.del(redisKey)
      multi.zrem(apiKeyIndexService.INDEX_KEYS.DELETED_AT, keyId)
      // 主列表依赖的核心索引随删除原子移除，杜绝"彻底删除后主列表留空槽 / 总数虚高"
      const nameMember = `${(keyData.name || '').toLowerCase()}\x00${keyId}`
      multi.srem(apiKeyIndexService.INDEX_KEYS.ALL_SET, keyId)
      multi.srem(apiKeyIndexService.INDEX_KEYS.ACTIVE_SET, keyId)
      multi.srem(apiKeyIndexService.INDEX_KEYS.DELETED_SET, keyId)
      multi.zrem(apiKeyIndexService.INDEX_KEYS.CREATED_AT, keyId)
      multi.zrem(apiKeyIndexService.INDEX_KEYS.LAST_USED_AT, keyId)
      multi.zrem(apiKeyIndexService.INDEX_KEYS.NAME, nameMember)
      await execMultiOrThrow(multi)

      // 清理其余 API Key 索引（名称/创建时间/集合/标签等；deletedAt 已在上面原子处理）
      try {
        await apiKeyIndexService.removeFromIndex(keyId, {
          name: keyData.name,
          tags: parseTagsSafe(keyData.tags)
        })
      } catch (err) {
        logger.warn(`Failed to remove key ${keyId} from API Key index:`, err)
      }

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
    // 计费要素提升到 try 外：catch 中完整记录（含 costRecorded 区分计费是否已落，供对账补账）
    let realCost = 0
    let ratedCost = 0
    let costRecorded = false
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
      realCost = costInfo.costs.total
      ratedCost = realCost
      if (realCost > 0) {
        const service = serviceRatesService.getService(accountType, model)
        ratedCost = await this.calculateRatedCost(keyId, service, realCost)
      }

      // 💳 预付费余额为派生（净充值 − usage:cost:total 基线后增量），消费由计费落账反映，不再实时扣减。
      // 计费关键写先于一切统计写：incrementDailyCost 内部幂等+重试落 usage:cost:total，
      // 统计写失败不再连带计费丢失（见 payment/balanceLedger 与 redis.incrementDailyCost）
      if (realCost > 0) {
        await redis.incrementDailyCost(keyId, ratedCost, realCost)
        costRecorded = true
        logger.database(
          `💰 Recorded cost for ${keyId}: rated=$${ratedCost.toFixed(6)}, real=$${realCost.toFixed(6)}, model: ${model}`
        )
      } else {
        logger.debug(`💰 No cost recorded for ${keyId} - zero cost for model: ${model}`)
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

      // 记录 Opus 周费用（如果适用）
      if (realCost > 0) {
        await this.recordOpusCost(keyId, ratedCost, realCost, model, accountType)
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间：hash + LAST_USED_AT 排序索引并入同一 MULTI 更新（见 setApiKeyWithLastUsedIndex），
        // best-effort 包裹——失败不影响用量记录；正常运行下 hash 与排序索引一起提交、不会长期错序（MULTI 非回滚）
        keyData.lastUsedAt = new Date().toISOString()
        try {
          await redis.setApiKeyWithLastUsedIndex(keyId, keyData)
        } catch (err) {
          logger.warn(`更新 lastUsedAt 失败（不影响用量记录）: ${keyId}`, err)
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
      // 计费关键写已在 incrementDailyCost 内幂等化+重试；至此失败二分：
      //   costRecorded=false → 重试耗尽，该笔未计入 usage:cost:total，需按本日志金额补账
      //   costRecorded=true  → 计费已落、仅后续统计/记录失败，勿重复补账
      logger.error(
        `❌ Failed to record usage (billing-critical): key=${keyId} model=${model} realCost=${realCost} ratedCost=${ratedCost} costRecorded=${costRecorded}`,
        error
      )
      // 计费已落时如实返回成本（调用方据此更新限流计数），未落才返回 0
      return costRecorded ? { realCost, ratedCost } : { realCost: 0, ratedCost: 0 }
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
    // 计费要素提升到 try 外：catch 中完整记录（同 recordUsage）
    let realCostWithDetails = 0
    let ratedCostWithDetails = 0
    let costRecordedWithDetails = false
    try {
      const finalizedRequestMeta = finalizeRequestDetailMeta(requestMeta)
      // 提取 token 数量
      const inputTokens = usageObject.input_tokens || 0
      const outputTokens = usageObject.output_tokens || 0
      const cacheCreateTokens = usageObject.cache_creation_input_tokens || 0
      const cacheReadTokens = usageObject.cache_read_input_tokens || 0

      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      // 计算费用统一走 CostCalculator，缺少动态价格时使用内置 unknown fallback。
      let costInfo = {
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        cacheCreateCost: 0,
        cacheReadCost: 0,
        ephemeral5mCost: 0,
        ephemeral1hCost: 0,
        isLongContextRequest: false,
        usedFallbackPricing: false,
        pricingSource: null
      }
      try {
        const CostCalculator = require('../utils/costCalculator')
        const calculatedCost = CostCalculator.calculateCost(usageObject, model)
        const costs = calculatedCost?.costs || {}
        const totalCost = Number(costs.total ?? calculatedCost?.totalCost ?? 0)

        if (!Number.isFinite(totalCost)) {
          throw new Error(`Invalid cost calculation result for model ${model}`)
        }

        costInfo = {
          totalCost,
          inputCost: Number(costs.input ?? calculatedCost?.inputCost ?? 0) || 0,
          outputCost: Number(costs.output ?? calculatedCost?.outputCost ?? 0) || 0,
          cacheCreateCost:
            Number(costs.cacheCreate ?? costs.cacheWrite ?? calculatedCost?.cacheCreateCost ?? 0) ||
            0,
          cacheReadCost: Number(costs.cacheRead ?? calculatedCost?.cacheReadCost ?? 0) || 0,
          ephemeral5mCost: Number(costs.ephemeral5m ?? calculatedCost?.ephemeral5mCost ?? 0) || 0,
          ephemeral1hCost: Number(costs.ephemeral1h ?? calculatedCost?.ephemeral1hCost ?? 0) || 0,
          isLongContextRequest:
            calculatedCost?.isLongContextRequest === true ||
            calculatedCost?.debug?.isLongContextRequest === true,
          usedFallbackPricing: calculatedCost?.debug?.usedFallbackPricing === true,
          pricingSource:
            calculatedCost?.debug?.pricingSource ||
            (calculatedCost?.usingDynamicPricing ? 'dynamic' : 'unknown-fallback')
        }
      } catch (pricingError) {
        logger.error(`❌ Failed to calculate cost for model ${model}:`, pricingError)
        logger.error(`   Usage object:`, JSON.stringify(usageObject))
      }

      // 提取详细的缓存创建数据
      let ephemeral5mTokens = 0
      let ephemeral1hTokens = 0

      if (usageObject.cache_creation && typeof usageObject.cache_creation === 'object') {
        ephemeral5mTokens = usageObject.cache_creation.ephemeral_5m_input_tokens || 0
        ephemeral1hTokens = usageObject.cache_creation.ephemeral_1h_input_tokens || 0
      }

      // 计算费用（应用服务倍率）- 需要在 incrementTokenUsage 之前计算
      realCostWithDetails = costInfo.totalCost || 0
      ratedCostWithDetails = realCostWithDetails
      if (realCostWithDetails > 0) {
        const service = serviceRatesService.getService(accountType, model)
        ratedCostWithDetails = await this.calculateRatedCost(keyId, service, realCostWithDetails)
      }

      // 💳 计费关键写先于一切统计写（幂等+重试，见 redis.incrementDailyCost）；落账失败由 catch 记含金额 ERROR
      if (realCostWithDetails > 0) {
        // 记录倍率成本和真实成本
        await redis.incrementDailyCost(keyId, ratedCostWithDetails, realCostWithDetails)
        costRecordedWithDetails = true
        logger.database(
          `💰 Recorded cost for ${keyId}: rated=$${ratedCostWithDetails.toFixed(6)}, real=$${realCostWithDetails.toFixed(6)}, model: ${model}`
        )
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

      if (realCostWithDetails > 0) {
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
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间：hash + LAST_USED_AT 排序索引并入同一 MULTI 更新（见 setApiKeyWithLastUsedIndex），
        // best-effort 包裹——失败不影响用量记录；正常运行下 hash 与排序索引一起提交、不会长期错序（MULTI 非回滚）
        keyData.lastUsedAt = new Date().toISOString()
        try {
          await redis.setApiKeyWithLastUsedIndex(keyId, keyData)
        } catch (err) {
          logger.warn(`更新 lastUsedAt 失败（不影响用量记录）: ${keyId}`, err)
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
        costBreakdown: {
          input: costInfo.inputCost || 0,
          output: costInfo.outputCost || 0,
          cacheCreate: costInfo.cacheCreateCost || 0,
          cacheRead: costInfo.cacheReadCost || 0,
          ephemeral5m: costInfo.ephemeral5mCost || 0,
          ephemeral1h: costInfo.ephemeral1hCost || 0,
          total: realCostWithDetails
        },
        realCostBreakdown: {
          input: costInfo.inputCost || 0,
          output: costInfo.outputCost || 0,
          cacheCreate: costInfo.cacheCreateCost || 0,
          cacheRead: costInfo.cacheReadCost || 0,
          ephemeral5m: costInfo.ephemeral5mCost || 0,
          ephemeral1h: costInfo.ephemeral1hCost || 0,
          total: realCostWithDetails
        },
        pricingSource: costInfo.pricingSource || null,
        usedFallbackPricing: costInfo.usedFallbackPricing === true,
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
      // 同 recordUsage：costRecorded=false 需按本日志金额补账；=true 计费已落勿重复补账
      logger.error(
        `❌ Failed to record usage (billing-critical): key=${keyId} model=${model} realCost=${realCostWithDetails} ratedCost=${ratedCostWithDetails} costRecorded=${costRecordedWithDetails}`,
        error
      )
      // 计费已落时如实返回成本（调用方据此更新限流计数），未落才返回 0
      return costRecordedWithDetails
        ? { realCost: realCostWithDetails, ratedCost: ratedCostWithDetails }
        : { realCost: 0, ratedCost: 0 }
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
      pricingSource: usageRecord.pricingSource || null,
      usedFallbackPricing: usageRecord.usedFallbackPricing === true,
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
          grokAccountId: key.grokAccountId || '',
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
        grokAccountId: keyData.grokAccountId || '',
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

      const oldHashedKey = existingKey.apiKey
      const updatedKeyData = {
        ...existingKey,
        apiKey: newHashedKey,
        updatedAt: new Date().toISOString()
      }

      // 删旧认证映射（旧结构 apikey_hash:* + 新结构 hash_map）+ 写新数据 + 建新映射，并入同一 MULTI。
      // 取代旧的两段式"先删旧映射、再写新数据"(中途失败会半成功:旧 key 已失效、新 key 未完整落库)。MULTI 非回滚,但同一 MULTI 已消除两段式之间的窗口。
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.byId(keyId)
      const multi = client.multi()
      if (oldHashedKey) {
        multi.del(RedisKeys.apiKey.hashLegacy(oldHashedKey))
        multi.hdel(RedisKeys.apiKey.hashMap, oldHashedKey)
      }
      // 新结构 hash_map + 旧结构 apikey_hash:*（与 setApiKeyHash/restore 一致，保证 hash_map 回退路径下也能认证）
      multi.hset(RedisKeys.apiKey.hashMap, newHashedKey, keyId)
      multi.hset(RedisKeys.apiKey.hashLegacy(newHashedKey), {
        id: keyId,
        name: existingKey.name,
        isActive: existingKey.isActive
      })
      multi.hset(redisKey, updatedKeyData)
      multi.expire(redisKey, 86400 * 365)
      await execMultiOrThrow(multi)

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
  // 复用 permanentDeleteApiKey 的完整原子清理（主列表索引 / deletedAt / usage / cost / 索引成员 / 认证映射），
  // 避免旧实现"只删 hash+认证映射"留下的主列表索引漂移与统计死数据。
  // permanentDeleteApiKey 要求先处于软删除态：未软删则先软删，保持本方法"强制删除"的语义。
  async hardDeleteApiKey(keyId) {
    const keyData = await redis.getApiKey(keyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      throw new Error('API key not found')
    }

    if (keyData.isDeleted !== 'true') {
      await this.deleteApiKey(keyId, 'system', 'system')
    }
    await this.permanentDeleteApiKey(keyId)

    logger.info(`🗑️ Hard deleted API key: ${keyData.name} (${keyId})`)
    return true
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
        grok: 'grokAccountId',
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

  // key 可用性状态校验（删除/禁用/过期/所属用户停用），供 validateApiKeyForStats（签发）与
  // validateKeyActiveById（支付 token 每请求复核）共用，确保两条路径判据永远一致、不漂移。
  // 入参 keyData 须已存在（非空）。返回 { valid:true } 或 { valid:false, error, keyName? }。
  async _validateKeyUsableStatus(keyData) {
    if (keyData.isDeleted === 'true' || keyData.isDeleted === true) {
      return { valid: false, error: 'API key not found' }
    }
    if (keyData.isActive !== 'true') {
      const keyName = keyData.name || 'Unknown'
      return { valid: false, error: `API Key "${keyName}" 已被禁用`, keyName }
    }
    if (
      keyData.isActivated === 'true' &&
      keyData.expiresAt &&
      new Date() > new Date(keyData.expiresAt)
    ) {
      const keyName = keyData.name || 'Unknown'
      return { valid: false, error: `API Key "${keyName}" 已过期`, keyName }
    }
    if (keyData.userId) {
      try {
        const userService = require('./userService')
        const user = await userService.getUserById(keyData.userId, false)
        if (!user || !user.isActive) {
          return { valid: false, error: 'User account is disabled' }
        }
      } catch (userError) {
        logger.warn(`Failed to check user status for API key ${keyData.id}:`, userError)
      }
    }
    return { valid: true }
  }

  // 复核 key 当前是否仍可用（被删/禁用/过期、所属用户停用则失效）。供支付会话 token 每请求复核，
  // 规避「token 签发后 key 状态变更的授权滞后窗口」。判据与签发用的 validateApiKeyForStats 共用同一助手、不漂移。
  // 注：权限/客户端/模型限制管的是 API 代理、不 gate 支付（充值钱包），故不在此拦截；
  //     若要给支付加专属开关（如 paymentDisabled），只需在 _validateKeyUsableStatus 一处加。
  async validateKeyActiveById(keyId) {
    const keyData = await redis.getApiKey(keyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return { valid: false, error: 'API key not found' }
    }
    const status = await this._validateKeyUsableStatus(keyData)
    if (!status.valid) {
      return status
    }
    return { valid: true, keyData }
  }

  /**
   * 增加 API Key 费用限制（用于核销额度卡 / 快捷调整）
   * @param {string} keyId - API Key ID
   * @param {number} amount - 要增加的金额（USD）
   * @param {Object} [options]
   * @param {boolean} [options.recordHistory] - 是否记变更流水（快捷调整传 true；核销走自己的 redemption 记录）
   * @param {string} [options.operator]
   * @param {string} [options.operatorType]
   * @returns {Promise<Object>} { success: boolean, newTotalCostLimit: number }
   */
  async addTotalCostLimit(keyId, amount, options = {}) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }
      if (keyData.isDeleted === 'true') {
        throw new Error('Cannot update a deleted API key; restore it first')
      }

      const currentLimit = parseFloat(keyData.totalCostLimit || 0)
      const newLimit = currentLimit + amount

      await redis.client.hset(RedisKeys.apiKey.byId(keyId), 'totalCostLimit', String(newLimit))

      if (options.recordHistory) {
        await this.appendChangeHistory(keyId, {
          action: 'add_cost_limit',
          operator: options.operator || 'system',
          operatorType: options.operatorType || (options.operator ? 'admin' : 'system'),
          before: { totalCostLimit: currentLimit },
          after: { totalCostLimit: newLimit },
          delta: { amount }
        })
      }

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
      // 注意：deduct 是「回扣/减少额度」（如撤销核销 revokeRedemption），不会复活已删 key、不授予价值，
      // 因此对已删除 key 不设守卫——否则会打断「撤销已删 key 上的历史核销」这条合法管理路径。
      // 「往 key 增额度」的 revive/授予价值方向才需守卫，见 addTotalCostLimit。

      const currentLimit = parseFloat(keyData.totalCostLimit || 0)
      const costStats = await redis.getCostStats(keyId)
      const currentUsed = costStats?.total || 0

      // 不能扣到比已使用的还少
      const minLimit = currentUsed
      const actualDeducted = Math.min(amount, currentLimit - minLimit)
      const newLimit = Math.max(currentLimit - amount, minLimit)

      await redis.client.hset(RedisKeys.apiKey.byId(keyId), 'totalCostLimit', String(newLimit))

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
   * 延长 API Key 有效期（用于核销时间卡 / 快捷调整）
   * @param {string} keyId - API Key ID
   * @param {number} amount - 时间数量
   * @param {string} unit - 时间单位 'hours' | 'days' | 'months'
   * @param {Object} [options]
   * @param {boolean} [options.recordHistory] - 是否记变更流水（快捷调整传 true；核销走自己的 redemption 记录）
   * @param {boolean} [options.restoreActiveOnExtend] - 管理员延时语义：未来过期恢复 isActive；activation 未激活则立即激活。默认 false，避免核销等旁路误恢复
   * @param {string} [options.operator]
   * @param {string} [options.operatorType]
   * @returns {Promise<Object>} { success, previousExpiresAt, newExpiresAt, isActive?, isActivated?, activatedAt? }
   */
  async extendExpiry(keyId, amount, unit = 'days', options = {}) {
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

      const previousExpiresAt = keyData.expiresAt || ''
      const newExpiresAt = new Date(baseDate.getTime() + milliseconds).toISOString()
      const now = new Date()
      const updates = { expiresAt: newExpiresAt }
      const prevActive = keyData.isActive === 'true' || keyData.isActive === true
      const prevActivated = keyData.isActivated === 'true' || keyData.isActivated === true

      // [人工决策-2026-08-11 11:12:34] 管理员延时语义仅 opt-in（restoreActiveOnExtend），不进核销等旁路；快捷调整显式开启
      if (options.restoreActiveOnExtend) {
        // 延长到未来一律恢复 isActive=true，与续期 PUT 对齐；手动禁过后管理员延时视同意图启用
        if (new Date(newExpiresAt) > now) {
          updates.isActive = true
        }
        // activation 未激活号：管理员明确延时=立即激活，避免首次请求按 activationDays 覆盖 expiresAt
        if (keyData.expirationMode === 'activation' && !prevActivated) {
          updates.isActivated = true
          updates.activatedAt = now.toISOString()
        }
      }

      // 仅 opt-in 且实际从禁用→启用时记 enable 流水；核销默认不记
      const willChangeActive = updates.isActive === true && !prevActive
      await this.updateApiKey(keyId, updates, {
        ...options,
        recordIsActiveHistory: willChangeActive
      })

      if (options.recordHistory) {
        await this.appendChangeHistory(keyId, {
          action: 'extend_expiry',
          operator: options.operator || 'system',
          operatorType: options.operatorType || (options.operator ? 'admin' : 'system'),
          before: { expiresAt: previousExpiresAt || null },
          after: { expiresAt: newExpiresAt },
          delta: { amount, unit }
        })
      }

      logger.success(
        `⏰ Extended key ${keyId} expiry by ${amount} ${unit}, new expiry: ${newExpiresAt}`
      )

      const nextActive = updates.isActive !== undefined ? true : prevActive
      const nextActivated = updates.isActivated !== undefined ? true : prevActivated

      return {
        success: true,
        previousExpiresAt: keyData.expiresAt,
        newExpiresAt,
        isActive: nextActive,
        isActivated: nextActivated,
        activatedAt: updates.activatedAt || keyData.activatedAt || null
      }
    } catch (error) {
      logger.error('❌ Failed to extend expiry:', error)
      throw error
    }
  }

  // 追加 API Key 变更流水（有界 List + TTL；写失败只打日志，不抛）
  async appendChangeHistory(keyId, entry) {
    try {
      const client = redis.getClientSafe()
      const redisKey = RedisKeys.apiKey.changeHistory(keyId)
      const maxEntries = LIMITS.apiKeyChangeHistory
      const payload = JSON.stringify({
        id: uuidv4(),
        time: new Date().toISOString(),
        action: entry.action,
        operator: entry.operator || 'system',
        operatorType: entry.operatorType || 'system',
        before: entry.before || null,
        after: entry.after || null,
        delta: entry.delta || null
      })
      const pipeline = client.pipeline()
      pipeline.lpush(redisKey, payload)
      pipeline.ltrim(redisKey, 0, maxEntries - 1)
      pipeline.expire(redisKey, TTL.apiKeyChangeHistory)
      // pipeline 命令级错误落在 result[i][0]，不会自动 throw；不逐条检查会静默漏记
      const results = await pipeline.exec()
      if (!results) {
        throw new Error('Redis pipeline 未执行（EXEC 返回空）')
      }
      for (const [err] of results) {
        if (err) {
          throw err
        }
      }
    } catch (error) {
      console.error(error)
      logger.warn(`⚠️ Failed to append change history for ${keyId}: ${error.message}`)
    }
  }

  // 分页读 API Key 变更流水（最新在前）
  async getChangeHistory(keyId, { page = 1, pageSize = 20 } = {}) {
    const client = redis.getClientSafe()
    const redisKey = RedisKeys.apiKey.changeHistory(keyId)
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)))
    const start = (safePage - 1) * safePageSize
    const end = start + safePageSize - 1

    const [total, list] = await Promise.all([
      client.llen(redisKey),
      client.lrange(redisKey, start, end)
    ])

    const items = list
      .map((item) => {
        try {
          return JSON.parse(item)
        } catch {
          return null
        }
      })
      .filter((item) => item?.time)

    return {
      items,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / safePageSize)
      }
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
