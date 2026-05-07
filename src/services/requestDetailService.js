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
const {
  sanitizeRequestBodySnapshot,
  getRequestDetailCacheMetrics,
  extractRequestReasoningInfo,
  resolveRequestDetailReasoning
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
    openAIRelatedRequests: 0
  }
}

function updateSummaryAccumulator(accumulator, record) {
  const cacheMetrics = getRequestDetailCacheMetrics(record)

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
}

function finalizeSummary(accumulator) {
  return {
    totalRequests: accumulator.totalRequests,
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
    cacheCreateNotApplicable:
      accumulator.totalRequests > 0 &&
      accumulator.openAIRelatedRequests === accumulator.totalRequests
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
        hasCustomDateRange: Boolean(filters.startDate || filters.endDate),
        sortOrder: filters.sortOrder === 'asc' ? 'asc' : 'desc'
      },
      availableFilters: {
        apiKeys: [],
        accounts: [],
        models: [],
        endpoints: [],
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
        cacheCreateNotApplicable: false
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
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      totalTokens,
      cost,
      realCost,
      costBreakdown: detail.costBreakdown || null,
      realCostBreakdown: detail.realCostBreakdown || null,
      durationMs,
      isLongContextRequest: detail.isLongContextRequest === true,
      reasoningDisplay: detail.reasoningDisplay || reasoningInfo.reasoningDisplay || null,
      reasoningSource: detail.reasoningSource || reasoningInfo.reasoningSource || null
    }

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
      const normalized = this._normalizeRecord(detail, requestId, {
        bodyPreviewEnabled: settings.bodyPreviewEnabled
      })
      const timestampMs = toMillis(normalized.timestamp) || Date.now()
      const itemKey = `${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`
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
      const cacheMetrics = getRequestDetailCacheMetrics(record)
      const reasoningInfo = resolveRequestDetailReasoning(record)
      const apiKeyName = await this._getApiKeyName(record.apiKeyId, apiKeyCache)
      const accountInfo = await this._resolveAccountInfo(
        record.accountId,
        record.accountType,
        accountCache
      )

      enriched.push({
        ...record,
        apiKeyName: apiKeyName || record.apiKeyId || '未知 Key',
        accountName: accountInfo?.accountName || record.accountId || '未知账户',
        accountType: accountInfo?.accountType || record.accountType || 'unknown',
        accountTypeName:
          accountInfo?.accountTypeName ||
          accountTypeNames[record.accountType] ||
          accountTypeNames.unknown,
        isOpenAIRelated: cacheMetrics.isOpenAIRelated,
        cacheCreateNotApplicable: cacheMetrics.cacheCreateNotApplicable,
        cacheHitRate: cacheMetrics.rate,
        hasRequestBodySnapshot: Boolean(record.requestBodySnapshot),
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
      record.method
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

          if (!this._matchesStructuredFilters(record, filters)) {
            continue
          }

          updateSummaryAccumulator(summaryAccumulator, record)

          matchedPointers.push({
            requestId: record.requestId,
            timestampMs: toMillis(record.timestamp) ?? pointer.timestampMs
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

  async listRequestDetails(filters = {}) {
    filters = {
      ...filters,
      apiKeyId: normalizeOptionalFilterValue(filters.apiKeyId),
      accountId: normalizeOptionalFilterValue(filters.accountId),
      model: normalizeOptionalFilterValue(filters.model),
      endpoint: normalizeOptionalFilterValue(filters.endpoint)
    }
    const settings = await this.getSettings()
    const emptyResult = this._emptyListResult(settings, filters)

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
