const { extractErrorMessage } = require('./errorSanitizer')
const upstreamErrorHelper = require('./upstreamErrorHelper')
const { createVendorErrorAdapter } = require('./vendorErrorAdapter')

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
    errorData?.resets_in_seconds,
    errorData?.retry_after,
    errorData?.error?.resets_in_seconds,
    errorData?.error?.retry_after,
    errorData?.error?.resets_in
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
    type === 'usage_limit_reached' ||
    type === 'rate_limit_exceeded' ||
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
    message.includes('invalid api key') ||
    message.includes('invalid key') ||
    message.includes('authentication')
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
    type === 'overloaded_error' ||
    type === 'server_overloaded' ||
    message.includes('overloaded') ||
    message.includes('capacity')
  ) {
    return 503
  }

  if (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('etimedout')
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

function isClientFixableNotFound(message = '') {
  const lowerMessage = normalizeText(message).toLowerCase()
  return (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('does not exist') ||
    lowerMessage.includes('unknown parameter') ||
    lowerMessage.includes('resource')
  )
}

function sanitizeOpenAIResponsesClientError(status, errorData, options = {}) {
  const { headers = {}, fallbackStatus = 503 } = options

  const inferredStatus = inferStatusFromErrorData(errorData, status || null) || fallbackStatus
  const message = normalizeText(extractErrorMessage(errorData))
  const type = extractErrorType(errorData)

  if (inferredStatus === 429) {
    const resetsInSeconds = extractRetrySeconds(errorData, headers)
    const error = {
      message: 'Rate limit exceeded',
      type: SAFE_ERROR_TYPES.rateLimit,
      code: 'rate_limit_exceeded'
    }

    if (resetsInSeconds !== null) {
      error.resets_in_seconds = resetsInSeconds
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

    if (isClientFixableNotFound(message)) {
      return {
        status: 404,
        error: {
          message: 'Resource not found',
          type: SAFE_ERROR_TYPES.notFound,
          code: 'resource_not_found'
        }
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

  if (message.toLowerCase().includes('overloaded') || inferredStatus === 529) {
    return {
      status: 503,
      error: {
        message: 'Server overloaded',
        type: SAFE_ERROR_TYPES.server,
        code: 'server_overloaded'
      }
    }
  }

  if (inferredStatus === 502 || inferredStatus === 504) {
    return {
      status: inferredStatus,
      error: {
        message: inferredStatus === 504 ? 'Request timeout' : 'Upstream service error',
        type: SAFE_ERROR_TYPES.server,
        code: inferredStatus === 504 ? 'request_timeout' : 'upstream_error'
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

function sanitizeOpenAIResponsesStreamEvent(eventData, options = {}) {
  return openAIResponsesVendorErrorAdapter.sanitizeStreamEvent(eventData, options)
}

const openAIResponsesVendorErrorAdapter = createVendorErrorAdapter({
  providerKey: 'openai-responses',
  fallbackMessage: 'Request failed',
  sanitizeClientError: sanitizeOpenAIResponsesClientError,
  rewriteStreamEvent: (eventData, safeError, context) => {
    if (context.location === 'error') {
      const sanitizedEvent = { ...eventData, error: safeError }
      delete sanitizedEvent.message
      delete sanitizedEvent.code
      delete sanitizedEvent.details
      return {
        changed: true,
        data: sanitizedEvent
      }
    }

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
  buildOpenAIResponsesClientError: openAIResponsesVendorErrorAdapter.buildClientError,
  sanitizeOpenAIResponsesStreamEvent
}
