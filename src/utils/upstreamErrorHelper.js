const logger = require('./logger')
const { normalizeTempUnavailablePolicyFromAccountData } = require('./tempUnavailablePolicy')
const { RedisKeys, TTL } = require('../constants/redisKeys')
const { RATE_LIMITED_MODEL_FAMILIES } = require('./modelHelper')

const TEMP_UNAVAILABLE_PREFIX = RedisKeys.upstream.tempUnavailablePrefix
const ERROR_HISTORY_PREFIX = RedisKeys.upstream.errorHistoryPrefix

// 需要脱敏的请求/响应头（小写匹配）
const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-goog-api-key',
  'x-api-token',
  'x-auth-token',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'openai-api-key',
  'anthropic-api-key',
  'x-amz-security-token'
])

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

// 错误历史记录配置：截断上限/条数/TTL 全部可通过 config(env) 调整，默认温和值
const getHistoryLimits = () => {
  const config = getConfig()
  const eh = config.upstreamError || {}
  const positiveInt = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
  return {
    maxEntries: positiveInt(eh.errorHistoryMaxEntries, 5000),
    ttlSeconds: TTL.errorHistory(),
    requestBodyMax: positiveInt(eh.errorHistoryRequestBodyMaxBytes, 32768),
    responseBodyMax: positiveInt(eh.errorHistoryResponseBodyMaxBytes, 8192),
    headersMax: positiveInt(eh.errorHistoryHeadersMaxBytes, 4096)
  }
}

// TTL 收口到 RedisKeys 的 TTL 表(逐字保留 config ?? env ?? 默认 的兜底链)
const getTtlConfig = () => ({
  service_unavailable: TTL.upstream503(),
  server_error: TTL.upstreamServerError(),
  overload: TTL.upstreamOverload(),
  auth_error: TTL.upstreamAuthError(),
  timeout: TTL.upstreamTimeout(),
  rate_limit: TTL.upstreamRateLimit,
  max_custom: TTL.upstreamMaxCustom()
})

// 延迟加载 redis，避免循环依赖
let _redis = null
const getRedis = () => {
  if (!_redis) {
    _redis = require('../models/redis')
  }
  return _redis
}

// 延迟加载 claudeRelayConfigService（账号错误收集开关来源），避免循环依赖
let _relayConfigService = null
const getRelayConfigService = () => {
  if (!_relayConfigService) {
    _relayConfigService = require('../services/claudeRelayConfigService')
  }
  return _relayConfigService
}

// 账号类型 -> 主数据 key builder（收口到 RedisKeys.accounts，hash 存储，hgetall 可读）
const ACCOUNT_KEY_BUILDER_BY_TYPE = {
  'claude-official': RedisKeys.accounts.claude,
  claude: RedisKeys.accounts.claude,
  'claude-console': RedisKeys.accounts.claudeConsole,
  ccr: RedisKeys.accounts.ccr,
  openai: RedisKeys.accounts.openai,
  'openai-responses': RedisKeys.accounts.openaiResponses,
  gemini: RedisKeys.accounts.gemini,
  'gemini-api': RedisKeys.accounts.geminiApi,
  'azure-openai': RedisKeys.accounts.azureOpenai,
  droid: RedisKeys.accounts.droid
}

// JSON 字符串存储（client.get + JSON.parse）的账号类型 key builder
const JSON_ACCOUNT_KEY_BUILDER_BY_TYPE = {
  bedrock: RedisKeys.accounts.bedrock
}

const EMPTY_TEMP_UNAVAILABLE_POLICY = {
  disableAutoProtection: false,
  disableTempUnavailable: false,
  ttl503Seconds: null,
  ttl5xxSeconds: null
}

