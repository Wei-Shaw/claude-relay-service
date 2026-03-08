const crypto = require('crypto')

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return {}
  }

  const normalized = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!key) {
      continue
    }
    normalized[key.toLowerCase()] = value
  }
  return normalized
}

function getOpenAIContinuity(reqLike = {}) {
  const headers = normalizeHeaders(reqLike.headers || reqLike)
  const body = reqLike.body || {}
  const candidates = [
    ['headers.session_id', headers['session_id']],
    ['headers.x-session-id', headers['x-session-id']],
    ['body.session_id', body?.session_id],
    ['body.conversation_id', body?.conversation_id],
    ['body.prompt_cache_key', body?.prompt_cache_key]
  ]

  const match = candidates.find(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )
  const continuityKey = match ? String(match[1]) : null

  return {
    continuityKey,
    source: match ? match[0] : null,
    sessionHash: continuityKey
      ? crypto.createHash('sha256').update(continuityKey).digest('hex')
      : null
  }
}

function ensureOpenAISessionHeader(headers = {}, continuityKey = null) {
  const nextHeaders = { ...(headers || {}) }
  const normalized = normalizeHeaders(nextHeaders)

  if (!continuityKey || normalized.session_id) {
    return nextHeaders
  }

  nextHeaders.session_id = continuityKey
  return nextHeaders
}

function hasExplicitStore(body = {}) {
  return !!body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'store')
}

function hasContinuityHint(body = {}, continuityKey = null) {
  return Boolean(
    continuityKey || body?.conversation_id || body?.prompt_cache_key || body?.previous_response_id
  )
}

function applyOpenAIStorePolicy(body = {}, { isCompactRoute = false, continuityKey = null } = {}) {
  if (!body || typeof body !== 'object') {
    return body
  }

  if (isCompactRoute) {
    if (hasExplicitStore(body)) {
      delete body.store
    }
    return body
  }

  if (!hasExplicitStore(body) && !hasContinuityHint(body, continuityKey)) {
    body.store = false
  }

  return body
}

function ensureResponsesPromptCacheKey(body = {}, continuityKey = null) {
  if (!body || typeof body !== 'object' || !continuityKey) {
    return body
  }

  const existing = body.prompt_cache_key
  if (existing !== undefined && existing !== null && existing !== '') {
    return body
  }

  if (!Array.isArray(body.input)) {
    return body
  }

  body.prompt_cache_key = continuityKey
  return body
}

module.exports = {
  applyOpenAIStorePolicy,
  ensureOpenAISessionHeader,
  ensureResponsesPromptCacheKey,
  getOpenAIContinuity
}
