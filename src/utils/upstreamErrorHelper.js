const logger = require('./logger')
const { normalizeTempUnavailablePolicyFromAccountData } = require('./tempUnavailablePolicy')

const TEMP_UNAVAILABLE_PREFIX = 'temp_unavailable'
const ERROR_HISTORY_PREFIX = 'error_history'
const ERROR_HISTORY_MAX = 5000
const ERROR_HISTORY_TTL = 3 * 24 * 60 * 60 // 3天
const ERROR_HISTORY_BODY_MAX = 2000
const ERROR_HISTORY_REDACTED = '[REDACTED]'

const ERROR_HISTORY_SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|x[-_a-z]*api[-_]?key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password)$/i

const sanitizeSensitiveText = (value) =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:key|api_key|api-key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, ERROR_HISTORY_REDACTED)
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, ERROR_HISTORY_REDACTED)

const sanitizeErrorHistoryValue = (value, depth = 0) => {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeSensitiveText(value)
  }

  if (Buffer.isBuffer(value)) {
    return sanitizeSensitiveText(value.toString('utf8'))
  }

  if (typeof value !== 'object') {
    return value
  }

  if (depth >= 6) {
    return '[MaxDepth]'
  }

  if (typeof value.pipe === 'function') {
    return '[Stream]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorHistoryValue(item, depth + 1))
  }

  const sanitized = {}
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = ERROR_HISTORY_SENSITIVE_KEY_PATTERN.test(key)
      ? ERROR_HISTORY_REDACTED
      : sanitizeErrorHistoryValue(item, depth + 1)
  }
  return sanitized
}

const serializeErrorHistoryBody = (errorBody) => {
  if (errorBody === null || errorBody === undefined) {
    return undefined
  }

  try {
    const sanitized = sanitizeErrorHistoryValue(errorBody)
    if (typeof sanitized === 'string') {
      return sanitized.slice(0, ERROR_HISTORY_BODY_MAX)
    }
    return JSON.stringify(sanitized).slice(0, ERROR_HISTORY_BODY_MAX)
  } catch (error) {
    return sanitizeSensitiveText(String(errorBody)).slice(0, ERROR_HISTORY_BODY_MAX)
  }
}

const sanitizeErrorHistoryContext = (context) => {
  if (!context || typeof context !== 'object') {
    return context || null
  }

  const sanitized = sanitizeErrorHistoryValue(context)
  if (Object.prototype.hasOwnProperty.call(context, 'errorBody')) {
    sanitized.errorBody = serializeErrorHistoryBody(context.errorBody)
  }
  return sanitized
}

const buildErrorHistoryContext = (baseContext = null, details = {}) => {
  const merged = {}

  if (baseContext && typeof baseContext === 'object') {
    Object.assign(merged, baseContext)
  }

  if (details && typeof details === 'object') {
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value
      }
    }
  }

  return Object.keys(merged).length ? merged : null
}

// 默认 TTL（秒）
const DEFAULT_TTL = {
  server_error: 300, // 5xx: 5分钟
  service_unavailable: 60, // 503: 1分钟（默认更短，避免短暂抖动导致长时间不可路由）
  overload: 600, // 529: 10分钟
  auth_error: 1800, // 401/403: 30分钟
  timeout: 300, // 504/网络超时: 5分钟
  rate_limit: 300, // 429: 5分钟（优先使用响应头解析值）
  client_error: 180 // 其他4xx客户端错误：3分钟
}

// 上游 retry-after 派生 TTL 的上限（秒）。
// temp-unavailable 只用于「短暂抖动」的冷却；而周级限额的 retry-after 可达数天，
// 直接采纳会把账号整整下线数天，且账号哈希看起来完全正常（该键是独立的 TTL 键），
// 极难排查。真正的长时限额应由 markAccountRateLimited / 各模型家族限流桶承担。
const DEFAULT_MAX_CUSTOM_TTL = 1800 // 30 分钟

// 延迟加载配置，避免循环依赖
let _configCache = null
const getConfig = () => {
  if (!_configCache) {
    try {
      _configCache = require('../../config/config')
    } catch {
      _configCache = {}
    }
  }
  return _configCache
}

