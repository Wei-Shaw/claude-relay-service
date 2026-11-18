const { extractErrorMessage } = require('./errorSanitizer')
const upstreamErrorHelper = require('./upstreamErrorHelper')
const { createVendorErrorAdapter, cloneJsonSafe } = require('./vendorErrorAdapter')

const ERROR_TYPES = {
  invalidRequest: 'invalid_request_error',
  notFound: 'not_found_error',
  rateLimit: 'rate_limit_error',
  server: 'api_error',
  overloaded: 'overloaded_error'
}

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '')

function extractErrorType(errorData) {
  if (!errorData || typeof errorData !== 'object') {
    return ''
  }

  const candidates = [errorData.type, errorData.error?.type, errorData.code, errorData.error?.code]
  return (
    candidates
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim()
      .toLowerCase() || ''
  )
}

function extractRetryAfter(errorData, headers = {}) {
  const candidates = [
    errorData?.retry_after,
    errorData?.resets_in_seconds,
    errorData?.error?.retry_after,
    errorData?.error?.resets_in_seconds
  ]

  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value >= 0) {
      return Math.floor(value)
    }
  }

  const retryAfter = upstreamErrorHelper.parseRetryAfter(headers)
  return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null
}

function inferStatus(status, errorData) {
  if (Number.isInteger(status) && status >= 400) {
    return status
  }

  const type = extractErrorType(errorData)
  const message = normalizeText(extractErrorMessage(errorData)).toLowerCase()
  if (type === 'rate_limit_error' || message.includes('rate limit') || message.includes('quota')) {
    return 429
  }
  if (
    type === 'invalid_request_error' ||
    type === 'bad_request_error' ||
    message.includes('invalid request') ||
    message.includes('invalid argument') ||
    message.includes('malformed')
  ) {
    return 400
  }
  if (type === 'not_found_error' || message.includes('not found')) {
    return 404
  }
  if (
    type === 'authentication_error' ||
    type === 'unauthorized' ||
    message.includes('unauthorized')
  ) {
    return 401
  }
  if (
    type === 'permission_error' ||
    type === 'permission_denied' ||
    type === 'forbidden' ||
    message.includes('forbidden') ||
    message.includes('permission denied')
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
  if (message.includes('timeout') || message.includes('timed out')) {
    return 504
  }
  if (
    message.includes('connection refused') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('upstream')
  ) {
    return 502
  }
  return 503
}

function isModelUnavailable(message, type) {
  const normalizedMessage = normalizeText(message).toLowerCase()
  const normalizedType = normalizeText(type).toLowerCase()
  return (
    normalizedType === 'model_not_found' ||
    (normalizedMessage.includes('model') &&
      (normalizedMessage.includes('not found') ||
        normalizedMessage.includes('not available') ||
        normalizedMessage.includes('unsupported') ||
        normalizedMessage.includes('does not exist')))
  )
}

function sanitizeClaudeConsoleClientError(status, errorData, options = {}) {
  const inferredStatus = inferStatus(status, errorData)
  const message = extractErrorMessage(errorData)
  const type = extractErrorType(errorData)

  if (inferredStatus === 429) {
    const error = {
      type: ERROR_TYPES.rateLimit,
      message: 'Rate limit exceeded'
    }
    const retryAfter = extractRetryAfter(errorData, options.headers)
    if (retryAfter !== null) {
      error.retry_after = retryAfter
    }
    return { status: 429, error }
  }

  if (inferredStatus === 400 || inferredStatus === 422) {
    return {
      status: 400,
      error: {
        type: ERROR_TYPES.invalidRequest,
        message: isModelUnavailable(message, type) ? 'Model not available' : 'Invalid request'
      }
    }
  }

  if (inferredStatus === 404) {
    return {
      status: isModelUnavailable(message, type) ? 400 : 404,
      error: {
        type: isModelUnavailable(message, type) ? ERROR_TYPES.invalidRequest : ERROR_TYPES.notFound,
        message: isModelUnavailable(message, type) ? 'Model not available' : 'Resource not found'
      }
    }
  }

  if (inferredStatus === 401 || inferredStatus === 402 || inferredStatus === 403) {
    return {
      status: 503,
      error: { type: ERROR_TYPES.server, message: 'Account temporarily unavailable' }
    }
  }

  if (inferredStatus === 529) {
    return {
      status: 529,
      error: { type: ERROR_TYPES.overloaded, message: 'Server overloaded' }
    }
  }

  if (inferredStatus === 504) {
    return {
      status: 504,
      error: { type: ERROR_TYPES.server, message: 'Request timeout' }
    }
  }

  return {
    status: inferredStatus === 502 ? 502 : 503,
    error: { type: ERROR_TYPES.server, message: 'Upstream service error' }
  }
}

function buildPassthroughClaudeConsoleError(status, errorData, options = {}) {
  if (options.originalBody !== undefined) {
    return { status: status || options.fallbackStatus, body: cloneJsonSafe(options.originalBody) }
  }
  return null
}

const adapter = createVendorErrorAdapter({
  providerKey: 'claude-console',
  fallbackMessage: 'Request failed',
  sanitizeClientError: sanitizeClaudeConsoleClientError,
  buildPassthroughError: buildPassthroughClaudeConsoleError,
  formatBody: (sanitized) => ({ type: 'error', error: sanitized.error }),
  rewriteStreamEvent: (eventData, safeError, context) => {
    if (context.location === 'error') {
      const sanitizedEvent = { ...eventData, type: 'error', error: safeError }
      delete sanitizedEvent.message
      delete sanitizedEvent.code
      delete sanitizedEvent.details
      return {
        changed: true,
        data: sanitizedEvent
      }
    }

    if (context.location === 'response.error') {
      const sanitizedEvent = { ...eventData }
      delete sanitizedEvent.message
      delete sanitizedEvent.code
      delete sanitizedEvent.details
      return {
        changed: true,
        data: {
          ...sanitizedEvent,
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

function buildClaudeConsoleClientError(status, errorData, options = {}) {
  return adapter.buildClientError(status, errorData, options)
}

function sanitizeClaudeConsoleStreamEvent(eventData, options = {}) {
  return adapter.sanitizeStreamEvent(eventData, options)
}

module.exports = {
  buildClaudeConsoleClientError,
  sanitizeClaudeConsoleStreamEvent
}
