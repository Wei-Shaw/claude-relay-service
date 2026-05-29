const crypto = require('crypto')
const config = require('../../config/config')
const metadataUserIdHelper = require('./metadataUserIdHelper')
const { createResponsePayloadMetaFromBody } = require('./responsePayloadCapture')

const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy-authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|cookie|set-cookie|client_secret|private[_-]?key|proxy)/i
const DEFAULT_MAX_STRING_CHARS = 1024 * 1024
const DEFAULT_MAX_ARRAY_ITEMS = 24
const DEFAULT_MAX_DEPTH = 6
const DEFAULT_MAX_TOTAL_CHARS = 1024 * 1024
const ENCRYPTED_CONTENT_KEY = 'encrypted_content'
const TOOLS_KEY = 'tools'
const PREVIEW_TRUNCATION_SUFFIX_PATTERN = /\.\.\.\[(?:truncated )?(\d+) chars\]$/
const OPENAI_RELATED_ACCOUNT_TYPES = new Set(['openai', 'openai-responses', 'azure-openai'])
const CACHE_HIT_FORMULA = 'cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreateTokens)'

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const num = Number(value)
  if (!Number.isFinite(num)) {
    return null
  }

  return num
}

function maskSensitiveValue(value) {
  if (value === null || value === undefined) {
    return value
  }

  const str = String(value)
  if (str.length <= 8) {
    return '[REDACTED]'
  }

  return `${str.slice(0, 3)}***${str.slice(-3)}`
}

