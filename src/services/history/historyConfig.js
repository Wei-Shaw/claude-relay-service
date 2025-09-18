const path = require('path')

const DEFAULTS = {
  enabled: true,
  ttlDays: 30,
  maxSessionsPerKey: 100,
  maxMessagesPerSession: 200,
  maxContentLength: 8000,
  redisPrefix: 'chat',
  exposeSessionHeader: true,
  sessionHeaderName: 'X-CRS-Session-Id'
}

const truthy = new Set(['1', 'true', 'yes', 'on'])
const falsy = new Set(['0', 'false', 'no', 'off'])

const toBoolean = (value, fallback) => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (truthy.has(lowered)) {
      return true
    }
    if (falsy.has(lowered)) {
      return false
    }
  }
  if (value === 0) {
    return false
  }
  if (value === 1) {
    return true
  }
  return fallback
}

const toInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const toFloat = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

const loadFileConfig = () => {
  try {
    // 支持可选的 config/history.js 文件
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.join(__dirname, '../../../config/history'))
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      // eslint-disable-next-line no-console
      console.warn('[historyConfig] Failed to load config/history.js:', error.message)
    }
  }
  return {}
}

const fileConfig = loadFileConfig()

const getConfigValue = (envKey, fileKey, transformer, fallback) => {
  const envValue = process.env[envKey]
  if (envValue !== undefined) {
    return transformer(envValue, fallback)
  }

  const fileValue = fileConfig[fileKey]
  if (fileValue !== undefined) {
    return transformer(fileValue, fallback)
  }

  return fallback
}

const config = {
  enabled: getConfigValue('CHAT_HISTORY_ENABLED', 'enabled', toBoolean, DEFAULTS.enabled),
  ttlDays: getConfigValue('CHAT_HISTORY_TTL_DAYS', 'ttlDays', toInteger, DEFAULTS.ttlDays),
  maxSessionsPerKey: getConfigValue(
    'CHAT_HISTORY_MAX_SESSIONS_PER_KEY',
    'maxSessionsPerKey',
    toInteger,
    DEFAULTS.maxSessionsPerKey
  ),
  maxMessagesPerSession: getConfigValue(
    'CHAT_HISTORY_MAX_MESSAGES',
    'maxMessagesPerSession',
    toInteger,
    DEFAULTS.maxMessagesPerSession
  ),
  maxContentLength: getConfigValue(
    'CHAT_HISTORY_MAX_CONTENT_LENGTH',
    'maxContentLength',
    toInteger,
    DEFAULTS.maxContentLength
  ),
  redisPrefix:
    process.env.CHAT_HISTORY_REDIS_PREFIX || fileConfig.redisPrefix || DEFAULTS.redisPrefix,
  exposeSessionHeader: getConfigValue(
    'CHAT_HISTORY_EXPOSE_SESSION_HEADER',
    'exposeSessionHeader',
    toBoolean,
    DEFAULTS.exposeSessionHeader
  ),
  sessionHeaderName:
    process.env.CHAT_HISTORY_SESSION_HEADER_NAME ||
    fileConfig.sessionHeaderName ||
    DEFAULTS.sessionHeaderName
}

config.ttlSeconds = config.ttlDays > 0 ? config.ttlDays * 24 * 60 * 60 : 0

module.exports = config