const getTtlConfig = () => {
  const config = getConfig()
  const parseEnvPositiveInt = (name) => {
    const value = parseInt(process.env[name], 10)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  return {
    service_unavailable:
      config.upstreamError?.serviceUnavailableTtlSeconds ??
      parseEnvPositiveInt('UPSTREAM_ERROR_503_TTL_SECONDS') ??
      DEFAULT_TTL.service_unavailable,
    server_error: config.upstreamError?.serverErrorTtlSeconds ?? DEFAULT_TTL.server_error,
    overload: config.upstreamError?.overloadTtlSeconds ?? DEFAULT_TTL.overload,
    auth_error: config.upstreamError?.authErrorTtlSeconds ?? DEFAULT_TTL.auth_error,
    timeout: config.upstreamError?.timeoutTtlSeconds ?? DEFAULT_TTL.timeout,
    rate_limit: DEFAULT_TTL.rate_limit,
    client_error: DEFAULT_TTL.client_error,
    max_custom:
      config.upstreamError?.maxCustomTtlSeconds ??
      parseEnvPositiveInt('UPSTREAM_ERROR_MAX_CUSTOM_TTL_SECONDS') ??
      DEFAULT_MAX_CUSTOM_TTL
  }
}

// 延迟加载 redis，避免循环依赖
let _redis = null
const getRedis = () => {
  if (!_redis) {
    _redis = require('../models/redis')
  }
  return _redis
}

// 可读取账号级临时暂停配置的 Redis key 前缀映射
const ACCOUNT_KEY_PREFIX_BY_TYPE = {
  'claude-official': 'claude:account:',
  claude: 'claude:account:'
}

const EMPTY_TEMP_UNAVAILABLE_POLICY = {
  disableTempUnavailable: false,
  ttl503Seconds: null,
  ttl5xxSeconds: null
}

const ACCOUNT_TYPE_TO_GROUP_PLATFORM = {
  'claude-official': 'claude',
  claude: 'claude',
  'claude-console': 'claude',
  ccr: 'claude',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  openai: 'openai',
  'openai-responses': 'openai',
  droid: 'droid'
}

const GROUP_ACCOUNT_TYPES_BY_PLATFORM = {
  claude: ['claude-official', 'claude-console', 'ccr'],
  gemini: ['gemini', 'gemini-api'],
  openai: ['openai', 'openai-responses'],
  droid: ['droid']
}

const isTruthy = (value) => value === true || value === 'true'
const isSchedulableValue = (value) => value !== false && value !== 'false'

const parseGroupIds = (value) => {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return []
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []
      } catch {
        return []
      }
    }
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const parseGroupInfoIds = (value) => {
  if (!value) {
    return []
  }

  let items = value
  if (typeof value === 'string') {
    try {
      items = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item) => {
      if (!item) {
        return null
      }
      if (typeof item === 'string') {
        return item
      }
      return item.id || item.groupId || null
    })
    .filter(Boolean)
    .map(String)
}

const normalizeBinding = (value) => (typeof value === 'string' ? value.trim() : '')

const bindingToGroupId = (binding) => {
  const normalized = normalizeBinding(binding)
  return normalized.startsWith('group:') ? normalized.slice('group:'.length) : null
}

const directBindingMatches = (binding, accountId, prefix = '') => {
  const normalized = normalizeBinding(binding)
  if (!normalized || normalized.startsWith('group:')) {
    return false
  }
  const normalizedAccountId = String(accountId)
  return normalized === `${prefix}${normalizedAccountId}` || normalized === normalizedAccountId
}