const getAccountTempUnavailablePolicy = async (accountId, accountType) => {
  try {
    const redis = getRedis()
    const client = redis.getClientSafe()

    // JSON 字符串存储（bedrock）：读取后解析，只取 disableAutoProtection
    const jsonBuilder = JSON_ACCOUNT_KEY_BUILDER_BY_TYPE[accountType]
    if (jsonBuilder) {
      const raw = await client.get(jsonBuilder(accountId))
      if (!raw) {
        return EMPTY_TEMP_UNAVAILABLE_POLICY
      }
      const accountData = JSON.parse(raw)
      return {
        ...EMPTY_TEMP_UNAVAILABLE_POLICY,
        disableAutoProtection:
          accountData.disableAutoProtection === true || accountData.disableAutoProtection === 'true'
      }
    }

    const accountBuilder = ACCOUNT_KEY_BUILDER_BY_TYPE[accountType]
    if (!accountBuilder) {
      return EMPTY_TEMP_UNAVAILABLE_POLICY
    }

    const accountData = await client.hgetall(accountBuilder(accountId))
    if (!accountData || Object.keys(accountData).length === 0) {
      return EMPTY_TEMP_UNAVAILABLE_POLICY
    }

    const policy = normalizeTempUnavailablePolicyFromAccountData(accountData)
    // 关闭自动防护：上游错误下账号永不被自动标记临时不可用
    policy.disableAutoProtection =
      accountData.disableAutoProtection === true || accountData.disableAutoProtection === 'true'
    return policy
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

  // 关闭自动防护：任何上游错误都不自动标记临时不可用
  if (policy.disableAutoProtection) {
    return {
      skip: true,
      ttlOverrideSeconds: null,
      reason: 'account_auto_protection_disabled'
    }
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

// 安全脱敏：仅保留前缀辨识，尾部不泄露
// （不复用 tokenMask.maskToken：它在中短串上 backLength 可能为 0，slice(-0) 会回退为整串而泄露）
const maskSecret = (str) => {
  const text = String(str ?? '')
  if (text.length <= 8) {
    return '***'
  }
  return `${text.slice(0, 6)}***`
}

// 脱敏单个敏感头值
const maskSensitiveValue = (value) => {
  const str = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  return str ? maskSecret(str) : str
}

// 脱敏 headers，返回新对象（不修改原对象）
const sanitizeHeaders = (headers) => {
  if (!headers || typeof headers !== 'object') {
    return null
  }
  const result = {}
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      result[key] = maskSensitiveValue(value)
    } else {
      result[key] = Array.isArray(value) ? value.join(', ') : value
    }
  }
  return result
}

// 脱敏 URL query 中的凭证（如 ?key=xxx、?access_token=xxx）
const sanitizeUrl = (url) => {
  if (typeof url !== 'string' || !url) {
    return url
  }
  return url.replace(
    /([?&](?:key|api_key|apikey|access_token|token|password)=)([^&#]+)/gi,
    (_match, prefix, secret) => prefix + maskSecret(secret)
  )
}

// 任意值转字符串并截断到上限，超出时标注截断长度
const stringifyAndTruncate = (value, max) => {
  if (value === undefined || value === null) {
    return undefined
  }
  let str
  if (typeof value === 'string') {
    str = value
  } else {
    try {
      str = JSON.stringify(value)
    } catch {
      str = String(value)
    }
  }
  return str.length <= max ? str : `${str.slice(0, max)}... [truncated ${str.length - max} chars]`
}

// 字段名归一化：小写 + 去除 _ 和 -，使一条规则同时匹配 snake_case / kebab-case / camelCase
const normalizeBodyKey = (key) => String(key).toLowerCase().replace(/[_-]/g, '')

// 请求/响应体里需脱敏的“专指凭证”字段名（已归一化形态，命中即整值脱敏）
// 一条即覆盖多写法：apikey 匹配 api_key/api-key/apiKey；awssecretaccesskey 匹配 aws_secret_access_key/awsSecretAccessKey
const SENSITIVE_BODY_KEYS = new Set([
  'authorization',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'clientsecret',
  'password',
  'passwd',
  'cookie',
  'setcookie',
  'sessiontoken',
  'xapikey',
  'xgoogapikey',
  'anthropicapikey',
  'openaiapikey',
  'awssecretaccesskey',
  'awssessiontoken',
  'privatekey'
])

// 自由文本里的凭证正则（不论字段名，按值形态脱敏；覆盖 sk-/AIza/ya29/Bearer/JWT）
const SECRET_VALUE_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{8,}/g,
  /sk-[a-zA-Z0-9_-]{16,}/g,
  /AIza[a-zA-Z0-9_-]{10,}/g,
  /ya29\.[a-zA-Z0-9._-]{10,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{12,}/gi,
  /eyJ[a-zA-Z0-9_=-]{8,}\.eyJ[a-zA-Z0-9_=-]{8,}\.[a-zA-Z0-9_=-]+/g
]

// 对字符串里的已知凭证形态脱敏
const maskSecretsInText = (text) => {
  let result = text
  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, (matched) => maskSecret(matched))
  }
  return result
}

// 字段名“疑似凭证、但也可能是业务字段”（token/secret 等宽泛词）：
// 不无脑整值脱敏，先按值形态判断——既避免误伤业务字段，也不放过不透明凭证
const AMBIGUOUS_SECRET_KEYS = new Set(['token', 'secret', 'credentials', 'key', 'auth'])

// 值是否“像凭证”：含 16+ 连续字母数字段（不含分隔符）即判为不透明 token 形态。
// 仅此一条——opaque token 是无分隔的长串；UUID/长 ID/code/slug 被 - . _ 分隔成更短段，不会命中而得以保留。
// 含空白的描述性文本一律保留（已知凭证形态另由 SECRET_VALUE_PATTERNS 正则兜底）。
// 不再用“总长度/字符类”兜底——那会把 36 位 UUID 这类结构化业务标识误判为凭证。
const looksLikeSecretValue = (value) => {
  if (typeof value !== 'string' || /\s/.test(value)) {
    return false
  }
  return /[A-Za-z0-9]{16,}/.test(value)
}

// 递归脱敏请求/响应体：敏感字段名整值脱敏，其余字符串值再过凭证正则；不修改原对象
const sanitizeBodyValue = (value, depth = 0) => {
  if (depth > 6) {
    return '[too deep]'
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBodyValue(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, val] of Object.entries(value)) {
      const normKey = normalizeBodyKey(key)
      if (SENSITIVE_BODY_KEYS.has(normKey)) {
        // 专指凭证的字段：整值脱敏
        result[key] = typeof val === 'string' ? maskSecret(val) : '***'
      } else if (AMBIGUOUS_SECRET_KEYS.has(normKey) && looksLikeSecretValue(val)) {
        // 宽泛字段且值像凭证：脱敏（值不像凭证则落入 else 保留，字符串仍过正则兜底）
        result[key] = maskSecret(val)
      } else {
        result[key] = sanitizeBodyValue(val, depth + 1)
      }
    }
    return result
  }
  if (typeof value === 'string') {
    return maskSecretsInText(value)
  }
  return value
}

