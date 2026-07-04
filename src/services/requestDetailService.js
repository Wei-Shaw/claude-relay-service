const redis = require('../models/redis')
const logger = require('../utils/logger')
const claudeRelayConfigService = require('./claudeRelayConfigService')
const claudeAccountService = require('./account/claudeAccountService')
const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
const ccrAccountService = require('./account/ccrAccountService')
const geminiAccountService = require('./account/geminiAccountService')
const geminiApiAccountService = require('./account/geminiApiAccountService')
const openaiAccountService = require('./account/openaiAccountService')
const openaiResponsesAccountService = require('./account/openaiResponsesAccountService')
const azureOpenaiAccountService = require('./account/azureOpenaiAccountService')
const droidAccountService = require('./account/droidAccountService')
const bedrockAccountService = require('./account/bedrockAccountService')
const CostCalculator = require('../utils/costCalculator')
const { sanitizeErrorMessage } = require('../utils/errorSanitizer')
const {
  sanitizeRequestBodySnapshot,
  getRequestDetailCacheMetrics,
  extractRequestReasoningInfo,
  resolveRequestDetailReasoning,
  CACHE_HIT_FORMULA
} = require('../utils/requestDetailHelper')

const REQUEST_DETAIL_ITEM_PREFIX = 'request_detail:item:'
const REQUEST_DETAIL_DAY_INDEX_PREFIX = 'request_detail:index:day:'
const REQUEST_DETAIL_QUERY_SNAPSHOT_PREFIX = 'request_detail:query_snapshot:'
const DEFAULT_RETENTION_HOURS = 6
const MAX_RETENTION_HOURS = 30 * 24
const REQUEST_DETAIL_QUERY_BATCH_SIZE = 200
const REQUEST_DETAIL_SCAN_BATCH_SIZE = 200
const REQUEST_DETAIL_QUERY_SNAPSHOT_TTL_SECONDS = 30
const MAX_REQUEST_DETAIL_SNAPSHOT_POINTERS = 25000
const MAX_REQUEST_DETAIL_SNAPSHOT_BYTES = 2 * 1024 * 1024
const SLA_LATENCY_BUCKETS_MS = [500, 1000, 2000, 5000, 10000, 30000]
const SLA_TOP_GROUP_LIMIT = 8

const OUTCOME_LABELS = {
  success: '成功',
  client_error: '客户端错误',
  server_error: '系统错误',
  upstream_error: '上游错误',
  timeout: '超时',
  rate_limited: '限流',
  auth_error: '认证失败',
  quota_exceeded: '额度不足',
  client_aborted: '客户端中断',
  incomplete: '未完成',
  unknown: '未知'
}

const FAILURE_STAGE_LABELS = {
  none: '无',
  auth: '认证',
  permission: '权限',
  quota: '额度',
  rate_limit: '限流',
  queue: '排队',
  routing: '路由',
  upstream: '上游',
  streaming: '流式传输',
  billing: '计费',
  internal: '内部',
  client_abort: '客户端中断',
  not_found: '未命中路由',
  request: '请求格式',
  unknown: '未知'
}

const SLA_ROUTE_PREFIXES = [
  '/api',
  '/claude',
  '/antigravity/api',
  '/gemini-cli/api',
  '/gemini',
  '/openai',
  '/droid',
  '/azure'
]

const SLA_EXCLUDED_PREFIXES = [
  '/admin',
  '/admin-next',
  '/web',
  '/users',
  '/apistats',
  '/health',
  '/metrics',
  '/'
]

const accountTypeNames = {
  claude: 'Claude官方',
  'claude-official': 'Claude官方',
  'claude-console': 'Claude Console',
  ccr: 'Claude Console Relay',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  'azure-openai': 'Azure OpenAI',
  gemini: 'Gemini',
  'gemini-api': 'Gemini API',
  droid: 'Droid',
  bedrock: 'AWS Bedrock',
  unknown: '未知渠道'
}

const accountServices = {
  claude: claudeAccountService,
  'claude-console': claudeConsoleAccountService,
  ccr: ccrAccountService,
  openai: openaiAccountService,
  'openai-responses': openaiResponsesAccountService,
  'azure-openai': azureOpenaiAccountService,
  gemini: geminiAccountService,
  'gemini-api': geminiApiAccountService,
  droid: droidAccountService,
  bedrock: bedrockAccountService
}

function clampRetentionHours(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETENTION_HOURS
  }
  return Math.min(Math.max(parsed, 1), MAX_RETENTION_HOURS)
}

function normalizeNumber(value, digits = null) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }

  if (digits === null) {
    return num
  }

  return Number(num.toFixed(digits))
}

function normalizeTokenValue(value) {
  return Math.max(0, Math.trunc(normalizeNumber(value)))
}

function clampErrorMessage(value) {
  if (typeof value !== 'string') {
    return null
  }

  const sanitized = sanitizeErrorMessage(value)
  if (!sanitized) {
    return null
  }

  return sanitized.length > 240 ? `${sanitized.slice(0, 240)}...` : sanitized
}

function normalizeStatusClass(statusCode) {
  const status = normalizeNumber(statusCode)
  if (status <= 0) {
    return 'unknown'
  }
  if (status >= 500) {
    return '5xx'
  }
  if (status >= 400) {
    return '4xx'
  }
  if (status >= 300) {
    return '3xx'
  }
  if (status >= 200) {
    return '2xx'
  }
  return 'other'
}

function normalizeEndpointPath(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return '/'
  }

  const [pathPart] = endpoint.split('?')
  const collapsed = pathPart.toLowerCase().replace(/\/{2,}/g, '/')
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1)
  }
  return collapsed || '/'
}

function isRelayEndpoint(endpoint) {
  const path = normalizeEndpointPath(endpoint)
  if (!path || path === '/') {
    return false
  }

  if (SLA_EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false
  }

  return SLA_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function inferFailureStage(detail = {}, statusCode = 0, outcome = 'unknown') {
  if (detail.failureStage) {
    return detail.failureStage
  }

  if (detail.clientAborted || outcome === 'client_aborted') {
    return 'client_abort'
  }

  if (statusCode === 401) {
    return 'auth'
  }

  if (statusCode === 403) {
    return 'permission'
  }

  if (statusCode === 402) {
    return 'quota'
  }

  if (statusCode === 408 || statusCode === 504 || outcome === 'timeout') {
    return 'upstream'
  }

  if (statusCode === 429 || statusCode === 529) {
    return 'rate_limit'
  }

  if (statusCode === 404) {
    return 'not_found'
  }

  if (statusCode >= 500) {
    if (
      detail.upstreamStatus ||
      detail.accountId ||
      detail.accountType ||
      /upstream|gateway|timeout/i.test(
        detail.errorType || detail.errorCode || detail.errorMessage || ''
      )
    ) {
      return 'upstream'
    }
    return 'internal'
  }

  if (statusCode >= 400) {
    return 'request'
  }

  return 'none'
}

function inferOutcome(detail = {}, statusCode = 0) {
  if (detail.outcome) {
    return detail.outcome
  }

  if (detail.clientAborted) {
    return 'client_aborted'
  }

  if (statusCode === 0 && detail.completed === false) {
    return 'incomplete'
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'auth_error'
  }

  if (statusCode === 402) {
    return 'quota_exceeded'
  }

  if (statusCode === 408 || statusCode === 504) {
    return 'timeout'
  }

  if (statusCode === 429 || statusCode === 529) {
    return 'rate_limited'
  }

  if (statusCode >= 500) {
    const stage = inferFailureStage(detail, statusCode, 'server_error')
    return stage === 'upstream' ? 'upstream_error' : 'server_error'
  }

  if (statusCode >= 400) {
    return 'client_error'
  }

  if (statusCode >= 200 && statusCode < 400) {
    return 'success'
  }

  return 'unknown'
}

function isSlaEligibleRecord(record = {}) {
  if (record.isSlaEligible === true || record.slaEligible === true) {
    return true
  }
  if (record.isSlaEligible === false || record.slaEligible === false) {
    return false
  }

  if (!isRelayEndpoint(record.endpoint)) {
    return false
  }

  const status = normalizeNumber(record.statusCode)
  const stage = record.failureStage || inferFailureStage(record, status, record.outcome)
  const outcome = record.outcome || inferOutcome(record, status)

  if (stage === 'auth' || stage === 'permission' || stage === 'quota' || stage === 'not_found') {
    return false
  }

  if (outcome === 'auth_error' || outcome === 'quota_exceeded') {
    return false
  }

  return true
}

function isSlaFailureRecord(record = {}) {
  if (!isSlaEligibleRecord(record)) {
    return false
  }

  const status = normalizeNumber(record.statusCode)
  const outcome = record.outcome || inferOutcome(record, status)
  const stage = record.failureStage || inferFailureStage(record, status, outcome)

  if (outcome === 'success') {
    return false
  }

  if (
    outcome === 'server_error' ||
    outcome === 'upstream_error' ||
    outcome === 'timeout' ||
    outcome === 'incomplete'
  ) {
    return true
  }

  if (outcome === 'client_aborted') {
    return stage === 'streaming' || Boolean(record.upstreamStatus)
  }

  return status >= 500
}

function normalizeRequestResultFields(detail = {}, normalized = {}) {
  const statusCode = normalizeNumber(normalized.statusCode ?? detail.statusCode)
  const completed = detail.completed !== false
  const clientAborted = detail.clientAborted === true || detail.aborted === true
  const outcome = inferOutcome({ ...detail, completed, clientAborted }, statusCode)
  const failureStage = inferFailureStage(
    { ...detail, completed, clientAborted },
    statusCode,
    outcome
  )
  const errorMessage =
    clampErrorMessage(detail.errorMessageSafe) ||
    clampErrorMessage(detail.errorMessage) ||
    clampErrorMessage(detail.message) ||
    null

  const result = {
    completed,
    clientAborted,
    outcome,
    outcomeName: OUTCOME_LABELS[outcome] || OUTCOME_LABELS.unknown,
    statusClass: normalizeStatusClass(statusCode),
    failureStage,
    failureStageName: FAILURE_STAGE_LABELS[failureStage] || FAILURE_STAGE_LABELS.unknown,
    errorType: detail.errorType || null,
    errorCode: detail.errorCode || null,
    errorMessage: errorMessage || null,
    upstreamStatus: normalizeNumber(detail.upstreamStatus),
    isSlaEligible: detail.isSlaEligible ?? detail.slaEligible
  }

  result.isSlaEligible = isSlaEligibleRecord({ ...normalized, ...detail, ...result })
  result.isSlaFailure = isSlaFailureRecord({ ...normalized, ...detail, ...result })

  return result
}

function percentile(sortedValues = [], percentileValue = 95) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)]
}