const buildSchedulingContext = (apiKeyData, accountId, accountType) => {
  if (!apiKeyData || !accountId || !accountType) {
    return null
  }

  const direct = () => ({
    schedulingMode: 'dedicated',
    reason: 'api_key_dedicated_binding'
  })
  const group = (groupId) =>
    groupId
      ? {
          schedulingMode: 'group',
          groupId,
          reason: 'api_key_group_binding'
        }
      : null

  switch (accountType) {
    case 'claude-official': {
      const groupId = bindingToGroupId(apiKeyData.claudeAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.claudeAccountId, accountId) ? direct() : null
    }
    case 'claude-console': {
      if (directBindingMatches(apiKeyData.claudeConsoleAccountId, accountId)) {
        return direct()
      }
      return group(bindingToGroupId(apiKeyData.claudeAccountId))
    }
    case 'bedrock':
      return directBindingMatches(apiKeyData.bedrockAccountId, accountId) ? direct() : null
    case 'gemini': {
      const groupId = bindingToGroupId(apiKeyData.geminiAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.geminiAccountId, accountId) ? direct() : null
    }
    case 'gemini-api': {
      const groupId = bindingToGroupId(apiKeyData.geminiAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.geminiAccountId, accountId, 'api:') ? direct() : null
    }
    case 'openai': {
      const groupId = bindingToGroupId(apiKeyData.openaiAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.openaiAccountId, accountId) ? direct() : null
    }
    case 'openai-responses': {
      const groupId = bindingToGroupId(apiKeyData.openaiAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.openaiAccountId, accountId, 'responses:')
        ? direct()
        : null
    }
    case 'droid': {
      const groupId = bindingToGroupId(apiKeyData.droidAccountId)
      if (groupId) {
        return group(groupId)
      }
      return directBindingMatches(apiKeyData.droidAccountId, accountId) ? direct() : null
    }
    case 'azure-openai':
      return directBindingMatches(apiKeyData.azureOpenaiAccountId, accountId) ? direct() : null
    default:
      return null
  }
}

const normalizeServiceAccountResult = (result) => {
  if (!result) {
    return null
  }
  if (result.success === true && result.data) {
    return result.data
  }
  return result
}

const loadAccountForPauseDecision = async (accountId, accountType) => {
  try {
    switch (accountType) {
      case 'claude':
      case 'claude-official': {
        const redis = getRedis()
        if (typeof redis.getClaudeAccount === 'function') {
          return await redis.getClaudeAccount(accountId)
        }
        const client = redis.getClientSafe()
        return await client.hgetall(`claude:account:${accountId}`)
      }
      case 'claude-console':
        return await require('../services/account/claudeConsoleAccountService').getAccount(
          accountId
        )
      case 'ccr':
        return await require('../services/account/ccrAccountService').getAccount(accountId)
      case 'gemini':
        return await require('../services/account/geminiAccountService').getAccount(accountId)
      case 'gemini-api':
        return await require('../services/account/geminiApiAccountService').getAccount(accountId)
      case 'openai':
        return await require('../services/account/openaiAccountService').getAccount(accountId)
      case 'openai-responses':
        return await require('../services/account/openaiResponsesAccountService').getAccount(
          accountId
        )
      case 'bedrock':
        return normalizeServiceAccountResult(
          await require('../services/account/bedrockAccountService').getAccount(accountId)
        )
      case 'droid':
        return await require('../services/account/droidAccountService').getAccount(accountId)
      case 'azure-openai':
        return await require('../services/account/azureOpenaiAccountService').getAccount(accountId)
      default:
        return null
    }
  } catch (error) {
    logger.debug(
      `⚠️ [UpstreamError] Failed to load account for pause decision ${accountType}:${accountId}: ${error.message}`
    )
    return null
  }
}

const isEnabledForGroupPauseDecision = (account, accountType) => {
  if (!account || !isTruthy(account.isActive) || !isSchedulableValue(account.schedulable)) {
    return false
  }

  const status = String(account.status || 'active').toLowerCase()
  if (accountType === 'claude-official' || accountType === 'claude') {
    return !['error', 'blocked', 'temp_error'].includes(status)
  }
  if (accountType === 'claude-console' || accountType === 'ccr') {
    return status === 'active'
  }

  return ![
    'error',
    'unauthorized',
    'blocked',
    'temp_error',
    'account_blocked',
    'quota_exceeded',
    'rate_limited',
    'ratelimited'
  ].includes(status)
}

const loadGroupMemberAccount = async (memberId, platform, preferredAccountType) => {
  const accountTypes = GROUP_ACCOUNT_TYPES_BY_PLATFORM[platform] || []
  const orderedTypes =
    preferredAccountType && accountTypes.includes(preferredAccountType)
      ? [preferredAccountType, ...accountTypes.filter((type) => type !== preferredAccountType)]
      : accountTypes

  for (const accountType of orderedTypes) {
    const account = await loadAccountForPauseDecision(memberId, accountType)
    if (account) {
      return { account, accountType }
    }
  }
  return { account: null, accountType: preferredAccountType }
}