// 脱敏 + 序列化 + 截断请求/响应体：先按字段名与凭证形态脱敏，再截断
const sanitizeAndStringifyBody = (value, max) => {
  if (value === undefined || value === null) {
    return undefined
  }
  let str
  if (typeof value === 'string') {
    try {
      str = JSON.stringify(sanitizeBodyValue(JSON.parse(value)))
    } catch {
      str = maskSecretsInText(value)
    }
  } else {
    try {
      str = JSON.stringify(sanitizeBodyValue(value))
    } catch {
      str = maskSecretsInText(String(value))
    }
  }
  return str.length <= max ? str : `${str.slice(0, max)}... [truncated ${str.length - max} chars]`
}

// 构造错误上下文：脱敏 + 截断 + 打包，采集不到的字段忽略，前端按存在性渲染
// 响应体复用 errorBody 字段名，兼容前端既有展示
const buildErrorContext = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  try {
    const limits = getHistoryLimits()
    const context = {}
    if (raw.model) {
      context.model = String(raw.model)
    }
    if (raw.apiKeyName) {
      context.apiKeyName = String(raw.apiKeyName)
    }
    if (raw.sessionId) {
      context.sessionId = String(raw.sessionId)
    }
    if (raw.path) {
      context.path = String(raw.path)
    }
    if (raw.reason) {
      context.reason = String(raw.reason)
    }
    if (raw.url) {
      context.url = sanitizeUrl(String(raw.url))
    }
    if (raw.method) {
      context.method = String(raw.method).toUpperCase()
    }
    const requestHeaders = sanitizeHeaders(raw.requestHeaders)
    if (requestHeaders) {
      context.requestHeaders = stringifyAndTruncate(requestHeaders, limits.headersMax)
    }
    const requestBody = sanitizeAndStringifyBody(raw.requestBody, limits.requestBodyMax)
    if (requestBody) {
      context.requestBody = requestBody
    }
    const responseHeaders = sanitizeHeaders(raw.responseHeaders)
    if (responseHeaders) {
      context.responseHeaders = stringifyAndTruncate(responseHeaders, limits.headersMax)
    }
    const errorBody = sanitizeAndStringifyBody(
      raw.responseBody ?? raw.errorBody,
      limits.responseBodyMax
    )
    if (errorBody) {
      context.errorBody = errorBody
    }
    if (raw.message) {
      context.message = sanitizeAndStringifyBody(raw.message, limits.responseBodyMax)
    }
    return Object.keys(context).length > 0 ? context : null
  } catch (error) {
    logger.warn(`⚠️ [ErrorHistory] Failed to build error context: ${error.message}`)
    return null
  }
}