function truncateString(value, maxChars = DEFAULT_MAX_STRING_CHARS) {
  if (typeof value !== 'string') {
    return value
  }

  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars)}...[${value.length - maxChars} chars]`
}

function getValueCharLength(value) {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === 'string') {
    return value.length
  }

  try {
    const json = JSON.stringify(value)
    if (typeof json === 'string') {
      return json.length
    }
  } catch (error) {
    // Fall back to String(value) below when JSON serialization fails.
  }

  return String(value).length
}

function createOmittedValue(value) {
  return `...[${getValueCharLength(value)} chars]`
}

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeInteger(value) {
  const num = toFiniteNumber(value)
  if (num === null) {
    return null
  }

  return Math.trunc(num)
}

function formatReasoningBudget(value) {
  return `budget:${value}`
}

function createReasoningInfo(reasoningDisplay = null, reasoningSource = null) {
  return {
    reasoningDisplay: reasoningDisplay || null,
    reasoningSource: reasoningSource || null
  }
}

function summarizeToolEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return sanitizeValue(value, {
      seen: new WeakSet(),
      keyPath: '',
      depth: 0
    })
  }

  const summary = {}
  if (typeof value.type === 'string' && value.type) {
    summary.type = value.type
  }

  const name =
    typeof value.name === 'string'
      ? value.name
      : typeof value.function?.name === 'string'
        ? value.function.name
        : null

  if (name) {
    summary.name = name
  }

  return summary
}

function extractOpenAIReasoningInfo(payload) {
  const effort = normalizeNonEmptyString(payload?.reasoning?.effort)
  if (effort) {
    return createReasoningInfo(effort, 'reasoning.effort')
  }

  const rootEffort = normalizeNonEmptyString(payload?.reasoning_effort)
  if (rootEffort) {
    return createReasoningInfo(rootEffort, 'reasoning_effort')
  }

  return createReasoningInfo()
}

function extractAnthropicReasoningInfo(payload) {
  const outputEffort = normalizeNonEmptyString(payload?.output_config?.effort)
  if (outputEffort) {
    return createReasoningInfo(outputEffort, 'output_config.effort')
  }

  const thinking = payload?.thinking

  if (thinking === true) {
    return createReasoningInfo('enabled', 'thinking')
  }

  const thinkingString = normalizeNonEmptyString(thinking)
  if (thinkingString) {
    return createReasoningInfo(thinkingString, 'thinking')
  }

  if (!thinking || typeof thinking !== 'object' || Array.isArray(thinking)) {
    return createReasoningInfo()
  }

  const thinkingType = normalizeNonEmptyString(thinking.type)
  const thinkingEnabled = typeof thinking.enabled === 'boolean' ? thinking.enabled : null
  const thinkingBudget = normalizeInteger(thinking.budget_tokens)

  if (thinkingType === 'disabled' || thinkingType === 'none' || thinkingEnabled === false) {
    return createReasoningInfo('none', 'thinking')
  }

  if (thinkingType && thinkingBudget !== null) {
    return createReasoningInfo(
      `${thinkingType} / ${formatReasoningBudget(thinkingBudget)}`,
      'thinking.type,thinking.budget_tokens'
    )
  }

  if (thinkingType) {
    return createReasoningInfo(thinkingType, 'thinking.type')
  }

  if (thinkingEnabled === true && thinkingBudget !== null) {
    return createReasoningInfo(
      `enabled / ${formatReasoningBudget(thinkingBudget)}`,
      'thinking.enabled,thinking.budget_tokens'
    )
  }

  if (thinkingEnabled === true) {
    return createReasoningInfo('enabled', 'thinking.enabled')
  }

  if (thinkingBudget !== null) {
    return createReasoningInfo(formatReasoningBudget(thinkingBudget), 'thinking.budget_tokens')
  }

  return createReasoningInfo()
}

function extractGeminiReasoningInfo(payload) {
  const thinkingConfig = payload?.generationConfig?.thinkingConfig
  if (!thinkingConfig || typeof thinkingConfig !== 'object' || Array.isArray(thinkingConfig)) {
    return createReasoningInfo()
  }

  const thinkingLevel = normalizeNonEmptyString(
    thinkingConfig.thinkingLevel || thinkingConfig.thinking_level
  )
  if (thinkingLevel) {
    return createReasoningInfo(thinkingLevel, 'generationConfig.thinkingConfig.thinkingLevel')
  }

  const thinkingBudget = normalizeInteger(
    thinkingConfig.thinkingBudget ?? thinkingConfig.thinking_budget
  )
  if (thinkingBudget === -1) {
    return createReasoningInfo('dynamic', 'generationConfig.thinkingConfig.thinkingBudget')
  }

  if (thinkingBudget === 0) {
    return createReasoningInfo('none', 'generationConfig.thinkingConfig.thinkingBudget')
  }

  if (thinkingBudget !== null) {
    return createReasoningInfo(
      formatReasoningBudget(thinkingBudget),
      'generationConfig.thinkingConfig.thinkingBudget'
    )
  }

  if (thinkingConfig.includeThoughts === false || thinkingConfig.include_thoughts === false) {
    return createReasoningInfo('none', 'generationConfig.thinkingConfig.includeThoughts')
  }

  return createReasoningInfo()
}

function extractRequestReasoningInfo(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return createReasoningInfo()
  }

  const extractors = [
    extractOpenAIReasoningInfo,
    extractAnthropicReasoningInfo,
    extractGeminiReasoningInfo
  ]

  for (const extractor of extractors) {
    const result = extractor(payload)
    if (result.reasoningDisplay) {
      return result
    }
  }

  return createReasoningInfo()
}

function parsePreviewJson(preview) {
  if (typeof preview !== 'string' || !preview) {
    return null
  }

  const directCandidate = preview.trim()
  try {
    return JSON.parse(directCandidate)
  } catch (error) {
    // fall through to suffix stripping below
  }

  const suffixMatch = directCandidate.match(PREVIEW_TRUNCATION_SUFFIX_PATTERN)
  if (!suffixMatch) {
    return null
  }

  const withoutSuffix = directCandidate.slice(0, -suffixMatch[0].length)
  try {
    return JSON.parse(withoutSuffix)
  } catch (error) {
    return null
  }
}

function extractPreviewReasoningInfo(preview) {
  if (typeof preview !== 'string' || !preview) {
    return createReasoningInfo()
  }

  const parsed = parsePreviewJson(preview)
  if (parsed) {
    return extractRequestReasoningInfo(parsed)
  }

  const openAIEffort = preview.match(/"reasoning"\s*:\s*\{[\s\S]{0,240}?"effort"\s*:\s*"([^"]+)"/)
  if (openAIEffort?.[1]) {
    return createReasoningInfo(openAIEffort[1], 'reasoning.effort')
  }

  const legacyOpenAIEffort = preview.match(/"reasoning_effort"\s*:\s*"([^"]+)"/)
  if (legacyOpenAIEffort?.[1]) {
    return createReasoningInfo(legacyOpenAIEffort[1], 'reasoning_effort')
  }

  const anthropicOutputEffort = preview.match(
    /"output_config"\s*:\s*\{[\s\S]{0,240}?"effort"\s*:\s*"([^"]+)"/
  )
  if (anthropicOutputEffort?.[1]) {
    return createReasoningInfo(anthropicOutputEffort[1], 'output_config.effort')
  }

  const thinkingSegmentIndex = preview.indexOf('"thinking"')
  if (thinkingSegmentIndex >= 0) {
    const thinkingSegment = preview.slice(thinkingSegmentIndex, thinkingSegmentIndex + 320)
    const thinkingType = thinkingSegment.match(/"type"\s*:\s*"([^"]+)"/)?.[1] || null
    const thinkingBudget = thinkingSegment.match(/"budget_tokens"\s*:\s*(-?\d+)/)?.[1] || null

    if (thinkingType && thinkingBudget !== null) {
      return createReasoningInfo(
        `${thinkingType} / ${formatReasoningBudget(Number(thinkingBudget))}`,
        'thinking.type,thinking.budget_tokens'
      )
    }
    if (thinkingType) {
      return createReasoningInfo(thinkingType, 'thinking.type')
    }
    if (thinkingBudget !== null) {
      return createReasoningInfo(
        formatReasoningBudget(Number(thinkingBudget)),
        'thinking.budget_tokens'
      )
    }
  }

  const geminiSegmentIndex = preview.indexOf('"thinkingConfig"')
  if (geminiSegmentIndex >= 0) {
    const geminiSegment = preview.slice(geminiSegmentIndex, geminiSegmentIndex + 320)
    const thinkingLevel = geminiSegment.match(/"thinkingLevel"\s*:\s*"([^"]+)"/)?.[1] || null
    const thinkingBudget = geminiSegment.match(/"thinkingBudget"\s*:\s*(-?\d+)/)?.[1] || null

    if (thinkingLevel) {
      return createReasoningInfo(thinkingLevel, 'generationConfig.thinkingConfig.thinkingLevel')
    }
    if (thinkingBudget !== null) {
      const budgetValue = Number(thinkingBudget)
      const display =
        budgetValue === -1
          ? 'dynamic'
          : budgetValue === 0
            ? 'none'
            : formatReasoningBudget(budgetValue)
      return createReasoningInfo(display, 'generationConfig.thinkingConfig.thinkingBudget')
    }
  }

  return createReasoningInfo()
}

function resolveRequestDetailReasoning(detail = {}) {
  const storedDisplay = normalizeNonEmptyString(detail.reasoningDisplay)
  const storedSource = normalizeNonEmptyString(detail.reasoningSource)
  if (storedDisplay) {
    return createReasoningInfo(storedDisplay, storedSource)
  }

  const snapshot = detail.requestBodySnapshot
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    if (typeof snapshot.preview === 'string') {
      const previewResult = extractPreviewReasoningInfo(snapshot.preview)
      if (previewResult.reasoningDisplay) {
        return previewResult
      }
    }

    return extractRequestReasoningInfo(snapshot)
  }

  return createReasoningInfo()
}

function sanitizeValue(value, ctx) {
  const {
    keyPath = '',
    seen,
    depth = 0,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxArrayItems = DEFAULT_MAX_ARRAY_ITEMS,
    maxStringChars = DEFAULT_MAX_STRING_CHARS
  } = ctx

  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(keyPath)) {
      return maskSensitiveValue(value)
    }
    return truncateString(value, maxStringChars)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return '[Function]'
  }

  if (depth >= maxDepth) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`
    }
    return '[Object]'
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]'
    }
    seen.add(value)

    if (Array.isArray(value)) {
      const result = value.slice(0, maxArrayItems).map((item, index) =>
        sanitizeValue(item, {
          ...ctx,
          keyPath: `${keyPath}[${index}]`,
          depth: depth + 1
        })
      )

      if (value.length > maxArrayItems) {
        result.push(`...[${value.length - maxArrayItems} more items]`)
      }

      return result
    }

    const result = {}
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = keyPath ? `${keyPath}.${key}` : key
      if (key === ENCRYPTED_CONTENT_KEY) {
        result[key] = createOmittedValue(childValue)
        continue
      }

      if (key === TOOLS_KEY) {
        if (Array.isArray(childValue)) {
          result[key] = childValue.slice(0, maxArrayItems).map((item) => summarizeToolEntry(item))

          if (childValue.length > maxArrayItems) {
            result[key].push(`...[${childValue.length - maxArrayItems} more items]`)
          }
        } else if (childValue && typeof childValue === 'object') {
          result[key] = summarizeToolEntry(childValue)
        } else {
          result[key] = sanitizeValue(childValue, {
            ...ctx,
            keyPath: childPath,
            depth: depth + 1
          })
        }
        continue
      }

      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = maskSensitiveValue(childValue)
        continue
      }

      result[key] = sanitizeValue(childValue, {
        ...ctx,
        keyPath: childPath,
        depth: depth + 1
      })
    }

    return result
  }

  return String(value)
}

