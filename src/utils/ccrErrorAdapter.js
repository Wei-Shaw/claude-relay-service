const { extractErrorMessage } = require('./errorSanitizer')
const upstreamErrorHelper = require('./upstreamErrorHelper')
const { createVendorErrorAdapter } = require('./vendorErrorAdapter')

const SAFE_ERROR_TYPES = {
  invalidRequest: 'invalid_request_error',
  notFound: 'not_found_error',
  rateLimit: 'rate_limit_error',
  server: 'api_error',
  overloaded: 'overloaded_error'
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractErrorType(errorData) {
  if (!errorData || typeof errorData !== 'object') {
    return ''
  }

  if (typeof errorData.type === 'string') {
    return errorData.type.trim().toLowerCase()
  }

  if (typeof errorData.error?.type === 'string') {
    return errorData.error.type.trim().toLowerCase()
  }

  return ''
}

function extractRetrySeconds(errorData, headers = {}) {
  const candidates = [
    errorData?.retry_after,
    errorData?.error?.retry_after,
    errorData?.resets_in_seconds,
    errorData?.error?.resets_in_seconds
  ]

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') {
      continue
    }

    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed)
    }
  }

  const retryAfter = upstreamErrorHelper.parseRetryAfter(headers)
  return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null
}

function inferStatusFromErrorData(errorData, fallbackStatus = null) {
  if (fallbackStatus) {
    return fallbackStatus
  }

  const type = extractErrorType(errorData)
  const message = normalizeText(extractErrorMessage(errorData)).toLowerCase()

  if (
    type === 'rate_limit_error' ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota')
  ) {
    return 429
  }

  if (
    type === 'invalid_request_error' ||
    type === 'bad_request_error' ||
    message.includes('invalid request') ||
    message.includes('invalid input') ||
    message.includes('invalid argument') ||
    message.includes('malformed') ||
    message.includes('unprocessable')
  ) {
    return 400
  }

  if (
    type === 'not_found_error' ||
    message.includes('not found') ||
    message.includes('does not exist')
  ) {
    return 404
  }

  if (
    type === 'authentication_error' ||
    type === 'unauthorized' ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('invalid api key') ||
    message.includes('invalid key')
  ) {
    return 401
  }

  if (
    type === 'permission_error' ||
    type === 'permission_denied' ||
    type === 'forbidden' ||
    message.includes('forbidden') ||
    message.includes('permission denied') ||
    message.includes('access denied')
  ) {
    return 403
  }

  if (
    type === 'overloaded_error' ||
    message.includes('overloaded') ||
    message.includes('capacity')
  ) {
    return 529
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

function sanitizeCcrClientError(status, errorData, options = {}) {
  const { headers = {}, fallbackStatus = 503 } = options

  const inferredStatus = inferStatusFromErrorData(errorData, status || null) || fallbackStatus
  const message = normalizeText(extractErrorMessage(errorData))
  const type = extractErrorType(errorData)

  if (inferredStatus === 429) {
    const retryAfter = extractRetrySeconds(errorData, headers)
    const error = {
      message: 'Rate limit exceeded',
      type: SAFE_ERROR_TYPES.rateLimit
    }

    if (retryAfter !== null) {
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
          type: SAFE_ERROR_TYPES.invalidRequest
        }
      }
    }

    return {
      status: 400,
      error: {
        message: 'Invalid request',
        type: SAFE_ERROR_TYPES.invalidRequest
      }
    }
  }

  if (inferredStatus === 404) {
    if (isModelNotAvailableMessage(message, type)) {
      return {
        status: 400,
        error: {
          message: 'Model not available',
          type: SAFE_ERROR_TYPES.invalidRequest
        }
      }
    }

    return {
      status: 404,
      error: {
        message: 'Resource not found',
        type: SAFE_ERROR_TYPES.notFound
      }
    }
  }

  if (inferredStatus === 401 || inferredStatus === 402 || inferredStatus === 403) {
    return {
      status: 503,
      error: {
        message: 'Account temporarily unavailable',
        type: SAFE_ERROR_TYPES.server
      }
    }
  }

  if (inferredStatus === 529 || message.toLowerCase().includes('overloaded')) {
    return {
      status: 529,
      error: {
        message: 'Server overloaded',
        type: SAFE_ERROR_TYPES.overloaded
      }
    }
  }

  if (inferredStatus === 504) {
    return {
      status: 504,
      error: {
        message: 'Request timeout',
        type: SAFE_ERROR_TYPES.server
      }
    }
  }

  if (inferredStatus === 502) {
    return {
      status: 502,
      error: {
        message: 'Upstream service error',
        type: SAFE_ERROR_TYPES.server
      }
    }
  }

  return {
    status: 503,
    error: {
      message: 'Service temporarily unavailable',
      type: SAFE_ERROR_TYPES.server
    }
  }
}

function sanitizeCcrStreamEvent(eventData, options = {}) {
  return ccrVendorErrorAdapter.sanitizeStreamEvent(eventData, options)
}

function formatAnthropicBody(sanitized) {
  return {
    type: 'error',
    error: sanitized.error
  }
}

const ccrVendorErrorAdapter = createVendorErrorAdapter({
  providerKey: 'ccr',
  fallbackMessage: 'Request failed',
  sanitizeClientError: sanitizeCcrClientError,
  formatBody: formatAnthropicBody,
  rewriteStreamEvent: (eventData, safeError, context) => {
    if (context.location === 'response.error') {
      return {
        changed: true,
        data: {
          ...eventData,
          response: {
            ...eventData.response,
            error: safeError
          }
        }
      }
    }

    return {
      changed: true,
      data: {
        type: 'error',
        error: safeError
      }
    }
  }
})

module.exports = {
  buildCcrClientError: ccrVendorErrorAdapter.buildClientError,
  sanitizeCcrStreamEvent
}