function createLatencyBuckets() {
  return SLA_LATENCY_BUCKETS_MS.map((upperBoundMs, index) => ({
    key:
      index === 0
        ? `le_${upperBoundMs}`
        : `gt_${SLA_LATENCY_BUCKETS_MS[index - 1]}_le_${upperBoundMs}`,
    label:
      index === 0
        ? `<=${upperBoundMs}ms`
        : `${SLA_LATENCY_BUCKETS_MS[index - 1]}-${upperBoundMs}ms`,
    upperBoundMs,
    count: 0
  })).concat([
    {
      key: `gt_${SLA_LATENCY_BUCKETS_MS[SLA_LATENCY_BUCKETS_MS.length - 1]}`,
      label: `>${SLA_LATENCY_BUCKETS_MS[SLA_LATENCY_BUCKETS_MS.length - 1]}ms`,
      upperBoundMs: null,
      count: 0
    }
  ])
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined || value === '') {
    return false
  }
  if (value === 'unknown') {
    return false
  }
  return true
}

function mergeRequestDetailRecords(existing = null, incoming = {}) {
  if (!existing) {
    return {
      ...incoming,
      ...normalizeRequestResultFields(incoming, incoming)
    }
  }

  const merged = {
    ...existing,
    ...incoming
  }

  const existingResult = normalizeRequestResultFields(existing, existing)
  const incomingResult = normalizeRequestResultFields(incoming, incoming)
  const incomingHasExplicitError =
    hasMeaningfulValue(incoming.errorType) ||
    hasMeaningfulValue(incoming.errorCode) ||
    hasMeaningfulValue(incoming.errorMessage) ||
    normalizeNumber(incoming.upstreamStatus) > 0 ||
    incoming.clientAborted === true ||
    incoming.completed === false
  const incomingIsPlainUsageSuccess =
    incomingResult.outcome === 'success' && !incomingHasExplicitError && incoming.statusCode >= 200
  const existingIsExplicitFailure =
    existingResult.isSlaFailure === true ||
    normalizeNumber(existing.statusCode) >= 400 ||
    existing.completed === false ||
    existing.clientAborted === true ||
    hasMeaningfulValue(existing.errorType) ||
    hasMeaningfulValue(existing.errorCode) ||
    hasMeaningfulValue(existing.errorMessage)

  const preferExistingIfIncomingEmpty = [
    'requestId',
    'requestStartedAt',
    'endpoint',
    'method',
    'apiKeyId',
    'accountId',
    'accountType',
    'model',
    'actualModel',
    'requestedModel',
    'displayModel',
    'pricingSource',
    'errorType',
    'errorCode',
    'errorMessage',
    'requestBodySnapshot'
  ]

  for (const field of preferExistingIfIncomingEmpty) {
    if (!hasMeaningfulValue(incoming[field]) && hasMeaningfulValue(existing[field])) {
      merged[field] = existing[field]
    }
  }

  if (
    existingResult.outcome !== 'success' &&
    existingIsExplicitFailure &&
    incomingIsPlainUsageSuccess
  ) {
    Object.assign(merged, {
      statusCode: normalizeNumber(existing.statusCode),
      completed: existing.completed,
      clientAborted: existing.clientAborted,
      outcome: existingResult.outcome,
      outcomeName: existingResult.outcomeName,
      statusClass: existingResult.statusClass,
      failureStage: existingResult.failureStage,
      failureStageName: existingResult.failureStageName,
      errorType: existing.errorType || null,
      errorCode: existing.errorCode || null,
      errorMessage: existing.errorMessage || null,
      upstreamStatus: normalizeNumber(existing.upstreamStatus)
    })
  }

  const usageNumericFields = [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreateTokens',
    'totalTokens',
    'cost',
    'realCost'
  ]

  for (const field of usageNumericFields) {
    if (normalizeNumber(incoming[field]) <= 0 && normalizeNumber(existing[field]) > 0) {
      merged[field] = existing[field]
    }
  }

  const objectFields = ['costBreakdown', 'realCostBreakdown']
  for (const field of objectFields) {
    if (!incoming[field] && existing[field]) {
      merged[field] = existing[field]
    }
  }

  if (existing.usedFallbackPricing === true && incoming.usedFallbackPricing !== true) {
    merged.usedFallbackPricing = true
  }

  if (existing.costRecomputed === true && incoming.costRecomputed !== true) {
    merged.costRecomputed = true
  }

  if (existing.isLongContextRequest === true && incoming.isLongContextRequest !== true) {
    merged.isLongContextRequest = true
  }

  return {
    ...merged,
    ...normalizeRequestResultFields(merged, merged)
  }
}

function extractErrorFieldsFromResponseBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body === 'string') {
    return {
      errorMessage: clampErrorMessage(body)
    }
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return {}
  }

  const errorObject = body.error && typeof body.error === 'object' ? body.error : body
  const errorType = errorObject.type || body.type || null
  const errorCode = errorObject.code || body.code || null
  const errorMessage =
    errorObject.message || body.message || errorObject.error || body.error || body.detail || null
  const upstreamStatus =
    errorObject.upstreamStatus || body.upstreamStatus || errorObject.status || body.status || null

  return {
    errorType: typeof errorType === 'string' ? errorType : null,
    errorCode: errorCode !== null && errorCode !== undefined ? String(errorCode) : null,
    errorMessage: clampErrorMessage(typeof errorMessage === 'string' ? errorMessage : null),
    upstreamStatus: normalizeNumber(upstreamStatus)
  }
}

function buildLifecycleDetail(req = {}, res = {}, options = {}) {
  const endpoint = normalizeEndpointPath(req.originalUrl || req.url || req.path || '')
  const statusCode = normalizeNumber(options.statusCode ?? res.statusCode)
  const responseError = extractErrorFieldsFromResponseBody(res._responseBody)
  const requestBody = req.body && typeof req.body === 'object' ? req.body : undefined
  const model =
    requestBody?.model ||
    requestBody?.modelId ||
    requestBody?.model_id ||
    req.query?.model ||
    'unknown'
  const relayAccountContext =
    req._relayAccountContext && typeof req._relayAccountContext === 'object'
      ? req._relayAccountContext
      : {}

  return {
    requestId: req.requestId || null,
    timestamp: new Date().toISOString(),
    requestStartedAt: req.requestStartedAt ? new Date(req.requestStartedAt).toISOString() : null,
    endpoint,
    method: req.method || null,
    statusCode,
    stream: requestBody?.stream === true,
    durationMs: normalizeNumber(options.durationMs),
    requestBody,
    apiKeyId: req.apiKey?.id || null,
    accountId: relayAccountContext.accountId || null,
    accountType: relayAccountContext.accountType || null,
    model,
    completed: options.completed !== false,
    clientAborted: options.clientAborted === true,
    errorType: options.errorType || responseError.errorType || null,
    errorCode: options.errorCode || responseError.errorCode || null,
    errorMessage: options.errorMessage || responseError.errorMessage || null,
    upstreamStatus: options.upstreamStatus || responseError.upstreamStatus || 0,
    failureStage: options.failureStage || null
  }
}

function buildCostUsageFromRequestDetail(record = {}) {
  const inputTokens = normalizeTokenValue(record.inputTokens)
  const outputTokens = normalizeTokenValue(record.outputTokens)
  const cacheCreateTokens = normalizeTokenValue(record.cacheCreateTokens)
  const cacheReadTokens = normalizeTokenValue(record.cacheReadTokens)
  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreateTokens,
    cache_read_input_tokens: cacheReadTokens
  }

  const ephemeral5mTokens = normalizeTokenValue(
    record.ephemeral5mTokens ?? record.cache_creation?.ephemeral_5m_input_tokens
  )
  const ephemeral1hTokens = normalizeTokenValue(
    record.ephemeral1hTokens ?? record.cache_creation?.ephemeral_1h_input_tokens
  )

  if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
    usage.cache_creation = {
      ephemeral_5m_input_tokens: ephemeral5mTokens,
      ephemeral_1h_input_tokens: ephemeral1hTokens
    }
  }

  return usage
}

function getCostResultNumber(costResult, key, fallbackKey = null) {
  return normalizeNumber(costResult?.costs?.[key] ?? costResult?.[fallbackKey] ?? 0, 12)
}

function buildCostBreakdownFromResult(costResult) {
  const input = getCostResultNumber(costResult, 'input', 'inputCost')
  const output = getCostResultNumber(costResult, 'output', 'outputCost')
  const cacheCreate =
    getCostResultNumber(costResult, 'cacheCreate', 'cacheCreateCost') ||
    getCostResultNumber(costResult, 'cacheWrite', 'cacheCreateCost')
  const cacheRead = getCostResultNumber(costResult, 'cacheRead', 'cacheReadCost')
  const ephemeral5m = getCostResultNumber(costResult, 'ephemeral5m', 'ephemeral5mCost')
  const ephemeral1h = getCostResultNumber(costResult, 'ephemeral1h', 'ephemeral1hCost')
  const total = getCostResultNumber(costResult, 'total', 'totalCost')

  return {
    input,
    output,
    cacheCreate,
    cacheWrite: cacheCreate,
    cacheRead,
    ephemeral5m,
    ephemeral1h,
    total
  }
}

function createCostRecomputePatch(record = {}) {
  const storedCost = normalizeNumber(record.cost, 6)
  const storedRealCost = normalizeNumber(record.realCost, 6)
  if (storedCost > 0 || storedRealCost > 0) {
    return null
  }

  const usage = buildCostUsageFromRequestDetail(record)
  const totalTokens =
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens
  if (totalTokens <= 0) {
    return null
  }

  try {
    const costResult = CostCalculator.calculateCost(usage, record.model || 'unknown')
    const totalCost = normalizeNumber(costResult?.costs?.total ?? costResult?.totalCost ?? 0, 6)
    if (totalCost <= 0) {
      return null
    }

    const breakdown = buildCostBreakdownFromResult(costResult)
    const pricingSource =
      costResult?.debug?.pricingSource ||
      (costResult?.usingDynamicPricing ? 'dynamic' : 'unknown-fallback')

    return {
      cost: totalCost,
      realCost: totalCost,
      costBreakdown: breakdown,
      realCostBreakdown: breakdown,
      costRecomputed: true,
      usedFallbackPricing: costResult?.debug?.usedFallbackPricing === true,
      pricingSource
    }
  } catch (error) {
    logger.debug(`⚠️ Failed to recompute request detail cost: ${error.message}`)
    return null
  }
}

