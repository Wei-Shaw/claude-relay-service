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
const DEFAULT_RETENTION_HOURS = 6
const MAX_RETENTION_HOURS = 30 * 24
const REQUEST_DETAIL_QUERY_BATCH_SIZE = 200
const REQUEST_DETAIL_SCAN_BATCH_SIZE = 200

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

function safeJsonParse(value) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch (error) {
    logger.warn(`⚠️ Failed to parse request detail record: ${error.message}`)
    return null
  }
}

function makeRequestDetailId() {
  return `rd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

  async listRequestDetails(filters = {}) {
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

    const requestPointers = await this._loadRequestPointersInRange(effectiveStart, effectiveEnd)
    if (requestPointers.length === 0) {
      return {
        ...emptyResult,
        captureEnabled: settings.captureEnabled,
        retentionHours: settings.retentionHours,
        bodyPreviewEnabled: settings.bodyPreviewEnabled,
        filters: {
          ...emptyResult.filters,
          startDate: effectiveStart.toISOString(),
          endDate: effectiveEnd.toISOString(),
          hasCustomDateRange: Boolean(filters.startDate || filters.endDate)
        }
      }
    }

    requestPointers.sort((a, b) =>
      sortOrder === 'asc' ? a.timestampMs - b.timestampMs : b.timestampMs - a.timestampMs
    )

    const availableFilterAccumulator = createAvailableFilterAccumulator()
    const summaryAccumulator = createSummaryAccumulator()
    const client = redis.getClient()
    const requestedPageStart = (page - 1) * pageSize
    const requestedPageEnd = requestedPageStart + pageSize
    const pageRecords = []
    let totalRecords = 0

    const hasKeyword = Boolean(filters.keyword?.trim())

    if (hasKeyword) {
      // keyword 搜索需要 enriched 字段（apiKeyName, accountName），走全量 enrichment 路径
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
        const itemKeys = pointerBatch.map(
          ({ requestId }) => `${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`
        )
        const rawItems = await client.mget(itemKeys)
        const parsedBatch = rawItems
          .map((rawItem, index) =>
            restoreRecordTimestamp(safeJsonParse(rawItem), pointerBatch[index].timestampMs)
          )
          .filter(Boolean)

        const enrichedBatch = await this._enrichRecords(parsedBatch, apiKeyCache, accountCache)

        for (const record of enrichedBatch) {
          updateAvailableFilterAccumulator(availableFilterAccumulator, record)

          if (filters.apiKeyId && record.apiKeyId !== filters.apiKeyId) {
            continue
          }
          if (filters.accountId && record.accountId !== filters.accountId) {
            continue
          }
          if (filters.model && record.model !== filters.model) {
            continue
          }
          if (filters.endpoint && record.endpoint !== filters.endpoint) {
            continue
          }
          if (!this._matchesKeyword(record, filters.keyword)) {
            continue
          }

          updateSummaryAccumulator(summaryAccumulator, record)

          if (totalRecords >= requestedPageStart && totalRecords < requestedPageEnd) {
            pageRecords.push({
              ...record,
              requestBodySnapshot: undefined
            })
          }

          totalRecords += 1
        }
      }
    } else {
      // 无 keyword：延迟 enrichment，只对当前页记录做 enrichment
      const pageRawRecords = []

      for (
        let startIndex = 0;
        startIndex < requestPointers.length;
        startIndex += REQUEST_DETAIL_QUERY_BATCH_SIZE
      ) {
        const pointerBatch = requestPointers.slice(
          startIndex,
          startIndex + REQUEST_DETAIL_QUERY_BATCH_SIZE
        )
        const itemKeys = pointerBatch.map(
          ({ requestId }) => `${REQUEST_DETAIL_ITEM_PREFIX}${requestId}`
        )
        const rawItems = await client.mget(itemKeys)
        const parsedBatch = rawItems
          .map((rawItem, index) =>
            restoreRecordTimestamp(safeJsonParse(rawItem), pointerBatch[index].timestampMs)
          )
          .filter(Boolean)

        for (const record of parsedBatch) {
          updateAvailableFilterAccumulatorRaw(availableFilterAccumulator, record)

          if (filters.apiKeyId && record.apiKeyId !== filters.apiKeyId) {
            continue
          }
          if (filters.accountId && record.accountId !== filters.accountId) {
            continue
          }
          if (filters.model && record.model !== filters.model) {
            continue
          }
          if (filters.endpoint && record.endpoint !== filters.endpoint) {
            continue
          }

          updateSummaryAccumulator(summaryAccumulator, record)

          if (totalRecords >= requestedPageStart && totalRecords < requestedPageEnd) {
            pageRawRecords.push(record)
          }

          totalRecords += 1
        }
      }

      const enrichedPageRecords = await this._enrichRecords(pageRawRecords)
      for (const record of enrichedPageRecords) {
        pageRecords.push({
          ...record,
          requestBodySnapshot: undefined
        })
      }

      await this._resolveFilterDisplayNames(availableFilterAccumulator)
    }

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / pageSize) : 0
    if (totalPages > 0 && page > totalPages) {
      return this.listRequestDetails({
        ...filters,
        page: totalPages,
        pageSize
      })
    }

    return {
      captureEnabled: settings.captureEnabled,
      retentionHours: settings.retentionHours,
      bodyPreviewEnabled: settings.bodyPreviewEnabled,
      records: pageRecords,
      pagination: {
        currentPage: totalPages > 0 ? Math.min(page, totalPages) : 1,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPreviousPage: totalPages > 0 && page > 1
      },
      filters: {
        startDate: effectiveStart.toISOString(),
        endDate: effectiveEnd.toISOString(),
        keyword: filters.keyword || null,
        apiKeyId: filters.apiKeyId || null,
        accountId: filters.accountId || null,
        model: filters.model || null,
        endpoint: filters.endpoint || null,
        hasCustomDateRange: Boolean(filters.startDate || filters.endDate),
        sortOrder
      },
      availableFilters: finalizeAvailableFilters(availableFilterAccumulator),
      summary: finalizeSummary(summaryAccumulator)
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