// 记录错误历史到 Redis List
const recordErrorHistory = async (
  accountId,
  accountType,
  statusCode,
  errorType,
  context = null
) => {
  // 账号错误收集开关（默认开启）：关闭时不写入错误历史
  // fail-open：读取开关异常时按"开启"处理，保持默认采集行为，不因开关读取失败而丢错误
  try {
    if ((await getRelayConfigService().isErrorHistoryCollectionEnabled()) === false) {
      return
    }
  } catch (switchErr) {
    logger.warn(
      `⚠️ [ErrorHistory] Failed to read collection switch, defaulting to enabled: ${switchErr.message}`
    )
  }

  try {
    const redis = getRedis()
    const client = redis.getClientSafe()
    const redisKey = RedisKeys.upstream.errorHistory(accountType, accountId)
    const limits = getHistoryLimits()

    const entry = JSON.stringify({
      time: new Date().toISOString(),
      status: statusCode,
      // errorType 缺省时按状态码兜底分类（流式 end 处补记历史会传 null）
      errorType: errorType || classifyError(statusCode) || 'unknown',
      context: context
        ? {
            ...context,
            errorBody:
              typeof context.errorBody === 'string'
                ? context.errorBody.slice(0, limits.responseBodyMax)
                : context.errorBody
                  ? JSON.stringify(context.errorBody).slice(0, limits.responseBodyMax)
                  : undefined
          }
        : null
    })

    const pipeline = client.pipeline()
    pipeline.lpush(redisKey, entry)
    pipeline.ltrim(redisKey, 0, limits.maxEntries - 1)
    pipeline.expire(redisKey, limits.ttlSeconds)
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
    const redisKey = RedisKeys.upstream.errorHistory(accountType, accountId)
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
    const redisKey = RedisKeys.upstream.errorHistory(accountType, accountId)
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
  context = null,
  skipHistory = false
) => {
  try {
    const errorType = classifyError(statusCode)
    if (!errorType) {
      return { success: false, reason: 'not_a_pausable_error' }
    }

    const policy = await getAccountTempUnavailablePolicy(accountId, accountType)
    const policyDecision = resolveAccountTtlOverride({
      policy,
      statusCode,
      errorType
    })

    const key = RedisKeys.upstream.tempUnavailable(accountType, accountId)
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
    // skipHistory：流式场景在标记时跳过记历史，待响应体收齐后在 end 处补记带响应体的一条
    if (!skipHistory) {
      recordErrorHistory(accountId, accountType, statusCode, errorType, context).catch(() => {})
    }

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
    const key = RedisKeys.upstream.tempUnavailable(accountType, accountId)
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
    const key = RedisKeys.upstream.tempUnavailable(accountType, accountId)
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
    const pattern = RedisKeys.upstream.tempUnavailablePattern
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

// 语义上仅由自动保护写入的特定 status 取值（用于恢复判定）。
// 不含通用 'error'：'error' 含义过宽（token 刷新失败/余额检查/外部直写等），无法在
// 代码层可靠区分来源，作为恢复依据有误恢复风险（见 reviewer #2/#4）。'error' 的处理改为
// 在各写入点用 disableAutoProtection 守卫（防止开关开启后再被自动写成 error）。
const AUTO_STOP_STATUSES = new Set([
  'rate_limited',
  'rateLimited',
  'quota_exceeded',
  'quotaExceeded',
  'overloaded',
  'unauthorized',
  'blocked'
])

// 专用自动停止标记字段（自动停用时写入，手动改 schedulable 时被清除，最可靠）
const AUTO_STOP_MARKER_FIELDS = [
  'rateLimitAutoStopped',
  'fiveHourAutoStopped',
  'quotaAutoStopped',
  'tempErrorAutoStopped',
  'blockedAutoStopped'
]

// 判断账户当前是否处于"自动停用"状态（用于区分手动停用，避免误恢复手动停用的账户）
// 仅采信"当前确实导致调度排除、且仅由自动保护写入"的信号，不采信会滞留的历史时间戳
const hasAutoStopEvidence = (accountData = {}) => {
  if (AUTO_STOP_STATUSES.has(accountData.status)) {
    return true
  }
  if (accountData.rateLimitStatus === 'limited') {
    return true
  }
  if (accountData.overloadStatus === 'overloaded') {
    return true
  }
  if (accountData.blockedStatus === 'blocked') {
    return true
  }
  if (accountData.quotaStoppedAt) {
    return true
  }
  // 注意：模型家族周限（opus/sonnet/haiku/fable 的 ${f}RateLimitEndAt）不算"整账号自动停用"证据——
  // markAccountModelRateLimited 只写家族字段、从不停用整个账号；若据此恢复 schedulable，会误解除管理员手动暂停。
  // 家族残留的清理走 hasModelFamilyRateLimit + 补丁里的家族清空字段，与整账号恢复解耦。
  // autoStoppedAt 为自动停用标记（droid 硬停等使用），手动停用不会写入
  if (accountData.autoStoppedAt) {
    return true
  }
  return AUTO_STOP_MARKER_FIELDS.some(
    (field) => accountData[field] === 'true' || accountData[field] === true
  )
}

// 判断账户是否存在模型家族限流残留（opus/sonnet/haiku/fable）。
// 仅表示"某模型被限流"，不代表整个账号被停用——因此与 hasAutoStopEvidence 分开。
const hasModelFamilyRateLimit = (accountData = {}) =>
  RATE_LIMITED_MODEL_FAMILIES.some(
    (family) => accountData[`${family}RateLimitEndAt`] || accountData[`${family}RateLimitedAt`]
  )

// 生成 disableAutoProtection 开启时的清理补丁。两类残留分别处理、互不牵连：
//   1) 整账号自动停用（限流/配额/过载/5h/401/403/硬停标记）→ 清状态字段并恢复 schedulable/status；
//      手动停用（无自动迹象的 schedulable=false / isActive=false / 裸 status='error'）不恢复。
//   2) 模型家族周限残留（opus/sonnet/haiku/fable）→ 仅清对应家族字段，绝不改 schedulable/status，
//      避免误解除管理员手动暂停（模型级限流本不停用整账号）。
// 两者都不存在时返回 null。
const buildAutoProtectionRecoveryPatch = (accountData = {}) => {
  const autoStopped = hasAutoStopEvidence(accountData)
  const modelFamilyLimited = hasModelFamilyRateLimit(accountData)
  if (!autoStopped && !modelFamilyLimited) {
    return null
  }

  const patch = {}

  // 模型家族限流字段一并清空（无论是否整账号停用，家族残留都应在 toggle-on 时清掉）
  if (modelFamilyLimited) {
    for (const family of RATE_LIMITED_MODEL_FAMILIES) {
      patch[`${family}RateLimitedAt`] = ''
      patch[`${family}RateLimitEndAt`] = ''
    }
  }

  // 仅在确有"整账号自动停用"证据时，才清状态字段并恢复调度
  if (autoStopped) {
    Object.assign(patch, {
      rateLimitStatus: '',
      rateLimitedAt: '',
      rateLimitEndAt: '',
      rateLimitResetAt: '',
      overloadStatus: '',
      overloadedAt: '',
      errorMessage: '',
      rateLimitAutoStopped: '',
      fiveHourAutoStopped: '',
      fiveHourStoppedAt: '',
      tempErrorAutoStopped: '',
      blockedAutoStopped: '',
      blockedStatus: '',
      blockedAt: '',
      unauthorizedAt: '',
      autoStoppedAt: '',
      stoppedReason: '',
      schedulable: 'true',
      status: 'active'
    })
  }

  return patch
}

// 清理账户的临时冷却（temp_unavailable）以及 Claude 的过载 key
const clearAutoProtectionCooldowns = async (accountId, accountType) => {
  await clearTempUnavailable(accountId, accountType).catch(() => {})
  if (accountType === 'claude' || accountType === 'claude-official') {
    try {
      const redis = getRedis()
      const client = redis.getClientSafe()
      await client.del(RedisKeys.account.overload(accountId))
    } catch (error) {
      logger.warn(
        `⚠️ [UpstreamError] Failed to clear overload key for ${accountId}: ${error.message}`
      )
    }
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
  hasAutoStopEvidence,
  hasModelFamilyRateLimit,
  buildAutoProtectionRecoveryPatch,
  clearAutoProtectionCooldowns,
  classifyError,
  parseRetryAfter,
  sanitizeErrorForClient,
  recordErrorHistory,
  getErrorHistory,
  clearErrorHistory,
  buildErrorContext,
  TEMP_UNAVAILABLE_PREFIX,
  ERROR_HISTORY_PREFIX
}