function enforceTotalSize(snapshot, maxTotalChars = DEFAULT_MAX_TOTAL_CHARS) {
  let json = ''
  try {
    json = JSON.stringify(snapshot)
  } catch (error) {
    return {
      error: 'snapshot_stringify_failed',
      message: error?.message || String(error)
    }
  }

  if (json.length <= maxTotalChars) {
    return snapshot
  }

  return {
    summary: 'request body snapshot truncated',
    originalChars: json.length,
    maxChars: maxTotalChars,
    preview: truncateString(json, maxTotalChars)
  }
}

function sanitizeRequestBodySnapshot(body, options = {}) {
  if (body === undefined) {
    return null
  }

  const seen = new WeakSet()
  const sanitized = sanitizeValue(body, {
    seen,
    maxDepth: options.maxDepth || DEFAULT_MAX_DEPTH,
    maxArrayItems: options.maxArrayItems || DEFAULT_MAX_ARRAY_ITEMS,
    maxStringChars: options.maxStringChars || DEFAULT_MAX_STRING_CHARS,
    keyPath: '',
    depth: 0
  })

  return enforceTotalSize(sanitized, options.maxTotalChars || DEFAULT_MAX_TOTAL_CHARS)
}

function getRequestEndpoint(req) {
  if (!req) {
    return null
  }

  const originalUrl = req.originalUrl || req.url || req.path || null
  if (!originalUrl) {
    return null
  }

  const queryIndex = originalUrl.indexOf('?')
  return queryIndex >= 0 ? originalUrl.slice(0, queryIndex) : originalUrl
}

