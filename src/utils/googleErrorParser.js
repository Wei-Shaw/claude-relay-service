function safeJsonParse(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    try {
      return JSON.parse(trimmed)
    } catch (_) {
      return null
    }
  }

  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString('utf8'))
    } catch (_) {
      return null
    }
  }

  if (typeof value === 'object') {
    return value
  }

  return null
}

function parseGoogleErrorReason(errorBody) {
  const parsed = safeJsonParse(errorBody)
  const details = parsed?.error?.details
  if (!Array.isArray(details)) {
    return null
  }
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') {
      continue
    }
    const { reason } = detail
    if (typeof reason === 'string' && reason) {
      return reason
    }
    const metadataReason = detail.metadata?.reason
    if (typeof metadataReason === 'string' && metadataReason) {
      return metadataReason
    }
  }
  return null
}

function parseGoogleErrorDetailModel(errorBody) {
  const parsed = safeJsonParse(errorBody)
  const details = parsed?.error?.details
  if (!Array.isArray(details)) {
    return null
  }
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') {
      continue
    }
    const model = detail.metadata?.model
    if (typeof model === 'string' && model) {
      return model
    }
  }
  return null
}

function parseDurationToMs(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') {
    return null
  }
  const str = durationStr.trim().toLowerCase()

  if (str.endsWith('s') && !str.endsWith('ms')) {
    const num = parseFloat(str.slice(0, -1))
    if (!Number.isNaN(num)) {
      return Math.round(num * 1000)
    }
  }

  if (str.endsWith('ms')) {
    const num = parseFloat(str.slice(0, -2))
    if (!Number.isNaN(num)) {
      return Math.round(num)
    }
  }

  return null
}

/**
 * 从 Google API 429 错误响应中解析 retry delay（毫秒）。
 * 策略:
 *   1. error.details[] 中找 RetryInfo.retryDelay (如 "0.847655010s")
 *   2. error.details[] 中找 ErrorInfo.metadata.quotaResetDelay (如 "373.801628ms")
 *   3. 正则匹配 error.message 中的 "after Xs"
 */
function parseGoogleRetryDelayMs(errorBody) {
  const parsed = safeJsonParse(errorBody)
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const details = parsed.error?.details
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
        const { retryDelay } = detail
        if (typeof retryDelay === 'string' && retryDelay) {
          const ms = parseDurationToMs(retryDelay)
          if (ms !== null) {
            return ms
          }
        }
      }
    }

    for (const detail of details) {
      if (detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo') {
        const quotaResetDelay = detail.metadata?.quotaResetDelay
        if (typeof quotaResetDelay === 'string' && quotaResetDelay) {
          const ms = parseDurationToMs(quotaResetDelay)
          if (ms !== null) {
            return ms
          }
        }
      }
    }
  }

  const message = parsed.error?.message
  if (typeof message === 'string' && message) {
    const match = message.match(/after\s+(\d+)s\.?/i)
    if (match && match[1]) {
      const seconds = parseInt(match[1], 10)
      if (!Number.isNaN(seconds)) {
        return seconds * 1000
      }
    }
  }

  return null
}

module.exports = {
  safeJsonParse,
  parseGoogleErrorReason,
  parseGoogleErrorDetailModel,
  parseGoogleRetryDelayMs
}
