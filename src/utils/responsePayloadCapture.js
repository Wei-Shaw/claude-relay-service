const CAPTURE_MODES = new Set(['off', 'preview', 'full'])
const DEFAULT_MODE = 'full'
const DEFAULT_MAX_BYTES = 1024 * 1024
const DEFAULT_PREVIEW_CHARS = 12000
const DEFAULT_CAPTURE_HEADERS = true
const DEFAULT_HEADER_ALLOWLIST = [
  'content-type',
  'content-length',
  'cache-control',
  'retry-after',
  'x-request-id',
  'request-id',
  'anthropic-request-id',
  'openai-request-id',
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens'
]

function normalizeCaptureMode(value, fallback = DEFAULT_MODE) {
  return CAPTURE_MODES.has(value) ? value : fallback
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

function normalizeHeaderAllowlist(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }

  return DEFAULT_HEADER_ALLOWLIST
}

function normalizeOptions(options = {}) {
  return {
    mode: normalizeCaptureMode(options.mode),
    maxBytes: parsePositiveInteger(options.maxBytes, DEFAULT_MAX_BYTES),
    previewChars: parsePositiveInteger(options.previewChars, DEFAULT_PREVIEW_CHARS),
    captureHeaders: parseBoolean(options.captureHeaders, DEFAULT_CAPTURE_HEADERS),
    headerAllowlist: normalizeHeaderAllowlist(options.headerAllowlist)
  }
}

function normalizeChunkToBuffer(chunk, encoding) {
  if (chunk === null || chunk === undefined) {
    return null
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk)
  }

  return Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8')
}

function serializeBodyForCapture(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const text = Buffer.from(body).toString('utf8')
    return { text, snapshot: text }
  }

  if (typeof body === 'string') {
    return { text: body, snapshot: body }
  }

  try {
    const text = JSON.stringify(body)
    return {
      text,
      snapshot: text === undefined ? null : JSON.parse(text)
    }
  } catch (_error) {
    const text = String(body)
    return { text, snapshot: text }
  }
}

function normalizeHeaderValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }

  return String(value)
}

function filterHeaders(headers = {}, allowlist = DEFAULT_HEADER_ALLOWLIST) {
  if (!headers || typeof headers !== 'object') {
    return null
  }

  const allowed = new Set(allowlist)
  const filtered = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key).trim().toLowerCase()
    if (!normalizedKey || !allowed.has(normalizedKey)) {
      continue
    }

    const normalizedValue = normalizeHeaderValue(value)
    if (normalizedValue !== null) {
      filtered[normalizedKey] = normalizedValue
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : null
}

function createResponsePayloadMetaFromBody(body, options = {}) {
  const normalizedOptions = normalizeOptions(options)
  if (normalizedOptions.mode === 'off') {
    return {}
  }

  const serialized = serializeBodyForCapture(body)
  const bodyBuffer = Buffer.from(serialized.text || '', 'utf8')
  const totalBytes = bodyBuffer.length
  const capturedBuffer =
    bodyBuffer.length > normalizedOptions.maxBytes
      ? bodyBuffer.subarray(0, normalizedOptions.maxBytes)
      : bodyBuffer
  const capturedText = capturedBuffer.toString('utf8')
  const truncated = capturedBuffer.length < totalBytes

  const meta = {
    responseBodySizeBytes: totalBytes,
    responseBodyTruncated: truncated,
    responseMetadata: {
      captureMode: normalizedOptions.mode,
      captureMaxBytes: normalizedOptions.maxBytes,
      capturedBytes: capturedBuffer.length,
      totalBytes,
      captureSource: 'direct'
    }
  }

  if (capturedText) {
    meta.responseTextPreview = capturedText.slice(0, normalizedOptions.previewChars)
    if (normalizedOptions.mode === 'full') {
      meta.responseBodySnapshot = truncated ? capturedText : serialized.snapshot
    }
  }

  return meta
}

function createResponsePayloadCapture(options = {}) {
  const normalizedOptions = normalizeOptions(options)
  const chunks = []
  let totalBytes = 0
  let capturedBytes = 0
  let truncated = false
  let responseHeaders = null

  const appendChunk = (chunk, encoding) => {
    if (normalizedOptions.mode === 'off') {
      return
    }

    const buffer = normalizeChunkToBuffer(chunk, encoding)
    if (!buffer || buffer.length === 0) {
      return
    }

    totalBytes += buffer.length

    if (capturedBytes >= normalizedOptions.maxBytes) {
      truncated = true
      return
    }

    const remainingBytes = normalizedOptions.maxBytes - capturedBytes
    const slice = buffer.length > remainingBytes ? buffer.subarray(0, remainingBytes) : buffer
    chunks.push(Buffer.from(slice))
    capturedBytes += slice.length

    if (slice.length < buffer.length) {
      truncated = true
    }
  }

  const setHeaders = (headers) => {
    if (!normalizedOptions.captureHeaders) {
      return
    }

    responseHeaders = filterHeaders(headers, normalizedOptions.headerAllowlist)
  }

  const getCapturedText = () => {
    if (capturedBytes <= 0) {
      return ''
    }

    return Buffer.concat(chunks, capturedBytes).toString('utf8')
  }

  const toRequestDetailMeta = () => {
    if (normalizedOptions.mode === 'off') {
      return {}
    }

    const capturedText = getCapturedText()
    const meta = {
      responseMetadata: {
        captureMode: normalizedOptions.mode,
        captureMaxBytes: normalizedOptions.maxBytes,
        capturedBytes,
        totalBytes
      }
    }

    if (responseHeaders) {
      meta.responseHeaders = responseHeaders
    }

    if (totalBytes > 0) {
      meta.responseBodySizeBytes = totalBytes
      meta.responseBodyTruncated = truncated
    }

    if (capturedText) {
      meta.responseTextPreview = capturedText.slice(0, normalizedOptions.previewChars)
      if (normalizedOptions.mode === 'full') {
        meta.responseBodySnapshot = capturedText
      }
    }

    return meta
  }

  return {
    appendChunk,
    setHeaders,
    toRequestDetailMeta
  }
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_PREVIEW_CHARS,
  DEFAULT_HEADER_ALLOWLIST,
  normalizeCaptureMode,
  createResponsePayloadMetaFromBody,
  createResponsePayloadCapture
}