const getEnabledGroupMemberCount = async (groupId, preferredAccountType) => {
  if (!groupId) {
    return null
  }

  try {
    const accountGroupService = require('../services/accountGroupService')
    const group = await accountGroupService.getGroup(groupId)
    const platform = group?.platform || ACCOUNT_TYPE_TO_GROUP_PLATFORM[preferredAccountType]
    if (!platform) {
      return null
    }

    const memberIds = await accountGroupService.getGroupMembers(groupId)
    let enabledCount = 0
    for (const memberId of memberIds) {
      const { account, accountType } = await loadGroupMemberAccount(
        memberId,
        platform,
        preferredAccountType
      )
      if (isEnabledForGroupPauseDecision(account, accountType)) {
        enabledCount += 1
      }
    }
    return enabledCount
  } catch (error) {
    logger.warn(
      `⚠️ [UpstreamError] Failed to count enabled accounts in group ${groupId}: ${error.message}`
    )
    return null
  }
}

const shouldSkipTempUnavailableForScheduling = async (accountId, accountType, context = null) => {
  const schedulingMode =
    context?.schedulingMode || context?.selectionMode || context?.routingMode || null

  if (schedulingMode === 'dedicated') {
    return { skip: true, reason: 'dedicated_scheduling' }
  }

  if (schedulingMode === 'group' && context?.groupId) {
    const explicitCount = Number(context.enabledAccountCount ?? context.groupEnabledAccountCount)
    const enabledCount = Number.isFinite(explicitCount)
      ? explicitCount
      : await getEnabledGroupMemberCount(context.groupId, accountType)
    if (enabledCount !== null && enabledCount <= 1) {
      return { skip: true, reason: 'single_enabled_group_account' }
    }
    return { skip: false }
  }

  const account = await loadAccountForPauseDecision(accountId, accountType)
  if (account?.accountType === 'dedicated') {
    return { skip: true, reason: 'dedicated_account' }
  }

  if (account?.accountType === 'group') {
    const groupIds = [
      account.groupId,
      ...parseGroupIds(account.groupIds),
      ...parseGroupInfoIds(account.groupInfos)
    ]
      .filter(Boolean)
      .map(String)
    const uniqueGroupIds = [...new Set(groupIds)]

    for (const groupId of uniqueGroupIds) {
      const enabledCount = await getEnabledGroupMemberCount(groupId, accountType)
      if (enabledCount !== null && enabledCount <= 1) {
        return { skip: true, reason: 'single_enabled_group_account' }
      }
    }
  }

  return { skip: false }
}

const getAccountTempUnavailablePolicy = async (accountId, accountType) => {
  try {
    const accountPrefix = ACCOUNT_KEY_PREFIX_BY_TYPE[accountType]
    if (!accountPrefix) {
      return EMPTY_TEMP_UNAVAILABLE_POLICY
    }

    const redis = getRedis()
    const client = redis.getClientSafe()
    const accountData = await client.hgetall(`${accountPrefix}${accountId}`)
    if (!accountData || Object.keys(accountData).length === 0) {
      return EMPTY_TEMP_UNAVAILABLE_POLICY
    }

    return normalizeTempUnavailablePolicyFromAccountData(accountData)
  } catch (error) {
    logger.warn(
      `⚠️ [UpstreamError] Failed to load account temp-unavailable policy for ${accountType}:${accountId}: ${error.message}`
    )
    return EMPTY_TEMP_UNAVAILABLE_POLICY
  }
}

