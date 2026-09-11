const { extractErrorMessage } = require('./errorSanitizer')
const { isVendorErrorSanitizationEnabled, normalizeProviderFlagKey } = require('./featureFlags')

function cloneJsonSafe(value) {
  if (!value || typeof value !== 'object') {
    return value
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return { ...value }
  }
}

function buildPassthroughErrorBody(errorData, fallbackMessage = 'Request failed') {
  if (!errorData) {
    return {
      error: {
        message: fallbackMessage,
        type: 'api_error',
        code: 'unknown'
      }
    }
  }

  if (typeof errorData === 'string') {
    try {
      const parsed = JSON.parse(errorData)
      return buildPassthroughErrorBody(parsed, fallbackMessage)
    } catch {
      return {
        error: {
          message: errorData,
          type: 'api_error',
          code: 'unknown'
        }
      }
    }
  }

  if (Buffer.isBuffer(errorData) || typeof errorData.pipe === 'function') {
    return {
      error: {
        message: fallbackMessage,
        type: 'api_error',
        code: 'unknown'
      }
    }
  }

  if (typeof errorData === 'object') {
    const cloned = cloneJsonSafe(errorData)

    if (cloned?.error && typeof cloned.error === 'object') {
      return cloned
    }

    const extractedMessage = extractErrorMessage(cloned) || fallbackMessage
    return {
      error: {
        message: extractedMessage,
        type: cloned?.type || 'api_error',
        code: cloned?.code || 'unknown'
      }
    }
  }

  return {
    error: {
      message: fallbackMessage,
      type: 'api_error',
      code: 'unknown'
    }
  }
}

function extractStreamErrorLocation(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    return null
  }

  if (eventData.error && typeof eventData.error === 'object') {
    return { kind: 'error', payload: eventData.error }
  }

  if (eventData.response?.error && typeof eventData.response.error === 'object') {
    return { kind: 'response.error', payload: eventData.response.error }
  }

  if (eventData.type === 'error') {
    return { kind: 'root', payload: eventData }
  }

  return null
}

function createVendorErrorAdapter({
  providerKey,
  sanitizeClientError,
  rewriteStreamEvent = null,
  fallbackMessage = 'Request failed',
  formatBody = null,
  buildPassthroughError = null
}) {
  const normalizedProvider = normalizeProviderFlagKey(providerKey)

  const buildClientError = (status, errorData, options = {}) => {
    const fallbackStatus = options.fallbackStatus || status || 500

    if (!isVendorErrorSanitizationEnabled(normalizedProvider)) {
      if (typeof buildPassthroughError === 'function') {
        const passthrough = buildPassthroughError(status, errorData, {
          ...options,
          fallbackStatus,
          providerKey: normalizedProvider
        })

        if (passthrough && typeof passthrough === 'object') {
          return {
            status: passthrough.status || status || fallbackStatus,
            body: passthrough.body || buildPassthroughErrorBody(errorData, fallbackMessage)
          }
        }
      }

      const body = buildPassthroughErrorBody(errorData, fallbackMessage)
      return {
        status: status || fallbackStatus,
        body
      }
    }

    const sanitized = sanitizeClientError(status, errorData, options)
    const body =
      sanitized?.body ||
      (typeof formatBody === 'function'
        ? formatBody(sanitized, { ...options, providerKey: normalizedProvider })
        : {
            error: sanitized.error
          })

    return {
      status: sanitized.status || fallbackStatus,
      body
    }
  }

  const sanitizeStreamEvent = (eventData, options = {}) => {
    if (!isVendorErrorSanitizationEnabled(normalizedProvider)) {
      return { changed: false, data: eventData }
    }

    const location = extractStreamErrorLocation(eventData)
    if (!location) {
      return { changed: false, data: eventData }
    }

    const safePayload = sanitizeClientError(null, location.payload, options)

    if (typeof rewriteStreamEvent === 'function') {
      return rewriteStreamEvent(eventData, safePayload.error, {
        location: location.kind,
        providerKey: normalizedProvider,
        safePayload,
        options
      })
    }

    const cloned = cloneJsonSafe(eventData)
    if (location.kind === 'error') {
      cloned.error = safePayload.error
    } else if (location.kind === 'response.error') {
      cloned.response = { ...cloned.response, error: safePayload.error }
    } else {
      return {
        changed: true,
        data: {
          type: 'error',
          error: safePayload.error
        }
      }
    }

    return { changed: true, data: cloned }
  }

  return {
    buildClientError,
    sanitizeStreamEvent
  }
}

module.exports = {
  createVendorErrorAdapter,
  buildPassthroughErrorBody,
  extractStreamErrorLocation,
  cloneJsonSafe
}
