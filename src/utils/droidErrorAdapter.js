const { extractErrorMessage } = require('./errorSanitizer')
const upstreamErrorHelper = require('./upstreamErrorHelper')
const { createVendorErrorAdapter, cloneJsonSafe } = require('./vendorErrorAdapter')

const OPENAI_SAFE_TYPES = {
  invalidRequest: 'invalid_request_error',
  notFound: 'not_found_error',
  rateLimit: 'rate_limit_error',
  server: 'server_error'
}

const ANTHROPIC_SAFE_TYPES = {
  invalidRequest: 'invalid_request_error',
  notFound: 'not_found_error',
  rateLimit: 'rate_limit_error',
  server: 'api_error',
  overloaded: 'overloaded_error'
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEndpointType(endpointType = '') {
  const normalized = String(endpointType || 'anthropic')
    .trim()
    .toLowerCase()
  if (normalized === 'openai' || normalized === 'comm') {
    return normalized
  }
  return 'anthropic'
}

function extractErrorType(errorData) {
  if (!errorData || typeof errorData !== 'object') {
    return ''
  }

  const typeCandidates = [
    errorData.type,
    errorData.error?.type,
    errorData.error?.status,
    errorData.status,
    errorData.code,
    errorData.error?.code
  ]

  for (const candidate of typeCandidates) {
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
    type === 'rate_limit_error' ||
    type === 'resource_exhausted' ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota')
  ) {
    return 429
  }

  if (
    type === 'invalid_request_error' ||
    type === 'bad_request_error' ||
    type === 'invalid_argument' ||
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
    type === 'not_found' ||
    message.includes('not found') ||
    message.includes('does not exist')
  ) {
    return 404
  }

  if (
    type === 'authentication_error' ||
    type === 'unauthenticated' ||
    type === 'unauthorized' ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('invalid api key') ||
    message.includes('invalid key')
  ) {
    return 401
  }

  if (
    type === 'permission_denied' ||
    type === 'permission_error' ||
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

function buildSafeErrorObject(status, endpointType, extra = {}) {
  const normalizedEndpoint = normalizeEndpointType(endpointType)
  const safeTypes = normalizedEndpoint === 'anthropic' ? ANTHROPIC_SAFE_TYPES : OPENAI_SAFE_TYPES

  if (status === 429) {
    return {
      message: 'Rate limit exceeded',
      type: safeTypes.rateLimit,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'rate_limit_exceeded' }),
      ...extra
    }
  }

  if (status === 400) {
    return {
      message: extra.message || 'Invalid request',
      type: safeTypes.invalidRequest,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: extra.code || 'invalid_request' })
    }
  }

  if (status === 404) {
    return {
      message: 'Resource not found',
      type: safeTypes.notFound,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'resource_not_found' })
    }
  }

  if (status === 504) {
    return {
      message: 'Request timeout',
      type: safeTypes.server,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'request_timeout' })
    }
  }

  if (status === 502) {
    return {
      message: 'Upstream service error',
      type: safeTypes.server,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'upstream_error' })
    }
  }

  if (status === 529) {
    return {
      message: 'Server overloaded',
      type: normalizedEndpoint === 'anthropic' ? safeTypes.overloaded : safeTypes.server,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'server_overloaded' })
    }
  }

  if (status === 503) {
    return {
      message: 'Account temporarily unavailable',
      type: safeTypes.server,
      ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'account_unavailable' })
    }
  }

  return {
    message: 'Service temporarily unavailable',
    type: safeTypes.server,
    ...(normalizedEndpoint === 'anthropic' ? {} : { code: 'service_unavailable' })
  }
}

function sanitizeDroidClientError(status, errorData, options = {}) {
  const { headers = {}, endpointType = 'anthropic', fallbackStatus = 503 } = options
  const inferredStatus = inferStatusFromErrorData(errorData, status || null) || fallbackStatus
  const message = normalizeText(extractErrorMessage(errorData))
  const type = extractErrorType(errorData)

  if (inferredStatus === 429) {
    const retryAfter = upstreamErrorHelper.parseRetryAfter(headers)
    const error = buildSafeErrorObject(429, endpointType)
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
        error: buildSafeErrorObject(400, endpointType, {
          message: 'Model not available',
          code: 'model_not_available'
        })
      }
    }

    return {
      status: 400,
      error: buildSafeErrorObject(400, endpointType)
    }
  }

  if (inferredStatus === 404) {
    if (isModelNotAvailableMessage(message, type)) {
      return {
        status: 400,
        error: buildSafeErrorObject(400, endpointType, {
          message: 'Model not available',
          code: 'model_not_available'
        })
      }
    }

    return {
      status: 404,
      error: buildSafeErrorObject(404, endpointType)
    }
  }

  if (inferredStatus === 401 || inferredStatus === 402 || inferredStatus === 403) {
    return {
      status: 503,
      error: buildSafeErrorObject(503, endpointType)
    }
  }

  if (inferredStatus === 529 || message.toLowerCase().includes('overloaded')) {
    return {
      status: 503,
      error: buildSafeErrorObject(529, endpointType)
    }
  }

  if (inferredStatus === 504) {
    return {
      status: 504,
      error: buildSafeErrorObject(504, endpointType)
    }
  }

  if (inferredStatus === 502) {
    return {
      status: 502,
      error: buildSafeErrorObject(502, endpointType)
    }
  }

  return {
    status: 503,
    error: buildSafeErrorObject(501, endpointType)
  }
}

function formatDroidBody(sanitized, options = {}) {
  const endpointType = normalizeEndpointType(options.endpointType)

  if (endpointType === 'anthropic') {
    return {
      type: 'error',
      error: {
        type: sanitized.error.type,
        message: sanitized.error.message,
        ...(sanitized.error.retry_after !== undefined
          ? { retry_after: sanitized.error.retry_after }
          : {})
      }
    }
  }

  return {
    error: sanitized.error
  }
}

function buildPassthroughDroidError(status, errorData, options = {}) {
  const originalBody = options.originalBody || options.rawNetworkBody
  if (originalBody && typeof originalBody === 'object') {
    return {
      status: status || options.fallbackStatus,
      body: cloneJsonSafe(originalBody)
    }
  }

  if (typeof originalBody === 'string') {
    return {
      status: status || options.fallbackStatus,
      body: originalBody
    }
  }

  return null
}

function sanitizeDroidStreamEvent(eventData, options = {}) {
  return droidVendorErrorAdapter.sanitizeStreamEvent(eventData, options)
}

const droidVendorErrorAdapter = createVendorErrorAdapter({
  providerKey: 'droid',
  fallbackMessage: 'Request failed',
  sanitizeClientError: sanitizeDroidClientError,
  formatBody: formatDroidBody,
  buildPassthroughError: buildPassthroughDroidError,
  rewriteStreamEvent: (eventData, safeError, context) => {
    const endpointType = normalizeEndpointType(context.options?.endpointType || 'anthropic')

    if (endpointType === 'anthropic') {
      return {
        changed: true,
        data: {
          type: 'error',
          error: {
            type: safeError.type,
            message: safeError.message,
            ...(safeError.retry_after !== undefined ? { retry_after: safeError.retry_after } : {})
          }
        }
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
        error: safeError
      }
    }
  }
})

module.exports = {
  buildDroidClientError: droidVendorErrorAdapter.buildClientError,
  sanitizeDroidStreamEvent,
  normalizeDroidEndpointType: normalizeEndpointType
}
