const { extractErrorMessage } = require('./errorSanitizer')
const upstreamErrorHelper = require('./upstreamErrorHelper')
const { createVendorErrorAdapter, cloneJsonSafe } = require('./vendorErrorAdapter')

const SAFE_ERROR_TYPES = {
  invalidRequest: 'invalid_request_error',
  notFound: 'not_found_error',
  rateLimit: 'rate_limit_error',
  server: 'server_error'
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractErrorType(errorData) {
  if (!errorData || typeof errorData !== 'object') {
    return ''
  }

  const candidates = [
    errorData.type,
    errorData.status,
    errorData.error?.type,
    errorData.error?.status,
    errorData.code,
    errorData.error?.code
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase()
    }
  }

  return ''
}

function inferNetworkStatus(errorData) {
  const code = typeof errorData?.code === 'string' ? errorData.code.trim().toUpperCase() : ''

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return 504
  }

  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED'
  ) {
    return 502
  }

  const message = normalizeText(errorData?.message).toLowerCase()
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline')
  ) {
    return 504
  }

  if (
    message.includes('connection refused') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  ) {
    return 502
  }

  return null
}

function inferStatusFromErrorData(errorData, fallbackStatus = null) {
  const networkStatus = inferNetworkStatus(errorData)
  if (networkStatus) {
    return networkStatus
  }

  if (fallbackStatus && fallbackStatus >= 400) {
    return fallbackStatus
  }

  const type = extractErrorType(errorData)
  const message = normalizeText(extractErrorMessage(errorData)).toLowerCase()

  if (
    type === 'resource_exhausted' ||
    type === 'rate_limit_error' ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota') ||
    message.includes('resource has been exhausted')
  ) {
    return 429
  }

  if (
    type === 'invalid_argument' ||
    type === 'invalid_request_error' ||
    message.includes('invalid request') ||
    message.includes('invalid input') ||
    message.includes('invalid argument') ||
    message.includes('malformed') ||
    message.includes('unprocessable')
  ) {
    return 400
  }

  if (
    type === 'not_found' ||
    type === 'not_found_error' ||
    message.includes('not found') ||
    message.includes('does not exist')
  ) {
    return 404
  }

  if (
    type === 'unauthenticated' ||
    type === 'authentication_error' ||
    type === 'unauthorized' ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('invalid api key') ||
    message.includes('api key not valid') ||
    message.includes('invalid key')
  ) {
    return 401
  }

  if (
    type === 'permission_denied' ||
    type === 'forbidden' ||
    message.includes('forbidden') ||
    message.includes('permission denied') ||
    message.includes('access denied')
  ) {
    return 403
  }

  if (
    type === 'unavailable' ||
    type === 'server_overloaded' ||
    message.includes('overloaded') ||
    message.includes('capacity')
  ) {
    return 503
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline')
  ) {
    return 504
  }

  if (
    message.includes('connection refused') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('upstream')
  ) {
    return 502
  }

  return 503
}

function isModelNotAvailableMessage(message, type = '') {
  const lowerMessage = normalizeText(message).toLowerCase()
  const lowerType = normalizeText(type).toLowerCase()

  return (
    lowerType === 'model_not_found' ||
    (lowerMessage.includes('model') &&
      (lowerMessage.includes('not found') ||
        lowerMessage.includes('not available') ||
        lowerMessage.includes('unsupported') ||
        lowerMessage.includes('does not exist')))
  )
}

function sanitizeGeminiApiClientError(status, errorData, options = {}) {
  const { headers = {}, fallbackStatus = 503 } = options
  const inferredStatus = inferStatusFromErrorData(errorData, status || null) || fallbackStatus
  const message = normalizeText(extractErrorMessage(errorData))
  const type = extractErrorType(errorData)

  if (inferredStatus === 429) {
    const retryAfter = upstreamErrorHelper.parseRetryAfter(headers)
    const error = {
      message: 'Rate limit exceeded',
      type: SAFE_ERROR_TYPES.rateLimit,
      code: 'rate_limit_exceeded'
    }

    if (retryAfter !== null && retryAfter !== undefined) {
      error.retry_after = retryAfter
    }

    return {
      status: 429,
      error
    }
  }

  if (inferredStatus === 400 || inferredStatus === 422) {
    if (isModelNotAvailableMessage(message, type)) {
      return {
        status: 400,
        error: {
          message: 'Model not available',
          type: SAFE_ERROR_TYPES.invalidRequest,
          code: 'model_not_available'
        }
      }
    }

    return {
      status: 400,
      error: {
        message: 'Invalid request',
        type: SAFE_ERROR_TYPES.invalidRequest,
        code: 'invalid_request'
      }
    }
  }

  if (inferredStatus === 404) {
    if (isModelNotAvailableMessage(message, type)) {
      return {
        status: 400,
        error: {
          message: 'Model not available',
          type: SAFE_ERROR_TYPES.invalidRequest,
          code: 'model_not_available'
        }
      }
    }

    return {
      status: 404,
      error: {
        message: 'Resource not found',
        type: SAFE_ERROR_TYPES.notFound,
        code: 'resource_not_found'
      }
    }
  }

  if (inferredStatus === 401 || inferredStatus === 402 || inferredStatus === 403) {
    return {
      status: 503,
      error: {
        message: 'Account temporarily unavailable',
        type: SAFE_ERROR_TYPES.server,
        code: 'account_unavailable'
      }
    }
  }

  if (inferredStatus === 504) {
    return {
      status: 504,
      error: {
        message: 'Request timeout',
        type: SAFE_ERROR_TYPES.server,
        code: 'request_timeout'
      }
    }
  }

  if (inferredStatus === 502) {
    return {
      status: 502,
      error: {
        message: 'Upstream service error',
        type: SAFE_ERROR_TYPES.server,
        code: 'upstream_error'
      }
    }
  }

  if (message.toLowerCase().includes('overloaded')) {
    return {
      status: 503,
      error: {
        message: 'Server overloaded',
        type: SAFE_ERROR_TYPES.server,
        code: 'server_overloaded'
      }
    }
  }

  return {
    status: 503,
    error: {
      message: 'Service temporarily unavailable',
      type: SAFE_ERROR_TYPES.server,
      code: 'service_unavailable'
    }
  }
}

function buildPassthroughGeminiApiError(status, errorData, options = {}) {
  if (options.originalBody && typeof options.originalBody === 'object') {
    return {
      status: status || options.fallbackStatus,
      body: cloneJsonSafe(options.originalBody)
    }
  }

  return null
}

function sanitizeGeminiApiStreamEvent(eventData, options = {}) {
  return geminiApiVendorErrorAdapter.sanitizeStreamEvent(eventData, options)
}

const geminiApiVendorErrorAdapter = createVendorErrorAdapter({
  providerKey: 'gemini-api',
  fallbackMessage: 'Request failed',
  sanitizeClientError: sanitizeGeminiApiClientError,
  buildPassthroughError: buildPassthroughGeminiApiError
})

module.exports = {
  buildGeminiApiClientError: geminiApiVendorErrorAdapter.buildClientError,
  sanitizeGeminiApiStreamEvent
}
