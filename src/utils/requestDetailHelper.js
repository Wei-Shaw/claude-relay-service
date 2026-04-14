const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy-authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|cookie|set-cookie|client_secret|private[_-]?key|proxy)/i
const DEFAULT_MAX_STRING_CHARS = 80
const DEFAULT_MAX_ARRAY_ITEMS = 24
const DEFAULT_MAX_DEPTH = 6
const DEFAULT_MAX_TOTAL_CHARS = 12000
const ENCRYPTED_CONTENT_KEY = 'encrypted_content'
const TOOLS_KEY = 'tools'
const PREVIEW_TRUNCATION_SUFFIX_PATTERN = /\.\.\.\[(?:truncated )?(\d+) chars\]$/
const OPENAI_RELATED_ACCOUNT_TYPES = new Set(['openai', 'openai-responses', 'azure-openai'])

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

function createRequestDetailMeta(req, overrides = {}) {
  const nowMs = Date.now()
  const statusCode = toFiniteNumber(overrides.statusCode)
  const durationMs = toFiniteNumber(overrides.durationMs)
  const requestStartedAt = toFiniteNumber(overrides.requestStartedAt)
  const reqStartedAt = toFiniteNumber(req?.requestStartedAt)
  const effectiveStart = requestStartedAt ?? reqStartedAt
  const requestBody = overrides.requestBody !== undefined ? overrides.requestBody : req?.body

  return {
    requestId: overrides.requestId || req?.requestId || null,
    endpoint: overrides.endpoint || getRequestEndpoint(req),
    method: overrides.method || req?.method || null,
    statusCode: statusCode ?? req?.res?.statusCode ?? 200,
    stream:
      typeof overrides.stream === 'boolean'
        ? overrides.stream
        : Boolean(requestBody && requestBody.stream === true),
    durationMs: durationMs ?? (effectiveStart ? Math.max(0, nowMs - effectiveStart) : null),
    requestStartedAt: effectiveStart ? new Date(effectiveStart).toISOString() : null,
    requestBody
  }
}

function finalizeRequestDetailMeta(requestMeta = null) {
  if (!requestMeta || typeof requestMeta !== 'object') {
    return null
  }

  const requestStartedAtMs = toTimestampMs(requestMeta.requestStartedAt)
  const durationMs =
    requestStartedAtMs !== null
      ? Math.max(0, Date.now() - requestStartedAtMs)
      : toFiniteNumber(requestMeta.durationMs)

  return {
    ...requestMeta,
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
  const denominator = isOpenAIRelated ? input + read : read + create

  if (denominator <= 0) {
    return {
      isOpenAIRelated,
      cacheCreateNotApplicable: isOpenAIRelated,
      numerator: read,
      denominator: 0,
      rate: 0
    }
  }

  return {
    isOpenAIRelated,
    cacheCreateNotApplicable: isOpenAIRelated,
    numerator: read,
    denominator,
    rate: Number(((read / denominator) * 100).toFixed(2))
  }
}

function calculateCacheHitRate(cacheReadTokensOrDetail = 0, cacheCreateTokens = 0) {
  if (typeof cacheReadTokensOrDetail === 'object' && cacheReadTokensOrDetail !== null) {
    return getRequestDetailCacheMetrics(cacheReadTokensOrDetail).rate
  }

  const read = Math.max(0, Number(cacheReadTokensOrDetail) || 0)
  const create = Math.max(0, Number(cacheCreateTokens) || 0)
  const denominator = read + create

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
  getRequestDetailCacheMetrics,
  calculateCacheHitRate
}