function getHeaderValue(req, names = []) {
  for (const name of names) {
    if (typeof req?.get === 'function') {
      const value = normalizeNonEmptyString(req.get(name))
      if (value) {
        return value
      }
    }

    const lowerName = name.toLowerCase()
    const value = normalizeNonEmptyString(req?.headers?.[name] || req?.headers?.[lowerName])
    if (value) {
      return value
    }
  }

  return null
}

function getPathValue(source, path) {
  if (!source || typeof source !== 'object') {
    return null
  }

  let cursor = source
  for (const segment of path.split('.')) {
    if (!cursor || typeof cursor !== 'object') {
      return null
    }
    cursor = cursor[segment]
  }

  return normalizeNonEmptyString(cursor)
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function firstBodyPathValue(body, paths = []) {
  for (const path of paths) {
    const value = getPathValue(body, path)
    if (value) {
      return value
    }
  }

  return null
}

function hashRequestDetailIdentifier(value) {
  const normalized = normalizeNonEmptyString(value)
  if (!normalized) {
    return null
  }

  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function extractClientIp(req, overrides = {}) {
  const forwardedFor = getHeaderValue(req, ['x-forwarded-for'])
  const forwardedIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() : null

  return firstNonEmptyString(
    overrides.clientIp,
    req?.ip,
    forwardedIp,
    getHeaderValue(req, ['x-real-ip', 'cf-connecting-ip', 'x-client-ip']),
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress
  )
}

function inferRequestSource(req, endpoint, overrides = {}) {
  const explicitSource = firstNonEmptyString(
    overrides.requestSource,
    req?.requestSource,
    getHeaderValue(req, [
      'x-request-source',
      'x-client-name',
      'x-client-version',
      'anthropic-client-name'
    ])
  )
  if (explicitSource) {
    return explicitSource
  }

  if (endpoint?.startsWith('/droid/')) {
    return 'droid'
  }
  if (endpoint?.startsWith('/azure/')) {
    return 'azure-openai'
  }
  if (endpoint?.startsWith('/openai/')) {
    return 'openai'
  }
  if (endpoint?.startsWith('/gemini') || endpoint?.startsWith('/v1beta/models')) {
    return 'gemini'
  }
  if (endpoint?.startsWith('/api/') || endpoint === '/api') {
    return 'claude'
  }

  return null
}

function extractRequestAnalysisFields(req, requestBody, endpoint, overrides = {}) {
  const metadataUserId = firstNonEmptyString(
    overrides.metadataUserId,
    req?.metadataUserId,
    firstBodyPathValue(requestBody, [
      'metadata.user_id',
      'metadata.userId',
      'metadata.uid',
      'user_id',
      'userId',
      'user'
    ])
  )
  const sessionId = firstNonEmptyString(
    overrides.sessionId,
    req?.sessionId,
    getHeaderValue(req, [
      'x-session-id',
      'session-id',
      'x-codex-session-id',
      'x-droid-session-id',
      'x-ms-client-request-id'
    ]),
    firstBodyPathValue(requestBody, [
      'session_id',
      'sessionId',
      'metadata.session_id',
      'metadata.sessionId',
      'metadata.codex_session_id',
      'metadata.codexSessionId'
    ]),
    metadataUserIdHelper.extractSessionId(metadataUserId)
  )
  const conversationId = firstNonEmptyString(
    overrides.conversationId,
    req?.conversationId,
    getHeaderValue(req, ['x-conversation-id', 'conversation-id', 'x-thread-id']),
    firstBodyPathValue(requestBody, [
      'conversation_id',
      'conversationId',
      'thread_id',
      'threadId',
      'metadata.conversation_id',
      'metadata.conversationId',
      'metadata.thread_id',
      'metadata.threadId'
    ])
  )
  const promptCacheKey = firstNonEmptyString(
    overrides.promptCacheKey,
    getHeaderValue(req, ['x-prompt-cache-key', 'prompt-cache-key']),
    firstBodyPathValue(requestBody, [
      'prompt_cache_key',
      'promptCacheKey',
      'metadata.prompt_cache_key',
      'metadata.promptCacheKey'
    ])
  )
  const serviceTier = firstNonEmptyString(
    overrides.serviceTier,
    getHeaderValue(req, ['openai-service-tier', 'x-service-tier', 'service-tier']),
    firstBodyPathValue(requestBody, ['service_tier', 'serviceTier'])
  )

  return {
    sessionId,
    sessionHash: firstNonEmptyString(overrides.sessionHash, hashRequestDetailIdentifier(sessionId)),
    conversationId,
    promptCacheKey,
    metadataUserId,
    serviceTier,
    clientIp: extractClientIp(req, overrides),
    userAgent: firstNonEmptyString(overrides.userAgent, getHeaderValue(req, ['user-agent'])),
    requestSource: inferRequestSource(req, endpoint, overrides)
  }
}

function toTimestampMs(value) {
  const numericValue = toFiniteNumber(value)
  if (numericValue !== null) {
    return numericValue
  }

  if (value instanceof Date) {
    const dateValue = value.getTime()
    return Number.isFinite(dateValue) ? dateValue : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIsoStringFromTimestamp(value) {
  const timestampMs = toTimestampMs(value)
  return timestampMs !== null ? new Date(timestampMs).toISOString() : null
}

function computeElapsedMs(startMs, endMs) {
  if (startMs === null || endMs === null) {
    return null
  }

  return Math.max(0, endMs - startMs)
}

function normalizeTimingMs(value) {
  const num = toFiniteNumber(value)
  return num === null ? null : Math.max(0, Math.trunc(num))
}

const RESPONSE_PAYLOAD_META_KEYS = [
  'responseHeaders',
  'responseBody',
  'responseBodySnapshot',
  'responseTextPreview',
  'responseBodySizeBytes',
  'responseBodyTruncated',
  'upstreamResponseId',
  'finishReason',
  'errorBody',
  'responseMetadata'
]
const RESPONSE_BODY_META_KEYS = new Set([
  'responseBody',
  'responseBodySnapshot',
  'responseTextPreview',
  'responseBodySizeBytes',
  'responseBodyTruncated'
])

function isRecordObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function buildResponsePayloadMeta(req, overrides = {}) {
  const responsePayloadMeta = {}
  const captureMeta =
    typeof req?.responsePayloadCapture?.toRequestDetailMeta === 'function'
      ? req.responsePayloadCapture.toRequestDetailMeta()
      : null

  if (isRecordObject(captureMeta)) {
    Object.assign(responsePayloadMeta, captureMeta)
  }

  if (isRecordObject(overrides.responsePayload)) {
    Object.assign(responsePayloadMeta, overrides.responsePayload)
  }

  const explicitResponseBody =
    Object.prototype.hasOwnProperty.call(overrides, 'responseBodySnapshot') ||
    Object.prototype.hasOwnProperty.call(overrides, 'responseBody')
  if (explicitResponseBody) {
    const responseBody = Object.prototype.hasOwnProperty.call(overrides, 'responseBodySnapshot')
      ? overrides.responseBodySnapshot
      : overrides.responseBody
    Object.assign(
      responsePayloadMeta,
      createResponsePayloadMetaFromBody(responseBody, config.responsePayloadCapture)
    )
  }

  for (const key of RESPONSE_PAYLOAD_META_KEYS) {
    if (explicitResponseBody && RESPONSE_BODY_META_KEYS.has(key)) {
      continue
    }
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      responsePayloadMeta[key] = overrides[key]
    }
  }

  return responsePayloadMeta
}

function createRequestDetailMeta(req, overrides = {}) {
  const nowMs = Date.now()
  const statusCode = toFiniteNumber(overrides.statusCode)
  const durationMs = toFiniteNumber(overrides.durationMs)
  const requestStartedAt = toFiniteNumber(overrides.requestStartedAt)
  const reqStartedAt = toFiniteNumber(req?.requestStartedAt)
  const effectiveStart = requestStartedAt ?? reqStartedAt
  const firstByteAt =
    toTimestampMs(overrides.firstByteAt) ?? toTimestampMs(req?.requestTiming?.firstByteAt)
  const firstTokenAt =
    toTimestampMs(overrides.firstTokenAt) ?? toTimestampMs(req?.requestTiming?.firstTokenAt)
  const responseCompletedAt =
    toTimestampMs(overrides.responseCompletedAt) ??
    toTimestampMs(req?.requestTiming?.responseCompletedAt)
  const durationEndMs = responseCompletedAt ?? nowMs
  const effectiveDurationMs =
    durationMs ?? (effectiveStart ? Math.max(0, durationEndMs - effectiveStart) : null)
  const timeToFirstByteMs =
    normalizeTimingMs(overrides.timeToFirstByteMs) ?? computeElapsedMs(effectiveStart, firstByteAt)
  const timeToFirstTokenMs =
    normalizeTimingMs(overrides.timeToFirstTokenMs) ??
    computeElapsedMs(effectiveStart, firstTokenAt)
  const contentGenerationMs =
    normalizeTimingMs(overrides.contentGenerationMs) ??
    (effectiveDurationMs !== null && timeToFirstTokenMs !== null
      ? Math.max(0, effectiveDurationMs - timeToFirstTokenMs)
      : null)
  const requestBody = overrides.requestBody !== undefined ? overrides.requestBody : req?.body
  const endpoint = overrides.endpoint || getRequestEndpoint(req)
  const analysisFields = extractRequestAnalysisFields(req, requestBody, endpoint, overrides)
  const responsePayloadFields = buildResponsePayloadMeta(req, overrides)

  return {
    requestId: overrides.requestId || req?.requestId || null,
    endpoint,
    method: overrides.method || req?.method || null,
    statusCode: statusCode ?? req?.res?.statusCode ?? 200,
    stream:
      typeof overrides.stream === 'boolean'
        ? overrides.stream
        : Boolean(requestBody && requestBody.stream === true),
    durationMs: effectiveDurationMs,
    requestStartedAt: effectiveStart ? new Date(effectiveStart).toISOString() : null,
    firstByteAt: toIsoStringFromTimestamp(firstByteAt),
    firstTokenAt: toIsoStringFromTimestamp(firstTokenAt),
    responseCompletedAt: toIsoStringFromTimestamp(responseCompletedAt),
    timeToFirstByteMs,
    timeToFirstTokenMs,
    contentGenerationMs,
    requestBody,
    ...responsePayloadFields,
    ...analysisFields,
    metadata: overrides.metadata || null
  }
}

function finalizeRequestDetailMeta(requestMeta = null) {
  if (!requestMeta || typeof requestMeta !== 'object') {
    return null
  }

  const requestStartedAtMs = toTimestampMs(requestMeta.requestStartedAt)
  const firstByteAt = toTimestampMs(requestMeta.firstByteAt)
  const firstTokenAt = toTimestampMs(requestMeta.firstTokenAt)
  const responseCompletedAt = toTimestampMs(requestMeta.responseCompletedAt) ?? Date.now()
  const durationMs =
    requestStartedAtMs !== null
      ? Math.max(0, responseCompletedAt - requestStartedAtMs)
      : toFiniteNumber(requestMeta.durationMs)
  const timeToFirstByteMs =
    normalizeTimingMs(requestMeta.timeToFirstByteMs) ??
    computeElapsedMs(requestStartedAtMs, firstByteAt)
  const timeToFirstTokenMs =
    normalizeTimingMs(requestMeta.timeToFirstTokenMs) ??
    computeElapsedMs(requestStartedAtMs, firstTokenAt)
  const contentGenerationMs =
    normalizeTimingMs(requestMeta.contentGenerationMs) ??
    (durationMs !== null && timeToFirstTokenMs !== null
      ? Math.max(0, durationMs - timeToFirstTokenMs)
      : null)

  return {
    ...requestMeta,
    responseCompletedAt: toIsoStringFromTimestamp(responseCompletedAt),
    timeToFirstByteMs,
    timeToFirstTokenMs,
    contentGenerationMs,
    durationMs
  }
}

function extractOpenAICacheReadTokens(usage = {}) {
  if (!usage || typeof usage !== 'object') {
    return 0
  }

  const candidates = [
    usage.input_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cached_token,
    usage.prompt_tokens_details?.cached_tokens,
    usage.prompt_tokens_details?.cached_token
  ]

  for (const value of candidates) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed)
    }
  }

  return 0
}

