const logger = require('./logger')
const { normalizeTempUnavailablePolicyFromAccountData } = require('./tempUnavailablePolicy')

const TEMP_UNAVAILABLE_PREFIX = 'temp_unavailable'
const ERROR_HISTORY_PREFIX = 'error_history'
const ERROR_HISTORY_MAX = 5000
const ERROR_HISTORY_TTL = 3 * 24 * 60 * 60 // 3天

// 默认 TTL（秒）
const DEFAULT_TTL = {
  server_error: 300, // 5xx: 5分钟
  service_unavailable: 60, // 503: 1分钟（默认更短，避免短暂抖动导致长时间不可路由）
  overload: 600, // 529: 10分钟
  auth_error: 1800, // 401/403: 30分钟
  timeout: 300, // 504/网络超时: 5分钟
  rate_limit: 300 // 429: 5分钟（优先使用响应头解析值）
}

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
    rate_limit: DEFAULT_TTL.rate_limit
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

    const entry = JSON.stringify({
      time: new Date().toISOString(),
      status: statusCode,
      errorType,
      context: context
        ? {
            ...context,
            errorBody:
              typeof context.errorBody === 'string'
                ? context.errorBody.slice(0, 2000)
                : context.errorBody
                  ? JSON.stringify(context.errorBody).slice(0, 2000)
                  : undefined
          }
        : null
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

    const key = `${TEMP_UNAVAILABLE_PREFIX}:${accountType}:${accountId}`
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
    let ttlSeconds =
      Number.isFinite(parsedCustomTtl) && parsedCustomTtl > 0
        ? Math.ceil(parsedCustomTtl)
        : ttlConfig[errorType]
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
  TEMP_UNAVAILABLE_PREFIX,
  ERROR_HISTORY_PREFIX
}
