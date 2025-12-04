const logger = require('./logger')

function parseList(envValue) {
  if (!envValue) {
    return []
  }
  return envValue
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const unstableTypes = new Set(parseList(process.env.UNSTABLE_ERROR_TYPES))
const unstableKeywords = parseList(process.env.UNSTABLE_ERROR_KEYWORDS)
const unstableStatusCodes = new Set([408, 499, 502, 503, 504, 522])

function normalizeErrorPayload(payload) {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'string') {
    try {
      return normalizeErrorPayload(JSON.parse(payload))
    } catch (e) {
      return { message: payload }
    }
  }

  if (payload.error && typeof payload.error === 'object') {
    return {
      type: payload.error.type || payload.error.error || payload.error.code,
      code: payload.error.code || payload.error.error || payload.error.type,
      message: payload.error.message || payload.error.msg || payload.message || payload.error.error
    }
  }

  return {
    type: payload.type || payload.code,
    code: payload.code || payload.type,
    message: payload.message || ''
  }
}

function isUnstableUpstreamError(statusCode, payload) {
  const normalizedStatus = Number(statusCode)
  if (Number.isFinite(normalizedStatus) && normalizedStatus >= 500) {
    return true
  }
  if (Number.isFinite(normalizedStatus) && unstableStatusCodes.has(normalizedStatus)) {
    return true
  }

  const { type, code, message } = normalizeErrorPayload(payload)
  const lowerType = (type || '').toString().toLowerCase()
  const lowerCode = (code || '').toString().toLowerCase()
  const lowerMessage = (message || '').toString().toLowerCase()

  if (lowerType === 'server_error' || lowerCode === 'server_error') {
    return true
  }
  if (unstableTypes.has(lowerType) || unstableTypes.has(lowerCode)) {
    return true
  }
  if (unstableKeywords.length > 0) {
    return unstableKeywords.some((kw) => lowerMessage.includes(kw))
  }

  return false
}

function logUnstable(accountLabel, statusCode) {
  logger.warn(
    `Detected unstable upstream error (${statusCode}) for account ${accountLabel}, marking temporarily unavailable`
  )
}

module.exports = {
  isUnstableUpstreamError,
  logUnstable
}