function isOpenAIRelatedEndpoint(endpoint) {
  if (typeof endpoint !== 'string') {
    return false
  }

  if (endpoint.startsWith('/azure/') || endpoint.startsWith('/droid/openai/')) {
    return true
  }

  if (!endpoint.startsWith('/openai/')) {
    return false
  }

  return !(
    endpoint === '/openai/claude' ||
    endpoint === '/openai/gemini' ||
    endpoint.startsWith('/openai/claude/') ||
    endpoint.startsWith('/openai/gemini/')
  )
}

function getRequestDetailCacheMetrics(detail = {}) {
  const read = Math.max(0, Number(detail.cacheReadTokens) || 0)
  const create = Math.max(0, Number(detail.cacheCreateTokens) || 0)
  const input = Math.max(0, Number(detail.inputTokens) || 0)
  const isOpenAIRelated =
    OPENAI_RELATED_ACCOUNT_TYPES.has(detail.accountType) || isOpenAIRelatedEndpoint(detail.endpoint)
  const denominator = input + read + create

  if (denominator <= 0) {
    return {
      isOpenAIRelated,
      cacheCreateNotApplicable: isOpenAIRelated,
      numerator: read,
      denominator: 0,
      formula: CACHE_HIT_FORMULA,
      cacheHitFormula: CACHE_HIT_FORMULA,
      rate: 0
    }
  }

  return {
    isOpenAIRelated,
    cacheCreateNotApplicable: isOpenAIRelated,
    numerator: read,
    denominator,
    formula: CACHE_HIT_FORMULA,
    cacheHitFormula: CACHE_HIT_FORMULA,
    rate: Number(((read / denominator) * 100).toFixed(2))
  }
}

function calculateCacheHitRate(
  cacheReadTokensOrDetail = 0,
  cacheCreateTokens = 0,
  inputTokens = 0
) {
  if (typeof cacheReadTokensOrDetail === 'object' && cacheReadTokensOrDetail !== null) {
    return getRequestDetailCacheMetrics(cacheReadTokensOrDetail).rate
  }

  const read = Math.max(0, Number(cacheReadTokensOrDetail) || 0)
  const create = Math.max(0, Number(cacheCreateTokens) || 0)
  const input = Math.max(0, Number(inputTokens) || 0)
  const denominator = input + read + create

  if (denominator <= 0) {
    return 0
  }

  return Number(((read / denominator) * 100).toFixed(2))
}

module.exports = {
  sanitizeRequestBodySnapshot,
  extractRequestReasoningInfo,
  resolveRequestDetailReasoning,
  createRequestDetailMeta,
  finalizeRequestDetailMeta,
  extractOpenAICacheReadTokens,
  isOpenAIRelatedEndpoint,
  hashRequestDetailIdentifier,
  CACHE_HIT_FORMULA,
  getRequestDetailCacheMetrics,
  calculateCacheHitRate
}