const resolveAccountTtlOverride = ({ policy, statusCode, errorType }) => {
  if (!policy) {
    return { skip: false, ttlOverrideSeconds: null, reason: '' }
  }

  if (policy.disableTempUnavailable) {
    return {
      skip: true,
      ttlOverrideSeconds: null,
      reason: 'account_temp_unavailable_disabled'
    }
  }

  if (statusCode === 503 && policy.ttl503Seconds !== null) {
    if (policy.ttl503Seconds <= 0) {
      return {
        skip: true,
        ttlOverrideSeconds: null,
        reason: 'account_503_ttl_disabled'
      }
    }
    return {
      skip: false,
      ttlOverrideSeconds: policy.ttl503Seconds,
      reason: 'account_503_ttl_override'
    }
  }

  if (errorType === 'server_error' && policy.ttl5xxSeconds !== null) {
    if (policy.ttl5xxSeconds <= 0) {
      return {
        skip: true,
        ttlOverrideSeconds: null,
        reason: 'account_5xx_ttl_disabled'
      }
    }
    return {
      skip: false,
      ttlOverrideSeconds: policy.ttl5xxSeconds,
      reason: 'account_5xx_ttl_override'
    }
  }

  return { skip: false, ttlOverrideSeconds: null, reason: '' }
}

// 根据 HTTP 状态码分类错误类型
const classifyError = (statusCode) => {
  if (statusCode === 529) {
    return 'overload'
  }
  if (statusCode === 503) {
    return 'service_unavailable'
  }
  if (statusCode === 504) {
    return 'timeout'
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'auth_error'
  }
  if (statusCode === 429) {
    return 'rate_limit'
  }
  if (statusCode >= 500) {
    return 'server_error'
  }
  return null
}

// 解析 429 响应头中的重置时间（返回秒数）
const parseRetryAfter = (headers) => {
  if (!headers) {
    return null
  }

  // 标准 Retry-After 头（秒数或 HTTP 日期）
  const retryAfter = headers['retry-after']
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (!isNaN(seconds) && seconds > 0) {
      return seconds
    }
    const date = new Date(retryAfter)
    if (!isNaN(date.getTime())) {
      const diff = Math.ceil((date.getTime() - Date.now()) / 1000)
      if (diff > 0) {
        return diff
      }
    }
  }

  // Anthropic 限流重置头（ISO 时间）
  const anthropicReset = headers['anthropic-ratelimit-unified-reset']
  if (anthropicReset) {
    const date = new Date(anthropicReset)
    if (!isNaN(date.getTime())) {
      const diff = Math.ceil((date.getTime() - Date.now()) / 1000)
      if (diff > 0) {
        return diff
      }
    }
  }

  // OpenAI/Codex 限流重置头
  const xReset = headers['x-ratelimit-reset-requests'] || headers['x-codex-ratelimit-reset']
  if (xReset) {
    const seconds = parseInt(xReset, 10)
    if (!isNaN(seconds) && seconds > 0) {
      return seconds
    }
  }

  return null
}

// 记录错误历史到 Redis List
const recordErrorHistory = async (
  accountId,
  accountType,
  statusCode,
  errorType,
  context = null
) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const redisKey = `${ERROR_HISTORY_PREFIX}:${accountType}:${accountId}`
    const safeContext = sanitizeErrorHistoryContext(context)

    const entry = JSON.stringify({
      time: new Date().toISOString(),
      status: statusCode,
      errorType,
      context: safeContext
    })

    const pipeline = client.pipeline()
    pipeline.lpush(redisKey, entry)
    pipeline.ltrim(redisKey, 0, ERROR_HISTORY_MAX - 1)
    pipeline.expire(redisKey, ERROR_HISTORY_TTL)
    await pipeline.exec()
  } catch (err) {
    logger.warn(`⚠️ [ErrorHistory] Failed to record error history for ${accountId}: ${err.message}`)
  }
}

// 查询错误历史（分页）
const getErrorHistory = async (accountType, accountId, offset = 0, limit = 50) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const o = Math.max(0, Math.floor(offset))
    const l = Math.min(500, Math.max(1, Math.floor(limit)))
    const redisKey = `${ERROR_HISTORY_PREFIX}:${accountType}:${accountId}`
    const list = await client.lrange(redisKey, o, o + l - 1)
    return list
      .map((item) => {
        try {
          return JSON.parse(item)
        } catch {
          return null
        }
      })
      .filter((item) => item?.time)
  } catch (error) {
    logger.error(`❌ [ErrorHistory] Failed to get error history for ${accountId}:`, error)
    return []
  }
}