function prepareRecordForDisplay(record = {}) {
  const costPatch = createCostRecomputePatch(record)
  if (!costPatch) {
    return record
  }

  return {
    ...record,
    ...costPatch
  }
}

function formatDayKey(date) {
  return date.toISOString().slice(0, 10)
}

function listDayKeys(startDate, endDate) {
  const keys = []
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  )
  const endCursor = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  )

  while (cursor <= endCursor) {
    keys.push(`${REQUEST_DETAIL_DAY_INDEX_PREFIX}${formatDayKey(cursor)}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return keys
}

function toIsoString(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function toMillis(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

function safeJsonParse(value, label = 'request detail record') {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch (error) {
    logger.warn(`⚠️ Failed to parse ${label}: ${error.message}`)
    return null
  }
}

function makeRequestDetailId() {
  return `rd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function makeRequestDetailQuerySnapshotId() {
  return `rds_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeOptionalFilterValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function createRequestDetailDateBoundarySignature(type, rawValue, effectiveValue, boundaryValue) {
  if (!rawValue) {
    return {
      mode: 'absent',
      value: null
    }
  }

  const rawDate = rawValue instanceof Date ? rawValue : new Date(rawValue)
  const effectiveIso = toIsoString(effectiveValue)
  if (type === 'start') {
    const floorDate =
      boundaryValue instanceof Date ? boundaryValue : new Date(boundaryValue || Date.now())
    if (rawDate.getTime() <= floorDate.getTime()) {
      return {
        mode: 'retention_floor',
        value: effectiveIso
      }
    }
  }

  if (type === 'end') {
    const ceilingDate =
      boundaryValue instanceof Date ? boundaryValue : new Date(boundaryValue || Date.now())
    if (rawDate.getTime() >= ceilingDate.getTime()) {
      return {
        mode: 'now_cap',
        value: effectiveIso
      }
    }
  }

  return {
    mode: 'fixed',
    value: rawDate.toISOString()
  }
}

function normalizeRequestDetailDateBoundarySignature(boundary = {}, legacyValue = null) {
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) {
    return {
      mode: legacyValue ? 'fixed' : 'absent',
      value: toIsoString(legacyValue)
    }
  }

  const allowedModes = new Set(['absent', 'fixed', 'retention_floor', 'now_cap'])
  const mode = allowedModes.has(boundary.mode) ? boundary.mode : legacyValue ? 'fixed' : 'absent'
  return {
    mode,
    value: toIsoString(boundary.value)
  }
}

function createRequestDetailFilterSignature(
  filters = {},
  dateBoundarySignature = {},
  retentionHours = null
) {
  return {
    keyword: normalizeOptionalFilterValue(filters.keyword),
    apiKeyId: normalizeOptionalFilterValue(filters.apiKeyId),
    accountId: normalizeOptionalFilterValue(filters.accountId),
    model: normalizeOptionalFilterValue(filters.model),
    endpoint: normalizeOptionalFilterValue(filters.endpoint),
    outcome: normalizeOptionalFilterValue(filters.outcome),
    failureStage: normalizeOptionalFilterValue(filters.failureStage),
    statusClass: normalizeOptionalFilterValue(filters.statusClass),
    slaOnly: filters.slaOnly === 'true' || filters.slaOnly === true,
    sortOrder: filters.sortOrder === 'asc' ? 'asc' : 'desc',
    retentionHours:
      retentionHours !== null && retentionHours !== undefined ? Number(retentionHours) : null,
    startBoundary: normalizeRequestDetailDateBoundarySignature(dateBoundarySignature.startBoundary),
    endBoundary: normalizeRequestDetailDateBoundarySignature(dateBoundarySignature.endBoundary)
  }
}

function requestDetailDateBoundarySignaturesMatch(snapshotBoundary, currentBoundary, type) {
  if (snapshotBoundary.mode === currentBoundary.mode) {
    if (snapshotBoundary.mode === 'fixed') {
      return snapshotBoundary.value === currentBoundary.value
    }
    return true
  }

  if (type === 'end') {
    return (
      snapshotBoundary.mode === 'now_cap' &&
      currentBoundary.mode === 'fixed' &&
      snapshotBoundary.value === currentBoundary.value
    )
  }

  return false
}

function requestDetailFilterSignaturesMatch(snapshotSignature, currentSignature) {
  const normalizedSnapshot = createRequestDetailFilterSignature(
    snapshotSignature,
    {
      startBoundary: snapshotSignature?.startBoundary || {
        mode: snapshotSignature?.startDate ? 'fixed' : 'absent',
        value: snapshotSignature?.startDate || null
      },
      endBoundary: snapshotSignature?.endBoundary || {
        mode: snapshotSignature?.endDate ? 'fixed' : 'absent',
        value: snapshotSignature?.endDate || null
      }
    },
    snapshotSignature?.retentionHours
  )
  const normalizedCurrent = createRequestDetailFilterSignature(
    currentSignature,
    {
      startBoundary: currentSignature?.startBoundary,
      endBoundary: currentSignature?.endBoundary
    },
    currentSignature?.retentionHours
  )

  return (
    normalizedSnapshot.keyword === normalizedCurrent.keyword &&
    normalizedSnapshot.apiKeyId === normalizedCurrent.apiKeyId &&
    normalizedSnapshot.accountId === normalizedCurrent.accountId &&
    normalizedSnapshot.model === normalizedCurrent.model &&
    normalizedSnapshot.endpoint === normalizedCurrent.endpoint &&
    normalizedSnapshot.outcome === normalizedCurrent.outcome &&
    normalizedSnapshot.failureStage === normalizedCurrent.failureStage &&
    normalizedSnapshot.statusClass === normalizedCurrent.statusClass &&
    normalizedSnapshot.slaOnly === normalizedCurrent.slaOnly &&
    normalizedSnapshot.sortOrder === normalizedCurrent.sortOrder &&
    normalizedSnapshot.retentionHours === normalizedCurrent.retentionHours &&
    requestDetailDateBoundarySignaturesMatch(
      normalizedSnapshot.startBoundary,
      normalizedCurrent.startBoundary,
      'start'
    ) &&
    requestDetailDateBoundarySignaturesMatch(
      normalizedSnapshot.endBoundary,
      normalizedCurrent.endBoundary,
      'end'
    )
  )
}

function flattenMatchedPointers(pointers = []) {
  const flattened = []

  for (const pointer of pointers) {
    const requestId = pointer?.requestId || null
    const timestampMs = Number(pointer?.timestampMs)

    if (!requestId || !Number.isFinite(timestampMs)) {
      continue
    }

    flattened.push(requestId, timestampMs)
  }

  return flattened
}

function inflateMatchedPointers(flattened = []) {
  const pointers = []

  for (let index = 0; index < flattened.length; index += 2) {
    const requestId = flattened[index]
    const timestampMs = Number(flattened[index + 1])

    if (!requestId || !Number.isFinite(timestampMs)) {
      continue
    }

    pointers.push({ requestId, timestampMs })
  }

  return pointers
}

class RequestDetailValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RequestDetailValidationError'
    this.statusCode = 400
  }
}

function createAvailableFilterAccumulator() {
  return {
    apiKeyMap: new Map(),
    accountMap: new Map(),
    modelSet: new Set(),
    endpointSet: new Set(),
    outcomeSet: new Set(),
    failureStageSet: new Set(),
    statusClassSet: new Set(),
    earliest: null,
    latest: null
  }
}

function updateAvailableFilterAccumulator(accumulator, record) {
  if (record.apiKeyId) {
    accumulator.apiKeyMap.set(record.apiKeyId, {
      id: record.apiKeyId,
      name: record.apiKeyName || record.apiKeyId
    })
  }

  if (record.accountId) {
    accumulator.accountMap.set(record.accountId, {
      id: record.accountId,
      name: record.accountName || record.accountId,
      accountType: record.accountType || 'unknown',
      accountTypeName:
        record.accountTypeName || accountTypeNames[record.accountType] || accountTypeNames.unknown
    })
  }

  if (record.model) {
    accumulator.modelSet.add(record.model)
  }

  if (record.endpoint) {
    accumulator.endpointSet.add(record.endpoint)
  }

  if (record.outcome) {
    accumulator.outcomeSet.add(record.outcome)
  }

  if (record.failureStage) {
    accumulator.failureStageSet.add(record.failureStage)
  }

  if (record.statusClass) {
    accumulator.statusClassSet.add(record.statusClass)
  }

  const ts = toMillis(record.timestamp)
  if (ts !== null) {
    if (accumulator.earliest === null || ts < accumulator.earliest) {
      accumulator.earliest = ts
    }
    if (accumulator.latest === null || ts > accumulator.latest) {
      accumulator.latest = ts
    }
  }
}

function updateAvailableFilterAccumulatorRaw(accumulator, record) {
  if (record.apiKeyId && !accumulator.apiKeyMap.has(record.apiKeyId)) {
    accumulator.apiKeyMap.set(record.apiKeyId, {
      id: record.apiKeyId,
      name: record.apiKeyId
    })
  }

  if (record.accountId && !accumulator.accountMap.has(record.accountId)) {
    accumulator.accountMap.set(record.accountId, {
      id: record.accountId,
      name: record.accountId,
      accountType: record.accountType || 'unknown',
      accountTypeName: accountTypeNames[record.accountType] || accountTypeNames.unknown
    })
  }

  if (record.model) {
    accumulator.modelSet.add(record.model)
  }

  if (record.endpoint) {
    accumulator.endpointSet.add(record.endpoint)
  }

  const resultFields = normalizeRequestResultFields(record, record)
  if (resultFields.outcome) {
    accumulator.outcomeSet.add(resultFields.outcome)
  }

  if (resultFields.failureStage) {
    accumulator.failureStageSet.add(resultFields.failureStage)
  }

  if (resultFields.statusClass) {
    accumulator.statusClassSet.add(resultFields.statusClass)
  }

  const ts = toMillis(record.timestamp)
  if (ts !== null) {
    if (accumulator.earliest === null || ts < accumulator.earliest) {
      accumulator.earliest = ts
    }
    if (accumulator.latest === null || ts > accumulator.latest) {
      accumulator.latest = ts
    }
  }
}

function restoreRecordTimestamp(record, fallbackTimestampMs) {
  if (!record) {
    return null
  }

  if (toMillis(record.timestamp) !== null) {
    return record
  }

  const timestampMs = Number(fallbackTimestampMs)
  if (Number.isFinite(timestampMs)) {
    record.timestamp = new Date(timestampMs).toISOString()
  }

  return record
}

function finalizeAvailableFilters(accumulator) {
  return {
    apiKeys: Array.from(accumulator.apiKeyMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    accounts: Array.from(accumulator.accountMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    models: Array.from(accumulator.modelSet).sort((a, b) => a.localeCompare(b)),
    endpoints: Array.from(accumulator.endpointSet).sort((a, b) => a.localeCompare(b)),
    outcomes: Array.from(accumulator.outcomeSet)
      .map((value) => ({ value, label: OUTCOME_LABELS[value] || value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    failureStages: Array.from(accumulator.failureStageSet)
      .map((value) => ({ value, label: FAILURE_STAGE_LABELS[value] || value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    statusClasses: Array.from(accumulator.statusClassSet)
      .map((value) => ({ value, label: value.toUpperCase() }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    dateRange: {
      earliest: accumulator.earliest !== null ? new Date(accumulator.earliest).toISOString() : null,
      latest: accumulator.latest !== null ? new Date(accumulator.latest).toISOString() : null
    }
  }
}

function createSummaryAccumulator() {
  return {
    totalRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    totalCost: 0,
    totalDurationMs: 0,
    cacheHitNumerator: 0,
    cacheHitDenominator: 0,
    openAIRelatedRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    slaEligibleRequests: 0,
    slaFailureRequests: 0,
    clientErrorRequests: 0,
    serverErrorRequests: 0,
    upstreamErrorRequests: 0,
    timeoutRequests: 0,
    rateLimitedRequests: 0,
    authErrorRequests: 0,
    quotaExceededRequests: 0,
    clientAbortedRequests: 0,
    incompleteRequests: 0,
    outcomeCounts: {},
    failureStageCounts: {},
    statusClassCounts: {}
  }
}

function updateSummaryAccumulator(accumulator, record) {
  const cacheMetrics = getRequestDetailCacheMetrics(record)
  const resultFields = normalizeRequestResultFields(record, record)
  const outcome = resultFields.outcome || 'unknown'
  const failureStage = resultFields.failureStage || 'unknown'
  const statusClass = resultFields.statusClass || 'unknown'

  accumulator.totalRequests += 1
  accumulator.inputTokens += normalizeNumber(record.inputTokens)
  accumulator.outputTokens += normalizeNumber(record.outputTokens)
  accumulator.cacheReadTokens += normalizeNumber(record.cacheReadTokens)
  if (!cacheMetrics.cacheCreateNotApplicable) {
    accumulator.cacheCreateTokens += normalizeNumber(record.cacheCreateTokens)
  }
  accumulator.totalCost += normalizeNumber(record.cost)
  accumulator.totalDurationMs += normalizeNumber(record.durationMs)
  accumulator.cacheHitNumerator += cacheMetrics.numerator
  accumulator.cacheHitDenominator += cacheMetrics.denominator
  if (cacheMetrics.isOpenAIRelated) {
    accumulator.openAIRelatedRequests += 1
  }
  accumulator.outcomeCounts[outcome] = (accumulator.outcomeCounts[outcome] || 0) + 1
  accumulator.failureStageCounts[failureStage] =
    (accumulator.failureStageCounts[failureStage] || 0) + 1
  accumulator.statusClassCounts[statusClass] = (accumulator.statusClassCounts[statusClass] || 0) + 1

  if (outcome === 'success') {
    accumulator.successRequests += 1
  } else {
    accumulator.failedRequests += 1
  }

  if (statusClass === '4xx') {
    accumulator.clientErrorRequests += 1
  } else if (statusClass === '5xx') {
    accumulator.serverErrorRequests += 1
  }

  if (outcome === 'upstream_error') {
    accumulator.upstreamErrorRequests += 1
  } else if (outcome === 'timeout') {
    accumulator.timeoutRequests += 1
  } else if (outcome === 'rate_limited') {
    accumulator.rateLimitedRequests += 1
  } else if (outcome === 'auth_error') {
    accumulator.authErrorRequests += 1
  } else if (outcome === 'quota_exceeded') {
    accumulator.quotaExceededRequests += 1
  } else if (outcome === 'client_aborted') {
    accumulator.clientAbortedRequests += 1
  } else if (outcome === 'incomplete') {
    accumulator.incompleteRequests += 1
  }

  if (resultFields.isSlaEligible) {
    accumulator.slaEligibleRequests += 1
    if (resultFields.isSlaFailure) {
      accumulator.slaFailureRequests += 1
    }
  }
}

function finalizeSummary(accumulator) {
  const { totalRequests } = accumulator
  const slaSuccessRequests = Math.max(
    accumulator.slaEligibleRequests - accumulator.slaFailureRequests,
    0
  )
  return {
    totalRequests,
    inputTokens: accumulator.inputTokens,
    outputTokens: accumulator.outputTokens,
    cacheReadTokens: accumulator.cacheReadTokens,
    cacheCreateTokens: accumulator.cacheCreateTokens,
    totalCost: Number(accumulator.totalCost.toFixed(6)),
    avgDurationMs:
      accumulator.totalRequests > 0
        ? Math.round(accumulator.totalDurationMs / accumulator.totalRequests)
        : 0,
    cacheHitRate:
      accumulator.cacheHitDenominator > 0
        ? Number(
            ((accumulator.cacheHitNumerator / accumulator.cacheHitDenominator) * 100).toFixed(2)
          )
        : 0,
    cacheHitNumerator: accumulator.cacheHitNumerator,
    cacheHitDenominator: accumulator.cacheHitDenominator,
    cacheHitFormula: CACHE_HIT_FORMULA,
    cacheCreateNotApplicable:
      totalRequests > 0 && accumulator.openAIRelatedRequests === totalRequests,
    successRequests: accumulator.successRequests,
    failedRequests: accumulator.failedRequests,
    clientErrorRequests: accumulator.clientErrorRequests,
    serverErrorRequests: accumulator.serverErrorRequests,
    upstreamErrorRequests: accumulator.upstreamErrorRequests,
    timeoutRequests: accumulator.timeoutRequests,
    rateLimitedRequests: accumulator.rateLimitedRequests,
    authErrorRequests: accumulator.authErrorRequests,
    quotaExceededRequests: accumulator.quotaExceededRequests,
    clientAbortedRequests: accumulator.clientAbortedRequests,
    incompleteRequests: accumulator.incompleteRequests,
    slaEligibleRequests: accumulator.slaEligibleRequests,
    slaFailureRequests: accumulator.slaFailureRequests,
    slaSuccessRequests,
    successRate:
      totalRequests > 0
        ? Number(((accumulator.successRequests / totalRequests) * 100).toFixed(2))
        : 0,
    errorRate:
      totalRequests > 0
        ? Number(((accumulator.failedRequests / totalRequests) * 100).toFixed(2))
        : 0,
    slaSuccessRate:
      accumulator.slaEligibleRequests > 0
        ? Number(((slaSuccessRequests / accumulator.slaEligibleRequests) * 100).toFixed(2))
        : 0,
    slaFailureRate:
      accumulator.slaEligibleRequests > 0
        ? Number(
            ((accumulator.slaFailureRequests / accumulator.slaEligibleRequests) * 100).toFixed(2)
          )
        : 0,
    outcomeCounts: accumulator.outcomeCounts,
    failureStageCounts: accumulator.failureStageCounts,
    statusClassCounts: accumulator.statusClassCounts
  }
}

class RequestDetailService {
  async getSettings() {
    const config = await claudeRelayConfigService.getConfig()
    return {
      captureEnabled: config.requestDetailCaptureEnabled === true,
      retentionHours: clampRetentionHours(config.requestDetailRetentionHours),
      bodyPreviewEnabled: config.requestDetailBodyPreviewEnabled === true
    }
  }

  _emptyListResult(settings, filters = {}) {
    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      bodyPreviewEnabled: settings.bodyPreviewEnabled,
      snapshotId: null,
      records: [],
      pagination: {
        currentPage: 1,
        pageSize: Number.parseInt(filters.pageSize, 10) || 50,
        totalRecords: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      },
      filters: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        keyword: filters.keyword || null,
        apiKeyId: filters.apiKeyId || null,
        accountId: filters.accountId || null,
        model: filters.model || null,
        endpoint: filters.endpoint || null,
        outcome: filters.outcome || null,
        failureStage: filters.failureStage || null,
        statusClass: filters.statusClass || null,
        slaOnly: filters.slaOnly === 'true' || filters.slaOnly === true,
        hasCustomDateRange: Boolean(filters.startDate || filters.endDate),
        sortOrder: filters.sortOrder === 'asc' ? 'asc' : 'desc'
      },
      availableFilters: {
        apiKeys: [],
        accounts: [],
        models: [],
        endpoints: [],
        outcomes: [],
        failureStages: [],
        statusClasses: [],
        dateRange: {
          earliest: null,
          latest: null
        }
      },
      summary: {
        totalRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        totalCost: 0,
        avgDurationMs: 0,
        cacheHitRate: 0,
        cacheHitNumerator: 0,
        cacheHitDenominator: 0,
        cacheHitFormula: CACHE_HIT_FORMULA,
        cacheCreateNotApplicable: false,
        successRequests: 0,
        failedRequests: 0,
        clientErrorRequests: 0,
        serverErrorRequests: 0,
        upstreamErrorRequests: 0,
        timeoutRequests: 0,
        rateLimitedRequests: 0,
        authErrorRequests: 0,
        quotaExceededRequests: 0,
        clientAbortedRequests: 0,
        incompleteRequests: 0,
        slaEligibleRequests: 0,
        slaFailureRequests: 0,
        slaSuccessRequests: 0,
        successRate: 0,
        errorRate: 0,
        slaSuccessRate: 0,
        slaFailureRate: 0,
        outcomeCounts: {},
        failureStageCounts: {},
        statusClassCounts: {}
      }
    }
  }

  _normalizeRecord(detail, requestId, options = {}) {
    const requestBodySource = detail.requestBodySnapshot ?? detail.requestBody
    const timestamp = toIsoString(detail.timestamp) || new Date().toISOString()
    const durationMs = normalizeNumber(detail.durationMs)
    const inputTokens = normalizeNumber(detail.inputTokens)
    const outputTokens = normalizeNumber(detail.outputTokens)
    const cacheReadTokens = normalizeNumber(detail.cacheReadTokens)
    const cacheCreateTokens = normalizeNumber(detail.cacheCreateTokens)
    const totalTokens =
      normalizeNumber(detail.totalTokens) ||
      inputTokens + outputTokens + cacheReadTokens + cacheCreateTokens
    const statusCode = normalizeNumber(detail.statusCode)
    const cost = normalizeNumber(detail.cost, 6)
    const realCost = normalizeNumber(detail.realCost, 6)
    const reasoningInfo = extractRequestReasoningInfo(requestBodySource)
    const normalized = {
      requestId,
      timestamp,
      requestStartedAt: toIsoString(detail.requestStartedAt),
      endpoint: detail.endpoint || null,
      method: detail.method || null,
      statusCode,
      stream: detail.stream === true,
      apiKeyId: detail.apiKeyId || null,
      accountId: detail.accountId || null,
      accountType: detail.accountType || 'unknown',
      model: detail.model || 'unknown',
      actualModel: detail.actualModel || detail.model || 'unknown',
      requestedModel: detail.requestedModel || null,
      displayModel: detail.displayModel || detail.model || 'unknown',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      totalTokens,
      cost,
      realCost,
      costBreakdown: detail.costBreakdown || null,
      realCostBreakdown: detail.realCostBreakdown || null,
      pricingSource: detail.pricingSource || null,
      usedFallbackPricing: detail.usedFallbackPricing === true,
      costRecomputed: detail.costRecomputed === true,
      durationMs,
      isLongContextRequest: detail.isLongContextRequest === true,
      reasoningDisplay: detail.reasoningDisplay || reasoningInfo.reasoningDisplay || null,
      reasoningSource: detail.reasoningSource || reasoningInfo.reasoningSource || null
    }

    Object.assign(normalized, normalizeRequestResultFields(detail, normalized))

    if (options.bodyPreviewEnabled && requestBodySource !== undefined) {
      normalized.requestBodySnapshot = sanitizeRequestBodySnapshot(requestBodySource)
    }

    return normalized
  }

  async captureRequestDetail(detail = {}) {
    try {
      const settings = await this.getSettings()
      if (!settings.captureEnabled) {
        return { captured: false, reason: 'disabled' }
      }

      const client = redis.getClient()
      if (!client) {
        return { captured: false, reason: 'redis_unavailable' }
      }

      const requestId = detail.requestId || makeRequestDetailId()
      const incoming = this._normalizeRecord(detail, requestId, {
        bodyPreviewEnabled: settings.bodyPreviewEnabled
      })
      const itemKey = `${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`
      let existing = null
      if (typeof client.get === 'function') {
        try {
          existing = safeJsonParse(await client.get(itemKey))
        } catch (error) {
          logger.debug(`⚠️ Failed to read existing request detail before merge: ${error.message}`)
        }
      }

      const normalized = mergeRequestDetailRecords(existing, incoming)
      const timestampMs = toMillis(normalized.timestamp) || Date.now()
      const dayKey = `${REQUEST_DETAIL_DAY_INDEX_PREFIX}${formatDayKey(new Date(timestampMs))}`
      const ttlSeconds = Math.max(3600, settings.retentionHours * 3600)
      const indexTtlSeconds = ttlSeconds + 86400

      await client
        .multi()
        .set(itemKey, JSON.stringify(normalized), 'EX', ttlSeconds)
        .zadd(dayKey, timestampMs, requestId)
        .expire(dayKey, indexTtlSeconds)
        .exec()

      return { captured: true, requestId }
    } catch (error) {
      logger.warn(`⚠️ Failed to capture request detail: ${error.message}`)
      return { captured: false, reason: 'error', message: error.message }
    }
  }

  shouldCaptureLifecycleRequest(req = {}, res = {}, options = {}) {
    const endpoint = normalizeEndpointPath(req.originalUrl || req.url || req.path || '')
    if (!endpoint || endpoint === '/health') {
      return false
    }

    const statusCode = normalizeNumber(options.statusCode ?? res.statusCode)
    const isExceptional =
      options.completed === false || options.clientAborted === true || statusCode >= 400

    if (isRelayEndpoint(endpoint)) {
      return isExceptional
    }

    if (isExceptional && statusCode >= 500) {
      return true
    }

    return false
  }

  async captureLifecycleRequest(req = {}, res = {}, options = {}) {
    if (!this.shouldCaptureLifecycleRequest(req, res, options)) {
      return { captured: false, reason: 'excluded' }
    }

    const detail = buildLifecycleDetail(req, res, options)
    return this.captureRequestDetail(detail)
  }

  async _loadRequestPointersInRange(startDate, endDate) {
    const client = redis.getClient()
    if (!client) {
      return []
    }

    const startMs = startDate.getTime()
    const endMs = endDate.getTime()
    const dayKeys = listDayKeys(startDate, endDate)
    const requestIds = []

    for (const dayKey of dayKeys) {
      try {
        const entries = await client.zrangebyscore(dayKey, startMs, endMs, 'WITHSCORES')
        if (Array.isArray(entries) && entries.length > 0) {
          for (let index = 0; index < entries.length; index += 2) {
            const requestId = entries[index]
            const timestampMs = Number(entries[index + 1])
            if (requestId && Number.isFinite(timestampMs)) {
              requestIds.push({ requestId, timestampMs })
            }
          }
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to load request detail index ${dayKey}: ${error.message}`)
      }
    }

    const uniqueRequestIds = new Map()
    for (const item of requestIds) {
      uniqueRequestIds.set(item.requestId, item.timestampMs)
    }

    return Array.from(uniqueRequestIds.entries()).map(([requestId, timestampMs]) => ({
      requestId,
      timestampMs
    }))
  }

  async _scanRequestDetailItemKeys(visitor) {
    const client = redis.getClient()
    if (!client) {
      return
    }

    let cursor = '0'
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `${REQUEST_DETAIL_ITEM_PREFIX}*`,
        'COUNT',
        REQUEST_DETAIL_SCAN_BATCH_SIZE
      )
      cursor = nextCursor
      if (Array.isArray(keys) && keys.length > 0) {
        await visitor(keys, client)
      }
    } while (cursor !== '0')
  }

  async getRequestBodyPreviewStats() {
    const settings = await this.getSettings()
    let snapshotCount = 0

    await this._scanRequestDetailItemKeys(async (keys, client) => {
      const rawItems = await client.mget(keys)
      for (const rawItem of rawItems) {
        const parsed = safeJsonParse(rawItem)
        if (
          parsed &&
          Object.prototype.hasOwnProperty.call(parsed, 'requestBodySnapshot') &&
          parsed.requestBodySnapshot !== undefined
        ) {
          snapshotCount += 1
        }
      }
    })

    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      bodyPreviewEnabled: settings.bodyPreviewEnabled,
      snapshotCount,
      hasSnapshots: snapshotCount > 0
    }
  }

  async purgeRequestBodySnapshots() {
    let updatedRecords = 0

    await this._scanRequestDetailItemKeys(async (keys, client) => {
      const rawItems = await client.mget(keys)
      const pipeline = typeof client.pipeline === 'function' ? client.pipeline() : client.multi()
      let hasMutations = false

      rawItems.forEach((rawItem, index) => {
        const parsed = safeJsonParse(rawItem)
        if (
          !parsed ||
          !Object.prototype.hasOwnProperty.call(parsed, 'requestBodySnapshot') ||
          parsed.requestBodySnapshot === undefined
        ) {
          return
        }

        delete parsed.requestBodySnapshot
        pipeline.set(keys[index], JSON.stringify(parsed), 'KEEPTTL')
        hasMutations = true
        updatedRecords += 1
      })

      if (hasMutations) {
        await pipeline.exec()
      }
    })

    return {
      updatedRecords
    }
  }

  async _getApiKeyName(keyId, cache) {
    if (!keyId) {
      return null
    }

    if (cache.has(keyId)) {
      return cache.get(keyId)
    }

    try {
      const keyData = await redis.getApiKey(keyId)
      const keyName = keyData?.name || keyData?.label || keyId
      cache.set(keyId, keyName)
      return keyName
    } catch (error) {
      logger.debug(`⚠️ Failed to resolve API key ${keyId}: ${error.message}`)
      cache.set(keyId, keyId)
      return keyId
    }
  }

  async _resolveAccountInfo(accountId, accountType, cache) {
    if (!accountId) {
      return null
    }

    const normalizedType = accountType || 'unknown'
    const cacheKey = `${normalizedType}:${accountId}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }

    const preferredService = accountServices[normalizedType]
    const servicesToTry = preferredService
      ? [
          [normalizedType, preferredService],
          ...Object.entries(accountServices).filter(([type]) => type !== normalizedType)
        ]
      : Object.entries(accountServices)

    for (const [type, service] of servicesToTry) {
      try {
        let account = await service.getAccount(accountId)
        if (account && typeof account === 'object' && 'success' in account) {
          account = account.success ? account.data : null
        }
        if (account) {
          const info = {
            accountId,
            accountName: account.name || account.email || accountId,
            accountType: type,
            accountTypeName: accountTypeNames[type] || accountTypeNames.unknown
          }
          cache.set(cacheKey, info)
          return info
        }
      } catch (error) {
        logger.debug(`⚠️ Failed to resolve account ${accountId} from ${type}: ${error.message}`)
      }
    }

    const fallback = {
      accountId,
      accountName: accountId,
      accountType: normalizedType,
      accountTypeName: accountTypeNames[normalizedType] || accountTypeNames.unknown
    }
    cache.set(cacheKey, fallback)
    return fallback
  }

  async _resolveFilterDisplayNames(accumulator) {
    const apiKeyCache = new Map()
    const accountCache = new Map()

    for (const [keyId, entry] of accumulator.apiKeyMap) {
      const name = await this._getApiKeyName(keyId, apiKeyCache)
      if (name) {
        entry.name = name
      }
    }

    for (const [accountId, entry] of accumulator.accountMap) {
      const accountInfo = await this._resolveAccountInfo(accountId, entry.accountType, accountCache)
      if (accountInfo) {
        entry.name = accountInfo.accountName
        entry.accountTypeName = accountInfo.accountTypeName
      }
    }
  }

  async _findRequestTimestampInRange(requestId, startDate, endDate, client = redis.getClient()) {
    if (!requestId || !client) {
      return null
    }

    const dayKeys = listDayKeys(startDate, endDate)
    if (dayKeys.length === 0) {
      return null
    }

    const startMs = startDate.getTime()
    const endMs = endDate.getTime()

    if (typeof client.pipeline === 'function') {
      const pipeline = client.pipeline()
      dayKeys.forEach((dayKey) => {
        pipeline.zscore(dayKey, requestId)
      })

      const results = await pipeline.exec()
      if (Array.isArray(results)) {
        for (let index = 0; index < results.length; index += 1) {
          const [error, score] = results[index] || []
          if (error) {
            logger.debug(
              `⚠️ Failed to resolve request detail timestamp from ${dayKeys[index]}: ${error.message}`
            )
            continue
          }

          const timestampMs = Number(score)
          if (Number.isFinite(timestampMs) && timestampMs >= startMs && timestampMs <= endMs) {
            return timestampMs
          }
        }
      }

      return null
    }

    if (typeof client.zscore !== 'function') {
      return null
    }

    for (const dayKey of dayKeys) {
      try {
        const score = await client.zscore(dayKey, requestId)
        const timestampMs = Number(score)
        if (Number.isFinite(timestampMs) && timestampMs >= startMs && timestampMs <= endMs) {
          return timestampMs
        }
      } catch (error) {
        logger.debug(
          `⚠️ Failed to resolve request detail timestamp from ${dayKey}: ${error.message}`
        )
      }
    }

    return null
  }

  async _enrichRecords(records = [], apiKeyCache = new Map(), accountCache = new Map()) {
    const enriched = []

    for (const record of records) {
      const displayRecord = prepareRecordForDisplay(record)
      const normalizedDisplayRecord = {
        ...displayRecord,
        ...normalizeRequestResultFields(displayRecord, displayRecord)
      }
      const cacheMetrics = getRequestDetailCacheMetrics(normalizedDisplayRecord)
      const reasoningInfo = resolveRequestDetailReasoning(normalizedDisplayRecord)
      const apiKeyName = await this._getApiKeyName(normalizedDisplayRecord.apiKeyId, apiKeyCache)
      const accountInfo = await this._resolveAccountInfo(
        normalizedDisplayRecord.accountId,
        normalizedDisplayRecord.accountType,
        accountCache
      )

      enriched.push({
        ...normalizedDisplayRecord,
        apiKeyName: apiKeyName || normalizedDisplayRecord.apiKeyId || '未知 Key',
        accountName: accountInfo?.accountName || normalizedDisplayRecord.accountId || '未知账户',
        accountType: accountInfo?.accountType || normalizedDisplayRecord.accountType || 'unknown',
        accountTypeName:
          accountInfo?.accountTypeName ||
          accountTypeNames[normalizedDisplayRecord.accountType] ||
          accountTypeNames.unknown,
        isOpenAIRelated: cacheMetrics.isOpenAIRelated,
        cacheCreateNotApplicable: cacheMetrics.cacheCreateNotApplicable,
        cacheHitRate: cacheMetrics.rate,
        cacheHitNumerator: cacheMetrics.numerator,
        cacheHitDenominator: cacheMetrics.denominator,
        cacheHitFormula: cacheMetrics.cacheHitFormula,
        hasRequestBodySnapshot: Boolean(normalizedDisplayRecord.requestBodySnapshot),
        reasoningDisplay: reasoningInfo.reasoningDisplay,
        reasoningSource: reasoningInfo.reasoningSource
      })
    }

    return enriched
  }

  _matchesKeyword(record, keyword) {
    if (!keyword) {
      return true
    }

    const normalizedKeyword = String(keyword).trim().toLowerCase()
    if (!normalizedKeyword) {
      return true
    }

    const haystacks = [
      record.requestId,
      record.apiKeyId,
      record.apiKeyName,
      record.accountId,
      record.accountName,
      record.accountTypeName,
      record.model,
      record.endpoint,
      record.method,
      record.outcome,
      record.outcomeName,
      record.failureStage,
      record.failureStageName,
      record.statusClass,
      record.errorType,
      record.errorCode,
      record.errorMessage
    ]

    return haystacks.some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(normalizedKeyword)
    )
  }

  _matchesStructuredFilters(record, filters = {}) {
    if (filters.apiKeyId && record.apiKeyId !== filters.apiKeyId) {
      return false
    }
    if (filters.accountId && record.accountId !== filters.accountId) {
      return false
    }
    if (filters.model && record.model !== filters.model) {
      return false
    }
    if (filters.endpoint && record.endpoint !== filters.endpoint) {
      return false
    }
    if (filters.outcome && record.outcome !== filters.outcome) {
      return false
    }
    if (filters.failureStage && record.failureStage !== filters.failureStage) {
      return false
    }
    if (filters.statusClass && record.statusClass !== filters.statusClass) {
      return false
    }
    if ((filters.slaOnly === 'true' || filters.slaOnly === true) && record.isSlaEligible !== true) {
      return false
    }

    return true
  }

  _buildResponseFilters(filters, effectiveStart, effectiveEnd, sortOrder) {
    return {
      startDate: effectiveStart.toISOString(),
      endDate: effectiveEnd.toISOString(),
      keyword: filters.keyword || null,
      apiKeyId: filters.apiKeyId || null,
      accountId: filters.accountId || null,
      model: filters.model || null,
      endpoint: filters.endpoint || null,
      outcome: filters.outcome || null,
      failureStage: filters.failureStage || null,
      statusClass: filters.statusClass || null,
      slaOnly: filters.slaOnly === 'true' || filters.slaOnly === true,
      hasCustomDateRange: Boolean(filters.startDate || filters.endDate),
      sortOrder
    }
  }

  _hydrateRawRecord(rawItem, pointer = {}) {
    const parsed = restoreRecordTimestamp(
      safeJsonParse(rawItem),
      Number(pointer?.timestampMs) || Date.now()
    )

    if (!parsed) {
      return null
    }

    if (!parsed.requestId && pointer?.requestId) {
      parsed.requestId = pointer.requestId
    }

    return parsed
  }

  async _loadPointerBatchRecords(pointerBatch = [], client = redis.getClient()) {
    if (!client || !Array.isArray(pointerBatch) || pointerBatch.length === 0) {
      return []
    }

    const itemKeys = pointerBatch.map(
      ({ requestId }) => `${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`
    )
    const rawItems = await client.mget(itemKeys)
    const records = []

    rawItems.forEach((rawItem, index) => {
      const pointer = pointerBatch[index]
      const record = this._hydrateRawRecord(rawItem, pointer)
      if (record) {
        records.push({ record, pointer })
      }
    })

    return records
  }

  async _loadRecordsForPointers(pointers = [], client = redis.getClient()) {
    const recordItems = await this._loadPointerBatchRecords(pointers, client)
    return recordItems.map(({ record }) => record)
  }

  _paginateMatchedPointers(matchedPointers = [], requestedPage = 1, pageSize = 50) {
    const totalRecords = matchedPointers.length
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / pageSize) : 0
    const currentPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1
    const pageStart = (currentPage - 1) * pageSize
    const pageEnd = pageStart + pageSize

    return {
      currentPage,
      totalRecords,
      totalPages,
      pagePointers: matchedPointers.slice(pageStart, pageEnd)
    }
  }

  async _buildPageRecords(pagePointers = []) {
    if (!Array.isArray(pagePointers) || pagePointers.length === 0) {
      return []
    }

    const rawRecords = await this._loadRecordsForPointers(pagePointers)
    const enrichedRecords = await this._enrichRecords(rawRecords)

    return enrichedRecords.map((record) => ({
      ...record,
      requestBodySnapshot: undefined
    }))
  }

  async _buildListQueryData(filters, effectiveStart, effectiveEnd, sortOrder) {
    filters = {
      ...filters,
      apiKeyId: normalizeOptionalFilterValue(filters.apiKeyId),
      accountId: normalizeOptionalFilterValue(filters.accountId),
      model: normalizeOptionalFilterValue(filters.model),
      endpoint: normalizeOptionalFilterValue(filters.endpoint),
      outcome: normalizeOptionalFilterValue(filters.outcome),
      failureStage: normalizeOptionalFilterValue(filters.failureStage),
      statusClass: normalizeOptionalFilterValue(filters.statusClass),
      slaOnly: filters.slaOnly === 'true' || filters.slaOnly === true ? 'true' : ''
    }
    const requestPointers = await this._loadRequestPointersInRange(effectiveStart, effectiveEnd)
    if (requestPointers.length === 0) {
      return {
        hasSourceRecords: false,
        matchedPointers: [],
        availableFilters: {
          apiKeys: [],
          accounts: [],
          models: [],
          endpoints: [],
          outcomes: [],
          failureStages: [],
          statusClasses: [],
          dateRange: {
            earliest: null,
            latest: null
          }
        },
        summary: finalizeSummary(createSummaryAccumulator())
      }
    }

    requestPointers.sort((a, b) =>
      sortOrder === 'asc' ? a.timestampMs - b.timestampMs : b.timestampMs - a.timestampMs
    )

    const availableFilterAccumulator = createAvailableFilterAccumulator()
    const summaryAccumulator = createSummaryAccumulator()
    const matchedPointers = []
    const client = redis.getClient()
    const hasKeyword = Boolean(filters.keyword?.trim())

    if (hasKeyword) {
      const apiKeyCache = new Map()
      const accountCache = new Map()

      for (
        let startIndex = 0;
        startIndex < requestPointers.length;
        startIndex += REQUEST_DETAIL_QUERY_BATCH_SIZE
      ) {
        const pointerBatch = requestPointers.slice(
          startIndex,
          startIndex + REQUEST_DETAIL_QUERY_BATCH_SIZE
        )
        const recordItems = await this._loadPointerBatchRecords(pointerBatch, client)
        const enrichedBatch = await this._enrichRecords(
          recordItems.map(({ record }) => record),
          apiKeyCache,
          accountCache
        )

        enrichedBatch.forEach((record, index) => {
          updateAvailableFilterAccumulator(availableFilterAccumulator, record)

          if (
            !this._matchesStructuredFilters(record, filters) ||
            !this._matchesKeyword(record, filters.keyword)
          ) {
            return
          }

          updateSummaryAccumulator(summaryAccumulator, record)

          matchedPointers.push({
            requestId: record.requestId,
            timestampMs: toMillis(record.timestamp) ?? recordItems[index].pointer.timestampMs
          })
        })
      }
    } else {
      for (
        let startIndex = 0;
        startIndex < requestPointers.length;
        startIndex += REQUEST_DETAIL_QUERY_BATCH_SIZE
      ) {
        const pointerBatch = requestPointers.slice(
          startIndex,
          startIndex + REQUEST_DETAIL_QUERY_BATCH_SIZE
        )
        const recordItems = await this._loadPointerBatchRecords(pointerBatch, client)

        for (const { record, pointer } of recordItems) {
          updateAvailableFilterAccumulatorRaw(availableFilterAccumulator, record)

          const displayRecord = prepareRecordForDisplay(record)
          const normalizedDisplayRecord = {
            ...displayRecord,
            ...normalizeRequestResultFields(displayRecord, displayRecord)
          }
          if (!this._matchesStructuredFilters(normalizedDisplayRecord, filters)) {
            continue
          }
          updateSummaryAccumulator(summaryAccumulator, normalizedDisplayRecord)

          matchedPointers.push({
            requestId: normalizedDisplayRecord.requestId,
            timestampMs: toMillis(normalizedDisplayRecord.timestamp) ?? pointer.timestampMs
          })
        }
      }

      await this._resolveFilterDisplayNames(availableFilterAccumulator)
    }

    return {
      hasSourceRecords: true,
      matchedPointers,
      availableFilters: finalizeAvailableFilters(availableFilterAccumulator),
      summary: finalizeSummary(summaryAccumulator)
    }
  }

  async _loadQuerySnapshot(snapshotId, filterSignature, client = redis.getClient()) {
    if (!snapshotId || !client || typeof client.get !== 'function') {
      return null
    }

    let rawSnapshot
    try {
      rawSnapshot = await client.get(`${REQUEST_DETAIL_QUERY_SNAPSHOT_PREFIX}${snapshotId}`)
    } catch (error) {
      logger.warn(`⚠️ Failed to read request detail query snapshot: ${error.message}`)
      return null
    }

    const parsedSnapshot = safeJsonParse(rawSnapshot, 'request detail query snapshot')
    if (
      !parsedSnapshot ||
      !requestDetailFilterSignaturesMatch(parsedSnapshot.filterSignature, filterSignature)
    ) {
      return null
    }

    if (typeof client.expire === 'function') {
      try {
        await client.expire(
          `${REQUEST_DETAIL_QUERY_SNAPSHOT_PREFIX}${snapshotId}`,
          REQUEST_DETAIL_QUERY_SNAPSHOT_TTL_SECONDS
        )
      } catch (error) {
        logger.warn(`⚠️ Failed to renew request detail query snapshot TTL: ${error.message}`)
      }
    }

    return {
      snapshotId,
      matchedPointers: inflateMatchedPointers(parsedSnapshot.matchedPointers),
      availableFilters: parsedSnapshot.availableFilters || {
        apiKeys: [],
        accounts: [],
        models: [],
        endpoints: [],
        dateRange: {
          earliest: null,
          latest: null
        }
      },
      summary: parsedSnapshot.summary || finalizeSummary(createSummaryAccumulator()),
      filters: parsedSnapshot.filters || null
    }
  }

  async _storeQuerySnapshot(filterSignature, queryData, responseFilters, sortOrder) {
    const client = redis.getClient()
    if (!client || typeof client.set !== 'function') {
      return null
    }

    if (queryData.matchedPointers.length > MAX_REQUEST_DETAIL_SNAPSHOT_POINTERS) {
      return null
    }

    const snapshotPayload = {
      filterSignature,
      matchedPointers: flattenMatchedPointers(queryData.matchedPointers),
      summary: queryData.summary,
      availableFilters: queryData.availableFilters,
      filters: responseFilters,
      sortOrder,
      createdAt: new Date().toISOString()
    }

    const serializedSnapshot = JSON.stringify(snapshotPayload)
    if (Buffer.byteLength(serializedSnapshot, 'utf8') > MAX_REQUEST_DETAIL_SNAPSHOT_BYTES) {
      return null
    }

    const snapshotId = makeRequestDetailQuerySnapshotId()
    try {
      await client.set(
        `${REQUEST_DETAIL_QUERY_SNAPSHOT_PREFIX}${snapshotId}`,
        serializedSnapshot,
        'EX',
        REQUEST_DETAIL_QUERY_SNAPSHOT_TTL_SECONDS
      )
    } catch (error) {
      logger.warn(`⚠️ Failed to store request detail query snapshot: ${error.message}`)
      return null
    }

    return snapshotId
  }

  async _buildListResponse({
    settings,
    responseFilters,
    matchedPointers,
    availableFilters,
    summary,
    page,
    pageSize,
    snapshotId = null
  }) {
    const pagination = this._paginateMatchedPointers(matchedPointers, page, pageSize)
    const pageRecords = await this._buildPageRecords(pagination.pagePointers)

    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      bodyPreviewEnabled: settings.bodyPreviewEnabled,
      snapshotId,
      records: pageRecords,
      pagination: {
        currentPage: pagination.currentPage,
        pageSize,
        totalRecords: pagination.totalRecords,
        totalPages: pagination.totalPages,
        hasNextPage: pagination.totalPages > 0 && pagination.currentPage < pagination.totalPages,
        hasPreviousPage: pagination.totalPages > 0 && pagination.currentPage > 1
      },
      filters: responseFilters,
      availableFilters,
      summary
    }
  }

  _normalizeDateRange(filters = {}, settings = { retentionHours: DEFAULT_RETENTION_HOURS }) {
    const now = new Date()
    const retentionStart = new Date(now.getTime() - settings.retentionHours * 3600 * 1000)
    const startDate = filters.startDate ? new Date(filters.startDate) : retentionStart
    const endDate = filters.endDate ? new Date(filters.endDate) : now

    const effectiveStart = startDate < retentionStart ? retentionStart : startDate
    const effectiveEnd = endDate > now ? now : endDate

    if (Number.isNaN(effectiveStart.getTime()) || Number.isNaN(effectiveEnd.getTime())) {
      throw new RequestDetailValidationError('Invalid date range')
    }

    if (effectiveStart > effectiveEnd) {
      throw new RequestDetailValidationError('Start date must be before or equal to end date')
    }

    return {
      now,
      retentionStart,
      effectiveStart,
      effectiveEnd
    }
  }

  async listRequestDetails(filters = {}) {
    filters = {
      ...filters,
      apiKeyId: normalizeOptionalFilterValue(filters.apiKeyId),
      accountId: normalizeOptionalFilterValue(filters.accountId),
      model: normalizeOptionalFilterValue(filters.model),
      endpoint: normalizeOptionalFilterValue(filters.endpoint),
      outcome: normalizeOptionalFilterValue(filters.outcome),
      failureStage: normalizeOptionalFilterValue(filters.failureStage),
      statusClass: normalizeOptionalFilterValue(filters.statusClass),
      slaOnly: filters.slaOnly === 'true' || filters.slaOnly === true ? 'true' : ''
    }
    const settings = await this.getSettings()
    const emptyResult = this._emptyListResult(settings, filters)
    const { now, retentionStart, effectiveStart, effectiveEnd } = this._normalizeDateRange(
      filters,
      settings
    )

    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1)
    const pageSize = Math.min(Math.max(Number.parseInt(filters.pageSize, 10) || 50, 1), 200)
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc'
    const responseFilters = this._buildResponseFilters(
      filters,
      effectiveStart,
      effectiveEnd,
      sortOrder
    )
    const filterSignature = createRequestDetailFilterSignature(
      filters,
      {
        startBoundary: createRequestDetailDateBoundarySignature(
          'start',
          filters.startDate,
          effectiveStart,
          retentionStart
        ),
        endBoundary: createRequestDetailDateBoundarySignature(
          'end',
          filters.endDate,
          effectiveEnd,
          now
        )
      },
      settings.retentionHours
    )

    const snapshot = await this._loadQuerySnapshot(filters.snapshotId, filterSignature)
    if (snapshot) {
      return this._buildListResponse({
        settings,
        responseFilters: snapshot.filters || responseFilters,
        matchedPointers: snapshot.matchedPointers,
        availableFilters: snapshot.availableFilters,
        summary: snapshot.summary,
        page,
        pageSize,
        snapshotId: snapshot.snapshotId
      })
    }

    const queryData = await this._buildListQueryData(
      filters,
      effectiveStart,
      effectiveEnd,
      sortOrder
    )
    if (!queryData.hasSourceRecords) {
      return {
        ...emptyResult,
        captureEnabled: settings.captureEnabled,
        retentionHours: settings.retentionHours,
        bodyPreviewEnabled: settings.bodyPreviewEnabled,
        snapshotId: null,
        filters: responseFilters
      }
    }

    const snapshotId = await this._storeQuerySnapshot(
      filterSignature,
      queryData,
      responseFilters,
      sortOrder
    )

    return this._buildListResponse({
      settings,
      responseFilters,
      matchedPointers: queryData.matchedPointers,
      availableFilters: queryData.availableFilters,
      summary: queryData.summary,
      page,
      pageSize,
      snapshotId
    })
  }

  _createSlaAccumulator() {
    return {
      totalRequests: 0,
      slaEligibleRequests: 0,
      slaFailureRequests: 0,
      successRequests: 0,
      clientErrorRequests: 0,
      serverErrorRequests: 0,
      upstreamErrorRequests: 0,
      timeoutRequests: 0,
      rateLimitedRequests: 0,
      clientAbortedRequests: 0,
      totalDurationMs: 0,
      durations: [],
      outcomeCounts: {},
      failureStageCounts: {},
      statusClassCounts: {},
      latencyBuckets: createLatencyBuckets(),
      byEndpoint: new Map(),
      byModel: new Map(),
      byAccount: new Map(),
      byApiKey: new Map()
    }
  }

  _updateSlaGroup(map, key, label, record) {
    const safeKey = key || 'unknown'
    if (!map.has(safeKey)) {
      map.set(safeKey, {
        key: safeKey,
        label: label || safeKey,
        totalRequests: 0,
        slaEligibleRequests: 0,
        slaFailureRequests: 0,
        totalDurationMs: 0,
        durations: []
      })
    }

    const entry = map.get(safeKey)
    const durationMs = normalizeNumber(record.durationMs)
    entry.totalRequests += 1
    entry.totalDurationMs += durationMs
    if (durationMs > 0) {
      entry.durations.push(durationMs)
    }
    if (record.isSlaEligible) {
      entry.slaEligibleRequests += 1
      if (record.isSlaFailure) {
        entry.slaFailureRequests += 1
      }
    }
  }

  _updateSlaAccumulator(accumulator, record) {
    const normalized = {
      ...prepareRecordForDisplay(record),
      ...normalizeRequestResultFields(record, record)
    }
    const durationMs = normalizeNumber(normalized.durationMs)
    const outcome = normalized.outcome || 'unknown'
    const failureStage = normalized.failureStage || 'unknown'
    const statusClass = normalized.statusClass || 'unknown'

    accumulator.totalRequests += 1
    accumulator.outcomeCounts[outcome] = (accumulator.outcomeCounts[outcome] || 0) + 1
    accumulator.failureStageCounts[failureStage] =
      (accumulator.failureStageCounts[failureStage] || 0) + 1
    accumulator.statusClassCounts[statusClass] =
      (accumulator.statusClassCounts[statusClass] || 0) + 1

    if (outcome === 'success') {
      accumulator.successRequests += 1
    }
    if (statusClass === '4xx') {
      accumulator.clientErrorRequests += 1
    } else if (statusClass === '5xx') {
      accumulator.serverErrorRequests += 1
    }
    if (outcome === 'upstream_error') {
      accumulator.upstreamErrorRequests += 1
    } else if (outcome === 'timeout') {
      accumulator.timeoutRequests += 1
    } else if (outcome === 'rate_limited') {
      accumulator.rateLimitedRequests += 1
    } else if (outcome === 'client_aborted') {
      accumulator.clientAbortedRequests += 1
    }

    if (durationMs > 0) {
      accumulator.durations.push(durationMs)
      const bucket = accumulator.latencyBuckets.find(
        (item) => item.upperBoundMs === null || durationMs <= item.upperBoundMs
      )
      if (bucket) {
        bucket.count += 1
      }
    }
    accumulator.totalDurationMs += durationMs

    if (normalized.isSlaEligible) {
      accumulator.slaEligibleRequests += 1
      if (normalized.isSlaFailure) {
        accumulator.slaFailureRequests += 1
      }
    }

    this._updateSlaGroup(
      accumulator.byEndpoint,
      normalized.endpoint || 'unknown',
      normalized.endpoint || '未知接口',
      normalized
    )
    this._updateSlaGroup(
      accumulator.byModel,
      normalized.model || 'unknown',
      normalized.model || '未知模型',
      normalized
    )
    this._updateSlaGroup(
      accumulator.byAccount,
      normalized.accountId || 'unknown',
      normalized.accountName || normalized.accountId || '未知账户',
      normalized
    )
    this._updateSlaGroup(
      accumulator.byApiKey,
      normalized.apiKeyId || 'unknown',
      normalized.apiKeyName || normalized.apiKeyId || '未知 Key',
      normalized
    )
  }

  _finalizeSlaGroups(map) {
    return Array.from(map.values())
      .map((entry) => {
        entry.durations.sort((a, b) => a - b)
        const slaSuccessRequests = Math.max(entry.slaEligibleRequests - entry.slaFailureRequests, 0)
        return {
          key: entry.key,
          label: entry.label,
          totalRequests: entry.totalRequests,
          slaEligibleRequests: entry.slaEligibleRequests,
          slaFailureRequests: entry.slaFailureRequests,
          slaSuccessRate:
            entry.slaEligibleRequests > 0
              ? Number(((slaSuccessRequests / entry.slaEligibleRequests) * 100).toFixed(2))
              : 0,
          avgDurationMs:
            entry.totalRequests > 0 ? Math.round(entry.totalDurationMs / entry.totalRequests) : 0,
          p95DurationMs: percentile(entry.durations, 95)
        }
      })
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, SLA_TOP_GROUP_LIMIT)
  }

  _countMapToList(counts = {}, labels = {}) {
    return Object.entries(counts)
      .map(([value, count]) => ({
        value,
        label: labels[value] || value,
        count
      }))
      .sort((a, b) => b.count - a.count)
  }

  async getServiceQualitySummary(filters = {}) {
    filters = {
      ...filters,
      apiKeyId: normalizeOptionalFilterValue(filters.apiKeyId),
      accountId: normalizeOptionalFilterValue(filters.accountId),
      model: normalizeOptionalFilterValue(filters.model),
      endpoint: normalizeOptionalFilterValue(filters.endpoint),
      outcome: normalizeOptionalFilterValue(filters.outcome),
      failureStage: normalizeOptionalFilterValue(filters.failureStage),
      statusClass: normalizeOptionalFilterValue(filters.statusClass)
    }
    const settings = await this.getSettings()
    const { effectiveStart, effectiveEnd } = this._normalizeDateRange(filters, settings)
    const requestPointers = await this._loadRequestPointersInRange(effectiveStart, effectiveEnd)
    const accumulator = this._createSlaAccumulator()
    const availableFilterAccumulator = createAvailableFilterAccumulator()
    const client = redis.getClient()
    const apiKeyCache = new Map()
    const accountCache = new Map()

    for (
      let startIndex = 0;
      startIndex < requestPointers.length;
      startIndex += REQUEST_DETAIL_QUERY_BATCH_SIZE
    ) {
      const pointerBatch = requestPointers.slice(
        startIndex,
        startIndex + REQUEST_DETAIL_QUERY_BATCH_SIZE
      )
      const recordItems = await this._loadPointerBatchRecords(pointerBatch, client)
      const enrichedRecords = await this._enrichRecords(
        recordItems.map(({ record }) => record),
        apiKeyCache,
        accountCache
      )

      for (const record of enrichedRecords) {
        updateAvailableFilterAccumulator(availableFilterAccumulator, record)
        if (!this._matchesStructuredFilters(record, filters)) {
          continue
        }
        this._updateSlaAccumulator(accumulator, record)
      }
    }

    accumulator.durations.sort((a, b) => a - b)
    const slaSuccessRequests = Math.max(
      accumulator.slaEligibleRequests - accumulator.slaFailureRequests,
      0
    )

    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      filters: this._buildResponseFilters(filters, effectiveStart, effectiveEnd, 'desc'),
      availableFilters: finalizeAvailableFilters(availableFilterAccumulator),
      summary: {
        totalRequests: accumulator.totalRequests,
        slaEligibleRequests: accumulator.slaEligibleRequests,
        slaSuccessRequests,
        slaFailureRequests: accumulator.slaFailureRequests,
        slaSuccessRate:
          accumulator.slaEligibleRequests > 0
            ? Number(((slaSuccessRequests / accumulator.slaEligibleRequests) * 100).toFixed(2))
            : 0,
        slaFailureRate:
          accumulator.slaEligibleRequests > 0
            ? Number(
                ((accumulator.slaFailureRequests / accumulator.slaEligibleRequests) * 100).toFixed(
                  2
                )
              )
            : 0,
        successRequests: accumulator.successRequests,
        clientErrorRequests: accumulator.clientErrorRequests,
        serverErrorRequests: accumulator.serverErrorRequests,
        upstreamErrorRequests: accumulator.upstreamErrorRequests,
        timeoutRequests: accumulator.timeoutRequests,
        rateLimitedRequests: accumulator.rateLimitedRequests,
        clientAbortedRequests: accumulator.clientAbortedRequests,
        avgDurationMs:
          accumulator.totalRequests > 0
            ? Math.round(accumulator.totalDurationMs / accumulator.totalRequests)
            : 0,
        p50DurationMs: percentile(accumulator.durations, 50),
        p95DurationMs: percentile(accumulator.durations, 95),
        p99DurationMs: percentile(accumulator.durations, 99)
      },
      distributions: {
        outcomes: this._countMapToList(accumulator.outcomeCounts, OUTCOME_LABELS),
        failureStages: this._countMapToList(accumulator.failureStageCounts, FAILURE_STAGE_LABELS),
        statusClasses: this._countMapToList(accumulator.statusClassCounts),
        latencyBuckets: accumulator.latencyBuckets
      },
      topGroups: {
        endpoints: this._finalizeSlaGroups(accumulator.byEndpoint),
        models: this._finalizeSlaGroups(accumulator.byModel),
        accounts: this._finalizeSlaGroups(accumulator.byAccount),
        apiKeys: this._finalizeSlaGroups(accumulator.byApiKey)
      }
    }
  }

  async getRequestDetail(requestId) {
    const settings = await this.getSettings()
    const client = redis.getClient()
    if (!client) {
      return {
        captureEnabled: settings.captureEnabled,
        retentionHours: settings.retentionHours,
        bodyPreviewEnabled: settings.bodyPreviewEnabled,
        record: null
      }
    }

    const raw = await client.get(`${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`)
    const parsed = safeJsonParse(raw)
    if (!parsed) {
      return {
        captureEnabled: settings.captureEnabled,
        retentionHours: settings.retentionHours,
        bodyPreviewEnabled: settings.bodyPreviewEnabled,
        record: null
      }
    }

    const now = new Date()
    const retentionStart = new Date(now.getTime() - settings.retentionHours * 3600 * 1000)
    let recordMs = toMillis(parsed.timestamp)
    if (recordMs === null) {
      recordMs = await this._findRequestTimestampInRange(requestId, retentionStart, now, client)
      if (recordMs === null) {
        return {
          captureEnabled: settings.captureEnabled,
          retentionHours: settings.retentionHours,
          bodyPreviewEnabled: settings.bodyPreviewEnabled,
          record: null
        }
      }

      parsed.timestamp = new Date(recordMs).toISOString()
    }

    if (recordMs < retentionStart.getTime()) {
      return {
        captureEnabled: settings.captureEnabled,
        retentionHours: settings.retentionHours,
        bodyPreviewEnabled: settings.bodyPreviewEnabled,
        record: null
      }
    }

    const [enrichedRecord] = await this._enrichRecords([parsed])
    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      bodyPreviewEnabled: settings.bodyPreviewEnabled,
      record: enrichedRecord || null
    }
  }
}

module.exports = new RequestDetailService()
module.exports.REQUEST_DETAIL_ITEM_PREFIX = REQUEST_DETAIL_ITEM_PREFIX
module.exports.REQUEST_DETAIL_DAY_INDEX_PREFIX = REQUEST_DETAIL_DAY_INDEX_PREFIX
