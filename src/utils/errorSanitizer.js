/**
 * 错误消息清理工具 - 白名单错误码制
 * 所有错误映射到预定义的标准错误码，原始消息只记日志不返回前端
 */

const logger = require('./logger')

// 标准错误码定义
const ERROR_CODES = {
  E001: { message: 'Service temporarily unavailable', status: 503 },
  E002: { message: 'Network connection failed', status: 502 },
  E003: { message: 'Authentication failed', status: 401 },
  E004: { message: 'Rate limit exceeded', status: 429 },
  E005: { message: 'Invalid request', status: 400 },
  E006: { message: 'Model not available', status: 503 },
  E007: { message: 'Upstream service error', status: 502 },
  E008: { message: 'Request timeout', status: 504 },
  E009: { message: 'Permission denied', status: 403 },
  E010: { message: 'Resource not found', status: 404 },
  E011: { message: 'Account temporarily unavailable', status: 503 },
  E012: { message: 'Server overloaded', status: 529 },
  E013: { message: 'Invalid API key', status: 401 },
  E014: { message: 'Quota exceeded', status: 429 },
  E015: { message: 'Internal server error', status: 500 }
}

// 错误特征匹配规则（按优先级排序）
const ERROR_MATCHERS = [
  // 网络层错误
  { pattern: /ENOTFOUND|DNS|getaddrinfo/i, code: 'E002' },
  { pattern: /ECONNREFUSED|ECONNRESET|connection refused/i, code: 'E002' },
  { pattern: /ETIMEDOUT|timeout/i, code: 'E008' },
  { pattern: /ECONNABORTED|aborted/i, code: 'E002' },

  // 认证错误
  { pattern: /unauthorized|invalid.*token|token.*invalid|invalid.*key/i, code: 'E003' },
  { pattern: /invalid.*api.*key|api.*key.*invalid/i, code: 'E013' },
  { pattern: /authentication|auth.*fail/i, code: 'E003' },

  // 权限错误
  { pattern: /forbidden|permission.*denied|access.*denied/i, code: 'E009' },
  { pattern: /does not have.*permission/i, code: 'E009' },

  // 限流错误
  { pattern: /rate.*limit|too many requests|429/i, code: 'E004' },
  { pattern: /quota.*exceeded|usage.*limit/i, code: 'E014' },

  // 过载错误
  { pattern: /overloaded|529|capacity/i, code: 'E012' },

  // 账户错误
  { pattern: /account.*disabled|organization.*disabled/i, code: 'E011' },
  { pattern: /too many active sessions/i, code: 'E011' },

  // 模型错误
  { pattern: /model.*not.*found|model.*unavailable|unsupported.*model/i, code: 'E006' },

  // 请求错误
  { pattern: /bad.*request|invalid.*request|malformed/i, code: 'E005' },
  { pattern: /not.*found|404/i, code: 'E010' },

  // 上游错误
  { pattern: /upstream|502|bad.*gateway/i, code: 'E007' },
  { pattern: /503|service.*unavailable/i, code: 'E001' }
]

/**
 * 根据原始错误匹配标准错误码
 * @param {Error|string|object} error - 原始错误
 * @param {object} options - 选项
 * @param {string} options.context - 错误上下文（用于日志）
 * @param {boolean} options.logOriginal - 是否记录原始错误（默认true）
 * @returns {{ code: string, message: string, status: number }}
 */