// 清除错误历史
const clearErrorHistory = async (accountType, accountId) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const redisKey = `${ERROR_HISTORY_PREFIX}:${accountType}:${accountId}`
    await client.del(redisKey)
  } catch (error) {
    logger.error(`❌ [ErrorHistory] Failed to clear error history for ${accountId}:`, error)
  }
}

// 标记账户为临时不可用
const markTempUnavailable = async (
  accountId,
  accountType,
  statusCode,
  customTtl = null,
  context = null
) => {
  try {
    const errorTypeOverride =
      context &&
      typeof context === 'object' &&
      typeof context.errorTypeOverride === 'string' &&
      context.errorTypeOverride.trim()
        ? context.errorTypeOverride.trim()
        : null
    const errorType = errorTypeOverride || classifyError(statusCode)
    if (!errorType) {
      return { success: false, reason: 'not_a_pausable_error' }
    }

    const key = `${TEMP_UNAVAILABLE_PREFIX}:${accountType}:${accountId}`
    const schedulingDecision = await shouldSkipTempUnavailableForScheduling(
      accountId,
      accountType,
      context
    )
    if (schedulingDecision.skip) {
      const redis = getRedis()
      const client = redis.getClientSafe()
      await client.del(key).catch(() => {})
      logger.info(
        `⏭️ [UpstreamError] Skip temp-unavailable for account ${accountId} (${accountType}), reason: ${schedulingDecision.reason}`
      )
      return { success: true, skipped: true, reason: schedulingDecision.reason }
    }

    const policy = await getAccountTempUnavailablePolicy(accountId, accountType)
    const policyDecision = resolveAccountTtlOverride({
      policy,
      statusCode,
      errorType
    })

    if (policyDecision.skip) {
      const redis = getRedis()
      const client = redis.getClientSafe()
      await client.del(key).catch(() => {})
      logger.info(
        `⏭️ [UpstreamError] Skip temp-unavailable for account ${accountId} (${accountType}), reason: ${policyDecision.reason}`
      )
      return { success: true, skipped: true, reason: policyDecision.reason }
    }

    const ttlConfig = getTtlConfig()
    const parsedCustomTtl = Number(customTtl)
    let ttlSeconds
    if (Number.isFinite(parsedCustomTtl) && parsedCustomTtl > 0) {
      // 上游 retry-after 可能是周级限额（数天），必须钳制，否则账号会被长时间下线
      const requestedTtl = Math.ceil(parsedCustomTtl)
      ttlSeconds = Math.min(requestedTtl, ttlConfig.max_custom)
      if (ttlSeconds < requestedTtl) {
        logger.warn(
          `⚠️ [UpstreamError] Upstream retry-after ${requestedTtl}s for account ${accountId} (${accountType}) exceeds temp-unavailable cap, clamping to ${ttlSeconds}s`
        )
      }
    } else {
      ttlSeconds = ttlConfig[errorType]
    }
    if (
      Number.isFinite(policyDecision.ttlOverrideSeconds) &&
      policyDecision.ttlOverrideSeconds > 0
    ) {
      ttlSeconds = policyDecision.ttlOverrideSeconds
    }
    const markedAtIso = new Date().toISOString()
    const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString()

    const redis = getRedis()
    const client = redis.getClientSafe()
    await client.setex(
      key,
      ttlSeconds,
      JSON.stringify({
        statusCode,
        errorType,
        markedAt: markedAtIso,
        ttlSeconds,
        cooldownSeconds: ttlSeconds,
        expiresAt: expiresAtIso
      })
    )

    logger.warn(
      `⏱️ [UpstreamError] Account ${accountId} (${accountType}) marked temporarily unavailable for ${ttlSeconds}s (${statusCode} ${errorType}), recovers at ${expiresAtIso}`
    )

    // 异步记录错误历史，不阻塞主流程
    recordErrorHistory(accountId, accountType, statusCode, errorType, context).catch(() => {})

    return { success: true, ttlSeconds, errorType, expiresAt: expiresAtIso }
  } catch (error) {
    logger.error(
      `❌ [UpstreamError] Failed to mark account ${accountId} temporarily unavailable:`,
      error
    )
    return { success: false }
  }
}