function mapToErrorCode(error, options = {}) {
  const { context = 'unknown', logOriginal = true } = options

  // 提取原始错误信息
  const originalMessage = extractOriginalMessage(error)
  const errorCode = error?.code || error?.response?.status
  const statusCode = error?.response?.status || error?.status || error?.statusCode

  // 记录原始错误到日志（供调试）
  if (logOriginal && originalMessage) {
    logger.debug(`[ErrorSanitizer] Original error (${context}):`, {
      message: originalMessage,
      code: errorCode,
      status: statusCode
    })
  }

  // 匹配错误码
  let matchedCode = 'E015' // 默认：内部服务器错误

  // 先按 HTTP 状态码快速匹配
  if (statusCode) {
    if (statusCode === 401) {
      matchedCode = 'E003'
    } else if (statusCode === 403) {
      matchedCode = 'E009'
    } else if (statusCode === 404) {
      matchedCode = 'E010'
    } else if (statusCode === 429) {
      matchedCode = 'E004'
    } else if (statusCode === 502) {
      matchedCode = 'E007'
    } else if (statusCode === 503) {
      matchedCode = 'E001'
    } else if (statusCode === 504) {
      matchedCode = 'E008'
    } else if (statusCode === 529) {
      matchedCode = 'E012'
    }
  }

  // 再按消息内容精确匹配（可能覆盖状态码匹配）
  if (originalMessage) {
    for (const matcher of ERROR_MATCHERS) {
      if (matcher.pattern.test(originalMessage)) {
        matchedCode = matcher.code
        break
      }
    }
  }

  // 按错误 code 匹配（网络错误）
  if (errorCode) {
    const codeStr = String(errorCode).toUpperCase()
    if (codeStr === 'ENOTFOUND' || codeStr === 'EAI_AGAIN') {
      matchedCode = 'E002'
    } else if (codeStr === 'ECONNREFUSED' || codeStr === 'ECONNRESET') {
      matchedCode = 'E002'
    } else if (codeStr === 'ETIMEDOUT' || codeStr === 'ESOCKETTIMEDOUT') {
      matchedCode = 'E008'
    } else if (codeStr === 'ECONNABORTED') {
      matchedCode = 'E002'
    }
  }

  const result = ERROR_CODES[matchedCode]
  return {
    code: matchedCode,
    message: result.message,
    status: result.status
  }
}

/**
 * 提取原始错误消息
 */
function extractOriginalMessage(error) {
  if (!error) {
    return ''
  }
  if (typeof error === 'string') {
    return error
  }
  if (error.message) {
    return error.message
  }
  if (error.response?.data?.error?.message) {
    return error.response.data.error.message
  }
  if (error.response?.data?.error) {
    return String(error.response.data.error)
  }
  if (error.response?.data?.message) {
    return error.response.data.message
  }
  return ''
}

/**
 * 创建安全的错误响应对象
 * @param {Error|string|object} error - 原始错误
 * @param {object} options - 选项
 * @returns {{ error: { code: string, message: string }, status: number }}
 */
function createSafeErrorResponse(error, options = {}) {
  const mapped = mapToErrorCode(error, options)
  return {
    error: {
      code: mapped.code,
      message: mapped.message
    },
    status: mapped.status
  }
}

/**
 * 创建安全的 SSE 错误事件
 * @param {Error|string|object} error - 原始错误
 * @param {object} options - 选项
 * @returns {string} - SSE 格式的错误事件
 */
function createSafeSSEError(error, options = {}) {
  const mapped = mapToErrorCode(error, options)
  return `event: error\ndata: ${JSON.stringify({
    error: mapped.message,
    code: mapped.code,
    timestamp: new Date().toISOString()
  })}\n\n`
}

/**
 * 获取安全的错误消息（用于替换 error.message）
 * @param {Error|string|object} error - 原始错误
 * @param {object} options - 选项
 * @returns {string}
 */
function getSafeMessage(error, options = {}) {
  return mapToErrorCode(error, options).message
}

// 兼容旧接口
function sanitizeErrorMessage(message) {
  if (!message) {
    return 'Service temporarily unavailable'
  }
  return mapToErrorCode({ message }, { logOriginal: false }).message
}

function sanitizeUpstreamError(errorData) {
  return createSafeErrorResponse(errorData, { logOriginal: false })
}

function extractErrorMessage(body) {
  return extractOriginalMessage(body)
}

function isAccountDisabledError(statusCode, body) {
  if (statusCode !== 400) {
    return false
  }
  const message = extractOriginalMessage(body)
  if (!message) {
    return false
  }
  const lower = message.toLowerCase()
  return (
    lower.includes('organization has been disabled') ||
    lower.includes('account has been disabled') ||
    lower.includes('account is disabled') ||
    lower.includes('no account supporting') ||
    lower.includes('account not found') ||
    lower.includes('invalid account') ||
    lower.includes('too many active sessions')
  )
}

module.exports = {
  ERROR_CODES,
  mapToErrorCode,
  createSafeErrorResponse,
  createSafeSSEError,
  getSafeMessage,
  // 兼容旧接口
  sanitizeErrorMessage,
  sanitizeUpstreamError,
  extractErrorMessage,
  isAccountDisabledError
}