// 检查账户是否临时不可用
const isTempUnavailable = async (accountId, accountType) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const key = `${TEMP_UNAVAILABLE_PREFIX}:${accountType}:${accountId}`
    const ttl = await client.ttl(key)

    if (ttl === -2) {
      return false
    }

    if (ttl === -1) {
      // 理论上该 key 必须带 TTL；如果无 TTL，自动清理以避免“永久不可用”
      logger.warn(
        `⚠️ [UpstreamError] Found temp_unavailable key without TTL for account ${accountId} (${accountType}), auto-clearing`
      )
      await client.del(key)
      return false
    }

    return ttl > 0
  } catch (error) {
    logger.error(
      `❌ [UpstreamError] Failed to check temp unavailable status for ${accountId}:`,
      error
    )
    return false
  }
}

// 清除临时不可用状态
const clearTempUnavailable = async (accountId, accountType) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const key = `${TEMP_UNAVAILABLE_PREFIX}:${accountType}:${accountId}`
    await client.del(key)
  } catch (error) {
    logger.error(`❌ [UpstreamError] Failed to clear temp unavailable for ${accountId}:`, error)
  }
}

// 批量查询所有临时不可用状态（用于前端展示）
const getAllTempUnavailable = async () => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const pattern = `${TEMP_UNAVAILABLE_PREFIX}:*`
    const keys = await client.keys(pattern)
    if (!keys.length) {
      return {}
    }

    const pipeline = client.pipeline()
    for (const key of keys) {
      pipeline.get(key)
      pipeline.ttl(key)
    }
    const results = await pipeline.exec()
    const cleanupPipeline = client.pipeline()

    const statuses = {}
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // key format: temp_unavailable:{accountType}:{accountId}
      const parts = key.split(':')
      const accountType = parts[1]
      const accountId = parts.slice(2).join(':')
      const [getErr, value] = results[i * 2]
      const [ttlErr, ttl] = results[i * 2 + 1]
      if (getErr || ttlErr || !value) {
        continue
      }

      if (ttl === -1) {
        // 自愈：清理无 TTL 的异常键，避免账户被永久阻塞
        cleanupPipeline.del(key)
        continue
      }

      try {
        const data = JSON.parse(value)
        const compositeKey = `${accountType}:${accountId}`
        const cooldownSecondsRaw = Number(data.cooldownSeconds)
        const ttlSecondsRaw = Number(data.ttlSeconds)
        const configuredCooldownSeconds = Number.isFinite(cooldownSecondsRaw)
          ? Math.max(0, Math.floor(cooldownSecondsRaw))
          : Number.isFinite(ttlSecondsRaw)
            ? Math.max(0, Math.floor(ttlSecondsRaw))
            : null

        statuses[compositeKey] = {
          accountId,
          accountType,
          statusCode: data.statusCode,
          errorType: data.errorType,
          markedAt: data.markedAt,
          ttl: ttl > 0 ? ttl : 0,
          remainingSeconds: ttl > 0 ? ttl : 0,
          cooldownSeconds: configuredCooldownSeconds,
          expiresAt: data.expiresAt || null
        }
      } catch {
        // ignore parse errors
      }
    }

    await cleanupPipeline.exec().catch(() => {})
    return statuses
  } catch (error) {
    logger.error('❌ [UpstreamError] Failed to get all temp unavailable statuses:', error)
    return {}
  }
}

// 清洗上游错误数据，去除内部路由标识（如 [codex/codex]）
const sanitizeErrorForClient = (errorData) => {
  if (!errorData || typeof errorData !== 'object') {
    return errorData
  }
  try {
    const str = JSON.stringify(errorData)
    const cleaned = str.replace(/ \[[^\]/]+\/[^\]]+\]/g, '')
    return JSON.parse(cleaned)
  } catch {
    return errorData
  }
}

module.exports = {
  markTempUnavailable,
  isTempUnavailable,
  clearTempUnavailable,
  getAllTempUnavailable,
  classifyError,
  parseRetryAfter,
  sanitizeErrorForClient,
  recordErrorHistory,
  getErrorHistory,
  clearErrorHistory,
  buildSchedulingContext,
  buildErrorHistoryContext,
  shouldSkipTempUnavailableForScheduling,
  TEMP_UNAVAILABLE_PREFIX,
  ERROR_HISTORY_PREFIX
}
